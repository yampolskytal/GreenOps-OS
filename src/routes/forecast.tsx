import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { AppShell } from "@/components/greenops/shell";
import { FORECAST_METRICS, ScenarioForecastPanel } from "@/components/greenops/scenario-forecast";
import { useDisplayedPlan } from "@/lib/store";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/forecast")({
  head: () =>
    seo(
      "Forecasts — GreenOps OS",
      "Actual monthly history and projected costs, energy and emissions.",
    ),
  component: ForecastPage,
});

function ForecastPage() {
  const hash = useRouterState({ select: (r) => r.location.hash.replace(/^#/, "") });
  const chartMetric = FORECAST_METRICS.find((metric) => hash === `forecast-${metric.id}`)?.id;
  const plan = useDisplayedPlan();
  const hasStrategy = plan.ready && plan.measureIds.length > 0;
  const strategyLabel = plan.suggested ? "Suggested starting strategy" : "Current Plan";
  return (
    <AppShell
      title="Forecasts"
      subtitle="Compare actual history with projected outcomes over one to three years."
    >
      <section data-analysis-region id={chartMetric ? `forecast-${chartMetric}` : "forecast"}>
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <p>
            {hasStrategy
              ? `${plan.measureIds.length} ${plan.suggested ? "suggested" : "committed"} measures.`
              : "No strategy has been committed."}
          </p>
          <Link
            to={hasStrategy || plan.suggested ? "/current-plan" : "/studio"}
            className="text-accent-ink underline underline-offset-2"
          >
            {plan.suggested
              ? "Review and adopt the suggested strategy"
              : hasStrategy
                ? "Review Current Plan"
                : "Create a strategy"}
          </Link>
          <Link to="/studio" hash="paths" className="text-accent-ink underline underline-offset-2">
            Compare alternative Paths
          </Link>
        </div>
        <ScenarioForecastPanel
          key={chartMetric ?? "forecast"}
          {...(chartMetric ? { initialMetric: chartMetric } : {})}
          title={hasStrategy ? `${strategyLabel} vs. without changes` : "Without changes"}
          showDetails
          selections={
            hasStrategy
              ? [
                  {
                    key: "plan",
                    label: strategyLabel,
                    color: "var(--scenario-plan)",
                    measureIds: plan.measureIds,
                    toggleable: false,
                  },
                ]
              : []
          }
        />
      </section>
    </AppShell>
  );
}
