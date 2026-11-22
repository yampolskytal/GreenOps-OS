import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ScenarioForecastPanel } from "@/components/greenops/scenario-forecast";
import { InspectorProvider } from "@/components/greenops/analytical-inspector";
import type { Forecast, ForecastPoint } from "@/lib/api/types";

const state = vi.hoisted(() => ({ forecast: undefined as Forecast | undefined }));
vi.mock("@/lib/queries", () => ({
  useOverview: () => ({
    data: {
      forecastSupport: [{ metric: "energy", horizons: [3] }],
      monthly: [{ month: "2026-08", energyKwh: 250 }],
    },
  }),
}));
vi.mock("@/lib/path-queries", () => ({ useSelectionForecasts: () => [{ data: state.forecast }] }));
vi.mock("@/components/greenops/scenario-chart", () => ({
  ScenarioChart: ({ rows }: { rows: { history?: number; noChange?: number; plan?: number }[] }) => (
    <p>{rows.map((r) => r.history ?? `${r.noChange} → ${r.plan}`).join(" | ")}</p>
  ),
}));

const point = (date: string, noChange: number, plan: number): ForecastPoint => ({
  year: Number(date.slice(0, 4)),
  date,
  baseline: { low: noChange, mid: noChange, high: noChange },
  optimized: { low: plan, mid: plan, high: plan },
});

afterEach(cleanup);

it("shows aggregate energy projections and evidence for the selected platform runtime measure", () => {
  const workloadAssumption =
    "Reduce development platform runtime: continuing effect changes +2.0%/year after year one, using modeled kWh in the affected scope.";
  state.forecast = {
    metric: "energy",
    unit: "kWh",
    growthAssumption: "Baseline growth converges to the configured midpoint by year three.",
    granularity: "monthly",
    points: [point("2026-09-01", 300, 200)],
    drivers: [
      {
        date: "2026-09-01",
        label: "Selected measures begin",
        source: "Modeled rollout timing for selected measures",
        amount: -1200,
        basis: "annual",
      },
    ],
    methodology: {
      title: "Timed forecast scenario",
      kind: "forecast",
      period: "Sep 2025 – Aug 2026",
      units: "kWh",
      formula: "Monthly baseline adjusted for dated operational effects",
      sources: ["Normalized baseline ledger"],
      inputs: [],
      assumptions: [workloadAssumption],
      limitations: [],
    },
  };
  render(
    <InspectorProvider>
      <ScenarioForecastPanel
        title="Forecast"
        showDetails
        initialMetric="energy"
        selections={[
          { key: "plan", label: "Current Plan", color: "green", measureIds: ["timeout"] },
        ]}
      />
    </InspectorProvider>,
  );
  expect(screen.getByText(/250 \| 300 → 200$/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /evidence for forecast methodology/i }));
  const evidence = within(
    screen.getByRole("complementary", { name: "Forecast assumptions & calculation" }),
  );
  expect(evidence.getByText(workloadAssumption)).toBeVisible();
  expect(evidence.getByText(/Selected measures begin/)).toBeVisible();
  expect(evidence.getByText(/Modeled rollout timing for selected measures/)).toBeVisible();
});
