import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { InspectorProvider, AnalyticalInspector } from "@/components/greenops/analytical-inspector";
import { EvidenceSources } from "@/components/greenops/details";
import { FootprintCalendar } from "@/components/greenops/calendar";
import type { DailyFootprint, MarketCoverage } from "@/lib/api/types";
import { HistoricalPerformance } from "@/components/greenops/historical-performance";
import { DonutBreakdown } from "@/components/greenops/spending-donut";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { demoOverview, demoMeasures, DEMO_BASELINE } from "@/lib/api/demo-data";
import { evaluatePackage } from "@/lib/optimizer";
import { carbonMass, chf, formatEvidenceText, kg } from "@/lib/format";

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return { ...actual, ResponsiveContainer: () => null };
});
vi.mock("@/components/greenops/contribution-skyline", () => ({
  default: ({
    data,
    onCellClick,
  }: {
    data: { date: string }[];
    onCellClick: (day: { date: string }) => void;
  }) => (
    <div>
      {data.map((day) => (
        <span key={day.date} onClick={() => onCellClick(day)}>
          {day.date}
        </span>
      ))}
    </div>
  ),
}));
afterEach(cleanup);

describe("QA Batch 1 shared components", () => {
  it("formats monetary amounts and uses source units once for emissions", () => {
    expect(chf(463658)).toBe("CHF 463,658");
    expect(chf(16500.15)).toBe("CHF 16,500.15");
    expect(kg(7901.65)).toBe("7,901.65 kg");
    expect(carbonMass(4700, "kg CO₂e/year")).toBe("4,700 kg CO₂e");
    expect(carbonMass(4.7, "tCO2e/year")).toBe("4,700 kg CO₂e");
    expect(carbonMass(null, "kg CO2e")).toBe("Unavailable");
    expect(formatEvidenceText("CHF 16'500 · 4.7 t CO₂e/year")).toBe(
      "CHF 16,500 · 4,700 kg CO₂e/year",
    );
  });

  it("keeps one evidence panel when the metric and observed month change", () => {
    render(
      <InspectorProvider>
        <HistoricalPerformance overview={demoOverview} />
      </InspectorProvider>,
    );
    const names = screen
      .getAllByRole("button", { name: /View calculation and evidence for/ })
      .map((button) => button.getAttribute("aria-label")?.split(" for ")[1]);
    expect(names).toEqual(["Cost", "Energy", "Location-based CO₂", "Market-based CO₂"]);
    fireEvent.click(screen.getByRole("button", { name: "View calculation and evidence for Cost" }));
    const dock = screen.getByRole("complementary", { name: "Cost · historical evidence" });
    const market = screen.getByRole("button", {
      name: "View calculation and evidence for Market-based CO₂",
    });
    fireEvent.pointerDown(market);
    expect(dock).toBeVisible();
    fireEvent.click(market);
    expect(
      screen.getByRole("complementary", { name: "Market-based CO₂ · historical evidence" }),
    ).toBe(dock);
    const months = within(screen.getByLabelText("Inspect a monthly observation")).getAllByRole(
      "button",
    );
    expect(months).toHaveLength(demoOverview.monthly.length);
    fireEvent.pointerDown(months[0]!);
    fireEvent.click(months[0]!);
    expect(months[0]).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("complementary", { name: "Market-based CO₂ · historical evidence" }),
    ).toBe(dock);
    expect(screen.getByRole("heading", { name: /Observed results/ })).toBeVisible();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(dock).not.toBeInTheDocument();
  });

  it("keeps annual baselines, projections and coverage inside the same monthly evidence dock", () => {
    const coverage: MarketCoverage = {
      status: "partial",
      modeledKwh: 100,
      coveredKwh: 45,
      uncoveredKwh: 55,
      allocatedCoveredKwh: 0,
      coveragePct: 45,
      missingEnergyRows: 0,
      missingFactorRows: 2,
      uncoveredRegions: [],
      sources: ["suppliers.csv"],
      factors: [],
      assumptions: ["Contract scope"],
      missingInputs: ["Supplier factor missing"],
    };
    const overview = { ...demoOverview, marketCoverage: coverage };
    const result = {
      ...evaluatePackage(demoMeasures, ["M1"], DEMO_BASELINE, 16500, 1100),
      savingsCo2Kg: 1234,
      savingsCo2KgMarket: null,
      marketCoverage: coverage,
    };
    render(
      <InspectorProvider>
        <HistoricalPerformance
          overview={overview}
          emissionsProjection={{
            result,
            label: "Current Plan",
            pending: false,
            error: false,
          }}
        />
      </InspectorProvider>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "View calculation and evidence for Location-based CO₂" }),
    );
    const panel = screen.getByRole("complementary", {
      name: "Location-based CO₂ · historical evidence",
    });
    expect(within(panel).getByText("Annual location-based baseline")).toBeVisible();
    expect(within(panel).getByText("Current Plan · 1,234 kg CO₂")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "View calculation and evidence for Market-based CO₂" }),
    );
    expect(
      screen.getByRole("complementary", { name: "Market-based CO₂ · historical evidence" }),
    ).toBe(panel);
    expect(
      within(panel).getByText("Annual market-based baseline (covered activity)"),
    ).toBeVisible();
    expect(within(panel).getByText("Current Plan · Unavailable")).toBeVisible();
    expect(within(panel).getAllByText("Supplier factor missing")[0]).toBeVisible();
    expect(within(panel).getAllByText("suppliers.csv")[0]).toBeVisible();
    expect(within(panel).getByText(/Comparison unavailable/)).toBeVisible();
  });

  it("updates the day inspector in place when the calendar canvas selects another date", () => {
    const days: DailyFootprint[] = ["2026-01-01", "2026-01-02"].map((date, index) => ({
      date,
      costChf: 1000 + index,
      energyKwh: 100,
      co2Kg: 20,
      workday: true,
      coverage: "measured",
      contributors: [],
    }));
    render(
      <InspectorProvider>
        <FootprintCalendar
          days={days}
          metric="costChf"
          compare={false}
          onCompareChange={() => {}}
        />
      </InspectorProvider>,
    );
    fireEvent.click(screen.getByText("2026-01-01", { exact: true }));
    const panel = screen.getByRole("complementary", { name: "2026-01-01" });
    const second = screen.getByText("2026-01-02", { exact: true });
    fireEvent.pointerDown(second);
    expect(panel).toBeVisible();
    fireEvent.click(second);
    expect(screen.getByRole("complementary", { name: "2026-01-02" })).toBe(panel);
    expect(within(panel).getByText("Cost · CHF 1,001")).toBeVisible();
  });

  it("orders every donut entry by value, uses batches of eight, and links legend hover to the slice", () => {
    const rows = Array.from({ length: 25 }, (_, index) => ({
      label: `Category ${index + 1}`,
      costChf: index + 1,
      energyKwh: null,
      co2Kg: null,
    }));
    const { container } = render(
      <InspectorProvider>
        <DonutBreakdown
          rows={rows}
          metric="costChf"
          unit="CHF"
          rule="Source method"
          returnedSubtotal
        />
      </InspectorProvider>,
    );
    const lists = screen.getAllByRole("list", { name: /Categories column/ });
    expect(lists.map((list) => within(list).getAllByRole("listitem").length)).toEqual([8, 8, 8, 1]);
    const first = within(lists[0]!).getAllByRole("button")[0]!;
    expect(first).toHaveTextContent("Category 25");
    const slice = container.querySelector('[data-category="Category 25"]')!;
    fireEvent.pointerEnter(first);
    expect(slice).toHaveAttribute("stroke-width", "31");
    fireEvent.pointerLeave(first);
    fireEvent.pointerEnter(slice);
    expect(first).toHaveAttribute("data-highlighted", "true");
    fireEvent.pointerLeave(slice);
    expect(screen.getByText("Supplied subtotal", { exact: true })).toBeInTheDocument();
  });

  it("expands and collapses source references and opens supplied details in the same dock", () => {
    const sources = [1, 2, 3, 4].map((index) => ({
      source: `file-${index}.csv`,
      detail: `Record ${index}`,
    }));
    render(
      <InspectorProvider>
        <AnalyticalInspector title="Calculation" trigger={<button>Open calculation</button>}>
          <EvidenceSources sources={sources} />
        </AnalyticalInspector>
      </InspectorProvider>,
    );
    fireEvent.click(screen.getByText("Open calculation"));
    expect(screen.queryByText("file-4.csv")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Show more sources"));
    expect(screen.getByText("file-4.csv")).toBeVisible();
    fireEvent.click(screen.getByText("Show fewer sources"));
    expect(screen.queryByText("file-4.csv")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View detailed source evidence" }));
    expect(screen.getByText("Record 4")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Back to summary" }));
    expect(screen.queryByText("Record 4")).not.toBeInTheDocument();
  });

  it("mounts the active section only and supports keyboard tab activation", () => {
    render(
      <Tabs defaultValue="overview" activationMode="manual">
        <TabsList aria-label="Sections">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <p>Overview content</p>
        </TabsContent>
        <TabsContent value="details">
          <p>Details content</p>
        </TabsContent>
      </Tabs>,
    );
    expect(screen.queryByText("Details content")).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("tab", { name: "Details" }), { key: "Enter" });
    expect(screen.getByText("Details content")).toBeVisible();
    expect(screen.queryByText("Overview content")).not.toBeInTheDocument();
  });
});
