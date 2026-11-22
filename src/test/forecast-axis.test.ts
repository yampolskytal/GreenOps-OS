import { describe, expect, it } from "vitest";
import { forecastAxis } from "@/lib/forecast-axis";

describe("forecast axis", () => {
  it("uses the visible range instead of forcing distant zero onto positive projections", () => {
    const [low, high] = forecastAxis([520, 540, 550, null, undefined, Number.NaN]);
    expect(low).toBeGreaterThan(450);
    expect(low).toBeLessThan(520);
    expect(high).toBeGreaterThan(550);
    expect(high - low).toBeLessThan(100);
  });
  it("retains true outliers, zeros and negative changes, and pads flat values", () => {
    const [low, high] = forecastAxis([-10, 0, 4, 300]);
    expect(low).toBeLessThan(-10);
    expect(high).toBeGreaterThan(300);
    expect(forecastAxis([0, 0])[0]).toBe(0);
    expect(forecastAxis([400, 400])[0]).toBeLessThan(400);
  });
});
