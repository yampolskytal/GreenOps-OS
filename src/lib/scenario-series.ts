import type { Forecast, HistoricalMetric, MonthlyObservation } from "./api/types";
import { aggregateForecast, isAvailable, monthLabel } from "./analytics";

export const METRIC_FIELD: Record<Forecast["metric"], HistoricalMetric> = {
  cost: "costChf",
  energy: "energyKwh",
  co2Location: "co2Kg",
  co2Market: "co2KgMarket",
};
export interface ScenarioRow {
  time: number;
  label: string;
  kind: "actual" | "projected";
  coverage?: string;
  [series: string]: number | string | null | undefined;
}
export interface ScenarioSource {
  key: string;
  forecast: Forecast | null | undefined;
}
export type ScenarioGranularity = "quarterly" | "annual" | "none";
const monthStart = (month: string) => Date.parse(`${month.slice(0, 7)}-01T00:00:00Z`);
const addMonths = (time: number, n: number) => {
  const d = new Date(time);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1);
};

/**
 * Builds one shared timeline in a monthly unit:
 * - Actual history comes from genuine monthly observations (missing stays null).
 * - Monthly forecasts are averaged into supplied 3-month periods only.
 * - Annual forecasts are shown as one point per year at their monthly average (annual ÷ 12);
 *   no intermediate quarterly or monthly values are created.
 * "noChange" uses the first available forecast's baseline; each source uses its optimized values.
 */
export function buildScenarioChart(
  history: MonthlyObservation[],
  metric: Forecast["metric"],
  sources: ScenarioSource[],
  historyMonths = 12,
) {
  const field = METRIC_FIELD[metric];
  const sorted = [...history]
    .filter((r) => Number.isFinite(monthStart(r.month)))
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-historyMonths);
  const rows = new Map<number, ScenarioRow>();
  const row = (time: number, label: string, kind: ScenarioRow["kind"]) => {
    const existing = rows.get(time);
    if (existing) return existing;
    const created: ScenarioRow = { time, label, kind };
    rows.set(time, created);
    return created;
  };
  let historyCount = 0;
  for (const r of sorted) {
    const value = r[field];
    const t = monthStart(r.month);
    const target = row(t, monthLabel(r.month), "actual");
    target["history"] = isAvailable(value) ? value : null;
    if (isAvailable(value)) historyCount++;
  }
  const lastHistory = sorted.at(-1);
  const boundary = lastHistory ? monthStart(lastHistory.month) : null;
  const available = sources.filter((s) => s.forecast && s.forecast.points.length);
  const monthly = available.length > 0 && available.every((s) => s.forecast?.granularity === "monthly" && s.forecast.points.every((p) => p.date));
  const granularity: ScenarioGranularity = !available.length ? "none" : monthly ? "quarterly" : "annual";
  let baselineSet = false;
  for (const source of available) {
    const f = monthly ? aggregateForecast(source.forecast as Forecast, 3) : (source.forecast as Forecast);
    f.points.forEach((p, i) => {
      let time: number;
      let label: string;
      if (monthly && p.date) {
        time = Date.parse(p.date);
        label = p.periodLabel ?? monthLabel(p.date);
      } else {
        const anchor = boundary ?? Date.UTC(p.year, 0, 1);
        time = addMonths(anchor, 12 * i);
        label = i === 0 ? `Baseline year ${p.year} (monthly avg)` : `Year ${i} · ${p.year} (monthly avg)`;
      }
      const target = row(time, label, boundary != null && time <= boundary && i === 0 ? "actual" : "projected");
      if (target.kind === "actual" && i === 0) target.kind = "projected";
      const scale = monthly ? 1 : 1 / 12;
      if (p.coverage) target.coverage = p.coverage;
      target[source.key] = isAvailable(p.optimized.mid) ? p.optimized.mid * scale : null;
      if (!baselineSet) target["noChange"] = isAvailable(p.baseline.mid) ? p.baseline.mid * scale : null;
    });
    baselineSet = true;
  }
  const list = [...rows.values()].sort((a, b) => a.time - b.time);
  for (const r of list) if (r["history"] != null) r.kind = "actual";
  const values = list.flatMap((r) =>
    Object.entries(r)
      .filter(([k, v]) => !["time", "label", "kind", "coverage"].includes(k) && isAvailable(v))
      .map(([, v]) => v as number),
  );
  return {
    rows: list,
    granularity,
    historyCount,
    boundary,
    max: values.length ? Math.max(...values) : 0,
    unitSuffix: "/ month",
  };
}
