import { useState } from "react";
import type { Breakdown, HistoricalMetric } from "@/lib/api/types";
import { useResources } from "@/lib/queries";
import { EvidenceInfoButton } from "./details";
import { ResourceDetails } from "./resource-details";
import { DonutBreakdown, SpendingDonut, type SpendingSelection } from "./spending-donut";
import { Q } from "./ui";

export function comparisonFromHash(hash: string): SpendingSelection | undefined {
  const match =
    /^compare-(byDepartment|byProvider|byTool|byService)-(costChf|energyKwh|co2KgMarket|co2Kg)$/.exec(
      hash,
    );
  return match
    ? { category: match[1] as SpendingSelection["category"], metric: match[2] as HistoricalMetric }
    : undefined;
}

const serverMetrics = [
  ["runtimeH30d", "Runtime", "h"],
  ["cpuAvgPct", "CPU utilization", "%"],
  ["gpuAvgPct", "GPU utilization", "%"],
  ["idleCostChfYear", "Estimated idle cost", "CHF"],
] as const;

export type ComparisonSelection = {
  spending?: SpendingSelection;
  servers: boolean;
  serverMetric: (typeof serverMetrics)[number][0];
  search: string;
};

export function ComparisonBoard({
  selection,
  onChange,
}: {
  selection: ComparisonSelection;
  onChange: (selection: ComparisonSelection) => void;
}) {
  const { spending, servers, serverMetric, search } = selection;
  const activeMetric = serverMetrics.find(([key]) => key === serverMetric) ?? serverMetrics[0];
  return (
    <SpendingDonut
      initial={spending}
      onSelectionChange={(value) => onChange({ ...selection, spending: value, servers: false })}
      search={search}
      onSearchChange={(value) => onChange({ ...selection, search: value })}
      servers={{
        active: servers,
        onChange: (active) => onChange({ ...selection, servers: active }),
        metricSelector: (
          <select
            aria-label="Comparison metric"
            className="h-9 max-w-full rounded-md border bg-card px-2 text-sm"
            value={serverMetric}
            onChange={(event) =>
              onChange({ ...selection, serverMetric: event.target.value as typeof serverMetric })
            }
          >
            {serverMetrics.map(([key, label, unit]) => (
              <option value={key} key={key}>
                {label} ({unit})
              </option>
            ))}
          </select>
        ),
        chart: <ServerComparison metric={activeMetric} search={search} />,
      }}
    />
  );
}

function ServerComparison({
  metric: [metric, _label, unit],
  search,
}: {
  metric: (typeof serverMetrics)[number];
  search: string;
}) {
  const resources = useResources();
  const [selection, setSelection] = useState<{ label: string } | "methodology" | null>(null);
  return (
    <>
      <EvidenceInfoButton
        description="server comparison"
        onClick={() => setSelection("methodology")}
      />
      <Q q={resources}>
        {(data) => {
          const entities = new Map(
            data.map((resource) => [`${resource.name} · ${resource.id}`, resource]),
          );
          const rows: Breakdown[] = Array.from(entities.keys(), (label) => ({
            label,
            costChf: null,
            energyKwh: null,
            co2Kg: null,
          }));
          return (
            <DonutBreakdown
              rows={rows}
              metric="costChf"
              unit={unit}
              search={search}
              rule={
                metric === "idleCostChfYear"
                  ? "Estimated annual idle cost supplied for the resources in view."
                  : "Source-reported resource utilization for the last 30 days."
              }
              comparisonOnly={unit === "%"}
              valueFor={({ label }) => entities.get(label)?.[metric] ?? null}
              entityDetails={({ label }) => {
                const resource = entities.get(label);
                return resource ? <ResourceDetails key={resource.id} resource={resource} /> : null;
              }}
              inspector={{ selection, setSelection }}
            />
          );
        }}
      </Q>
    </>
  );
}
