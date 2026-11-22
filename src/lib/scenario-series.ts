import type { Forecast, HistoricalMetric, MonthlyObservation, Range } from "./api/types";
import { forecastLabel, isAvailable, monthLabel } from "./analytics";

export const METRIC_FIELD: Record<Forecast["metric"], HistoricalMetric> = {
  cost: "costChf",
  energy: "energyKwh",
  co2Location: "co2Kg",
  co2Market: "co2KgMarket",
};
const baselineFrom = Date.UTC(2025, 8, 1);
export const FORECAST_BOUNDARY = Date.UTC(2026, 8, 1);
const MONTH = /^(\d{4})-(0[1-9]|1[0-2])/;
export interface ScenarioRow {
  time: number;
  label: string;
  kind: "actual" | "projected";
  coverage?: string;
  ranges?: Record<string, Range>;
  [series: string]: number | string | Record<string, Range> | null | undefined;
}
export interface ScenarioSource {
  key: string;
  forecast: Forecast | null | undefined;
}
export type ScenarioGranularity = "monthly" | "annual" | "none";

const monthStart = (label: string) => {
  const match = MONTH.exec(label);
  return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, 1) : NaN;
};
const nextMonth = (time: number) => {
  const date = new Date(time);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
};

function scaleRange(range: Range | null, scale: number) {
  return (
    range && {
      low: range.low * scale,
      mid: range.mid * scale,
      high: range.high * scale,
    }
  );
}

/**
 * Monthly projections use supplied dates and values. Annual totals use one
 * monthly-average point per supplied year so the units match observed months.
 */
export function buildScenarioChart(
  history: MonthlyObservation[],
  metric: Forecast["metric"],
  sources: ScenarioSource[],
) {
  const rows = new Map<number, ScenarioRow>();
  const field = METRIC_FIELD[metric];
  const observations = new Map(history.map((point) => [monthStart(point.month), point]));
  let historyCount = 0;
  for (let time = baselineFrom; time < FORECAST_BOUNDARY; time = nextMonth(time)) {
    const observed = observations.get(time);
    const value = observed?.[field];
    if (isAvailable(value)) historyCount++;
    rows.set(time, {
      time,
      kind: "actual",
      label: monthLabel(new Date(time).toISOString(), "long"),
      history: isAvailable(value) ? value : null,
      coverage:
        metric === "co2Market" && observed?.marketCoverage?.coveragePct != null
          ? `${observed.marketCoverage.coveragePct.toFixed(1)}% of modeled energy covered`
          : (observed?.status ?? "Observation coverage unavailable"),
    });
  }

  const available = sources.filter(
    ({ forecast }) => forecast?.metric === metric && forecast.points.length,
  );
  const granularity: ScenarioGranularity = !available.length
    ? "none"
    : available[0]?.forecast?.granularity === "monthly"
      ? "monthly"
      : "annual";
  const resolutionMismatch = available.some(
    ({ forecast }) => (forecast?.granularity === "monthly") !== (granularity === "monthly"),
  );

  for (const { key, forecast } of available) {
    if (!forecast || (forecast.granularity === "monthly") !== (granularity === "monthly")) continue;
    for (const point of forecast.points) {
      const monthly = forecast.granularity === "monthly";
      const time = point.date ? Date.parse(point.date) : monthly ? NaN : Date.UTC(point.year, 0, 1);
      if (!Number.isFinite(time) || time < FORECAST_BOUNDARY) continue;
      const scale = monthly ? 1 : 1 / 12;
      const row = rows.get(time) ?? {
        time,
        kind: "projected" as const,
        label: monthly ? monthLabel(point.date ?? "", "long") : forecastLabel(point),
        ...(point.coverage ? { coverage: point.coverage } : {}),
      };
      const ranges = (row.ranges ??= {});
      if (row["noChange"] == null) {
        row["noChange"] = point.baseline.mid * scale;
        ranges["noChange"] = scaleRange(point.baseline, scale)!;
      }
      if (key !== "baseline") {
        const range = scaleRange(point.optimized, scale);
        row[key] = range?.mid ?? null;
        if (range) ranges[key] = range;
      }
      rows.set(time, row);
    }
  }

  // Represent missing model months as gaps, with no numeric values.
  if (granularity === "monthly") {
    const last = Math.max(...rows.keys());
    const monthKeys = new Set(
      [...rows.keys()].map((time) => monthStart(new Date(time).toISOString())),
    );
    for (let time = FORECAST_BOUNDARY; time < last; time = nextMonth(time)) {
      if (!monthKeys.has(time))
        rows.set(time, {
          time,
          label: monthLabel(new Date(time).toISOString(), "long"),
          kind: "projected",
          coverage: "No projection supplied for this month",
        });
    }
  }
  return {
    rows: [...rows.values()].sort((a, b) => a.time - b.time),
    granularity,
    historyCount,
    resolutionMismatch,
    boundary: FORECAST_BOUNDARY,
  };
}

export function scenarioDomain(values: number[]): [number, number] {
  if (!values.length) return [0, 1];
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const span = Math.max(
    maximum - minimum,
    0.2 * Math.max(Math.abs(minimum), Math.abs(maximum)),
    0.001,
  );
  const padding = (span - (maximum - minimum)) / 2 + span * 0.08;
  return [minimum >= 0 ? Math.max(0, minimum - padding) : minimum - padding, maximum + padding];
}
