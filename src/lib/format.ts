/** Locale-independent Swiss grouping (1'234) so server and browser render identically. */
const available = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
export const group = (n: number | null | undefined) =>
  available(n)
    ? Math.round(n)
        .toString()
        .replace(/\B(?=(\d{3})+(?!\d))/g, "'")
    : "Unavailable";
export const chf = (n: number | null | undefined) =>
  available(n) ? `CHF ${group(n)}` : "Unavailable";
export const kchf = (n: number | null | undefined) =>
  available(n)
    ? Math.abs(n) >= 1000
      ? `CHF ${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k`
      : chf(n)
    : "Unavailable";
export const kg = (n: number | null | undefined) =>
  available(n)
    ? Math.abs(n) >= 1000
      ? `${(n / 1000).toFixed(1)} t`
      : `${group(n)} kg`
    : "Unavailable";
export const kwh = (n: number | null | undefined) =>
  available(n)
    ? Math.abs(n) >= 1000
      ? `${(n / 1000).toFixed(1)} MWh`
      : `${group(n)} kWh`
    : "Unavailable";
export const pct = (n: number | null | undefined) =>
  available(n) ? `${n.toFixed(1)}%` : "Cannot calculate";
