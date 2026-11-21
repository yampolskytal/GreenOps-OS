"""Populate the organizer's untouched template schema and row identifiers."""
import csv
from pathlib import Path

from greenops import ROOT, csv_text

BASE_NAME = "template_baseline_and_assumptions.csv"
MEASURE_NAME = "template_measures_package.csv"
BASE_FIELDS = "parameter must_or_bonus value_low value_mid value_high unit source calculation_or_assumption".split()
MEASURE_FIELDS = """measure_id description resource_or_source change effort_person_days
savings_cost_chf_per_year savings_energy_kwh_per_year savings_co2_kg_location_based
savings_co2_kg_market_based risks_and_exceptions assumptions_and_sources""".split()


def skeleton(root, filename, fields):
    path = Path(root) / filename
    if not path.is_file():
        path = ROOT / "templates" / filename
    with path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != fields:
            raise ValueError(f"Unexpected columns in {filename}")
        return list(reader)


def tables(a, plan, template_root=None):
    base = a.baseline
    source = a.mode + " | normalized ledger"
    cover = f'{base["missing_cost"]} lines without CHF and {base["missing_energy"]} without energy. See coverage.json and ledger.json.'
    values = {
        "total_cost_baseline_year_chf": (["", base["chf"], ""], source, cover),
        "total_energy_baseline_year_kwh": (base["kwh"], source, cover),
        "total_co2_location_based_baseline_year_kg": (base["kg"], source, cover),
        "total_co2_market_based_baseline_year_kg": (base["kg_market"] if a.factors.get("market_grid") else [""]*3, source,
                                                     f'Residual-mix proxy for mapped consumption. {base["missing_market"]} metered rows lack market factors. Supplier instruments require source and scope attestation.'),
        "allocation_rule_shared_costs": (["", a.policy.get("shared_allocation", "project_hours_then_fte"), ""],
                                         "Project hours, headcount and account mapping", "Original ledger keeps directly tagged spend. See allocation.json for reconciled shared-cost view."),
    }
    def factor(target, item, mult=1, extra=""):
        values[target] = ([round(x * mult, 10) for x in item["values"]], item["source"], item["note"] + extra)
    for region, name in (("ch", "switzerland"), ("de", "germany"), ("ie", "ireland")):
        factor(f"grid_mix_location_based_{name}", a.factors["grid"][region])
    market = a.factors.get("market_grid")
    if market:
        actual = [r for r in a.lines if r["kwh"] is not None and r["kg_market"] is not None]
        effective = [sum(r["kg_market"][i] for r in actual) / max(1e-30, sum(r["kwh"][i] for r in actual))
                     for i in range(3)]
        values["grid_mix_market_based"] = (effective, "Regional residual factors and any attested supplier inputs in factors.json and policy.json",
                                            "Energy-weighted effective intensity of covered activity. See regional sources and market gaps.")
    for suffix, k in (("vcpu_hour", "vcpu-hour"), ("node_hour", "node-hour"), ("gpu_hour", "gpu-hour"),
                      ("gb_storage_day", "gb-day"), ("subscription_message", "message")):
        factor("energy_per_" + suffix, a.factors["energy"][k])
    factor("energy_per_1000_tokens", a.factors["energy"]["token-large"], 1000,
           f" Reference large-model factor per 1,000 output-equivalent tokens. Input weight {a.factors['ai_input_weight']}; small models use their own factor.")
    factor("pue", a.factors["pue"])
    factor("growth_per_year", a.factors["growth"], 100)
    root = template_root or a.path
    rows = skeleton(root, BASE_NAME, BASE_FIELDS)
    ids = [r["parameter"] for r in rows]
    if len(ids) != len(set(ids)) or set(values) - set(ids):
        raise ValueError("Official baseline parameters missing or repeated")
    for r in rows:
        name = r["parameter"]
        if name not in values:
            if r["must_or_bonus"] == "Must":
                raise ValueError(f"No calculation for mandatory parameter {name}")
            continue
        (r["value_low"], r["value_mid"], r["value_high"]), r["source"], r["calculation_or_assumption"] = values[name]
    skeleton(root, MEASURE_NAME, MEASURE_FIELDS)
    measures = [(r["id"], r["name"], r["resource"], r["change"], r["days"], r["chf"], r["kwh"][1], r["kg"][1],
                 r["kg_market"][1] if r["kg_market"] else None,
                 f"{r['status']}. Approver: {r['approval']}. Phase: {r['phase']}. "
                 + " ".join(p["source"] for p in r["protection"]),
                 f"{a.mode}. {r['method']} CHF first year {r['first_year_chf']}, kWh {r['kwh']}, kg CO2e {r['kg']}. "
                 f"Sources: {', '.join(sorted({ref.split(':')[0] for ref in r['evidence']}))}; full evidence in package.json.")
                for r in plan["selected"]]
    return {BASE_NAME: csv_text(BASE_FIELDS, ([r.get(k, "") for k in BASE_FIELDS] for r in rows)),
            MEASURE_NAME: csv_text(MEASURE_FIELDS, measures)}
