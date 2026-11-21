"""Coverage, monthly shared-cost attribution, supplier factors and invoice checks."""
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP
from datetime import timedelta

from greenops import START, END, day, inside, key, month, natural, number, project_id


def coverage(a):
    dates = START
    months = set()
    while dates < END:
        months.add(month(dates))
        dates += timedelta(days=1)
    result = []
    for source, meta in a.sources.items():
        valid = defaultdict(int)
        fields = ("Date", "date", "month", "week_start", "line_item_usage_start_date", "time_utc", "start", "started_at")
        for row in a.data[source]:
            dt = next((row.get(f) for f in fields if row.get(f)), None)
            if inside(dt):
                valid[month(dt)] += 1
        result.append({"file": meta["file"], "rows_by_baseline_month": dict(sorted(valid.items())),
                       "months_without_observations": sorted(months - set(valid)) if valid else None,
                       "schema": meta.get("schema"), "count": len(a.data[source])})
    resources = defaultdict(lambda: defaultdict(int))
    for row in a.lines:
        if row["resource"]:
            resources[row["resource"]][row["month"]] += 1
    return {"sources": result, "resource_month_line_counts": {k: dict(v) for k, v in sorted(resources.items())},
            "method": "Expected monthly presence across the baseline where dated observations exist. Snapshot sources and legitimate zero use require interpretation."}


def allocate(a):
    fte, hours = defaultdict(lambda: defaultdict(float)), defaultdict(lambda: defaultdict(float))
    projects = {project_id(row["project_id"]): row for row in a.data["projects"]}
    for row in a.data["headcount"]:
        weight = natural(row.get("fte"))
        if weight:
            dep = row["department"] if key(row["department"]) != "people" else "HR"
            fte[month(row["month"])][dep] += weight
    for row in a.data["project_hours_monthly"]:
        h = natural(row.get("hours"))
        if h and row.get("department"):
            prj = project_id(row["project_id"])
            p = projects.get(prj, {})
            d = day(row["month"])
            if d and (not day(p.get("end")) or d <= day(p["end"])):
                hours[month(row["month"]), prj][row["department"]] += h
    amounts, methods, recharge = defaultdict(Decimal), defaultdict(Decimal), defaultdict(Decimal)
    raw = Decimal(0)
    allocation_rule = a.policy.get("shared_allocation", "project_hours_then_fte")
    for row in a.lines:
        if row["chf"] is None:
            continue
        amount = Decimal(str(row["chf"]))
        raw += amount
        dep, prj, period = row["department"], row["project"], row["month"]
        if key(dep) == "overhead" and allocation_rule != "original":
            weight = hours.get((period, prj)) if allocation_rule == "project_hours_then_fte" and prj else None
            rule = "project hours" if weight else "FTE"
            weight = weight or fte.get(period)
        else:
            weight, rule = None, "direct or retained"
        if weight:
            denom = Decimal(str(sum(weight.values())))
            leftover = amount
            entries = sorted(weight.items())
            for i, (division, qty) in enumerate(entries):
                portion = amount * Decimal(str(qty)) / denom if i + 1 < len(entries) else leftover
                amounts[division] += portion
                leftover -= portion
        else:
            amounts[dep] += amount
            rule = "direct or retained"
        methods[rule] += amount
        eligibility = key(projects.get(prj, {}).get("rechargeable"))
        if eligibility in ("yes", "partly"):
            pct = a.policy.get("recharge_rates", {}).get(prj, 1 if eligibility == "yes" else None)
            if isinstance(pct, (int, float)) and 0 <= pct <= 1:
                recharge[prj] += amount * Decimal(str(pct))
    def rounded(v):
        return float(v.quantize(Decimal(".01"), rounding=ROUND_HALF_UP))
    assigned = {k: rounded(v) for k, v in sorted(amounts.items())}
    return {"department_chf": assigned, "by_method_chf": {k: rounded(v) for k, v in methods.items()},
            "source_total_chf": rounded(raw), "display_rounding_chf": round(rounded(raw) - sum(assigned.values()), 2),
            "recharge_scenario_chf": {k: rounded(v) for k, v in recharge.items()},
            "method": "Overhead follows matching monthly project-hours weights, then FTE unless configured otherwise. Recharge percentages apply only to documented eligible projects and are estimates."}


def market_factor(a, line):
    factors = a.factors.get("market_grid", {})
    d = day(line["day"])
    supplier = line.get("provider", "")
    configured = a.policy.get("supplier_instruments", [])
    instruments = [p for p in configured
                   if key(p.get("provider")) == key(supplier)
                   and p.get("region") == line["region"]
                   and day(p.get("from")) and day(p.get("through"))
                   and day(p["from"]) <= d <= day(p["through"])]
    dated = next((r for r in a.factors.get("market_grid_periods", {}).get(line["region"], [])
                  if day(r["from"]) <= d <= day(r["through"])), None)
    fallback = dated or factors.get(line["region"])
    if len(instruments) == 1:
        row = instruments[0]
        fraction = natural(row.get("coverage"))
        value = natural(row.get("kg_per_kwh"))
        if (row.get("source") and row.get("instrument_id") and
                sum(p.get("instrument_id") == row["instrument_id"] for p in configured) == 1
                and row.get("exclusive_attestation") is True and fraction is not None and fraction <= 1 and value is not None):
            if fraction == 1 or fallback:
                residual = fallback["values"] if fallback else [0, 0, 0]
                return ([fraction * value + (1 - fraction) * x for x in residual],
                        row["source"], True)
    return (fallback["values"], fallback["source"], False) if fallback else (None, None, False)


def check_market(a):
    for row in a.lines:
        values, source, verified = market_factor(a, row)
        row["kg_market"] = [x * y for x, y in zip(row["kwh"], values)] if row["kwh"] is not None and values else None
        row["market_source"] = source
        row["market_instrument_attested"] = verified


def market_breakdown(a):
    groups = defaultdict(lambda: {"modeled_kwh": 0.0, "covered_kwh": 0.0, "covered_kg": 0.0, "uncovered_kwh": 0.0})
    for line in a.lines:
        if line["kwh"] is None:
            continue
        identity = (line["region"], line["month"], line.get("market_source") or "Uncovered",
                    bool(line.get("market_instrument_attested")))
        b = groups[identity]
        b["modeled_kwh"] += line["kwh"][1]
        if line.get("kg_market") is None:
            b["uncovered_kwh"] += line["kwh"][1]
        else:
            b["covered_kwh"] += line["kwh"][1]
            b["covered_kg"] += line["kg_market"][1]
    return {"rows": [{"region": r, "month": m, "source": s, "supplier_attested": v,
                      **{k: round(value, 4) for k, value in values.items()}} for (r, m, s, v), values in sorted(groups.items())],
            "method": "Market values are partial. Date-specific factors take priority. An electricity supplier disclosure is required for uncovered Swiss site consumption because AIB publishes no Swiss residual mix."}


def ai_price_reconciliation(a):
    tariff = a.policy.get("ai_prices", [])
    totals = defaultdict(lambda: {"estimated_chf": 0, "gateway_chf": 0, "priced_rows": 0, "unpriced_rows": 0, "price_sources": set()})
    for r in a.data["ai_usage"]:
        d = day(r.get("date"))
        if not d or not inside(d):
            continue
        ident = (month(d), key(r.get("provider")), key(r.get("model")))
        b = totals[ident]
        inp, cached, out = (natural(r.get(k)) for k in ("tokens_in", "tokens_in_cache", "tokens_out"))
        matches = [p for p in tariff if key(p.get("provider")) == ident[1] and key(p.get("model")) == ident[2]
                   and day(p.get("from")) and day(p.get("through")) and day(p["from"]) <= d <= day(p["through"])]
        gateway = number(r.get("cost_chf"))
        if len(matches) != 1 or None in (inp, cached, out, gateway) or cached > inp:
            b["unpriced_rows"] += 1
            continue
        p = matches[0]
        rates = [natural(p.get(k)) for k in ("input_per_million", "cache_per_million", "output_per_million")]
        if None in rates or not p.get("source"):
            b["unpriced_rows"] += 1
            continue
        cost = ((inp - cached) * rates[0] + cached * rates[1] + out * rates[2]) / 1_000_000
        chf = a.chf(cost, p.get("currency"), ident[0], r["ref"])
        if chf is None:
            b["unpriced_rows"] += 1
            continue
        b["estimated_chf"] += chf
        b["gateway_chf"] += gateway
        b["priced_rows"] += 1
        b["price_sources"].add(p["source"])
    return [{"month": m, "provider": p, "model": model, **r,
             "estimated_chf": round(r["estimated_chf"], 2) if r["priced_rows"] else None,
             "gateway_chf": round(r["gateway_chf"], 2) if r["priced_rows"] else None,
             "delta_chf": round(r["estimated_chf"] - r["gateway_chf"], 2) if r["priced_rows"] else None,
             "price_sources": sorted(r["price_sources"])}
            for (m, p, model), r in sorted(totals.items())]


def embodied_inventory(a):
    """Separate lifecycle allocation where the operator has hardware evidence."""
    accepted, rejected = [], []
    seen = set()
    for r in a.policy.get("embodied_inventory", []):
        identity = r.get("inventory_id")
        start, stop = day(r.get("deployed")), day(r.get("retired"))
        lifecycle = r.get("lifecycle_kg", [])
        years, share = natural(r.get("service_years")), natural(r.get("allocated_fraction"))
        values = [natural(x) for x in lifecycle] if isinstance(lifecycle, list) else []
        if (not identity or identity in seen or not start or (stop and stop <= start) or not years
                or share is None or share > 1 or len(values) != 3 or None in values
                or values != sorted(values) or not r.get("source")):
            rejected.append(identity)
            continue
        seen.add(identity)
        duration = min(max(0, (min(END, stop or END) - max(START, start)).days) / 365.25, years)
        accepted.append({"id": identity, "resource": r.get("resource"), "source": r["source"],
                         "allocated_kg": [round(v * duration * share / years, 5) for v in values]})
    return {"items": accepted, "rejected": rejected,
            "allocated_kg": [round(sum(r["allocated_kg"][i] for r in accepted), 5) for i in range(3)] if accepted else None,
            "method": "Lifecycle manufacturing emissions prorated over service life, occupied baseline days and workload allocation. Kept separate from operational location and market totals."}
