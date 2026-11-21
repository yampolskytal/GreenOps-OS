import type { Measure, Overview } from "./api/types";

/** Known DEMO relationships only; never infer a real recommendation from a risk's wording. */
const demoRiskMeasures: Record<string, string> = {
  "Production platform must stay on at month-end": "M7",
  "Moving the dev cluster needs CTO approval": "M2",
  "Copilot contract has 90 days notice": "M3",
};
export function managementRecommendation(
  risk: Overview["managementRisks"][number],
  measures: Measure[],
  demo: boolean,
) {
  const id = demo ? demoRiskMeasures[risk.title] : undefined;
  return measures.find((measure) => measure.id === id);
}
