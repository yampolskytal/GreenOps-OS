import { chf, carbonMass } from "@/lib/format";
import { useEffect, useState } from "react";
import { createFileRoute, useRouterState, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/greenops/shell";
import { GeographicFootprint } from "@/components/greenops/geographic-footprint";
import { DashboardSections } from "@/components/greenops/dashboard-sections";
import { Button } from "@/components/ui/button";
import {
  FootprintCalendar,
  type CalMetric,
  type FootprintSelection,
} from "@/components/greenops/calendar";
import {
  ComparisonBoard,
  comparisonFromHash,
  type ComparisonSelection,
} from "@/components/greenops/compare";
import { Q } from "@/components/greenops/ui";
import { useDaily, useBonus } from "@/lib/queries";
import { DetailDrawer, DetailBlock, EvidenceInfoButton } from "@/components/greenops/details";
import { seo } from "@/lib/seo";
import { ExplorationScope } from "@/components/greenops/exploration-scope";
export const Route = createFileRoute("/explore")({
  head: () =>
    seo(
      "Explore & Findings — GreenOps OS",
      "Explore the daily and geographic digital footprint and compare cost drivers.",
    ),
  component: Explore,
});
function sectionForHash(hash: string) {
  if (hash === "geographic-footprint") return "geographic";
  if (hash === "compare" || comparisonFromHash(hash)) return "compare";
  return "footprint";
}

function Explore() {
  const navigate = useNavigate();
  const hash = useRouterState({ select: (r) => r.location.hash.replace(/^#/, "") });
  const [comparison, setComparison] = useState<ComparisonSelection>({
    servers: false,
    serverMetric: "runtimeH30d",
    search: "",
  });
  const [footprint, setFootprint] = useState<FootprintSelection>({
    range: null,
    date: null,
    view: "2d",
  });
  const [geoMetric, setGeoMetric] = useState<"costChf" | "co2KgLocation" | "energyKwh">("costChf");
  const [metric, setMetric] = useState<CalMetric>("co2Kg");
  const [compareFootprint, setCompareFootprint] = useState(true);
  const linkedComparison = comparisonFromHash(hash);
  useEffect(() => {
    const linked = comparisonFromHash(hash);
    if (linked)
      setComparison((current) => ({ ...current, spending: linked, servers: false, search: "" }));
    if (hash.startsWith("finding-")) {
      const id = hash.slice("finding-".length);
      if (id.startsWith("F-") && !/^F-C(?:-|\d+$)/.test(id))
        void navigate({ to: "/studio", hash: `measure-${id.slice(2)}`, replace: true });
      else void navigate({ to: "/findings", hash, replace: true });
    }
  }, [hash, navigate]);
  return (
    <AppShell
      kicker="Connect · Find"
      title="Explore & Findings"
      subtitle="Investigate the digital footprint and compare operational drivers."
    >
      <ExplorationScope />
      <DashboardSections
        label="Explore and Findings sections"
        sectionForHash={sectionForHash}
        onSectionChange={() => {
          if (hash) void navigate({ to: "/explore", hash: "", resetScroll: false });
        }}
        sections={[
          {
            id: "footprint",
            label: "Digital Footprint",
            content: (
              <FootprintSection
                hash={hash}
                selection={footprint}
                onSelectionChange={setFootprint}
                metric={metric}
                onMetricChange={setMetric}
                compare={compareFootprint}
                onCompareChange={setCompareFootprint}
              />
            ),
          },
          {
            id: "geographic",
            label: "Geographic Footprint",
            content: <GeographicFootprint metric={geoMetric} onMetricChange={setGeoMetric} />,
          },
          {
            id: "compare",
            label: "Compare",
            content: (
              <div id={linkedComparison ? hash : "compare"}>
                <ComparisonBoard
                  key={linkedComparison ? hash : "comparison"}
                  selection={comparison}
                  onChange={setComparison}
                />
                <div className="mt-3 flex items-center gap-1 text-sm">
                  <span>Operational source evidence</span>
                  <DetailDrawer
                    title="Operational source evidence"
                    trigger={<EvidenceInfoButton description="operational sources" />}
                  >
                    <OperationalEvidence />
                  </DetailDrawer>
                </div>
              </div>
            ),
          },
        ]}
      />
    </AppShell>
  );
}

function FootprintSection({
  hash,
  selection,
  onSelectionChange,
  metric,
  onMetricChange,
  compare,
  onCompareChange,
}: {
  hash: string;
  selection: FootprintSelection;
  onSelectionChange: (selection: FootprintSelection) => void;
  metric: CalMetric;
  onMetricChange: (metric: CalMetric) => void;
  compare: boolean;
  onCompareChange: (compare: boolean) => void;
}) {
  const daily = useDaily(false);
  const navigate = useNavigate();
  const market = daily.data?.some((d) => d.co2KgMarket != null);
  const footprintMetric = hash === "footprint-market" && market ? "co2KgMarket" : metric;
  return (
    <div id={hash === "footprint-market" ? hash : "footprint"}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">Footprint calendar</h2>
        <div className="flex max-w-full flex-wrap gap-1">
          {(
            [
              ["costChf", "Cost"],
              ["energyKwh", "Energy"],
              ["co2Kg", "Location-based CO₂"],
              ["co2KgMarket", "Market-based CO₂"],
            ] as const
          ).map(([v, l]) => (
            <Button
              key={v}
              size="sm"
              variant="ghost"
              className="secondary-selection"
              aria-pressed={footprintMetric === v}
              disabled={v === "co2KgMarket" && !market}
              onClick={() => {
                onMetricChange(v);
                onCompareChange(false);
                if (hash === "footprint-market")
                  void navigate({ to: "/explore", hash: "footprint" });
              }}
            >
              {l}
            </Button>
          ))}
        </div>
      </div>
      {daily.data && !market && (
        <p className="mb-4 text-xs text-muted-foreground">
          Daily market-based emissions unavailable. Annual accounting totals do not provide daily
          values.
        </p>
      )}
      <Q q={daily}>
        {(d) => (
          <FootprintCalendar
            days={d}
            metric={footprintMetric}
            compare={compare}
            onCompareChange={onCompareChange}
            selection={selection}
            onSelectionChange={onSelectionChange}
          />
        )}
      </Q>
    </div>
  );
}

function OperationalEvidence() {
  const bonus = useBonus();
  return (
    <Q q={bonus}>
      {(b) => (
        <div className="space-y-6">
          <DetailBlock title="AI models">
            {b.aiModels.map((m) => (
              <p key={m.model}>
                {m.model} · {m.tokensM} million tokens · {chf(m.costChf)}
              </p>
            ))}
          </DetailBlock>
          <DetailBlock title="Carbon-aware scheduling">
            {b.carbonJobs.map((j) => (
              <p key={j.job} className="mb-3">
                {j.job} · {j.window}
                <span className="block text-muted-foreground">
                  {j.currentStart} → {j.suggestedStart} · {carbonMass(j.co2SavedKgYear, "kg CO₂")}
                  /year
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
  );
}
