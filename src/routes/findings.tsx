import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Check } from "lucide-react";
import { AppShell } from "@/components/greenops/shell";
import { BarList, ChartCard, EvidencePopover, Q, RiskBadge } from "@/components/greenops/ui";
import { useBreakdowns, useFindings } from "@/lib/queries";
import type { Breakdowns, Finding } from "@/lib/api/types";
import { useApp, toggleId } from "@/lib/store";
import { kchf, kg, kwh } from "@/lib/format";
import { cn } from "@/lib/utils";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/findings")({
  head: () => seo("Waste findings — GreenOps OS", "Biggest cost and energy drivers and candidates for review, with evidence and risk."),
  component: Findings,
});
const DIMS: { id: keyof Omit<Breakdowns, "allocationRule">; label: string }[] = [{ id: "byDepartment", label: "Department" }, { id: "byTool", label: "Tool" }, { id: "byProvider", label: "Provider" }, { id: "byService", label: "Service" }];
const CATS: { id: Finding["category"] | "all"; label: string }[] = [{ id: "all", label: "All" }, { id: "servers", label: "Servers" }, { id: "data-platform", label: "Data platform" }, { id: "saas", label: "SaaS" }, { id: "ai-models", label: "AI models" }, { id: "ci", label: "Pipelines" }, { id: "logs", label: "Logs" }, { id: "reports", label: "Reports" }, { id: "conflict", label: "Conflicts" }];

function Findings() {
  const fs = useFindings(); const br = useBreakdowns(); const { s, set } = useApp();
  const [dim, setDim] = useState<(typeof DIMS)[number]["id"]>("byDepartment"); const [metric, setMetric] = useState<"costChf" | "co2Kg">("co2Kg"); const [cat, setCat] = useState<(typeof CATS)[number]["id"]>("all");
  return (
    <AppShell kicker="Find" title="Biggest drivers and waste" subtitle="A finding is a candidate for review, not proof that a resource can be removed.">
      <ChartCard title="Biggest drivers" action={<div className="flex gap-1">{(["co2Kg", "costChf"] as const).map((m) => <button key={m} onClick={() => setMetric(m)} className={cn("rounded-md px-2.5 py-1 text-xs", metric === m ? "bg-primary text-primary-foreground" : "border")}>{m === "co2Kg" ? "CO₂" : "Cost"}</button>)}</div>}>
        <div className="mb-4 flex flex-wrap gap-1">{DIMS.map((d) => <button key={d.id} onClick={() => setDim(d.id)} className={cn("rounded-full px-3 py-1 text-xs", dim === d.id ? "bg-secondary text-foreground" : "text-muted-foreground")}>{d.label}</button>)}</div>
        <Q q={br}>{(b) => <BarList items={[...b[dim]].sort((x, y) => y[metric] - x[metric]).map((x) => ({ label: x.label, value: x[metric] }))} format={metric === "co2Kg" ? kg : kchf} color={metric === "co2Kg" ? "bg-success" : "bg-info"} />}</Q>
      </ChartCard>
      <div className="mb-4 mt-8 flex flex-wrap gap-1">{CATS.map((c) => <button key={c.id} onClick={() => setCat(c.id)} className={cn("rounded-full border px-3 py-1 text-xs", cat === c.id ? "border-primary text-primary" : "text-muted-foreground")}>{c.label}</button>)}</div>
      <Q q={fs}>{(all) => <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{all.filter((f) => cat === "all" || f.category === cat).sort((a, b) => b.impactChfYear - a.impactChfYear).map((f) => {
        const inPlan = !!f.measureId && s.measureIds.includes(f.measureId); const blocked = f.risk === "blocked";
        return (
          <article key={f.id} className="card-elevated rise-in flex flex-col p-5">
            <div className="flex items-center gap-2"><RiskBadge level={f.risk} /><span className="text-[11px] text-muted-foreground">{f.resource}</span></div>
            <h3 className="mt-2 font-semibold">{f.title}</h3>
            <p className="mt-1 flex-1 text-sm text-muted-foreground">{f.description}</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">{[["CHF/yr", kchf(f.impactChfYear), "text-info"], ["CO₂/yr", kg(f.impactCo2KgYear), "text-success"], ["Energy", kwh(f.impactKwhYear), "text-primary"]].map(([l, v, c]) => <div key={l} className="rounded bg-muted/60 py-1.5"><p className="text-muted-foreground">{l}</p><p className={cn("num", c)}>{v}</p></div>)}</div>
            <p className="mt-3 text-xs"><span className="text-muted-foreground">Recommended: </span>{f.action}</p>
            {f.assumptions.length > 0 && <p className="mt-1 text-[11px] text-muted-foreground">Assumes: {f.assumptions.join("; ")}</p>}
            <div className="mt-3 flex items-center justify-between"><EvidencePopover evidence={f.evidence} />
              {f.measureId && <button disabled={blocked} onClick={() => set({ measureIds: toggleId(s.measureIds, f.measureId!) })} className={cn("inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs", blocked ? "cursor-not-allowed text-destructive" : inPlan ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary")}>{blocked ? "Blocked" : inPlan ? <><Check className="h-3.5 w-3.5" />In plan</> : <><Plus className="h-3.5 w-3.5" />Add to plan</>}</button>}
            </div>
          </article>
        );
      })}</div>}</Q>
    </AppShell>
  );
}
