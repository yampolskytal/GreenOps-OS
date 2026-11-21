import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { AppShell } from "@/components/greenops/shell";
import { ChartCard, Q, RiskBadge } from "@/components/greenops/ui";
import { TargetPanel } from "@/components/greenops/targets";
import { PlanOutcomes } from "@/components/greenops/plan-outcomes";
import { DemoExceptions } from "@/components/greenops/demo-exceptions";
import { ComparisonBoard } from "@/components/greenops/compare";
import { Button } from "@/components/ui/button";
import { useMeasures, useOverview, useSimulation } from "@/lib/queries";
import { HistoricalPerformance } from "@/components/greenops/historical-performance";
import { EmissionsEvidence } from "@/components/greenops/emissions-evidence";
import { seo } from "@/lib/seo";
import { api } from "@/lib/api/client";
import { managementRecommendation } from "@/lib/management-recommendations";
import { PlanningProjection } from "@/components/greenops/starting-plan-notice";
import { useDisplayedPlan } from "@/lib/store";
export const Route = createFileRoute("/ceo")({
  head: () =>
    seo(
      "Executive Dashboard — GreenOps OS",
      "Executive target progress, before-and-after savings, management decisions and demo exceptions.",
    ),
  component: Ceo,
});
function Ceo() {
  const plan = useDisplayedPlan();
  const ov = useOverview(true),
    sim = useSimulation(),
    ms = useMeasures();
  return (
    <AppShell
      kicker="CEO · Executive briefing"
      title="Results. Targets. Decisions."
      subtitle={`${plan.label} · official September 2025–August 2026 baseline · projected outcomes, not executed changes.`}
    >
      <PlanningProjection>
      <section id="targets" className="border-b pb-6">
        <h2 className="mb-5 text-lg font-semibold">Are we meeting our targets?</h2>
        <Q q={sim}>{(r) => <TargetPanel r={r} compact />}</Q>
      </section>
      <section className="border-b py-6">
        <h2 className="mb-5 text-lg font-semibold">What are we saving?</h2>
        <Q q={ov}>{(o) => <Q q={sim}>{(r) => <PlanOutcomes overview={o} result={r} afterLabel={plan.suggested ? "After suggested strategy" : "After Current Plan"} />}</Q>}</Q>
      </section>
      </PlanningProjection>
      <section id="decisions" className="py-6">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Management attention</h2>
          <Button asChild size="sm" variant="outline">
            <Link to="/studio">
              Review strategy <ArrowRight />
            </Link>
          </Button>
        </header>
        <Q q={ov}>
          {(o) => (
            <div className="grid gap-4 lg:grid-cols-3">
              {o.managementRisks.slice(0, 3).map((r) => {
                const recommendation = managementRecommendation(r, ms.data ?? [], api.isDemo);
                return (
                  <article key={r.title} className="rounded-lg border bg-card p-4">
                    <RiskBadge level={r.level} />
                    <h3 className="mt-3 font-medium">{r.title}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">{r.detail}</p>
                    {recommendation && (
                      <Button asChild size="sm" variant="link" className="mt-3 px-0">
                        <Link to="/studio" hash={`measure-${recommendation.id}`}>
                          Review recommendations <ArrowRight />
                        </Link>
                      </Button>
                    )}
                  </article>
                );
              })}
              {!o.managementRisks.length && (
                <p className="text-sm text-muted-foreground">No management risks supplied.</p>
              )}
            </div>
          )}
        </Q>
      </section>
      <Q q={ms}>{(measures) => <DemoExceptions measures={measures} />}</Q>
      <section className="mt-8 border-t pt-6">
        <ChartCard title="Spending drivers">
          <ComparisonBoard finance />
        </ChartCard>
      </section>
      <div id="monthly">
        <Q q={ov}>
          {(o) => (
            <>
              <HistoricalPerformance overview={o} />
              <EmissionsEvidence overview={o} />
            </>
          )}
        </Q>
      </div>
    </AppShell>
  );
}
