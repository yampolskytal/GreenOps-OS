import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { GeographicView, geographicRows } from "@/components/greenops/geographic-footprint";
import {
  GeographicBreakdowns,
  RegionalBars,
  regionalBreakdownRows,
} from "@/components/greenops/geographic-breakdowns";
import { InspectorProvider } from "@/components/greenops/analytical-inspector";
import type { LocationSummary } from "@/lib/api/types";

vi.mock("@/lib/queries", () => ({
  useLocations: () => ({ isPending: true }),
  useBreakdowns: () => ({ isPending: true }),
}));

const zurich: LocationSummary = {
  id: "zurich",
  label: "Zurich area",
  country: "Switzerland",
  lat: 47.37,
  lng: 8.54,
  resourceCount: 3,
  costChf: 3200,
  energyKwh: 75.25,
  co2KgLocation: 8.5,
  co2KgMarket: null,
  gridKgPerKwh: { low: 0.02, mid: 0.05, high: 0.1 },
  providers: ["Provider A"],
  risks: [],
};
const mixed: LocationSummary = {
  ...zurich,
  id: "eu-mixed",
  country: "EU",
  label: "EU (AI & SaaS, mixed)",
  costChf: 900,
  energyKwh: 0,
  co2KgLocation: Number.NaN,
};

it("maps only city-associated region rows and preserves supplied zero and missing values", () => {
  expect(geographicRows([zurich, mixed], "costChf")).toEqual([
    expect.objectContaining({ city: "Zurich", value: 3200, color: "#286044" }),
    expect.objectContaining({ city: undefined, value: 900, color: "#e0e8ac" }),
  ]);
  expect(geographicRows([mixed], "energyKwh")[0]?.value).toBe(0);
  expect(geographicRows([mixed], "co2KgLocation")[0]).toMatchObject({ value: null, color: null });
});

it("switches metric units and updates the existing location evidence dock", () => {
  function Harness() {
    const [metric, setMetric] = useState<Parameters<typeof geographicRows>[1]>("costChf");
    return (
      <InspectorProvider>
        <GeographicView locations={[zurich, mixed]} metric={metric} onMetricChange={setMetric} />
      </InspectorProvider>
    );
  }
  render(<Harness />);
  const cityComparison = screen.getByRole("region", { name: "City-area comparison" });
  const scroll = vi.fn();
  Object.defineProperty(cityComparison, "scrollIntoView", { value: scroll });
  const europe = screen.getByLabelText("Dotted map of European reporting regions");
  expect(europe).toHaveAttribute("viewBox", "94 179 250 150");
  expect(europe.closest(".geographic-map")).toBeInTheDocument();
  fireEvent.click(within(europe).getByRole("button", { name: "Zurich area · CHF 3,200" }));
  expect(scroll).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  expect(cityComparison.querySelectorAll("[data-city-selected=true]")).toHaveLength(1);
  const breakdown = screen.getByRole("button", { name: "Zurich area CHF 3,200" });
  fireEvent.click(breakdown);
  expect(scroll).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("heading", { name: "Zurich area" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "View location evidence for Zurich" }));
  const dock = screen.getByRole("complementary", { name: "Analysis details" });
  expect(within(dock).getByText("Providers · Provider A")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Emissions" }));
  expect(screen.getByRole("button", { name: "Zurich area · 8.5 kg CO₂e" })).toBeVisible();
  expect(screen.getByRole("button", { name: "EU (AI & SaaS, mixed) Unavailable" })).toBeVisible();
  expect(screen.getByRole("complementary", { name: "Analysis details" })).toBe(dock);
  fireEvent.click(screen.getByRole("button", { name: "Energy consumption" }));
  expect(screen.getByRole("button", { name: "Zurich area · 75.25 kWh" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "EU (AI & SaaS, mixed) 0 kWh" }));
  expect(within(dock).getByRole("heading", { name: "EU (AI & SaaS, mixed)" })).toBeVisible();
  expect(scroll).toHaveBeenCalledTimes(2);
});

it("keeps region slices separate and leaves failed or missing metric values unavailable", () => {
  expect(
    regionalBreakdownRows("zurich", [
      { label: "Provider A", locations: [zurich, mixed] },
      { label: "Provider B", locations: [mixed] },
      { label: "Provider C", locations: undefined },
    ]),
  ).toEqual([
    { label: "Provider A", costChf: 3200, energyKwh: 75.25, co2Kg: 8.5 },
    { label: "Provider C", costChf: null, energyKwh: null, co2Kg: null },
  ]);
  expect(
    regionalBreakdownRows("eu-mixed", [{ label: "Department A", locations: [zurich, mixed] }]),
  ).toEqual([{ label: "Department A", costChf: 900, energyKwh: 0, co2Kg: null }]);
});

it("compares three city areas with all metrics and never gives Mixed EU a marker", () => {
  render(<GeographicView locations={[zurich, mixed]} metric="costChf" onMetricChange={() => {}} />);
  const comparison = within(screen.getByRole("region", { name: "City-area comparison" }));
  expect(comparison.getAllByRole("article")).toHaveLength(3);
  expect(comparison.getByText("Zurich, Switzerland")).toBeVisible();
  expect(comparison.getByText("Frankfurt, Germany")).toBeVisible();
  expect(comparison.getByText("Dublin, Ireland")).toBeVisible();
  expect(comparison.getByText("75.25 kWh")).toBeVisible();
  expect(comparison.getByText("8.5 kg CO₂e")).toBeVisible();
  expect(comparison.getAllByText("Unavailable")).toHaveLength(6);
  expect(
    within(screen.getByLabelText("Dotted map of European reporting regions")).getAllByRole(
      "button",
    ),
  ).toHaveLength(1);
});

it("offers the five Compare groups and explains unsupported region-specific data", () => {
  render(<GeographicBreakdowns locations={[zurich, mixed]} metric="costChf" />);
  const select = screen.getByLabelText("Group by");
  expect(
    within(select)
      .getAllByRole("option")
      .map((o) => o.textContent),
  ).toEqual(["Departments", "Providers", "Tools", "Service categories", "Servers"]);
  fireEvent.change(select, { target: { value: "byTool" } });
  expect(screen.getByText(/Tools are unavailable by region/)).toBeVisible();
  fireEvent.change(select, { target: { value: "byService" } });
  expect(screen.getByText(/Service categories are unavailable by region/)).toBeVisible();
  fireEvent.change(select, { target: { value: "servers" } });
  expect(screen.getByText(/Regional server totals are unavailable/)).toBeVisible();
});

it("ranks group values with a shared full-width track, common zero and subtotal shares", () => {
  const { container } = render(
    <RegionalBars
      metric="costChf"
      rule="Regional attribution"
      rows={[
        { label: "Provider B", costChf: 10, energyKwh: 70, co2Kg: null },
        { label: "Provider A", costChf: 30, energyKwh: 40, co2Kg: 7 },
      ]}
    />,
  );
  const tracks = [...container.querySelectorAll("[data-comparison-track]")];
  expect(tracks.map((track) => track.getAttribute("data-value"))).toEqual(["30", "10"]);
  expect(
    tracks.every(
      (track) => track.classList.contains("w-full") && track.getAttribute("data-maximum") === "30",
    ),
  ).toBe(true);
  expect(screen.getByText("75.0% of subtotal")).toBeVisible();
  expect(screen.getByText("25.0% of subtotal")).toBeVisible();
  expect(screen.queryByLabelText("Category share donut")).not.toBeInTheDocument();
});
