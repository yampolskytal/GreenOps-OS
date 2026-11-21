import { createFileRoute, Link } from "@tanstack/react-router";
import { Coins, PiggyBank, Hammer, ArrowRight } from "lucide-react";
import { AppShell } from "@/components/greenops/shell";
import { ChartCard, KpiCard, Q } from "@/components/greenops/ui";
import { ComparisonBoard } from "@/components/greenops/compare";
import { ForecastChart } from "@/components/greenops/forecast-chart";
import { Button } from "@/components/ui/button";
import { useForecast, useOverview, useSimulation } from "@/lib/queries";
import { useApp, useDisplayedPlan } from "@/lib/store";
import { PlanningProjection } from "@/components/greenops/starting-plan-notice";
import { chf, kchf } from "@/lib/format";
import { HistoricalPerformance } from "@/components/greenops/historical-performance";
import { TargetPanel } from "@/components/greenops/targets";
import { EmissionsEvidence } from "@/components/greenops/emissions-evidence";
import { seo } from "@/lib/seo";
import { DemoExceptions } from "@/components/greenops/demo-exceptions";
import { useMeasures } from "@/lib/queries";
export const Route = createFileRoute("/cfo")({
  head: () =>
    seo(
      "Finance Dashboard — GreenOps OS",
      "Financial snapshot, ranked spending drivers and implementation budget for the shared plan.",
    ),
  component: Cfo,
});
function Cfo() {
  const ov = useOverview(true),
    sim = useSimulation(),
    fc = useForecast(
      "cost",
      3,
      !!ov.data?.forecastSupport?.some((x) => x.metric === "cost" && x.horizons.includes(3)),
    );
  const { s } = useApp();
  const plan = useDisplayedPlan();
  const measures = useMeasures();
  return (
    <AppShell
      kicker="Finance · Dashboard"
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
          value={plan.ready ? sim.data?.savingsChf ?? null : null}
          format={kchf}
          sub={`Projected · ${plan.label}`}
          tone="good"
          icon={<PiggyBank className="size-4" />}
        />
        <KpiCard
          label="Implementation budget used"
          value={plan.ready ? sim.data?.effortChf ?? null : null}
          format={chf}
          sub={plan.ready ? `${plan.measureIds.length} measures selected` : "Awaiting recommendation"}
          icon={<Hammer className="size-4" />}
        />
      </div>
      <Q q={ov}>
        {(o) => (
          <>
            <HistoricalPerformance overview={o} />
            <div className="mt-4">
              <EmissionsEvidence overview={o} />
            </div>
          </>
        )}
      </Q>
      <div className="mt-6 grid gap-10 xl:grid-cols-[1.35fr_.8fr]">
        <ChartCard
          title="Where the money goes"
          subtitle="Ranked annual spending, one comparison at a time"
        >
          <ComparisonBoard finance />
        </ChartCard>
        <ChartCard title="Budget & optimization">
          <PlanningProjection>
          <Q q={sim}>
            {(r) => (
              <div className="space-y-5">
                <div>
                  <p className="text-xs text-muted-foreground">{plan.label}</p>
                  <p className="mt-1 font-semibold">{plan.measureIds.length} proposed measures</p>
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
          </PlanningProjection>
        </ChartCard>
      </div>
      <section className="mt-8 border-t pt-6">
        <h2 className="mb-5 text-lg font-semibold">Challenge Targets · {plan.label}</h2>
        <PlanningProjection>
        <Q q={sim}>{(r) => <TargetPanel r={r} compact />}</Q>
        </PlanningProjection>
      </section>
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
          {ov.data?.forecastSupport?.some((x) => x.metric === "cost" && x.horizons.includes(3)) ? (
            <Q q={fc}>
              {(f) => (
                <ForecastChart f={f} format={kchf} height={260} history={ov.data?.monthly ?? []} planLabel={plan.label} />
              )}
            </Q>
          ) : (
            <p className="text-sm text-muted-foreground">
              Three-year cost projections are not available from this provider.
            </p>
          )}
        </ChartCard>
      </section>
      <Q q={measures}>{(all) => <DemoExceptions measures={all} />}</Q>
    </AppShell>
  );
}
