import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { InspectorProvider } from "@/components/greenops/analytical-inspector";
import { ScenarioForecastPanel } from "@/components/greenops/scenario-forecast";
import { ScenarioChart } from "@/components/greenops/scenario-chart";
import type { Forecast, MonthlyObservation } from "@/lib/api/types";
import { demoOverview } from "@/lib/api/demo-data";
import { chf } from "@/lib/format";
import { buildScenarioChart, FORECAST_BOUNDARY, scenarioDomain } from "@/lib/scenario-series";

const selectForecasts = vi.fn();
const annualRange = (mid: number) => ({ low: mid - 12, mid, high: mid + 12 });
const dateAt = (index: number) => new Date(Date.UTC(2025, 8 + index, 1)).toISOString().slice(0, 10);
const historical: MonthlyObservation[] = Array.from({ length: 12 }, (_, i) => ({
  month: dateAt(i).slice(0, 7),
  costChf: i === 4 ? null : 100 + i,
  energyKwh: 270 + i,
  co2Kg: 30,
}));
const support: NonNullable<typeof demoOverview.forecastSupport> = [
  { metric: "cost", horizons: [1, 2, 3] },
  { metric: "energy", horizons: [1, 2, 3] },
  { metric: "co2Market", horizons: [1, 2, 3] },
];

function forecast(
  metric: Forecast["metric"],
  years: number,
  market = metric === "co2Market",
): Forecast {
  const annual = Array.from({ length: years + 1 }, (_, i) => ({
    date: `${2026 + i}-08-01`,
    year: 2026 + i,
    periodLabel: `Sep–Aug ${2026 + i}`,
    baseline: annualRange(6000 + 120 * i),
    optimized: market ? null : annualRange(5800 + 120 * i),
  }));
  return {
    metric,
    unit: market ? "kg CO₂e" : metric === "energy" ? "kWh" : "CHF",
    growthAssumption: "Source-backed growth assumption",
    granularity: market ? "annual" : "monthly",
    points: market
      ? annual
      : Array.from({ length: 12 * years }, (_, i) => ({
          date: dateAt(12 + i),
          year: Number(dateAt(12 + i).slice(0, 4)),
          baseline: annualRange(500 + i),
          optimized: annualRange(490 + i),
        })),
    annualTotals: annual,
    ...(market ? { marketScopeLabel: "Covered residual-mix activity" } : {}),
  };
}

vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  useRouterState: ({ select }: { select: (state: { location: { hash: string } }) => unknown }) =>
    select({ location: { hash: "" } }),
}));
vi.mock("@/lib/queries", () => ({
  useOverview: () => ({ data: { ...demoOverview, forecastSupport: support, monthly: historical } }),
}));
vi.mock("@/lib/path-queries", () => ({
  useSelectionForecasts: (
    metric: Forecast["metric"],
    years: number,
    selections: unknown[],
    enabled: boolean,
  ) => {
    selectForecasts(metric, years, selections, enabled);
    return selections.map(() => ({ data: enabled ? forecast(metric, years) : undefined }));
  },
}));
vi.mock("recharts", async (original) => {
  const { cloneElement } = await import("react");
  return {
    ...(await original<typeof import("recharts")>()),
    ResponsiveContainer: ({
      children,
    }: {
      children: import("react").ReactElement<{ width: number; height: number }>;
    }) => cloneElement(children, { width: 780, height: 340 }),
  };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("keeps twelve chronological history slots and plots only real supplied model dates", () => {
  const f = forecast("cost", 2);
  const firstProjection = f.points[0]!;
  f.points = [
    { ...firstProjection, date: dateAt(11) },
    ...f.points.filter((_, index) => index !== 2),
  ];
  const chart = buildScenarioChart(
    historical.filter((point) => point.month !== "2026-02"),
    "cost",
    [{ key: "plan", forecast: f }],
  );
  expect(chart.boundary).toBe(FORECAST_BOUNDARY);
  const observations = chart.rows.filter(({ kind }) => kind === "actual");
  expect(observations.map(({ time }) => time)).toEqual(
    Array.from({ length: 12 }, (_, i) => Date.parse(dateAt(i))),
  );
  expect(observations[4]?.["history"]).toBeNull();
  expect(observations[5]?.["history"]).toBeNull();
  expect(observations[11]?.["noChange"]).toBeUndefined();
  expect(chart.historyCount).toBe(10);
  const gap = chart.rows.find((row) => row.label === "November 2026");
  expect(gap?.["plan"]).toBeUndefined();
  expect(chart.rows.find(({ time }) => time === FORECAST_BOUNDARY)?.["plan"]).toBe(490);
  expect(chart.rows.at(-1)?.time).toBe(Date.parse(dateAt(35)));
});

it("joins scenario values only on matching source dates", () => {
  const first = forecast("cost", 1);
  const second = {
    ...first,
    points: first.points.slice(1).map((p) => ({ ...p, optimized: annualRange(600) })),
  };
  const chart = buildScenarioChart(historical, "cost", [
    { key: "path-a", forecast: first },
    { key: "path-b", forecast: second },
  ]);
  const sep = chart.rows.find(({ time }) => time === FORECAST_BOUNDARY);
  expect(sep).toMatchObject({ "path-a": 490, noChange: 500 });
  expect(sep?.["path-b"]).toBeUndefined();
  expect(chart.rows.find(({ time }) => time === Date.parse("2026-10-01"))).toMatchObject({
    "path-a": 491,
    "path-b": 600,
    noChange: 501,
  });
});

it("uses actual supplied annual dates and preserves unsupported market savings and range endpoints", () => {
  const f = forecast("co2Market", 3);
  const data = buildScenarioChart(historical, "co2Market", [{ key: "plan", forecast: f }]);
  const future = data.rows.filter(({ kind }) => kind === "projected");
  expect(data.granularity).toBe("annual");
  expect(future.map(({ time }) => time)).toEqual(
    f.points.slice(1).map((point) => Date.parse(point.date!)),
  );
  expect(future[0]?.ranges?.["noChange"]).toEqual({ low: 509, mid: 510, high: 511 });
  expect(future.every((row) => row["plan"] === null)).toBe(true);
  expect(data.historyCount).toBe(0);
  const [min, max] = scenarioDomain([-40, 0, 900, 1000]);
  expect(min).toBeLessThan(-40);
  expect(max).toBeGreaterThan(1000);
  const [tightMin, tightMax] = scenarioDomain([500, 502]);
  expect(tightMax - tightMin).toBeGreaterThan(100);
});

it("keeps horizon and metric controls separate and synchronizes one selected date across scenarios", () => {
  render(
    <InspectorProvider>
      <ScenarioForecastPanel
        title="Forecast"
        showDetails
        selections={[
          {
            key: "plan",
            label: "Current Plan",
            color: "var(--scenario-plan)",
            measureIds: ["M1"],
            toggleable: false,
          },
        ]}
      />
    </InspectorProvider>,
  );
  const metrics = within(screen.getByRole("group", { name: "Metric" }));
  expect(metrics.getAllByRole("button").map((element) => element.textContent)).toEqual([
    "Cost",
    "Energy",
    "Location-based CO₂",
    "Market-based CO₂",
  ]);
  expect(metrics.getByRole("button", { name: "Location-based CO₂" })).toBeDisabled();
  const horizon = within(screen.getByRole("group", { name: "Forecast horizon" }));
  fireEvent.click(horizon.getByRole("button", { name: "1 year" }));
  expect(selectForecasts).toHaveBeenLastCalledWith(
    "cost",
    1,
    [expect.objectContaining({ measureIds: ["M1"] })],
    true,
  );
  const date = screen.getByLabelText("Inspect a date");
  expect(
    within(date).getByRole("group", { name: "Actual history" }).querySelectorAll("option"),
  ).toHaveLength(12);
  fireEvent.change(date, { target: { value: String(Date.parse("2027-01-01")) } });
  const detail = within(screen.getByRole("region", { name: "Selected forecast date" }));
  expect(detail.getByText("January 2027 — Projected outcomes")).toBeVisible();
  expect(detail.getByText("CHF 504")).toBeVisible();
  expect(detail.getByText("CHF 494")).toBeVisible();
  expect(detail.getByText(/CHF 10 lower/)).toBeVisible();
  expect(screen.getByRole("region", { name: "Projected impact" })).toHaveTextContent(
    "Annual projection",
  );
  expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: /view calculation and evidence for forecast/i }),
  );
  const evidence = screen.getByRole("complementary", { name: "Analysis details" });
  expect(within(evidence).getByText("Annual total · Sep–Aug 2027")).toBeVisible();
  expect(within(evidence).getByText("Source-backed growth assumption")).toBeVisible();
  expect(screen.getByLabelText("Inspect a date")).toBeVisible();
  fireEvent.click(within(evidence).getByRole("button", { name: "Close evidence" }));
  expect(screen.getByText("January 2027 — Projected outcomes")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Market-based CO₂" }));
  expect(selectForecasts).toHaveBeenLastCalledWith("co2Market", 1, expect.any(Array), true);
  expect(screen.getByText("Covered residual-mix activity")).toBeVisible();
  expect(screen.getByText(/no supported market-based effect/)).toBeVisible();
});

it("preserves actual versus dashed scenario styling and shows missing historical data as unavailable", () => {
  const data = buildScenarioChart(historical, "cost", [
    { key: "path-b", forecast: forecast("cost", 1) },
  ]);
  const toggle = vi.fn();
  render(
    <ScenarioChart
      rows={data.rows}
      boundary={data.boundary}
      format={chf}
      unit="CHF / month"
      onToggle={toggle}
      series={[
        {
          key: "history",
          label: "Actual history",
          color: "var(--scenario-history)",
          dashed: false,
        },
        { key: "noChange", label: "Without changes", color: "var(--scenario-none)", dashed: true },
        {
          key: "path-b",
          label: "Retrofit Path",
          color: "var(--path-b)",
          dashed: true,
          toggleable: true,
        },
      ]}
    />,
  );
  const plot = screen.getByRole("img", { name: "Forecast timeline · CHF / month" });
  expect(
    plot.querySelector(".recharts-line-curve[stroke='var(--scenario-history)']"),
  ).not.toHaveAttribute("stroke-dasharray");
  expect(plot.querySelector(".recharts-line-curve[stroke='var(--path-b)']")).toHaveAttribute(
    "stroke-dasharray",
    "5 3",
  );
  const legend = within(screen.getByRole("list", { name: "Chart legend" }));
  expect(legend.getByText("Actual history").querySelector("line")).not.toHaveAttribute(
    "stroke-dasharray",
  );
  const path = legend.getByRole("button", { name: "Retrofit Path" });
  expect(path.querySelector("line")).toHaveAttribute("stroke", "var(--path-b)");
  expect(path.querySelector("line")).toHaveAttribute("stroke-dasharray");
  fireEvent.click(path);
  expect(toggle).toHaveBeenCalledWith("path-b");
  fireEvent.change(screen.getByLabelText("Inspect a date"), {
    target: { value: String(Date.parse("2026-01-01")) },
  });
  const detail = within(screen.getByRole("region", { name: "Selected forecast date" }));
  expect(detail.getByText("January 2026 — Actual observation")).toBeVisible();
  expect(detail.getByText("Unavailable")).toBeVisible();
  expect(detail.queryByText("Retrofit Path")).not.toBeInTheDocument();
});

it("requests a no-change forecast when no strategy is available", () => {
  render(
    <ScenarioForecastPanel
      title="Forecast"
      showDetails
      selections={[]}
      emptyNote="Create a strategy to model changes."
    />,
  );
  expect(selectForecasts).toHaveBeenCalledWith(
    "cost",
    3,
    [{ key: "baseline", label: "Without changes", measureIds: [] }],
    true,
  );
  const summary = within(screen.getByRole("region", { name: "Projected impact" }));
  expect(summary.getByText("Without changes")).toBeVisible();
  expect(summary.queryByText("Projected difference")).not.toBeInTheDocument();
});
