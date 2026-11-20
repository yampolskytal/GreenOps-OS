import { createFileRoute, Link } from "@tanstack/react-router";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowRight, Coins, Zap, Cloud, PiggyBank, OctagonX, ShieldAlert } from "lucide-react";
import { AppShell } from "@/components/greenops/shell";
import { ChartCard, KpiCard, Q } from "@/components/greenops/ui";
import { MeasureCard } from "@/components/greenops/measure-card";
import { TargetPanel } from "@/components/greenops/targets";
import { ForecastChart } from "@/components/greenops/forecast-chart";
import { useForecast, useMeasures, useOverview, useSimulation } from "@/lib/queries";
import { chf, kchf, kg, kwh } from "@/lib/format";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/ceo")({
  head: () => seo("Executive Overview — GreenOps OS", "Costs, energy, CO₂ and progress toward the −40% CO₂ and −25% cost targets."),
  component: Ceo,
});

function Ceo() {
  const ov = useOverview(); const sim = useSimulation(); const ms = useMeasures(); const fc = useForecast("co2Location", 3);
  return (
    <AppShell kicker="CEO · Executive Overview" title="Are we on track?" subtitle="Your digital footprint in the baseline year and what the selected package of measures would change.">
      <Q q={ov}>{(o) => (<>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Annual digital cost" value={o.cost.value.mid} format={kchf} sub={`Range ${kchf(o.cost.value.low)} – ${kchf(o.cost.value.high)}`} calc={o.cost.calc} kind={o.cost.kind} icon={<Coins className="h-4 w-4" />} />
          <KpiCard label="Energy use" value={o.energy.value.mid} format={kwh} sub={`Range ${kwh(o.energy.value.low)} – ${kwh(o.energy.value.high)}`} calc={o.energy.calc} kind={o.energy.kind} icon={<Zap className="h-4 w-4" />} />
          <KpiCard label="CO₂ (where the power is used)" value={o.co2Location.value.mid} format={kg} sub={`Range ${kg(o.co2Location.value.low)} – ${kg(o.co2Location.value.high)}`} calc={o.co2Location.calc} kind={o.co2Location.kind} icon={<Cloud className="h-4 w-4" />} />
          <KpiCard label="Savings of selected package" value={sim.data?.savingsChf ?? 0} format={(n) => `${kchf(n)}/yr`} sub={sim.data ? `${kg(sim.data.savingsCo2Kg)} CO₂ less per year` : "Calculating…"} kind="simulated" tone="good" icon={<PiggyBank className="h-4 w-4" />} />
        </div>
        <div className="mt-6 grid gap-6 xl:grid-cols-3">
          <ChartCard title="Progress toward targets" subtitle="Based on the measures currently in your plan">
            <Q q={sim}>{(r) => <TargetPanel r={r} />}</Q>
            <Link to="/studio" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">Adjust in Optimization Studio <ArrowRight className="h-4 w-4" /></Link>
          </ChartCard>
          <ChartCard title="Monthly trend" subtitle="Cost (CHF) per month in the baseline year" className="xl:col-span-2" info={o.cost.calc}>
            <div className="h-64"><ResponsiveContainer><AreaChart data={o.monthly}>
              <defs><linearGradient id="gc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity={0.45} /><stop offset="100%" stopColor="var(--primary)" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={kchf} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} width={70} />
              <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} formatter={(v: number) => chf(v)} />
              <Area dataKey="costChf" name="Cost" stroke="var(--primary)" strokeWidth={2} fill="url(#gc)" />
            </AreaChart></ResponsiveContainer></div>
          </ChartCard>
        </div>
        <h2 className="mb-3 mt-10 text-xl font-semibold">Three biggest opportunities</h2>
        <Q q={ms}>{(all) => <div className="grid gap-4 lg:grid-cols-3">{o.topOpportunities.map((id) => all.find((m) => m.id === id)).filter((m) => !!m).map((m) => <MeasureCard key={m.id} m={m} />)}</div>}</Q>
        <div className="mt-6 grid gap-6 xl:grid-cols-3">
          <ChartCard title="Needs management attention" subtitle="Decisions only people can make">
            <ul className="space-y-3">{o.managementRisks.map((r) => (
              <li key={r.title} className="flex gap-3">{r.level === "blocked" ? <OctagonX className="mt-0.5 h-5 w-5 shrink-0 text-destructive" /> : <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" />}<div><p className="text-sm font-medium">{r.title}</p><p className="text-xs text-muted-foreground">{r.detail}</p></div></li>
            ))}</ul>
          </ChartCard>
          <ChartCard title="CO₂ outlook: with and without the package" subtitle="Forecast, not observations. Shaded = low–high range." className="xl:col-span-2">
            <Q q={fc}>{(f) => <ForecastChart f={f} format={kg} />}</Q>
          </ChartCard>
        </div>
        <div className="card-elevated mt-6 flex flex-wrap items-center gap-6 p-6">
          <div className="flex-1"><h3 className="font-semibold">In short</h3><p className="mt-1 max-w-3xl text-sm text-muted-foreground">Most CO₂ comes from machines abroad that run all the time but are rarely used — above all the GPU server in Frankfurt and the test machines in Dublin. Switching them on only when needed and cancelling unused licences gives the biggest effect for little effort. The production platform stays untouched.</p></div>
          <div className="flex gap-2"><Link to="/cfo" className="rounded-lg border px-3 py-2 text-sm hover:border-primary">Finance details</Link><Link to="/it" className="rounded-lg border px-3 py-2 text-sm hover:border-primary">Technical details</Link></div>
        </div>
      </>)}</Q>
    </AppShell>
  );
}
