import { describe, expect, it } from "vitest";
import { buildCalendarScale, buildFootprintGrid } from "@/lib/calendar-model";
describe("footprint periods and integrity", () => {
  it("keeps August 2026 in Monday-to-Sunday rows without extra dates", () => {
    const grid = buildFootprintGrid(
      [{ date: "2026-08-01", count: 12, colorCount: 100 }],
      0,
      1,
      "2026-08",
    );
    expect(grid.cells).toHaveLength(31);
    expect(grid.cells[0]).toMatchObject({
      date: "2026-08-01",
      week: 5,
      day: 0,
    });
    expect(grid.cells[1]).toMatchObject({
      date: "2026-08-02",
      week: 6,
      day: 0,
    });
    expect(grid.cells[2]).toMatchObject({
      date: "2026-08-03",
      week: 0,
      day: 1,
    });
    expect(grid.cells.at(-1)).toMatchObject({
      date: "2026-08-31",
      week: 0,
      day: 5,
    });
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
    expect(buildCalendarScale([10, 30, null, undefined, NaN])).toMatchObject({
      min: 10,
      max: 30,
    });
    expect(buildCalendarScale([null, undefined, NaN])).toBeNull();
    const grid = buildFootprintGrid(
      [
        { date: "2026-02-01", count: 30, colorCount: 100 },
        { date: "2026-02-02", count: 10, colorCount: 400 },
      ],
      0,
      1,
      "2026-02",
    );
    expect(grid.heightDomain?.max).toBe(30);
    expect(grid.cells[0]?.level).toBe(1);
    expect(grid.cells[1]?.level).toBe(4);
  });
  it("separates ordinary days despite a rare spike and keeps height and color ordered", () => {
    const values = [15, 17, 18, 19, 20, 20, 21, 21, 22, 22, 23, 24, 46];
    const grid = buildFootprintGrid(
      values.map((count, index) => ({
        date: `2026-03-${String(index + 1).padStart(2, "0")}`,
        count,
      })),
      0,
      1,
      "2026-03",
    );
    const days = grid.cells.slice(0, values.length);
    expect(new Set(days.slice(1, -1).map((day) => day.level)).size).toBe(4);
    expect(days[5]?.height).toBeGreaterThan(days[3]?.height ?? 0);
    expect(days[4]).toMatchObject({
      height: days[5]?.height,
      level: days[5]?.level,
    });
    expect(days.at(-1)).toMatchObject({ count: 46, height: 1, level: 4 });
    const scale = grid.colorDomain;
    if (!scale) throw new Error("Expected supplied-value scale");
    expect(scale.ticks.map((tick) => scale.position(tick))).toEqual(
      [0, 0.25, 0.5, 0.75, 1].map((p) => expect.closeTo(p)),
    );
  });
  it("preserves credits and zero while excluding dates outside the displayed period", () => {
    const grid = buildFootprintGrid(
      [
        { date: "2025-09-30", count: 100000 },
        { date: "2025-10-01", count: -1049.69 },
        { date: "2025-10-02", count: 0 },
        { date: "2025-10-03", count: 1360 },
      ],
      0,
      1,
      "2025-10",
    );
    expect(grid.colorDomain).toMatchObject({ min: -1049.69, max: 1360 });
    expect(grid.cells[0]).toMatchObject({
      count: -1049.69,
      missing: false,
      level: 1,
    });
    expect(grid.cells[1]).toMatchObject({ count: 0, missing: false });
    expect(grid.cells[3]).toMatchObject({
      count: null,
      missing: true,
      level: 0,
    });
  });
  it("places Sunday on the seventh row of the year grid", () => {
    const grid = buildFootprintGrid(
      [{ date: "2026-08-02", count: 5 }],
      Date.parse("2026-08-31T00:00:00Z"),
      1,
    );
    expect(grid.cells.find((d) => d.date === "2026-08-02")?.day).toBe(6);
  });
  it("uses inclusive custom dates for both geometry and scales", () => {
    const grid = buildFootprintGrid(
      [
        { date: "2026-08-27", count: 10000 },
        { date: "2026-08-31", count: 10 },
        { date: "2026-09-02", count: 25 },
        { date: "2026-09-03", count: 20000 },
      ],
      Date.parse("2026-09-02"),
      1,
      undefined,
      Date.parse("2026-08-28"),
    );
    expect(grid.cells).toHaveLength(6);
    expect(grid.weeks).toBe(2);
    expect(grid.cells[0]).toMatchObject({ date: "2026-08-28", week: 0, day: 4 });
    expect(grid.cells.at(-1)).toMatchObject({ date: "2026-09-02", week: 1, day: 2 });
    expect(grid.colorDomain).toMatchObject({ min: 10, max: 25 });
  });
  it("keeps a partial month aligned to weekday slots", () => {
    const grid = buildFootprintGrid(
      [],
      Date.parse("2026-08-31"),
      1,
      "2026-08",
      Date.parse("2026-08-30"),
    );
    expect(grid.cells).toHaveLength(2);
    expect(grid.cells[0]).toMatchObject({ date: "2026-08-30", week: 6, day: 0 });
    expect(grid.cells[1]).toMatchObject({ date: "2026-08-31", week: 0, day: 1 });
  });
});
