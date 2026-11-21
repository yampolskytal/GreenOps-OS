import { describe, expect, it } from "vitest";
import {
  initialMeasureIds,
  officialQuery,
  runtimeSegments,
  canSelectMeasure,
  canDownloadExport,
  validatePreview,
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
  it("allows local proposals over the CHF 16,500 submission budget", async () => {
    const result = await demoApi.simulate(q, {
      measureIds: [],
      budgetChf: 17000,
      chfPerPersonDay: 1100,
    });
    expect(validatePreview([], demoMeasures, 17000, result)).toBeNull();
  });
  it("allows local proposals over the 15-person-day submission limit", async () => {
    const result = await demoApi.simulate(q, {
      measureIds: [],
      budgetChf: 16500,
      chfPerPersonDay: 1100,
    });
    expect(validatePreview([], demoMeasures, 16500, { ...result, effortDays: 15.5 })).toBeNull();
  });
  it("keeps blocked measures out of committed packages", async () => {
    const result = await demoApi.simulate(q, {
      measureIds: ["M7"],
      budgetChf: 16500,
      chfPerPersonDay: 1100,
    });
    expect(validatePreview(["M7"], demoMeasures, 16500, result)).toContain("blocked");
  });
  it("does not claim market-based savings when the simulation does not provide them", async () => {
    const result = await demoApi.simulate(q, {
      measureIds: ["M1"],
      budgetChf: 16500,
      chfPerPersonDay: 1100,
    });
    expect(result.savingsCo2KgMarket).toBeUndefined();
  });
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
