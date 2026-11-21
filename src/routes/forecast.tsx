import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/greenops/shell";
import { ScenarioForecastPanel } from "@/components/greenops/scenario-forecast";
import { DetailDrawer, DetailBlock } from "@/components/greenops/details";
import { Button } from "@/components/ui/button";
import type { Forecast } from "@/lib/api/types";
import { useForecast } from "@/lib/queries";
import { useApp } from "@/lib/store";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/forecast")({
  head: () =>
    seo(
      "Current Plan Forecast — GreenOps OS",
      "Actual monthly history and projected cost, energy and emissions with and without your committed Current Plan.",
    ),
  component: ForecastPage,
});
function ForecastPage() {
  const { s } = useApp();
  const [metric, setMetric] = useState<Forecast["metric"]>("cost");
  const fc = useForecast(metric, 1);
  const f = fc.data;
  return (
    <AppShell
      kicker="Know the limits · Forecasts"
      title="Current Plan forecast"
      subtitle="Actual monthly history, then projections without changes and with your committed Current Plan. Projections are not realized savings."
    >
      <section data-analysis-region id="forecast">
        <ScenarioForecastPanel
          title="Committed Current Plan vs. without changes"
          onState={(x) => setMetric(x.metric)}
          selections={[
            {
              key: "plan",
              label: "With Current Plan",
              color: "var(--scenario-plan)",
              measureIds: s.measureIds,
              toggleable: false,
            },
          ]}
        />
        <p className="mt-3 text-xs text-muted-foreground">
          {s.measureIds.length
            ? `${s.measureIds.length} committed measures.`
            : "No measures committed yet — both scenario lines match."}{" "}
          <Link to="/current-plan" className="underline underline-offset-2">
            Review Current Plan
          </Link>{" "}
          ·{" "}
          <Link to="/studio" hash="paths" className="underline underline-offset-2">
            Compare alternative Paths
          </Link>
        </p>
        {f && (
          <DetailDrawer
            title="Forecast assumptions & calculation"
            description="Current Plan"
            trigger={
              <Button variant="outline" className="mt-5">
                Assumptions & Calculation
              </Button>
            }
          >
            <DetailBlock title="Growth assumptions">
              <p>{f.growthAssumption}</p>
            </DetailBlock>
            <DetailBlock title="Committed measures">
              <p>{s.measureIds.join(" · ") || "No measures committed"}</p>
            </DetailBlock>
            <DetailBlock title="Implementation timing">
              <p>{f.implementationTiming ?? "Not supplied"}</p>
            </DetailBlock>
            <DetailBlock title="Granularity">
              <p>
                {f.granularity === "monthly"
                  ? "Monthly supplied values, averaged per 3-month period."
                  : "Annual totals only, shown as one monthly-average point per year. No quarterly variation is inferred."}
              </p>
            </DetailBlock>
            <DetailBlock title="Methodology">
              <p>{f.methodology?.formula ?? "Not supplied"}</p>
            </DetailBlock>
            <DetailBlock title="Limitations">
              <p>
                {f.methodology?.limitations.join(" · ") ||
                  "Baseline evidence does not validate forecast growth. Uncertainty ranges are not drawn unless supplied as defensible by the provider."}
              </p>
            </DetailBlock>
          </DetailDrawer>
        )}
      </section>
    </AppShell>
  );
}
