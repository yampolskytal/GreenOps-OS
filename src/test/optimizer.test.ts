import { describe, expect, it } from "vitest";
import { evaluatePackage, greedyPackage, TARGETS } from "@/lib/optimizer";
import { demoMeasures, DEMO_BASELINE } from "@/lib/api/demo-data";

const base = { costChf: DEMO_BASELINE.costChf, co2Kg: DEMO_BASELINE.co2Kg };
describe("package rules", () => {
  it("prices one person-day at CHF 1,100", () => {
    const r = evaluatePackage(demoMeasures, ["M1"], base, 16500, 1100);
    expect(r.effortChf).toBe(2 * 1100);
  });
  it("never includes blocked measures", () => {
    const r = evaluatePackage(demoMeasures, ["M7"], base, 16500, 1100);
    expect(r.savingsChf).toBe(0);
    expect(r.excluded[0]?.id).toBe("M7");
    expect(greedyPackage(demoMeasures, 16500, "cost", base, 1100)).not.toContain("M7");
  });
  it("is infeasible above 15 person-days even within CHF", () => {
    const ids = demoMeasures.filter((m) => m.risk.level !== "blocked").map((m) => m.id);
    const r = evaluatePackage(demoMeasures, ids, base, 16500, 1100);
    expect(r.effortDays).toBeGreaterThan(TARGETS.maxPersonDays);
    expect(r.feasible).toBe(false);
  });
  it("requires 40% CO2 and 25% cost", () => {
    const r = evaluatePackage(demoMeasures, ["M3"], base, 16500, 1100);
    expect(r.constraints.find((c) => c.label.startsWith("CO₂"))?.target).toBe(40);
    expect(r.constraints.find((c) => c.label.startsWith("Cost"))?.target).toBe(25);
    expect(r.feasible).toBe(false);
  });
  it("a small budget yields an infeasible package", () => {
    const ids = greedyPackage(demoMeasures, 3300, "balanced", base, 1100);
    expect(evaluatePackage(demoMeasures, ids, base, 3300, 1100).feasible).toBe(false);
  });
});
