import type { Baseline, Measure } from "./api/types";

/** Package totals vs. the mid baseline. Effort is priced at chfPerPersonDay. */
export function summarizePackage(baseline: Baseline, measures: Measure[], chfPerPersonDay: number) {
  const effortDays = measures.reduce((a, m) => a + m.effortPersonDays, 0);
  const savedChf = measures.reduce((a, m) => a + m.savingsChf, 0);
  const savedCo2 = measures.reduce((a, m) => a + m.savingsCo2KgLocation, 0);
  return {
    effortDays,
    effortChf: effortDays * chfPerPersonDay,
    savedChf,
    savedCo2,
    costPct: (savedChf / baseline.costChf.mid) * 100,
    co2Pct: (savedCo2 / baseline.co2KgLocation.mid) * 100,
  };
}
