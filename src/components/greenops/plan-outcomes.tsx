import type { Overview, SimulationResult } from "@/lib/api/types";
import { chf, kg, pct } from "@/lib/format";

export function PlanOutcomes({
  overview,
  result,
  afterLabel = "After Current Plan",
  compact = false,
}: {
  overview: Overview;
  result: SimulationResult;
  afterLabel?: string;
  compact?: boolean;
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
    <div className="grid gap-8 md:grid-cols-2">
      {metrics.map((m) => {
        const after = m.baseline - m.savings;
        const max = Math.max(m.baseline, after, 1);
        if (![m.baseline, m.savings, after].every(Number.isFinite) || after < 0)
          return <p key={m.label}>{m.label}: Cannot calculate</p>;
        return (
          <section key={m.label} className="min-w-0">
            <h3 className="mb-4 text-sm font-medium">{m.label}</h3>
            {[
              { label: "Baseline", value: m.baseline, fill: "bg-muted-foreground" },
              { label: afterLabel, value: after, fill: "bg-primary" },
            ].map((row) => (
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
            {!compact && (
              <p className="num mt-3 text-sm text-success">
                {m.format(m.savings)} saved · {pct(m.percentage)} reduction
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
