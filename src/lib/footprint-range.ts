/** Inclusive exploration-only date filtering; preserves supplied rows without filling gaps. */
export function footprintRange<T extends { date: string }>(
  rows: T[],
  from: string,
  to: string,
): T[] {
  if (!from || !to || from > to) return [];
  return rows
    .filter((row) => row.date >= from && row.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date));
}
