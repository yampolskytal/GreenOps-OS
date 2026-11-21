"""Forecast scenarios and a local, evidence-backed natural-language interface."""
import calendar
import re
from collections import defaultdict
from statistics import mean

from accounting import MarketSummary
from greenops import END, day, number, total



def forecast_changes(a):
    """Resolve dated capacity changes from the matching observed billing scope."""
    policy = a.policy.get("forecast", {})
    dated = list(policy.get("dated_changes", []))
    for change in policy.get("node_capacity_changes", []):
        rows = [r for r in a.lines if r["resource"] == change["resource"]
                and r["month"] == change["rate_month"] and r["unit"] == "node-hour"
                and r["category"] == "Cloud" and (r["quantity"] or 0) > 0]
        fields = {}
        refs = set()
        extra = (change["to_nodes"] - change["from_nodes"]) * 8760
        for k in ("chf", "kwh", "kg"):
            sample = [r for r in rows if r[k] is not None and (k != "chf" or r["chf"] >= 0)]
            if sample:
                observed = sum(r[k] if k == "chf" else r[k][1] for r in sample)
                fields[f"annual_delta_{k}"] = observed / sum(r["quantity"] for r in sample) * extra
                refs.update(r["ref"] for r in sample)
        if fields:
            name = f"{change['resource']} capacity grows from {change['from_nodes']} to {change['to_nodes']} nodes"
            dated.append(change | fields | {"label": name, "rate_refs": sorted(refs),
                         "method": "Additional nodes × 8,760 h × matching observed rate per node-hour. "
                                   "Assumes continuous use at the sampled rate."})
    return dated


def projections(a, plan):
    default = a.factors["growth"]["values"]
    cost_grid = a.policy.get("forecast", {})
    categories = defaultdict(list)
    for r in a.lines:
        categories[r["category"]].append(r)
    category_totals = {name: total(rows) for name, rows in categories.items()}
    dated = forecast_changes(a)
    output = []
    for year in range(1, 4):
        estimate = {k: [0.0, 0.0, 0.0] for k in ("chf", "kwh", "kg")}
        for category, b in category_totals.items():
            settings = cost_grid.get("categories", {}).get(category, {})
            growth = settings.get("growth", default)
            price = settings.get("unit_price_growth", 0)
            grid = settings.get("grid_change", 0)
            for i, rate in enumerate(growth):
                demand = (1 + rate) ** year
                estimate["chf"][i] += b["chf"] * demand * (1 + price) ** year
                estimate["kwh"][i] += b["kwh"][i] * demand
                estimate["kg"][i] += b["kg"][i] * demand * (1 + grid) ** year
        start = END.replace(year=END.year + year - 1)
        end = END.replace(year=END.year + year)
        changes = [c for c in cost_grid.get("known_changes", []) if c.get("year", 99) <= year]
        for change in changes:
            for field in estimate:
                adjustment = change.get("delta_" + field, 0)
                estimate[field] = [v + adjustment for v in estimate[field]]
        contributions = []
        for change in dated:
            d = day(change.get("effective_date"))
            if not d or not change.get("source"):
                raise ValueError("Forecast dated changes require effective_date and source.")
            if d >= end:
                continue
            share = (end - max(start, d)).days / (end - start).days
            changes.append(change | {"year_fraction": share})
            contribution = {"source": change["source"], "effective_date": change["effective_date"]}
            for field, values in estimate.items():
                amount = number(change.get("annual_delta_" + field, 0))
                if amount is None:
                    raise ValueError(f"Invalid dated forecast annual_delta_{field}.")
                estimate[field] = [max(0, value + share * amount) for value in values]
                contribution[field] = round(share * amount, 2)
            contributions.append(contribution)
        selected = plan["savings"]
        after = {k: [round(max(0, v - (plan["first_year_chf"] if k == "chf" and year == 1 else
                                          selected[k] if k == "chf" else selected[k][i])), 2)
                     for i, v in enumerate(vals)] for k, vals in estimate.items()}
        output.append({"year": year, "before": {k: [round(v, 2) for v in values] for k, values in estimate.items()},
                       "after_planned_measures": after, "known_changes": changes,
                       "dated_change_contributions": sorted(contributions, key=lambda row: -abs(row["chf"])),
                       "mid_delta_vs_flat_chf": round(estimate["chf"][1] - sum(b["chf"] for b in category_totals.values()), 2),
                       "renewal_evidence": [r for m in plan.get("savings_timing", []) for r in m["renewals"]] if year == 1 else [],
                       "chf_first_year_cash_including_implementation": [round(v + plan["spent_chf"], 2) for v in after["chf"]] if year == 1 else None,
                       "chf_annual_run_rate_savings": selected["chf"],
                       "chf_first_year_gross_savings": plan["first_year_chf"] if year == 1 else None})
    history = defaultdict(float)
    for line in a.lines:
        if line["chf"] is not None:
            history[line["month"]] += line["chf"]
    pairs = sorted(history.items())
    train, holdout = pairs[:-3], pairs[-3:]
    benchmark = mean(v for _, v in train) if train else None
    errors = []
    if benchmark is not None:
        for i, (m, y) in enumerate(holdout, len(train)):
            trailing = mean(v for _, v in pairs[max(0, i-3):i])
            errors.append({"month": m, "actual": round(y, 2), "prediction": round(benchmark, 2),
                           "absolute_error": round(abs(y - benchmark), 2), "trailing_prediction": round(trailing, 2),
                           "trailing_absolute_error": round(abs(y - trailing), 2)})
    return {"annual": output, "holdout": errors, "holdout_mae_chf": round(mean(x["absolute_error"] for x in errors), 2) if errors else None,
            "holdout_trailing_mae_chf": round(mean(x["trailing_absolute_error"] for x in errors), 2) if errors else None,
            "backtest_method": "Last three observed months, comparing a frozen earlier average with a rolling three-month average using only earlier observations.",
            "method": "Category demand, price and intensity scenarios. Documented step changes persist after their effective forecast year. Planned savings are subtracted as absolute values."}


def query(w, question, prior=None, *, scope=None):
    """Translate bounded analytical language to typed ledger operations, never code or SQL."""
    q = question.casefold().strip()
    prior = prior if isinstance(prior, dict) else {}
    if not q or len(q) > 500:
        raise ValueError("Enter a question of 1–500 characters.")
    if any(s in q for s in ("unused seat", "inactive seat", "unused ai subscription")):
        return {"answer": w.answers["unused-seats"]["title"], "result": w.answers["unused-seats"], "context": {}}
    if "gpu" in q and any(s in q for s in ("demand", "needed", "schedule", "utilization")):
        return {"answer": w.answers["gpu"]["title"], "result": w.answers["gpu"], "context": {}}
    if "production" in q and any(s in q for s in ("switch", "shutdown", "night", "weekend", "protection")):
        return {"answer": w.answers["production"]["title"], "result": w.answers["production"], "context": {}}
    for words, view, label in [
        (("forecast", "projection"), "projections", "Forecast with and without proposed measures"),
        (("recommend", "optim", "savings target", "best package"), "package", "Evidence-backed package"),
        (("reconcil", "billing discrepancy"), "reconciliation", "Reconciliation evidence"),
        (("ci waste", "nightlies", "pipeline waste", "build waste"), "ci", "CI waste by repository and runner"),
        (("clusters", "similar servers"), "clusters", "Similar server groups"),
    ]:
        if any(word in q for word in words):
            result = w.views[view] if view in w.views else w.views["diagnostics"][view]
            if isinstance(result, list):
                result = result[:30]
            return {"answer": label, "result": result, "context": {}}
    fields = {"department": "department", "tool": "tool", "category": "category", "provider": "provider",
              "region": "region", "project": "project", "resource": "resource", "month": "month"}
    metrics = [("market", "kg_market"), ("carbon", "kg"), ("co2", "kg"), ("emissions", "kg"),
               ("energy", "kwh"), ("kwh", "kwh"), ("cost", "chf"), ("chf", "chf"), ("spend", "chf")]
    followup = q.startswith(("and ", "what about", "how about", "only ", "same ", "und ", "nur "))
    metric = next((v for k, v in metrics if re.search(r"\b" + k + r"s?\b", q)), prior.get("metric") if followup else None)
    if metric not in ("kg_market", "kg", "kwh", "chf"):
        return {"answer": "Ask for cost, energy, or carbon by department, tool, provider, region, project, resource, or month. You can also ask about forecasts, reconciliations, CI waste, or a challenge question.",
                "result": None, "context": {}}
    grouping = next((col for phrase, col in fields.items()
                     if re.search(r"\b(?:by|per|which|top|highest)\s+(?:\d{1,2}\s+)?" + phrase + r"s?\b", q)),
                    prior.get("grouping") if followup else None)
    grouping = grouping if isinstance(grouping, str) and grouping in fields else None
    rows = w.a.lines
    filters = {}
    for field in fields:
        options = sorted({str(r.get(field) or "") for r in rows}, key=len, reverse=True)
        matches = [option for option in options if len(option) >= 3 and re.search(r"(?<![\w-])" + re.escape(option.casefold()) + r"(?![\w-])", q)]
        if field == "month":
            matches += [option for option in options if re.fullmatch(r"\d{4}-\d{2}", option)
                        and re.search(r"\b" + calendar.month_name[int(option[5:])].casefold() +
                                      r"(?:\s+(" + option[:4] + r")\b|(?!\s+20\d{2})\b)", q)]
        if not matches and followup:
            previous = prior.get("filters", {})
            received = previous.get(field, []) if isinstance(previous, dict) else []
            matches = [v for v in received if isinstance(v, str) and v in options] if isinstance(received,list) else []
        if matches:
            filters[field] = list(dict.fromkeys(matches))
    if scope:
        if "month" not in filters:
            rows = [r for r in rows if scope["from"] <= r["month"] <= scope["to"]]
        for field in ("department", "provider"):
            if field not in filters and scope[field] != "all":
                filters[field] = [scope[field]]
    if filters:
        rows = [r for r in rows if all(r.get(f) in values for f, values in filters.items())]
    groups = defaultdict(list)
    for row in rows:
        groups[str(row.get(grouping) or "Unallocated") if grouping else "Total"].append(row)
    def amount(group):
        observed = [r[metric] for r in group if r.get(metric) is not None]
        value = (round(sum(observed), 2) if metric == "chf" and observed else
                 [round(sum(v[i] for v in observed), 4) for i in range(3)]) if observed else None
        coverage = {"coverage_pct": MarketSummary(group).coverage()["coveragePct"]} if metric == "kg_market" else {}
        return {"value": value, "observed_lines": len(observed), "missing_lines": len(group) - len(observed), **coverage,
                "source_files": sorted({r["ref"].split(":")[0] for r in group}),
                "reference_sample": list(dict.fromkeys(r["ref"] for r in group))[:8]}
    result = [{"group": k, **amount(group)} for k, group in groups.items()]
    def rank(r):
        v = r["value"]
        return v[1] if isinstance(v, list) else v if v is not None else float("-inf")
    result.sort(key=lambda r: (-rank(r), r["group"]))
    top = re.search(r"\btop\s+(\d{1,2})\b", q)
    limit = min(50, max(1, int(top[1]))) if top else 15
    units = {"chf":"CHF", "kg":"location-based kg CO₂e", "kg_market":"market-based kg CO₂e (covered activity only)", "kwh":"kWh"}
    return {"answer": f"{units[metric]} from {len(rows):,} matching ledger lines." +
                      (" Estimates show low, midpoint and high." if metric != "chf" else ""),
            "result": result[:limit], "context": {"metric": metric, "grouping": grouping, "filters": filters}}
