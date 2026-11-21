import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ClipboardCheck, FileSpreadsheet, TrendingUp, Trash2 } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PlanningProjection } from "@/components/greenops/starting-plan-notice";
import { AppShell } from "@/components/greenops/shell";
import { Button } from "@/components/ui/button";
import { Q, KpiCard } from "@/components/greenops/ui";
import { TargetPanel } from "@/components/greenops/targets";
import { MeasureCard } from "@/components/greenops/measure-card";
import { useApp, useDisplayedPlan } from "@/lib/store";
import { useMeasures, useSimulation, useOverview } from "@/lib/queries";
import { api } from "@/lib/api/client";
import { chf, kg, kwh } from "@/lib/format";
import { seo } from "@/lib/seo";
import { PlanOutcomes } from "@/components/greenops/plan-outcomes";
import { DemoExceptions } from "@/components/greenops/demo-exceptions";
import { numericalWarnings } from "@/lib/proposals";

export const Route = createFileRoute("/current-plan")({
  head: () =>
    seo(
      "Current Plan — GreenOps OS",
      "Review committed measures, projected savings, official challenge progress and outstanding evidence before submission.",
    ),
  component: CurrentPlanPage,
});
function CurrentPlanPage() {
  const { s, commitPlan } = useApp();
  const plan = useDisplayedPlan();
  const [clearOpen, setClearOpen] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const sim = useSimulation();
  const overview = useOverview(true);
  const measures = useMeasures();
  const selected = measures.data?.filter((m) => plan.measureIds.includes(m.id)) ?? [];
  const blocked = selected.filter((m) => !m.includable || m.risk.level === "blocked").length;
  const review = selected.filter((m) => m.risk.level === "review").length;
  const missing = selected.filter((m) => !m.evidence?.length).length;
  return (
    <AppShell
      kicker={plan.suggested ? "Suggested strategy · not adopted" : "Committed strategy"}
      title={plan.label}
      subtitle="Projected benefits are estimates. Saving a plan does not approve operational changes."
      actions={
        <Button asChild variant="outline">
          <Link to="/studio" hash="recommendations">
            Edit strategy in Optimization Studio
            <ArrowRight />
          </Link>
        </Button>
      }
    >
      <div
        id="plan-summary"
        className="mb-6 flex flex-wrap items-center justify-between gap-3 border-y py-4"
      >
        <span className="flex items-center gap-2 font-medium">
          <ClipboardCheck className="size-5 text-primary" />
          {plan.ready ? `${plan.measureIds.length} ${plan.suggested ? "suggested" : "committed"} measures` : "Awaiting recommended strategy"}
        </span>
        <span className="text-xs text-muted-foreground">
          Saved on this device · {api.isDemo ? "DEMO projection" : "Active provider calculations"}
        </span>
      </div>
      <PlanningProjection>
      <Q q={sim}>
        {(r) => (
          <>
            {(numericalWarnings(r).length > 0 || blocked > 0 || review > 0 || api.isDemo) && (
              <p className="mb-5 border-l-2 border-warning pl-3 text-sm text-warning">
                {api.isDemo ? "Demo projection only" : blocked || review ? "Operational restrictions or owner reviews remain. Check CSV eligibility separately in Submission." : "Review the numerical limits before exporting."}
              </p>
            )}
            <Q q={overview}>{(o) => <PlanOutcomes overview={o} result={r} afterLabel={plan.suggested ? "After suggested strategy" : "After Current Plan"} />}</Q>
            <div className="mt-6 grid gap-x-6 sm:grid-cols-2 xl:grid-cols-3">
              <KpiCard label="Projected annual cost savings" value={r.savingsChf} format={chf} />
              <KpiCard
                label="Projected annual location-based CO₂ savings"
                value={r.savingsCo2Kg}
                format={kg}
              />
              <KpiCard label="Projected annual energy savings" value={r.savingsKwh} format={kwh} />
              <KpiCard label="Implementation cost" value={r.effortChf} format={chf} />
              <KpiCard
                label="Implementation effort"
                value={r.effortDays}
                format={(n) => `${n.toFixed(1)} person-days`}
              />
              <KpiCard
                label="Projected payback"
                value={r.paybackMonths}
                format={(n) => `${n.toFixed(1)} months`}
              />
            </div>
            <section className="mt-8 border-b pb-6">
              <h2 className="mb-5 text-lg font-semibold">Challenge Targets</h2>
              <TargetPanel r={r} compact />
            </section>
            <section className="mt-8">
              <h2 className="mb-4 text-lg font-semibold">Readiness review</h2>
              <dl className="grid gap-3 sm:grid-cols-2">
                {[
                  [
                    "Numerical targets",
                    r.costReductionPct >= 25 && r.co2ReductionPct >= 40
                      ? "Meets both minimum reductions"
                      : "Missing cost or CO₂ target",
                  ],
                  [
                    "Implementation limits",
                    r.effortChf <= 16500 && r.effortDays <= 15
                      ? "Within official limits"
                      : "Exceeds budget or effort",
                  ],
                  ["Blocked proposals", `${blocked} blocked · ${r.excluded.length} excluded`],
                  [
                    "Outstanding approvals",
                    `${review} require review · approval records not supplied`,
                  ],
                  [
                    "Evidence",
                    `${missing} measures without supplied evidence · source verification outstanding`,
                  ],
                  [
                    "Submission readiness",
                    api.isDemo
                      ? "Not submission-ready — DEMO"
                       : "Check CSV eligibility in Submission",
                  ],
                ].map(([label, value]) => (
                  <div key={label} className="border-b pb-3">
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="mt-1 text-sm">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </>
        )}
      </Q>
      </PlanningProjection>
      <section className="mt-8 border-t pt-6">
        <h2 className="mb-5 text-lg font-semibold">Selected measures & evidence</h2>
        <Q q={measures}>
          {() => (
            <div className="space-y-3">
              {selected.map((m) => (
                <MeasureCard key={m.id} m={m} readOnly compact />
              ))}
              {plan.ready && !plan.measureIds.length && (
                <p className="py-6 text-muted-foreground">
                  No committed measures. Build a strategy in Optimization Studio.
                </p>
              )}
              {selected.length < plan.measureIds.length && (
                <p className="text-warning">
                  Some saved measures are unavailable from this provider. Review them before
                  submission.
                </p>
              )}
            </div>
          )}
        </Q>
      </section>
      <Q q={measures}>
        {(all) => <DemoExceptions measures={all.filter((m) => plan.measureIds.includes(m.id))} />}
      </Q>
      <div className="mt-8 flex flex-wrap gap-3 border-t pt-6">
        {(plan.measureIds.length > 0 || plan.suggested) && <Button variant="outline" onClick={() => { setClearError(null); setClearOpen(true); }}><Trash2 />Clear plan</Button>}
        <Button asChild variant="outline">
          <Link to="/studio" hash="paths">
            Compare Paths
            <ArrowRight />
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/forecast">
            <TrendingUp />
            Plan forecasts
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/submission">
            <FileSpreadsheet />
            {plan.suggested ? "Submission reports · adoption required for package" : "Export submission reports"}
          </Link>
        </Button>
      </div>
      <Dialog open={clearOpen} onOpenChange={setClearOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Clear your plan?</DialogTitle><DialogDescription>Your Paths stay saved. This plan will remain empty after refreshing; no starting plan will be restored.</DialogDescription></DialogHeader>
          {clearError && <p role="alert" className="text-sm text-destructive">{clearError}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setClearOpen(false)}>Keep plan</Button>
            <Button variant="destructive" onClick={() => { try { commitPlan({ measureIds: [], budgetChf: s.budgetChf, priority: s.priority }); setClearOpen(false); } catch { setClearError("Your plan could not be cleared on this device."); } }}>Confirm clear</Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
