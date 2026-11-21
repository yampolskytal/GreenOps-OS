/** Readable line-chart domain with at least a 20% spread; never alters observations. */
export function historicalDomain(
  values: (number | null | undefined)[],
  zero = false,
): [number, number] {
  const available = values.filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  if (!available.length) return [0, 1];
  const min = Math.min(...available),
    max = Math.max(...available);
  const span = Math.max(max - min, Math.abs(max) * 0.2, 1);
  const center = (min + max) / 2;
  const rawLow = zero ? Math.min(0, min) : center - span * 0.7;
  const rawHigh = center + span * 0.7;
  const rough = (rawHigh - rawLow) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((n) => n * magnitude).find((n) => n >= rough) ?? magnitude * 10;
  return [
    min >= 0 ? Math.max(0, Math.floor(rawLow / step) * step) : Math.floor(rawLow / step) * step,
    Math.ceil(rawHigh / step) * step,
  ];
}
