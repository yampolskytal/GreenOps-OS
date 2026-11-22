import { CheckCircle2, MinusCircle, XCircle } from "lucide-react";
import type { Constraint, Overview, SimulationResult } from "@/lib/api/types";
import { gaugeGeometry } from "@/lib/administration";
import { chf, formatNumber, pct } from "@/lib/format";
import { DetailBlock, DetailDrawer, EvidenceInfoButton } from "./details";
import { PlanOutcomes } from "./plan-outcomes";
import { TargetProgress } from "./ui";

function TargetStatus({ label, met }: { label: string; met: boolean | null }) {
  const Icon = met == null ? MinusCircle : met ? CheckCircle2 : XCircle;
  const status = met == null ? "unavailable" : met ? "target met" : "target missed";
  return (
    <span
      role="img"
      aria-label={`${label} · ${status}`}
      title={status}
      className="inline-flex shrink-0 items-center"
    >
      <Icon
        aria-hidden
        className={`size-4 ${met == null ? "text-muted-foreground" : met ? "text-success" : "text-destructive"}`}
      />
    </span>
  );
}

function meetsTarget(actual: number, limit: number | undefined, direction: "atLeast" | "atMost") {
  if (!Number.isFinite(actual) || limit == null || !Number.isFinite(limit)) return null;
  return direction === "atLeast" ? actual >= limit : actual <= limit;
}

export function AdministrationScorecard({
  overview,
  result,
  suggested,
}: {
  overview: Overview;
  result: SimulationResult;
  suggested: boolean;
}) {
  const carbon = result.constraints.find((c) => c.unit === "%" && /CO₂|CO2/i.test(c.label));
  const cost = result.constraints.find((c) => c.unit === "%" && /cost/i.test(c.label));
  const effort = result.constraints.find((c) => c.unit === "PD");
  const budget = result.constraints.find((c) => c.unit === "CHF");
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <ReductionGauge
          label="Carbon reduction"
          actual={result.co2ReductionPct}
          target={carbon?.target}
        />
        <ReductionGauge
          label="Cost reduction"
          actual={result.costReductionPct}
          target={cost?.target}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Limit
          label="Implementation effort"
          actual={result.effortDays}
          constraint={effort}
          format={(n) => `${n.toFixed(1)} person-days`}
        />
        <Limit
          label="Implementation budget"
          actual={result.effortChf}
          constraint={budget}
          format={chf}
        />
      </div>
      <section className="border-t pt-3">
        <div className="mb-2 flex items-center gap-1">
          <h2 className="font-semibold">Annual baseline and projection</h2>
          <DetailDrawer
            title="Plan calculation and evidence"
            trigger={<EvidenceInfoButton description="the annual projection" />}
          >
            <DetailBlock title="Constraints">
              {result.constraints.map((c) => (
                <p key={c.label}>
                  {c.label} · {formatNumber(c.achieved)} / {formatNumber(c.target)} {c.unit}
                </p>
              ))}
            </DetailBlock>
            <DetailBlock title="Calculation notes">
              {result.reasons.length
                ? result.reasons.map((reason) => <p key={reason}>{reason}</p>)
                : "No additional notes supplied."}
            </DetailBlock>
            {result.excluded.length > 0 && (
              <DetailBlock title="Excluded measures">
                {result.excluded.map((m) => (
                  <p key={m.id}>
                    {m.id} · {m.reason}
                  </p>
                ))}
              </DetailBlock>
            )}
            <DetailBlock title="Baseline coverage">
              <p>Annual spending · {overview.cost.coverage ?? "Coverage unavailable"}</p>
              <p>Location-based CO₂ · {overview.co2Location.coverage ?? "Coverage unavailable"}</p>
            </DetailBlock>
            {(result.conservativeCo2Pct != null || result.excluded.length > 0) && (
              <DetailBlock title="Projection notes">
                {result.conservativeCo2Pct != null && (
                  <p>Conservative location-based reduction · {pct(result.conservativeCo2Pct)}</p>
                )}
                {result.excluded.length > 0 && (
                  <p>{result.excluded.length} measures excluded by the calculation.</p>
                )}
              </DetailBlock>
            )}
          </DetailDrawer>
        </div>
        <PlanOutcomes
          overview={overview}
          result={result}
          afterLabel={suggested ? "After suggested strategy" : "After Current Plan"}
          carbonFirst
          projectionFirst
        />
      </section>
    </div>
  );
}

function ReductionGauge({
  label,
  actual,
  target,
}: {
  label: string;
  actual: number;
  target: number | undefined;
}) {
  const met = meetsTarget(actual, target, "atLeast");
  const { arc, marker, scale } = gaugeGeometry(
    Number.isFinite(actual) ? actual : 0,
    target != null && Number.isFinite(target) ? target : 0,
  );
  const [x1, y1] = marker(70);
  const [x2, y2] = marker(96);
  return (
    <section className="card-elevated flex min-w-0 flex-col items-center px-3 py-3 text-center">
      <div className="grid w-full grid-cols-[1rem_minmax(0,1fr)_1rem] items-center gap-2">
        <TargetStatus label={label} met={met} />
        <h2 className="text-base font-semibold">{label}</h2>
      </div>
      <div className="relative my-1 aspect-square w-full max-w-40">
        <svg aria-hidden="true" viewBox="0 0 200 200" className="size-full">
          <circle
            cx="100"
            cy="100"
            r="83"
            fill="none"
            className="stroke-muted-foreground/25"
            strokeWidth="13"
          />
          {arc > 0 && (
            <circle
              cx="100"
              cy="100"
              r="83"
              fill="none"
              stroke="#C8FA50"
              strokeWidth="13"
              strokeLinecap="round"
              pathLength="100"
              strokeDasharray={`${arc} 100`}
              transform="rotate(-90 100 100)"
            />
          )}
          {target != null && Number.isFinite(target) && (
            <g>
              <path
                d={`M ${x1} ${y1} L ${x2} ${y2}`}
                className="stroke-background"
                strokeWidth="6"
                strokeLinecap="round"
              />
              <path
                d={`M ${x1} ${y1} L ${x2} ${y2}`}
                className="stroke-foreground"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </g>
          )}
        </svg>
        <div className="absolute inset-0 grid content-center">
          <p className="num text-2xl font-semibold sm:text-3xl">{pct(actual)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {target == null || !Number.isFinite(target)
              ? "Target unavailable"
              : `Target ${pct(target)}`}
          </p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Scale 0–{formatNumber(scale)}%{actual < 0 && " · increase"}
      </p>
    </section>
  );
}

function Limit({
  label,
  actual,
  constraint,
  format,
}: {
  label: string;
  actual: number;
  constraint: Constraint | undefined;
  format: (value: number) => string;
}) {
  const met = meetsTarget(actual, constraint?.target, "atMost");
  const icon = <TargetStatus label={label} met={met} />;
  return (
    <section className="min-w-0 px-1 py-1">
      {constraint && met != null && constraint.target > 0 ? (
        <TargetProgress
          label={label}
          achieved={actual}
          target={constraint.target}
          direction="atMost"
          unitLabel={format}
          statusIcon={icon}
        />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-1.5">
            {icon}
            {label}
          </span>
          <span className="num text-xs">
            {Number.isFinite(actual) ? format(actual) : "Unavailable"} /{" "}
            {constraint && Number.isFinite(constraint.target)
              ? format(constraint.target)
              : "limit unavailable"}
          </span>
        </div>
      )}
      {constraint && met != null && (
        <p className={`mt-2 text-xs ${met ? "text-muted-foreground" : "text-destructive"}`}>
          {met ? "Within limit" : `${format(actual - constraint.target)} over limit`}
        </p>
      )}
    </section>
  );
}
