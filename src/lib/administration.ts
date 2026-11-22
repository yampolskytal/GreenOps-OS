import type { Measure } from "@/lib/api/types";

export function decisionGroup(m: Measure): "blocked" | "review" | null {
  if (m.risk.level === "blocked") return "blocked";
  if (m.risk.level === "review" || m.risk.approver) return "review";
  return m.includable ? null : "blocked";
}

export function gaugeGeometry(actual: number, target: number) {
  const scale = Math.max(100, actual, target);
  const angle = (target / scale) * 2 * Math.PI;
  return {
    scale,
    arc: (Math.max(0, actual) / scale) * 100,
    marker: (radius: number) =>
      [100 + radius * Math.sin(angle), 100 - radius * Math.cos(angle)] as const,
  };
}

export function categoryShares(values: (number | null)[]) {
  const known = values.filter((value): value is number => value != null);
  const total = known.reduce((sum, value) => sum + value, 0);
  const drawable = Number.isFinite(total) && total > 0 && known.every((value) => value >= 0);
  return {
    total,
    partial: known.length !== values.length,
    drawable,
    shares: values.map((value) => (drawable && value != null ? (value / total) * 100 : null)),
  };
}

export function priorCalendarMonth(month: string) {
  const year = Number(month.slice(0, 4));
  const number = Number(month.slice(5, 7));
  return number === 1 ? `${year - 1}-12` : `${year}-${String(number - 1).padStart(2, "0")}`;
}
