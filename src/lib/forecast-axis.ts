/** Pad the displayed range without letting hidden bands flatten the visible paths. */
export function forecastAxis(values: (number | string | null | undefined)[]): [number, number] {
  const points = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (!points.length) return [0, 1];
  const low = Math.min(...points),
    high = Math.max(...points);
  const pad = Math.max(
    (high - low) * 0.1,
    Math.max(Math.abs(low), Math.abs(high)) * 0.04,
    0.000001,
  );
  return [
    low >= 0 ? Math.max(0, low - pad) : low - pad,
    high <= 0 && low < 0 ? Math.min(0, high + pad) : high + pad,
  ];
}
