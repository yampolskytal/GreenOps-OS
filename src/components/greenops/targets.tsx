import { CheckCircle2, ShieldAlert } from "lucide-react";
import type { SimulationResult } from "@/lib/api/types";
import { api } from "@/lib/api/client";
import { chf, pct } from "@/lib/format";
import { TargetProgress } from "./ui";
export function TargetPanel({ r }: { r: SimulationResult }) {
  const constraints = r.constraints.filter((c) => c.unit !== "CHF");
  return (
    <div className="space-y-5">
      {constraints.map((c) => (
        <div key={c.label}>
          <TargetProgress
            label={c.label}
            achieved={c.achieved}
            target={c.target}
            direction={c.direction}
            unitLabel={(n) => (c.unit === "%" ? pct(n) : `${n.toFixed(1)} PD`)}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            {c.direction === "atLeast"
              ? `Remaining gap: ${pct(Math.max(0, c.target - c.achieved))}`
              : `Remaining effort: ${Math.max(0, c.target - c.achieved).toFixed(1)} PD · used ${chf(r.effortChf)}`}
          </p>
        </div>
      ))}
      <div className="flex gap-2 border-t pt-3 text-sm">
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
