"""Adapter from the GreenOps workspace to the GreenOps OS frontend contract.

The frontend (src/lib/api/types.ts) calls `/api/v2/<route>` when VITE_API_BASE_URL
points at this server. Every figure here comes from the workspace ledger, measure
catalog or reports; this module only reshapes and filters, it never invents values.
"""
import calendar
from collections import Counter, defaultdict
from datetime import date, timedelta

from assistant_router import route_question
from templates import BASE_NAME, MEASURE_NAME, tables

PERIOD = "Sep 2025 – Aug 2026"
COST_TARGET, CO2_TARGET, MAX_DAYS = 25.0, 40.0, 15
DEFAULT_RATE = 1100
LOCATIONS = {
    "ch": ("zurich", "Zurich area", "Switzerland", 47.37, 8.54),
    "de": ("frankfurt", "Frankfurt area", "Germany", 50.11, 8.68),
    "ie": ("dublin", "Dublin area", "Ireland", 53.35, -6.26),
    "eu": ("eu-mixed", "EU (AI & SaaS, mixed)", "EU", 50.5, 4.5),
    "unknown": ("eu-mixed", "EU (AI & SaaS, mixed)", "EU", 50.5, 4.5),
}
SERVICE = {"Cloud": "Cloud", "Servers": "Servers", "SaaS": "SaaS", "AI gateway": "AI", "AI subscriptions": "AI"}
MONTHLY_FILES = {"ai_subscriptions.csv", "saas_contracts.csv"}
WEEKLY_FILES = {"server_metrics_weekly.csv"}


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


class FrontendApi:
    def __init__(self, work):
        self.w, self.a, self.r = work, work.a, work.reports
        self.measures = {m["id"]: m for m in self.r.measures}
        self.category = {}
        for line in self.a.lines:
            self.category.setdefault(line["resource"], line["category"])
        self.cache = {}

    # ---------- helpers
    def lines(self, q):
        return [l for l in self.a.lines
                if q["from"] <= l["month"] <= q["to"]
                and (q["department"] == "all" or l["department"] == q["department"])
                and (q["provider"] == "all" or l["provider"] == q["provider"])]

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
        return {
            "id": m["id"], "title": m["name"], "description": m["method"], "resource": m["resource"], "change": m["change"],
            "service": SERVICE.get(self.category.get(m["resource"]), "Cloud"),
            "effortPersonDays": m["days"], "savingsChf": m["chf"], "savingsKwh": mid(m["kwh"]),
            "savingsCo2KgLocation": mid(m["kg"]), "savingsCo2KgMarket": mid(m["kg_market"]) if m.get("kg_market") else 0,
            "risk": {"level": level, "why": "; ".join(m["hard_blockers"] or m["blockers"]) or m["status"],
                     "consequences": f"Status: {m['status']}. Phase: {m['phase']}.",
                     "protectionWindows": [p["source"] for p in m.get("protection", [])],
                     "conflicts": [*m.get("requires", []), *([f"Exclusive group: {m['exclusive']}"] if m.get("exclusive") else [])],
                     "approver": m.get("approval")},
            "evidence": files_of(m.get("evidence", [])),
            "assumptions": [f"Implementation CHF {m['implementation_chf']:,}; first-year net CHF {m['first_year_net_chf']:,}.",
                            f"Savings ranges: kWh {[round(x, 1) for x in m['kwh']]}, kg CO2e {[round(x, 1) for x in m['kg']]}."],
            "includable": not m["hard_blockers"],
        }

    # ---------- routes
    def overview(self, q):
        plan = self.w.plan
        cover = self.w.views["summary"]["footprint_coverage"]
        b = self.a.baseline
        market = None
        if b.get("kg_market"):
            market = {"value": rng(b["kg_market"]), "unit": "kg CO₂", "kind": "modeled",
                      "calc": {"title": "Market-based CO₂ (bonus)", "formula": "Σ covered energy × residual-mix or attested supplier factor",
                               "units": "kg CO2e/year", "kind": "modeled", "period": PERIOD, "inputs": [],
                               "sources": ["factors.json market_grid", "market-breakdown"], "assumptions": [],
                               "limitations": [f"{b['missing_market']} metered rows lack market factors."]},
                      "coverage": f"{cover['market_coverage'] * 100:.0f}% of modeled kWh covered by market factors.",
                      "missingInputs": [f"{b['missing_market']} rows without market factor"]}
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
        return {
            "baselinePeriod": PERIOD,
            "cost": self.kpi("Total annual digital cost", "cost", "financial", "CHF"),
            "energy": self.kpi("Estimated energy", "energy", "estimated", "kWh"),
            "co2Location": self.kpi("Location-based CO₂", "carbon", "modeled", "kg CO₂"),
            "co2Market": market,
            "monthly": [{"month": k, "costChf": round(v[0], 2), "energyKwh": round(v[1], 3), "co2Kg": round(v[2], 3),
                         "status": "source-backed"} for k, v in sorted(months.items())],
            "forecastSupport": [{"metric": m, "horizons": [1, 2, 3]} for m in ("cost", "energy", "co2Location")],
            "topOpportunities": [m["id"] for m in sorted(plan["selected"], key=lambda m: -m["chf"])[:3]],
            "managementRisks": risks,
        }

    def breakdowns(self, q):
        def group(key):
            g = defaultdict(lambda: [0.0, 0.0, 0.0])
            for l in self.lines(q):
                row = g[l[key] or "Unassigned"]
                row[0] += l["chf"] or 0
                row[1] += mid(l["kg"]) or 0
                row[2] += mid(l["kwh"]) or 0
            return sorted(({"label": k, "costChf": round(v[0], 2), "co2Kg": round(v[1], 3), "energyKwh": round(v[2], 3)}
                           for k, v in g.items()), key=lambda r: -r["costChf"])
        return {"byDepartment": group("department"), "byProvider": group("provider"), "byService": group("category"),
                "byTool": group("tool")[:25],
                "allocationRule": f"Direct costs via tags, cost centre or mapping; shared costs: {self.a.policy.get('shared_allocation', 'project_hours_then_fte')} (see allocation view)."}

    def resources(self, q):
        savings = defaultdict(float)
        flags = {}
        for m in self.r.measures:
            if m["chf"] > savings[m["resource"]]:
                savings[m["resource"]], flags[m["resource"]] = m["chf"], m["name"]
        ids = list(self.a.inventory) + [r for r in dict.fromkeys(m["resource"] for m in self.r.measures)
                                        if r not in self.a.inventory and r in self.r.by_resource]
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
            metrics = self.r.metrics.get(rid, [])
            def avg(field):
                vals = [float(x[field]) for x in metrics if x.get(field) not in (None, "")]
                return round(sum(vals) / len(vals), 1) if vals else None
            kg = [sum(r["kg"][i] for r in rows if r["kg"]) for i in range(3)]
            item = {"id": rid, "name": rows[0]["tool"] if rows and rows[0]["tool"] else rid, "provider": provider,
                    "location": self.resource_location(rid),
                    "environment": "prod" if env.startswith("prod") else "dev" if env.startswith(("dev", "sbx", "sand")) else "test",
                    "department": department, "criticality": inv.get("criticality") or "medium",
                    "runtimeH30d": float(inv["runtime_h_30d"]) if inv.get("runtime_h_30d") else 0,
                    "idleCostChfYear": round(savings.get(rid, 0), 2)}
            if inv.get("vcpu"):
                item["vcpu"] = float(inv["vcpu"])
            cpu = float(inv["cpu_utilisation_30d_pct"]) if inv.get("cpu_utilisation_30d_pct") else avg("cpu_avg_pct")
            if cpu is not None:
                item["cpuAvgPct"] = cpu
            if (gpu := avg("gpu_avg_pct")) is not None:
                item["gpuAvgPct"] = gpu
            if rid in flags:
                item["flag"] = flags[rid]
            if rows:
                item["co2Location"] = {"value": rng(kg), "unit": "kg CO₂", "kind": "modeled",
                                       "calc": {"title": f"Location-based CO₂ for {rid}", "formula": "Σ line energy × regional grid factor",
                                                "units": "kg CO2e/year", "kind": "modeled", "period": PERIOD, "inputs": [],
                                                "sources": sorted({r["ref"].split(":")[0] for r in rows}), "assumptions": [], "limitations": []}}
            out.append(item)
        return out

    def locations(self, q):
        groups = defaultdict(list)
        for l in self.lines(q):
            groups[LOCATIONS.get(l["region"], LOCATIONS["unknown"])].append(l)
        out = []
        grid = self.a.factors["grid"]
        for (lid, label, country, lat, lng), rows in groups.items():
            region = next(k for k, v in LOCATIONS.items() if v[0] == lid)
            market_rows = [r for r in rows if r["kg_market"] is not None]
            out.append({"id": lid, "label": label, "country": country, "lat": lat, "lng": lng,
                        "resourceCount": len({r["resource"] for r in rows}),
                        "costChf": round(sum(r["chf"] or 0 for r in rows), 2),
                        "energyKwh": round(sum(mid(r["kwh"]) or 0 for r in rows), 3),
                        "co2KgLocation": round(sum(mid(r["kg"]) or 0 for r in rows), 3),
                        "co2KgMarket": round(sum(mid(r["kg_market"]) for r in market_rows), 3),
                        "gridKgPerKwh": rng(grid[region]["values"]),
                        "providers": [p for p, _ in Counter(r["provider"] for r in rows if r["provider"]).most_common(6)],
                        "risks": [f"Market factor coverage: {len(market_rows)}/{len(rows)} lines."]})
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
                "action": m["change"], "measureId": m["id"]} for m in self.r.measures]
        contra = self.w.views["contradictions"]
        examples = defaultdict(list)
        for f in contra["findings"]:
            if len(examples[f["type"]]) < 3:
                examples[f["type"]].append(f)
        for kind, count in contra["counts"].items():
            ex = examples.get(kind, [])
            out.append({"id": f"F-C-{kind}", "title": kind.replace("_", " ").capitalize(), "description": f"{count} records flagged.",
                        "resource": ", ".join(sorted({str(e.get("scope") or e.get("ref", "").split(":")[0]) for e in ex}))[:120] or "ledger",
                        "category": "conflict", "impactChfYear": 0, "impactKwhYear": 0, "impactCo2KgYear": 0,
                        "evidence": [{"source": e.get("ref", ""), "detail": str(e.get("decision") or e.get("detail") or "")[:200]} for e in ex],
                        "assumptions": [], "risk": "review", "action": "Review in Data quality."})
        return out

    def measure_list(self, q):
        return [self.to_measure(m) for m in self.r.measures]

    def simulate(self, q, body):
        ids = [i for i in body.get("measureIds", []) if isinstance(i, str)]
        budget = float(body.get("budgetChf", 16500))
        rate = float(body.get("chfPerPersonDay", DEFAULT_RATE))
        chosen, excluded, scopes, groups = [], [], set(), set()
        for i in ids:
            m = self.measures.get(i)
            if not m:
                excluded.append({"id": i, "reason": "Unknown measure for this dataset."})
                continue
            claimed = set(m.get("scopes") or [m["resource"]])
            if m["hard_blockers"]:
                excluded.append({"id": i, "reason": "Hard blocker: " + "; ".join(m["hard_blockers"])})
            elif claimed & scopes:
                excluded.append({"id": i, "reason": f"Overlaps another selected measure on {', '.join(sorted(claimed & scopes))}."})
            elif m.get("exclusive") and m["exclusive"] in groups:
                excluded.append({"id": i, "reason": f"Mutually exclusive group {m['exclusive']} already selected."})
            else:
                chosen.append(m)
                scopes |= claimed
                if m.get("exclusive"):
                    groups.add(m["exclusive"])
        ids_kept = {m["id"] for m in chosen}
        for m in list(chosen):
            missing = set(m.get("requires", [])) - ids_kept
            if missing:
                chosen.remove(m)
                excluded.append({"id": m["id"], "reason": "Requires " + ", ".join(sorted(missing))})
        base_chf, base_kg = self.baseline()
        chf = sum(m["chf"] for m in chosen)
        kwh = sum(mid(m["kwh"]) for m in chosen)
        kg = sum(mid(m["kg"]) for m in chosen)
        market = sum(mid(m["kg_market"]) for m in chosen if m.get("kg_market"))
        days = sum(m["days"] for m in chosen)
        effort_chf = sum(m["implementation_chf"] - m["days"] * DEFAULT_RATE + m["days"] * rate for m in chosen)
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
                "savingsCo2KgMarket": round(market, 3), "effortDays": days, "effortChf": effort_chf,
                "costReductionPct": cost_pct, "co2ReductionPct": co2_pct, "constraints": constraints,
                "feasible": bool(chosen) and all(c["met"] for c in constraints), "reasons": reasons, "excluded": excluded,
                "paybackMonths": effort_chf / chf * 12 if chf > 0 else None}

    def optimize(self, q, body):
        rate = float(body.get("chfPerPersonDay", DEFAULT_RATE)) or DEFAULT_RATE
        budget = int(max(0, min(16500, float(body.get("budgetChf", 16500)))))
        days = min(MAX_DAYS, int(budget / rate * 2) / 2)
        objective = {"balanced": "midpoint", "cost": "first-year", "co2": "conservative"}.get(body.get("priority"), "midpoint")
        plan = self.w.package(budget, days, "planning", objective)
        ids = [m["id"] for m in plan["selected"]]
        return {"measureIds": ids, "result": self.simulate(q, {"measureIds": ids, "budgetChf": budget, "chfPerPersonDay": rate})}

    def forecast(self, q, metric, horizon, ids):
        key = {"cost": "chf", "energy": "kwh", "co2Location": "kg"}.get(metric)
        if not key:
            raise ValueError("Market-based forecasts are not supported by this backend.")
        fc = self.w.views["forecast"]
        b = self.a.baseline
        base = rng(b[key])
        sim = self.simulate(q, {"measureIds": ids}) if ids else None
        saved = {"chf": sim["savingsChf"], "kwh": sim["savingsKwh"], "kg": sim["savingsCo2Kg"]}[key] if sim else 0
        cut = min(1.0, saved / base["mid"]) if base["mid"] else 0
        points = [{"year": 2026, "periodLabel": PERIOD, "baseline": base, "optimized": base, "observed": base["mid"]}]
        for i, r in enumerate(fc["results"][:max(1, min(3, horizon))], start=1):
            v = rng(r[key])
            points.append({"year": 2026 + i, "periodLabel": r["period"], "baseline": v,
                           "optimized": {k: x * (1 - cut) for k, x in v.items()}})
        return {"metric": metric, "unit": {"chf": "CHF", "kwh": "kWh", "kg": "kg CO₂"}[key], "granularity": "annual",
                "growthAssumption": fc["method"], "points": points,
                "implementationTiming": "Optimized path applies the selected measures' annual run-rate from year 1."}

    def daily(self, q):
        start = date.fromisoformat(q["from"] + "-01")
        y, m = map(int, q["to"].split("-"))
        end = date(y, m, calendar.monthrange(y, m)[1])
        days = defaultdict(lambda: {"chf": 0.0, "kwh": 0.0, "kg": 0.0, "allocated": 0.0, "tools": defaultdict(float)})
        for l in self.lines(q):
            if not l["day"]:
                continue
            d0 = date.fromisoformat(l["day"])
            f = l["ref"].split(":")[0]
            span = (calendar.monthrange(d0.year, d0.month)[1] if f in MONTHLY_FILES and d0.day == 1
                    else 7 if f in WEEKLY_FILES else 1)
            share = 1 / span
            kg = (mid(l["kg"]) or 0) * share
            for k in range(span):
                d = d0 + timedelta(days=k)
                if not start <= d <= end:
                    continue
                row = days[d]
                row["chf"] += (l["chf"] or 0) * share
                row["kwh"] += (mid(l["kwh"]) or 0) * share
                row["kg"] += kg
                if span > 1:
                    row["allocated"] += kg
                row["tools"][l["tool"] or l["resource"]] += kg
        cal = {r["date"]: r for r in self.a.data.get("business_calendar", [])}
        out = []
        d = start
        while d <= end:
            row = days.get(d)
            c = cal.get(d.isoformat(), {})
            holiday = c.get("public_holiday") or c.get("company_holidays")
            item = {"date": d.isoformat(), "costChf": round(row["chf"], 2) if row else 0,
                    "energyKwh": round(row["kwh"], 3) if row else 0, "co2Kg": round(row["kg"], 3) if row else 0,
                    "workday": c.get("workday") == "1" if c else d.weekday() < 5,
                    "coverage": "allocated" if row and row["allocated"] > row["kg"] / 2 else "measured",
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
        return {"version": self.w.run_id[:12], "importedAt": summary["as_of"], "datasets": datasets,
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
                row[0] += sum(float(r.get(k) or 0) for k in ("tokens_in", "tokens_out")) / 1e6
                row[1] += float(r.get("cost_chf") or 0)
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
        return agent_for(self.w, self).answer(q, history)

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
        excluded = {e["id"] for e in sim["excluded"]}
        plan = dict(self.w.plan, selected=[self.measures[i] for i in ids if i in self.measures and i not in excluded])
        csv = tables(self.a, plan, self.w.template_root)[MEASURE_NAME]
        issues = (["Demo dataset — not a valid submission."] if self.a.demo else []) + sim["reasons"] + [f"{e['id']}: {e['reason']}" for e in sim["excluded"]]
        return {"filename": MEASURE_NAME, "csv": "﻿" + csv.lstrip("﻿"), "issues": issues,
                "submittable": not self.a.demo and sim["feasible"]}


class UnknownRoute(LookupError):
    pass


def adapter(work):
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
