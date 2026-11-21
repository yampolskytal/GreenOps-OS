import { describe, expect, it } from "vitest";
import {
  addMeasuresToPaths,
  createPath,
  ensurePath,
  normalizePaths,
  removeFromPath,
  setPathMembership,
  type SavedPath,
} from "@/lib/paths";
import { buildScenarioChart } from "@/lib/scenario-series";
import type { Forecast, MonthlyObservation } from "@/lib/api/types";

const d = { budgetChf: 16500, priority: "balanced" as const };
const p = (id: string, name: string, measureIds: string[] = []): SavedPath => ({ id, name, measureIds, ...d });

describe("V6 Paths", () => {
  it("typing an existing name selects it instead of duplicating", () => {
    const paths = createPath([], p("a", "Lean"));
    const r = ensurePath(paths, " lean ", d, "new");
    expect(r.created).toBe(false);
    expect(r.id).toBe("a");
    expect(r.paths).toHaveLength(1);
  });
  it("creates a new Path in one step and caps at three", () => {
    let paths: SavedPath[] = [];
    for (const n of ["A", "B", "C"]) paths = ensurePath(paths, n, d, n).paths;
    expect(paths).toHaveLength(3);
    expect(() => ensurePath(paths, "D", d, "D")).toThrow(/three/);
  });
  it("assigns stable color slots that survive renames and deletes", () => {
    let paths = createPath(createPath([], p("1", "A")), p("2", "B"));
    expect(paths.map((x) => x.slot)).toEqual(["a", "b"]);
    paths = paths.filter((x) => x.id !== "1");
    paths = createPath(paths, p("3", "C"));
    expect(paths.find((x) => x.id === "2")?.slot).toBe("b");
    expect(paths.find((x) => x.id === "3")?.slot).toBe("a");
  });
  it("migrates V5 Paths without slots and keeps their measures", () => {
    const migrated = normalizePaths([p("x", "Old", ["M1", "M1", "M2"]), p("x", "Dup")]);
    expect(migrated).toHaveLength(1);
    expect(migrated[0]?.measureIds).toEqual(["M1", "M2"]);
    expect(migrated[0]?.slot).toBe("a");
  });
  it("adds a measure to multiple Paths without duplicates and removes from one", () => {
    let paths = [p("1", "A", ["M1"]), p("2", "B"), p("3", "C")];
    paths = setPathMembership(paths, "M1", ["1", "2"]);
    expect(paths.map((x) => x.measureIds)).toEqual([["M1"], ["M1"], []]);
    paths = addMeasuresToPaths(paths, ["M1", "M2"], ["1", "3"]);
    expect(paths.map((x) => x.measureIds)).toEqual([["M1", "M2"], ["M1"], ["M1", "M2"]]);
    paths = removeFromPath(paths, "1", "M1");
    expect(paths.map((x) => x.measureIds)).toEqual([["M2"], ["M1"], ["M1", "M2"]]);
  });
});

const forecast = (granularity: "annual" | "monthly"): Forecast => ({
  metric: "cost",
  unit: "CHF",
  growthAssumption: "",
  granularity,
  points: [0, 1].map((i) => ({
    year: 2026 + i,
    baseline: { low: 1200, mid: 1200, high: 1200 },
    optimized: { low: 1200 - i * 120, mid: 1200 - i * 120, high: 1200 - i * 120 },
  })),
});
const months = (n: number, missing: string[] = []): MonthlyObservation[] =>
  Array.from({ length: n }, (_, i) => {
    const month = `2026-${String(i + 1).padStart(2, "0")}`;
    return { month, costChf: missing.includes(month) ? null : 100 + i, energyKwh: 0, co2Kg: 0 };
  });

describe("V6 scenario chart data", () => {
  it("draws every genuine monthly observation as history", () => {
    const c = buildScenarioChart(months(8), "cost", [{ key: "plan", forecast: forecast("annual") }]);
    expect(c.historyCount).toBe(8);
    expect(c.rows.filter((r) => r["history"] != null)).toHaveLength(8);
  });
  it("keeps missing months missing instead of zero", () => {
    const c = buildScenarioChart(months(4, ["2026-02"]), "cost", []);
    expect(c.rows.find((r) => r.label.startsWith("Feb"))?.["history"]).toBeNull();
    expect(c.historyCount).toBe(3);
  });
  it("shows annual forecasts as one monthly-average point per year, never quarterly", () => {
    const c = buildScenarioChart(months(6), "cost", [{ key: "plan", forecast: forecast("annual") }]);
    expect(c.granularity).toBe("annual");
    const projected = c.rows.filter((r) => r["plan"] != null);
    expect(projected).toHaveLength(2);
    expect(projected.map((r) => r["plan"])).toEqual([100, 90]);
    expect(projected.map((r) => r["noChange"])).toEqual([100, 100]);
  });
  it("shows no history when none is supplied", () => {
    const c = buildScenarioChart([], "cost", [{ key: "plan", forecast: forecast("annual") }]);
    expect(c.historyCount).toBe(0);
  });
});
