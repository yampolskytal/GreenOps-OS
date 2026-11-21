import { describe, expect, it, vi, afterEach } from "vitest";
import { createPath, setPathMembership, previewDifference, type SavedPath } from "@/lib/paths";
import {
  recentForecastHistory,
  SUPPORTED_FORECAST_HORIZONS,
  SKYLINE_ENCODING,
} from "@/lib/analytics";
import { TARGETS } from "@/lib/optimizer";
import { createHttpApi } from "@/lib/api/client";
import { runtimeSegments } from "@/lib/planning";
import { chf } from "@/lib/format";
const path = (id: string): SavedPath => ({
  id,
  name: id,
  measureIds: [],
  budgetChf: 16500,
  priority: "balanced",
});
const q = {
  datasetVersion: "real",
  from: "2025-09",
  to: "2026-08",
  department: "all",
  provider: "all",
};
afterEach(() => vi.unstubAllGlobals());
describe("V5 planning rules", () => {
  it("allows three named Paths and rejects a fourth", () => {
    const three = createPath(createPath(createPath([], path("A")), path("B")), path("C"));
    expect(three).toHaveLength(3);
    expect(() => createPath(three, path("D"))).toThrow("three Paths");
  });
  it("adds one measure to multiple confirmed Paths without duplicates", () => {
    const all = [path("A"), path("B"), path("C")];
    const result = setPathMembership(setPathMembership(all, "M1", ["A", "C"]), "M1", ["A", "C"]);
    expect(result.map((p) => p.measureIds)).toEqual([["M1"], [], ["M1"]]);
    expect(all.map((p) => p.measureIds)).toEqual([[], [], []]);
  });
  it("removes only unchecked Path memberships", () => {
    const added = setPathMembership([path("A"), path("B")], "M2", ["A", "B"]);
    expect(setPathMembership(added, "M2", ["B"]).map((p) => p.measureIds)).toEqual([[], ["M2"]]);
  });
  it("preserves an over-limit alternative Path for further editing", () => {
    const saved = createPath([], {
      ...path("Over budget"),
      budgetChf: 20000,
      measureIds: ["M1", "M2"],
    });
    expect(saved[0]?.budgetChf).toBe(20000);
    expect(saved[0]?.measureIds).toEqual(["M1", "M2"]);
  });
  it("counts preview additions and removals without changing committed selections", () => {
    const committed = ["M1", "M2"];
    expect(previewDifference(["M2", "M3"], committed)).toEqual({ added: 1, removed: 1 });
    expect(committed).toEqual(["M1", "M2"]);
  });
  it("uses the official 40% minimum location-based CO₂ target", () =>
    expect(TARGETS.co2Pct).toBe(40));
  it("uses the official 25% minimum annual cost target", () => expect(TARGETS.costPct).toBe(25));
  it("uses the official 15-person-day maximum", () => expect(TARGETS.maxPersonDays).toBe(15));
  it("uses the official CHF 16,500 implementation maximum", () =>
    expect(TARGETS.budgetChf).toBe(16500));
  it("offers quarterly projections up to a three-year horizon", () =>
    expect(SUPPORTED_FORECAST_HORIZONS).toEqual([1, 2, 3]));
  it("fixes skyline height to cost and color to location CO₂", () =>
    expect(SKYLINE_ENCODING).toEqual({ height: "costChf", color: "co2Kg" }));
  it("shows unavailable runtime coverage instead of inventing running hours", () =>
    expect(runtimeSegments(null)).toEqual({ active: null, inactive: null, unknown: null }));
  it("keeps unavailable cost distinct from real zero", () => {
    expect(chf(null)).toBe("Unavailable");
    expect(chf(0)).toBe("CHF 0");
  });
  it("uses only supplied monthly history and leaves missing months as gaps", () => {
    const rows = [
      { month: "2026-08", costChf: 80, co2Kg: null, energyKwh: null },
      { month: "2026-06", costChf: 0, co2Kg: null, energyKwh: null },
    ];
    const recent = recentForecastHistory(rows, "cost");
    expect(recent).toHaveLength(6);
    expect(recent.map((r) => r.value)).toEqual([null, null, null, 0, null, 80]);
  });
  it("rejects invalid real-provider analytics without a DEMO fallback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ cost: 123 }), { status: 200 })),
    );
    await expect(createHttpApi("/real-api").getOverview(q)).rejects.toThrow(
      "No DEMO values were substituted",
    );
  });
  it("accepts partial resource coverage with unknown runtime and no demo defaults", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify([{ id: "real-1", name: "Actual resource" }]), {
          status: 200,
        }),
      ),
    );
    const resources = await createHttpApi("/real-api").getResources(q);
    expect(resources).toHaveLength(1);
    expect(resources[0]?.runtimeH30d).toBeNull();
    expect(resources[0]?.name).toBe("Actual resource");
  });
});
