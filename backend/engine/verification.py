"""Source-backed planning inputs, coverage, and review priorities."""
from collections import defaultdict

from engine.greenops import day, natural, number


def evidence_record(a, kind, scope):
    record = a.policy.get("measured_evidence", {}).get(kind, {}).get(scope)
    if record is None:
        return None
    start, end = day(record.get("from")), day(record.get("through"))
    if not record.get("source") or not record.get("owner") or not start or not end or not start <= a.as_of <= end:
        raise ValueError(f"{kind}/{scope} requires a source, owner and validity dates covering --as-of.")
    return record


def required_number(record, key, maximum=None):
    value = natural(record.get(key))
    if value is None or (maximum is not None and value > maximum):
        raise ValueError(f"Evidence field {key} must be nonnegative" + (f" and ≤ {maximum}." if maximum is not None else "."))
    return value


def recover_costs(a):
    recoveries = a.policy.get("recovered_costs", {})
    if not recoveries:
        return
    sources = {v["file"]: v.get("sha256") for v in a.sources.values()}
    lines = defaultdict(list)
    for row in a.lines:
        if row["ref"] in recoveries:
            lines[row["ref"]].append(row)
    for ref, recovery in recoveries.items():
        digest = sources.get(ref.partition(":")[0])
        amount = number(recovery.get("amount_chf"))
        match = lines[ref]
        if (not digest or digest != recovery.get("source_sha256") or len(match) != 1
                or match[0]["chf"] is not None or amount is None
                or not recovery.get("source") or not recovery.get("owner")):
            raise ValueError(f"Cost recovery {ref} requires a unique missing-cost line, original file SHA-256, verified CHF amount, source and owner.")
        match[0]["chf"] = amount
        match[0]["cost_recovery"] = recovery
        a.audit("cost_recovered", ref, f'{recovery["owner"]}: {recovery["source"]}')


def energy_coverage(lines):
    regional = defaultdict(lambda: {"modeled_kwh": 0.0, "market_covered_kwh": 0.0, "energy_gaps": 0,
                                    "cost_gaps": 0, "cost_without_energy_chf": 0.0})
    for row in lines:
        b = regional[row["region"]]
        if row["chf"] is None:
            b["cost_gaps"] += 1
        if row["kwh"] is None:
            b["energy_gaps"] += 1
            b["cost_without_energy_chf"] += abs(row["chf"] or 0)
            continue
        b["modeled_kwh"] += row["kwh"][1]
        if row.get("kg_market") is not None:
            b["market_covered_kwh"] += row["kwh"][1] * row.get("market_fraction", 1)
    totals = {k: sum(b[k] for b in regional.values()) for k in
              ("modeled_kwh", "market_covered_kwh", "energy_gaps", "cost_gaps", "cost_without_energy_chf")}
    for b in [totals, *regional.values()]:
        b["market_coverage"] = b["market_covered_kwh"] / b["modeled_kwh"] if b["modeled_kwh"] else None
        for k in ("modeled_kwh", "market_covered_kwh", "cost_without_energy_chf"):
            b[k] = round(b[k], 2)
    return {"total": totals, "regions": dict(sorted(regional.items())),
            "method": "Market coverage is the share of estimated kWh with a market factor. Spend without an energy estimate uses absolute CHF, including credits."}


def review_queue(contradictions):
    queue = {}
    for row in contradictions["findings"]:
        kind = row["type"]
        ref = row.get("ref", "")
        source = ref.partition(":")[0]
        scope = str(row.get("resource") or row.get("scope") or row.get("canonical") or source or "case")
        ident = f"{kind}|{scope}"
        owner = ("Head of Finance" if any(s in kind.lower() for s in ("invoice", "report comparison", "contract", "duplicate"))
                 else "Head of IT and resource owner")
        ticket = queue.setdefault(ident, {"id": ident, "type": kind, "scope": scope, "owner": owner, "count": 0,
                                         "absolute_chf_delta": 0.0, "refs": [], "recommendation": row["decision"]})
        ticket["count"] += 1
        ticket["absolute_chf_delta"] += abs(row.get("delta_chf") or 0)
        for candidate in [ref, *row.get("refs", [])[:5]]:
            if candidate and candidate not in ticket["refs"] and len(ticket["refs"]) < 8:
                ticket["refs"].append(candidate)
    for ticket in queue.values():
        ticket["absolute_chf_delta"] = round(ticket["absolute_chf_delta"], 2)
    return sorted(queue.values(), key=lambda x: (-x["absolute_chf_delta"], -x["count"], x["id"]))
