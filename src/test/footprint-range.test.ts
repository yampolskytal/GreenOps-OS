import { describe, it, expect } from "vitest";
import { footprintRange } from "@/lib/footprint-range";
import { officialQuery } from "@/lib/planning";

describe("V7 exploration dates", () => {
  it("includes both custom range boundaries without fabricating missing days", () => {
    const rows = [
      { date: "2026-01-20", value: null },
      { date: "2026-01-03", value: 5 },
      { date: "2026-01-04", value: 0 },
    ];
    expect(footprintRange(rows, "2026-01-04", "2026-01-20")).toEqual([
      { date: "2026-01-04", value: 0 },
      { date: "2026-01-20", value: null },
    ]);
    expect(rows[0]?.date).toBe("2026-01-20");
  });
  it("rejects inverted dates instead of silently changing the selection", () => {
    expect(footprintRange([{ date: "2026-01-04" }], "2026-01-20", "2026-01-04")).toEqual([]);
  });
  it("keeps the official September 2025–August 2026 query despite custom exploration dates", () => {
    expect(
      officialQuery({
        datasetVersion: "demo-v0",
        from: "2026-01-04",
        to: "2026-01-20",
        department: "IT",
        provider: "Azure",
      }),
    ).toEqual({
      datasetVersion: "demo-v0",
      from: "2025-09",
      to: "2026-08",
      department: "all",
      provider: "all",
    });
  });
});
