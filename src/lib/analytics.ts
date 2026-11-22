import type {
  Forecast,
  ForecastPoint,
  HistoricalMetric,
  Kpi,
  MarketCoverage,
  MonthlyObservation,
  Range,
} from "./api/types";

export function marketCoverageLabel(coverage: MarketCoverage) {
  if (coverage.status === "no-change") return "No modeled emissions change.";
  return coverage.coveragePct === null
    ? "Market coverage of modeled energy is unavailable."
    : `${coverage.coveragePct.toFixed(1)}% of modeled energy covered.`;
}

export const isAvailable = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
export const percentDifference = (before: number, after: number) =>
  isAvailable(before) && isAvailable(after) && before > 0
    ? ((before - after) / before) * 100
    : null;
export const monthLabel = (month: string, length: "short" | "long" = "short") => {
  const date = new Date(`${month.slice(0, 7)}-01T00:00:00Z`);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString("en-US", { month: length, year: "numeric", timeZone: "UTC" })
    : month;
};
export function monthlyTotal(rows: MonthlyObservation[], metric: HistoricalMetric) {
  const values = rows.map((r) => r[metric]);
  const available = values.filter(isAvailable);
  return {
    value: available.length ? available.reduce((a, b) => a + b, 0) : null,
    available: available.length,
    total: rows.length,
  };
}
export function monthlyComparison(rows: MonthlyObservation[], metric: HistoricalMetric) {
  if (
    !rows.length ||
    rows.some((r) => !isAvailable(r[metric]) || !isAvailable(r.previous?.[metric]?.value))
  )
    return null;
  const previous = rows.map((r) => r.previous?.[metric]);
  const periods = previous.map((p) => p?.period ?? "");
  if (new Set(periods).size !== rows.length || periods.some((p) => !p)) return null;
  const before = previous.reduce((sum, p) => sum + (p?.value ?? 0), 0);
  const current = monthlyTotal(rows, metric).value;
  return current == null
    ? null
    : {
        value: before,
        percentage: percentDifference(before, current),
        period: `${periods[0]} — ${periods.at(-1)}`,
      };
}
export function accountingComparison(location?: Kpi | null, market?: Kpi | null) {
  if (
    !location ||
    !market ||
    location.unit !== market.unit ||
    location.calc.period !== market.calc.period ||
    location.region !== market.region ||
    location.entity !== market.entity ||
    location.coverage !== market.coverage ||
    !isAvailable(location.value.mid) ||
    !isAvailable(market.value.mid)
  )
    return null;
  return {
    difference: location.value.mid - market.value.mid,
    percentage: percentDifference(location.value.mid, market.value.mid),
  };
}
export const forecastLabel = (point: ForecastPoint) =>
  point.periodLabel ?? (point.date ? monthLabel(point.date) : String(point.year));

export const SUPPORTED_FORECAST_HORIZONS = [1, 2, 3] as const;
export const SKYLINE_ENCODING = { height: "costChf", color: "co2Kg" } as const;
export function recentForecastHistory(rows: MonthlyObservation[], metric: Forecast["metric"]) {
  const key = {
    cost: "costChf",
    energy: "energyKwh",
    co2Location: "co2Kg",
    co2Market: "co2KgMarket",
  }[metric] as HistoricalMetric;
  const sorted = [...rows].sort((a, b) => a.month.localeCompare(b.month));
  const last = sorted.at(-1);
  if (!last) return [];
  const end = new Date(`${last.month.slice(0, 7)}-01T00:00:00Z`);
  if (!Number.isFinite(end.getTime())) return [];
  return Array.from({ length: 6 }, (_, i) => {
    const date = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 5 + i, 1));
    const month = date.toISOString().slice(0, 7);
    const row = sorted.find((r) => r.month === month);
    return {
      date: date.toISOString().slice(0, 10),
      label: monthLabel(month),
      value: row && isAvailable(row[key]) ? row[key] : null,
      coverage: row?.status ?? "unavailable",
    };
  });
}

/** Aggregate supplied monthly predictions only; annual endpoints stay annual. Never interpolate. */
export function aggregateForecast(f: Forecast, interval: 1 | 3 | 6): Forecast {
  if (f.granularity !== "monthly" || interval === 1 || f.points.some((p) => !p.date)) return f;
  const out: ForecastPoint[] = [];
  let bucket: ForecastPoint[] = [];
  const flush = () => {
    const first = bucket[0],
      last = bucket.at(-1);
    if (!first || !last) return;
    const average = (values: Range[]): Range => ({
      low: values.reduce((sum, p) => sum + p.low, 0) / values.length,
      mid: values.reduce((sum, p) => sum + p.mid, 0) / values.length,
      high: values.reduce((sum, p) => sum + p.high, 0) / values.length,
    });
    const { observed: _observed, ...metadata } = first;
    const optimized = bucket.map((p) => p.optimized);
    out.push({
      ...metadata,
      baseline: average(bucket.map((p) => p.baseline)),
      optimized: optimized.every((p) => p !== null) ? average(optimized) : null,
      ...(bucket.every((p) => isAvailable(p.observed))
        ? { observed: bucket.reduce((sum, p) => sum + (p.observed ?? 0), 0) / bucket.length }
        : {}),
      periodLabel: `${forecastLabel(first)} – ${forecastLabel(last)}`,
      coverage: `${bucket.length}/${interval} months${bucket.length < interval ? " · partial period" : " · complete"}`,
    });
    bucket = [];
  };
  for (const point of f.points) {
    const previous = bucket.at(-1);
    const a = previous?.date ? new Date(previous.date).getTime() : null;
    const b = point.date ? new Date(point.date).getTime() : null;
    if (
      previous &&
      ((previous.observed == null) !== (point.observed == null) ||
        (a != null && b != null && (b - a < 27 * 86400000 || b - a > 32 * 86400000)))
    )
      flush();
    bucket.push(point);
    if (bucket.length === interval) flush();
  }
  flush();
  return {
    ...f,
    unit: `${f.unit.replace(/\/month$/, "")}/month — ${interval}-month average`,
    points: out,
  };
}
