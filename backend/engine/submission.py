"""Independent verification of a generated challenge submission."""
import csv
import hashlib
import json
from decimal import Decimal, InvalidOperation

from engine.greenops import ROOT
from engine.records import fingerprint
from engine.templates import BASE_FIELDS, BASE_NAME, MEASURE_FIELDS, MEASURE_NAME, skeleton


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_receipt(destination, names, manifest):
    receipt = {"run_id": fingerprint(manifest), "sources": manifest["sources"],
               "factors_sha256": fingerprint(manifest["factors"]), "policy_sha256": fingerprint(manifest["policy"]),
               "outputs": {name: digest(destination / name) for name in sorted(names)}}
    (destination / "submission-receipt.json").write_text(json.dumps(receipt, indent=2), encoding="utf-8")


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def read_csv(path, fields):
    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != fields:
            raise ValueError(f"Wrong header: {path.name}")
        return list(reader)


def equal(actual, expected, tolerance="0.01"):
    try:
        diff = abs(Decimal(str(actual)) - Decimal(str(expected)))
        return diff.is_finite() and diff <= Decimal(tolerance)
    except InvalidOperation:
        return False


def validate(destination, data=None, template_root=None):
    receipt = read_json(destination / "submission-receipt.json")
    manifest = read_json(destination / "manifest.json")
    required = {"manifest.json", "summary.json", "package.json", BASE_NAME, MEASURE_NAME}
    outputs = receipt["outputs"]
    if not required <= outputs.keys() or any("/" in name or "\\" in name or name in (".", "..") for name in outputs):
        raise ValueError("Invalid receipt output list.")
    if any(digest(destination / name) != expected for name, expected in outputs.items()):
        raise ValueError("Export hash mismatch. Regenerate the submission from one run.")
    if (receipt["run_id"] != fingerprint(manifest) or receipt["sources"] != manifest["sources"]
            or receipt["factors_sha256"] != fingerprint(manifest["factors"])
            or receipt["policy_sha256"] != fingerprint(manifest["policy"])):
        raise ValueError("Inputs, factors or run fingerprint differs from the receipt.")
    summary = read_json(destination / "summary.json")
    if summary["run_id"] != receipt["run_id"]:
        raise ValueError("Baseline summary belongs to another run.")
    if data:
        inputs = {row["file"]: row.get("sha256") for row in summary["sources"]}
        for key in ("hourly_grid.csv", BASE_NAME, MEASURE_NAME):
            if key in receipt["sources"]:
                inputs[key] = receipt["sources"][key]
        for file, expected in inputs.items():
            path = (template_root or data) / file if file in (BASE_NAME, MEASURE_NAME) else data / file
            if file in (BASE_NAME, MEASURE_NAME) and not path.is_file():
                path = ROOT / "templates" / file
            if (digest(path) if path.is_file() else None) != expected:
                raise ValueError(f"Missing, new, or modified run input: {file}")
    base = read_csv(destination / BASE_NAME, BASE_FIELDS)
    original = skeleton(template_root or data or ROOT / "templates", BASE_NAME, BASE_FIELDS)
    key_fields = ("parameter", "must_or_bonus", "unit")
    if [[r[k] for k in key_fields] for r in base] != [[r[k] for k in key_fields] for r in original]:
        raise ValueError("Baseline template rows or units changed.")
    if any(not all(r[k].strip() for k in ("value_mid", "source", "calculation_or_assumption")) for r in base if r["must_or_bonus"] == "Must"):
        raise ValueError("Mandatory baseline evidence is incomplete.")
    b = summary["baseline"]
    expected_baseline = {"total_cost_baseline_year_chf": b["chf"], "total_energy_baseline_year_kwh": b["kwh"][1],
                         "total_co2_location_based_baseline_year_kg": b["kg"][1]}
    for r in base:
        if r["parameter"] in expected_baseline and not equal(r["value_mid"], expected_baseline[r["parameter"]]):
            raise ValueError(f"Baseline CSV value differs from summary: {r['parameter']}")
    rows = read_csv(destination / MEASURE_NAME, MEASURE_FIELDS)
    plan = read_json(destination / "package.json")
    chosen = plan["selected"]
    if [r["measure_id"] for r in rows] != [m["id"] for m in chosen] or len({m["id"] for m in chosen}) != len(rows):
        raise ValueError("Measure row IDs differ from the package.")
    scopes = set()
    groups = set()
    rules = manifest["policy"].get("protection_register", [])
    for row, m in zip(rows, chosen):
        claimed = set(m.get("scopes") or [m["resource"]])
        group = m.get("exclusive")
        if scopes & claimed or (group and group in groups):
            raise ValueError("Selected measures duplicate a billing scope or conflict.")
        scopes.update(claimed)
        if group:
            groups.add(group)
        if m["hard_blockers"] or m["status"] == "blocked":
            raise ValueError(f"Blocked measure selected: {m['id']}")
        for rule in rules:
            if not claimed.intersection(rule.get("resources", [])):
                continue
            if rule.get("always_on") and not (rule["id"] == "production-availability" and m.get("availability_preserving")):
                raise ValueError(f"Continuous-availability guard failed for {m['id']}")
            if rule.get("retention_lock") and "backup" in m["name"].casefold():
                raise ValueError(f"Protected backup scope in {m['id']}")
        checks = {"effort_person_days": m["days"], "savings_cost_chf_per_year": m["chf"],
                  "savings_energy_kwh_per_year": m["kwh"][1], "savings_co2_kg_location_based": m["kg"][1]}
        if any(not equal(row[k], v, "0.00001") for k, v in checks.items()):
            raise ValueError(f"Measure CSV numbers differ from package: {m['id']}")
    days = sum(m["days"] for m in chosen)
    spend = sum(m["implementation_chf"] for m in chosen)
    chf = sum(m["chf"] for m in chosen)
    kg = sum(m["kg"][1] for m in chosen)
    kwh = sum(m["kwh"][1] for m in chosen)
    if (days > min(15, plan["day_limit"]) or spend > min(16500, plan["budget_chf"])
            or not equal(days, plan["days"]) or not equal(spend, plan["spent_chf"])
            or not equal(chf, plan["savings"]["chf"]) or not equal(kg, plan["savings"]["kg"][1])
            or not equal(kwh, plan["savings"]["kwh"][1])):
        raise ValueError("Package totals or caps failed independent calculation.")
    target_met = bool(b["chf"] > 0 and b["kg"][1] > 0 and round(chf, 2) >= b["chf"] * .25 and round(kg, 6) >= b["kg"][1] * .40)
    if target_met != plan["target_met"]:
        raise ValueError("Target flag does not match recomputed midpoint totals.")
    return {"run_id": receipt["run_id"], "files_verified": len(outputs), "live_inputs_verified": data is not None,
            "days": days, "implementation_chf": round(spend, 2), "savings_chf": round(chf, 2),
            "location_kg_saved": round(kg, 4), "target_met": target_met}
