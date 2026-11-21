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
export function runtimeSegments(runtime: number, active?: number) {
  if (active == null || !Number.isFinite(active) || active < 0 || active > runtime)
    return { active: null, inactive: null, unknown: runtime };
  return { active, inactive: runtime - active, unknown: 0 };
}

export const canDownloadExport = (isDemo: boolean) => !isDemo;
