import { CheckCircle2, ShieldAlert } from "lucide-react";
import type { SimulationResult } from "@/lib/api/types";
import { api } from "@/lib/api/client";
import { chf, kg, pct } from "@/lib/format";
import { marketCoverageLabel } from "@/lib/analytics";
import { TargetProgress } from "./ui";
import { TARGETS } from "@/lib/optimizer";
export function TargetPanel({ r, compact = false }: { r: SimulationResult; compact?: boolean }) {
  const constraints = [
    {
      label: "Location-based CO₂ reduction",
      achieved: r.co2ReductionPct,
      target: TARGETS.co2Pct,
      unit: "%",
      direction: "atLeast" as const,
    },
    {
      label: "Annual cost reduction",
      achieved: r.costReductionPct,
      target: TARGETS.costPct,
      unit: "%",
      direction: "atLeast" as const,
    },
    {
      label: "Implementation effort",
      achieved: r.effortDays,
      target: TARGETS.maxPersonDays,
      unit: "PD",
      direction: "atMost" as const,
    },
    {
      label: "Implementation budget",
      achieved: r.effortChf,
      target: TARGETS.budgetChf,
      unit: "CHF",
      direction: "atMost" as const,
    },
  ];
  return (
    <div className={compact ? "grid gap-5 md:grid-cols-2" : "space-y-5"}>
      {constraints.map((c) => (
        <div key={c.label}>
          {!Number.isFinite(c.achieved) ? (
            <p className="text-sm text-muted-foreground">{c.label}: Cannot calculate</p>
          ) : (
            <>
              <TargetProgress
                label={c.label}
                achieved={c.achieved}
                target={c.target}
                direction={c.direction}
                unitLabel={(n) =>
                  c.unit === "%"
                    ? pct(n)
                    : c.unit === "CHF"
                      ? chf(n)
                      : `${n.toFixed(1)} person-days`
                }
              />
              <p className="mt-2 text-xs text-muted-foreground">
                {c.direction === "atLeast"
                  ? `${c.achieved >= c.target ? "Achieved" : "Not achieved"} · ${Math.abs(c.target - c.achieved).toFixed(1)} percentage points ${c.achieved >= c.target ? "exceeded" : "remaining"}`
                  : `${c.achieved <= c.target ? "Within limit" : "Exceeded"} · ${c.unit === "CHF" ? chf(Math.abs(c.target - c.achieved)) : `${Math.abs(c.target - c.achieved).toFixed(1)} person-days`} ${c.achieved <= c.target ? "remaining" : "over limit"}`}
              </p>
            </>
          )}
        </div>
      ))}
      {r.marketCoverage && (
        <div className={`border-t pt-3 text-sm ${compact ? "md:col-span-2" : ""}`}>
          <p>Market-based CO₂e savings · {kg(r.savingsCo2KgMarket)}{r.savingsCo2KgMarket != null && " per year"}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {marketCoverageLabel(r.marketCoverage)}{" "}
            {r.marketCoverage.status === "partial" && "Savings are a covered subtotal."}
          </p>
          {r.marketCoverage.missingInputs.map((s) => (
            <p key={s} className="mt-1 text-xs text-muted-foreground">{s}</p>
          ))}
        </div>
      )}
      <div className={`flex gap-2 border-t pt-3 text-sm ${compact ? "md:col-span-2" : ""}`}>
        {r.feasible ? (
          <CheckCircle2 className="size-4 shrink-0 text-success" />
        ) : (
          <ShieldAlert className="size-4 shrink-0 text-warning" />
        )}
        <div>
          <p className="font-medium">
            {r.feasible
              ? api.isDemo
                ? "Demo projection meets numerical targets"
                : "Projected package meets calculated targets"
              : "Selected plan does not meet every target"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {api.isDemo
              ? "Illustrative calculation only; not authoritative feasibility."
              : "Human approvals and operational checks remain required."}
          </p>
          {!r.feasible && (
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {r.reasons.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
