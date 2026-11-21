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
export function runtimeSegments(runtime: number | null, active?: number | null) {
  if (runtime == null || !Number.isFinite(runtime) || runtime < 0)
    return { active: null, inactive: null, unknown: null };
  if (active == null || !Number.isFinite(active) || active < 0 || active > runtime)
    return { active: null, inactive: null, unknown: runtime };
  return { active, inactive: runtime - active, unknown: 0 };
}

export const canDownloadExport = (isDemo: boolean) => !isDemo;

/** Planning validation is independent of implementation approval and numerical target success. */
export function validatePreview(
  ids: string[],
  measures: Measure[],
  budget: number,
  result: import("./api/types").SimulationResult,
) {
  if (budget > 16500 || budget < 0 || !Number.isFinite(budget))
    return "Budget must be within CHF 16,500.";
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
    result.effortDays < 0 ||
    result.effortChf > budget ||
    result.effortDays > 15
  )
    return "Implementation effort exceeds the preview budget or 15 person-days.";
  return null;
}
