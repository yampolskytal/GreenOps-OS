import { useState } from "react";
import { createFileRoute, useRouterState, useNavigate, useHydrated } from "@tanstack/react-router";
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
import { ExplorationScope } from "@/components/greenops/exploration-scope";
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
  const hydrated = useHydrated();
  const [tab, setTab] = useState("footprint");
  const [metric, setMetric] = useState<CalMetric>("co2Kg");
  const effective = !hydrated
    ? tab
    : hash.startsWith("finding-")
      ? "findings"
      : hash === "compare"
        ? "compare"
        : tab;
  return (
    <AppShell
      kicker="Connect · Find"
      title="Explore & Findings"
      subtitle="Investigate drivers, compare entities and review potential improvements."
    >
      <ExplorationScope />
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
            Daily cost, energy and emissions · supplied observations only.
          </p>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-lg font-semibold">Footprint calendar</h2>
            <div className="flex max-w-full flex-wrap gap-1">
              {(
                [
                  ["co2Kg", "CO₂ — Location-based"],
                  ["costChf", "Cost"],
                  ["energyKwh", "Energy"],
                  ["co2KgMarket", "CO₂ — Market-based"],
                ] as const
              ).map(([v, l]) => (
                <Button
                  key={v}
                  size="sm"
                  variant={metric === v ? "secondary" : "ghost"}
                  disabled={v === "co2KgMarket" && !daily.data?.some((d) => d.co2KgMarket != null)}
                  onClick={() => setMetric(v)}
                >
                  {l}
                </Button>
              ))}
            </div>
          </div>
          {!daily.data?.some((d) => d.co2KgMarket != null) && (
            <p className="mb-4 text-xs text-muted-foreground">
              Daily market-based emissions unavailable. Annual accounting totals do not provide
              daily values.
            </p>
          )}
          <Q q={daily}>{(d) => <FootprintCalendar days={d} metric={metric} />}</Q>
        </TabsContent>
        <TabsContent value="compare" id="compare">
          <p className="mb-5 max-w-2xl text-sm text-muted-foreground">
            Identify the biggest drivers of cost, energy use and emissions. Select a category and
            metric to compare resources.
          </p>
          <ComparisonBoard />
        </TabsContent>
        <TabsContent value="findings">
          <WasteFindings />
          <DetailDrawer
            title="Operational source evidence"
            trigger={
              <Button variant="outline" className="mt-8">
                Operational source evidence
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
      </Tabs>
    </AppShell>
  );
}
