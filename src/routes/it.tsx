import { useState } from "react";
import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { Server, ShieldAlert, Clock, ArrowRight } from "lucide-react";
import { AppShell } from "@/components/greenops/shell";
import { KpiCard, Q } from "@/components/greenops/ui";
import { Button } from "@/components/ui/button";
import { DetailBlock, DetailDrawer, EvidenceInfoButton } from "@/components/greenops/details";
import { DashboardSections } from "@/components/greenops/dashboard-sections";
import { DashboardPerformance } from "@/components/greenops/dashboard-performance";
import type { HistoricalSelection } from "@/components/greenops/historical-performance";
import { InfrastructureGrid } from "@/components/greenops/infrastructure-grid";
import { RuntimePanel } from "@/components/greenops/runtime-panel";
import { MeasureCard } from "@/components/greenops/measure-card";
import { useMeasures, useResources, useSimulation } from "@/lib/queries";
import { useDisplayedPlan } from "@/lib/store";
import { PlanningProjection, StartingPlanNotice } from "@/components/greenops/starting-plan-notice";
import { TargetPanel } from "@/components/greenops/targets";
import { formatEvidenceText, group } from "@/lib/format";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/it")({
  head: () =>
    seo(
      "IT Operations Dashboard — GreenOps OS",
      "Resource runtime, active workload coverage and safe operational recommendations.",
    ),
  component: It,
});

function sectionForHash(hash: string) {
  if (hash === "infrastructure" || hash.startsWith("res-")) return "infrastructure";
  if (hash === "runtime") return "runtime";
  if (hash === "monthly") return "performance";
  return "overview";
}

function It() {
  const resources = useResources();
  const hash = useRouterState({ select: (state) => state.location.hash });
  const [selected, setSelected] = useState<{ id: string; hash: string }>();
  const [recommendationsOpen, setRecommendationsOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [historical, setHistorical] = useState<HistoricalSelection>();
  const resourceHash = /^#?res-(.+)$/.exec(hash);
  const selectedId = selected?.hash === hash ? selected?.id : (resourceHash?.[1] ?? selected?.id);
  const selectResource = (id: string) => setSelected({ id, hash });
  return (
    <AppShell
      title="IT Dashboard"
      subtitle="Infrastructure, recorded workload and operational restrictions."
      showStartingPlan={false}
    >
      <DashboardSections
        label="IT dashboard"
        sectionForHash={sectionForHash}
        sections={[
          {
            id: "overview",
            label: "Overview",
            content: (
              <ItOverview
                resources={resources}
                recommendationsOpen={recommendationsOpen}
                onRecommendationsChange={setRecommendationsOpen}
              />
            ),
          },
          {
            id: "infrastructure",
            label: "Infrastructure",
            content: (
              <div id="infrastructure">
                <Q q={resources}>
                  {(data) => (
                    <InfrastructureGrid
                      resources={data}
                      selectedId={selectedId}
                      onSelect={selectResource}
                    />
                  )}
                </Q>
              </div>
            ),
          },
          {
            id: "runtime",
            label: "Runtime & Usage",
            content: (
              <div id="runtime">
                <Q q={resources}>
                  {(data) => (
                    <RuntimePanel
                      resources={data}
                      selectedId={selectedId}
                      onResourceSelect={selectResource}
                      expanded={expanded}
                      onExpandedChange={setExpanded}
                    />
                  )}
                </Q>
              </div>
            ),
          },
          {
            id: "performance",
            label: "Performance",
            content: (
              <DashboardPerformance selection={historical} onSelectionChange={setHistorical} />
            ),
          },
        ]}
      />
    </AppShell>
  );
}

function ItOverview({
  resources,
  recommendationsOpen,
  onRecommendationsChange,
}: {
  resources: ReturnType<typeof useResources>;
  recommendationsOpen: boolean;
  onRecommendationsChange: (open: boolean) => void;
}) {
  const plan = useDisplayedPlan();
  const simulation = useSimulation();
  return (
    <div className="space-y-4">
      <StartingPlanNotice compact />
      <Q q={resources}>
        {(data) => (
          <div className="grid gap-x-5 sm:grid-cols-3">
            <KpiCard
              label="Resources in view"
              value={data.length}
              format={group}
              sub="Servers & clusters"
              icon={<Server className="size-4" />}
            />
            <KpiCard
              label="High-criticality resources"
              value={data.filter((r) => r.criticality === "high").length}
              format={group}
              sub="Require protection review"
              icon={<ShieldAlert className="size-4" />}
            />
            <KpiCard
              label="Always-on resources"
              value={data.filter((r) => r.runtimeH30d != null && r.runtimeH30d >= 700).length}
              format={group}
              sub="At least 700 h in the last 30 days"
              icon={<Clock className="size-4" />}
            />
          </div>
        )}
      </Q>
      <PlanningProjection>
        <Q q={simulation}>
          {(r) => (
            <section aria-label="Operational requirements">
              <header className="mb-3 flex items-center gap-1">
                <h2 className="font-semibold">{plan.label} · operational requirements</h2>
                <DetailDrawer
                  title="Operational requirements and limitations"
                  trigger={<EvidenceInfoButton description="operational requirements" />}
                >
                  <DetailBlock title="Calculation notes">
                    {r.reasons.length ? (
                      r.reasons.map((reason) => <p key={reason}>{formatEvidenceText(reason)}</p>)
                    ) : (
                      <p>Review resource-level evidence for operational limits.</p>
                    )}
                  </DetailBlock>
                  {r.excluded.length > 0 && (
                    <DetailBlock title="Excluded measures">
                      {r.excluded.map(({ id, reason }) => (
                        <p key={id}>
                          {id} · {formatEvidenceText(reason)}
                        </p>
                      ))}
                    </DetailBlock>
                  )}
                  <DetailBlock title="Resource protections">
                    <p>
                      Check workload dependencies, ticket protections and owner approval before
                      changing runtime.
                    </p>
                    <Button asChild size="sm" variant="link">
                      <Link to="/ceo" hash="approvals">
                        Administration approvals <ArrowRight />
                      </Link>
                    </Button>
                  </DetailBlock>
                </DetailDrawer>
              </header>
              <TargetPanel r={r} compact indicatorsOnly />
            </section>
          )}
        </Q>
      </PlanningProjection>
      <section className="border-t pt-3">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Recommended operational changes</h2>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-expanded={recommendationsOpen}
              aria-controls="it-recommendations"
              onClick={() => onRecommendationsChange(!recommendationsOpen)}
            >
              {recommendationsOpen ? "Hide recommendations" : "Show recommendations"}
            </Button>
            <Button
              asChild
              variant="link"
              size="sm"
              className="h-auto max-w-full whitespace-normal"
            >
              <Link to="/explore" hash="compare">
                Detailed infrastructure analysis <ArrowRight />
              </Link>
            </Button>
          </div>
        </header>
        <div id="it-recommendations">{recommendationsOpen && <OperationalRecommendations />}</div>
      </section>
    </div>
  );
}

function OperationalRecommendations() {
  const measures = useMeasures();
  return (
    <Q q={measures}>
      {(all) => (
        <div className="mt-3 space-y-2">
          {[...all]
            .filter((m) => ["Servers", "Cloud", "Data platform"].includes(m.service))
            .sort(
              (a, b) =>
                ["low", "review", "blocked"].indexOf(a.risk.level) -
                ["low", "review", "blocked"].indexOf(b.risk.level),
            )
            .slice(0, 4)
            .map((m) => (
              <MeasureCard key={m.id} m={m} readOnly compact />
            ))}
        </div>
      )}
    </Q>
  );
}
