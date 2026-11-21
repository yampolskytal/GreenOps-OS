/** Calendar geometry and scales use only supplied values; placeholders are explicitly unavailable. */
export interface CalendarValue {
  date: string;
  count: number | null;
  colorCount?: number | null;
  detail?: string;
}
export const DAY_MS = 86400000;
export function availableRange(values: (number | null | undefined)[]) {
  const finite = values.filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0,
  );
  if (!finite.length) return null;
  return { min: Math.min(...finite), max: Math.max(...finite) };
}
export function buildFootprintGrid(
  data: CalendarValue[],
  endMs: number,
  weekStart = 0,
  month?: string,
) {
  let start = month ? Date.parse(`${month}-01T00:00:00Z`) : endMs - 364 * DAY_MS;
  if (!Number.isFinite(start))
    return { cells: [], weeks: 0, rows: 7, max: 0, monthly: Boolean(month) };
  const offset = (new Date(start).getUTCDay() - weekStart + 7) % 7;
  if (!month) start -= offset * DAY_MS;
  const end = month
    ? Date.UTC(new Date(start).getUTCFullYear(), new Date(start).getUTCMonth() + 1, 0)
    : endMs;
  const supplied = new Map(data.map((d) => [d.date, d]));
  const colors = availableRange(
    data
      .filter((d) => !month || d.date.startsWith(month))
      .map((d) => (d.colorCount === undefined ? d.count : d.colorCount)),
  );
  const cells = [];
  for (let ms = start, i = 0; ms <= end; ms += DAY_MS, i++) {
    const date = new Date(ms).toISOString().slice(0, 10),
      value = supplied.get(date);
    const count =
      typeof value?.count === "number" && Number.isFinite(value.count) && value.count >= 0
        ? value.count
        : null;
    const colorValue = value?.colorCount === undefined ? count : value.colorCount;
    const validColor =
      typeof colorValue === "number" && Number.isFinite(colorValue) && colorValue >= 0;
    const position = i + (month ? offset : 0);
    const level =
      validColor && colors
        ? 1 +
          Math.min(3, Math.floor(((colorValue - colors.min) / (colors.max - colors.min || 1)) * 4))
        : 0;
    cells.push({
      date,
      count,
      missing: count === null || !validColor,
      level,
      week: month ? position % 7 : Math.floor(position / 7),
      day: month ? Math.floor(position / 7) : position % 7,
    });
  }
  const heights = availableRange(cells.map((c) => c.count));
  return {
    cells,
    weeks: month ? 7 : Math.ceil(cells.length / 7),
    rows: month ? Math.ceil((cells.length + offset) / 7) : 7,
    max: heights?.max ?? 0,
    monthly: Boolean(month),
  };
}
