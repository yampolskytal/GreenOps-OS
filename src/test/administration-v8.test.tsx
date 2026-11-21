import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import {
  ApprovalWorkspace,
  DemoExceptions,
  type ReviewFilter,
} from "@/components/greenops/demo-exceptions";
import { InspectorProvider } from "@/components/greenops/analytical-inspector";
import { DonutBreakdown } from "@/components/greenops/spending-donut";
import { SelectedMonthSummary } from "@/components/greenops/historical-performance";
import { AppStateProvider } from "@/lib/store";
import { categoryShares, gaugeGeometry } from "@/lib/administration";
import { api, getPlanningApi } from "@/lib/api/client";
import { approvedDemoIds } from "@/lib/proposals";
import { demoMeasures } from "@/lib/api/demo-data";
import type { MonthlyObservation } from "@/lib/api/types";

const key = "greenops-state-v1";
const all = [demoMeasures.find((m) => m.id === "M7")!, demoMeasures.find((m) => m.id === "M2")!];
afterEach(() => {
  cleanup();
  localStorage.clear();
});

function approvals(
  role: "ceo" | "cfo" | "it" = "ceo",
  filter: "all" | "blocked" | "review" = "all",
) {
  const stored = JSON.parse(localStorage.getItem(key) ?? "{}");
  localStorage.setItem(key, JSON.stringify({ ...stored, role }));
  function Workspace() {
    const [selectedFilter, setFilter] = useState<ReviewFilter>(filter);
    return <ApprovalWorkspace measures={all} filter={selectedFilter} onFilter={setFilter} />;
  }
  return render(
    <AppStateProvider>
      <InspectorProvider>
        <Workspace />
      </InspectorProvider>
    </AppStateProvider>,
  );
}

describe("Administration scorecard, decisions and analysis", () => {
  it("places a target at its exact clockwise angle and scales larger or negative results", () => {
    const gauge = gaugeGeometry(60, 25);
    expect(gauge.arc).toBe(60);
    expect(gauge.marker(83)[0]).toBeCloseTo(183);
    expect(gauge.marker(83)[1]).toBeCloseTo(100);
    expect(gaugeGeometry(120, 40)).toMatchObject({ scale: 120, arc: 100 });
    expect(gaugeGeometry(-10, 40).arc).toBe(0);
  });

  it("uses recommendation counters, selects a record and closes evidence with Escape or outside click", () => {
    approvals();
    expect(screen.getByRole("button", { name: "2 All decisions" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1 Blocked" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1 Review required" })).toBeInTheDocument();
    const review = all[1]!;
    fireEvent.click(
      within(screen.getByRole("list", { name: "Recommendations" })).getByRole("button", {
        name: new RegExp(review.title),
      }),
    );
    expect(screen.getByRole("heading", { name: review.title })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "1 Blocked" }));
    expect(
      within(screen.getByRole("list", { name: "Recommendations" })).getAllByRole("button"),
    ).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "1 Review required" }));
    expect(screen.getByRole("heading", { name: review.title })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "More information" }));
    expect(screen.getByRole("complementary", { name: review.title })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("complementary", { name: review.title })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "More information" }));
    fireEvent.pointerDown(screen.getByLabelText("Search recommendations"));
    expect(screen.queryByRole("complementary", { name: review.title })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search recommendations"), {
      target: { value: "no matching resource" },
    });
    expect(screen.getByText("No matching decisions.")).toBeInTheDocument();
  });

  it("pre-filters reviews and restricts the decision controls to Administration", () => {
    const view = approvals("ceo", "review");
    expect(
      within(screen.getByRole("list", { name: "Recommendations" })).getAllByRole("button"),
    ).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Approve for simulation" })).toBeInTheDocument();
    view.unmount();
    approvals("cfo", "review");
    expect(
      screen.queryByRole("button", { name: "Approve for simulation" }),
    ).not.toBeInTheDocument();
  });

  it("confirms and persists a local decision without changing provider eligibility or plan state", () => {
    localStorage.setItem(key, JSON.stringify({ measureIds: ["M1"], theme: "light" }));
    const view = approvals();
    const field = api.isDemo ? "demoExceptions" : "simulationDecisions";
    const stored = () => JSON.parse(localStorage.getItem(key) ?? "{}");
    fireEvent.click(screen.getByRole("button", { name: "Unblock for simulation" }));
    expect(stored()[field]).toEqual({});
    fireEvent.click(screen.getByRole("button", { name: "Confirm simulation decision" }));
    expect(stored()[field].M7.approved).toBe(true);
    expect(stored().measureIds).toEqual(["M1"]);
    expect(stored().theme).toBe("light");
    expect(all[0]?.includable).toBe(false);
    const connectedProvider = { ...api, isDemo: false };
    expect(getPlanningApi(approvedDemoIds(stored()[field], false), connectedProvider)).toBe(
      connectedProvider,
    );
    view.unmount();
    const readOnly = render(
      <AppStateProvider>
        <DemoExceptions measures={all} />
      </AppStateProvider>,
    );
    expect(screen.getByText("Simulation approved locally")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revoke decision" })).not.toBeInTheDocument();
    readOnly.unmount();
    approvals();
    fireEvent.click(screen.getByRole("button", { name: "Revoke decision" }));
    expect(stored()[field]).toEqual({});
    fireEvent.click(screen.getByRole("button", { name: "Reject / Keep blocked" }));
    expect(stored()[field].M7.approved).toBe(false);
    fireEvent.change(screen.getByLabelText("Decision status"), { target: { value: "rejected" } });
    expect(
      within(screen.getByRole("list", { name: "Recommendations" })).getAllByRole("button"),
    ).toHaveLength(1);
  });

  it("shares segment and legend colors, keeps every category and distinguishes missing values", () => {
    const rows = [
      { label: "A", costChf: 30 },
      { label: "B", costChf: 10 },
      { label: "C", costChf: null },
    ].map((row) => ({ ...row, co2Kg: null, energyKwh: null }));
    const { container } = render(
      <InspectorProvider>
        <DonutBreakdown rows={rows} metric="costChf" unit="CHF" rule="Source allocations" />
      </InspectorProvider>,
    );
    expect(screen.getByText("30 CHF · 75%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "C Unavailable" })).toBeInTheDocument();
    const segment = container.querySelector('[data-category="A"]');
    expect(segment?.getAttribute("stroke")).toBe("#C8FA50");
    expect(
      container.querySelector<HTMLElement>('[data-category-color="A"]')?.style.backgroundColor,
    ).toBe("rgb(200, 250, 80)");
    fireEvent.click(segment!);
    expect(screen.getByRole("complementary", { name: "A" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "B 10 CHF · 25%" }));
    expect(screen.getByRole("complementary", { name: "B" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close evidence" }));
    expect(screen.queryByRole("complementary", { name: "B" })).not.toBeInTheDocument();
    expect(categoryShares([-1, 5, null])).toMatchObject({
      drawable: false,
      shares: [null, null, null],
    });
  });

  it("uses the same selected month for every card and leaves missing observations as gaps", () => {
    const rows: MonthlyObservation[] = [
      { month: "2025-12", costChf: 100, energyKwh: 10, co2Kg: 30, co2KgMarket: 10 },
      { month: "2026-01", costChf: 90, energyKwh: 20, co2Kg: 15, co2KgMarket: null },
      { month: "2026-02", costChf: 500, energyKwh: 100, co2Kg: 40, co2KgMarket: 20 },
    ];
    render(<SelectedMonthSummary id="month" rows={rows} selected={rows[1]!} />);
    expect(screen.getByRole("heading", { name: "Jan 2026" })).toBeInTheDocument();
    for (const label of [
      "CHF 90",
      "20 kWh",
      "15 kg",
      "Unavailable",
      "10.0% decrease vs previous month",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    const market = screen.getByText("Market-based CO₂").parentElement!;
    expect(market.querySelectorAll("svg[role=img] circle")).toHaveLength(2);
    expect(market.querySelectorAll("svg[role=img] line")).toHaveLength(1);
  });
});
