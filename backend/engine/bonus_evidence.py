"""Traceable diagnostics that keep unapproved findings outside claimed savings."""
from collections import defaultdict

from engine.accounting import market_reduction
from engine.greenops import inside, key, month, natural, obj, project_id
from engine.verification import evidence_record


def ci_attribution(reports):
    a = reports.a
    meters = defaultdict(list)
    for line in a.lines:
        if line["unit"] == "runner-minute" and line["quantity"]:
            meters[line["resource"], line["month"], line["region"]].append(line)
    activity = defaultdict(lambda: {"minutes": 0, "optional_minutes": 0, "required_or_unknown_minutes": 0,
                                   "review_candidate_minutes": 0, "missing_duration": 0, "refs": [], "check_refs": set()})
    for row in a.data["ci_pipeline_runs"]:
        if not inside(row.get("started_at")):
            continue
        runner, repo, pipeline = (str(row.get(k) or "") for k in ("runner", "repo", "pipeline"))
        scope = f"{repo}|{pipeline}"
        attested = evidence_record(a, "ci_runner_meters", runner)
        meter_id = attested.get("meter") if attested else None
        region = attested.get("region") if attested else a.region(runner.partition("(")[2].rstrip(")"))
        period = month(row["started_at"])
        same_region = [rid for rid, m, region_ in meters if m == period and region_ == region]
        meter_id = meter_id or (same_region[0] if len(same_region) == 1 else None)
        ident = (meter_id or "unmatched", period, region)
        out = activity[ident]
        metrics = obj(row.get("metrics"))
        seconds = next((q for k in ("duration_s", "duration_sec") if (q := natural(metrics.get(k))) is not None), None)
        if seconds is None:
            out["missing_duration"] += 1
            continue
        minutes = seconds / 60
        out["minutes"] += minutes
        nightly = key(pipeline) == "nightly-full" and natural(row.get("commits_since_last_nightly")) == 0
        rerun = key(row.get("trigger")) == "rerun"
        rule = evidence_record(a, "ci_required_checks", scope) if nightly or rerun else None
        optional = bool(rule and rule.get("required") is False and attested and
                        ((nightly and rule.get("allow_no_change_skip") is True)
                         or (rerun and rule.get("allow_rerun_suppression") is True)))
        if nightly or rerun:
            bucket = "optional_minutes" if optional else "required_or_unknown_minutes" if rule and rule.get("required") else "review_candidate_minutes"
            out[bucket] += minutes
            if len(out["refs"]) < 12:
                out["refs"].append(row["ref"])
            if rule:
                out["check_refs"].add(rule["source"])
            if attested:
                out["check_refs"].add(attested["source"])
    output = []
    for (meter, m, region), run in sorted(activity.items()):
        lines = meters[meter, m, region]
        billed = sum(r["quantity"] for r in lines)
        priced = [r for r in lines if r["chf"] is not None]
        chf = sum(r["chf"] for r in priced) if lines and len(lines) == len(priced) else None
        denominator = max(billed, run["minutes"])
        fraction = run["optional_minutes"] / denominator if billed and denominator else 0
        impact = {k: [round(sum(row[k][i] for row in lines) * fraction, 5) for i in range(3)]
                  if lines and all(row[k] is not None for row in lines) else None for k in ("kwh", "kg")}
        output.append({"meter": meter, "month": m, "region": region, **run, "check_refs": sorted(run["check_refs"]),
                       "billed_minutes": round(billed, 2) if lines else None,
                       "telemetry_minus_billed_minutes": round(run["minutes"] - billed, 2) if lines else None,
                       "recoverable_chf": round(chf * fraction, 2) if chf is not None else None,
                       "recoverable_kg": impact["kg"], "recoverable_kwh": impact["kwh"],
                       "market_effect": market_reduction(lines, fraction),
                       "billing_refs": [r["ref"] for r in lines[:6]]})
    return {"rows": output, "method": "Match normalized runner region and billing month. Claim savings only on owner-attested meter mappings and approved non-required runs. Prorate against the larger of all observed or billed minutes; missing prices remain unknown. Required, unknown, and merely inferred rows stay outside counted savings."}


def considered_joins(reports, shared_cost):
    a = reports.a
    usage = defaultdict(list)
    for row in a.data["powerbi_usage"]:
        if inside(row.get("date")):
            usage[row["resource_id"]].append(row)
    always_on = {rid for p in a.policy.get("protection_register", []) if p.get("always_on") for rid in p["resources"]}
    reports_out = []
    for rid, rows in sorted(usage.items()):
        views = [natural(r.get("view_count")) for r in rows]
        minutes = sum(natural(r.get("refresh_duration_min")) or 0 for r in rows)
        if rid not in always_on and (None in views or not minutes or sum(views) > len(rows)):
            continue
        mapped = a.mapping.get(rid, {})
        reports_out.append({"resource": rid, "observations": len(rows), "refresh_minutes": round(minutes, 2),
                            "views": sum(v for v in views if v is not None), "view_gaps": views.count(None),
                            "decision": "Preserve audit availability" if rid in always_on else "Review refresh cadence with report owner",
                            "owner": mapped.get("responsible_role"), "refs": [r["ref"] for r in rows[:5]] +
                            [r["source"] for r in a.policy.get("protection_register", []) if rid in r["resources"]],
                            "capacity_chf_savings": None})
    backups = defaultdict(list)
    for row in a.data["backup_chains"]:
        backups[row["source"]].append(row)
    chains = []
    for scope, rows in sorted(backups.items()):
        if len(rows) < 2:
            continue
        retained = [r for r in rows if key(r.get("second_site")) == "yes" or (natural(r.get("retention_days")) or 0) >= 3650
                    or key(r.get("criticality")) == "high"]
        chains.append({"source": scope, "chains": len(rows), "protected_copy_refs": [r["ref"] for r in retained],
                       "refs": [r["ref"] for r in rows], "decision": "Preserve required and off-site copies; confirm restore and retention before proposing consolidation."})
    projects = {project_id(row["project_id"]): row for row in a.data["projects"]}
    project_spend = defaultdict(lambda: {"chf": 0.0, "has_overhead": False, "source_refs": []})
    for row in a.lines:
        if not row.get("project") or row["chf"] is None:
            continue
        group = project_spend[row["month"], row["project"]]
        group["chf"] += row["chf"]
        group["has_overhead"] |= key(row.get("department")) == "overhead"
        if len(group["source_refs"]) < 3:
            group["source_refs"].append(row["ref"])
    project_examples = defaultdict(list)
    for row in a.data["project_hours_monthly"]:
        pid = project_id(row["project_id"])
        if (month(row["month"]), pid) in project_spend and pid in projects and natural(row.get("hours")):
            group = project_examples[month(row["month"]), pid]
            group.append({"department": row["department"], "hours": natural(row["hours"]), "ref": row["ref"]})
    examples = []
    for (m, p), lines in sorted(project_examples.items(), key=lambda item: (-project_spend[item[0]]["chf"], item[0])):
        billed = project_spend[m, p]
        if len(lines) < 2 or billed["chf"] <= 0:
            continue
        hours = sum(row["hours"] for row in lines)
        examples.append({"month": m, "project": p, "weights": [row | {"share": row["hours"] / hours,
                         "illustrative_chf": round(billed["chf"] * row["hours"] / hours, 2)} for row in lines],
                         "project_ref": projects[p]["ref"], "billed_chf": round(billed["chf"], 2),
                         "cost_refs": billed["source_refs"],
                         "decision": "Retain direct assignments. Show project-hour shares as a sensitivity on this billed project month.",
                         "has_overhead": billed["has_overhead"]})
        if len(examples) == 6:
            break
    uses = {
        "data_platform_jobs": ("diagnostics/jobs", "Keep fixed deadlines and replay eligible windows."),
        "data_catalog_tables": ("diagnostics/stale_tables", "Review cold storage while maintaining retention."),
        "powerbi_usage": ("bonus-decisions/powerbi", "Keep audit availability and review evidenced refresh patterns."),
        "ai_agent_runs": ("diagnostics/agents", "Investigate retry-heavy agents before changing their budgets."),
        "ai_invoice_monthly": ("reconciliation", "Review provider/gateway variance without booking an unsupported adjustment."),
        "m365_usage": ("ledger", "Estimate energy only for metered workloads and separate observed purchase cost."),
        "web_traffic": ("diagnostics/web_sampling", "Check sampled automated traffic before applying bot controls."),
        "ci_pipeline_runs": ("ci-attribution", "Protect required checks and map candidate minutes to billing."),
        "log_volume": ("diagnostics/logs", "Collect retention evidence before reducing log ingestion."),
        "backup_chains": ("bonus-decisions/backups", "Preserve copy and restore safeguards."),
        "data_center_locations": ("ledger", "Resolve regional grid-factor selection."),
        "provider_monthly_report": ("reconciliation", "Investigate reported scope and invoice differences."),
        "headcount": ("allocation", "Apply evidenced fallback allocation where project hours are unavailable."),
        "projects": ("bonus-decisions/shared_cost", "Match project identifiers and supported recharge eligibility."),
        "project_hours_monthly": ("bonus-decisions/shared_cost", "Attribute shared cost using documented monthly workload weights."),
    }
    return {"powerbi": reports_out, "backups": chains, "shared_cost": {"allocation": shared_cost, "examples": examples},
            "bonus_sources": [{"source": name, "view": view, "decision": message, "accepted": a.sources[name]["accepted"],
                               "example_refs": [row["ref"] for row in a.data[name][:3]]}
                              for name, (view, message) in uses.items()]}
