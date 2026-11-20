import { CheckCircle2, XCircle } from "lucide-react";
import type { SimulationResult } from "@/lib/api/types";
import { chf, pct } from "@/lib/format";
import { TargetProgress } from "./ui";

export function TargetPanel({ r }: { r: SimulationResult }) {
  return (
    <div className="space-y-4">
      {r.constraints.map((c) => (
        <TargetProgress key={c.label} label={c.label} achieved={c.achieved} target={c.target} direction={c.direction}
          unitLabel={(n) => (c.unit === "%" ? pct(n) : c.unit === "CHF" ? chf(n) : `${n.toFixed(1)} PD`)} />
      ))}
      <div className={r.feasible ? "flex items-start gap-2 rounded-lg border border-success/40 bg-success/10 p-3 text-sm" : "flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm"}>
        {r.feasible ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />}
        <div>{r.feasible ? <p><b>Package meets all targets</b> (according to the current calculation).</p> : <><p className="font-semibold">Not all targets are met yet</p><ul className="mt-1 list-disc pl-4 text-muted-foreground">{r.reasons.map((x) => <li key={x}>{x}</li>)}</ul></>}</div>
      </div>
    </div>
  );
}
