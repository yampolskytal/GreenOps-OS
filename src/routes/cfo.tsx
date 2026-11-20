import { createFileRoute } from "@tanstack/react-router";
import { Cell, Pie, PieChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis, CartesianGrid } from "recharts";
import { Coins, Hammer, PiggyBank, Timer } from "lucide-react";
import { AppShell } from "@/components/greenops/shell";
import { BarList, ChartCard, KpiCard, Q } from "@/components/greenops/ui";
import { BudgetSlider, PortfolioBuilder } from "@/components/greenops/portfolio";
import { TargetPanel } from "@/components/greenops/targets";
import { ForecastChart } from "@/components/greenops/forecast-chart";
import { useBreakdowns, useForecast, useMeasures, useOverview, useSimulation } from "@/lib/queries";
import { chf, kchf, kg } from "@/lib/format";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/cfo")({
  head: () => seo("Financial Intelligence — GreenOps OS", "Costs by department, provider and service, savings portfolio and budget planning."),
  component: Cfo,
});
const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--muted-foreground)", "var(--accent-foreground)"];
const tip = { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 };

function Cfo() {
  const ov = useOverview(); const br = useBreakdowns(); const ms = useMeasures(); const sim = useSimulation(); const fc = useForecast("cost", 3);
  const r = sim.data;
  return (
    <AppShell kicker="CFO · Financial Intelligence" title="Where the money goes" subtitle="All costs converted to CHF. Build a savings portfolio that fits the implementation budget.">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total annual cost" value={ov.data?.cost.value.mid ?? 0} format={kchf} {...(ov.data ? { calc: ov.data.cost.calc } : {})} kind="financial" icon={<Coins className="h-4 w-4" />} sub="Baseline year Sep 25 – Aug 26" />
        <KpiCard label="Estimated annual savings" value={r?.savingsChf ?? 0} format={kchf} kind="simulated" tone="good" icon={<PiggyBank className="h-4 w-4" />} sub={r ? `−${r.costReductionPct.toFixed(1)}% of costs` : "…"} />
        <KpiCard label="Implementation cost" value={r?.effortChf ?? 0} format={chf} kind="simulated" tone={r && r.effortChf > 16500 ? "bad" : "default"} icon={<Hammer className="h-4 w-4" />} sub={r ? `${r.effortDays} person-days × CHF 1,100` : "…"} />
        <KpiCard label="Payback period" value={r?.paybackMonths ?? 0} format={(n) => (r?.paybackMonths == null ? "–" : `${n.toFixed(1)} months`)} kind="simulated" icon={<Timer className="h-4 w-4" />} sub="Implementation cost ÷ monthly savings" />
      </div>
      <Q q={br}>{(b) => (
        <div className="mt-6 grid gap-6 xl:grid-cols-3">
          <ChartCard title="Cost by department" subtitle={b.allocationRule}><BarList items={b.byDepartment.map((d) => ({ label: d.label, value: d.costChf }))} format={kchf} /></ChartCard>
          <ChartCard title="Cost by provider" subtitle="Share of annual cost">
            <div className="h-56"><ResponsiveContainer><PieChart><Pie data={b.byProvider} dataKey="costChf" nameKey="label" innerRadius={55} outerRadius={85} paddingAngle={2} stroke="none">{b.byProvider.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip contentStyle={tip} formatter={(v: number) => chf(v)} /></PieChart></ResponsiveContainer></div>
            <ul className="grid grid-cols-2 gap-1 text-xs">{b.byProvider.map((p, i) => <li key={p.label} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />{p.label}<span className="num ml-auto text-muted-foreground">{kchf(p.costChf)}</span></li>)}</ul>
          </ChartCard>
          <ChartCard title="Budget allocation by service" subtitle="Cloud, servers, AI, SaaS and data platform"><BarList items={b.byService.map((d) => ({ label: d.label, value: d.costChf, hint: `${kg(d.co2Kg)} CO₂` }))} format={kchf} color="bg-info" /></ChartCard>
        </div>
      )}</Q>
      <div className="mt-6 grid gap-6 xl:grid-cols-5">
        <ChartCard title="Savings portfolio builder" subtitle="Select measures — your plan is shared with all views" className="xl:col-span-3">
          <div className="mb-5"><BudgetSlider /></div>
          <Q q={ms}>{(all) => <PortfolioBuilder measures={all} />}</Q>
        </ChartCard>
        <ChartCard title="Does the package work?" className="xl:col-span-2"><Q q={sim}>{(x) => <TargetPanel r={x} />}</Q></ChartCard>
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <ChartCard title="Money vs. CO₂ per measure" subtitle="Top right = saves both. Bubble size = effort.">
          <Q q={ms}>{(all) => (
            <div className="h-72"><ResponsiveContainer><ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
              <CartesianGrid stroke="var(--border)" />
              <XAxis type="number" dataKey="savingsChf" name="CHF/yr" tickFormatter={kchf} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
              <YAxis type="number" dataKey="savingsCo2KgLocation" name="CO₂/yr" tickFormatter={kg} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} width={60} />
              <ZAxis type="number" dataKey="effortPersonDays" range={[60, 400]} />
              <Tooltip contentStyle={tip} content={({ payload }) => { const p = payload?.[0]?.payload as { title: string; savingsChf: number; savingsCo2KgLocation: number } | undefined; return p ? <div className="rounded-lg border bg-popover p-2 text-xs"><b>{p.title}</b><br />{chf(p.savingsChf)} · {kg(p.savingsCo2KgLocation)}</div> : null; }} />
              <Scatter data={all.filter((m) => m.risk.level !== "blocked")} fill="var(--primary)" fillOpacity={0.75} />
              <Scatter data={all.filter((m) => m.risk.level === "blocked")} fill="var(--destructive)" fillOpacity={0.75} />
            </ScatterChart></ResponsiveContainer></div>
          )}</Q>
        </ChartCard>
        <ChartCard title="Cost forecast" subtitle="Forecast with uncertainty range — not observations"><Q q={fc}>{(f) => <><ForecastChart f={f} format={kchf} /><p className="mt-2 text-xs text-muted-foreground">{f.growthAssumption}</p></>}</Q></ChartCard>
      </div>
      {r && ov.data && (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {[["Before", ov.data.cost.value.mid, ov.data.co2Location.value.mid, "border-border"], ["After package", ov.data.cost.value.mid - r.savingsChf, ov.data.co2Location.value.mid - r.savingsCo2Kg, "border-primary/60 shadow-glow"]].map(([l, c, e, cls]) => (
            <div key={l as string} className={`card-elevated border p-5 ${cls}`}><p className="text-xs uppercase tracking-wider text-muted-foreground">{l}</p><div className="mt-2 flex gap-8"><div><p className="num text-2xl font-semibold">{kchf(c as number)}</p><p className="text-xs text-muted-foreground">cost per year</p></div><div><p className="num text-2xl font-semibold">{kg(e as number)}</p><p className="text-xs text-muted-foreground">CO₂ per year</p></div></div></div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
