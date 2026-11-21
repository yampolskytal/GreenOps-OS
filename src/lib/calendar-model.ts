/** Calendar geometry and scales use only supplied values; placeholders are explicitly unavailable. */
export interface CalendarValue {
  date: string;
  count: number | null;
  colorCount?: number | null;
  detail?: string;
}
export const DAY_MS = 86400000;
const finiteValue = (v: number | null | undefined): v is number =>
  typeof v === "number" && Number.isFinite(v);

function interpolate(value: number, domain: number[], range: number[]) {
  if (value <= domain[0]) return range[0];
  for (let i = 1; i < domain.length; i++) {
    if (value <= domain[i]) {
      const share = (value - domain[i - 1]) / (domain[i] - domain[i - 1]);
      return range[i - 1] + share * (range[i] - range[i - 1]);
    }
  }
  return range[range.length - 1];
}

/** Give the middle 80% room, while preserving the ordering and full span of the tails. */
export function buildCalendarScale(values: (number | null | undefined)[]) {
  const finite = values.filter(finiteValue).sort((a, b) => a - b);
  if (!finite.length) return null;
  const min = finite[0];
  const max = finite[finite.length - 1];
  const lower = finite[Math.round((finite.length - 1) * 0.1)];
  const upper = finite[Math.round((finite.length - 1) * 0.9)];
  const domain = [min];
  const range = [0];
  if (lower < upper) {
    if (min < lower) {
      domain.push(lower);
      range.push(0.1);
    }
    if (upper < max) {
      domain.push(upper);
      range.push(0.9);
    }
  }
  if (min < max) {
    domain.push(max);
    range.push(1);
  }
  const position = (value: number) =>
    min === max ? (min === 0 ? 0 : 0.5) : interpolate(value, domain, range);
  const ticks =
    min === max ? [min] : [0, 0.25, 0.5, 0.75, 1].map((p) => interpolate(p, range, domain));
  return {
    min,
    max,
    ticks,
    position,
    level: (value: number) => 1 + Math.min(3, Math.floor(position(value) * 4)),
    compressed: domain.length > 2,
  };
}
export function buildFootprintGrid(
  data: CalendarValue[],
  endMs: number,
  weekStart = 0,
  month?: string,
) {
  let start = month ? Date.parse(`${month}-01T00:00:00Z`) : endMs - 364 * DAY_MS;
  if (!Number.isFinite(start))
    return {
      cells: [],
      weeks: 0,
      rows: 7,
      heightDomain: null,
      colorDomain: null,
      monthly: Boolean(month),
    };
  const offset = (new Date(start).getUTCDay() - weekStart + 7) % 7;
  if (!month) start -= offset * DAY_MS;
  const end = month
    ? Date.UTC(new Date(start).getUTCFullYear(), new Date(start).getUTCMonth() + 1, 0)
    : endMs;
  const supplied = new Map(data.map((d) => [d.date, d]));
  const cells = [];
  for (let ms = start, i = 0; ms <= end; ms += DAY_MS, i++) {
    const date = new Date(ms).toISOString().slice(0, 10),
      value = supplied.get(date);
    const count = finiteValue(value?.count) ? value.count : null;
    const colorValue = value?.colorCount === undefined ? count : value.colorCount;
    const colorCount = finiteValue(colorValue) ? colorValue : null;
    const position = i + (month ? offset : 0);
    cells.push({
      date,
      count,
      colorCount,
      missing: count === null || colorCount === null,
      week: month ? position % 7 : Math.floor(position / 7),
      day: month ? Math.floor(position / 7) : position % 7,
    });
  }
  const heightDomain = buildCalendarScale(cells.map((c) => c.count));
  const colorDomain = buildCalendarScale(cells.map((c) => c.colorCount));
  return {
    cells: cells.map((cell) => ({
      ...cell,
      height: cell.count === null ? 0 : (heightDomain?.position(cell.count) ?? 0),
      level: cell.colorCount === null ? 0 : (colorDomain?.level(cell.colorCount) ?? 0),
    })),
    weeks: month ? 7 : Math.ceil(cells.length / 7),
    rows: month ? Math.ceil((cells.length + offset) / 7) : 7,
    heightDomain,
    colorDomain,
    monthly: Boolean(month),
  };
}
