import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Wand2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/greenops/shell";
import { ChartCard, DemoTag, Q, riskMeta } from "@/components/greenops/ui";
import { BudgetSlider } from "@/components/greenops/portfolio";
import { TargetPanel } from "@/components/greenops/targets";
import { MeasureCard } from "@/components/greenops/measure-card";
import { api } from "@/lib/api/client";
import type { Priority, RiskLevel } from "@/lib/api/types";
import { useMeasures, useSimulation } from "@/lib/queries";
import { useApp, useGlobalQuery } from "@/lib/store";
import { chf, kchf, kg, pct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/studio")({
  head: () => seo("Optimization Studio — GreenOps OS", "Build a package of measures within budget and check it against the CO₂ and cost targets."),
  component: Studio,
});
const PRIOS: { id: Priority; label: string }[] = [{ id: "balanced", label: "Balanced" }, { id: "cost", label: "Cost first" }, { id: "co2", label: "CO₂ first" }];

function Studio() {
  const { s, set } = useApp(); const q = useGlobalQuery(); const ms = useMeasures(); const sim = useSimulation();
  const alts = useQuery({ queryKey: ["alts", q, s.budgetChf], queryFn: () => Promise.all(PRIOS.map((p) => api.optimize(q, { budgetChf: s.budgetChf, priority: p.id, chfPerPersonDay: 1100 }))) });
  const auto = async () => {
    const r = await api.optimize(q, { budgetChf: s.budgetChf, priority: s.priority, chfPerPersonDay: 1100 });
    set({ measureIds: r.measureIds });
    if (r.result.feasible) toast.success("Package found that meets all targets"); else toast.warning("No package meets all targets with this budget", { description: r.result.reasons[0] });
  };
  return (
    <AppShell kicker="Optimization Studio" title="Build your package of measures" subtitle="Choose a budget and a priority. The package is only marked as successful when the calculation confirms all constraints."
      actions={<DemoTag />}>
      <div className="grid gap-6 xl:grid-cols-5">
        <ChartCard title="Settings" className="xl:col-span-2">
          <BudgetSlider />
          <p className="mb-2 mt-6 text-sm">Priority</p>
          <div className="inline-flex rounded-lg border bg-surface p-0.5">{PRIOS.map((p) => <button key={p.id} onClick={() => set({ priority: p.id })} className={cn("rounded-md px-3 py-1.5 text-xs font-medium", s.priority === p.id ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{p.label}</button>)}</div>
          <button onClick={auto} className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-primary py-2.5 text-sm font-semibold text-primary-foreground"><Wand2 className="h-4 w-4" />Suggest best package for this budget</button>
          <p className="mt-2 text-[11px] text-muted-foreground">Blocked measures are never suggested. Measures that need review stay flagged.</p>
        </ChartCard>
        <ChartCard title="Constraints" subtitle={sim.data ? `${s.measureIds.length} measures selected · ${chf(sim.data.savingsChf)} / ${kg(sim.data.savingsCo2Kg)} saved per year` : undefined} className="xl:col-span-3">
          <Q q={sim}>{(r) => <>
            <TargetPanel r={r} />
            {r.excluded.length > 0 && <div className="mt-3 text-xs text-muted-foreground"><b className="text-destructive">Excluded:</b> {r.excluded.map((e) => `${e.id} — ${e.reason}`).join(" · ")}</div>}
          </>}</Q>
        </ChartCard>
      </div>
      <ChartCard title="Compare alternative packages" subtitle={`Best packages the optimizer finds for ${chf(s.budgetChf)}`} className="mt-6">
        <Q q={alts}>{(list) => <div className="grid gap-4 md:grid-cols-3">{list.map((a, i) => (
          <div key={PRIOS[i]!.id} className={cn("rounded-xl border p-4", a.result.feasible ? "border-success/50" : "border-warning/40")}>
            <div className="flex items-center justify-between"><p className="font-semibold">{PRIOS[i]!.label}</p><span className={cn("text-xs font-semibold", a.result.feasible ? "text-success" : "text-warning")}>{a.result.feasible ? "Meets targets" : "Infeasible"}</span></div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">{[["Cost", pct(a.result.costReductionPct)], ["CO₂", pct(a.result.co2ReductionPct)], ["Effort", kchf(a.result.effortChf)]].map(([l, v]) => <div key={l} className="rounded bg-muted/60 py-1.5"><p className="text-muted-foreground">{l}</p><p className="num">{v}</p></div>)}</div>
            <p className="num mt-3 text-[11px] text-muted-foreground">{a.measureIds.join(" · ") || "—"}</p>
            <button onClick={() => set({ measureIds: a.measureIds })} className="mt-3 w-full rounded-lg border py-1.5 text-xs hover:border-primary">Use this package</button>
          </div>
        ))}</div>}</Q>
      </ChartCard>
      <div className="mb-4 mt-10 flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /><h2 className="text-xl font-semibold">Safety Shield</h2><span className="text-sm text-muted-foreground">— planning only, nothing is executed on live systems</span></div>
      <Q q={ms}>{(all) => <div className="grid gap-6 xl:grid-cols-3">{(["low", "review", "blocked"] as RiskLevel[]).map((lvl) => (
        <div key={lvl}><p className={cn("mb-3 text-sm font-semibold", lvl === "low" ? "text-success" : lvl === "review" ? "text-warning" : "text-destructive")}>{riskMeta[lvl].label} · {all.filter((m) => m.risk.level === lvl).length}</p>
          <div className="space-y-3">{all.filter((m) => m.risk.level === lvl).map((m) => <MeasureCard key={m.id} m={m} compact />)}</div></div>
      ))}</div>}</Q>
    </AppShell>
  );
}
