"""Build an hourly coal/gas production proxy from archived Energy-Charts generation."""
import argparse
import csv
import json
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path

GENERATION = "https://api.energy-charts.info/public_power?country=de&start=2026-08-30&end=2026-09-01"
FACTORS = "https://www.ipcc.ch/site/assets/uploads/2018/02/ipcc_wg3_ar5_annex-iii.pdf"
COLUMNS = ("timestamp", "region", "kg_per_kwh", "kind", "source")
COAL = {"Fossil brown coal / lignite", "Fossil hard coal", "Fossil coal-derived gas", "Fossil oil"}
GAS = "Fossil gas"
EXCLUDE = {"Hydro pumped storage consumption", "Cross border electricity trading", "Load", "Residual load",
           "Renewable share of load", "Renewable share of generation"}


def convert(raw):
    times = raw["unix_seconds"]
    types = {s["name"]: s["data"] for s in raw["production_types"] if s["name"] not in EXCLUDE}
    if not COAL | {GAS} <= types.keys() or any(len(series) != len(times) for series in types.values()):
        raise ValueError("Incomplete generation series")
    hours = defaultdict(list)
    for i, stamp in enumerate(times):
        hours[stamp // 3600].append(i)
    for hour, indices in sorted(hours.items()):
        if sorted(times[i] % 3600 for i in indices) != [0, 900, 1800, 2700]:
            continue
        if any(series[i] is None for series in types.values() for i in indices):
            continue
        generation = sum(max(0, series[i]) for series in types.values() for i in indices)
        emissions = sum(max(0, types[k][i]) * (.76 if k in COAL else .37)
                        for i in indices for k in COAL | {GAS})
        if generation:
            yield (datetime.fromtimestamp(hour * 3600, UTC).isoformat(), "de", round(emissions / generation, 8),
                   "observed", f"Historical German coal/gas direct generation proxy. Energy-Charts: {GENERATION} | IPCC AR5 Table A.III.2: {FACTORS}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    with args.output.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.writer(stream, lineterminator="\n")
        writer.writerow(COLUMNS)
        writer.writerows(convert(json.loads(args.input.read_text(encoding="utf-8"))))
