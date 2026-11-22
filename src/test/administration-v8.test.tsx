import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ApprovalWorkspace } from "@/components/greenops/demo-exceptions";
import { AdministrationScorecard } from "@/components/greenops/administration-overview";
import { evaluatePackage } from "@/lib/optimizer";
import { InspectorProvider } from "@/components/greenops/analytical-inspector";
import { DonutBreakdown, donutColor } from "@/components/greenops/spending-donut";
import { SelectedMonthSummary } from "@/components/greenops/historical-performance";
import { AppStateProvider } from "@/lib/store";
import { categoryShares, gaugeGeometry } from "@/lib/administration";
import { api, getPlanningApi } from "@/lib/api/client";
import { approvedDemoIds } from "@/lib/proposals";
import { demoMeasures, demoOverview, DEMO_BASELINE } from "@/lib/api/demo-data";
import type { Measure, MonthlyObservation } from "@/lib/api/types";

const key = "greenops-state-v1";
const blocked = demoMeasures.find((m) => m.id === "M7")!;
const review = { ...demoMeasures.find((m) => m.id === "M2")!, includable: false };
const all = [blocked, review];
afterEach(() => {
  cleanup();
  localStorage.clear();
});

function approvals(role: "ceo" | "cfo" | "it" = "ceo", measures: Measure[] = all) {
  const stored = JSON.parse(localStorage.getItem(key) ?? "{}");
  localStorage.setItem(key, JSON.stringify({ ...stored, role }));
  return render(
    <AppStateProvider>
      <InspectorProvider>
        <ApprovalWorkspace measures={measures} />
      </InspectorProvider>
    </AppStateProvider>,
  );
}

describe("Administration scorecard, decisions and analysis", () => {
  it("shows observed spend instead of zero savings and ignores stale approval for a missing quote", () => {
    const field = api.isDemo ? "demoExceptions" : "simulationDecisions";
    localStorage.setItem(key, JSON.stringify({ [field]: { [review.id]: { approved: true } } }));
    approvals("ceo", [
      {
        ...review,
        savingsChf: 0,
        savingsKwh: 0,
        savingsCo2KgLocation: 0,
        savingsCo2KgMarket: 0,
        decision: {
          status: "evidence-needed",
          reason: "Savings await a comparable quote.",
          nextStep: "Request a quote.",
          scopedAnnualCostChf: 23225.31,
          benefits: [],
          tradeoffs: [],
        },
      },
    ]);
    expect(screen.getByRole("button", { name: "1 For investigation" })).toBeVisible();
    expect(screen.getByText(/Current annual billed cost: CHF 23,225.31/)).toBeVisible();
    expect(screen.getByText("Request a quote.")).toBeVisible();
    expect(screen.queryByText(/CHF 0/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /for simulation/ })).not.toBeInTheDocument();
  });
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
    expect(screen.getByRole("complementary", { name: review.title })).toBeVisible();
    fireEvent.pointerDown(screen.getByLabelText("Analysis details").previousElementSibling!);
    expect(screen.queryByRole("complementary", { name: review.title })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search recommendations"), {
      target: { value: "no matching resource" },
    });
    expect(screen.getByText(/No matching decisions/)).toBeInTheDocument();
  });

  it("pre-filters reviews and restricts the decision controls to Administration", () => {
    const view = approvals("ceo");
    fireEvent.click(screen.getByRole("button", { name: "1 Review required" }));
    expect(
      within(screen.getByRole("list", { name: "Recommendations" })).getAllByRole("button"),
    ).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Confirm review for simulation" }),
    ).toBeInTheDocument();
    view.unmount();
    approvals("cfo");
    fireEvent.click(screen.getByRole("button", { name: "1 Review required" }));
    expect(
      screen.queryByRole("button", { name: "Confirm review for simulation" }),
    ).not.toBeInTheDocument();
  });

  it("confirms and persists a local decision without changing provider eligibility or plan state", () => {
    localStorage.setItem(key, JSON.stringify({ measureIds: ["M1"], theme: "light" }));
    const view = approvals();
    const field = api.isDemo ? "demoExceptions" : "simulationDecisions";
    const stored = () => JSON.parse(localStorage.getItem(key) ?? "{}");
    fireEvent.click(screen.getByRole("button", { name: "1 Blocked" }));
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
    expect(screen.getByRole("button", { name: "0 Blocked" })).toBeInTheDocument();
    expect(screen.getByText(/No matching decisions/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "1 Unblocked" }));
    expect(screen.getByRole("heading", { name: blocked.title })).toBeInTheDocument();
    expect(screen.getAllByText("Unblocked · simulation only")).toHaveLength(2);
    expect(screen.getByText(/backend excludes this measure/)).toBeVisible();
    view.unmount();
    approvals();
    fireEvent.click(screen.getByRole("button", { name: "1 Unblocked" }));
    fireEvent.click(screen.getByRole("button", { name: "Revoke decision" }));
    expect(stored()[field]).toEqual({});
    expect(screen.getByRole("button", { name: "1 Blocked" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "0 Unblocked" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject / Keep blocked" })).not.toBeInTheDocument();
  });

  it("keeps the evidence dock open when changing recommendation and moves review confirmations", () => {
    approvals();
    fireEvent.click(screen.getByRole("button", { name: "More information" }));
    const panel = screen.getByRole("complementary", { name: blocked.title });
    const row = within(screen.getByRole("list", { name: "Recommendations" })).getByRole("button", {
      name: new RegExp(review.title),
    });
    fireEvent.pointerDown(row);
    fireEvent.click(row);
    expect(screen.getByRole("complementary", { name: review.title })).toBe(panel);
    expect(within(panel).getByText("Backend excluded")).toBeVisible();
    expect(within(panel).getByText(review.risk.approver!)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Confirm review for simulation" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm simulation decision" }));
    expect(screen.getByRole("button", { name: "0 Review required" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1 Unblocked" })).toBeInTheDocument();
    expect(screen.getAllByText("Review confirmed · simulation only")).toHaveLength(2);
  });

  it("uses unrounded values for four target indicators and renders the projection before baseline", () => {
    const result = evaluatePackage(demoMeasures, [], DEMO_BASELINE, 16500, 1100);
    result.co2ReductionPct = 39.999;
    result.costReductionPct = 25;
    result.effortDays = 15.001;
    result.constraints = result.constraints.filter(({ unit }) => unit !== "CHF");
    const { container } = render(
      <InspectorProvider>
        <AdministrationScorecard overview={demoOverview} result={result} suggested />
      </InspectorProvider>,
    );
    for (const name of [
      "Carbon reduction · target missed",
      "Cost reduction · target met",
      "Implementation effort · target missed",
      "Implementation budget · unavailable",
    ]) {
      expect(screen.getByRole("img", { name })).toBeInTheDocument();
    }
    expect(screen.queryByText(/numerical targets achieved/)).not.toBeInTheDocument();
    expect(screen.getAllByText("After suggested strategy")).toHaveLength(2);
    const tracks = Array.from(container.querySelectorAll("[data-outcome-track]"));
    expect(tracks.map((track) => track.previousElementSibling?.firstChild?.textContent)).toEqual([
      "After suggested strategy",
      "Baseline",
      "After suggested strategy",
      "Baseline",
    ]);
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
    expect(screen.getByText("CHF 30 · 75%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "C Unavailable" })).toBeInTheDocument();
    const segment = container.querySelector('[data-category="A"]');
    expect(segment?.getAttribute("stroke")).toBe(donutColor(0, 2));
    const color = document.createElement("span");
    color.style.backgroundColor = donutColor(0, 2);
    expect(
      container.querySelector<HTMLElement>('[data-category-color="A"]')?.style.backgroundColor,
    ).toBe(color.style.backgroundColor);
    fireEvent.click(segment!);
    expect(screen.getByRole("complementary", { name: "A" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "B CHF 10 · 25%" }));
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
    expect(
      screen.getByRole("heading", { name: "January 2026 — Observed results" }),
    ).toBeInTheDocument();
    for (const label of [
      "CHF 90",
      "20 kWh",
      "15 kg CO₂",
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
