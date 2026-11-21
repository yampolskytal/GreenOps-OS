import { useState } from "react";
import { createFileRoute, useRouterState, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/greenops/shell";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { FootprintCalendar, type CalMetric } from "@/components/greenops/calendar";
import { ComparisonBoard } from "@/components/greenops/compare";
import { Q } from "@/components/greenops/ui";
import { WasteFindings } from "./findings";
import { useDaily, useBonus } from "@/lib/queries";
import { DetailDrawer, DetailBlock } from "@/components/greenops/details";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/explore")({
  head: () =>
    seo(
      "Explore & Findings — GreenOps OS",
      "Explore the daily digital footprint, compare cost drivers and review waste with evidence.",
    ),
  component: Explore,
});
function Explore() {
  const daily = useDaily(),
    bonus = useBonus();
  const navigate = useNavigate();
  const hash = useRouterState({ select: (r) => r.location.hash });
  const [tab, setTab] = useState("footprint");
  const [metric, setMetric] = useState<CalMetric>("co2Kg");
  const effective = hash.startsWith("finding-") ? "findings" : hash === "compare" ? "compare" : tab;
  return (
    <AppShell
      kicker="Connect · Find"
      title="Explore & Findings"
      subtitle="Investigate drivers, compare entities and review potential improvements."
    >
      <Tabs
        value={effective}
        onValueChange={(v) => {
          setTab(v);
          void navigate({ to: "/explore", hash: "" });
        }}
      >
        <TabsList className="mb-6 flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="footprint">Digital Footprint</TabsTrigger>
          <TabsTrigger value="compare">Compare</TabsTrigger>
          <TabsTrigger value="findings">Waste Findings</TabsTrigger>
        </TabsList>
        <TabsContent value="footprint" id="footprint">
          <p className="mb-5 max-w-2xl text-sm text-muted-foreground">
            Explore how your company’s digital footprint changes over time. Switch between monthly
            and yearly views, or use 3D mode to compare two metrics.
          </p>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-lg font-semibold">Footprint calendar</h2>
            <div className="flex gap-1">
              {(
                [
                  ["co2Kg", "CO₂"],
                  ["costChf", "Cost"],
                  ["energyKwh", "Energy"],
                ] as const
              ).map(([v, l]) => (
                <Button
                  key={v}
                  size="sm"
                  variant={metric === v ? "secondary" : "ghost"}
                  onClick={() => setMetric(v)}
                >
                  {l}
                </Button>
              ))}
            </div>
          </div>
          <Q q={daily}>{(d) => <FootprintCalendar days={d} metric={metric} />}</Q>
        </TabsContent>
        <TabsContent value="compare" id="compare">
          <p className="mb-5 max-w-2xl text-sm text-muted-foreground">
            Identify the biggest drivers of cost, energy use and emissions. Select a category and
            metric to compare resources.
          </p>
          <ComparisonBoard />
          <DetailDrawer
            title="Additional operational analysis"
            trigger={
              <Button variant="outline" className="mt-8">
                AI, scheduling & pipelines
              </Button>
            }
          >
            <Q q={bonus}>
              {(b) => (
                <div className="space-y-6">
                  <DetailBlock title="AI models">
                    {b.aiModels.map((m) => (
                      <p key={m.model}>
                        {m.model} · {m.tokensM} million tokens · CHF {m.costChf}
                      </p>
                    ))}
                  </DetailBlock>
                  <DetailBlock title="Carbon-aware scheduling">
                    {b.carbonJobs.map((j) => (
                      <p key={j.job} className="mb-3">
                        {j.job} · {j.window}
                        <span className="block text-muted-foreground">
                          {j.currentStart} → {j.suggestedStart} · {j.co2SavedKgYear} kg CO₂/year
                        </span>
                      </p>
                    ))}
                  </DetailBlock>
                  <DetailBlock title="DevOps pipelines">
                    {b.pipelines.map((p) => (
                      <p key={p.label} className="mb-3">
                        {p.label}: {p.value}
                        <span className="block text-muted-foreground">{p.detail}</span>
                      </p>
                    ))}
                  </DetailBlock>
                  <DetailBlock title="Usage clusters">
                    {b.clusters.map((c) => (
                      <p key={c.name} className="mb-3">
                        {c.name} ({c.members})
                        <span className="block text-muted-foreground">
                          {c.description} · {c.outliers.join(", ")}
                        </span>
                      </p>
                    ))}
                  </DetailBlock>
                </div>
              )}
            </Q>
          </DetailDrawer>
        </TabsContent>
        <TabsContent value="findings">
          <WasteFindings />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
