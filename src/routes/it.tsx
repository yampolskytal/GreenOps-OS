import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { Server, Cpu, Gauge, Clock, ArrowRight, AlertTriangle, Leaf, GitBranch, Boxes } from "lucide-react";
import { AppShell } from "@/components/greenops/shell";
import { BarList, ChartCard, EmptyState, KpiCard, Q, RiskBadge } from "@/components/greenops/ui";
import { useBonus, useFindings, useMeasures, useQuality, useResources } from "@/lib/queries";
import type { ResourceSummary } from "@/lib/api/types";
import { chf, kchf, kg } from "@/lib/format";
import { cn } from "@/lib/utils";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/it")({
  head: () => seo("Technical Operations — GreenOps OS", "Servers, utilisation, idle costs, protection windows and safe resource-level recommendations."),
  component: It,
});
const tip = { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 };

function It() {
  const rs = useResources(); const fs = useFindings(); const ms = useMeasures(); const bonus = useBonus(); const dq = useQuality();
  const [sel, setSel] = useState<string | null>(null);
  return (
    <AppShell kicker="IT Manager · Technical Operations" title="What runs, what idles, what is protected" subtitle="Drill into any resource. Recommendations are proposals — nothing is changed automatically.">
      <Q q={rs}>{(res) => {
        const idle = res.reduce((a, r) => a + r.idleCostChfYear, 0);
        const avg = res.filter((r) => r.cpuAvgPct != null).reduce((a, r, _, xs) => a + (r.cpuAvgPct ?? 0) / xs.length, 0);
        const count = (k: keyof ResourceSummary) => Object.entries(res.reduce<Record<string, number>>((a, r) => ({ ...a, [String(r[k])]: (a[String(r[k])] ?? 0) + 1 }), {})).map(([label, value]) => ({ label, value }));
        if (res.length === 0) return <EmptyState title="No resources match your filters" text="Change the department or provider filter at the top." />;
        return (<>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Resources in view" value={res.length} format={(n) => String(Math.round(n))} icon={<Server className="h-4 w-4" />} kind="measured" sub="Servers & clusters (filtered)" />
            <KpiCard label="Estimated idle cost" value={idle} format={(n) => `${kchf(n)}/yr`} tone="warn" kind="estimated" icon={<Gauge className="h-4 w-4" />} sub="Cost of hours without real use" />
            <KpiCard label="Average CPU load" value={avg} format={(n) => `${n.toFixed(0)}%`} kind="measured" icon={<Cpu className="h-4 w-4" />} sub="Last 30 days" />
            <KpiCard label="Always-on resources" value={res.filter((r) => r.runtimeH30d >= 700).length} format={(n) => String(Math.round(n))} kind="measured" icon={<Clock className="h-4 w-4" />} sub="≥ 700 h of 720 h in 30 days" />
          </div>
          <div className="mt-6 grid gap-6 xl:grid-cols-3">
            <ChartCard title="Running vs. actually used" subtitle="Hours in the last 30 days" className="xl:col-span-2">
              <div className="h-72"><ResponsiveContainer><BarChart data={res.map((r) => ({ name: r.name, Runtime: r.runtimeH30d, Used: r.activeH30d ?? 0 }))} margin={{ left: 0 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} /><XAxis dataKey="name" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={55} /><YAxis tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} width={40} />
                <Tooltip contentStyle={tip} /><Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Runtime" fill="var(--muted-foreground)" fillOpacity={0.35} radius={[4, 4, 0, 0]} /><Bar dataKey="Used" fill="var(--primary)" radius={[4, 4, 0, 0]} />
              </BarChart></ResponsiveContainer></div>
            </ChartCard>
            <ChartCard title="Infrastructure mix">
              <p className="mb-2 text-xs text-muted-foreground">By environment</p><BarList items={count("environment")} format={String} color="bg-info" />
              <p className="mb-2 mt-5 text-xs text-muted-foreground">By provider</p><BarList items={count("provider")} format={String} color="bg-forecast" />
            </ChartCard>
          </div>
          <h2 className="mb-3 mt-10 text-xl font-semibold">Resources <span className="text-sm font-normal text-muted-foreground">— click to drill down</span></h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[...res].sort((a, b) => b.idleCostChfYear - a.idleCostChfYear).map((r) => {
              const util = r.gpuAvgPct ?? r.cpuAvgPct ?? Math.round(((r.activeH30d ?? 0) / r.runtimeH30d) * 100); const open = sel === r.id;
              return (
                <button key={r.id} id={`res-${r.id}`} onClick={() => setSel(open ? null : r.id)} className={cn("card-elevated p-4 text-left transition target:shadow-glow hover:border-primary/50", open && "border-primary/60")}>
                  <div className="flex items-center gap-2"><span className={cn("h-2 w-2 rounded-full", r.criticality === "high" ? "bg-destructive" : r.criticality === "medium" ? "bg-warning" : "bg-success")} title={`${r.criticality} criticality`} /><span className="font-medium">{r.name}</span><span className="num ml-auto text-[11px] text-muted-foreground">{r.id}</span></div>
                  <div className="mt-3 flex items-end gap-3"><div className="flex-1"><div className="h-1.5 rounded-full bg-muted"><div className={cn("h-full rounded-full", util < 15 ? "bg-warning" : "bg-primary")} style={{ width: `${Math.max(3, util)}%` }} /></div><p className="mt-1 text-[11px] text-muted-foreground">{r.gpuAvgPct != null ? "GPU" : r.cpuAvgPct != null ? "CPU" : "Active"} {util}% · {r.provider} · {r.location} · {r.environment}</p></div>{r.idleCostChfYear > 0 && <span className="num text-sm text-warning">{kchf(r.idleCostChfYear)}</span>}</div>
                  {r.flag && <p className="mt-2 flex items-center gap-1 text-xs text-warning"><AlertTriangle className="h-3.5 w-3.5" />{r.flag}</p>}
                  {open && <div className="rise-in mt-3 grid grid-cols-2 gap-2 border-t pt-3 text-xs">
                    {[["Department", r.department], ["Criticality", r.criticality], ["vCPU", r.vcpu ?? "–"], ["Runtime 30d", `${r.runtimeH30d} h`], ["Used 30d", `${r.activeH30d ?? "–"} h`], ["Idle cost / yr", chf(r.idleCostChfYear)]].map(([k, v]) => <div key={k as string}><p className="text-muted-foreground">{k}</p><p className="num">{v}</p></div>)}
                    <Link to="/studio" className="col-span-2 mt-1 inline-flex items-center gap-1 font-semibold text-primary">See related measures <ArrowRight className="h-3.5 w-3.5" /></Link>
                  </div>}
                </button>
              );
            })}
          </div>
        </>);
      }}</Q>
      <div className="mt-10 grid gap-6 xl:grid-cols-2">
        <ChartCard title="Findings ranked by impact" subtitle="Candidates for review — not proof that something can be removed">
          <Q q={fs}>{(f) => <ul className="space-y-2">{[...f].sort((a, b) => b.impactCo2KgYear - a.impactCo2KgYear).slice(0, 7).map((x) => (
            <li key={x.id} className="flex items-center gap-3 rounded-lg border p-2.5 text-sm"><RiskBadge level={x.risk} /><span className="flex-1 truncate">{x.title}</span><span className="num text-xs text-success">{kg(x.impactCo2KgYear)}</span><span className="num w-16 text-right text-xs text-info">{kchf(x.impactChfYear)}</span></li>
          ))}</ul>}</Q>
          <Link to="/findings" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary">All findings <ArrowRight className="h-4 w-4" /></Link>
        </ChartCard>
        <ChartCard title="Protection windows & dependencies" subtitle="Times when systems must not be touched">
          <Q q={ms}>{(all) => <ul className="space-y-3">{all.filter((m) => m.risk.protectionWindows.length > 0).map((m) => (
            <li key={m.id} className="flex gap-3"><span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", m.risk.level === "blocked" ? "bg-destructive" : "bg-warning")} /><div><p className="text-sm font-medium">{m.resource}</p><p className="text-xs text-muted-foreground">{m.risk.protectionWindows.join(" · ")}{m.risk.approver ? ` — decides: ${m.risk.approver}` : ""}</p></div></li>
          ))}</ul>}</Q>
        </ChartCard>
      </div>
      <Q q={bonus}>{(b) => (
        <div className="mt-6 grid gap-6 xl:grid-cols-3">
          <ChartCard title="AI usage by model" subtitle="Tokens (millions) and cost — baseline year">
            <BarList items={b.aiModels.map((m) => ({ label: m.model, value: m.tokensM, hint: kchf(m.costChf) }))} format={(n) => `${n} M`} color="bg-forecast" />
            <p className="mb-2 mt-5 text-xs text-muted-foreground">Seats bought vs. active (Aug 2026)</p>
            <ul className="space-y-2 text-sm">{b.seats.map((s) => <li key={s.product}><div className="flex justify-between"><span>{s.product}</span><span className="num text-xs text-muted-foreground">{s.active}/{s.purchased}</span></div><div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-warning/30"><div className="bg-primary" style={{ width: `${(s.active / s.purchased) * 100}%` }} /></div></li>)}</ul>
          </ChartCard>
          <ChartCard title="Carbon-aware scheduling" subtitle="Flexible jobs can move to cleaner hours">
            <ul className="space-y-3">{b.carbonJobs.map((j) => <li key={j.job} className="rounded-lg border p-3 text-sm"><div className="flex items-center gap-2"><Leaf className={cn("h-4 w-4", j.window === "flexible" ? "text-success" : "text-muted-foreground")} /><span className="num text-xs">{j.job}</span><span className="ml-auto text-[11px] uppercase text-muted-foreground">{j.window}</span></div><p className="mt-1 text-xs text-muted-foreground">{j.currentStart} → <span className="text-foreground">{j.suggestedStart}</span>{j.co2SavedKgYear > 0 && <span className="text-success"> · −{kg(j.co2SavedKgYear)}/yr</span>}</p></li>)}</ul>
          </ChartCard>
          <ChartCard title="Pipelines & usage groups" subtitle="DevOps waste and clusters of similar usage">
            <ul className="space-y-2">{b.pipelines.map((p) => <li key={p.label} className="flex items-center gap-2 text-sm"><GitBranch className="h-4 w-4 text-info" /><span className="flex-1">{p.label}</span><span className="num font-semibold">{p.value}</span></li>)}</ul>
            <ul className="mt-5 space-y-2">{b.clusters.map((c) => <li key={c.name} className="flex items-start gap-2 text-sm"><Boxes className="mt-0.5 h-4 w-4 text-forecast" /><div className="flex-1"><p>{c.name} <span className="num text-xs text-muted-foreground">({c.members})</span></p><p className="text-xs text-muted-foreground">{c.description}{c.outliers.length ? ` · outliers: ${c.outliers.join(", ")}` : ""}</p></div></li>)}</ul>
          </ChartCard>
        </div>
      )}</Q>
      <ChartCard title="Data quality & source conflicts" subtitle="Handed over to a human before acting" className="mt-6">
        <Q q={dq}>{(d) => <ul className="grid gap-2 md:grid-cols-3">{d.conflicts.map((c) => <li key={c.title} className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm"><p>{c.title}</p><p className="num mt-1 text-[11px] text-muted-foreground">{c.sources.join(" ↔ ")}</p></li>)}</ul>}</Q>
      </ChartCard>
    </AppShell>
  );
}
