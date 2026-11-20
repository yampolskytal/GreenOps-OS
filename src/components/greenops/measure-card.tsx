import { useState } from "react";
import { ChevronDown, Plus, Check, Lock } from "lucide-react";
import type { Measure } from "@/lib/api/types";
import { chf, kg, kwh } from "@/lib/format";
import { useApp, toggleId } from "@/lib/store";
import { cn } from "@/lib/utils";
import { EvidencePopover, RiskBadge } from "./ui";

/** Recommendation + Safety Shield details. Planning only — nothing is executed. */
export function MeasureCard({ m, compact = false }: { m: Measure; compact?: boolean }) {
  const { s, set } = useApp(); const [open, setOpen] = useState(false);
  const inPlan = s.measureIds.includes(m.id); const blocked = m.risk.level === "blocked" || !m.includable;
  return (
    <article id={`measure-${m.id}`} className={cn("card-elevated p-4 transition", inPlan && "shadow-glow", blocked && "opacity-90")}>
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2"><span className="num text-xs text-muted-foreground">{m.id}</span><RiskBadge level={m.risk.level} /><span className="text-[11px] text-muted-foreground">{m.service}</span></div>
          <h4 className="mt-1.5 font-semibold">{m.title}</h4>
          {!compact && <p className="mt-0.5 text-sm text-muted-foreground">{m.description}</p>}
        </div>
        <button
          disabled={blocked}
          onClick={() => set({ measureIds: toggleId(s.measureIds, m.id) })}
          className={cn("inline-flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition",
            blocked ? "cursor-not-allowed border-destructive/40 text-destructive" : inPlan ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary hover:text-primary")}
        >
          {blocked ? <><Lock className="h-3.5 w-3.5" />Can't add</> : inPlan ? <><Check className="h-3.5 w-3.5" />In plan</> : <><Plus className="h-3.5 w-3.5" />Add to plan</>}
        </button>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
        {[["Saves / yr", chf(m.savingsChf), "text-info"], ["CO₂ / yr", kg(m.savingsCo2KgLocation), "text-success"], ["Energy / yr", kwh(m.savingsKwh), "text-primary"], ["Effort", `${m.effortPersonDays} PD`, "text-foreground"]].map(([l, v, c]) => (
          <div key={l} className="rounded-lg bg-muted/60 px-2 py-1.5"><p className="text-[10px] text-muted-foreground">{l}</p><p className={cn("num text-sm font-medium", c)}>{v}</p></div>
        ))}
      </div>
      <button onClick={() => setOpen(!open)} className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ChevronDown className={cn("h-3.5 w-3.5 transition", open && "rotate-180")} />Safety Shield details
      </button>
      {open && (
        <div className="rise-in mt-3 space-y-2 border-t pt-3 text-sm">
          <Row k="Why this risk" v={m.risk.why} />
          <Row k="Possible consequences" v={m.risk.consequences} />
          <Row k="Protection windows" v={m.risk.protectionWindows.join(" · ") || "None known"} />
          <Row k="Conflicting evidence" v={m.risk.conflicts.join(" · ") || "None found"} />
          <Row k="Needs approval from" v={m.risk.approver ?? "Unknown — hand over to a human"} />
          <Row k="Planned change" v={m.change} />
          <Row k="Can be in the package" v={blocked ? "No — blocked as proposed" : m.risk.level === "review" ? "Yes, after human approval" : "Yes"} />
          <div className="flex items-center justify-between pt-1"><EvidencePopover evidence={m.evidence} /><span className="text-[11px] text-muted-foreground">Planned improvement only — nothing is switched off.</span></div>
        </div>
      )}
    </article>
  );
}
function Row({ k, v }: { k: string; v: string }) { return <div className="grid grid-cols-[140px_1fr] gap-2"><span className="text-xs text-muted-foreground">{k}</span><span>{v}</span></div>; }
