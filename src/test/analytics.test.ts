import { describe, expect, it } from "vitest";
import {
  accountingComparison,
  aggregateForecast,
  monthlyTotal,
  monthlyComparison,
  percentDifference,
} from "@/lib/analytics";
import { demoOverview } from "@/lib/api/demo-data";
import type { Forecast } from "@/lib/api/types";
describe("V4 analytical integrity", () => {
  it("preserves zero monthly values and reports missing coverage", () => {
    expect(
      monthlyTotal(
        [
          { month: "2025-09", costChf: 0, energyKwh: null, co2Kg: null },
          { month: "2025-10", costChf: null, energyKwh: null, co2Kg: null },
        ],
        "costChf",
      ),
    ).toEqual({ value: 0, available: 1, total: 2 });
  });
  it("does not infer daily or monthly market emissions from an annual total", () => {
    expect(monthlyTotal(demoOverview.monthly, "co2KgMarket").value).toBeNull();
  });
  it("does not add alternative accounting totals together", () => {
    expect(accountingComparison(demoOverview.co2Location, demoOverview.co2Market)?.difference).toBe(
      9800,
    );
  });
  it("rejects accounting comparisons for different reporting periods", () => {
    const market = demoOverview.co2Market;
    if (!market) throw new Error("Fixture missing");
    expect(
      accountingComparison(demoOverview.co2Location, {
        ...market,
        calc: { ...market.calc, period: "2027" },
      }),
    ).toBeNull();
  });
  it("does not divide by a zero baseline", () => expect(percentDifference(0, 10)).toBeNull());
  it("does not invent previous-period comparisons", () =>
    expect(monthlyComparison(demoOverview.monthly, "costChf")).toBeNull());
  const f: Forecast = {
    metric: "cost",
    unit: "CHF",
    growthAssumption: "fixture",
    granularity: "monthly",
    points: [100, 200, 300, 400].map((v, i) => ({
      year: 2027,
      date: `2027-0${i + 1}-01`,
      baseline: { low: v, mid: v, high: v },
      optimized: { low: v / 2, mid: v / 2, high: v / 2 },
    })),
  };
  it("uses average monthly cost, not quarter totals, for three-month periods", () => {
    expect(aggregateForecast(f, 3).points[0]?.baseline.mid).toBe(200);
    expect(aggregateForecast(f, 3).points[1]?.coverage).toContain("1/3 months · partial period");
  });
  it("uses six supplied monthly points for six-month averages", () => {
    const six = {
      ...f,
      points: [
        ...f.points,
        ...[500, 600].map((v, i) => ({
          year: 2027,
          date: `2027-0${i + 5}-01`,
          baseline: { low: v, mid: v, high: v },
          optimized: { low: v, mid: v, high: v },
        })),
      ],
    };
    expect(aggregateForecast(six, 6).points[0]?.baseline.mid).toBe(350);
  });
  it("never creates monthly variations from annual endpoints", () => {
    const annual = { ...f, granularity: "annual" as const };
    expect(aggregateForecast(annual, 3)).toBe(annual);
  });
});
