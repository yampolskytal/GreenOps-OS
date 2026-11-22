import type { GeographicMetric, RegionalMetrics } from "@/lib/api/types";
import { isAvailable, marketCoverageLabel } from "@/lib/analytics";
import { carbonMass, chf, formatNumber } from "@/lib/format";

const carbon = (value: number | null) => carbonMass(value, "kg CO₂e");
const energy = (value: number | null) =>
  value == null ? "Unavailable" : `${formatNumber(value, { maximumFractionDigits: 3 })} kWh`;

export const GEOGRAPHIC_METRICS = [
  { key: "costChf", label: "Cost", format: chf },
  { key: "energyKwh", label: "Energy consumption", format: energy },
  { key: "co2KgLocation", label: "Location-based CO₂e", format: carbon },
  { key: "co2KgMarket", label: "Market-based CO₂e", format: carbon },
] as const;

export function regionalValue(row: RegionalMetrics, metric: GeographicMetric) {
  return isAvailable(row[metric]) ? row[metric] : null;
}

export function regionalCoverage(row: RegionalMetrics, metric: GeographicMetric) {
  if (metric === "co2KgMarket") {
    const coverage = row.marketCoverage;
    if (!coverage) return "Market coverage unavailable.";
    const label = marketCoverageLabel(coverage);
    return coverage.status === "partial" ? `Partial coverage · ${label}` : label;
  }
  const coverage = row.ledgerCoverage;
  if (!coverage) return null;
  const observed = {
    costChf: coverage.costRows,
    energyKwh: coverage.energyRows,
    co2KgLocation: coverage.locationRows,
  }[metric];
  return observed < coverage.totalRows
    ? `${formatNumber(coverage.totalRows - observed)} of ${formatNumber(coverage.totalRows)} ledger rows without a value.`
    : null;
}
