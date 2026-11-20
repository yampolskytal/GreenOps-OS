import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell, Kpi, Panel } from "@/components/app/shell";
import { financeQuery, chf, kg } from "@/lib/api/client";

export const Route = createFileRoute("/cfo")({
  head: () => ({ meta: [ { title: "CFO dashboard — GreenLedger" }, { name: "description", content: "Costs by department, tool and currency, idle seats and allocation rules." }, { property: "og:title", content: "CFO dashboard — GreenLedger" }, { property: "og:description", content: "Costs by department, tool and currency, idle seats and allocation rules." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" } ] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(financeQuery),
  component: Cfo,
});

function Cfo() {
  const { data } = useSuspenseQuery(financeQuery);
  const total = data.monthly.reduce((a, m) => a + m.costChf, 0);
  const idle = data.idleSeats.reduce((a, s) => a + s.monthlyWasteChf, 0);
  return (
    <AppShell kicker="Finance view" title="Where the money goes">
      <div className="grid gap-4 md:grid-cols-4">
        <Kpi label="Cost baseline year" value={chf(total)} hint="sum of monthly, CHF converted (ECB)" />
        <Kpi label="Idle AI seats" value={`${chf(idle)}/mo`} hint={`${chf(idle * 12)} per year`} tone="bad" />
        <Kpi label="Largest department" value={data.byDepartment[0]?.department ?? "–"} hint={chf(data.byDepartment[0]?.costChf ?? 0)} />
        <Kpi label="Foreign currency share" value={`${100 - (data.currencyMix.find((c) => c.currency === "CHF")?.sharePct ?? 0)}%`} hint={data.currencyMix.map((c) => `${c.currency} ${c.sharePct}%`).join(" · ")} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Monthly cost (CHF)">
          <div className="h-60">
            <ResponsiveContainer>
              <AreaChart data={data.monthly}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={50} />
                <Tooltip formatter={(v: number) => chf(v)} />
                <Area dataKey="costChf" stroke="var(--primary)" fill="var(--accent)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Cost by department">
          <div className="h-60">
            <ResponsiveContainer>
              <BarChart data={data.byDepartment} layout="vertical" margin={{ left: 30 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="department" width={110} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => chf(v)} />
                <Bar dataKey="costChf" fill="var(--chart-1)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Allocation: {data.allocationRule}</p>
        </Panel>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Biggest cost drivers">
          <table className="w-full text-sm">
            <tbody>
              {data.topDrivers.map((d) => (
                <tr key={d.label} className="border-t first:border-t-0">
                  <td className="py-2">{d.label}<p className="num text-[11px] text-muted-foreground">{d.category} · {d.location} · {d.source}</p></td>
                  <td className="num text-right">{chf(d.costChf)}</td>
                  <td className="num text-right text-carbon">{kg(d.co2Kg)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel title="AI seats purchased but not active">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="pb-2">Product</th><th>Bought</th><th>Active</th><th className="text-right">Waste/mo</th><th className="text-right">Notice</th></tr></thead>
            <tbody>
              {data.idleSeats.map((s) => (
                <tr key={s.product} className="border-t">
                  <td className="py-2">{s.product}</td><td className="num">{s.purchased}</td><td className="num">{s.active}</td>
                  <td className="num text-right text-destructive">{chf(s.monthlyWasteChf)}</td>
                  <td className="num text-right text-muted-foreground">{s.noticeDays}d · {s.contractEnd}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 num text-[11px] text-muted-foreground">ai_subscriptions.csv · exchange_rates.csv</p>
        </Panel>
      </div>
    </AppShell>
  );
}
