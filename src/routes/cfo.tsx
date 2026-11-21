import { createFileRoute, Link } from "@tanstack/react-router";
import { Coins, PiggyBank, Hammer, ArrowRight } from "lucide-react";
import { AppShell } from "@/components/greenops/shell";
import { ChartCard, KpiCard, Q } from "@/components/greenops/ui";
import { ComparisonBoard } from "@/components/greenops/compare";
import { ForecastChart } from "@/components/greenops/forecast-chart";
import { Button } from "@/components/ui/button";
import { useForecast, useOverview, useSimulation } from "@/lib/queries";
import { useApp } from "@/lib/store";
import { chf, kchf } from "@/lib/format";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/cfo")({
  head: () =>
    seo(
      "Financial Dashboard — GreenOps OS",
      "Financial snapshot, ranked spending drivers and implementation budget for the shared plan.",
    ),
  component: Cfo,
});
function Cfo() {
  const ov = useOverview(),
    sim = useSimulation(),
    fc = useForecast("cost", 3);
  const { s } = useApp();
  return (
    <AppShell
      kicker="CFO · Dashboard"
      title="Make spending work harder"
      subtitle="Annual spending, financial opportunities and the cost of your selected plan."
    >
      <div className="grid gap-6 border-b pb-6 md:grid-cols-3">
        <KpiCard
          label="Annual digital spending"
          value={ov.data?.cost.value.mid ?? null}
          format={kchf}
          sub={ov.data?.baselinePeriod ?? "Loading reporting period"}
          {...(ov.data ? { calc: ov.data.cost.calc } : {})}
          icon={<Coins className="size-4" />}
        />
        <KpiCard
          label="Potential annual savings"
          value={sim.data?.savingsChf ?? null}
          format={kchf}
          sub="Projected · selected plan"
          tone="good"
          icon={<PiggyBank className="size-4" />}
        />
        <KpiCard
          label="Implementation budget used"
          value={sim.data?.effortChf ?? null}
          format={chf}
          sub={`${s.measureIds.length} measures selected`}
          icon={<Hammer className="size-4" />}
        />
      </div>
      <div className="mt-6 grid gap-10 xl:grid-cols-[1.35fr_.8fr]">
        <ChartCard
          title="Where the money goes"
          subtitle="Ranked annual spending, one comparison at a time"
        >
          <ComparisonBoard finance />
        </ChartCard>
        <ChartCard title="Budget & optimization">
          <Q q={sim}>
            {(r) => (
              <div className="space-y-5">
                <div>
                  <p className="text-xs text-muted-foreground">Selected plan</p>
                  <p className="mt-1 font-semibold">{s.measureIds.length} proposed measures</p>
                </div>
                {[
                  ["Implementation expenditure", chf(r.effortChf)],
                  ["Annual savings", chf(r.savingsChf)],
                  ["Remaining budget", chf(s.budgetChf - r.effortChf)],
                  [
                    "Payback period",
                    r.paybackMonths == null
                      ? "Unavailable"
                      : `${r.paybackMonths.toFixed(1)} months`,
                  ],
                ].map(([l, v]) => (
                  <div key={l} className="flex justify-between gap-3 border-b pb-3 text-sm">
                    <span className="text-muted-foreground">{l}</span>
                    <span className="num text-right">{v}</span>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  Budget limit: {chf(s.budgetChf)}. Savings are projected, not realized.
                </p>
                <Button asChild>
                  <Link to="/studio">
                    Open Optimization Studio
                    <ArrowRight />
                  </Link>
                </Button>
              </div>
            )}
          </Q>
        </ChartCard>
      </div>
      <section className="mt-8 border-t pt-6">
        <ChartCard
          title="Financial outlook"
          action={
            <Button asChild variant="link">
              <Link to="/forecast">
                Full forecasts
                <ArrowRight />
              </Link>
            </Button>
          }
        >
          <Q q={fc}>{(f) => <ForecastChart f={f} format={kchf} height={260} />}</Q>
        </ChartCard>
      </section>
    </AppShell>
  );
}
