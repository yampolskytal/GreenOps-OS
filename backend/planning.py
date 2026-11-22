"""Conservative policy checks, additional modeled measures and financial timing."""
from collections import defaultdict
from accounting import market_reduction, market_relocation, merge_market_effects
from datetime import timedelta

from greenops import day, inside, key, natural
from bonus_evidence import ci_attribution


def contract_ticket(row, ticket):
    if ticket.get("resource_id"):
        return False
    if key(ticket.get("type")) == "request":
        # Seat orders are not a blanket prohibition. Match evidence to its product.
        product = key(row.get("product") or row.get("contract"))
        return bool(product and product in key(ticket.get("title")) and "required" in key(ticket.get("description")))
    return any(x in key(ticket.get("title")) for x in ("licence freeze", "contract freeze", "licence protection", "license protection"))


GLOBAL_PROTECTION_MARKERS = ("protection window", "maintenance freeze", "shutdown embargo", "critical dependency")


def platform_tickets(reports, rid):
    # Unscoped protection tickets apply to every resource; filter them once per Reports instance.
    generic = reports.__dict__.get("_global_protection_tickets")
    if generic is None:
        generic = reports._global_protection_tickets = [
            row for row in reports.tickets[""]
            if any(x in key(row.get("title")) for x in GLOBAL_PROTECTION_MARKERS)]
    return reports.tickets[rid] + generic


def tariff_routing(a, rows, linked, routes, min_coverage=.8):
    """Ratio of small-model tariff CHF to billed gateway CHF for the given routine rows.

    The ratio is measured on rows with complete token counts and applied to the rest. Returns
    (None, set()) when a row has no configured route or dated tariff, or when complete rows cover
    less than min_coverage of the billed spend, so the caller falls back to the flat scenario.
    """
    prices = a.policy.get("ai_prices", [])
    billed = priced_billed = repriced = 0.0
    targets = set()
    for r in rows:
        line = linked.get(r["ref"])
        if line is None or line["chf"] is None:
            continue
        billed += line["chf"]
        route = routes.get((key(r.get("provider")), key(r.get("model"))))
        if not route:
            return None, set()
        d = day(r.get("date"))
        inp, cached, out = (natural(r.get(k)) for k in ("tokens_in", "tokens_in_cache", "tokens_out"))
        if not d or None in (inp, out):
            continue
        tariff = [p for p in prices if key(p.get("provider")) == key(route["to_provider"]) and key(p.get("model")) == key(route["to_model"])
                  and day(p.get("from")) and day(p.get("through")) and day(p["from"]) <= d <= day(p["through"])]
        if len(tariff) != 1:
            return None, set()
        p = tariff[0]
        cached = min(cached or 0, inp)
        usd = ((inp - cached) * p["input_per_million"] + cached * p["cache_per_million"] + out * p["output_per_million"]) / 1_000_000
        chf = a.chf(usd, p["currency"], d.isoformat()[:7], r["ref"])
        if chf is None:
            continue
        priced_billed += line["chf"]
        repriced += chf
        targets.add(route["to_model"])
    if not billed or priced_billed < min_coverage * billed:
        return None, set()
    return repriced / priced_billed, targets


def log_retention(reports, rid, storage, spec):
    """Shorten retention for named services. Billed GB-days scale with daily volume × retention days."""
    daily = defaultdict(list)
    retention, refs = {}, []
    for r in reports.d["log_volume"]:
        gb, unit = natural(r.get("log_gb")), key(r.get("unit"))
        days = natural(r.get("retention_days"))
        if not inside(r.get("date")) or gb is None or unit not in ("gb", "mb") or days is None:
            continue
        service = str(r.get("service") or "")
        daily[service].append(gb / (1000 if unit == "mb" else 1))
        retention.setdefault(service, set()).add(days)
        refs.append(r["ref"])
    if not daily:
        return None
    stored = {s: sum(v) / len(v) * max(retention[s]) for s, v in daily.items()}
    modelled = sum(stored.values())
    billed = sum(line["quantity"] or 0 for line in storage) / max(1, len({line["day"] for line in storage}))
    protected = set(spec.get("protected_services", []))
    changes, freed = {}, 0.0
    for service, target in spec["targets"].items():
        if service in protected or service not in stored or len(retention[service]) != 1:
            continue
        current = max(retention[service])
        if target < current:
            freed += stored[service] * (1 - target / current)
            changes[service] = f"{current:g} -> {target:g} days"
    if not freed or not modelled:
        return None
    blocked = list(spec.get("checks", []))
    if not billed or abs(modelled - billed) / billed > .15:
        blocked.append("Modelled log storage differs from billed GB-days by more than 15%; confirm the billing scope first.")
    fraction = freed / modelled
    item = reports.measure(rid, "Shorten operational log retention", spec["change"], storage, fraction, spec["days"],
                           blocked, [line["ref"] for line in storage] + refs[:200] + spec.get("evidence", []),
                           "Stored GB = average daily log volume × retention days per service (log_volume.csv). "
                           "Saving share = freed stored GB / modelled stored GB, applied to billed log storage CHF and energy. "
                           "Audit and authentication logs keep their retention.")
    item["calculation_inputs"] = {"modelled_stored_gb": round(modelled), "billed_average_gb": round(billed),
                                  "freed_stored_gb": round(freed), "retention_changes": changes,
                                  "protected_services": sorted(protected)}
    return item


def additional_candidates(reports):
    a, d = reports.a, reports.d
    candidates = []

    def add(name, resource, rows, share, effort, change, evidence, method, energy_share=None, attribution_check=None):
        if not rows or not share:
            return
        item = reports.measure(resource, name, change, rows, min(.85, share), effort,
                               ["Requires scoped workload-owner review and a measured pilot"], evidence, method,
                               energy_fraction=energy_share)
        if item["chf"] or any(item["kg"]):
            if attribution_check:
                item["attribution_check"] = attribution_check
            candidates.append(item)
            return item
        return None

    reports.ci_attribution = ci_attribution(reports)
    by_meter = defaultdict(list)
    for month in reports.ci_attribution["rows"]:
        if month["optional_minutes"] and (month["recoverable_chf"] or any(month["recoverable_kg"] or [])):
            by_meter[month["meter"]].append(month)
    for meter, records in by_meter.items():
        ledger_rows = [r for r in reports.by_resource[meter] if r["unit"] == "runner-minute"]
        evidence = [ref for row in records for k in ("refs", "check_refs", "billing_refs") for ref in row[k]]
        item = reports.measure(meter, "Skip attested optional CI runs",
                               "Keep required checks and pilot change detection on the approved optional runs.",
                               ledger_rows, 0, 3, ["CI owner confirms retention of mandatory release and security checks."],
                               evidence, reports.ci_attribution["method"])
        item["chf"] = round(sum(row["recoverable_chf"] or 0 for row in records), 2)
        item["kg"] = [round(sum((row["recoverable_kg"] or [0, 0, 0])[i] for row in records), 5) for i in range(3)]
        item["kwh"] = [round(sum((row["recoverable_kwh"] or [0, 0, 0])[i] for row in records), 5) for i in range(3)]
        item["market_effect"] = merge_market_effects([row["market_effect"] for row in records])
        item["kg_market"] = item["market_effect"]["range"]
        candidates.append(item)

    ai = defaultdict(list)
    for row in d["ai_usage"]:
        if inside(row.get("date")):
            ai[a.rid(row.get("resource_id"))].append(row)
    routing = a.policy.get("small_model_routing", {})
    routed_share = natural(routing.get("routed_share"))
    routes = {(key(r["from_provider"]), key(r["from_model"])): r for r in routing.get("routes", [])}
    energy = a.factors["energy"]
    small_energy = energy["token-small"]["values"][1] / energy["token-large"]["values"][1]
    agent_runs = defaultdict(list)
    for run in d["ai_agent_runs"]:
        if inside(run.get("start")):
            agent_runs[key(run.get("agent"))].append(run)
    meters_by_tool = defaultdict(set)
    for meter, usage in ai.items():
        for row in usage:
            meters_by_tool[key(row.get("tool"))].add(meter)
    for rid, raw in ai.items():
        rows = reports.by_resource[rid]
        linked = {r["ref"]: r for r in rows}
        low_risk = [r for r in raw if key(r.get("task_type")) in ("summarise", "summarize", "translate", "classify") and key(r.get("model_class")) == "large"]
        subset = [linked[r["ref"]] for r in low_risk if r["ref"] in linked]
        ratio, targets = tariff_routing(a, low_risk, linked, routes) if routed_share else (None, set())
        if ratio is not None:
            item = add("Route routine requests to smaller models", rid, subset, routed_share * (1 - ratio), 4,
                "Benchmark approved routine tasks on a smaller model with fallback and quality monitoring.",
                [r["ref"] for r in subset] + [routing["source"]],
                f"Routine large-model rows repriced at the small-model tariff ({', '.join(sorted(targets))}) the gateway already bills, "
                f"for {routed_share:.0%} of the volume; the rest stays on the large model as quality fallback. Energy uses the small/large token factor ratio. "
                "Requires blind quality and privacy acceptance.",
                energy_share=routed_share * (1 - small_energy))
            transfers = {r["ref"] for r in low_risk
                         if (route := routes.get((key(r.get("provider")), key(r.get("model")))))
                         and key(route["to_provider"]) != key(r.get("provider"))}
            if item and transfers:
                matched = [r | {"kg_market": None, "market_residual_kg": None} if r["ref"] in transfers else r
                           for r in subset]
                item["market_effect"] = market_reduction(matched, item["energy_fraction"],
                                                        "Cross-provider AI routing needs destination hosting and procurement evidence.")
                item["kg_market"] = item["market_effect"]["range"]
            if item:
                item["market_effect"]["coverage"]["assumptions"].append(
                    "Same-provider AI routing assumes the existing hosting region and procurement scope remain unchanged.")
        else:
            add("Route routine requests to smaller models", rid, subset, .45, 4,
                "Benchmark approved routine tasks on a smaller model with fallback and quality monitoring.",
                [r["ref"] for r in subset], "Scenario reduces metered spend and energy on explicitly named routine large-model tasks by 45%. Requires blind quality and privacy acceptance.")
        cached = [linked[r["ref"]] for r in raw if (natural(r.get("tokens_in_cache")) or 0) > 0 and r["ref"] in linked]
        add("Increase safe prompt-cache reuse", rid, cached, .10, 3,
            "Reuse approved invariant prefixes with tenant isolation, expiration and measured cache-hit uplift.",
            [r["ref"] for r in cached], "Scenario recovers 10% of gateway spend with existing cache use. Validate actual token tariff and incremental hit rate.", energy_share=.03)
        tool = key(a.mapping.get(rid, {}).get("tool"))
        if tool and agent_runs.get(tool) and meters_by_tool[tool] == {rid}:
            billed = [r for r in raw if key(r.get("tool")) == tool and r["ref"] in linked]
            billed_days = {day(r["date"]) for r in billed}
            runs = [r for r in agent_runs[tool] if day(r["start"]) in billed_days]
            if tool == "report-agent":
                delivered = [r for r in runs if key(r.get("trigger")) == "schedule" and key(r.get("outcome")) == "delivered"]
                unopened = [r for r in delivered if str(r.get("report_opened")) == "0"]
                # Missing open events are unknown. Require repeated, explicit non-opens
                # on at least 30 distinct days and a majority of all scheduled deliveries.
                if len({day(r["start"]) for r in unopened}) >= 30 and len(unopened) > len(delivered) / 2:
                    check = "Ask Finance which reports support closing, audit or downstream processes, then pilot on-demand delivery for optional reports."
                    item = reports.measure(rid, "Review scheduled AI reports that go unopened",
                                           "Offer on-demand delivery or a digest for optional reports.", [], 0, 1,
                                           [check], [r["ref"] for r in delivered] + [r["ref"] for r in billed],
                                           f"{len(unopened)} of {len(delivered)} scheduled deliveries on dates with matching gateway usage were marked unopened. Opening telemetry does not capture forwarded copies or automated consumers.")
                    item["attribution_check"] = check
                    candidates.append(item)
            runs = [r for r in runs if natural(r.get("retries")) is not None]
            observed_days = {day(r["start"]) for r in runs}
            scope = [linked[r["ref"]] for r in billed if day(r["date"]) in observed_days]
            retried = [r for r in runs if natural(r["retries"]) > 0]
            share = .20 * len(retried) / max(1, len(runs))
            add("Reduce agent retry waste", rid, scope, share, 3,
                "Set task-specific retry budgets and preserve escalation and telemetry.",
                [r["ref"] for r in runs + scope],
                f"{len(retried)} of {len(runs)} {tool} runs retried on dates with matching gateway usage. "
                "Sensitivity applies 20% of that incidence to the matched usage. Per-retry costs are unknown.",
                attribution_check="Trace the extra tokens to avoidable retries and verify successful completion before changing retry limits.")

    views = defaultdict(list)
    for row in d["powerbi_usage"]:
        if inside(row.get("date")):
            views[a.rid(row.get("resource_id"))].append(row)
    for rid, rows in reports.by_resource.items():
        if not rows:
            continue
        report = views.get(rid, [])
        if report and all(natural(r.get("view_count")) == 0 and key(r.get("report_type")) == "operational" for r in report):
            add("Reduce unused report refreshes", rid, rows, .45, 2, "Switch eligible operational refreshes to owner-confirmed demand windows.",
                [r["ref"] for r in report + rows], "Scenario reduces metered refresh-related cost and energy by 45%; preserve closing, audit, and data-freshness needs.")
        storage = [r for r in rows if r["unit"] == "gb-day"]
        if storage and "logs" in rid and d["log_volume"] and a.policy.get("log_retention"):
            item = log_retention(reports, rid, storage, a.policy["log_retention"])
            if item:
                candidates.append(item)
        if storage and "logs" in rid and d["log_volume"]:
            add("Reduce duplicate log ingestion", rid, storage, .15, 3,
                "Reduce eligible duplicate debug events while retaining security and audit logging.",
                [r["ref"] for r in storage + d["log_volume"][:50]], "15% scenario on attributed log storage. No change to protected retention or incident visibility.")
        if storage and "backup" in rid and d["backup_chains"]:
            add("Consolidate redundant backup processing", rid, storage, .08, 4,
                "Reduce duplicate processing after successful restore and isolation tests while keeping required copies and retention.",
                [r["ref"] for r in storage + d["backup_chains"][:50]], "8% scenario on billed backup storage. Requires immutable-copy and retention evidence.")
        traffic = [r for r in rows if r["unit"] == "gb"]
        if traffic and key(a.mapping.get(rid, {}).get("tool")) == "web hosting and cdn" and d["web_traffic"]:
            web = [r for r in d["web_traffic"] if inside(r.get("time_utc")) and (natural(r.get("bot_share_pct")) or 0) <= 100]
            sampled = sum((natural(r.get("requests")) or 0) * (natural(r.get("sample_rate")) or 0) for r in web)
            bots = sum((natural(r.get("requests")) or 0) * (natural(r.get("sample_rate")) or 0) *
                       (natural(r.get("bot_share_pct")) or 0) / 100 for r in web)
            if sampled:
                add("Reduce avoidable automated web traffic", rid, traffic, .35 * bots / sampled, 2,
                    "Pilot response caching and owner-approved bot controls with accessibility and monitoring checks.",
                    [r["ref"] for r in traffic + web[:50]], "Scenario captures 35% of the sample-adjusted bot share. Confirm the matching bill and legitimate automated consumers.",
                    attribution_check="Match the traffic sample to this billed endpoint before estimating avoidable transfer.")
    for option in a.policy.get("region_options", []):
        rid, destination = option.get("resource"), option.get("destination")
        rows = [r for r in reports.by_resource[rid] if r["kwh"] is not None and r["region"] != destination
                and not reports.protection_day(rid, r["day"])]
        factor = a.factors["grid"].get(destination)
        effort = natural(option.get("days"))
        if not (rows and factor and effort and effort.is_integer() and option.get("source")):
            continue
        rate = natural(option.get("destination_cost_multiplier"))
        item = reports.measure(rid, "Move noncritical workloads to a lower-carbon region",
                               "Rehearse migration, validate contracts and data residency, and retain rollback capacity.",
                               rows, 0, int(effort), ["Requires a destination quote, residency clearance and load test"],
                                [r["ref"] for r in rows], f"Source: {option['source'].rstrip('.')}. Compare destination and origin factors at unchanged energy outside protected dates. No financial saving assumed without a quote.")
        b = item["baseline"]
        item["kg"] = [round(b["kg"][i] - b["kwh"][i] * factor["values"][i], 5) for i in range(3)]
        item["market_effect"] = market_relocation(a, rows, destination, 1, option.get("destination_provider", ""))
        item["kg_market"] = item["market_effect"]["range"]
        if rate is not None:
            item["chf"] = round(b["chf"] * (1 - rate), 2)
        item["implementation_chf"] += natural(option.get("migration_cost_chf")) or 0
        item["kg"].sort()
        if item["kg"][1] > 0:
            candidates.append(item)
    return candidates


DEFAULT_DAILY_RATE = 1100
PLAN_DECISIONS = frozenset(("candidate", "prerequisite"))


def implementation_cost(item, daily_rate=DEFAULT_DAILY_RATE):
    return item["implementation_chf"] + item["days"] * (daily_rate - DEFAULT_DAILY_RATE)


def measure_decisions(items):
    """Separate accountable evidence work from modeled implementation options."""
    by_id = {m["id"]: m for m in items}
    decisions = {}
    for m in by_id.values():
        baseline = m.get("baseline", {})
        market = m.get("kg_market")
        impacts = {"cost": m["chf"], "energy": m["kwh"][1], "co2Location": m["kg"][1],
                   "co2Market": market[1] if market is not None else None}
        status, reason, next_step = "no-benefit", "The current model shows no positive impact.", None
        if m["hard_blockers"]:
            status, reason = "protected", " ".join(m["hard_blockers"])
        elif m.get("quote_status") == "quote required":
            status, reason = "evidence-needed", "Savings are unquantified until procurement supplies a comparable quote."
            next_step = "Obtain a dated quote for the same billed scope and service level."
        elif m.get("attribution_check"):
            status, reason = "evidence-needed", "The available records do not establish how much of this resource's usage can be avoided."
            next_step = m["attribution_check"]
        elif any(v is not None and v > 0 for v in impacts.values()):
            status, reason = "candidate", "At least one modeled impact is positive."
            if m["chf"] > 0 and m.get("energy_fraction") == 0 and not any(
                    impacts[k] for k in ("energy", "co2Location", "co2Market")):
                reason = "The economic benefit comes from a contract or price change. Usage is assumed unchanged."
            elif m.get("cost_fraction") and not m["chf"] and not baseline.get("chf"):
                reason = "Modeled operational benefit on the covered activity. No attributable spend was established."
        elif m.get("cost_fraction") and baseline.get("missing_cost"):
            status, reason = "evidence-needed", "Missing billed amounts prevent an estimate of the proposed savings."
            next_step = "Reconcile the affected invoice lines with Finance."
        elif m.get("energy_fraction") and (baseline.get("missing_energy") or baseline.get("missing_carbon")):
            status, reason = "evidence-needed", "The affected usage lacks sufficient energy or emissions evidence."
            next_step = "Verify the affected meter and applicable emissions factors with the owner."
        elif any(values is not None and values[2] > 0 for values in (m["kwh"], m["kg"], market)):
            status, reason = "evidence-needed", "A benefit appears only in the optimistic case."
            next_step = "Pilot the measure and replace the uncertain input before booking savings."
        elif m.get("energy_fraction") and not baseline.get("lines", 1):
            status, reason = "evidence-needed", "No attributable activity is available for this scope."
            next_step = "Confirm the resource-to-meter mapping and collect activity data."
        decisions[m["id"]] = {"status": status, "reason": reason, "nextStep": next_step,
                               "scopedAnnualCostChf": baseline.get("chf") if m.get("quote_status") else None,
                               "benefits": [k for k, v in impacts.items() if v is not None and v > 0],
                               "tradeoffs": [k for k, v in impacts.items() if v is not None and v < 0]}

    dependent = dependency_closure(by_id, [i for i, d in decisions.items() if d["status"] == "candidate"])
    for ident in dependent:
        decision = decisions[ident]
        if decision["status"] == "no-benefit" and not decision["tradeoffs"]:
            decision.update(status="prerequisite", reason="Required by a measure with modeled benefits.")
    return decisions


def dependency_closure(items, roots):
    needed, pending = set(), list(roots)
    while pending:
        ident = pending.pop()
        if ident not in needed and ident in items:
            needed.add(ident)
            pending.extend(items[ident].get("requires", ()))
    return needed


def satisfiable_measures(items):
    """Resolve complete dependencies. Missing prerequisites and cycles stay out."""
    ready = set()
    while True:
        newly_ready = {m["id"] for m in items if m["id"] not in ready and set(m.get("requires", ())) <= ready}
        if not newly_ready:
            return ready
        ready.update(newly_ready)


def apply_policy(reports, item):
    a = reports.a
    p = a.policy.get("measure_rules", {}).get(item["id"], {})
    rid = item["resource"]
    scopes = {rid, *item.get("scopes", [])}
    item["protection"] = [r for r in a.policy.get("protection_register", [])
                          if scopes.intersection(r.get("resources", [])) or
                          (r.get("global_patch") and item.get("members"))]
    item["requires"] = p.get("requires", [])
    item["exclusive"] = p.get("exclusive_group")
    item["phase"] = p.get("phase", item.get("phase", "baseline-year follow-up"))
    item["hard_blockers"] = []
    identity = a.mapping.get(rid, {}) | a.inventory.get(rid, {})
    if (key(identity.get("environment")) in ("prod", "production") and item["name"] in
            ("Reduce cluster idle runtime", "Schedule GPU on demand", "Rightsize nonproduction VM", "Move noncritical workloads to a lower-carbon region")
            or any(r.get("always_on") and not (r["id"] == "production-availability" and item.get("availability_preserving"))
                   for r in item["protection"])):
        item["hard_blockers"].append("Continuous availability is protected.")
    if rid in a.collisions:
        item["hard_blockers"].append("Ambiguous resource identity.")
    if any(r.get("retention_lock") for r in item["protection"]) and "backup" in key(item["name"]):
        item["hard_blockers"].append("Protected retention and copy arrangements.")
    # Commercial capacity changes need to surface the protection of dependent workloads.
    # They carry separate service-equivalence and readiness evidence in case_measures.
    dependent = set(item.get("protected_dependencies", ()))
    item["protection"].extend(r for r in a.policy.get("protection_register", [])
                              if dependent.intersection(r.get("resources", [])) and r not in item["protection"])
    if item["hard_blockers"]:
        item["blockers"].extend(item["hard_blockers"])
    requires = p.get("migration_cost_chf", 0)
    item["implementation_chf"] += natural(requires) or 0
    factor = natural(p.get("first_year_fraction"))
    if factor is None:
        factor = item.get("first_year_fraction", 1)
    item["first_year_chf"] = round(item["chf"] * min(1, factor), 2)
    item["first_year_net_chf"] = round(item["first_year_chf"] - item["implementation_chf"], 2)
    item["requires_approval"] = bool(item["blockers"] and not item["hard_blockers"])
    item["status"] = "blocked" if item["hard_blockers"] else "needs a human decision" if item["blockers"] else "ok"
    return item
