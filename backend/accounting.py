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
    terms = []
    share = 0.0
    if len(instruments) == 1:
        row = instruments[0]
        fraction = natural(row.get("coverage"))
        value = natural(row.get("kg_per_kwh"))
        if (row.get("source") and row.get("instrument_id") and
                sum(p.get("instrument_id") == row["instrument_id"] for p in configured) == 1
                and row.get("exclusive_attestation") is True and fraction is not None and 0 < fraction <= 1 and value is not None):
            share = fraction
            terms.append({"region": line["region"], "kind": "supplier instrument", "values": [value] * 3,
                          "source": row["source"], "note": f"Attested instrument {row['instrument_id']} covers {share:.0%} "
                                                           f"of scoped energy, {row['from']} to {row['through']}.",
                          "share": share})
    if fallback and share < 1:
        terms.append({"region": line["region"], "kind": "residual mix", "values": fallback["values"],
                      "source": fallback["source"], "note": fallback["note"], "share": 1 - share})
    return terms


def apply_market_terms(line, terms):
    residual = [term for term in terms if term["kind"] == "residual mix"]
    def emissions(factors):
        if line["kwh"] is None or not factors:
            return None
        return [kwh * sum(factor["share"] * factor["values"][i] for factor in factors)
                for i, kwh in enumerate(line["kwh"])]

    line.update(kg_market=emissions(terms), market_residual_kg=emissions(residual),
                market_fraction=sum(term["share"] for term in terms),
                market_residual_fraction=sum(term["share"] for term in residual),
                market_factors=terms, market_source=" | ".join(dict.fromkeys(t["source"] for t in terms)) or None,
                market_instrument_attested=len(residual) != len(terms))


def check_market(a):
    factors = {}
    for row in a.lines:
        identity = row["day"], row["region"], row.get("provider", "")
        if identity not in factors:
            factors[identity] = market_factor(a, row)
        apply_market_terms(row, factors[identity])


class MarketSummary:
    """Sum covered activity and retain its energy denominator and factor provenance."""

    def __init__(self, rows=(), residual_only=False):
        self.residual_only = residual_only
        self.kg = [0.0] * 3
        self.modeled = self.covered = self.allocated = 0.0
        self.has_factor = False
        self.missing_energy, self.missing_factors, self.regions = set(), set(), set()
        self.sources, self.factors = set(), {}
        for row in rows:
            self.add(row)

    def add(self, row, share=1, allocated=False):
        if not share:
            return
        ref = row.get("ref", "")
        if ref:
            self.sources.add(ref.split(":")[0])
        if row["kwh"] is None:
            self.missing_energy.add((ref, row.get("day")))
            return
        value = row.get("market_residual_kg" if self.residual_only else "kg_market")
        fraction = row.get("market_residual_fraction" if self.residual_only else "market_fraction",
                           float(value is not None)) if value is not None else 0
        energy = row["kwh"][1] * share
        self.modeled += energy
        self.covered += fraction * energy
        if allocated:
            self.allocated += fraction * energy
        if energy > 0 and fraction < 1:
            self.missing_factors.add((ref, row.get("day")))
            self.regions.update(row.get("market_missing_regions", [row.get("region") or "unknown"]))
        if value is None:
            return
        self.has_factor = True
        for i, kg in enumerate(value):
            self.kg[i] += share * kg
        for f in row.get("market_factors", []):
            if not self.residual_only or f["kind"] == "residual mix":
                k = f["region"], f["kind"], f["source"], f["note"], tuple(f["values"])
                self.factors[k] = f

    def result(self):
        supported = self.covered > 0 or (self.has_factor and not self.modeled and not self.missing_energy)
        return [round(v, 6) for v in self.kg] if supported else None

    def coverage(self):
        return market_coverage(self.modeled, self.covered, self.allocated, len(self.missing_energy),
                               len(self.missing_factors), self.regions, self.sources, self.factors.values(),
                               self.result() is not None)


def market_coverage(modeled, covered, allocated, missing_energy, missing_factors, regions, sources, factors, supported):
    factors = sorted(factors, key=lambda f: (f["region"], f["kind"], f["source"], f["note"]))
    gaps = []
    if missing_energy:
        gaps.append(f"{missing_energy} ledger rows without an energy estimate.")
    if missing_factors:
        gaps.append(f"{missing_factors} ledger rows have energy without a supported factor in all or part of the scope"
                    + (f" ({', '.join(sorted(regions))})." if regions else "."))
    assumptions = sorted({f["note"] for f in factors})
    if allocated:
        assumptions.append("Market factors are matched to the ledger date. Monthly bills and weekly M365 inputs are then allocated evenly over their covered dates. Server telemetry is already allocated in the ledger.")
    return {"status": "unavailable" if not supported else "partial" if gaps else "covered",
            "modeledKwh": round(modeled, 6), "coveredKwh": round(covered, 6),
            "uncoveredKwh": round(max(0, modeled - covered), 6), "allocatedCoveredKwh": round(allocated, 6),
            "coveragePct": round(min(100, 100 * covered / modeled), 4) if modeled else None,
            "missingEnergyRows": missing_energy, "missingFactorRows": missing_factors,
            "uncoveredRegions": sorted(regions), "sources": sorted(set(sources) | {f["source"] for f in factors}),
            "factors": [{"label": f"{f['region']} · {f['kind']}", "source": f["source"],
                         **dict(zip(("low", "mid", "high"), map(str, f["values"])))} for f in factors],
            "assumptions": assumptions, "missingInputs": gaps}


def market_reduction(rows, fraction, unavailable=None):
    covered, projection = MarketSummary(), MarketSummary(residual_only=True)
    for row in rows:
        covered.add(row, fraction)
        projection.add(row, fraction)
    result = covered.result() if fraction else [0.0] * 3
    coverage = covered.coverage()
    if not fraction:
        coverage["status"] = "no-change"
    if unavailable:
        coverage["missingInputs"].append(unavailable)
        if coverage["status"] == "covered":
            coverage["status"] = "partial"
    return {"range": result, "projectionRange": projection.result() if fraction else result,
            "coverage": coverage, "projectionPartial": bool(
                unavailable or coverage["missingInputs"] or projection.covered < covered.covered)}


def merge_market_effects(effects):
    """Combine matched activity; a known cost-only zero cannot mask an unavailable energy effect."""
    coverages = [e["coverage"] for e in effects]
    active = [e for e in effects if e["coverage"]["status"] != "no-change"]
    def combined(key):
        known = [e[key] for e in active if e[key] is not None]
        return [round(sum(v), 6) for v in zip(*known)] if known else (None if active or not effects else [0.0] * 3)

    values = combined("range")
    gaps = sorted({gap for c in coverages for gap in c["missingInputs"]})
    if any(e["range"] is None and not e["coverage"]["missingInputs"] for e in active):
        gaps.append("Some measures have no supported market-based estimate.")
    total = sum(c["modeledKwh"] for c in coverages)
    covered = sum(c["coveredKwh"] for c in coverages)
    metadata = {"status": "unavailable" if values is None else "no-change" if not active else
                "partial" if gaps else "covered",
                "modeledKwh": round(total, 6), "coveredKwh": round(covered, 6),
                "uncoveredKwh": round(max(0, total - covered), 6),
                "allocatedCoveredKwh": round(sum(c["allocatedCoveredKwh"] for c in coverages), 6),
                "coveragePct": round(min(100, 100 * covered / total), 4) if total else None,
                **{k: sum(c[k] for c in coverages) for k in ("missingEnergyRows", "missingFactorRows")},
                **{k: sorted({v for c in coverages for v in c[k]})
                   for k in ("sources", "assumptions", "uncoveredRegions")},
                "factors": list({tuple(f.items()): f for c in coverages for f in c["factors"]}.values()),
                "missingInputs": gaps}
    return {"range": values, "projectionRange": combined("projectionRange"), "coverage": metadata,
            "projectionPartial": any(e["projectionPartial"] for e in effects)}


def market_relocation(a, rows, destination, fraction, provider=""):
    """Only compare work for which both ends have fully supported market factors."""
    paired = []
    for row in rows:
        arrival = row | {"region": destination, "provider": provider}
        apply_market_terms(arrival, market_factor(a, arrival))
        if row.get("kg_market") is None or arrival["kg_market"] is None or min(
                row.get("market_fraction", 0), arrival["market_fraction"]) < 1:
            missing = [r["region"] for r in (row, arrival) if r.get("market_fraction", 0) < 1]
            paired.append(row | {"kg_market": None, "market_residual_kg": None,
                                "market_missing_regions": missing or [destination]})
            continue
        before, after = row["kg_market"], arrival["kg_market"]
        delta = [before[0] - after[2], before[1] - after[1], before[2] - after[0]]
        residual = not (row.get("market_instrument_attested") or arrival["market_instrument_attested"])
        paired.append(row | {"kg_market": delta, "market_residual_kg": delta if residual else None,
                            "market_factors": row["market_factors"] + arrival["market_factors"]})
    effect = market_reduction(paired, fraction)
    if effect["coverage"]["status"] in ("partial", "unavailable"):
        effect["coverage"]["missingInputs"].append(
            f"Some relocation activity lacks a comparable origin or destination factor for {destination}.")
        effect["projectionPartial"] = True
    return effect


def scale_market_effect(effect, ratio):
    if not ratio:
        return market_reduction([], 0)
    coverage = effect["coverage"]
    energy_fields = ("modeledKwh", "coveredKwh", "uncoveredKwh", "allocatedCoveredKwh")
    return effect | {
        "coverage": coverage | {k: round(coverage[k] * ratio, 6) for k in energy_fields},
        **{k: [round(v * ratio, 6) for v in effect[k]] if effect[k] is not None else None
           for k in ("range", "projectionRange")},
    }


def market_breakdown(a):
    groups = defaultdict(lambda: {"modeled_kwh": 0.0, "covered_kwh": 0.0, "covered_kg": 0.0, "uncovered_kwh": 0.0})
    for line in a.lines:
        if line["kwh"] is None:
            continue
        identity = (line["region"], line["month"], line.get("market_source") or "Uncovered",
                    bool(line.get("market_instrument_attested")))
        b = groups[identity]
        b["modeled_kwh"] += line["kwh"][1]
        covered = line["kwh"][1] * line.get("market_fraction", 0)
        b["uncovered_kwh"] += line["kwh"][1] - covered
        if line.get("kg_market") is not None:
            b["covered_kwh"] += covered
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
