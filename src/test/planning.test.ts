import { describe, expect, it } from "vitest";
import {
  initialMeasureIds,
  officialQuery,
  runtimeSegments,
  canSelectMeasure,
  canDownloadExport,
} from "@/lib/planning";
import { demoMeasures } from "@/lib/api/demo-data";
import { demoApi } from "@/lib/api/client";
const q = {
  datasetVersion: "demo-v0",
  from: "2026-03",
  to: "2026-08",
  department: "IT",
  provider: "AWS",
};
describe("refactor planning integrity", () => {
  it("blocks demo export downloads while permitting backend files", () => {
    expect(canDownloadExport(true)).toBe(false);
    expect(canDownloadExport(false)).toBe(true);
  });
  it("starts without automatically selected opportunities", () =>
    expect(initialMeasureIds).toEqual([]));
  it("keeps the submission baseline September 2025 through August 2026 regardless of display filters", () =>
    expect(officialQuery(q)).toEqual({
      ...q,
      from: "2025-09",
      to: "2026-08",
      department: "all",
      provider: "all",
    }));
  it("keeps unavailable active use distinct from zero", () =>
    expect(runtimeSegments(720)).toEqual({ active: null, inactive: null, unknown: 720 }));
  it("preserves genuine zero active use", () =>
    expect(runtimeSegments(720, 0)).toEqual({ active: 0, inactive: 720, unknown: 0 }));
  it("does not approve blocked recommendations", () => {
    const m = demoMeasures.find((x) => x.id === "M7");
    if (!m) throw new Error("M7 fixture missing");
    expect(canSelectMeasure(m)).toBe(false);
  });
  it("updates scenario forecasts for the selected plan", async () => {
    const empty = await demoApi.getForecast(q, "cost", 3, []);
    const selected = await demoApi.getForecast(q, "cost", 3, ["M1"]);
    expect(empty.points.at(-1)?.optimized.mid).toBe(empty.points.at(-1)?.baseline.mid);
    const a = selected.points.at(-1)?.optimized.mid,
      b = empty.points.at(-1)?.optimized.mid;
    if (a == null || b == null) throw new Error("Missing forecast endpoint");
    expect(a).toBeLessThan(b);
  });
});
