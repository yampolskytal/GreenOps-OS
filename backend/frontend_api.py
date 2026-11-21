"""Adapter from the GreenOps workspace to the GreenOps OS frontend contract.

The frontend contract lives in src/lib/api/types.ts. Market observations use
the workspace ledger and modeled savings use the evidence-backed measure catalog.
"""
import calendar
import threading
from collections import Counter, defaultdict
from datetime import date, timedelta
from functools import cached_property
from pathlib import Path

from accounting import MarketSummary, market_reduction, merge_market_effects
from assistant_router import route_question
from bonus import forecast as baseline_forecast
from forecast_scenarios import (MAX_FORECAST_YEARS, FORECAST_HORIZONS, active_from, dashboard_forecast,
                                day_share, operational_growth, scale_effect)
from greenops import END, number
from planning import (DEFAULT_DAILY_RATE, PLAN_DECISIONS, dependency_closure, implementation_cost,
                      measure_decisions, satisfiable_measures)
from templates import BASE_NAME, MEASURE_NAME, tables
from response_cache import ResponseCache, encode, key_of
from runtime import recent_runtime

PERIOD = "Sep 2025 – Aug 2026"
COST_TARGET, CO2_TARGET, MAX_DAYS = 25.0, 40.0, 15
DEFAULT_RATE = DEFAULT_DAILY_RATE
LOCATIONS = {
    "ch": ("zurich", "Zurich area", "Switzerland", 47.37, 8.54),
    "de": ("frankfurt", "Frankfurt area", "Germany", 50.11, 8.68),
    "ie": ("dublin", "Dublin area", "Ireland", 53.35, -6.26),
    "eu": ("eu-mixed", "EU (AI & SaaS, mixed)", "EU", 50.5, 4.5),
    "unknown": ("eu-mixed", "EU (AI & SaaS, mixed)", "EU", 50.5, 4.5),
}
SERVICE = {"Cloud": "Cloud", "Servers": "Servers", "SaaS": "SaaS", "AI gateway": "AI", "AI subscriptions": "AI"}
MONTHLY_FILES = {"ai_subscriptions.csv", "saas_contracts.csv"}
DAILY_SERVER_FALLBACK = "server_metrics_weekly.csv"
WEEKLY_M365 = "extra/m365_usage.csv"


def mid(v):
    return v[1] if isinstance(v, (list, tuple)) else v


def rng(v):
    if isinstance(v, (list, tuple)):
        return {"low": v[0], "mid": v[1], "high": v[2]}
    return {"low": v, "mid": v, "high": v}


def fig_range(f):
    return {"low": f["low"] if f.get("low") is not None else f["value"], "mid": f["value"],
            "high": f["high"] if f.get("high") is not None else f["value"]}


def calc(title, f, kind, units, assumptions=(), limitations=()):
    inputs = f.get("inputs") or {}
    return {"title": title, "formula": f.get("formula", ""), "units": units, "kind": kind, "period": PERIOD,
            "inputs": [{"label": str(k), "value": str(v)[:200]} for k, v in list(inputs.items())[:12]],
            "sources": list(f.get("sources", []))[:20], "assumptions": list(assumptions), "limitations": list(limitations)}


def files_of(refs, limit=8):
    groups = defaultdict(list)
    for ref in refs:
        groups[ref.split(":")[0]].append(ref)
    return [{"source": name, "detail": f"{len(rows)} source rows, e.g. {', '.join(rows[:3])}"}
            for name, rows in sorted(groups.items(), key=lambda kv: -len(kv[1]))[:limit]]


def query(params):
    return {"from": params.get("from") or "2025-09", "to": params.get("to") or "2026-08",
            "department": params.get("department") or "all", "provider": params.get("provider") or "all"}


def market_coverage_text(coverage):
    share = coverage["coveragePct"]
    return (f"{share:.1f}% of modeled energy covered" if share is not None
            else "Coverage of modeled energy unavailable")


def market_calc(coverage, period, unit, kind="modeled"):
    return {"title": "Market-based emissions for covered activity",
            "formula": "Sum of covered energy × dated residual or attested supplier factors",
            "units": unit, "kind": kind, "period": period,
            "inputs": [{"label": "Covered energy", "value": f"{coverage['coveredKwh']:,.2f} kWh"},
                       {"label": "Modeled energy", "value": f"{coverage['modeledKwh']:,.2f} kWh"}],
            "sources": coverage["sources"], "factors": coverage["factors"],
            "assumptions": coverage["assumptions"],
            "limitations": ["Totals describe covered activity only.", *coverage["missingInputs"]]}


def market_observation(summary):
    result = summary.result()
    return {"co2KgMarket": round(result[1], 3) if result is not None else None,
            "co2KgMarketRange": rng(result) if result is not None else None,
            "marketCoverage": summary.coverage()}


def market_kpi(summary, period, units):
    result = summary.result()
    if result is None:
        return None
    cover = summary.coverage()
    return {"value": rng(result), "unit": "kg CO₂", "kind": "modeled",
            "calc": market_calc(cover, period, units), "coverage": market_coverage_text(cover),
            "marketCoverage": cover, "missingInputs": cover["missingInputs"],
            "procurementAssumptions": cover["assumptions"]}


class FrontendApi:
    def __init__(self, work):
        self.w, self.a, self.r = work, work.a, work.reports
        self.measures = {m["id"]: m for m in self.r.measures}
        self.category = {}
        for line in self.a.lines:
            self.category.setdefault(line["resource"], line["category"])
        # Responses are pure functions of this immutable workspace plus the key; a rebuilt
        # or imported dataset gets a new workspace, adapter and therefore an empty cache.
        self.responses = ResponseCache()

    @cached_property
    def decisions(self):
        decisions = measure_decisions(self.measures.values())
        for option in self.w.views.get("investment-options", []):
            replacement = option["replacement_test"]
            decision = decisions[option["id"]]
            if decision["status"] == "evidence-needed" and replacement:
                decision["replacement"] = {
                    "measureIds": replacement["replaces"],
                    "maxAnnualQuoteChf": replacement["maximum_annual_quote_chf"],
                    "remainingCo2GapKg": replacement["carbon_gap_kg_after_replacement"],
                    "couldMeetTargets": replacement["can_close_both_with_nonnegative_quote"],
                }
        return decisions

    # ---------- helpers
    def lines(self, q):
        return [l for l in self.a.lines
                if q["from"] <= l["month"] <= q["to"]
                and (q["department"] == "all" or l["department"] == q["department"])
                and (q["provider"] == "all" or l["provider"] == q["provider"])]

    def daily_slices(self, q, start, end):
        # A weekly M365 row can contribute to the first days of the selected month.
        ledger_query = q | {"from": (start - timedelta(days=6)).strftime("%Y-%m")}
        for line in self.lines(ledger_query):
            if not line["day"]:
                continue
            beginning = date.fromisoformat(line["day"])
            source = line["ref"].split(":")[0]
            span = (calendar.monthrange(beginning.year, beginning.month)[1]
                    if source in MONTHLY_FILES and beginning.day == 1
                    else min(7, (END - beginning).days) if source == WEEKLY_M365 else 1)
            # Server fallback already has one ledger row for each covered day.
            allocated = span > 1 or source == DAILY_SERVER_FALLBACK
            for offset in range(span):
                d = beginning + timedelta(days=offset)
                if start <= d <= end:
                    yield d, line, 1 / span, allocated

    def market_groups(self, q, dimensions):
        start = date.fromisoformat(q["from"] + "-01")
        year, month = map(int, q["to"].split("-"))
        end = date(year, month, calendar.monthrange(year, month)[1])
        grouped = {key: defaultdict(MarketSummary) for key in dimensions}
        for d, line, share, allocated in self.daily_slices(q, start, end):
            for key in dimensions:
                label = d.strftime("%Y-%m") if key == "month" else line[key] or "Unassigned"
                grouped[key][label].add(line, share, allocated)
        return grouped

    @cached_property
    def historical_market(self):
        return MarketSummary(self.a.lines)

    @cached_property
    def forecast_market_scope(self):
        return MarketSummary(self.a.lines, residual_only=True)

    def baseline(self):
        b = self.a.baseline
        return b["chf"], b["kg"][1]

    def kpi(self, title, key, kind, unit, assumptions=(), limitations=()):
        f = self.w.views["summary"]["figures"][key]
        return {"value": fig_range(f), "unit": unit, "kind": kind, "calc": calc(title, f, kind, f["unit"], assumptions, limitations),
                "coverage": f"{self.a.baseline['lines']} ledger lines; {self.a.baseline['missing_energy']} without an energy estimate."}

    def resource_location(self, resource):
        rows = self.r.by_resource.get(resource) or []
        region = Counter(r["region"] for r in rows).most_common(1)
        return LOCATIONS.get(region[0][0] if region else "unknown", LOCATIONS["unknown"])[0]

    def to_measure(self, m):
        level = "blocked" if m["hard_blockers"] else "review" if (m["blockers"] or m.get("requires_approval")) else "low"
        market = m.get("market_effect") or market_reduction([], 1)
        return {
            "id": m["id"], "title": m["name"], "description": m["method"], "resource": m["resource"], "change": m["change"],
            "service": {"licences": "SaaS & AI", "subscriptions": "SaaS & AI", "ai-gateway": "AI"}.get(
                m["resource"], SERVICE.get(self.category.get(m["resource"]), "Unclassified")),
            "effortPersonDays": m["days"], "savingsChf": m["chf"], "savingsKwh": mid(m["kwh"]),
            "savingsCo2KgLocation": mid(m["kg"]), "savingsCo2KgMarket": mid(market["range"]),
            "savingsCo2KgMarketRange": rng(market["range"]) if market["range"] is not None else None,
            "marketCoverage": market["coverage"],
            "risk": {"level": level, "why": "; ".join(m["hard_blockers"] or m["blockers"]) or m["status"],
                     "consequences": f"Status: {m['status']}. Phase: {m['phase']}.",
                     "protectionWindows": [p["source"] for p in m.get("protection", [])],
                     "conflicts": [*m.get("requires", []), *([f"Exclusive group: {m['exclusive']}"] if m.get("exclusive") else [])],
                     "approver": m.get("approval")},
            "evidence": files_of(m.get("evidence", [])),
            "assumptions": [f"Implementation CHF {m['implementation_chf']:,}; first-year net CHF {m['first_year_net_chf']:,}.",
                            f"Savings ranges: kWh {[round(x, 1) for x in m['kwh']]}, kg CO2e {[round(x, 1) for x in m['kg']]}."],
            "includable": self.decisions[m["id"]]["status"] in PLAN_DECISIONS,
            "decision": self.decisions[m["id"]],
        }

    # ---------- routes
    def overview(self, q):
        plan = self.w.plan
        market_months = self.market_groups(q, ["month"])["month"]
        months = defaultdict(lambda: [0.0, 0.0, 0.0])
        for l in self.lines(q):
            m = months[l["month"]]
            m[0] += l["chf"] or 0
            m[1] += mid(l["kwh"]) or 0
            m[2] += mid(l["kg"]) or 0
        blocked = [m for m in self.r.measures if m["hard_blockers"]]
        pending = [self.measures[i] for i in plan["pending_approvals"] if i in self.measures]
        risks = ([{"title": m["name"] + f" ({m['resource']})", "detail": "; ".join(m["hard_blockers"]), "level": "blocked"} for m in blocked[:3]]
                 + [{"title": m["name"] + f" ({m['resource']})", "detail": f"Approver: {m['approval']}. " + "; ".join(m["blockers"][:2]),
                     "level": "review"} for m in pending[:3]])
        monthly = []
        for month in sorted(months.keys() | market_months.keys()):
            values = months.get(month, [None] * 3)
            item = {"month": month, "status": "source-backed",
                    **{k: round(v, p) if v is not None else None for k, v, p in
                       zip(("costChf", "energyKwh", "co2Kg"), values, (2, 3, 3))}}
            item.update(market_observation(market_months[month]))
            item["evidence"] = {"co2KgMarket": market_calc(item["marketCoverage"], month, "kg CO₂e/month")}
            monthly.append(item)
        forecast_metrics = ["cost", "energy", "co2Location"]
        if self.forecast_market_scope.result() is not None:
            forecast_metrics.append("co2Market")
        return {
            "baselinePeriod": PERIOD,
            "cost": self.kpi("Total annual digital cost", "cost", "financial", "CHF"),
            "energy": self.kpi("Estimated energy", "energy", "estimated", "kWh"),
            "co2Location": self.kpi("Location-based CO₂", "carbon", "modeled", "kg CO₂"),
            "co2Market": market_kpi(self.historical_market, PERIOD, "kg CO₂e/year"),
            "marketCoverage": self.historical_market.coverage(),
            "monthly": monthly,
            "forecastSupport": [{"metric": m, "horizons": FORECAST_HORIZONS} for m in forecast_metrics],
            "topOpportunities": [m["id"] for m in sorted(plan["selected"], key=lambda m: -m["chf"])[:3]],
            "managementRisks": risks,
        }

    def breakdowns(self, q):
        lines = self.lines(q)
        groups = self.market_groups(q, ("department", "provider", "category", "tool"))

        def group(key):
            g = defaultdict(lambda: [0.0, 0.0, 0.0])
            for l in lines:
                row = g[l[key] or "Unassigned"]
                row[0] += l["chf"] or 0
                row[1] += mid(l["kg"]) or 0
                row[2] += mid(l["kwh"]) or 0
            for label in groups[key]:
                g.setdefault(label, [0.0, 0.0, 0.0])
            return sorted(({"label": k, "costChf": round(v[0], 2), "co2Kg": round(v[1], 3), "energyKwh": round(v[2], 3),
                            **market_observation(groups[key][k])}
                           for k, v in g.items()), key=lambda r: -r["costChf"])
        return {"byDepartment": group("department"), "byProvider": group("provider"), "byService": group("category"),
                "byTool": group("tool")[:25],
                "allocationRule": f"Direct costs via tags, cost centre or mapping; shared costs: {self.a.policy.get('shared_allocation', 'project_hours_then_fte')} (see allocation view)."}

    def resources(self, q):
        markets = self.market_groups(q, ("resource",))["resource"]
        period = f"{q['from']}–{q['to']}"
        ledger = defaultdict(list)
        for row in self.lines(q):
            ledger[row["resource"]].append(row)
        savings = defaultdict(float)
        flags = {}
        for m in self.r.measures:
            if m["chf"] > savings[m["resource"]]:
                savings[m["resource"]], flags[m["resource"]] = m["chf"], m["name"]
        telemetry = self.recent_runtime
        ids = dict.fromkeys([*self.a.inventory, *telemetry,
                             *(m["resource"] for m in self.r.measures if m["resource"] in self.r.by_resource)])
        out = []
        for rid in ids:
            inv = self.a.inventory.get(rid, {})
            rows = self.r.by_resource.get(rid, [])
            dept = Counter(r["department"] for r in rows).most_common(1)
            provider = inv.get("provider") or (rows[0]["provider"] if rows else "Other")
            department = dept[0][0] if dept else "Unassigned"
            if (q["department"] != "all" and department != q["department"]) or (q["provider"] != "all" and provider != q["provider"]):
                continue
            env = (inv.get("environment") or (rows[0]["environment"] if rows else "") or "prod").lower()
            item = {"id": rid, "name": rows[0]["tool"] if rows and rows[0]["tool"] else rid, "provider": provider,
                    "location": self.resource_location(rid),
                    "environment": "prod" if env.startswith("prod") else "dev" if env.startswith(("dev", "sbx", "sand")) else "test",
                    "department": department, "criticality": inv.get("criticality") or "medium",
                    "runtimeH30d": None,
                    **telemetry.get(rid, {}),
                    "idleCostChfYear": round(savings.get(rid, 0), 2)}
            if (vcpu := number(inv.get("vcpu"))) is not None:
                item["vcpu"] = vcpu
            if rid in flags:
                item["flag"] = flags[rid]
            scoped = ledger[rid]
            for field, key, label, unit, kind, formula in (
                ("cost", "chf", "Normalized cost", "CHF", "financial", "Sum of billed amounts normalized to CHF"),
                ("energy", "kwh", "Energy estimate", "kWh", "modeled", "Sum of ledger energy estimates"),
                ("co2Location", "kg", "Location-based CO₂e", "kg CO₂e", "modeled", "Σ line energy × regional grid factor"),
            ):
                known = [r for r in scoped if r[key] is not None]
                item[field] = None
                if known:
                    value = sum(r[key] for r in known) if key == "chf" else [sum(r[key][i] for r in known) for i in range(3)]
                    uncovered = len(scoped) - len(known)
                    missing = [f"{uncovered} ledger rows have no {label.lower()} value and are excluded."] if uncovered else []
                    item[field] = {"value": rng(value), "unit": unit, "kind": kind,
                                   "coverage": f"{len(known)} of {len(scoped)} ledger rows with values",
                                   "missingInputs": missing,
                                   "calc": {"title": f"{label} for {rid}", "formula": formula,
                                            "units": unit, "kind": kind, "period": period, "inputs": [],
                                            "sources": sorted({r["ref"].split(":")[0] for r in known}),
                                            "assumptions": [], "limitations": missing}}
            item["co2Market"] = market_kpi(markets[rid], period, "kg CO₂e over selected period")
            item["marketCoverage"] = markets[rid].coverage()
            out.append(item)
        return out

    @cached_property
    def recent_runtime(self):
        return recent_runtime(self.a)

    def locations(self, q):
        groups = defaultdict(list)
        for l in self.lines(q):
            groups[LOCATIONS.get(l["region"], LOCATIONS["unknown"])].append(l)
        out = []
        grid = self.a.factors["grid"]
        for (lid, label, country, lat, lng), rows in groups.items():
            region = next(k for k, v in LOCATIONS.items() if v[0] == lid)
            market = market_observation(MarketSummary(rows))
            out.append({"id": lid, "label": label, "country": country, "lat": lat, "lng": lng,
                        "resourceCount": len({r["resource"] for r in rows}),
                        "costChf": round(sum(r["chf"] or 0 for r in rows), 2),
                        "energyKwh": round(sum(mid(r["kwh"]) or 0 for r in rows), 3),
                        "co2KgLocation": round(sum(mid(r["kg"]) or 0 for r in rows), 3),
                        **market,
                        "gridKgPerKwh": rng(grid[region]["values"]),
                        "providers": [p for p, _ in Counter(r["provider"] for r in rows if r["provider"]).most_common(6)],
                        "risks": [market_coverage_text(market["marketCoverage"])]})
        return out

    def findings(self, q):
        def category(m):
            n, res = m["name"].lower(), m["resource"]
            return ("ai-licences" if "seat" in n or "licen" in n else "ai-models" if res.startswith("ai-") else
                    "logs" if "log" in n else "data-platform" if res.startswith("dp-") else "ci" if "build" in n or "ci" in res else
                    "redundancy" if "backup" in n or "region" in n else "reports" if "report" in n or "bi" in res else
                    "saas" if self.category.get(res) == "SaaS" else "servers")
        out = [{"id": f"F-{m['id']}", "title": m["name"], "description": m["method"], "resource": m["resource"],
                "category": category(m), "impactChfYear": m["chf"], "impactKwhYear": mid(m["kwh"]),
                "impactCo2KgYear": mid(m["kg"]), "evidence": files_of(m.get("evidence", [])),
                "assumptions": list(m["blockers"]), "risk": "blocked" if m["hard_blockers"] else "review" if m["blockers"] else "low",
                "action": m["change"], "measureId": m["id"], "decision": self.decisions[m["id"]]} for m in self.r.measures]
        contra = self.w.views["contradictions"]
        examples = defaultdict(list)
        for f in contra["findings"]:
            if len(examples[f["type"]]) < 3:
                examples[f["type"]].append(f)
        for kind, count in contra["counts"].items():
            ex = examples.get(kind, [])
            out.append({"id": f"F-C-{kind}", "title": kind.replace("_", " ").capitalize(), "description": f"{count} records flagged.",
                        "resource": ", ".join(sorted({str(e.get("scope") or e.get("ref", "").split(":")[0]) for e in ex}))[:120] or "ledger",
                        "category": "conflict", "impactChfYear": None, "impactKwhYear": None, "impactCo2KgYear": None,
                        "evidence": [{"source": e.get("ref", ""), "detail": str(e.get("decision") or e.get("detail") or "")[:200]} for e in ex],
                        "assumptions": [], "risk": "review", "action": "Review in Data quality."})
        return out

    def measure_list(self, q):
        return [self.to_measure(m) for m in self.r.measures]

    def resolve_selection(self, ids):
        eligible, excluded = {}, {}
        for i in dict.fromkeys(i for i in ids if isinstance(i, str)):
            m = self.measures.get(i)
            if not m:
                excluded[i] = "Unknown measure for this dataset."
                continue
            decision = self.decisions[i]
            if decision["status"] not in PLAN_DECISIONS:
                excluded[i] = decision["reason"]
            else:
                eligible[i] = m

        ready = satisfiable_measures(eligible.values())
        for i in sorted(eligible.keys() - ready):
            required = set(eligible[i].get("requires", ())) - ready
            excluded[i] = "Requires an eligible dependency chain including " + ", ".join(sorted(required)) + "."
        eligible = {i: m for i, m in eligible.items() if i in ready}

        while True:
            chosen, conflicts, scopes, groups = {}, {}, set(), set()
            for i, m in eligible.items():
                claimed = set(m.get("scopes") or [m["resource"]])
                group = m.get("exclusive")
                if claimed & scopes:
                    conflicts[i] = f"Overlaps another selected measure on {', '.join(sorted(claimed & scopes))}."
                elif group in groups:
                    conflicts[i] = f"Mutually exclusive group {group} already selected."
                else:
                    chosen[i] = m
                    scopes |= claimed
                    if group:
                        groups.add(group)
            valid = satisfiable_measures(chosen.values())
            needed = dependency_closure(chosen, [i for i in chosen if i in valid and
                                                 self.decisions[i]["status"] == "candidate"])
            dropped = (chosen.keys() - valid) or (chosen.keys() - needed)
            if not dropped:
                excluded.update(conflicts)
                return list(chosen.values()), [{"id": i, "reason": reason} for i, reason in excluded.items()]
            for i in sorted(dropped):
                required = set(chosen[i].get("requires", ())) - valid
                excluded[i] = ("Requires " + ", ".join(sorted(required)) + "." if required else
                               "This prerequisite belongs with a supported dependent measure.")
                del eligible[i]

    @staticmethod
    def plan_limits(body):
        budget = number(body.get("budgetChf", 16500))
        rate = number(body.get("chfPerPersonDay", DEFAULT_RATE))
        if budget is None or not 0 <= budget <= 16500 or rate is None or not 1 <= rate <= 100000:
            raise ValueError("Use a budget from CHF 0 to 16,500 and a positive daily implementation rate.")
        return budget, rate

    def simulate(self, q, body):
        budget, rate = self.plan_limits(body)
        chosen, excluded = self.resolve_selection(body.get("measureIds", []))
        base_chf, base_kg = self.baseline()
        chf = sum(m["chf"] for m in chosen)
        kwh = sum(mid(m["kwh"]) for m in chosen)
        kg = sum(mid(m["kg"]) for m in chosen)
        effects = [(m["id"], m.get("market_effect") or market_reduction([], 1)) for m in chosen]
        market = merge_market_effects([effect for _, effect in effects])
        market_savings = {"projectionRange": rng(market["projectionRange"]) if market["projectionRange"] is not None else None,
                          "partialMeasureIds": [mid for mid, effect in effects if effect["coverage"]["status"] == "partial"],
                          "unavailableMeasureIds": [mid for mid, effect in effects if effect["coverage"]["status"] == "unavailable"],
                          "forecastLimitedMeasureIds": [mid for mid, effect in effects if effect["projectionPartial"] or
                                                      effect["coverage"]["status"] == "unavailable"]}
        days = sum(m["days"] for m in chosen)
        effort_chf = sum(implementation_cost(m, rate) for m in chosen)
        first_year = sum(m.get("first_year_chf", m["chf"]) for m in chosen)
        baseline_high = self.a.baseline["kg"][2]
        conservative = sum(m["kg"][0] for m in chosen) / baseline_high * 100 if baseline_high else None
        cost_pct = chf / base_chf * 100 if base_chf else 0
        co2_pct = kg / base_kg * 100 if base_kg else 0
        constraints = [
            {"label": "CO₂ reduction (location-based)", "achieved": co2_pct, "target": CO2_TARGET, "unit": "%", "direction": "atLeast", "met": co2_pct >= CO2_TARGET},
            {"label": "Cost reduction per year", "achieved": cost_pct, "target": COST_TARGET, "unit": "%", "direction": "atLeast", "met": cost_pct >= COST_TARGET},
            {"label": "Implementation cost", "achieved": effort_chf, "target": budget, "unit": "CHF", "direction": "atMost", "met": effort_chf <= budget},
            {"label": "Person-days", "achieved": days, "target": MAX_DAYS, "unit": "PD", "direction": "atMost", "met": days <= MAX_DAYS},
        ]
        reasons = [] if chosen else ["No measures selected."]
        for c in constraints:
            if not c["met"]:
                reasons.append(f"{c['label']}: {c['achieved']:.1f}% is below the {c['target']}% target." if c["direction"] == "atLeast"
                               else f"{c['label']}: {round(c['achieved'])} exceeds the limit of {c['target']} {c['unit']}.")
        return {"savingsChf": round(chf, 2), "savingsKwh": round(kwh, 3), "savingsCo2Kg": round(kg, 3),
                "savingsCo2KgMarket": round(market["range"][1], 3) if market["range"] is not None else None,
                "savingsCo2KgMarketRange": rng(market["range"]) if market["range"] is not None else None,
                "marketCoverage": market["coverage"], "marketSavings": market_savings,
                "effortDays": days, "effortChf": effort_chf, "includedMeasureIds": [m["id"] for m in chosen],
                "firstYearGrossChf": round(first_year, 2), "firstYearNetChf": round(first_year - effort_chf, 2),
                "conservativeCo2Pct": conservative,
                "costHeadroomChf": round(chf - base_chf * COST_TARGET / 100, 2) if base_chf else None,
                "co2HeadroomKg": round(kg - base_kg * CO2_TARGET / 100, 3) if base_kg else None,
                "costReductionPct": cost_pct, "co2ReductionPct": co2_pct, "constraints": constraints,
                "feasible": bool(chosen) and all(c["met"] for c in constraints), "reasons": reasons, "excluded": excluded,
                "paybackMonths": effort_chf / chf * 12 if chf > 0 else None}

    @classmethod
    def optimize_inputs(cls, body):
        """Normalize an optimize request; equal tuples always produce equal results for one review state."""
        budget, rate = cls.plan_limits(body)
        days = min(MAX_DAYS, int(budget / rate * 2) / 2)
        objective = {"balanced": "midpoint", "cost": "first-year-net", "co2": "conservative"}.get(body.get("priority"), "midpoint")
        return rate, budget, days, objective

    def review_version(self):
        """Latest review journal entry for this run. Approvals and rejections change optimizer eligibility."""
        if not self.w.store:
            return None
        latest = self.w.store.history(self.w.run_id, "review", 1)
        return latest[0]["seq"] if latest else 0

    def optimize(self, q, body):
        rate, budget, days, objective = self.optimize_inputs(body)
        plan = self.w.package(budget, days, "planning", objective, daily_rate=rate)
        ids = [m["id"] for m in plan["selected"]]
        result = self.simulate(q, {"measureIds": ids, "budgetChf": budget, "chfPerPersonDay": rate})
        return {"measureIds": result["includedMeasureIds"], "result": result,
                "searchComplete": plan["optimum_proven"]}

    @cached_property
    def long_term_baseline(self):
        return baseline_forecast(self.a, MAX_FORECAST_YEARS, damp_growth=True)

    def forecast(self, q, metric, horizon, ids):
        if metric == "co2Market":
            return self.market_forecast(q, horizon, ids)
        key = {"cost": "chf", "energy": "kwh", "co2Location": "kg"}.get(metric)
        if not key:
            raise ValueError("Market-based forecasts are not supported by this backend.")
        model = self.long_term_baseline
        years = max(1, min(MAX_FORECAST_YEARS, horizon))
        measures, excluded = self.resolve_selection(ids) if ids else ([], [])
        points, future, drivers, scope_assumptions = dashboard_forecast(self.a, model, key, years, measures)
        units = {"chf": "CHF", "kwh": "kWh", "kg": "kg CO₂e"}[key]
        precision = 2 if key == "chf" else 3
        base = rng(self.a.baseline[key])
        annual = [{"year": 2026, "date": "2026-08-01", "periodLabel": PERIOD,
                   "baseline": base, "optimized": base, "observed": base["mid"]}]
        for entries in (points, future):
            for point in entries:
                for series in ("baseline", "optimized"):
                    point[series] = rng([round(x, precision) for x in point[series]])
        annual += future
        long_run = self.a.factors["growth"]["values"][1]
        limitations = ["Only one baseline year is observed. Long-run demand and prices are scenario assumptions."]
        limitations.extend(row["reason"] for row in excluded)
        methodology = {
            "title": "Timed forecast scenario", "kind": "forecast", "period": PERIOD, "units": units,
            "formula": "Seasonal baseline × compound growth + documented changes − dated recurring effects × affected workload growth + one-time CHF implementation",
            "sources": sorted({"Normalized baseline ledger", self.a.factors["growth"]["source"], *(d["source"] for d in drivers)}),
            "assumptions": ["Baseline growth converges to the configured long-run rate by year three. Recorded capacity changes use observed unit rates.",
                            "Continuing operational effects scale with their affected workload after year one. Contract and other cost-only savings stay at their modeled run-rate.",
                            "Unit prices and grid factors stay fixed unless the scenario records a change.", *scope_assumptions],
            "inputs": [], "limitations": limitations,
        }
        return {"metric": metric, "unit": units, "granularity": "monthly", "points": points, "annualTotals": annual,
                "growthAssumption": f"{model['describe'][key]}. Baseline growth converges to the configured {long_run:.1%}/year midpoint by year three.",
                "implementationTiming": "Savings start at recorded renewals or the modeled rollout date. The cost path includes one-time implementation.",
                "methodology": methodology, "drivers": drivers}

    def market_forecast(self, q, horizon, ids):
        historical = self.historical_market.result()
        base = self.forecast_market_scope.result()
        coverage = self.forecast_market_scope.coverage()
        scope_label = market_coverage_text(coverage) + " by the residual-mix scenario."
        growth = self.a.factors["growth"]
        sim = self.simulate(q, {"measureIds": ids}) if ids else None
        savings = sim["marketSavings"] if sim else {}
        delta = savings.get("projectionRange") if ids else rng(0.0)
        measures, _ = self.resolve_selection(ids) if ids else ([], [])
        scope_growth = operational_growth(self.a, measures)
        supported = [(m, effect["projectionRange"]) for m in measures
                     if (effect := m.get("market_effect")) and effect["coverage"]["status"] != "no-change"
                     and effect["projectionRange"] is not None]
        affected = savings.get("forecastLimitedMeasureIds", [])
        assumptions = ["Compound the configured activity growth on the fixed baseline-year residual-mix scope.",
                       "Hold the evidenced residual factors fixed for the scenario. No supplier contract renewal, new market coverage or dated market-intensity adjustment is assumed.",
                       "Apply supported recurring effects from rollout and scale them after year one using the affected workload's growth.",
                       "Use opposite range endpoints for baseline emissions and savings to bound remaining emissions. The physical lower bound is zero."]
        limitations = ["Annual scenario totals for the modeled residual-mix portion only. Uncovered energy and effects without comparable market factors are excluded."]
        if affected:
            limitations.append("Some selected measures have effects outside the residual-mix scenario: " + "; ".join(affected) + ".")
        if ids and delta is None:
            limitations.append("The selected plan has no supported market-based effect for this forecast scope.")
        if sim and sim["excluded"]:
            limitations.append("Excluded selections: " + "; ".join(row["id"] for row in sim["excluded"]) + ".")
        methodology = market_calc(coverage, PERIOD, "kg CO₂e/year", "forecast")
        assumptions += [f"{m.get('name', m['id'])}: continuing effect changes {rates[1]:+.1%}/year after year one, using {source}."
                        for m, _ in supported if m["id"] in scope_growth for rates, source in [scope_growth[m["id"]]]]
        methodology["formula"] = "Covered residual emissions × compound activity growth − supported effects × affected workload growth × rollout share"
        methodology["assumptions"] += assumptions
        methodology["sources"] = sorted({*methodology["sources"], growth["source"]})
        methodology["limitations"] += limitations
        points = []
        if base is not None:
            points.append({"year": 2026, "date": "2026-08-01", "periodLabel": PERIOD, "baseline": rng(base), "optimized": rng(base),
                           **({"observed": mid(historical)} if historical == base else {}),
                           "coverage": scope_label, "marketCoverage": coverage})
            for year in range(1, max(1, min(MAX_FORECAST_YEARS, horizon)) + 1):
                multipliers = [(1 + rate) ** year for rate in growth["values"]]
                projected = [round(value * factor, 3) for value, factor in zip(base, multipliers)]
                start = END.replace(year=END.year + year - 1)
                end = start.replace(year=start.year + 1)
                share = day_share(start, end, active_from(self.a))
                scaled = [0.0] * 3
                for m, values in supported:
                    for i, value in enumerate(scale_effect(values, scope_growth.get(m["id"], (None, None))[0], year - 1)):
                        scaled[i] += value
                remaining = None if delta is None else [
                    round(max(0, value - scaled[2 - i] * share), 3)
                    for i, value in enumerate(projected)
                ]
                points.append({"year": 2026 + year, "date": f"{2026 + year}-08-01", "periodLabel": f"Sep {2025 + year}–Aug {2026 + year}",
                               "baseline": rng(projected), "optimized": rng(remaining) if remaining is not None else None,
                               "coverage": scope_label, "marketCoverage": coverage})
        return {"metric": "co2Market", "unit": "kg CO₂e", "granularity": "annual", "points": points, "annualTotals": points,
                "growthAssumption": f"Fixed residual factor scenario, with annual compound activity growth of "
                                    f"{', '.join(f'{rate:.1%}' for rate in growth['values'])} (low, mid, high).",
                "implementationTiming": "Supported market-based effects are prorated from the modeled rollout date.",
                "methodology": methodology, "marketCoverage": coverage,
                "marketSavings": savings, "marketScopeLabel": scope_label if points else "No supported residual-mix forecast scope."}

    def daily(self, q):
        start = date.fromisoformat(q["from"] + "-01")
        y, m = map(int, q["to"].split("-"))
        end = date(y, m, calendar.monthrange(y, m)[1])
        days = defaultdict(lambda: {"costChf": None, "energyKwh": None, "co2Kg": None,
                                    "allocated": 0.0, "tools": defaultdict(float)})
        markets = defaultdict(MarketSummary)
        for d, l, share, allocated in self.daily_slices(q, start, end):
            markets[d].add(l, share, allocated)
            values = {"costChf": l["chf"], "energyKwh": mid(l["kwh"]), "co2Kg": mid(l["kg"])}
            row = days[d]
            for metric, value in values.items():
                if value is not None:
                    row[metric] = (row[metric] or 0) + value * share
            if values["co2Kg"] is not None:
                kg = values["co2Kg"] * share
                if allocated:
                    row["allocated"] += kg
                row["tools"][l["tool"] or l["resource"]] += kg
        cal = {r["date"]: r for r in self.a.data.get("business_calendar", [])}
        out = []
        d = start
        while d <= end:
            row = days.get(d, {})
            c = cal.get(d.isoformat(), {})
            holiday = c.get("public_holiday") or c.get("company_holidays")
            figures = {metric: round(row[metric], precision) if row.get(metric) is not None else None
                       for metric, precision in (("costChf", 2), ("energyKwh", 3), ("co2Kg", 3))}
            coverage = ("unavailable" if all(v is None for v in figures.values())
                        else "allocated" if row["allocated"] > (row["co2Kg"] or 0) / 2 else "measured")
            item = {"date": d.isoformat(), **figures, **market_observation(markets[d]),
                    "workday": c.get("workday") == "1" if c else d.weekday() < 5,
                    "coverage": coverage,
                    "contributors": [{"label": t, "co2Kg": round(v, 3)} for t, v in
                                     sorted(row["tools"].items(), key=lambda kv: -kv[1])[:4]] if row else []}
            if holiday:
                item["holiday"] = holiday
            out.append(item)
            d += timedelta(days=1)
        return out

    def data_quality(self, q):
        summary = self.w.views["summary"]
        per_file = defaultdict(Counter)
        for e in self.a.events:
            per_file[e["ref"].split(":")[0]][e["code"]] += 1
        coverage = {s["file"]: s for s in self.w.views["coverage"]["sources"]}
        datasets = []
        for s in summary["sources"]:
            name = s["file"]
            cov = coverage.get(name, {})
            by_month = cov.get("rows_by_baseline_month") or {}
            months_seen = [k for k, v in by_month.items() if v]
            codes = per_file.get(name, Counter())
            schema = s.get("schema") or {}
            status = ("error" if not s.get("present") else
                      "warning" if schema.get("missing_columns") or cov.get("months_without_observations") or codes.get("missing_cost") else "ok")
            datasets.append({"file": name, "kind": "core" if s.get("core") else "bonus", "rows": s.get("accepted", 0),
                             "coverage": f"{len(months_seen)}/12 baseline months" if by_month else "n/a",
                             "latest": max(months_seen) if months_seen else "",
                             "missing": codes.get("missing_cost", 0) + codes.get("energy_unestimated", 0),
                             "duplicates": codes.get("exact_duplicate", 0),
                             "conflicts": codes.get("allocation_conflict", 0) + codes.get("contract_version", 0),
                             "unmapped": len(schema.get("missing_columns") or []),
                             "drafts": codes.get("ai_output_imputed", 0), "status": status})
        contra = self.w.views["contradictions"]
        sources = defaultdict(set)
        for f in contra["findings"]:
            if len(sources[f["type"]]) < 4 and f.get("ref"):
                sources[f["type"]].add(f["ref"].split(":")[0])
        dataset = Path(self.a.path).resolve()
        official = Path(__file__).resolve().parent / "inputs" / "sprintd-basel-green-ai-data-main"
        label = "Official challenge data" if dataset == official else "Representative demo" if self.a.demo else dataset.name
        return {"version": self.w.run_id[:12], "datasetName": label, "asOf": summary["as_of"], "datasets": datasets,
                "conflicts": [{"title": f"{k.replace('_', ' ')} ({n})", "sources": sorted(sources.get(k, []))}
                              for k, n in contra["counts"].items()]}

    def bonus(self, q):
        diag = self.w.views["diagnostics"]
        replay = self.w.views["carbon-replay"]
        jobs = []
        for r in (replay.get("shifted_case_job"), replay.get("protected_case_job")):
            if r:
                jobs.append({"job": f"{r['job']} ({r['resource']}, {r['date']}, per replayed run)",
                             "window": "fixed" if r["window"].startswith("fixed") else "flexible",
                             "currentStart": r["current_start"], "suggestedStart": r.get("suggested_start") or r["current_start"],
                             "co2SavedKgYear": mid(r.get("kg_avoided") or [0, 0, 0])})
        pipelines = [{"label": c["repo"], "value": f"{c['flagged_cpu_h']:.0f} CPU-h flagged",
                      "detail": f"{c['runs']} runs, {c['no_change_nightly']} no-change nightlies, {c['reruns']} reruns on {c['runner']}"}
                     for c in diag.get("ci", [])]
        clusters = [{"name": g["label"], "members": len(g["members"]), "description": f"Centroid {g.get('centroid')}",
                     "outliers": g["members"][:6]} for g in (diag.get("clusters") or {}).get("groups", [])]
        models = defaultdict(lambda: [0.0, 0.0, ""])
        for r in self.a.data.get("ai_usage", []):
            if "2025-09" <= r["date"][:7] <= "2026-08":
                row = models[r["model"]]
                row[0] += sum(number(r.get(k)) or 0 for k in ("tokens_in", "tokens_out")) / 1e6
                row[1] += number(r.get("cost_chf")) or 0
                row[2] = r["provider"]
        total_cost = sum(v[1] for v in models.values()) or 1
        ai = [{"model": k, "provider": v[2], "tokensM": round(v[0], 2), "costChf": round(v[1], 2), "share": v[1] / total_cost}
              for k, v in sorted(models.items(), key=lambda kv: -kv[1][1])]
        seats = [{"product": k, "purchased": v["purchased"], "active": v["active"], "wasteChfMonth": v["unused_chf_per_month"]}
                 for k, v in self.w.answers["unused-seats"]["results"].items()]
        return {"carbonJobs": jobs, "pipelines": pipelines, "clusters": clusters, "aiModels": ai, "seats": seats}

    def chat(self, q, body):
        from assistant_agent import agent_for
        history = [m for m in (body.get("messages") or []) if isinstance(m, dict)][-20:]
        ids = body.get("planMeasureIds", [])
        return agent_for(self.w, self).answer(q, history, ids if isinstance(ids, list) else [])

    def chat_legacy(self, q, body):
        history = body.get("messages") or []
        question = next((m.get("content", "") for m in reversed(history) if m.get("role") == "user"), "")
        context = next((m.get("context") for m in reversed(history) if m.get("role") == "assistant" and m.get("context")), None)
        r = route_question(self.w, question, context)
        content = r.get("answer", "")
        result = r.get("result")
        evidence = []
        if isinstance(result, list):
            lines = []
            for row in result[:10]:
                if isinstance(row, dict) and "group" in row:
                    v = row.get("value")
                    lines.append(f"- **{row['group']}**: " + (f"{v[1]:,.2f} (range {v[0]:,.2f}–{v[2]:,.2f})" if isinstance(v, list) else f"{v:,.2f}" if isinstance(v, (int, float)) else str(v)))
                    evidence += [{"source": s, "detail": ", ".join(row.get("reference_sample", [])[:3])} for s in row.get("source_files", [])[:1]]
            if lines:
                content += "\n\n" + "\n".join(lines)
        elif isinstance(result, dict) and result.get("value") is not None:
            content += f"\n\n**{result['value']}** {result.get('unit', '')}"
        return {"role": "assistant", "content": content, "evidence": evidence[:8], "context": r.get("context"),
                "calculation": f"Answered by GreenOps ({r.get('assistant', 'local')}) from the run {self.w.run_id[:12]} ledger."}

    def export_baseline(self, q):
        csv = self.w.outputs[BASE_NAME]
        return {"filename": BASE_NAME, "csv": "﻿" + csv.lstrip("﻿"),
                "issues": ["Demo dataset — not a valid submission."] if self.a.demo else [], "submittable": not self.a.demo}

    def export_measures(self, q, body):
        ids = body.get("measureIds") or []
        sim = self.simulate(q, {"measureIds": ids})
        plan = dict(self.w.plan, selected=[self.measures[i] for i in sim["includedMeasureIds"]])
        csv = tables(self.a, plan, self.w.template_root)[MEASURE_NAME]
        issues = (["Demo dataset — not a valid submission."] if self.a.demo else []) + sim["reasons"] + [f"{e['id']}: {e['reason']}" for e in sim["excluded"]]
        return {"filename": MEASURE_NAME, "csv": "﻿" + csv.lstrip("﻿"), "issues": issues,
                "submittable": not self.a.demo and sim["feasible"] and not sim["excluded"]}


class UnknownRoute(LookupError):
    pass


_adapter_lock = threading.Lock()


def adapter(work):
    api = getattr(work, "_frontend_api", None)
    if api is None:
        # Concurrent first requests must share one adapter, otherwise each builds its own cache.
        with _adapter_lock:
            api = getattr(work, "_frontend_api", None)
            if api is None:
                api = work._frontend_api = FrontendApi(work)
    return api


def handle_get(work, route, params):
    api, q = adapter(work), query(params)
    routes = {"overview": api.overview, "breakdowns": api.breakdowns, "resources": api.resources, "locations": api.locations,
              "findings": api.findings, "measures": api.measure_list, "metrics/daily": api.daily,
              "data-quality": api.data_quality, "bonus": api.bonus, "exports/baseline": api.export_baseline}
    if route == "forecast":
        ids = [i for i in params.get("measureIds", "").split(",") if i]
        return api.forecast(q, params.get("metric", "cost"), int(params.get("horizon", 3)), ids)
    if route not in routes:
        raise UnknownRoute(route)
    return routes[route](q)


def handle_post(work, route, params, body):
    api, q = adapter(work), query(params)
    routes = {"simulation": api.simulate, "optimize": api.optimize, "chat": api.chat, "exports/measures": api.export_measures}
    if route not in routes:
        raise UnknownRoute(route)
    return routes[route](q, body)


# Routes whose results depend on external services or conversation state are never cached.
UNCACHED_POST = frozenset({"chat"})


def respond_get(work, route, params):
    """Serialized GET response and cache outcome. Raises UnknownRoute/ValueError like handle_get."""
    api, q = adapter(work), query(params)
    extra = ([params.get("metric", "cost"), params.get("horizon", "3"), params.get("measureIds", "")]
             if route == "forecast" else [])
    return api.responses.get_or_compute(key_of("GET", route, q, *extra),
                                        lambda: handle_get(work, route, params))


def respond_post(work, route, params, body):
    """Serialized POST response and cache outcome. Raises UnknownRoute/ValueError like handle_post."""
    api, q = adapter(work), query(params)
    if route in UNCACHED_POST:
        return encode(handle_post(work, route, params, body)), "bypass"
    if route == "optimize":
        # Key on the normalized inputs so equivalent requests (16500 vs 16500.0) coalesce,
        # and on the review journal so approvals or rejections invalidate the result.
        key = key_of("POST", route, q, *api.optimize_inputs(body), api.review_version())
    else:
        key = key_of("POST", route, q, body)
    return api.responses.get_or_compute(key, lambda: handle_post(work, route, params, body))


DEFAULT_BUDGET, DEFAULT_PRIORITIES = 16500, ("balanced", "cost", "co2")


def warm(work):
    """Precompute the Studio's default strategies and the official-period views in the background.

    Requests arriving meanwhile join the in-flight computation instead of repeating it.
    """
    def run():
        try:
            for priority in DEFAULT_PRIORITIES:
                respond_post(work, "optimize", {}, {"budgetChf": DEFAULT_BUDGET, "priority": priority,
                                                    "chfPerPersonDay": DEFAULT_RATE})
            for route in ("measures", "overview"):
                respond_get(work, route, {})
        except Exception as error:  # Warming is an optimization only; requests compute on demand.
            print(f"GreenOps cache warm-up skipped: {error}", flush=True)
    thread = threading.Thread(target=run, name="greenops-warm", daemon=True)
    thread.start()
    return thread
