import type { Kpi, ResourceSummary } from "@/lib/api/types";
import { useMeasures } from "@/lib/queries";
import { runtimeSegments } from "@/lib/planning";
import { CalcInfo, Q } from "./ui";
import { MeasureCard } from "./measure-card";
import { DetailBlock } from "./details";
import { EmissionMetric } from "./emissions-evidence";
import { chf, kwh } from "@/lib/format";

const HOURS = 720;
const hour = (n?: number | null) => (n == null ? "Unavailable" : `${Number(n.toFixed(1))} h`);
const width = (part: number | null) => `${Math.min(100, ((part ?? 0) / HOURS) * 100)}%`;
const UNKNOWN_FILL = "repeating-linear-gradient(135deg, #d97706 0 3px, #fcd34d 3px 6px)";

function UtilizationMeter({ label, value }: { label: string; value?: number | null }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span>{label}</span>
      {value != null && (
        <span className="h-1.5 w-16 overflow-hidden rounded bg-muted" aria-hidden="true">
          <span className="block h-full bg-violet-500" style={{ width: `${value}%` }} />
        </span>
      )}
      <span className="num">{value == null ? "Unavailable" : `${value}%`}</span>
    </span>
  );
}

function ConsumptionMetric({ label, kpi, format }: { label: string; kpi?: Kpi | null; format: typeof chf }) {
  return (
    <div>
      <p className="font-medium">{label} · {kpi ? format(kpi.value.mid) : "Unavailable"}</p>
      {kpi && (
        <>
          <p className="text-muted-foreground">{kpi.calc.period}{kpi.coverage && ` · ${kpi.coverage}`}</p>
          {kpi.value.low !== kpi.value.high && (
            <p className="text-muted-foreground">Range {format(kpi.value.low)}–{format(kpi.value.high)}</p>
          )}
          <CalcInfo calc={kpi.calc} />
        </>
      )}
    </div>
  );
}

export function ResourceDetails({ resource: r }: { resource: ResourceSummary }) {
  const ms = useMeasures();
  const parts = runtimeSegments(r.runtimeH30d, r.activeH30d, r.unclassifiedRuntimeH30d ?? 0);
  return (
    <div className="space-y-5">
      <DetailBlock title="Resource">
        <p>
          {r.name} · {r.id}
        </p>
        <p className="text-muted-foreground">
          {r.provider} · {r.location} · {r.environment} · {r.department}
          {r.vcpu != null && ` · ${r.vcpu} vCPU`}
        </p>
      </DetailBlock>
      <DetailBlock title="Last 30 days">
        <p className="font-medium">Running time · {hour(r.runtimeH30d)}</p>
        {r.runtimeH30d != null && (
          <div data-runtime-track className="mt-2 flex h-3 overflow-hidden rounded bg-muted" aria-hidden="true">
            <span className="bg-emerald-600" style={{ width: width(parts.active) }} />
            <span className="bg-sky-500" style={{ width: width(parts.inactive) }} />
            <span style={{ width: width(parts.unknown), background: UNKNOWN_FILL }} />
          </div>
        )}
        <ul className="my-3 space-y-1">
          <li className="flex items-center gap-2"><span className="size-3 rounded bg-emerald-600" aria-hidden="true" />Recorded active workload · {hour(parts.active)}</li>
          <li className="flex items-center gap-2"><span className="size-3 rounded bg-sky-500" aria-hidden="true" />Running without recorded workload · {hour(parts.inactive)}</li>
          {parts.unknown != null && parts.unknown > 0 && (
            <li className="flex items-center gap-2"><span className="size-3 rounded" style={{ background: UNKNOWN_FILL }} aria-hidden="true" />Running with unknown active use · {hour(parts.unknown)}</li>
          )}
        </ul>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <UtilizationMeter label="Average CPU" value={r.cpuAvgPct ?? null} />
          <UtilizationMeter label="Average GPU" value={r.gpuAvgPct ?? null} />
        </div>
        {r.runtimeEvidence && (
          <div className="mt-2 space-y-1 text-muted-foreground">
            <p>{r.runtimeEvidence.method}</p>
            {r.runtimeEvidence.observedDays != null && (
              <p>{r.runtimeEvidence.from} to {r.runtimeEvidence.through} · {r.runtimeEvidence.observedDays}/30 days covered</p>
            )}
            {r.runtimeEvidence.source && <p>Runtime source · {r.runtimeEvidence.source}</p>}
            {r.runtimeEvidence.cpuSource && <p>CPU source · {r.runtimeEvidence.cpuSource}</p>}
            {r.runtimeEvidence.gpuSource && <p>GPU source · {r.runtimeEvidence.gpuSource}</p>}
          </div>
        )}
      </DetailBlock>
      <DetailBlock title="Consumption and cost">
        <div className="space-y-3">
          <ConsumptionMetric label="Normalized cost" kpi={r.cost ?? null} format={chf} />
          <ConsumptionMetric label="Energy estimate" kpi={r.energy ?? null} format={kwh} />
          <p>Estimated idle cost · {r.idleCostChfYear == null ? "Unavailable" : `${chf(r.idleCostChfYear)} / year`}</p>
        </div>
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
          Check workload dependencies, ticket protections and owner approval before changing runtime.
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
