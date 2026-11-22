import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ScenarioForecastPanel } from "@/components/greenops/scenario-forecast";
import type { Forecast, ForecastPoint } from "@/lib/api/types";

const state = vi.hoisted(() => ({ forecast: undefined as Forecast | undefined }));
vi.mock("@/lib/queries", () => ({ useOverview: () => ({ data: {
  forecastSupport: [{ metric: "energy", horizons: [3] }],
  monthly: [{ month: "2026-08", energyKwh: 250 }],
} }) }));
vi.mock("@/lib/path-queries", () => ({ useSelectionForecasts: () => [{ data: state.forecast }] }));
vi.mock("@/components/greenops/scenario-chart", () => ({ ScenarioChart: ({ rows }: {
  rows: { history?: number; noChange?: number; plan?: number }[];
}) => <p>{rows.map((r) => r.history ?? `${r.noChange} → ${r.plan}`).join(" | ")}</p> }));

const point = (date: string, noChange: number, plan: number): ForecastPoint => ({
  year: Number(date.slice(0, 4)), date,
  baseline: { low: noChange, mid: noChange, high: noChange },
  optimized: { low: plan, mid: plan, high: plan },
});

afterEach(cleanup);

it("starts on the changed development energy path and switches the history and forecast together", () => {
  state.forecast = { metric: "energy", unit: "kWh", growthAssumption: "", granularity: "monthly",
    points: [point("2026-09-01", 300, 200)], platforms: [{ id: "dp-dev", label: "Development platform",
      runtimeChanged: true, history: [{ month: "2026-08", energyKwh: 57, costChf: null, co2Kg: null }],
      points: [point("2026-09-01", 60, 25)], annualTotals: [],
    }] };
  render(<ScenarioForecastPanel title="Forecast" showDetails initialMetric="energy" selections={[
    { key: "plan", label: "Current Plan", color: "green", measureIds: ["timeout"] },
  ]} />);
  expect(screen.getByRole("button", { name: "Development platform" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByText("57 | 60 → 25")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "All resources" }));
  expect(screen.getByText("250 | 300 → 200")).toBeInTheDocument();
});
