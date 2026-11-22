"""Ticket-aware case scenarios. All allocations and savings remain proposals."""
from collections import defaultdict
from datetime import timedelta

from engine.accounting import market_relocation, merge_market_effects, scale_market_effect
from engine.greenops import START, END, day, inside, key, month, natural, total
from engine.verification import evidence_record, required_number
from engine.decision import combine_production


def pooled_share(r, members, line):
    """Allocate no more than the observed pool, using weekly member runtime."""
    d = day(line["day"])
    week = d - timedelta(days=d.weekday())
    demand = sum((natural(row.get("uptime_h")) or 0) / 7 * (natural(members.get(key(row.get("server_id")), {}).get("vcpu")) or 0)
                 for row in r.metrics_by_week.get(week, []))
    return min(1, demand / line["quantity"]) if line["quantity"] and demand else 0


CONTRACT_SOURCES = (("ai_subscriptions", "product"), ("saas_contracts", "contract"))


def _latest_contracts(r, product):
    """Final rows of the last baseline month for one product, keyed by cost centre."""
    for source, label in CONTRACT_SOURCES:
        rows = [row for row in r.d[source] if key(row.get(label)) == product and month(row.get("month")) == "2026-08"]
        if rows:
            return source, label, {key(row.get("cost_center")): row for row in rows}
    return None, None, {}


def subscription_consolidation(r, spec, seats):
    """Cancel subscriptions whose benefit another licence already provides, and move monthly plans to annual billing.

    Savings are incremental to the seat clean-up bundle: each contract's seat-bundle saving is deducted,
    and any extra seats the replacement needs for moved users are charged back at the replacement's August rate.
    """
    if not spec or not spec.get("contracts"):
        return None
    a = r.a
    removed = {c["resource"]: c.get("removable_seats", 0) for c in seats["components"]}
    seat_saving = {c["resource"]: c["chf"] for c in seats["components"]}
    parts, rows, evidence, blocked = [], [], [], []
    for entry in spec["contracts"]:
        product = key(entry["product"])
        source, label, current = _latest_contracts(r, product)
        if not current:
            continue
        replacement = key(entry.get("replacement_product"))
        _, target_label, target = _latest_contracts(r, replacement) if replacement else (None, None, {})
        for cc, row in sorted(current.items()):
            rid = "|".join(key(row.get(k)) for k in (label, "provider", "cost_center"))
            lines = r.by_resource[rid]
            august = sum(line["chf"] or 0 for line in lines if line["month"] == "2026-08")
            bought, active = natural(row.get("licences_purchased")), natural(row.get("licences_active_30d"))
            end, notice = day(row.get("contract_end")), natural(row.get("notice_period_days"))
            if not august or bought is None or active is None:
                blocked.append(f"{rid}: missing August price or seat counts")
                continue
            if not end or notice is None or (end - a.as_of).days < notice:
                blocked.append(f"{rid}: notice period for {end} has passed; savings deferred to the following term")
                continue
            retained = bought - removed.get(rid, 0)
            if entry["action"] == "annual_billing":
                monthly, annual = entry["monthly_price"], entry["annual_price"]
                annual_chf = 12 * august * retained / bought * (1 - annual / monthly)
                detail = f"{retained:g} retained seats move from {monthly:g} to {annual:g} {row.get('currency')} per seat-month"
            else:
                annual_chf = 12 * august - seat_saving.get(rid, 0)
                detail = f"cancel {retained:g} seats remaining after seat clean-up"
                if replacement:
                    target_row = target.get(cc)
                    if target_row is None:
                        blocked.append(f"{rid}: no {replacement} contract in cost centre {cc}")
                        continue
                    target_rid = "|".join(key(target_row.get(k)) for k in (target_label, "provider", "cost_center"))
                    t_bought, t_active = natural(target_row.get("licences_purchased")), natural(target_row.get("licences_active_30d"))
                    if entry.get("replacement_included"):
                        # Same people already hold the replacement licence (e.g. Teams inside Microsoft 365).
                        extra = max(0, active - (t_bought - removed.get(target_rid, 0)))
                    else:
                        # Different people move over: they need free seats after the seat clean-up.
                        extra = max(0, active - (t_bought - removed.get(target_rid, 0) - t_active))
                    if extra:
                        t_august = sum(line["chf"] or 0 for line in r.by_resource[target_rid] if line["month"] == "2026-08")
                        annual_chf -= 12 * t_august / t_bought * extra
                        detail += f"; buy {extra:g} extra {replacement} seats"
            annual_chf = max(0, annual_chf)
            if not annual_chf:
                continue
            parts.append({"resource": rid, "action": entry["action"], "chf": round(annual_chf, 2), "detail": detail,
                          "effective_date": end.isoformat(),
                          "first_year_fraction": max(0, min(1, 1 - (end - a.as_of).days / 365))})
            rows.extend(lines)
            evidence.extend([row["ref"], *entry.get("evidence", [])])
    if not parts:
        return None
    annual = sum(p["chf"] for p in parts)
    base = total(rows)["chf"]
    item = r.measure("subscriptions", spec.get("name", "Consolidate duplicate subscriptions"), spec["change"],
                     rows, min(1, annual / base) if base > 0 else 0, spec["days"],
                     [*spec.get("checks", []), *blocked], evidence, spec["method"], energy_fraction=0)
    item.update(chf=round(annual, 2), approval=spec.get("approval", "Head of Finance and Head of IT"),
                scopes=["consolidation:" + p["resource"] for p in parts], components=parts,
                first_year_fraction=sum(p["chf"] * p["first_year_fraction"] for p in parts) / annual,
                calculation_inputs={"incremental_to": seats["id"],
                                    "contracts": {p["resource"]: p["detail"] for p in parts}})
    return item


def workload_reviews(r):
    """Owner reviews supported by workload telemetry, without an attributable saving."""
    rid = "pbi-06"
    report = [row for row in r.d["powerbi_usage"] if row.get("resource_id") == rid and inside(row.get("date"))]
    owner = r.a.mapping.get(rid, {})
    protected = any(rid in rule.get("resources", []) for rule in r.a.policy.get("protection_register", []))
    # Require a month of observations, known counts and repeat refreshes on mostly unviewed days.
    counts = [(natural(row.get("refresh_count")), natural(row.get("view_count"))) for row in report]
    days = len({row["date"] for row in report})
    if (not protected and days >= 30 and owner.get("responsible_role") and len(report) == days
            and all(refresh is not None and views is not None for refresh, views in counts)
            and sum(refresh > 1 and views == 0 for refresh, views in counts) > days / 2):
        check = "Confirm freshness requirements for exports, alerts and downstream reports with Marketing and BI operations."
        item = r.measure(rid, "Pilot daily refresh for Marketing campaigns 2024",
                         "After owner confirmation, pilot one daily refresh. Compare capacity load and restore the previous schedule if a freshness deadline is missed. Leave audit report pbi-07 unchanged.",
                         [], 0, 1, [check], [owner["ref"], *(row["ref"] for row in report)],
                         f"{sum(n for n, _ in counts):,.0f} refreshes and {sum(n for _, n in counts):g} recorded views across {days} observed days. Views do not capture downstream consumers. Only the separate capacity-resize decision can claim a verified bill reduction.")
        item.update(approval=owner["responsible_role"], attribution_check=check)
        yield item

    reruns = [row for row in r.d["ci_pipeline_runs"] if inside(row.get("started_at"))
              and (row.get("repo"), row.get("pipeline"), row.get("trigger"), row.get("team"))
              == ("portal", "e2e-tests", "rerun", "team-portal")]
    if len({day(row["started_at"]) for row in reruns}) >= 30:
        check = "Trace a sample to original CI runs and confirm the cause with team-portal. Keep required checks and retries enabled."
        item = r.measure("portal-e2e", "Investigate portal end-to-end test reruns",
                         "Fix a recurring test or runner fault if confirmed, then compare the rerun rate before and after the fix.",
                         [], 0, 1, [check], [row["ref"] for row in reruns],
                         f"{len(reruns)} accepted rerun records; {sum(row.get('status') == 'ok' for row in reruns)} marked successful. The trigger does not establish why the test ran again or which runner minutes were avoidable.")
        item.update(approval="team-portal", attribution_check=check)
        yield item


def case_candidates(r, existing):
    a = r.a
    cfg = a.policy.get("case_measures", {})
    if not cfg:
        return existing
    seats = [m for m in existing if m["name"] == "Reduce unused seats" and not m["blockers"]]
    candidates = [m for m in existing if m["name"] not in ("Reduce unused seats", "Coordinate seat reductions by contract")]
    candidates.extend(workload_reviews(r))
    if seats:
        rows = [line for m in seats for line in r.by_resource[m["resource"]]]
        annual = sum(m["chf"] for m in seats)
        bundle = r.measure("licences", "Clean up unused SaaS and AI seats",
                           "Run a single procurement review, confirm seat assignments with department owners and reduce seats at eligible renewals.",
                           rows, min(1, annual / total(rows)["chf"]), 2,
                           ["Confirm renewal dates and the two-day coordinated review estimate with procurement."],
                           [e for m in seats for e in m["evidence"]],
                           "Sum eligible contract-level savings. Each member has three months of seat evidence, a two-seat buffer and a notice check. No usage change assumed.",
                           energy_fraction=0)
        bundle.update(approval="Head of Finance and department licence owners",
                      scopes=[m["resource"] for m in seats], components=seats,
                      first_year_fraction=sum(m["chf"] * m.get("first_year_fraction", 1) for m in seats) / annual)
        candidates.append(bundle)
        consolidation = subscription_consolidation(r, cfg.get("subscription_consolidation"), bundle)
        if consolidation:
            candidates.append(consolidation)

    for rid, spec in cfg.get("shutdown_groups", {}).items():
        inventory = {k: v for k, v in a.inventory.items()
                     if k in spec.get("members", []) or (spec.get("prefix") and k.startswith(spec["prefix"]))}
        if spec.get("stale_days"):
            earliest = a.as_of - timedelta(days=spec["stale_days"])
            inventory = {k: v for k, v in inventory.items() if day(v.get("last_login")) and
                         day(v["last_login"]) <= earliest and key(v.get("environment")) in ("test", "dev")}
        if not inventory:
            continue
        pool = spec.get("pool")
        attestation = evidence_record(a, "meter_pools", pool) if pool else None
        if attestation:
            approved_members = attestation.get("members")
            if not isinstance(approved_members, list) or any(not isinstance(v, str) for v in approved_members):
                raise ValueError(f"meter_pools/{pool} requires members listed by server ID.")
            inventory = {k: v for k, v in inventory.items() if k in approved_members}
            if not inventory:
                continue
        rows = [line for member in inventory for line in r.by_resource[member] if line["unit"] in ("vcpu-hour", "vcore-hour")]
        pooled = [line for line in r.by_resource.get(pool, []) if line["unit"] in ("vcpu-hour", "vcore-hour")
                  and line["region"] == "ie" and not r.protection_day(pool, line["day"])]
        prorated = []
        for line in pooled:
            allocated = pooled_share(r, inventory, line)
            if spec.get("schedule"):
                d = day(line["day"])
                # 08:00–18:00 on working weekdays. Keep all Sundays for patching.
                free = 0 if d.weekday() == 6 else 1 if d.weekday() == 5 else 14 / 24
                allocated *= free
            if not allocated:
                continue
            prorated.append(line | {k: [v * allocated for v in line[k]] if line[k] is not None else None
                                    for k in ("kwh", "kg", "kg_market", "market_residual_kg")} |
                             {"chf": line["chf"] * allocated if line["chf"] is not None else None})
        if spec.get("schedule"):
            # Baseline meter takes precedence. Unmapped direct meters require an owner to specify a schedule.
            rows = []
        if pool:
            observed_pool_days = {line["day"] for line in r.by_resource.get(pool, []) if line["quantity"]}
            rows = [line for line in rows if line["day"] not in observed_pool_days]
        scope_rows = rows + prorated
        evidence = [line["ref"] for line in scope_rows] + [v["ref"] for v in inventory.values()]
        evidence.extend(v["ref"] for m in inventory for v in r.metrics[m])
        if attestation:
            evidence.append(attestation["source"])
        item = r.measure(rid, spec["name"], spec["change"], scope_rows, 1, spec["days"],
                         ["Verify ownership, dependency and hourly availability before making changes."],
                         evidence, spec["method"])
        item.update(approval="Head of IT and affected workload owners",
                    scopes=sorted({rid, *inventory, *([pool] if pool else [])}),
                    members=sorted(inventory), meter_scope=("owner-confirmed" if attestation else "inferred") if pool else None)
        candidates.append(item)

    expansion = cfg.get("temporary_test_capacity")
    if expansion:
        rid = expansion["resource"]
        ticket = next((t for t in r.tickets[rid] if t.get("ticket_id") == expansion["ticket"]), None)
        capacity = expansion["expanded_vcpu"]
        # Look for sustained billing at the expanded level in the final baseline month.
        rows = [line for line in r.by_resource.get(rid, []) if line["month"] == "2026-08"
                and line["unit"] == "vcpu-hour" and (line["quantity"] or 0) >= 24 * capacity
                and not r.protection_day(rid, line["day"])]
        dates = {line["day"] for line in rows}
        if ticket and len(dates) >= 14:
            check = "Confirm portal go-live, identify the temporary workers on the shared meter and test the capacity floor with the owner. Preserve the disaster-recovery server."
            item = r.measure(rid, "Review temporary portal test capacity after go-live",
                             "Check whether the temporary capacity increase can be reversed.", rows, 0, 1,
                             [check], [ticket["ref"], *(line["ref"] for line in rows)],
                             f"{expansion['ticket']} planned a scale-back after go-live. On {len(dates)} August dates the meter still billed at least {capacity * 24} vCPU-hours. The bill does not establish which workers can be removed.")
            item["attribution_check"] = check
            candidates.append(item)

    idle = next((m for m in existing if m["resource"] == "dp-dev" and m["name"] == "Reduce cluster idle runtime"), None)
    if idle and a.factors["grid"].get("ch"):
        rows = [row for row in r.by_resource["dp-dev"] if row["unit"] == "node-hour" and row["region"] == "de"
                and not r.protection_day("dp-dev", row["day"])]
        fraction = idle["energy_fraction"]
        item = r.measure("dp-dev", "Auto-terminate and relocate the development cluster",
                         "Preserve all quarterly Frankfurt training dates and fixed jobs. Apply timeout elsewhere and move eligible remaining activity to Zurich after a dependency rehearsal.",
                         rows, fraction, 3, [*idle["blockers"], "Confirm Zurich rate, data residency and joint GPU readiness."],
                         idle["evidence"], "Auto-terminate unused activity first, then apply the Zurich consumption mix to only the remaining kWh. Annual CHF assumes equal variable unit rates until a Swiss quote is available.")
        ch = a.factors["grid"]["ch"]
        item["calculation_inputs"] = {"idle_fraction": fraction, "destination_grid_kg_per_kwh": ch["values"],
                                      "destination_grid_source": ch["source"], "destination_cost_rate_assumption": "equal variable CHF rate"}
        quote = evidence_record(a, "destination_quotes", "dp-dev")
        if quote:
            rate = required_number(quote, "chf_per_node_hour")
            remaining = sum(row["quantity"] or 0 for row in rows) * (1 - fraction)
            item["chf"] = round(item["baseline"]["chf"] - remaining * rate, 2)
            item["implementation_chf"] += required_number(quote, "migration_chf") if "migration_chf" in quote else 0
            item["evidence"].append(quote["source"])
            item["method"] = "Annual CHF savings = observed eligible Frankfurt CHF − remaining node-hours after auto-termination × quoted Zurich CHF/node-hour. Excludes protected training and requires a capacity and residency check."
            item["calculation_inputs"].update(destination_cost_rate_assumption="dated Zurich quote",
                                              destination_chf_per_node_hour=rate, remaining_node_hours=remaining)
        # Remaining workload moves only after the idle fraction has been deducted.
        item["kg"] = [round(b - e * (1 - fraction) * g, 5)
                      for b, e, g in zip(item["baseline"]["kg"], item["baseline"]["kwh"], ch["values"])]
        relocation = market_relocation(a, rows, "ch", 1 - fraction, (quote or {}).get("provider", ""))
        item["market_effect"] = merge_market_effects([item["market_effect"], relocation])
        item["kg_market"] = item["market_effect"]["range"]
        item["phase"] = "Joint dependency rehearsal before GPU or development cutover"
        candidates.append(item)

    if cfg.get("production_autoscale") and r.usage.get("dp-prod"):
        workdays = defaultdict(list)
        for d, calendar in sorted((k, v) for k, v in r.calendar.items() if k is not None):
            if START <= d < END and calendar["workday"] == "1":
                workdays[month(d)].append(d)
        close = {d for days in workdays.values() for d in days[-3:]}
        reserved = defaultdict(float)
        unknown = set()
        for job in r.d["data_platform_jobs"]:
            d = day(job.get("date"))
            if job.get("resource_id") == "dp-prod" and d:
                length = natural(job.get("duration_h"))
                if length is None or key(job.get("status")) != "ok":
                    unknown.add(d)
                else:
                    reserved[d] += length
        usage = {day(x["date"]): x for x in r.usage["dp-prod"]}
        rows, refs = [], []
        for line in r.by_resource["dp-prod"]:
            d = day(line["day"])
            u = usage.get(d, {})
            run, active = natural(u.get("runtime_h")), natural(u.get("active_use_h"))
            if (line["unit"] != "node-hour" or d not in r.calendar or len(workdays[month(d)]) < 3
                    or d in close or d in unknown or d.weekday() == 6
                    or not run or active is None or not 0 <= active <= run <= 24 or not reserved[d]):
                continue
            fraction = max(0, run - active - reserved[d]) / run * .25
            if not fraction:
                continue
            rows.append(line | {"chf": None if line["chf"] is None else line["chf"] * fraction} |
                        {k: [v * fraction for v in line[k]] if line[k] is not None else None
                         for k in ("kwh", "kg", "kg_market", "market_residual_kg")})
            refs.extend((line["ref"], u["ref"], r.calendar[d]["ref"]))
        if rows:
            m = r.measure("dp-prod", "Autoscale surplus production workers", "Pilot a minimum capacity of 75%. Keep the service running and restore full capacity for closing, every scheduled job, Sundays and any uncertainty.",
                          rows, 1, 2, ["Head of Consulting, Finance and IT must attest failover, capacity floor, closing exclusions and job deadlines."],
                          refs + ["it_tickets.csv T-1029", "extra/data_platform_jobs.csv"],
                          "Eligible node-hours × 25% surplus-worker limit × max(0, runtime − active hours − scheduled job hours) / runtime. Exclude the full last three working days, Sundays and unknown days. Requires measured capacity at the proposed floor.")
            m.update(approval="Head of Consulting, Head of Finance and Head of IT", availability_preserving=True)
            pilot = evidence_record(a, "production_pilots", "dp-prod")
            checks = ("capacity_test", "deadlines_test", "month_end_rehearsal", "rollback_test")
            m["required_checks"] = list(checks)
            m["pilot_evidence_complete"] = False
            if pilot:
                floor = required_number(pilot, "minimum_capacity_fraction", 1)
                if floor < .75 or any(not isinstance(pilot.get(check), str) or not pilot[check].strip() for check in checks):
                    raise ValueError("Production pilot requires four evidence references and at least a 75% capacity floor.")
                scale = (1 - floor) / .25
                m["chf"] = round(m["chf"] * scale, 2)
                for metric in ("kwh", "kg"):
                    if m[metric] is not None:
                        m[metric] = [round(v * scale, 5) for v in m[metric]]
                m["market_effect"] = scale_market_effect(m["market_effect"], scale)
                m["kg_market"] = m["market_effect"]["range"]
                m["change"] = m["change"].replace("75%", f"{floor:.0%}")
                m["method"] += f" Pilot-supported surplus limit {1-floor:.1%} replaces the 25% scenario limit."
                m["pilot_evidence_complete"] = True
                m["calculation_inputs"] = {"pilot": pilot}
                m["evidence"].extend([pilot["source"], *(pilot[check] for check in checks)])
            candidates.append(m)

    for rid, name, units in (
        ("dp-prod", "Negotiate production compute rate", {"node-hour"}),
        ("dp-dev", "Negotiate development compute rate", {"node-hour"}),
        ("pbi-kap", "Resize Power BI capacity with audited reports protected", {"capacity-day"}),
    ):
        rows = [line for line in r.by_resource.get(rid, []) if line["unit"] in units]
        baseline = total(rows)
        if not rows or baseline["chf"] <= 0:
            continue
        quote = evidence_record(a, "commercial_quotes", rid)
        refs = [line["ref"] for line in rows]
        checks = ["Equivalent billed scope, committed volume and terms must be verified with procurement."]
        if rid == "pbi-kap":
            usage = [row for row in r.d["powerbi_usage"] if inside(row.get("date"))]
            protected = [row for row in usage if row.get("resource_id") == "pbi-07"]
            refs.extend([row["ref"] for row in protected])
            refs.append("it_tickets.csv T-1167")
            checks.append("Benchmark peak refresh, closing and audit report pbi-07 at proposed capacity. Retain rollback capacity.")
        candidate = r.measure(rid, name, "Assess an alternative quote at documented service and retention levels.",
                              rows, 0, 2, checks, refs,
                              "CHF savings = observed annual CHF on the specified meter minus comparable quoted annual CHF. No energy or emissions change is booked.",
                              energy_fraction=0)
        candidate["quote_status"] = "quote required"
        candidate["approval"] = "Head of Finance and Head of IT"
        if rid == "dp-prod":
            candidate["availability_preserving"] = True
        if rid == "pbi-kap":
            candidate["protected_dependencies"] = ["pbi-07"]
        if quote:
            quoted = required_number(quote, "annual_chf")
            if quote.get("equivalent_service") is not True:
                raise ValueError(f"commercial_quotes/{rid} must attest equivalent service and billed scope.")
            if rid == "pbi-kap" and not all(isinstance(quote.get(k), str) and quote[k].strip() for k in ("peak_test", "audit_test", "rollback_test")):
                raise ValueError("Power BI quote requires peak, audit and rollback evidence.")
            candidate["chf"] = round(baseline["chf"] - quoted, 2)
            candidate["implementation_chf"] += required_number(quote, "one_time_chf") if "one_time_chf" in quote else 0
            candidate["calculation_inputs"] = {"quoted_annual_chf": quoted, "billed_scope": rid}
            candidate["quote_status"] = "dated quote supplied"
            candidate["evidence"].append(quote["source"])
        candidates.append(candidate)
        if rid == "dp-prod" and quote and quote.get("scales_with_usage") is True:
            autoscale = next((m for m in candidates if m["name"] == "Autoscale surplus production workers"), None)
            if autoscale:
                candidates.append(combine_production(autoscale, candidate, quoted))

    for names, name in [(("Route routine requests to smaller models", "Increase safe prompt-cache reuse"),
                         "Route routine AI calls and cache approved prefixes")]:
        eligible = [m for m in existing if m["name"] in names]
        # The routing and caching rows can overlap. Use the larger modeled saving per resource.
        best = {}
        for m in eligible:
            if m["chf"] > best.get(m["resource"], {}).get("chf", -1):
                best[m["resource"]] = m
        for rid, part in list(best.items()):
            benchmark = evidence_record(a, "ai_benchmarks", rid)
            if not benchmark:
                continue
            if benchmark.get("quality_passed") is not True or benchmark.get("scope") != part["id"]:
                raise ValueError(f"ai_benchmarks/{rid} must confirm quality and name the exact pilot measure ID in scope.")
            cost_fraction = required_number(benchmark, "cost_saving_fraction", 1)
            energy_fraction = required_number(benchmark, "energy_saving_fraction", 1)
            market = scale_market_effect(part["market_effect"], energy_fraction / part["energy_fraction"])
            best[rid] = part | {"chf": round(part["baseline"]["chf"] * cost_fraction, 2),
                                "kg": [round(v * energy_fraction, 5) for v in part["baseline"]["kg"]],
                                "kwh": [round(v * energy_fraction, 5) for v in part["baseline"]["kwh"]],
                                "kg_market": market["range"], "market_effect": market,
                                "evidence": [*part["evidence"], benchmark["source"]],
                                "cost_fraction": cost_fraction, "energy_fraction": energy_fraction,
                                "method": "Scope-matched cost and energy fractions measured in a quality-checked pilot."}
        if best:
            parts = list(best.values())
            item = dict(parts[0], id=name + ":ai-gateway", resource="ai-gateway", name=name, days=2,
                        implementation_chf=2200, approval="Head of IT and AI product owners",
                        change="Benchmark smaller models for routine calls and enable tenant-isolated caching on invariant prefixes.",
                        method="Per AI workload, count only the higher CHF scenario of routing and caching to avoid overlap. Confirm quality, actual token rates and hit rate before rollout.",
                        scopes=list(best), components=parts, baseline={k: total([m["baseline"] for m in parts])[k] for k in ("chf", "kwh", "kg")},
                        evidence=list(dict.fromkeys(e for m in parts for e in m["evidence"])),
                        chf=round(sum(m["chf"] for m in parts), 2))
            for metric in ("kwh", "kg"):
                item[metric] = [round(sum((m[metric] or [0, 0, 0])[i] for m in parts), 5) for i in range(3)] if any(m[metric] is not None for m in parts) else None
            item["market_effect"] = merge_market_effects([m["market_effect"] for m in parts])
            item["kg_market"] = item["market_effect"]["range"]
            candidates = [m for m in candidates if m["name"] not in names]
            candidates.append(item)
    return candidates
