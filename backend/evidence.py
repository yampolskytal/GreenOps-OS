"""Explain modeled figures and compare source observations."""
from collections import Counter, defaultdict
from datetime import timedelta

from greenops import BILL, day, project_id, key, natural, obj


def figure(value, unit, formula, inputs, sources, low=None, high=None):
    return {"value": value, "low": value if low is None else low, "high": value if high is None else high,
            "unit": unit, "formula": formula, "inputs": inputs, "sources": sources}


def totals_explained(b, sources):
    return {
        "cost": figure(b["chf"], "CHF/year", "Sum of observed billed amounts × monthly FX, including signed credits.",
                       {"ledger_lines": b["lines"], "missing_cost_lines": b["missing_cost"]}, sources),
        "energy": figure(b["kwh"][1], "kWh/year", "Sum of metered activity × energy intensity × applicable PUE.",
                         {"missing_energy_lines": b["missing_energy"]}, [*sources, "factors.json"], b["kwh"][0], b["kwh"][2]),
        "carbon": figure(b["kg"][1], "kg CO2e/year", "Sum of facility energy × location-based kg CO2e/kWh for each line.",
                         {"missing_carbon_lines": b["missing_carbon"]}, [*sources, "factors.json"], b["kg"][0], b["kg"][2]),
        "energy_coverage": figure(round(100 * (b["lines"] - b["missing_energy"]) / b["lines"], 2) if b["lines"] else None,
                                  "% of lines", "100 × (ledger lines − missing energy lines) ÷ ledger lines.",
                                  {"lines": b["lines"], "missing_energy": b["missing_energy"]}, sources),
    }


def explain(m, decision=None):
    inputs = {"baseline": m["baseline"], "cost_fraction": m["cost_fraction"], "energy_fraction": m["energy_fraction"]}
    if m.get("components"):
        inputs = {"components": [{"id": c["id"], "chf": c["chf"], "kwh": c["kwh"], "kg": c["kg"]} for c in m["components"]]}
    inputs.update(m.get("calculation_inputs", {}))
    refs = m["evidence"]
    return {"id": m["id"], "status": m["status"], "approver": m["approval"], "protections": m["protection"],
            **({"decision": decision} if decision is not None else {}),
            "limitations": m["blockers"], "location_method": m["method"],
            "figures": {"annual_cost_savings": figure(m["chf"], "CHF/year", m["method"], inputs, refs),
                        "energy_savings": figure(m["kwh"][1], "kWh/year", m["method"], inputs, refs + ["factors.json"], m["kwh"][0], m["kwh"][2]),
                        "carbon_savings": figure(m["kg"][1], "kg CO2e/year", m["method"], inputs, refs + ["factors.json"], m["kg"][0], m["kg"][2]),
                        "effort": figure(m["days"], "person-days", "Engineering estimate for coordinated implementation.", {}, ["challenge-policy.json"]),
                        "implementation_cost": figure(m["implementation_chf"], "CHF", "Person-days × CHF 1,100 plus declared migration costs.",
                                                      {"days": m["days"], "daily_chf": 1100}, ["challenge specification", "challenge-policy.json"])}}


def contradictions(r):
    a = r.a
    findings = list(r.reconciliation)
    audited = {"contract_version", "exact_duplicate", "conflicting_key", "allocation_conflict", "missing_contract_key",
               "resource_identity_collision", "contract_amount_mismatch", "token_conflict"}
    for event in a.events:
        if event["code"] in audited:
            findings.append({"type": event["code"], "ref": event["ref"], "decision": event["detail"]})
    recent_end = a.as_of + timedelta(days=1)
    recent_start = recent_end - timedelta(days=30)
    billed = defaultdict(list)
    for source in ("azure_costs", "aws_costs"):
        date_col, id_col, _, qty_col, unit_col, *_ = BILL[source]
        for row in a.data[source]:
            d = day(row.get(date_col))
            unit = key(row.get(unit_col))
            if d and recent_start <= d < recent_end and unit in ("vcpu-hour", "vcore-hour", "gpu-hour"):
                if key(row.get("ChargeType") or row.get("line_item_line_item_type")) not in ("credit", "refund"):
                    billed[a.rid(row.get(id_col), source)].append({"day": d, "unit": unit,
                                                                  "quantity": natural(row.get(qty_col)), "ref": row["ref"]})
    monitoring = defaultdict(list)
    for row in a.data["server_metrics_weekly"]:
        monitoring[a.rid(row.get("server_id"))].append(row)
    inventory = a.inventory
    for rid, inv in inventory.items():
        if not inv.get("owner_cost_center"):
            findings.append({"type": "Missing owner cost centre", "resource": rid, "ref": inv["ref"],
                             "decision": "Keep ownership unconfirmed and route any change to the Head of IT."})
        if not inv.get("provider"):
            continue
        ws, hours, covered = [], 0, set()
        for row in monitoring[rid]:
            start = day(row["week_start"])
            uptime = natural(row.get("uptime_h"))
            if not start or uptime is None or uptime > 168 or start >= recent_end or start + timedelta(days=7) <= recent_start:
                continue
            overlap = {start + timedelta(days=i) for i in range(7) if recent_start <= start + timedelta(days=i) < recent_end}
            covered.update(overlap)
            hours += uptime / 7 * len(overlap)
            ws.append(row["ref"])
        snapshot = natural(inv.get("runtime_h_30d"))
        invoice = billed[rid]
        valid = [x for x in invoice if x["quantity"] is not None and x["unit"] in ("vcpu-hour", "vcore-hour", "gpu-hour")]
        c = natural(inv.get("vcpu"))
        qty = sum(x["quantity"] / (1 if x["unit"] == "gpu-hour" else c) for x in valid) if valid and c else None
        days_invoiced = {day(x["day"]) for x in valid}
        comparable_bill = qty is not None and len(valid) == len(invoice) and days_invoiced == covered and bool(covered)
        comparable_inventory = snapshot is not None and len(covered) == 30
        if ((comparable_inventory and abs(hours - snapshot) > 12)
                or (comparable_bill and abs(qty - hours) > 12)
                or (snapshot is not None and not comparable_inventory)
                or (invoice and not comparable_bill)):
            findings.append({"type": "Runtime contradiction" if ((comparable_inventory and abs(hours - snapshot) > 12) or
                             (comparable_bill and abs(qty - hours) > 12)) else "Runtime coverage mismatch",
                             "resource": rid, "inventory_hours": snapshot, "monitoring_hours": round(hours, 2) if ws else None,
                             "monitoring_days": len(covered), "invoice_hours": round(qty, 2) if qty is not None else None,
                             "invoice_days": len(days_invoiced), "refs": [inv["ref"], *ws, *(x["ref"] for x in valid)],
                             "decision": "Use billed units for cost; monitoring corroborates operational runtime. Compare only aligned periods. No individual invoice match means unknown cost."})
    variants = defaultdict(lambda: defaultdict(list))
    for source, rows in a.data.items():
        for row in rows:
            values = [row.get(f) for f in ("project_id", "default_project", "ProjectNumber", "resource_tags_user_project")]
            values.append(obj(row.get("Tags")).get("project"))
            for raw in values:
                if isinstance(raw, str) and raw:
                    refs = variants[project_id(raw)][raw]
                    if len(refs) < 4:
                        refs.append(row["ref"])
    for canonical, examples in variants.items():
        if len(examples) > 1 or any(s != canonical for s in examples):
            findings.append({"type": "Project ID alias", "canonical": canonical, "variants": dict(examples),
                             "decision": "Normalize documented numeric ID variants. Keep raw spellings in source evidence."})
    return {"counts": dict(Counter(x["type"] for x in findings)), "findings": findings}


def question_figures(answers):
    seats, gpu, prod = (answers[k] for k in ("unused-seats", "gpu", "production"))
    for row in seats["results"].values():
        row["figures"] = {k: figure(row[k], unit, method, {"purchased": row["purchased"], "active": row["active"]},
                                   [*row["refs"], "exchange_rates.csv"]) for k, unit, method in (
            ("purchased", "seats", "Sum purchased seats on unique final August invoices."),
            ("active", "seats", "Sum known active seats on unique final August invoices."),
            ("unused", "seats", "Sum purchased minus active for rows with valid activity."),
            ("unused_chf_per_month", "CHF/month", "Sum each final CHF bill multiplied by unused seats divided by purchased seats."))}
    for row in gpu["results"]:
        row["explanation"] = explain(row)
        row["utilisation"] = figure(row["mean_weekly_gpu_pct"], "%", "Mean of known weekly GPU utilization percentages.",
                                      {"weeks": row["weeks_with_gpu_metric"]}, [x for x in row["evidence"] if x.startswith("server_metrics_weekly")])
    for row in prod["results"]:
        row["figures"] = {"active_nonworkdays": figure(len(row["active_nonworkday_refs"]), "days",
                                                       "Count days with active use > 0 and calendar workday = 0.",
                                                       {"calendar_joined_days": row["calendar_joined_days"]},
                                                       [*row["active_nonworkday_refs"], "business_calendar.csv"])}
    return answers
