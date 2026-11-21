import { describe, expect, it } from "vitest";
import { availableRange, buildFootprintGrid } from "@/lib/calendar-model";
describe("footprint periods and integrity", () => {
  it("keeps August 2026 in Monday-to-Sunday rows without extra dates", () => {
    const grid = buildFootprintGrid(
      [{ date: "2026-08-01", count: 12, colorCount: 100 }],
      0,
      1,
      "2026-08",
    );
    expect(grid.cells).toHaveLength(31);
    expect(grid.cells[0]).toMatchObject({ date: "2026-08-01", week: 5, day: 0 });
    expect(grid.cells[1]).toMatchObject({ date: "2026-08-02", week: 6, day: 0 });
    expect(grid.cells[2]).toMatchObject({ date: "2026-08-03", week: 0, day: 1 });
    expect(grid.cells.at(-1)).toMatchObject({ date: "2026-08-31", week: 0, day: 5 });
  });
  it("keeps missing days unavailable while preserving real zero values", () => {
    const grid = buildFootprintGrid(
      [{ date: "2026-02-01", count: 0, colorCount: 0 }],
      0,
      1,
      "2026-02",
    );
    expect(grid.cells[0]).toMatchObject({ count: 0, missing: false });
    expect(grid.cells[1]).toMatchObject({ count: null, missing: true });
    expect(grid.cells).toHaveLength(28);
  });
  it("derives independent legend ranges from supplied values only", () => {
    expect(availableRange([10, 30, null, undefined, NaN])).toEqual({ min: 10, max: 30 });
    expect(availableRange([null, undefined, NaN])).toBeNull();
    const grid = buildFootprintGrid(
      [
        { date: "2026-02-01", count: 30, colorCount: 100 },
        { date: "2026-02-02", count: 10, colorCount: 400 },
      ],
      0,
      1,
      "2026-02",
    );
    expect(grid.max).toBe(30);
    expect(grid.cells[0]?.level).toBe(1);
    expect(grid.cells[1]?.level).toBe(4);
  });
  it("places Sunday on the seventh row of the year grid", () => {
    const grid = buildFootprintGrid(
      [{ date: "2026-08-02", count: 5 }],
      Date.parse("2026-08-31T00:00:00Z"),
      1,
    );
    expect(grid.cells.find((d) => d.date === "2026-08-02")?.day).toBe(6);
  });
});
