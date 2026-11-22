"""Evidence-based diagnostics and recommendation scenarios."""
from collections import Counter, defaultdict
from statistics import mean

from engine.accounting import market_reduction
from engine.greenops import END, START, day, inside, key, month, natural, number, resource, total
from engine.planning import (DEFAULT_DAILY_RATE, PLAN_DECISIONS, additional_candidates, apply_policy,
                             contract_ticket, dependency_closure, implementation_cost, measure_decisions,
                             platform_tickets, satisfiable_measures)
from engine.case_measures import case_candidates
from engine.verification import evidence_record, required_number
from engine.records import fingerprint


class Reports:
    def __init__(self, analysis):
        self.a = analysis
        self.d = analysis.data
        self.by_resource = defaultdict(list)
        self.usage = defaultdict(list)
        self.metrics = defaultdict(list)
        self.metrics_by_week = defaultdict(list)
        self.tickets = defaultdict(list)
        for row in analysis.lines:
            self.by_resource[row["resource"]].append(row)
        for row in self.d["data_platform_usage"]:
            if inside(row.get("date")):
                self.usage[analysis.rid(row["resource_id"])].append(row)
        for row in self.d["server_metrics_weekly"]:
            if inside(row.get("week_start")):
                self.metrics[analysis.rid(row["server_id"])].append(row)
                self.metrics_by_week[day(row["week_start"])].append(row)
        for row in self.d["it_tickets"]:
            self.tickets[analysis.rid(row.get("resource_id"))].append(row)
        self.calendar = {day(r["date"]): r for r in self.d["business_calendar"]}
        self.protection_conflict = any(
            r["code"] in ("conflicting_key", "bad_encoding", "bad_row", "missing_key")
            and r["ref"].split(":")[0] in ("it_tickets.csv", "mapping_departments_tools.csv", "business_calendar.csv")
            for r in analysis.events
        )
        self.reconciliation = self.reconcile()
        self.cluster_mismatches = {r["scope"] for r in self.reconciliation if r["type"] == "Cluster node-hours mismatch"}
        self.measures = [apply_policy(self, r) for r in case_candidates(self, self.candidates() + additional_candidates(self))]
        for item in self.measures:
            item["review_fingerprint"] = fingerprint({k: v for k, v in item.items()})

    def ticket_evidence(self, rid):
        output = []
        for r in self.tickets[rid] + self.tickets[""]:
            untrusted = any(marker in key(r.get("description")) for marker in
                            ("ignore all previous instructions", "for ai assistants reading", "ignore system instructions"))
            output.append({"title": r.get("title"), "description": r.get("description"), "ref": r["ref"],
                           "status": r.get("status"), "use_as_approval": False, "instruction_like_text": untrusted})
        return output

    def authority(self, rid):
        return self.a.mapping.get(rid, {}).get("responsible_role") or "IT service owner and workload owner"

    def blockers(self, rid, environment, criticality):
        blocked = []
        if key(environment) not in ("test", "dev", "poc") or key(criticality) != "low":
            blocked.append("Requires confirmed low-criticality nonproduction scope")
        if platform_tickets(self, rid):
            blocked.append("Resource or applicable global tickets require protection-window review")
        if not all(self.a.sources[s]["accepted"] for s in ("it_tickets", "business_calendar", "mapping_departments_tools")):
            blocked.append("Protection evidence incomplete")
        if self.protection_conflict:
            blocked.append("Quarantined protection records require review")
        return blocked

    def measure(self, rid, name, change, rows, fraction, days, blocked, evidence, method,
                energy_fraction=None):
        baseline = total(rows)
        energy_fraction = fraction if energy_fraction is None else energy_fraction
        market = market_reduction(rows, energy_fraction)
        return {"id": name + ":" + rid, "resource": rid, "name": name, "change": change,
                "days": days, "implementation_chf": days * 1100, "chf": round(max(0, baseline["chf"]) * fraction, 2),
                "kwh": [round(x * energy_fraction, 5) for x in baseline["kwh"]],
                "kg": [round(x * energy_fraction, 5) for x in baseline["kg"]],
                "kg_market": market["range"], "market_effect": market,
                "baseline": baseline, "cost_fraction": fraction, "energy_fraction": energy_fraction,
                "blockers": blocked, "status": "human review" if blocked else "eligible for planning",
                "approval": self.authority(rid), "evidence": list(dict.fromkeys(evidence)),
                "method": method}

    def candidates(self):
        result = []
        contract_rows = {}
        for source, label in (("ai_subscriptions", "product"), ("saas_contracts", "contract")):
            grouped = contract_rows[source] = defaultdict(list)
            for r in self.d[source]:
                grouped["|".join(key(r.get(k)) for k in (label, "provider", "cost_center"))].append(r)
        for rid in sorted(set(self.usage) | set(self.a.inventory)):
            inv = self.a.inventory.get(rid, {})
            mapped = self.a.mapping.get(rid, {})
            platform = self.usage[rid]
            gpu = key(inv.get("type")) == "ml" or any(natural(r.get("gpu_avg_pct")) is not None for r in self.metrics[rid])
            rows = [r for r in self.by_resource[rid] if r["unit"] in
                    (("gpu-hour",) if gpu else ("node-hour",) if platform else ("vcpu-hour", "vcore-hour"))]
            if not rows or (not gpu and not platform and not self.metrics[rid]):
                continue
            environment = mapped.get("environment") or inv.get("environment")
            criticality = mapped.get("criticality") or inv.get("criticality")
            blocked = self.blockers(rid, environment, criticality)
            for field in ("environment", "criticality"):
                if key(mapped.get(field)) and key(inv.get(field)) and key(mapped[field]) != key(inv[field]):
                    blocked.append(f"Inventory and mapping disagree on {field}")
            if any(r["environment"] and r["environment"] != key(environment) for r in rows):
                blocked.append("Billing tags disagree with the proposed environment")
            evidence = [r["ref"] for r in rows + platform + self.metrics[rid]]
            evidence += [r["ref"] for r in (mapped, inv) if r]
            evidence += [r["ref"] for r in self.ticket_evidence(rid)]
            if gpu:
                fraction, days = .55, 3 if self.a.policy.get("case_measures") else 4
                removable = [line for line in rows if not self.protection_day(rid, line["day"])]
                name = "Schedule GPU on demand"
                change = "Use a job-triggered start and owner-approved idle cooldown with startup and rollback tests"
                blocked += ["GPU start latency, deadlines, model warmup and unattended stop require an owner-approved pilot"]
                method = "Scenario removes 55% of billed GPU-hours outside protected dates. GPU utilization alone cannot establish removable uptime."
                rows = removable
            elif platform:
                considered = [r for r in platform if not self.protection_day(rid, r["date"])]
                valid = [(natural(r.get("runtime_h")), natural(r.get("active_use_h"))) for r in considered]
                valid = [(run, active) for run, active in valid if run is not None and active is not None and 0 <= active <= run <= 24]
                runtime = sum(run for run, _ in valid)
                idle = sum(run - active for run, active in valid) / runtime if runtime else 0
                coverage = len(valid) / max(1, (END - START).days - (len(platform) - len(considered)))
                fraction, days = idle * .70, 4
                name = "Reduce cluster idle runtime"
                change = "Pilot an idle timeout after verifying job deadlines, then monitor failed jobs and restore the prior timeout if needed"
                if coverage < .85:
                    blocked.append("Valid monitoring covers less than 85% of baseline dates")
                if rid in self.cluster_mismatches:
                    blocked.append("Billed and observed node-hours disagree")
                if not self.a.sources["data_platform_jobs"]["accepted"]:
                    blocked.append("Job dependencies and fixed windows require manual confirmation")
                if any(day(r.get("date")) not in self.calendar for r in platform):
                    blocked.append("Calendar gaps prevent review of all monitored dates")
                bad = [r["ref"] for r in self.d["data_platform_jobs"] if self.a.rid(r.get("resource_id")) == rid
                       and (not key(r.get("time_window")).startswith("flexible") or key(r.get("status")) != "ok")]
                if bad:
                    blocked.append("Fixed, failed or ambiguous scheduled jobs need review")
                    evidence += bad
                method = f"{idle:.1%} of measured runtime outside protected dates was idle. Scenario captures 70% of that idle share at unchanged variable rates. Monitoring coverage {coverage:.1%}."
                rows = [line for line in rows if not self.protection_day(rid, line["day"])]
            else:
                weeks = self.metrics[rid]
                # Weekly peaks and corroborating RAM headroom are required.
                suitable = [r for r in weeks if all(natural(r.get(k)) is not None and natural(r[k]) <= limit
                                                    for k, limit in (("cpu_max_pct", 40), ("ram_avg_pct", 45)))]
                if len(suitable) < 40 or len(suitable) != len(weeks):
                    continue
                if natural(inv.get("ram_utilisation_30d_pct")) is None or natural(inv["ram_utilisation_30d_pct"]) > 45:
                    blocked.append("Inventory does not corroborate sustained memory headroom")
                fraction, days = .30, 3
                name = "Rightsize nonproduction VM"
                change = "Benchmark a smaller VM size and retain the current configuration for rollback"
                method = "30% reduction in variable compute charge and modeled energy. Validate RAM peaks, network, SKU pricing and service performance in the pilot."
            if fraction > 0:
                result.append(self.measure(rid, name, change, rows, fraction, days, blocked, evidence, method))
        for source in ("ai_subscriptions", "saas_contracts"):
            label = "product" if source == "ai_subscriptions" else "contract"
            for row in self.d[source]:
                if month(row.get("month")) != "2026-08":
                    continue
                bought, active = natural(row.get("licences_purchased")), natural(row.get("licences_active_30d"))
                if bought is None or active is None or bought <= active:
                    if bought is not None and active is not None and active > bought:
                        self.a.audit("seat_conflict", row["ref"], "Active seats exceed purchased seats")
                    continue
                rid = "|".join(key(row.get(k)) for k in (label, "provider", "cost_center"))
                history = self.by_resource[rid]
                same = [r for r in contract_rows[source][rid] if month(r.get("month")) in ("2026-06", "2026-07", "2026-08")]
                idle = [natural(r.get("licences_purchased")) - natural(r.get("licences_active_30d")) for r in same
                        if natural(r.get("licences_purchased")) is not None and natural(r.get("licences_active_30d")) is not None]
                removable = max(0, min(idle) - 2) if idle else 0
                if not removable:
                    continue
                blocked = []
                end, notice = day(row.get("contract_end")), natural(row.get("notice_period_days"))
                if not end or notice is None or end < self.a.as_of or (end - self.a.as_of).days < notice:
                    blocked.append("Renewal date or notice cannot be confirmed")
                if len(idle) != 3:
                    blocked.append("Three consistent monthly activity snapshots required")
                if self.tickets[rid] or self.tickets[resource(row.get(label))] or any(contract_ticket(row, t) for t in self.tickets[""]):
                    blocked.append("Contract or unscoped tickets need manual review")
                august = next((r for r in history if r["ref"] == row["ref"]), None)
                baseline_chf = total(history)["chf"]
                annual = 12 * (august["chf"] or 0) * removable / bought if august else 0
                renewal = evidence_record(self.a, "renewals", rid)
                if renewal and august and august["chf"] is not None:
                    if day(renewal.get("effective_date")) != end or not end:
                        raise ValueError(f"Renewal quote for {rid} must match the contract end date.")
                    annual = max(0, 12 * (august["chf"] - (bought - removable) *
                                          required_number(renewal, "chf_per_seat_month")))
                # Limit claimed run-rate savings to the normalized annual baseline spend.
                fraction = min(1, annual / baseline_chf) if baseline_chf > 0 else 0
                if fraction:
                    eligible_date = end.isoformat() if end else "a verified renewal date"
                    item = self.measure(rid, "Reduce unused seats", f"Confirm the named seats with the licence owner and remove up to {removable:g} at {eligible_date}",
                                               history, fraction, 1, blocked, [r["ref"] for r in same],
                                               "Minimum unused seats over June–August minus a two-seat buffer. Annual run rate = 12 × August CHF per seat × removable seats, capped at baseline spend. First-year cash savings depend on renewal timing.",
                                               energy_fraction=0)
                    item["removable_seats"] = removable
                    if end:
                        item["first_year_fraction"] = max(0, min(1, 1 - (end - self.a.as_of).days / 365))
                        item["effective_date"] = end.isoformat()
                    if renewal:
                        item["evidence"].append(renewal["source"])
                        item["method"] += " Dated quote scenario: 12 × (August CHF − retained seats × quoted CHF per seat per month)."
                    result.append(item)
        product_groups = defaultdict(list)
        for item in result:
            if item["name"] == "Reduce unused seats" and not item["blockers"]:
                product_groups[item["resource"].rsplit("|", 1)[0]].append(item)
        for product, items in sorted(product_groups.items()):
            if len(items) < 3:
                continue
            rid = product + "|bundle"
            evidence = [ref for item in items for ref in item["evidence"]]
            base_rows = [r for item in items for r in self.by_resource[item["resource"]]]
            timed = sum(item["chf"] * item.get("first_year_fraction", 1) for item in items)
            run_rate = round(sum(item["chf"] for item in items), 2)
            amount = total(base_rows)["chf"]
            if amount <= 0 or run_rate <= 0:
                continue
            bundle = self.measure(rid, "Coordinate seat reductions by contract",
                                  "Coordinate owner-confirmed seat removals across departments in one renewal workflow.",
                                  base_rows, min(1, run_rate / amount), 2,
                                  ["Requires procurement confirmation that these departments share one renewal process."],
                                  evidence, "Sum of independent covered department seat reductions. Two days assumes one shared renewal workflow, subject to procurement confirmation.",
                                  energy_fraction=0)
            bundle["scopes"] = [item["resource"] for item in items]
            bundle["first_year_fraction"] = timed / run_rate
            result.append(bundle)
        return result

    def protection_day(self, rid, date_value):
        date_ = day(date_value)
        if not date_:
            return True
        return any(
            rid in r.get("resources", []) and (
                (date_.month in r.get("months", []) and date_.day in r.get("days", []))
                or (day(r.get("from")) and day(r.get("through")) and day(r["from"]) <= date_ <= day(r["through"])))
            for r in self.a.policy.get("protection_register", [])
        )

    def optimize(self, budget=16500, days=15, mode="planning", objective="midpoint", reviews=None,
                 excluded_ids=(), daily_rate=DEFAULT_DAILY_RATE):
        """Exact branch-and-bound on eligible, disjoint scopes, with a bounded proof budget."""
        b = self.a.baseline
        reviews = reviews or {}
        excluded_ids = frozenset(excluded_ids)
        decisions = measure_decisions(self.measures)

        def gains(item):
            cash = item["chf"]
            if objective in ("first-year", "first-year-net"):
                cash = item["first_year_chf"]
            if objective == "first-year-net":
                cash -= implementation_cost(item, daily_rate)
            i, j = (0, 2) if objective == "conservative" else (1, 1)
            return (cash / (b["chf"] * .25) if b["chf"] > 0 else 0,
                    item["kg"][i] / (b["kg"][j] * .40) if b["kg"][j] > 0 else 0)
        def score(cost, carbon, used, spend, count):
            return min(cost, carbon, 1), cost + carbon, -used, -spend, -count
        def permitted(item):
            review = reviews.get(item["id"], {})
            approved = (review.get("decision") == "approved" and
                        review.get("fingerprint") == item["review_fingerprint"])
            if (decisions[item["id"]]["status"] not in PLAN_DECISIONS or item["id"] in excluded_ids or
                    (review.get("decision") == "rejected" and review.get("fingerprint") == item["review_fingerprint"])):
                return False
            return (approved if mode == "approved" else
                    (mode == "conditional" or self.a.policy.get("case_measures") or not item["blockers"] or approved))
        allowed = [r for r in self.measures if permitted(r) and r["days"] <= days and
                   implementation_cost(r, daily_rate) <= budget]
        ready = satisfiable_measures(allowed)
        available = {r["id"]: r for r in allowed if r["id"] in ready}
        active = dependency_closure(available, [i for i, r in available.items() if max(gains(r)) > 0])
        items = sorted((available[i] for i in active), key=lambda r: (-sum(gains(r)) / max(.5, r["days"]), r["id"]))
        gain = [gains(r) for r in items]
        # A relaxed knapsack upper bound ignores conflicts and CHF, while
        # preserving person-days. Bound the two objectives independently.
        capacity = round(days * 2)
        suffix = [[(0.0, 0.0)] * (capacity + 1) for _ in range(len(items) + 1)]
        for i in range(len(items) - 1, -1, -1):
            effort = round(items[i]["days"] * 2)
            for remaining in range(capacity + 1):
                skip = suffix[i + 1][remaining]
                suffix[i][remaining] = tuple(max(x, y + z) for x, y, z in zip(skip, gain[i], suffix[i + 1][remaining - effort])) if effort <= remaining else skip
        best, best_items = score(0, 0, 0, 0, 0), []
        visited = 0
        stack = [(0, 0, 0, 0, 0, (), frozenset(), frozenset())]
        while stack and visited < 100000:
            i, used, spend, cost, carbon, selected, scopes, exclusive = stack.pop()
            visited += 1
            current = score(cost, carbon, used, spend, len(selected))
            selected_ids = {r["id"] for r in selected}
            if current > best and all(set(r["requires"]) <= selected_ids for r in selected):
                best, best_items = current, selected
            if i == len(items):
                continue
            c, g = suffix[i][round((days - used) * 2)]
            if score(cost + c, carbon + g, used, spend, len(selected)) < best:
                continue
            item = items[i]
            stack.append((i + 1, used, spend, cost, carbon, selected, scopes, exclusive))
            group = item["exclusive"]
            claimed = set(item.get("scopes") or [item["resource"]])
            item_cost = implementation_cost(item, daily_rate)
            if (not claimed & scopes and (not group or group not in exclusive) and
                    used + item["days"] <= days and spend + item_cost <= budget):
                stack.append((i + 1, used + item["days"], spend + item_cost,
                              cost + gain[i][0], carbon + gain[i][1], selected + (item,),
                              scopes | claimed, exclusive | {group} if group else exclusive))
        savings = total(best_items)
        # Measures use the same shape for savings as the baseline lines.
        cost_pct = savings["chf"] / b["chf"] if b["chf"] > 0 else None
        co2_pct = savings["kg"][1] / b["kg"][1] if b["kg"][1] > 0 else None
        conservative = savings["kg"][0] / b["kg"][2] if b["kg"][2] > 0 else None
        days_used = sum(r["days"] for r in best_items)
        spent = sum(implementation_cost(r, daily_rate) for r in best_items)
        first_year = round(sum(r["first_year_chf"] for r in best_items), 2)
        chosen = [r | {"requires_approval": r.get("requires_approval", False) and not
                       (reviews.get(r["id"], {}).get("decision") == "approved" and
                        reviews.get(r["id"], {}).get("fingerprint") == r["review_fingerprint"])} for r in best_items]
        return {"selected": chosen, "excluded": [r for r in self.measures if r not in best_items],
                "pending_approvals": [r["id"] for r in chosen if r["requires_approval"]],
                "capacity_remaining": {"days": days - days_used, "chf": budget - spent},
                "catalog_upper_bound": {"chf": round(suffix[0][capacity][0] * b["chf"] * .25, 2) if objective == "midpoint" else None,
                                        "kg": round(suffix[0][capacity][1] * b["kg"][1] * .40, 4) if objective == "midpoint" else None,
                                        "method": "Independent optimistic bound by effort only. Overlap and CHF can only lower the achievable totals."},
                "budget_chf": budget, "day_limit": days, "spent_chf": spent, "days": days_used,
                "savings": {k: savings[k] for k in ("chf", "kwh", "kg")},
                "first_year_chf": first_year, "first_year_net_chf": round(first_year - spent, 2),
                "mode": mode, "objective": objective, "objective_attainment": list(best[:2]),
                "cost_fraction": cost_pct, "carbon_fraction": co2_pct, "conservative_carbon_fraction": conservative,
                "target_met": cost_pct is not None and co2_pct is not None and cost_pct >= .25 and co2_pct >= .40,
                "cost_gap_chf": max(0, b["chf"] * .25 - savings["chf"]),
                "carbon_gap_kg": max(0, b["kg"][1] * .40 - savings["kg"][1]),
                "states_checked": visited, "optimum_proven": not stack,
                "method": "Maximize the lower share of the two objectives, capped at target attainment. Then maximize combined attainment and break ties by less effort, lower implementation cost and fewer measures. Overlapping scopes are excluded and dependencies must be satisfied."}

    def reconcile(self):
        led = defaultdict(list)
        events = []
        for line in self.a.lines:
            if line["category"] == "Cloud" and line["ref"].split(":")[0] != "data_platform_usage.csv":
                led[line["month"], "all-cloud"].append(line["chf"])
                led[line["month"], key(line["provider"])].append(line["chf"])
        for r in self.d["provider_monthly_report"]:
            actual = number(r.get("total_cost_chf"))
            if not inside(r.get("month")) or actual is None:
                continue
            period = month(r["month"])
            scope = self.a.policy.get("provider_report_scope", {}).get(r.get("label"), "all-cloud")
            raw = led[period, key(scope)]
            observed = round(sum(v for v in raw if v is not None), 2) if raw else None
            comparable = raw and None not in raw
            events.append({"type": "Cloud report comparison", "ref": r["ref"], "period": period, "scope": r.get("label"),
                           "comparison_scope": scope, "scope_attested": r.get("label") in self.a.policy.get("provider_report_scope", {}),
                           "reported_chf": actual, "observed_chf": observed, "missing_cost_lines": raw.count(None),
                           "delta_chf": round(actual - observed, 2) if comparable else None,
                           "decision": "Compare normalized cloud detail within the listed scope. Confirm scope where unattested and verify credits before any adjustment."})
        gateway, invoice = defaultdict(list), defaultdict(list)
        costs = {r["ref"]: r["chf"] for r in self.a.lines if r["category"] == "AI gateway"}
        for source, target in (("ai_usage", gateway), ("ai_invoice_monthly", invoice)):
            for r in self.d[source]:
                d = r.get("month") or r.get("date")
                if not inside(d):
                    continue
                ident = (month(d), key(r.get("provider")), key(r.get("model_class")))
                amount = (costs.get(r["ref"]) if source == "ai_usage" else
                          self.a.chf(r.get("amount"), r.get("currency"), ident[0], r["ref"]))
                target[ident].append((r, amount))
        for ident in sorted(set(gateway) | set(invoice)):
            period, provider, model = ident
            lhs, rhs = gateway[ident], invoice[ident]
            if not rhs and not self.a.sources["ai_invoice_monthly"]["present"]:
                continue
            def observed(records):
                return round(sum(v for _, v in records), 2) if records and all(v is not None for _, v in records) else None
            a, b = observed(lhs), observed(rhs)
            def tokens(records, name):
                vals = [natural(r.get(name)) for r, _ in records]
                return sum(vals) if vals and None not in vals else None
            event = {"type": "AI invoice vs gateway", "period": period, "scope": f"{provider} / {model}",
                     "reported_chf": b, "observed_chf": a, "delta_chf": round(b - a, 2) if a is not None and b is not None else None,
                     "refs": [r["ref"] for r, _ in lhs + rhs],
                     "decision": "Gateway attributed spend stays in the baseline. Finance reviews billing gaps and scope before any restatement."}
            for field in ("tokens_in", "tokens_out"):
                x, y = tokens(lhs, field), tokens(rhs, field)
                event[field + "_delta"] = y - x if x is not None and y is not None else None
            events.append(event)
        # Compare telemetry runtime with invoice quantities on matched cluster-days.
        billed = defaultdict(float)
        for line in self.a.lines:
            if line["unit"] == "node-hour" and line["quantity"] is not None and line["ref"].startswith("azure_costs.csv:"):
                billed[line["resource"], line["day"]] += line["quantity"]
        for rid, rows in self.usage.items():
            for r in rows:
                runtime, nodes = natural(r.get("runtime_h")), natural(r.get("node_count"))
                identity = (rid, day(r["date"]).isoformat())
                if runtime is None or nodes is None or identity not in billed:
                    continue
                estimated, invoiced = runtime * nodes, billed[identity]
                if abs(estimated - invoiced) > max(1, invoiced * .05):
                    events.append({"type": "Cluster node-hours mismatch", "ref": r["ref"], "scope": rid,
                                   "period": identity[1], "reported_node_hours": invoiced, "observed_node_hours": estimated,
                                   "decision": "Billing drives energy. Review scaling and runtime before using this row to schedule work."})
        return events

    def answers(self):
        seats = defaultdict(lambda: {"purchased": 0, "active": 0, "unused": 0, "unused_chf_per_month": 0, "unpriced_unused": 0, "unknown_activity_rows": 0, "refs": []})
        amounts = {r["ref"]: r["chf"] for r in self.a.lines if r["category"] == "AI subscriptions"}
        for row in self.d["ai_subscriptions"]:
            if month(row.get("month")) != "2026-08":
                continue
            bucket = seats[row["product"]]
            bucket["refs"].append(row["ref"])
            bought, active = natural(row.get("licences_purchased")), natural(row.get("licences_active_30d"))
            bucket["purchased"] += bought or 0
            bucket["active"] += active or 0
            if bought is None or active is None or active > bought:
                bucket["unknown_activity_rows"] += 1
                continue
            unused = bought - active
            bucket["unused"] += unused
            amount = amounts.get(row["ref"])
            if amount is not None and bought:
                bucket["unused_chf_per_month"] += amount * unused / bought
            elif unused:
                bucket["unpriced_unused"] += unused
        for bucket in seats.values():
            bucket["unused_chf_per_month"] = round(bucket["unused_chf_per_month"], 2)
        gpu = []
        for r in self.measures:
            if r["name"] != "Schedule GPU on demand":
                continue
            metrics = self.metrics[r["resource"]]
            available = [natural(m.get("gpu_avg_pct")) for m in metrics]
            values = [n for n in available if n is not None]
            gpu.append({**r, "mean_weekly_gpu_pct": round(mean(values), 2) if values else None,
                        "weeks_with_gpu_metric": len(values),
                        "inventory": self.a.inventory.get(r["resource"]),
                        "ticket_evidence": self.ticket_evidence(r["resource"])})
        prod = []
        production_ids = {rid for rid in self.usage if rid == "dp-prod" or key(self.a.mapping.get(rid, {}).get("environment")) == "prod"}
        if "dp-prod" in self.a.mapping or "dp-prod" in self.tickets:
            production_ids.add("dp-prod")
        for rid in sorted(production_ids):
            rows = self.usage[rid]
            active_nonwork = [r["ref"] for r in rows if (natural(r.get("active_use_h")) or 0) > 0
                              and self.calendar.get(day(r["date"]), {}).get("workday") == "0"]
            jobs = [r for r in self.d["data_platform_jobs"] if resource(r.get("resource_id")) == rid]
            windows = Counter(str(r.get("time_window") or "unknown") for r in jobs)
            prod.append({"resource": rid, "decision": "Keep running pending owner review of protection windows",
                         "approver": self.authority(rid), "active_nonworkday_refs": active_nonwork,
                         "calendar_joined_days": sum(day(r["date"]) in self.calendar for r in rows),
                         "ticket_evidence": self.ticket_evidence(rid), "recorded_job_windows": dict(windows),
                         "required_windows": [p for p in self.a.policy.get("protection_register", []) if rid in p.get("resources", [])],
                         "sample_jobs": jobs[:10]})
        return {
            "unused-seats": {"title": "Unused AI seats in August 2026", "results": dict(seats),
                             "method": "Use unique Final rows. Unused = purchased − active per row. Cost = unused share of the final CHF bill. Missing activity and missing pricing are shown separately.",
                             "sources": ["ai_subscriptions.csv", "exchange_rates.csv"]},
            "gpu": {"title": "On-demand GPU operation", "results": gpu,
                    "method": "Scenario only. Billed GPU-hours × removable share × GPU coefficient × PUE × local grid intensity. Compare invoice, utilization and ticket evidence.",
                    "sources": ["azure_costs.csv", "server_inventory.csv", "server_metrics_weekly.csv", "it_tickets.csv"]},
            "production": {"title": "Production protection windows", "results": prod,
                           "method": "Daily activity establishes work on nonworkdays. Ticket text and scheduler windows are shown verbatim for review. Daily totals provide no hourly clearance.",
                           "sources": ["data_platform_usage.csv", "business_calendar.csv", "it_tickets.csv", "mapping_departments_tools.csv", "extra/data_platform_jobs.csv"]},
        }
