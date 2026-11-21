import type { ResourceSummary } from "@/lib/api/types";
import { useMeasures } from "@/lib/queries";
import { Q } from "./ui";
import { MeasureCard } from "./measure-card";
import { DetailBlock } from "./details";
import { EmissionMetric } from "./emissions-evidence";
import { chf } from "@/lib/format";
export function ResourceDetails({ resource: r }: { resource: ResourceSummary }) {
  const ms = useMeasures();
  return (
    <div className="space-y-5">
      <DetailBlock title="Resource">
        <p>
          {r.name} · {r.id}
        </p>
        <p className="text-muted-foreground">
          {r.provider} · {r.location} · {r.environment} · {r.department}
        </p>
      </DetailBlock>
      <DetailBlock title="Last 30 days">
        <p>
          Running: {r.runtimeH30d == null ? "Unavailable" : `${r.runtimeH30d} h`} · recorded active
          use: {r.activeH30d == null ? "Unavailable" : `${r.activeH30d} h`}
        </p>
        <p>
          CPU: {r.cpuAvgPct == null ? "—" : `${r.cpuAvgPct}%`} · GPU:{" "}
          {r.gpuAvgPct == null ? "—" : `${r.gpuAvgPct}%`}
        </p>
        <p>
          Estimated idle cost: {r.idleCostChfYear == null ? "Unavailable" : chf(r.idleCostChfYear)}
          /year
        </p>
      </DetailBlock>
      {(r.co2Location || r.co2Market) && (
        <>
          <EmissionMetric
            label="Location-based emissions"
            {...(r.co2Location ? { kpi: r.co2Location } : {})}
          />
          <EmissionMetric
            label="Market-based emissions"
            {...(r.co2Market ? { kpi: r.co2Market } : {})}
          />
        </>
      )}
      <DetailBlock title="Operational safety">
        <p>Criticality: {r.criticality}</p>
        {r.flag && <p className="text-warning">{r.flag}</p>}
        <p className="mt-2 text-muted-foreground">
          Inactive runtime alone does not establish that stopping this resource is safe. Historical
          utilization and resource-level energy totals are unavailable in the current summary.
        </p>
      </DetailBlock>
      <DetailBlock title="Related changes and evidence">
        <Q q={ms}>
          {(all) => {
            const related = all.filter(
              (m) =>
                m.resource.toLowerCase().includes(r.id.toLowerCase()) ||
                m.resource.toLowerCase().includes(r.name.toLowerCase()),
            );
            return related.length ? (
              <div className="space-y-3">
                {related.map((m) => (
                  <MeasureCard key={m.id} m={m} compact />
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">
                No linked recommendation or ticket evidence is available.
              </p>
            );
          }}
        </Q>
      </DetailBlock>
    </div>
  );
}
