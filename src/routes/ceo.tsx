import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell, FindingList, Kpi, Meter, Panel } from "@/components/app/shell";
import { overviewQuery, chf, kg, group } from "@/lib/api/client";
import { summarizePackage } from "@/lib/package";

export const Route = createFileRoute("/ceo")({
  head: () => ({ meta: [ { title: "CEO dashboard — GreenLedger" }, { name: "description", content: "Target check for CO₂ −40%, costs −25% and the CHF 16,500 budget." }, { property: "og:title", content: "CEO dashboard — GreenLedger" }, { property: "og:description", content: "Target check for CO₂ −40%, costs −25% and the CHF 16,500 budget." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" } ] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(overviewQuery),
  component: Ceo,
});

function Ceo() {
  const { data } = useSuspenseQuery(overviewQuery);
  const s = summarizePackage(data.baseline, data.package, data.targets.chfPerPersonDay);
  const b = data.baseline;
  return (
    <AppShell kicker="Executive view" title="Do we hit the target?">
      <div className="grid gap-4 md:grid-cols-4">
        <Kpi label="Baseline cost" value={chf(b.costChf.mid)} hint={`range ${chf(b.costChf.low)} – ${chf(b.costChf.high)}`} />
        <Kpi label="Baseline CO₂ (location)" value={kg(b.co2KgLocation.mid)} hint={`range ${kg(b.co2KgLocation.low)} – ${kg(b.co2KgLocation.high)}`} />
        <Kpi label="Energy" value={`${group(b.energyKwh.mid)} kWh`} hint="incl. PUE" />
        <Kpi label="Implementation" value={chf(s.effortChf)} hint={`${s.effortDays} person-days · budget ${chf(data.targets.budgetChf)}`} tone={s.effortChf <= data.targets.budgetChf ? "good" : "bad"} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Panel title="Package vs. target" className="lg:col-span-1">
          <div className="space-y-5">
            <Meter label="CO₂ reduction (location-based)" value={s.co2Pct} target={data.targets.co2Pct} />
            <Meter label="Cost reduction" value={s.costPct} target={data.targets.costPct} />
            <Meter label="Budget used" value={(s.effortChf / data.targets.budgetChf) * 100} target={100} />
          </div>
          <p className="mt-4 text-xs text-muted-foreground">Budget meter: below 100% is within budget.</p>
        </Panel>
        <Panel title="Where CO₂ comes from (by data-centre location)" className="lg:col-span-2">
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={data.byLocation} layout="vertical" margin={{ left: 20 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="location" width={70} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: number) => kg(v)} />
                <Bar dataKey="co2Kg" fill="var(--carbon)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Panel title="Measures package" className="lg:col-span-2">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr><th className="pb-2">Measure</th><th>Days</th><th className="text-right">CHF/yr</th><th className="text-right">CO₂/yr</th><th className="text-right">Owner</th></tr>
            </thead>
            <tbody>
              {data.package.map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="py-2"><span className="num mr-2 text-muted-foreground">{m.id}</span>{m.description}{m.needsHumanDecision && <span className="ml-2 rounded bg-warning/30 px-1.5 text-[10px] uppercase">decide</span>}</td>
                  <td className="num">{m.effortPersonDays}</td>
                  <td className="num text-right">{chf(m.savingsChf)}</td>
                  <td className="num text-right">{kg(m.savingsCo2KgLocation)}</td>
                  <td className="text-right text-muted-foreground">{m.owner}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel title="Know the limits"><FindingList items={data.findings} /></Panel>
      </div>
    </AppShell>
  );
}
