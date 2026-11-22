import type { GlobalQuery, Measure } from "./api/types";
export const OFFICIAL_PERIOD = { from: "2025-09", to: "2026-08" } as const;
export const officialQuery = (q: GlobalQuery): GlobalQuery => ({
  ...q,
  ...OFFICIAL_PERIOD,
  department: "all",
  provider: "all",
});
export const canSelectMeasure = (m: Measure) => m.includable && m.risk.level !== "blocked";
export const initialMeasureIds: string[] = [];
export function runtimeSegments(runtime: number | null, active?: number | null, unclassified = 0) {
  if (runtime == null || !Number.isFinite(runtime) || runtime < 0)
    return { active: null, inactive: null, unknown: null };
  if (
    active == null ||
    !Number.isFinite(active) ||
    active < 0 ||
    active > runtime ||
    !Number.isFinite(unclassified) ||
    unclassified < 0 ||
    active + unclassified > runtime + 0.01
  )
    return { active: null, inactive: null, unknown: runtime };
  const unknown = Math.min(unclassified, runtime - active);
  return { active, inactive: runtime - active - unknown, unknown };
}

export const canDownloadExport = (isDemo: boolean) => !isDemo;

/** Planning validation is independent of implementation approval and numerical target success. */
export function validatePreview(
  ids: string[],
  measures: Measure[],
  budget: number,
  result: import("./api/types").SimulationResult,
) {
  if (budget < 0 || !Number.isFinite(budget)) return "Budget must be a known, non-negative amount.";
  if (ids.some((id) => !measures.some((m) => m.id === id && canSelectMeasure(m))))
    return "Unknown or blocked measures cannot be committed.";
  if (result.excluded.length) return "Excluded measures must be removed before committing.";
  if (
    ![
      result.savingsChf,
      result.savingsKwh,
      result.savingsCo2Kg,
      result.costReductionPct,
      result.co2ReductionPct,
    ].every(Number.isFinite)
  )
    return "Unknown calculations cannot be committed. Keep this selection as a Path while source data is reviewed.";
  if (
    !Number.isFinite(result.effortChf) ||
    !Number.isFinite(result.effortDays) ||
    result.effortChf < 0 ||
    result.effortDays < 0
  )
    return "Implementation effort is unavailable or invalid.";
  return null;
}
