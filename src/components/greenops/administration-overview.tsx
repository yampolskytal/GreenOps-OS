import type { ReactNode } from "react";
import type { Constraint, Measure, Overview, SimulationResult } from "@/lib/api/types";
import { decisionGroup, gaugeGeometry } from "@/lib/administration";
import { chf, kg, pct } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { DetailBlock, DetailDrawer } from "./details";
import { PlanOutcomes } from "./plan-outcomes";
import { TargetProgress } from "./ui";

export function ReviewSummary({
  measures,
  onReviews,
}: {
  measures: Measure[];
  onReviews: () => void;
}) {
  const count = measures.filter((m) => decisionGroup(m) === "review").length;
  return (
    <Button variant="outline" className="h-auto whitespace-normal text-left" onClick={onReviews}>
      {count} {count === 1 ? "recommendation requires" : "recommendations require"} human review
    </Button>
  );
}

export function AdministrationScorecard({
  overview,
  result,
  suggested,
  reviewSummary,
}: {
  overview: Overview;
  result: SimulationResult;
  suggested: boolean;
  reviewSummary: ReactNode;
}) {
  const carbon = result.constraints.find((c) => c.unit === "%" && /CO₂|CO2/i.test(c.label));
  const cost = result.constraints.find((c) => c.unit === "%" && /cost/i.test(c.label));
  const effort = result.constraints.find((c) => c.unit === "PD");
  const budget = result.constraints.find((c) => c.unit === "CHF");
  const achieved = result.constraints.filter((c) => c.met).length;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <ReductionGauge
          label="Carbon reduction"
          actual={result.co2ReductionPct}
          target={carbon?.target}
          savings={kg(result.savingsCo2Kg)}
        />
        <ReductionGauge
          label="Cost reduction"
          actual={result.costReductionPct}
          target={cost?.target}
          savings={chf(result.savingsChf)}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
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
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
        <div>
          <p className="font-semibold">
            {result.constraints.length
              ? `${achieved} of ${result.constraints.length} numerical targets achieved`
              : "Numerical targets unavailable"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Operational eligibility and human approvals remain separate.
          </p>
          {result.excluded.length > 0 && (
            <p className="mt-1 text-xs text-warning">
              {result.excluded.length} measures excluded by the calculation.
            </p>
          )}
          {result.conservativeCo2Pct != null && (
            <p className="mt-1 text-xs text-muted-foreground">
              Conservative location-based reduction · {pct(result.conservativeCo2Pct)}
            </p>
          )}
        </div>
        {reviewSummary}
        <DetailDrawer
          title="Plan calculation and evidence"
          trigger={
            <Button size="sm" variant="outline">
              Calculation &amp; Evidence
            </Button>
          }
        >
          <DetailBlock title="Constraints">
            {result.constraints.map((c) => (
              <p key={c.label}>
                {c.label} · {c.achieved.toLocaleString("en-CH")} /{" "}
                {c.target.toLocaleString("en-CH")} {c.unit}
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
        </DetailDrawer>
      </div>
      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-4 font-semibold">Annual baseline and projection</h2>
        <PlanOutcomes
          overview={overview}
          result={result}
          afterLabel={suggested ? "Suggested strategy" : "Current Plan"}
          compact
        />
      </section>
    </div>
  );
}

function ReductionGauge({
  label,
  actual,
  target,
  savings,
}: {
  label: string;
  actual: number;
  target: number | undefined;
  savings: string;
}) {
  const { arc, marker, scale } = gaugeGeometry(actual, target ?? 0);
  const [x1, y1] = marker(70);
  const [x2, y2] = marker(96);
  return (
    <section className="flex min-w-0 flex-col items-center rounded-xl border bg-card p-5 text-center">
      <h2 className="text-base font-semibold">{label}</h2>
      <div className="relative my-3 aspect-square w-full max-w-48">
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
          {target != null && (
            <g>
              <path
                d={`M ${x1} ${y1} L ${x2} ${y2}`}
                className="stroke-card"
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
            {target == null ? "Target unavailable" : `Target ${pct(target)}`}
          </p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Scale 0–{scale.toLocaleString("en-CH")}%{actual < 0 && " · increase"}
      </p>
      <p className="num mt-2 font-semibold text-success">{savings} projected savings / year</p>
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
  return (
    <section className="rounded-lg border bg-card p-4">
      {constraint && constraint.target > 0 ? (
        <TargetProgress
          label={label}
          achieved={actual}
          target={constraint.target}
          direction="atMost"
          unitLabel={format}
        />
      ) : (
        <p className="text-sm">
          {label} · {format(actual)} /{" "}
          {constraint ? format(constraint.target) : "limit unavailable"}
        </p>
      )}
      {constraint && (
        <p
          className={`mt-2 text-xs ${actual > constraint.target ? "text-destructive" : "text-muted-foreground"}`}
        >
          {actual > constraint.target
            ? `${format(actual - constraint.target)} over limit`
            : "Within limit"}
        </p>
      )}
    </section>
  );
}
