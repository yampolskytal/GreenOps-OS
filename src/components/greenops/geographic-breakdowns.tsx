import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { Breakdown, LocationSummary } from "@/lib/api/types";
import { useBreakdowns } from "@/lib/queries";
import { useGlobalQuery } from "@/lib/store";
import { spendingCategories } from "./spending-donut";
import { Q } from "./ui";
import { LeaderboardBars } from "./leaderboard-bars";
import { categoryShares } from "@/lib/administration";
import { carbonMass, chf, formatNumber, pct } from "@/lib/format";

const groups = [...spendingCategories, ["servers", "Servers"]] as const;
type Group = (typeof groups)[number][0];
type Metric = "costChf" | "co2KgLocation" | "energyKwh";

export function regionalBreakdownRows(
  region: LocationSummary["id"],
  slices: { label: string; locations: LocationSummary[] | undefined }[],
): Breakdown[] {
  return slices.flatMap(({ label, locations }) => {
    const location = locations?.find(({ id }) => id === region);
    if (locations && !location) return [];
    const value = (value: number | undefined) =>
      typeof value === "number" && Number.isFinite(value) ? value : null;
    return [
      {
        label,
        costChf: value(location?.costChf),
        energyKwh: value(location?.energyKwh),
        co2Kg: value(location?.co2KgLocation),
      },
    ];
  });
}

export function GeographicBreakdowns({
  locations,
  metric,
}: {
  locations: LocationSummary[];
  metric: Metric;
}) {
  const [region, setRegion] = useState<LocationSummary["id"]>();
  const [category, setCategory] = useState<Group>("byProvider");
  const selected = locations.find(({ id }) => id === region) ?? locations[0];
  if (!selected) return null;

  return (
    <section aria-labelledby="geographic-breakdown" className="border-t pt-4">
      <h3 id="geographic-breakdown" className="text-sm font-semibold">
        Geographic breakdown
      </h3>
      <div className="space-y-4 pt-3">
        <div className="flex flex-wrap gap-3">
          <label className="grid gap-1 text-xs font-medium">
            Region
            <select
              className="h-9 rounded-md border bg-card px-2 text-sm"
              value={selected.id}
              onChange={(event) =>
                setRegion(locations.find(({ id }) => id === event.target.value)?.id)
              }
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
              onChange={(event) => {
                const group = groups.find(([id]) => id === event.target.value);
                if (group) setCategory(group[0]);
              }}
            >
              {groups.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {category === "byProvider" || category === "byDepartment" ? (
          <ScopedBreakdown
            region={selected}
            category={category === "byProvider" ? "provider" : "department"}
            metric={metric}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            {category === "servers"
              ? "Regional server totals are unavailable. Resource locations identify a primary region, and the provider does not split resource values by region."
              : `${groups.find(([id]) => id === category)?.[1]} are unavailable by region. The provider does not support this grouping for regional totals.`}
          </p>
        )}
      </div>
    </section>
  );
}

function ScopedBreakdown({
  region,
  category,
  metric,
}: {
  region: LocationSummary;
  category: "provider" | "department";
  metric: Metric;
}) {
  const breakdowns = useBreakdowns(!api.isDemo, false);
  if (api.isDemo) {
    return (
      <p className="text-sm text-muted-foreground">
        The demo provider supplies regional totals only.
      </p>
    );
  }
  return (
    <Q q={breakdowns}>
      {(data) => (
        <RegionalCompare
          region={region}
          category={category}
          metric={metric}
          labels={(category === "provider" ? data.byProvider : data.byDepartment).map(
            ({ label }) => label,
          )}
          rule={data.allocationRule}
        />
      )}
    </Q>
  );
}

function RegionalCompare({
  region,
  category,
  metric,
  labels,
  rule,
}: {
  region: LocationSummary;
  category: "provider" | "department";
  metric: Metric;
  labels: string[];
  rule: string;
}) {
  const scope = useGlobalQuery();
  const options = [
    ...new Set(
      labels.filter((label) => label && label.toLowerCase() !== "all" && label !== "Unassigned"),
    ),
  ];
  const filters = options.map((label) => ({ ...scope, [category]: label }));
  const results = useQueries({
    queries: filters.map((filter) => ({
      queryKey: ["locations", filter],
      queryFn: () => api.getLocations(filter),
      refetchOnMount: false,
    })),
  });
  if (results.some((result) => result.isPending)) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading regional subtotals…
      </p>
    );
  }
  const rows = regionalBreakdownRows(
    region.id,
    options.map((label, index) => ({
      label,
      locations: results[index]?.data,
    })),
  );
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Shares use the available regional subtotals. Unassigned records without a filterable
        provider or department are omitted, so the breakdown can differ from the regional total.
      </p>
      {results.some((result) => result.isError) && (
        <p role="status" className="text-sm text-warning">
          Some regional subtotals could not be loaded.
        </p>
      )}
      <RegionalBars rows={rows} metric={metric} rule={rule} />
    </div>
  );
}

export function RegionalBars({
  rows,
  metric,
  rule,
}: {
  rows: Breakdown[];
  metric: Metric;
  rule: string;
}) {
  const key = metric === "co2KgLocation" ? "co2Kg" : metric;
  const { shares } = categoryShares(rows.map((row) => row[key]));
  const format =
    metric === "costChf"
      ? chf
      : metric === "co2KgLocation"
        ? (n: number) => carbonMass(n, "kg CO₂e")
        : (n: number) => `${formatNumber(n, { maximumFractionDigits: 3 })} kWh`;
  if (!rows.length)
    return <p className="text-sm text-muted-foreground">No regional entries for this scope.</p>;
  return (
    <LeaderboardBars
      items={rows.map((row, index) => ({
        id: row.label,
        label: row.label,
        value: row[key],
        ...(shares[index] == null ? {} : { shareLabel: `${pct(shares[index])} of subtotal` }),
      }))}
      format={format}
      label={rule}
    />
  );
}
