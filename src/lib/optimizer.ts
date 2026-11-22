import type { Measure, Priority, SimulationResult } from "./api/types";

export const TARGETS = {
  co2Pct: 40,
  costPct: 25,
  budgetChf: 16500,
  maxPersonDays: 15,
  chfPerPersonDay: 1100,
} as const;

/** Evaluates a package against the hackathon constraints. Used by the demo adapter only; the backend is authoritative. */
export function evaluatePackage(
  all: Measure[],
  ids: string[],
  baseline: { costChf: number; co2Kg: number },
  budgetChf: number,
  chfPerPersonDay: number,
): SimulationResult {
  const excluded: { id: string; reason: string }[] = [];
  const chosen: Measure[] = [];
  for (const id of ids) {
    const m = all.find((x) => x.id === id);
    if (!m) continue;
    if (!m.includable || m.risk.level === "blocked") {
      excluded.push({ id, reason: `Blocked: ${m.risk.why}` });
      continue;
    }
    chosen.push(m);
  }
  const sum = (f: (m: Measure) => number) => chosen.reduce((a, m) => a + f(m), 0);
  const effortDays = sum((m) => m.effortPersonDays);
  const effortChf = effortDays * chfPerPersonDay;
  const savingsChf = sum((m) => m.savingsChf);
  const savingsCo2Kg = sum((m) => m.savingsCo2KgLocation);
  const costReductionPct = (savingsChf / baseline.costChf) * 100;
  const co2ReductionPct = (savingsCo2Kg / baseline.co2Kg) * 100;
  const budget = Math.min(budgetChf, TARGETS.budgetChf);
  const constraints = [
    {
      label: "CO₂ reduction (location-based)",
      achieved: co2ReductionPct,
      target: TARGETS.co2Pct,
      unit: "%" as const,
      direction: "atLeast" as const,
      met: co2ReductionPct >= TARGETS.co2Pct,
    },
    {
      label: "Cost reduction per year",
      achieved: costReductionPct,
      target: TARGETS.costPct,
      unit: "%" as const,
      direction: "atLeast" as const,
      met: costReductionPct >= TARGETS.costPct,
    },
    {
      label: "Implementation cost",
      achieved: effortChf,
      target: budget,
      unit: "CHF" as const,
      direction: "atMost" as const,
      met: effortChf <= budget,
    },
    {
      label: "Person-days",
      achieved: effortDays,
      target: TARGETS.maxPersonDays,
      unit: "PD" as const,
      direction: "atMost" as const,
      met: effortDays <= TARGETS.maxPersonDays,
    },
  ];
  const reasons: string[] = [];
  if (chosen.length === 0) reasons.push("No measures selected.");
  for (const c of constraints)
    if (!c.met)
      reasons.push(
        c.direction === "atLeast"
          ? `${c.label}: ${c.achieved.toFixed(1)}% is below the ${c.target}% target.`
          : `${c.label}: ${Math.round(c.achieved)} exceeds the limit of ${c.target} ${c.unit}.`,
      );
  return {
    savingsChf,
    savingsKwh: sum((m) => m.savingsKwh),
    savingsCo2Kg,
    effortDays,
    effortChf,
    costReductionPct,
    co2ReductionPct,
    constraints,
    feasible: chosen.length > 0 && constraints.every((c) => c.met),
    reasons,
    excluded,
    paybackMonths: savingsChf > 0 ? (effortChf / savingsChf) * 12 : null,
  };
}

/** Greedy package search within budget; never includes blocked measures. */
export function greedyPackage(
  all: Measure[],
  budgetChf: number,
  priority: Priority,
  baseline: { costChf: number; co2Kg: number },
  chfPerPersonDay: number,
): string[] {
  const maxDays = Math.min(budgetChf / chfPerPersonDay, TARGETS.maxPersonDays);
  const score = (m: Measure) => {
    const c = m.savingsChf / baseline.costChf,
      e = m.savingsCo2KgLocation / baseline.co2Kg;
    const v =
      priority === "cost"
        ? c
        : priority === "co2"
          ? e
          : c / (TARGETS.costPct / 100) + e / (TARGETS.co2Pct / 100);
    return v / m.effortPersonDays;
  };
  const pool = all
    .filter((m) => m.includable && m.risk.level !== "blocked")
    .sort((a, b) => score(b) - score(a));
  const ids: string[] = [];
  let days = 0;
  for (const m of pool)
    if (days + m.effortPersonDays <= maxDays + 1e-9) {
      ids.push(m.id);
      days += m.effortPersonDays;
    }
  return ids;
}
