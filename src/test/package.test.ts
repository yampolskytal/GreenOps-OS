import { describe, expect, it } from "vitest";
import { summarizePackage } from "@/lib/package";
import { mockOverview } from "@/lib/api/mock-data";

describe("summarizePackage", () => {
  it("prices effort at CHF 1,100 per person-day", () => {
    const s = summarizePackage(mockOverview.baseline, mockOverview.package, 1100);
    expect(s.effortChf).toBe(s.effortDays * 1100);
  });
  it("mock package stays within the CHF 16,500 budget and hits both targets", () => {
    const s = summarizePackage(mockOverview.baseline, mockOverview.package, 1100);
    expect(s.effortChf).toBeLessThanOrEqual(16500);
    expect(s.co2Pct).toBeGreaterThanOrEqual(40);
    expect(s.costPct).toBeGreaterThanOrEqual(25);
  });
});
