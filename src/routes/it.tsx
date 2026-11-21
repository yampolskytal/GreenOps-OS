import { createFileRoute, Link } from "@tanstack/react-router";
import { Server, ShieldAlert, Clock, ArrowRight } from "lucide-react";
import { AppShell } from "@/components/greenops/shell";
import { KpiCard, Q } from "@/components/greenops/ui";
import { Button } from "@/components/ui/button";
import { RuntimePanel } from "@/components/greenops/runtime-panel";
import { MeasureCard } from "@/components/greenops/measure-card";
import { useMeasures, useResources, useOverview, useSimulation } from "@/lib/queries";
import { useDisplayedPlan } from "@/lib/store";
import { PlanningProjection } from "@/components/greenops/starting-plan-notice";
import { TargetPanel } from "@/components/greenops/targets";
import { HistoricalPerformance } from "@/components/greenops/historical-performance";
import { seo } from "@/lib/seo";
import { DemoExceptions } from "@/components/greenops/demo-exceptions";
export const Route = createFileRoute("/it")({
  head: () =>
    seo(
      "IT Operations Dashboard — GreenOps OS",
      "Resource runtime, active workload coverage and safe operational recommendations.",
    ),
  component: It,
});
function It() {
  const plan = useDisplayedPlan();
  const sim = useSimulation();
  const rs = useResources(),
    ms = useMeasures(),
    ov = useOverview();
  return (
    <AppShell
      kicker="IT · Dashboard"
      title="Operational efficiency, safely"
      subtitle="Separate recorded workload from runtime—and review dependencies before making a change."
    >
      <PlanningProjection>
        <section className="mb-6 border-b pb-6">
          <h2 className="mb-4 text-lg font-semibold">{plan.label} · operational requirements</h2>
          <Q q={sim}>{(r) => <TargetPanel r={r} compact />}</Q>
        </section>
      </PlanningProjection>
      <Q q={rs}>
        {(res) => (
          <>
            <div className="grid gap-6 border-b pb-6 md:grid-cols-3">
              <KpiCard
                label="Resources in view"
                value={res.length}
                format={String}
                sub="Servers & clusters"
                icon={<Server className="size-4" />}
              />
              <KpiCard
                label="High-criticality resources"
                value={res.filter((r) => r.criticality === "high").length}
                format={String}
                sub="Require protection review"
                icon={<ShieldAlert className="size-4" />}
              />
              <KpiCard
                label="Always-on resources"
                value={res.filter((r) => r.runtimeH30d != null && r.runtimeH30d >= 700).length}
                format={String}
                sub="At least 700 h in the last 30 days"
                icon={<Clock className="size-4" />}
              />
            </div>
            <section id="runtime" className="mt-6">
              <RuntimePanel resources={res} />
            </section>
          </>
        )}
      </Q>
      <Q q={ov}>{(o) => <HistoricalPerformance overview={o} operational />}</Q>
      <section className="mt-8 border-t pt-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Recommended operational changes</h2>
          <Button asChild variant="link" className="h-auto max-w-full whitespace-normal px-0">
            <Link to="/explore" hash="compare">
              Detailed infrastructure analysis
              <ArrowRight />
            </Link>
          </Button>
        </div>
        <Q q={ms}>
          {(all) => (
            <div className="space-y-3">
              {[...all]
                .filter(
                  (m) =>
                    m.service === "Servers" ||
                    m.service === "Cloud" ||
                    m.service === "Data platform",
                )
                .sort(
                  (a, b) =>
                    ["low", "review", "blocked"].indexOf(a.risk.level) -
                    ["low", "review", "blocked"].indexOf(b.risk.level),
                )
                .slice(0, 4)
                .map((m) => (
                  <MeasureCard key={m.id} m={m} readOnly />
                ))}
            </div>
          )}
        </Q>
      </section>
      <Q q={ms}>{(all) => <DemoExceptions measures={all} />}</Q>
    </AppShell>
  );
}
