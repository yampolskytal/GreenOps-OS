import { chf } from "./format";
import type { Measure, SimulationResult } from "./api/types";
import { canSelectMeasure } from "./planning";

export function approvedDemoIds(
  exceptions: Record<string, { approved: boolean }>,
  isDemo: boolean,
) {
  return isDemo ? Object.keys(exceptions).filter((id) => exceptions[id]?.approved) : [];
}
export function proposalMeasures(measures: Measure[], approved: string[]) {
  return measures.map((m) =>
    approved.includes(m.id)
      ? { ...m, includable: true, risk: { ...m.risk, level: "review" as const } }
      : m,
  );
}
export function numericalWarnings(r: SimulationResult) {
  const warnings: string[] = [];
  if (r.co2ReductionPct < 40)
    warnings.push(
      `CO₂ reduction is ${(40 - r.co2ReductionPct).toFixed(1)} percentage points below target`,
    );
  if (r.costReductionPct < 25)
    warnings.push(
      `cost reduction is ${(25 - r.costReductionPct).toFixed(1)} percentage points below target`,
    );
  if (r.effortDays > 15)
    warnings.push(`effort exceeds the limit by ${(r.effortDays - 15).toFixed(1)} person-days`);
  if (r.effortChf > 16500)
    warnings.push(`implementation cost exceeds the limit by ${chf(r.effortChf - 16500)}`);
  return warnings;
}
export const isImplementableProposal = (m: Measure, approved: string[]) =>
  canSelectMeasure(m) || approved.includes(m.id);
