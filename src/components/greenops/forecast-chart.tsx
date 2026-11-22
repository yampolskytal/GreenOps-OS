import type { Forecast, MonthlyObservation } from "@/lib/api/types";
import { buildScenarioChart } from "@/lib/scenario-series";
import { ScenarioChart } from "./scenario-chart";

export function ForecastChart({
  f,
  format,
  height = 320,
  history = [],
  planLabel = "Current Plan",
}: {
  f: Forecast;
  format: (n: number) => string;
  height?: number;
  history?: MonthlyObservation[];
  planLabel?: string;
}) {
  const chart = buildScenarioChart(history, f.metric, [{ key: "plan", forecast: f }]);
  return (
    <ScenarioChart
      rows={chart.rows}
      boundary={chart.boundary}
      format={format}
      unit={`${f.unit} / month${chart.granularity === "annual" ? " · annual projections shown as monthly averages" : ""}`}
      showBand
      height={height}
      series={[
        {
          key: "history",
          label: "Actual history",
          color: "var(--scenario-history)",
          dashed: false,
        },
        { key: "noChange", label: "Without changes", color: "var(--scenario-none)", dashed: true },
        { key: "plan", label: planLabel, color: "var(--scenario-plan)", dashed: true },
      ]}
    />
  );
}
