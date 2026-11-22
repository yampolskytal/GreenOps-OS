import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/greenops/shell";
import { Q } from "@/components/greenops/ui";
import { ApprovalWorkspace } from "@/components/greenops/demo-exceptions";
import { AdministrationScorecard } from "@/components/greenops/administration-overview";
import { SpendingDonut } from "@/components/greenops/spending-donut";
import { useMeasures, useOverview, useSimulation } from "@/lib/queries";
import { DashboardPerformance } from "@/components/greenops/dashboard-performance";
import { seo } from "@/lib/seo";
import { PlanningProjection, StartingPlanNotice } from "@/components/greenops/starting-plan-notice";
import { useDisplayedPlan } from "@/lib/store";
import { DashboardSections } from "@/components/greenops/dashboard-sections";

export const Route = createFileRoute("/ceo")({
  head: () =>
    seo(
      "Administration Dashboard — GreenOps OS",
      "Sustainability targets, company performance and management decisions.",
    ),
  component: Administration,
});

function tabForHash(hash: string) {
  switch (hash.replace(/^#/, "")) {
    case "monthly":
    case "emissions":
      return "performance";
    case "approvals":
    case "decisions":
      return "approvals";
    default:
      return "overview";
  }
}

function Administration() {
  return (
    <AppShell
      title="Administration Dashboard"
      subtitle="Projected outcomes for the official September 2025–August 2026 baseline."
      showStartingPlan={false}
    >
      <DashboardSections
        label="Administration dashboard"
        sectionForHash={tabForHash}
        sections={[
          { id: "overview", label: "Overview", content: <ExecutiveOverview /> },
          {
            id: "approvals",
            label: "Approvals & Exceptions",
            content: (
              <div id="decisions">
                <Approvals />
              </div>
            ),
          },
          { id: "spending", label: "Spending Drivers", content: <SpendingDonut /> },
          { id: "performance", label: "Performance", content: <DashboardPerformance /> },
        ]}
      />
    </AppShell>
  );
}

function ExecutiveOverview() {
  const overview = useOverview(true);
  const simulation = useSimulation();
  const plan = useDisplayedPlan();
  return (
    <section id="targets" className="space-y-4">
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
                />
              )}
            </Q>
          )}
        </Q>
      </PlanningProjection>
    </section>
  );
}

function Approvals() {
  const measures = useMeasures();
  return <Q q={measures}>{(data) => <ApprovalWorkspace measures={data} />}</Q>;
}
