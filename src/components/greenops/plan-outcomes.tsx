import type { Overview, SimulationResult } from "@/lib/api/types";
import { chf, kg, pct } from "@/lib/format";

export function PlanOutcomes({
  overview,
  result,
  afterLabel = "After Current Plan",
  projectionFirst = false,
  carbonFirst = false,
}: {
  overview: Overview;
  result: SimulationResult;
  afterLabel?: string;
  projectionFirst?: boolean;
  carbonFirst?: boolean;
}) {
  const metrics = [
    {
      label: "Annual spending",
      baseline: overview.cost.value.mid,
      savings: result.savingsChf,
      percentage: result.costReductionPct,
      format: chf,
    },
    {
      label: "Location-based CO₂",
      baseline: overview.co2Location.value.mid,
      savings: result.savingsCo2Kg,
      percentage: result.co2ReductionPct,
      format: kg,
    },
  ];
  return (
    <div className="@container">
      <div className="grid gap-4 @xl:grid-cols-2">
        {(carbonFirst ? [...metrics].reverse() : metrics).map((m) => {
          const after = m.baseline - m.savings;
          const max = Math.max(m.baseline, after, 1);
          if (
            ![m.baseline, m.savings, after, m.percentage].every(Number.isFinite) ||
            m.baseline < 0 ||
            after < 0
          )
            return <p key={m.label}>{m.label}: Cannot calculate</p>;
          const increase = m.savings < 0 || m.percentage < 0;
          const projection = { label: afterLabel, value: after, fill: "bg-primary" };
          const baseline = { label: "Baseline", value: m.baseline, fill: "bg-muted-foreground" };
          const rows = projectionFirst ? [projection, baseline] : [baseline, projection];
          return (
            <section key={m.label} className="min-w-0">
              <h3 className="mb-4 text-sm font-medium">{m.label}</h3>
              {rows.map((row) => (
                <div key={row.label} className="mb-3">
                  <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] gap-3 text-xs">
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className="num">{m.format(row.value)}</span>
                  </div>
                  <div data-outcome-track className="h-3 w-full overflow-hidden rounded bg-muted">
                    <div
                      className={`h-full ${row.fill}`}
                      style={{ width: `${(row.value / max) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
              <p
                className={`num mt-2 text-sm ${increase ? "text-warning" : m.savings > 0 ? "text-success" : "text-muted-foreground"}`}
              >
                {m.format(Math.abs(m.savings))} {increase ? "added" : "saved"} ·{" "}
                {pct(Math.abs(m.percentage))} {increase ? "increase" : "reduction"}
              </p>
            </section>
          );
        })}
      </div>
    </div>
  );
}
