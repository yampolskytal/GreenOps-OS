import { useState } from "react";
import type {
  GeographicMetric,
  LocationSummary,
  RegionalBreakdown,
  RegionalGroup,
} from "@/lib/api/types";
import { GEOGRAPHIC_METRICS, regionalCoverage, regionalValue } from "@/lib/geographic";
import { categoryShares } from "@/lib/administration";
import { pct } from "@/lib/format";
import { LeaderboardBars } from "./leaderboard-bars";
import { CoverageEvidence } from "./emissions-evidence";

const GROUPS = {
  byDepartment: "Departments",
  byProvider: "Providers",
  byTool: "Tools",
  byService: "Service categories",
} as const;

export function GeographicBreakdowns({
  locations,
  region,
  onRegionChange,
  metric,
}: {
  locations: LocationSummary[];
  region: LocationSummary["id"] | undefined;
  onRegionChange: (id: LocationSummary["id"]) => void;
  metric: GeographicMetric;
}) {
  const [category, setCategory] = useState<RegionalGroup>("byProvider");
  const selected = locations.find(({ id }) => id === region) ?? locations[0];
  if (!selected) return null;
  const rows = selected.breakdowns?.[category];

  return (
    <section
      id="geographic-breakdown"
      aria-labelledby="geographic-breakdown-heading"
      className="space-y-3 border-t pt-4"
    >
      <h3 id="geographic-breakdown-heading" className="font-semibold">
        Geographic breakdown
      </h3>
      <div className="flex flex-wrap gap-3">
        <label className="grid gap-1 text-xs font-medium">
          Region
          <select
            className="h-9 max-w-[75vw] rounded-md border bg-card px-2 text-sm"
            value={selected.id}
            onChange={(event) => {
              const next = locations.find(({ id }) => id === event.target.value);
              if (next) onRegionChange(next.id);
            }}
          >
            {locations.map(({ id, label }) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium">
          Group by
          <select
            className="h-9 rounded-md border bg-card px-2 text-sm"
            value={category}
            onChange={(event) => setCategory(event.target.value as RegionalGroup)}
          >
            {Object.entries(GROUPS).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {rows ? (
        <RegionalBars rows={rows} metric={metric} />
      ) : (
        <p className="text-sm text-muted-foreground">
          {GROUPS[category]} are unavailable for this region from the current backend.
        </p>
      )}
    </section>
  );
}

export function RegionalBars({
  rows,
  metric,
}: {
  rows: RegionalBreakdown[];
  metric: GeographicMetric;
}) {
  const values = rows.map((row) => regionalValue(row, metric));
  const { shares } = categoryShares(values);
  const { format } = GEOGRAPHIC_METRICS.find(({ key }) => key === metric)!;
  const market = metric === "co2KgMarket";
  if (!rows.length)
    return <p className="text-sm text-muted-foreground">No regional entries for this scope.</p>;
  return (
    <>
      {market && (
        <p className="text-xs text-muted-foreground">
          Shares use covered emissions. Select a group to see its coverage and factor evidence.
        </p>
      )}
      <LeaderboardBars
        items={rows.map((row, index) => ({
          id: row.label,
          label: row.label,
          value: values[index] ?? null,
          ...(shares[index] == null ? {} : { shareLabel: `${pct(shares[index])} of subtotal` }),
          content:
            market && row.marketCoverage ? (
              <CoverageEvidence
                title="Market-based emissions coverage"
                coverage={row.marketCoverage}
              />
            ) : (
              <p>
                {regionalCoverage(row, metric) ??
                  "Subtotal of available ledger values in this region."}
              </p>
            ),
        }))}
        format={format}
        label="Subtotals use the same scoped ledger as the regional figures. The comparison includes an Unassigned group where the ledger has no group label."
        methodologyIcon
      />
    </>
  );
}
