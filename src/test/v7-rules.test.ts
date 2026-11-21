import { describe, it, expect } from "vitest";
import { demoApi, getPlanningApi } from "@/lib/api/client";
import { demoMeasures } from "@/lib/api/demo-data";
import { approvedDemoIds, numericalWarnings, proposalMeasures } from "@/lib/proposals";
import { historicalDomain } from "@/lib/historical-domain";
import { validatePreview } from "@/lib/planning";
import { saveMeasuresToPaths, removeFromPath, normalizePaths } from "@/lib/paths";
const q = {
  datasetVersion: "demo-v0",
  from: "2025-09",
  to: "2026-08",
  department: "all",
  provider: "all",
};
const defaults = { budgetChf: 16500, priority: "balanced" as const };

describe("V7 proposal and exception boundaries", () => {
  it("marks reduction under 40% as non-compliant without blocking saving", async () => {
    const r = await demoApi.simulate(q, { measureIds: ["M1"], ...defaults, chfPerPersonDay: 1100 });
    expect(numericalWarnings({ ...r, co2ReductionPct: 39 })).toEqual(
      expect.arrayContaining([expect.stringContaining("1.0 percentage points")]),
    );
    expect(validatePreview(["M1"], demoMeasures, 16500, { ...r, co2ReductionPct: 39 })).toBeNull();
  });
  it("marks reduction under 25% as non-compliant without blocking saving", async () => {
    const r = await demoApi.simulate(q, { measureIds: ["M1"], ...defaults, chfPerPersonDay: 1100 });
    expect(numericalWarnings({ ...r, costReductionPct: 24 })).toEqual(
      expect.arrayContaining([expect.stringContaining("cost reduction is 1.0")]),
    );
    expect(validatePreview(["M1"], demoMeasures, 16500, { ...r, costReductionPct: 24 })).toBeNull();
  });
  it("allows 16 person-days as a non-compliant proposal", async () => {
    const r = await demoApi.simulate(q, { measureIds: ["M1"], ...defaults, chfPerPersonDay: 1100 });
    expect(validatePreview(["M1"], demoMeasures, 16500, { ...r, effortDays: 16 })).toBeNull();
    expect(numericalWarnings({ ...r, effortDays: 16 })).toContain(
      "effort exceeds the limit by 1.0 person-days",
    );
  });
  it("allows CHF 17,600 while retaining the CHF 16,500 submission limit", async () => {
    const r = await demoApi.simulate(q, { measureIds: ["M1"], ...defaults, chfPerPersonDay: 1100 });
    expect(validatePreview(["M1"], demoMeasures, 17600, { ...r, effortChf: 17600 })).toBeNull();
    expect(numericalWarnings({ ...r, effortChf: 17600 }).join(" ")).toContain("1");
    expect(
      numericalWarnings({
        ...r,
        effortChf: 16500,
        effortDays: 15,
        co2ReductionPct: 40,
        costReductionPct: 25,
      }),
    ).toEqual([]);
  });
  it("never applies demo approvals to real providers", () => {
    expect(approvedDemoIds({ M7: { approved: true } }, false)).toEqual([]);
    expect(approvedDemoIds({ M7: { approved: true }, M1: { approved: false } }, true)).toEqual([
      "M7",
    ]);
  });
  it("counts an explicitly approved demo exception without erasing original risk", async () => {
    const blocked = demoMeasures.find((m) => m.id === "M7");
    if (!blocked) throw new Error("Missing M7");
    const input = { measureIds: ["M7"], budgetChf: 16500, chfPerPersonDay: 1100 };
    const before = await demoApi.simulate(q, input);
    const after = await getPlanningApi(["M7"]).simulate(q, input);
    expect(before.excluded.map((e) => e.id)).toContain("M7");
    expect(after.excluded).toEqual([]);
    expect(after.savingsChf).toBe(blocked.savingsChf);
    expect(blocked.risk.level).toBe("blocked");
    expect(
      validatePreview(["M7"], proposalMeasures(demoMeasures, ["M7"]), 16500, after),
    ).toBeNull();
  });
  it("revocation restores exclusion", async () => {
    const r = await getPlanningApi([]).simulate(q, {
      measureIds: ["M7"],
      budgetChf: 16500,
      chfPerPersonDay: 1100,
    });
    expect(r.excluded.map((e) => e.id)).toContain("M7");
    expect(validatePreview(["M7"], demoMeasures, 16500, r)).toContain("blocked");
  });
  it("rejects unknown calculations rather than saving a fake result", async () => {
    const r = await demoApi.simulate(q, {
      measureIds: ["M1"],
      budgetChf: 16500,
      chfPerPersonDay: 1100,
    });
    expect(validatePreview(["M1"], demoMeasures, 16500, { ...r, savingsChf: NaN })).toContain(
      "Unknown calculations",
    );
  });
});
describe("V7 atomic Path saves", () => {
  it.each([1, 3, 4, 5])("creates a Path containing all %i selected recommendations", (count) => {
    const ids = Array.from({ length: count }, (_, i) => `M${i + 1}`);
    const r = saveMeasuresToPaths([], ids, [], "A", defaults, "a");
    expect(r.paths[0]?.measureIds).toEqual(ids);
    expect(normalizePaths(JSON.parse(JSON.stringify(r.paths)))[0]?.measureIds).toEqual(ids);
  });
  it("adds all four measures to two Paths and isolates removal", () => {
    const a = saveMeasuresToPaths([], [], [], "A", defaults, "a").paths;
    const b = saveMeasuresToPaths(a, [], [], "B", defaults, "b").paths;
    const ids = ["M1", "M2", "M3", "M4"];
    const saved = saveMeasuresToPaths(b, [...ids, "M4"], ["a", "b"], "", defaults, "unused").paths;
    expect(saved.map((p) => p.measureIds)).toEqual([ids, ids]);
    expect(removeFromPath(saved, "a", "M1").map((p) => p.measureIds)).toEqual([ids.slice(1), ids]);
  });
  it("uses an existing name without losing bulk IDs or adding a duplicate Path", () => {
    const a = saveMeasuresToPaths([], ["M1"], [], "A", defaults, "a").paths;
    const r = saveMeasuresToPaths(a, ["M2", "M3", "M4"], [], " a ", defaults, "other");
    expect(r.paths).toHaveLength(1);
    expect(r.paths[0]?.measureIds).toEqual(["M1", "M2", "M3", "M4"]);
  });
  it("enforces exactly three saved Paths", () => {
    let paths = saveMeasuresToPaths([], [], [], "A", defaults, "a").paths;
    paths = saveMeasuresToPaths(paths, [], [], "B", defaults, "b").paths;
    paths = saveMeasuresToPaths(paths, [], [], "C", defaults, "c").paths;
    expect(() => saveMeasuresToPaths(paths, [], [], "D", defaults, "d")).toThrow("three");
  });
});
describe("V7 historical bounds", () => {
  it("focuses on supplied clustered values, not zero", () => {
    const [low, high] = historicalDomain([35000, 36000, null, 35500]);
    expect(low).toBeGreaterThan(0);
    expect(low).toBeLessThanOrEqual(35000);
    expect(high).toBeGreaterThanOrEqual(36000);
  });
  it("supports honest zero values and a start-at-zero option", () => {
    expect(historicalDomain([0, null, 1])[0]).toBe(0);
    expect(historicalDomain([35000, 36000], true)[0]).toBe(0);
    expect(historicalDomain([null, undefined])).toEqual([0, 1]);
  });
});
