import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { AppShell } from "@/components/greenops/shell";
import { Q, RiskBadge } from "@/components/greenops/ui";
import { ApprovalWorkspace, type ReviewFilter } from "@/components/greenops/demo-exceptions";
import {
  AdministrationScorecard,
  ReviewSummary,
} from "@/components/greenops/administration-overview";
import { SpendingDonut } from "@/components/greenops/spending-donut";
import { useMeasures, useOverview, useSimulation } from "@/lib/queries";
import { HistoricalPerformance } from "@/components/greenops/historical-performance";
import { AdministrationEmissions } from "@/components/greenops/emissions-evidence";
import { seo } from "@/lib/seo";
import { PlanningProjection, StartingPlanNotice } from "@/components/greenops/starting-plan-notice";
import { useDisplayedPlan } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { DetailBlock, DetailDrawer } from "@/components/greenops/details";
import { api } from "@/lib/api/client";
import { managementRecommendation } from "@/lib/management-recommendations";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/ceo")({
  head: () =>
    seo(
      "Administration Dashboard — GreenOps OS",
      "Sustainability targets, company performance and management decisions.",
    ),
  component: Administration,
});

const tabs = [
  ["overview", "Overview"],
  ["approvals", "Approvals & Exceptions"],
  ["spending", "Spending Drivers"],
  ["performance", "Performance"],
  ["emissions", "Emissions"],
] as const;

function tabForHash(hash: string) {
  switch (hash.replace(/^#/, "")) {
    case "monthly":
      return "performance";
    case "approvals":
    case "decisions":
      return "approvals";
    default:
      return "overview";
  }
}

function Administration() {
  const hash = useRouterState({ select: (state) => state.location.hash });
  const [tab, setTab] = useState<string>(() => tabForHash(hash));
  const approvalTab = useRef<HTMLButtonElement>(null);
  const [filter, setFilter] = useState<ReviewFilter>("all");
  useEffect(() => setTab(tabForHash(hash)), [hash]);
  function selectTab(value: string) {
    setTab(value);
    if (typeof window.scrollTo === "function") window.scrollTo({ top: 0 });
  }
  return (
    <AppShell
      title="Administration Dashboard"
      subtitle="Projected outcomes for the official September 2025–August 2026 baseline."
      showStartingPlan={false}
    >
      <Tabs value={tab} onValueChange={selectTab} activationMode="manual">
        <TabsList aria-label="Administration dashboard" className="mb-4 justify-start">
          {tabs.map(([value, label]) => (
            <TabsTrigger
              className="max-sm:px-2 max-sm:text-xs"
              key={value}
              value={value}
              ref={value === "approvals" ? approvalTab : undefined}
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview">
          {tab === "overview" && (
            <ExecutiveOverview
              onReviews={() => {
                setFilter("review");
                selectTab("approvals");
                approvalTab.current?.focus({ preventScroll: true });
              }}
            />
          )}
        </TabsContent>
        <TabsContent value="approvals">
          {tab === "approvals" && (
            <div id="decisions">
              <Approvals filter={filter} onFilter={setFilter} />
            </div>
          )}
        </TabsContent>
        <TabsContent value="spending">{tab === "spending" && <SpendingDonut />}</TabsContent>
        <TabsContent value="performance">{tab === "performance" && <Performance />}</TabsContent>
        <TabsContent value="emissions">{tab === "emissions" && <Emissions />}</TabsContent>
      </Tabs>
    </AppShell>
  );
}

function ExecutiveOverview({ onReviews }: { onReviews: () => void }) {
  const overview = useOverview(true);
  const simulation = useSimulation();
  const plan = useDisplayedPlan();
  const measures = useMeasures();
  const reviews = (
    <Q q={measures}>{(data) => <ReviewSummary measures={data} onReviews={onReviews} />}</Q>
  );
  return (
    <section id="targets" className="space-y-5">
      <StartingPlanNotice compact />
      <PlanningProjection>
        <Q q={simulation}>
          {(result) => (
            <Q q={overview}>
              {(data) => (
                <AdministrationScorecard
                  overview={data}
                  result={result}
                  suggested={plan.suggested}
                  reviewSummary={reviews}
                />
              )}
            </Q>
          )}
        </Q>
      </PlanningProjection>
      {!plan.ready && reviews}
    </section>
  );
}

function Approvals(props: Pick<Parameters<typeof ApprovalWorkspace>[0], "filter" | "onFilter">) {
  const measures = useMeasures();
  const overview = useOverview(true);
  return (
    <Q q={measures}>
      {(data) => (
        <>
          <ApprovalWorkspace measures={data} {...props} />
          <Q q={overview}>
            {({ managementRisks }) =>
              managementRisks.length > 0 && (
                <div className="mt-4">
                  <DetailDrawer
                    title="Management risks"
                    trigger={
                      <Button size="sm" variant="outline">
                        Management risks
                      </Button>
                    }
                  >
                    {managementRisks.map((risk) => {
                      const recommendation = managementRecommendation(risk, data, api.isDemo);
                      return (
                        <DetailBlock key={risk.title} title={risk.title}>
                          <RiskBadge level={risk.level} />
                          <p className="mt-2">{risk.detail}</p>
                          {recommendation && (
                            <Button asChild size="sm" variant="link">
                              <Link to="/studio" hash={`measure-${recommendation.id}`}>
                                Review in Optimization Studio
                              </Link>
                            </Button>
                          )}
                        </DetailBlock>
                      );
                    })}
                  </DetailDrawer>
                </div>
              )
            }
          </Q>
        </>
      )}
    </Q>
  );
}

function Performance() {
  const overview = useOverview(true);
  return (
    <div id="monthly">
      <Q q={overview}>{(data) => <HistoricalPerformance overview={data} executive />}</Q>
    </div>
  );
}

function Emissions() {
  const overview = useOverview(true);
  const simulation = useSimulation();
  return (
    <Q q={overview}>
      {(data) => (
        <AdministrationEmissions
          overview={data}
          result={simulation.data}
          savingsPending={simulation.isFetching}
          savingsError={simulation.isError}
        />
      )}
    </Q>
  );
}
