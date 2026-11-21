import { describe, expect, it } from "vitest";
import { managementRecommendation } from "@/lib/management-recommendations";
import { demoMeasures, demoOverview } from "@/lib/api/demo-data";
describe("Management recommendation targets", () => {
  it.each([
    [0, "M7"],
    [1, "M2"],
    [2, "M3"],
  ] as const)("maps risk %i to its specific measure", (index, id) => {
    const risk = demoOverview.managementRisks[index];
    if (!risk) throw new Error("Missing risk fixture");
    expect(managementRecommendation(risk, demoMeasures, true)?.id).toBe(id);
  });
  it("never guesses real-provider relationships from demo wording", () => {
    const risk = demoOverview.managementRisks[0];
    if (!risk) throw new Error("Missing risk fixture");
    expect(managementRecommendation(risk, demoMeasures, false)).toBeUndefined();
  });
});
