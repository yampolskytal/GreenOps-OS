"""Evidence packages for investment, reconciliation and coverage decisions."""
from collections import defaultdict
from copy import copy, deepcopy
from itertools import chain, combinations, islice

from greenops import total


def combine_production(autoscale, rate, annual_quote, hypothetical=False):
    """Apply a scope-matched variable-rate quote after the modeled utilization cut."""
    baseline = rate["baseline"]["chf"]
    remaining = max(0, baseline - autoscale["chf"])
    projected = remaining * annual_quote / baseline
    annual = round(baseline - projected, 2)
    return autoscale | {
        "id": "Autoscale and reprice production compute:dp-prod",
        "name": "Autoscale and reprice production compute",
        "change": "Preserve production availability and apply the new variable rate after tested capacity reductions.",
        "chf": annual,
        "days": autoscale["days"] + rate["days"],
        "implementation_chf": autoscale["implementation_chf"] + rate["implementation_chf"],
        "baseline": rate["baseline"], "scopes": ["dp-prod"],
        "quote_status": "hypothetical" if hypothetical else "dated variable-rate quote supplied",
        "requires_approval": True,
        "blockers": list(dict.fromkeys([*autoscale["blockers"], *rate["blockers"]])),
        "hard_blockers": list(dict.fromkeys([*autoscale.get("hard_blockers", []), *rate.get("hard_blockers", [])])),
        "evidence": list(dict.fromkeys([*autoscale["evidence"], *rate["evidence"]])),
        "calculation_inputs": {"observed_scope_chf": baseline, "autoscaling_chf": autoscale["chf"],
                               "comparable_full_volume_quote_chf": annual_quote, "projected_chf": round(projected, 2)},
        "method": "Observed bill − observed remaining bill after autoscaling × quoted full-volume bill ÷ observed bill. Assumes variable proportional pricing and no minimum commitment. Carbon savings come only from autoscaling.",
    }


def investment_options(reports, plan):
    selected = plan["selected"]
    options = []
    for m in reports.measures:
        if not m.get("quote_status"):
            continue
        scope = set(m.get("scopes") or [m["resource"]])
        groups = m.get("exclusive")
        remaining = [r for r in selected if r["id"] != m["id"]]
        mandatory = [r for r in remaining if scope.intersection(r.get("scopes") or [r["resource"]])
                     or (groups and groups == r.get("exclusive"))]
        optional = [r for r in remaining if r not in mandatory]
        feasible = []
        combinations_by_size = chain.from_iterable(combinations(optional, n) for n in range(len(optional) + 1))
        for drop in islice(combinations_by_size, 10000):
            remove = mandatory + list(drop)
            kept = [r for r in remaining if r not in remove]
            if (sum(r["days"] for r in kept) + m["days"] > plan["day_limit"]
                    or sum(r["implementation_chf"] for r in kept) + m["implementation_chf"] > plan["budget_chf"]):
                continue
            result = total(kept)
            needed = max(0, reports.a.baseline["chf"] * .25 - result["chf"])
            carbon_gap = max(0, reports.a.baseline["kg"][1] * .40 - result["kg"][1] - m["kg"][1])
            feasible.append((bool(carbon_gap), carbon_gap, needed, [r["id"] for r in remove]))
        replacement = None
        if feasible:
            _, carbon_gap, needed, removed = min(feasible)
            baseline_chf = m["baseline"]["chf"]
            ceiling = baseline_chf - needed
            inputs = m.get("calculation_inputs", {})
            if "comparable_full_volume_quote_chf" in inputs:
                remaining = max(0, baseline_chf - inputs["autoscaling_chf"])
                ceiling = ceiling * baseline_chf / remaining if remaining else None
            replacement = {"replaces": removed, "required_candidate_savings_chf": round(needed, 2),
                           "maximum_annual_quote_chf": round(ceiling, 2) if ceiling is not None else None,
                           "carbon_gap_kg_after_replacement": round(carbon_gap, 4),
                           "can_close_both_with_nonnegative_quote": not carbon_gap and needed <= m["baseline"]["chf"]}
        options.append({"id": m["id"], "scope": sorted(scope), "annual_billed_chf": m["baseline"]["chf"],
                        "annual_savings_chf": m["chf"] if m["quote_status"] != "quote required" else None,
                        "days": m["days"], "implementation_chf": m["implementation_chf"],
                        "status": m["quote_status"], "approver": m["approval"], "owner_checks": m["blockers"],
                        "protections": m["protection"], "replacement_test": replacement,
                        "replacement_search_complete": len(optional) <= 13,
                        "source_refs": m["evidence"]})
    return options


def gap_priorities(lines, plan):
    scopes = defaultdict(list)
    for m in plan["selected"]:
        for scope in m.get("scopes") or [m["resource"]]:
            scopes[scope].append(m["id"])
    gaps = defaultdict(lambda: {"missing_cost": 0, "missing_energy": 0, "known_chf_without_energy": 0.0, "refs": []})
    for line in lines:
        if line["chf"] is not None and line["kwh"] is not None:
            continue
        group = gaps[line["resource"], line["unit"], line["region"]]
        group["missing_cost"] += line["chf"] is None
        if line["kwh"] is None:
            group["missing_energy"] += 1
            group["known_chf_without_energy"] += abs(line["chf"] or 0)
        if len(group["refs"]) < 8 and line["ref"] not in group["refs"]:
            group["refs"].append(line["ref"])
    rows = [{"scope": rid, "unit": unit, "region": region, "affected_selected_measures": scopes[rid], **item,
             "known_chf_without_energy": round(item["known_chf_without_energy"], 2)}
            for (rid, unit, region), item in gaps.items()]
    return sorted(rows, key=lambda row: (not row["affected_selected_measures"], -row["known_chf_without_energy"],
                                         -row["missing_cost"], row["scope"]))


def attribution_checks(reports):
    result = []
    for m in reports.measures:
        if m.get("meter_scope") == "inferred" and m.get("members"):
            result.append({"id": f"Meter scope|{m['resource']}", "type": "Meter scope", "scope": m["resource"],
                           "owner": "Head of IT and Finance", "count": len(m["members"]), "absolute_chf_delta": 0,
                           "refs": m["evidence"][:8], "members": m["members"],
                           "recommendation": "Pool attribution is inferred from monitoring, not individually cross-referenced billing. Provide a dated member mapping."})
    orphan = next((m for m in reports.measures if m["resource"] == "orphan-vms"), None)
    if orphan:
        for rid in orphan["members"]:
            billed = [line for line in reports.by_resource[rid] if line["category"] == "Cloud" and line["chf"] is not None]
            if not billed:
                result.append({"id": f"Missing attributable bill|{rid}", "type": "Missing attributable bill",
                               "scope": rid, "owner": "Head of Finance and resource owner", "count": 1,
                               "absolute_chf_delta": 0, "refs": [reports.a.inventory[rid]["ref"]],
                               "recommendation": "Individual spend is unverified. Keep CHF savings at zero until billing identity is reconciled."})
    return result


def savings_timing(plan):
    rows = []
    for m in plan["selected"]:
        parts = m.get("components") or []
        renewals = [{"scope": part["resource"], "effective_date": part["effective_date"],
                     "annual_chf": part["chf"],
                     "first_year_chf": round(part["chf"] * part.get("first_year_fraction", 1), 2)}
                    for part in parts if part.get("effective_date")]
        rows.append({"id": m["id"], "phase": m["phase"], "effective_date": m.get("effective_date"),
                     "annual_chf": m["chf"], "first_year_gross_chf": m["first_year_chf"],
                     "first_year_net_chf": m["first_year_net_chf"], "renewals": renewals,
                     "timing_basis": "Dated renewal schedule" if renewals or m.get("effective_date") else
                                     "Scenario timing. No rollout date has been attested."})
    return rows


def swiss_sensitivity(work):
    from analytics import Reports

    base = work.a
    swiss = base.factors["grid"]["ch"]
    selected = {m["id"] for m in work.plan["selected"]}
    output = []
    for label, factor in zip(("low", "mid", "high"), swiss["values"]):
        variant = copy(base)
        variant.events = list(base.events)
        variant.factors = deepcopy(base.factors)
        variant.factors["grid"]["ch"]["values"] = [factor] * 3
        variant.lines = [r | {"kg": [v * factor for v in r["kwh"]]} if r["region"] == "ch" and r["kwh"] is not None else r
                         for r in base.lines]
        variant.baseline = total(variant.lines)
        measures = work.reports.measures if label == "mid" else Reports(variant).measures
        fixed = [m for m in measures if m["id"] in selected]
        kg_base, kg_cut = variant.baseline["kg"][1], total(fixed)["kg"][1]
        output.append({"case": label, "swiss_consumption_kg_per_kwh": factor, "source": swiss["source"],
                       "baseline_kg": kg_base, "package_savings_kg": kg_cut,
                       "carbon_fraction": kg_cut / kg_base if kg_base else None,
                       "missing_selected_ids": sorted(selected - {m["id"] for m in fixed})})
    return {"run_id": work.run_id, "scenarios": output,
            "method": "Keep the selected measure IDs fixed and vary only the Swiss consumption-mix factor on both the ledger baseline and the modeled measures, including relocated load."}
