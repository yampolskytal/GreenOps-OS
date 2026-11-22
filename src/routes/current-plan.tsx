import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ClipboardCheck, FileSpreadsheet, TrendingUp, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { PlanningProjection, StartingPlanNotice } from "@/components/greenops/starting-plan-notice";
import { AppShell } from "@/components/greenops/shell";
import { DashboardSections } from "@/components/greenops/dashboard-sections";
import { Button } from "@/components/ui/button";
import { CalcInfo, Q } from "@/components/greenops/ui";
import { DetailBlock, DetailDrawer, EvidenceInfoButton } from "@/components/greenops/details";
import { PackageEvidence, MarketSavingsSummary } from "@/components/greenops/package-evidence";
import { MeasureCard } from "@/components/greenops/measure-card";
import { useApp, useDisplayedPlan } from "@/lib/store";
import { useMeasures, useSimulation, useOverview } from "@/lib/queries";
import { api } from "@/lib/api/client";
import { chf, formatNumber, kg, kwh } from "@/lib/format";
import { seo } from "@/lib/seo";
import { PlanOutcomes } from "@/components/greenops/plan-outcomes";
import { numericalWarnings } from "@/lib/proposals";
import type { Measure } from "@/lib/api/types";
import { TARGETS } from "@/lib/optimizer";

export const Route = createFileRoute("/current-plan")({
  head: () =>
    seo(
      "Current Plan — GreenOps OS",
      "Review committed measures, projected savings and outstanding evidence before submission.",
    ),
  component: CurrentPlanPage,
});

function sectionForHash(hash: string) {
  if (hash === "measures" || hash.startsWith("measure-")) return "measures";
  if (hash === "readiness") return "readiness";
  return "overview";
}

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
  const review = selected.filter((m) => m.risk.level === "review" || m.risk.approver).length;
  const measureUnavailable = selected.length < plan.measureIds.length;
  return (
    <AppShell
      title="Current Plan"
      kicker={plan.suggested ? "Suggested strategy · not adopted" : "Implementation strategy"}
      subtitle="Review projected outcomes, selected measures and the requirements for submission."
      showStartingPlan={false}
      actions={
        <Button asChild variant="outline" size="sm">
          <Link to="/studio" hash={plan.measureIds.length ? "recommendations" : "recommended"}>
            Edit strategy in Optimization Studio <ArrowRight />
          </Link>
        </Button>
      }
    >
      <DashboardSections
        label="Current Plan sections"
        sectionForHash={sectionForHash}
        sections={[
          {
            id: "overview",
            label: "Overview",
            content: (
              <section id="plan-summary" className="space-y-4">
                <StartingPlanNotice compact />
                <p className="flex items-center gap-2 text-sm font-medium">
                  <ClipboardCheck aria-hidden className="size-4 text-accent-ink" />
                  {plan.ready
                    ? `${plan.measureIds.length} ${plan.suggested ? "suggested" : "committed"} measures`
                    : "Awaiting recommended strategy"}
                </p>
                {plan.ready && !plan.measureIds.length && (
                  <p className="text-sm text-muted-foreground">
                    No committed measures. Build a strategy in Optimization Studio.
                  </p>
                )}
                {plan.ready && plan.measureIds.length > 0 && (
                  <Q q={sim}>
                    {(r) => (
                      <>
                        {(numericalWarnings(r).length > 0 ||
                          blocked > 0 ||
                          review > 0 ||
                          measureUnavailable ||
                          r.excluded.length > 0 ||
                          api.isDemo) && (
                          <p className="border-l-2 border-warning pl-3 text-sm text-warning">
                            {api.isDemo
                              ? "Demo projection only."
                              : "Review outstanding requirements in Readiness & Evidence before exporting."}
                          </p>
                        )}
                        <Q q={overview}>
                          {(o) => (
                            <PlanOutcomes
                              overview={o}
                              result={r}
                              projectionFirst
                              afterLabel={
                                plan.suggested ? "After suggested strategy" : "After Current Plan"
                              }
                            />
                          )}
                        </Q>
                        <div className="@container">
                          <dl
                            aria-label="Plan outcome summary"
                            className="grid gap-x-5 gap-y-1 @lg:grid-cols-2 @3xl:grid-cols-3"
                          >
                            {[
                              ["Projected annual cost savings", chf(r.savingsChf)],
                              ["Projected annual location-based CO₂ savings", kg(r.savingsCo2Kg)],
                              ["Projected annual energy savings", kwh(r.savingsKwh)],
                              ["Implementation expenditure", chf(r.effortChf)],
                              [
                                "Implementation effort",
                                `${formatNumber(r.effortDays)} person-days`,
                              ],
                              [
                                "Projected payback",
                                r.paybackMonths == null
                                  ? "Unavailable"
                                  : `${formatNumber(r.paybackMonths, { maximumFractionDigits: 1 })} months`,
                              ],
                            ].map(([label, value]) => (
                              <div
                                key={label}
                                className="row-span-2 grid min-w-0 grid-rows-subgrid gap-1 border-b py-2"
                              >
                                <dt className="text-xs text-muted-foreground">{label}</dt>
                                <dd className="num break-words text-xl font-semibold">{value}</dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                      </>
                    )}
                  </Q>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link to="/studio" hash="paths">
                      Compare Paths <ArrowRight />
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/forecast">
                      <TrendingUp />
                      Plan forecasts
                    </Link>
                  </Button>
                  {(plan.measureIds.length > 0 || plan.suggested) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setClearError(null);
                        setClearOpen(true);
                      }}
                    >
                      <Trash2 />
                      Clear plan
                    </Button>
                  )}
                </div>
              </section>
            ),
          },
          {
            id: "measures",
            label: "Selected Measures",
            content: (
              <section id="measures" className="space-y-3">
                <h2 className="font-semibold">
                  {plan.suggested ? "Suggested measures" : "Selected measures & evidence"}
                </h2>
                <Q q={measures}>
                  {() => (
                    <>
                      {selected.map((m) => (
                        <MeasureCard key={m.id} m={m} readOnly compact />
                      ))}
                      {plan.ready && !plan.measureIds.length && (
                        <p className="text-sm text-muted-foreground">
                          No committed measures. Build a strategy in Optimization Studio.
                        </p>
                      )}
                      {measureUnavailable && (
                        <p className="text-sm text-warning">
                          Some saved measures are unavailable from this provider. Review them before
                          submission.
                        </p>
                      )}
                    </>
                  )}
                </Q>
              </section>
            ),
          },
          {
            id: "readiness",
            label: "Readiness & Evidence",
            content: (
              <section id="readiness" className="space-y-4">
                <h2 className="font-semibold">Submission readiness</h2>
                <p className="text-sm text-muted-foreground">
                  {api.isDemo
                    ? "Demo results cannot be submitted."
                    : plan.suggested
                      ? "Adopt or customize the suggested strategy before preparing a package for submission."
                      : !plan.measureIds.length
                        ? "Commit a set of measures before preparing a submission package."
                        : "Check the official CSV eligibility result in Submission."}
                </p>
                <PlanningProjection>
                  <Q q={sim}>
                    {(r) => (
                      <>
                        <dl className="grid gap-3 sm:grid-cols-2">
                          {[
                            [
                              "Numerical targets",
                              r.costReductionPct >= TARGETS.costPct &&
                              r.co2ReductionPct >= TARGETS.co2Pct
                                ? "Both minimum reductions met"
                                : "Cost or location-based CO₂ reduction is below target",
                            ],
                            [
                              "Implementation limits",
                              r.effortChf <= TARGETS.budgetChf &&
                              r.effortDays <= TARGETS.maxPersonDays
                                ? "Within official budget and effort limits"
                                : "Budget or effort exceeds the official limit",
                            ],
                            [
                              "Blocked or excluded measures",
                              `${blocked} blocked · ${r.excluded.length} excluded${measureUnavailable ? " · Includes unavailable catalogue entries" : ""}`,
                            ],
                            [
                              "Human review and source verification",
                              `${review} require review · ${selected.filter((m) => !m.evidence.length).length} without supplied evidence`,
                            ],
                          ].map(([label, value]) => (
                            <div key={label} className="border-b pb-2">
                              <dt className="text-xs text-muted-foreground">{label}</dt>
                              <dd className="mt-1 text-sm">{value}</dd>
                            </div>
                          ))}
                        </dl>
                        {numericalWarnings(r).length > 0 && (
                          <ul className="space-y-1 text-sm text-warning">
                            {numericalWarnings(r).map((warning) => (
                              <li key={warning}>{warning}</li>
                            ))}
                          </ul>
                        )}
                        {r.excluded.length > 0 && (
                          <p className="text-sm text-warning">
                            The calculation excluded measures. Check the exclusion reasons before
                            submission.
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <div>
                            <MarketSavingsSummary result={r} />
                          </div>
                          <DetailDrawer
                            title="Current Plan · calculation and evidence"
                            trigger={<EvidenceInfoButton description="plan readiness" />}
                          >
                            <PackageEvidence result={r} />
                            <DetailBlock title="Baseline calculations">
                              <Q q={overview}>
                                {(o) => (
                                  <div className="flex flex-wrap gap-2">
                                    <CalcInfo calc={o.cost.calc} />
                                    <CalcInfo calc={o.energy.calc} />
                                    <CalcInfo calc={o.co2Location.calc} />
                                  </div>
                                )}
                              </Q>
                            </DetailBlock>
                            <OperationalEvidence measures={selected} />
                          </DetailDrawer>
                        </div>
                      </>
                    )}
                  </Q>
                </PlanningProjection>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link to="/ceo" hash="approvals">
                      Administration approvals <ArrowRight />
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/submission">
                      <FileSpreadsheet />
                      {plan.suggested
                        ? "Submission reports · adoption required"
                        : "Submission reports and exports"}
                    </Link>
                  </Button>
                </div>
              </section>
            ),
          },
        ]}
      />
      <Dialog open={clearOpen} onOpenChange={setClearOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear your plan?</DialogTitle>
            <DialogDescription>
              Your Paths stay saved. This plan will remain empty after refreshing and the starting
              strategy will be cleared.
            </DialogDescription>
          </DialogHeader>
          {clearError && (
            <p role="alert" className="text-sm text-destructive">
              {clearError}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setClearOpen(false)}>
              Keep plan
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                try {
                  commitPlan({ measureIds: [], budgetChf: s.budgetChf, priority: s.priority });
                  setClearOpen(false);
                } catch {
                  setClearError("Your plan could not be cleared on this device.");
                }
              }}
            >
              Confirm clear
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function OperationalEvidence({ measures }: { measures: Measure[] }) {
  const { s } = useApp();
  const decisions = api.isDemo ? s.demoExceptions : s.simulationDecisions;
  const restricted = measures.filter(
    (m) => m.risk.level !== "low" || !m.includable || m.risk.approver || decisions[m.id],
  );
  if (!restricted.length) return null;
  return (
    <DetailBlock title="Operational requirements">
      <ul className="space-y-2">
        {restricted.map((m) => (
          <li key={m.id}>
            <p className="font-medium">{m.title}</p>
            {m.risk.approver && <p>Required approver · {m.risk.approver}</p>}
            <p>{m.risk.why || m.decision?.reason || "Additional requirements unavailable."}</p>
            {decisions[m.id]?.approved && (
              <p className="text-warning">
                Local simulation confirmation. Original operational restrictions apply.
              </p>
            )}
          </li>
        ))}
      </ul>
    </DetailBlock>
  );
}
