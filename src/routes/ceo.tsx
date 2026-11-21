import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Coins, Cloud, PiggyBank } from "lucide-react";
import { AppShell } from "@/components/greenops/shell";
import { ChartCard, KpiCard, Q, RiskBadge } from "@/components/greenops/ui";
import { MeasureCard } from "@/components/greenops/measure-card";
import { TargetPanel } from "@/components/greenops/targets";
import { DetailDrawer } from "@/components/greenops/details";
import { Button } from "@/components/ui/button";
import { useMeasures, useOverview, useSimulation } from "@/lib/queries";
import { kchf, kg } from "@/lib/format";
import { HistoricalPerformance } from "@/components/greenops/historical-performance";
import { EmissionsEvidence } from "@/components/greenops/emissions-evidence";
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
            <div className="mt-4">
              <EmissionsEvidence overview={o} />
            </div>
            <div id="monthly">
              <HistoricalPerformance overview={o} />
            </div>
            <section id="targets" className="border-b py-5">
              <ChartCard
                title="Projected optimization targets"
                subtitle="Current Plan · projections, not historical results"
              >
                <Q q={sim}>{(r) => <TargetPanel r={r} compact />}</Q>
                <Button asChild variant="link" className="mt-4 px-0">
                  <Link to="/studio">
                    Review optimization plan
                    <ArrowRight />
                  </Link>
                </Button>
              </ChartCard>
            </section>
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
