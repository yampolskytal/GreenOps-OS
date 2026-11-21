import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowRight, Coins, Cloud, PiggyBank } from "lucide-react";
import { AppShell } from "@/components/greenops/shell";
import { ChartCard, KpiCard, Q, RiskBadge } from "@/components/greenops/ui";
import { MeasureCard } from "@/components/greenops/measure-card";
import { TargetPanel } from "@/components/greenops/targets";
import { DetailDrawer } from "@/components/greenops/details";
import { Button } from "@/components/ui/button";
import { useMeasures, useOverview, useSimulation } from "@/lib/queries";
import { chf, kchf, kg, kwh } from "@/lib/format";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/ceo")({
  head: () =>
    seo(
      "Executive Dashboard — GreenOps OS",
      "Annual spending, location-based emissions and projected progress of the shared optimization plan.",
    ),
  component: Ceo,
});
function Ceo() {
  const ov = useOverview(),
    sim = useSimulation(),
    ms = useMeasures();
  const [metric, setMetric] = useState<"costChf" | "co2Kg" | "energyKwh">("costChf");
  const fmt = metric === "costChf" ? kchf : metric === "co2Kg" ? kg : kwh;
  return (
    <AppShell
      kicker="CEO · Dashboard"
      title="The executive snapshot"
      subtitle="Current performance and the projected impact of your selected plan."
    >
      <Q q={ov}>
        {(o) => (
          <>
            <div className="grid gap-6 border-b pb-6 md:grid-cols-3">
              <KpiCard
                label="Annual digital spending"
                value={o.cost.value.mid}
                format={kchf}
                sub={o.baselinePeriod}
                calc={o.cost.calc}
                icon={<Coins className="size-4" />}
              />
              <KpiCard
                label="Location-based CO₂"
                value={o.co2Location.value.mid}
                format={kg}
                sub={o.baselinePeriod}
                calc={o.co2Location.calc}
                icon={<Cloud className="size-4" />}
              />
              <KpiCard
                label="Potential annual savings"
                value={sim.data?.savingsChf ?? null}
                format={kchf}
                sub="Projected · selected plan"
                tone="good"
                icon={<PiggyBank className="size-4" />}
              />
            </div>
            <div className="mt-6 grid gap-8 xl:grid-cols-[.9fr_1.2fr]">
              <div id="targets">
                <ChartCard title="Projected targets" subtitle="Selection is not implementation">
                  <Q q={sim}>{(r) => <TargetPanel r={r} />}</Q>
                  <Button asChild variant="link" className="mt-4 px-0">
                    <Link to="/studio">
                      Review optimization plan
                      <ArrowRight />
                    </Link>
                  </Button>
                </ChartCard>
              </div>
              <div id="monthly">
                <ChartCard
                  title="Monthly performance"
                  info={
                    metric === "costChf"
                      ? o.cost.calc
                      : metric === "co2Kg"
                        ? o.co2Location.calc
                        : o.energy.calc
                  }
                  action={
                    <div className="flex">
                      {(
                        [
                          ["costChf", "Cost"],
                          ["co2Kg", "CO₂"],
                          ["energyKwh", "Energy"],
                        ] as const
                      ).map(([v, l]) => (
                        <Button
                          key={v}
                          variant={metric === v ? "secondary" : "ghost"}
                          size="sm"
                          onClick={() => setMetric(v)}
                        >
                          {l}
                        </Button>
                      ))}
                    </div>
                  }
                >
                  <div className="h-64">
                    <ResponsiveContainer>
                      <AreaChart data={o.monthly} margin={{ right: 12 }}>
                        <CartesianGrid stroke="var(--border)" vertical={false} />
                        <XAxis
                          dataKey="month"
                          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tickFormatter={fmt}
                          width={80}
                          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "var(--popover)",
                            border: "1px solid var(--border)",
                            borderRadius: 8,
                          }}
                          formatter={(v: number) => fmt(v)}
                        />
                        <Area
                          dataKey={metric}
                          name={
                            metric === "costChf" ? "Cost" : metric === "co2Kg" ? "CO₂" : "Energy"
                          }
                          fill="var(--primary)"
                          fillOpacity={0.12}
                          stroke="var(--primary)"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </ChartCard>
              </div>
            </div>
            <section className="mt-8">
              <h2 className="mb-4 text-lg font-semibold">Top opportunities</h2>
              <Q q={ms}>
                {(all) => (
                  <div className="space-y-3">
                    {o.topOpportunities
                      .map((id) => all.find((m) => m.id === id))
                      .filter((m) => m != null)
                      .slice(0, 3)
                      .map((m) => (
                        <MeasureCard key={m.id} m={m} />
                      ))}
                  </div>
                )}
              </Q>
            </section>
            <section className="mt-8 border-t pt-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  Management attention{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    ({o.managementRisks.length})
                  </span>
                </h2>
                <DetailDrawer
                  title="Management attention"
                  trigger={
                    <Button variant="outline" size="sm">
                      View All
                    </Button>
                  }
                >
                  <div className="space-y-5">
                    {o.managementRisks.map((r) => (
                      <div key={r.title}>
                        <RiskBadge level={r.level} />
                        <h3 className="mt-2 font-semibold">{r.title}</h3>
                        <p className="mt-1 text-muted-foreground">{r.detail}</p>
                      </div>
                    ))}
                  </div>
                </DetailDrawer>
              </div>
              <div className="grid gap-6 md:grid-cols-2">
                {o.managementRisks.slice(0, 2).map((r) => (
                  <div key={r.title}>
                    <RiskBadge level={r.level} />
                    <h3 className="mt-2 text-sm font-semibold">{r.title}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{r.detail}</p>
                  </div>
                ))}
              </div>
            </section>
            <section className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t pt-6">
              <p className="max-w-2xl text-sm text-muted-foreground">
                <b className="text-foreground">Next decision:</b> review the highest-impact
                opportunities before committing effort. The selected plan remains a projection until
                changes are implemented.
              </p>
              <Button asChild>
                <Link to="/explore">
                  Explore drivers
                  <ArrowRight />
                </Link>
              </Button>
            </section>
          </>
        )}
      </Q>
    </AppShell>
  );
}
