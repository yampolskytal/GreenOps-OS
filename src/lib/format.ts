const available = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

export const formatNumber = (
  n: number | null | undefined,
  options: Intl.NumberFormatOptions = { maximumFractionDigits: 2 },
) => (available(n) ? n.toLocaleString("en-US", options) : "Unavailable");

export const group = (n: number | null | undefined) =>
  formatNumber(n, { maximumFractionDigits: 0 });

export const chf = (n: number | null | undefined) =>
  available(n) ? `CHF ${formatNumber(n)}` : "Unavailable";

export const kg = (n: number | null | undefined) =>
  available(n) ? `${formatNumber(n, { maximumFractionDigits: 3 })} kg` : "Unavailable";

export function carbonUnit(sourceUnit: string) {
  return /co[₂2]\s*e/i.test(sourceUnit) ? "kg CO₂e" : /co[₂2]/i.test(sourceUnit) ? "kg CO₂" : "kg";
}

export function carbonMass(n: number | null | undefined, sourceUnit: string) {
  if (!available(n)) return "Unavailable";
  const isTonnes = /^(?:t(?:onnes?)?)(?=\s|co[₂2]|\/|$)/i.test(sourceUnit.trim());
  return `${formatNumber(isTonnes ? n * 1000 : n, { maximumFractionDigits: 3 })} ${carbonUnit(sourceUnit)}`;
}

export function formatEvidenceText(text: string) {
  return text
    .replace(/(?:CHF\s+)?(?<![\w'])-?\d{1,3}(?:['’]\d{3})+(?:\.\d+)?(?!\d)/g, (amount) =>
      amount.replace(/['’]/g, ","),
    )
    .replace(
      /(-?\d[\d,]*(?:\.\d+)?)\s*(?:t|tonnes?)\s*(CO[₂2]e?)(?!\w)/gi,
      (_, value: string, unit: string) => carbonMass(Number(value.replace(/,/g, "")), `t ${unit}`),
    );
}

export const kwh = (n: number | null | undefined) =>
  available(n)
    ? Math.abs(n) >= 1000
      ? `${formatNumber(n / 1000, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MWh`
      : `${group(n)} kWh`
    : "Unavailable";

export const pct = (n: number | null | undefined) =>
  available(n) ? `${n.toFixed(1)}%` : "Cannot calculate";
