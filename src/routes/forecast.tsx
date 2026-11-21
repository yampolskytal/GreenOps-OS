import { useState } from "react";
import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { AppShell } from "@/components/greenops/shell";
import { FORECAST_METRICS, ScenarioForecastPanel } from "@/components/greenops/scenario-forecast";
import { DetailDrawer, DetailBlock } from "@/components/greenops/details";
import { Button } from "@/components/ui/button";
import type { Forecast } from "@/lib/api/types";
import { useForecast } from "@/lib/queries";
import { useDisplayedPlan } from "@/lib/store";
import { PlanningProjection } from "@/components/greenops/starting-plan-notice";
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
  const hash = useRouterState({ select: (r) => r.location.hash });
  const chartMetric = FORECAST_METRICS.find((m) => hash === `forecast-${m.id}`)?.id;
  const plan = useDisplayedPlan();
  const [metric, setMetric] = useState<Forecast["metric"]>("cost");
  const fc = useForecast(metric, 1);
  const f = fc.data;
  return (
    <AppShell
      kicker="Know the limits · Forecasts"
      title={`${plan.label} forecast`}
      subtitle={`Actual monthly history, then projections without changes and with your ${plan.suggested ? "suggested starting strategy" : "committed Current Plan"}. Projections are not realized savings.`}
    >
      <section data-analysis-region id={chartMetric ? `forecast-${chartMetric}` : "forecast"}>
        <PlanningProjection>
        <ScenarioForecastPanel
          key={chartMetric ?? "forecast"}
          initialMetric={chartMetric ?? "cost"}
          title={`${plan.label} vs. without changes`}
          onState={(x) => setMetric(x.metric)}
          selections={[
            {
              key: "plan",
              label: `With ${plan.label}`,
              color: "var(--scenario-plan)",
              measureIds: plan.measureIds,
              toggleable: false,
            },
          ]}
        />
        <p className="mt-3 text-xs text-muted-foreground">
          {plan.measureIds.length
            ? `${plan.measureIds.length} ${plan.suggested ? "suggested" : "committed"} measures.`
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
            description={plan.label}
            trigger={
              <Button variant="outline" className="mt-5">
                Assumptions & Calculation
              </Button>
            }
          >
            <DetailBlock title="Growth assumptions">
              <p>{f.growthAssumption}</p>
            </DetailBlock>
            <DetailBlock title={plan.suggested ? "Suggested measures" : "Committed measures"}>
              <p>{plan.measureIds.join(" · ") || "No measures committed"}</p>
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
              {f.marketScopeLabel && <p>{f.marketScopeLabel}</p>}
              {f.methodology?.sources.length ? <p className="break-words">{f.methodology.sources.join(" · ")}</p> : null}
            </DetailBlock>
            <DetailBlock title="Limitations">
              <p>
                {f.methodology?.limitations.join(" · ") ||
                  "Baseline evidence does not validate forecast growth. Uncertainty ranges are not drawn unless supplied as defensible by the provider."}
              </p>
            </DetailBlock>
          </DetailDrawer>
        )}
        </PlanningProjection>
      </section>
    </AppShell>
  );
}
