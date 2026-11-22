import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import {
  GeographicView,
  geographicRows,
  carbonIntensityIndices,
} from "@/components/greenops/geographic-footprint";
import {
  GeographicBreakdowns,
  RegionalBars,
  regionalBreakdownRows,
} from "@/components/greenops/geographic-breakdowns";
import { InspectorProvider } from "@/components/greenops/analytical-inspector";
import { geographicDots } from "@/lib/geographic-dots";
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
    expect.objectContaining({ city: "Zurich", value: 3200 }),
    expect.objectContaining({ city: undefined, value: 900 }),
  ]);
  expect(geographicRows([mixed], "energyKwh")[0]?.value).toBe(0);
  expect(geographicRows([mixed], "co2KgLocation")[0]).toMatchObject({ value: null });
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
  expect(europe).toHaveAttribute("viewBox", "101 150 292 291");
  expect(europe.closest(".geographic-map")).toBeInTheDocument();
  fireEvent.click(within(europe).getByRole("button", { name: "Zurich area · CHF 3,200" }));
  expect(scroll).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  expect(cityComparison.querySelectorAll("[data-city-selected=true]")).toHaveLength(0);
  const breakdown = screen.getByRole("button", { name: "1 Zurich CHF 3,200" });
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

const frankfurt: LocationSummary = {
  ...zurich,
  id: "frankfurt",
  label: "Frankfurt area",
  lat: 50.11,
  lng: 8.68,
  costChf: 1600,
  energyKwh: 300,
  co2KgLocation: 42,
};
const dublin: LocationSummary = {
  ...zurich,
  id: "dublin",
  label: "Dublin area",
  lat: 53.35,
  lng: -6.26,
  costChf: 800,
  energyKwh: 150,
  co2KgLocation: 84,
};

it("keeps every city marker white and ranks each metric on a common city-only scale", () => {
  function Harness() {
    const [metric, setMetric] = useState<Parameters<typeof geographicRows>[1]>("costChf");
    return (
      <GeographicView
        locations={[zurich, frankfurt, dublin, { ...mixed, costChf: 6500 }]}
        metric={metric}
        onMetricChange={setMetric}
      />
    );
  }
  render(<Harness />);
  const map = screen.getByLabelText("Dotted map of European reporting regions");
  const list = screen.getByRole("list", { name: "Ranked mapped cities" });
  for (const [metric, order, widths] of [
    ["Cost", ["Zurich", "Frankfurt", "Dublin"], [100, 50, 25]],
    ["Emissions", ["Dublin", "Frankfurt", "Zurich"], [100, 50, (8.5 / 84) * 100]],
    ["Energy consumption", ["Frankfurt", "Dublin", "Zurich"], [100, 50, (75.25 / 300) * 100]],
  ] as const) {
    fireEvent.click(screen.getByRole("button", { name: metric }));
    expect(
      [...map.querySelectorAll('g[role="button"] circle')].map((circle) =>
        circle.getAttribute("fill"),
      ),
    ).toEqual(["#fff", "#fff", "#fff"]);
    expect(screen.queryByText(/City markers ·/)).not.toBeInTheDocument();
    const items = within(list).getAllByRole("listitem");
    items.forEach((item, index) => {
      expect(item).toHaveTextContent(new RegExp(`${index + 1}${order[index]}`));
      const track = item.querySelector("[data-location-track]")!;
      expect(track).toHaveClass("col-span-3", "w-full");
      expect(track.firstElementChild).toHaveClass("bg-success");
      expect(parseFloat((track.firstElementChild as HTMLElement).style.width)).toBeCloseTo(
        widths[index]!,
      );
    });
  }
  expect(within(list).queryByText(/Mixed/)).not.toBeInTheDocument();
});

it("calculates dimensionless indices across all three mapped regions and handles missing or zero denominators", () => {
  const regions = [
    { ...zurich, energyKwh: 100, co2KgLocation: 10 },
    { ...frankfurt, energyKwh: 200, co2KgLocation: 40 },
    { ...dublin, energyKwh: 100, co2KgLocation: 30 },
  ];
  expect([...carbonIntensityIndices([...regions, mixed]).values()]).toEqual([0.5, 1, 1.5]);
  expect(carbonIntensityIndices(regions.slice(1)).size).toBe(0);
  expect(
    carbonIntensityIndices(regions.map((region) => ({ ...region, co2KgLocation: 0 }))).size,
  ).toBe(0);
  expect(carbonIntensityIndices([{ ...regions[0]!, energyKwh: 0 }, ...regions.slice(1)]).size).toBe(
    0,
  );
  expect(
    carbonIntensityIndices([{ ...regions[0]!, co2KgLocation: Number.NaN }, ...regions.slice(1)])
      .size,
  ).toBe(0);

  render(
    <InspectorProvider>
      <GeographicView locations={regions} metric="costChf" onMetricChange={() => {}} />
    </InspectorProvider>,
  );
  const section = screen.getByRole("region", { name: "City-area comparison" });
  for (const value of ["0.50×", "1.00×", "1.50×"])
    expect(within(section).getByText(value)).toBeVisible();
  fireEvent.click(
    within(section).getAllByRole("button", { name: "Explain carbon intensity index" })[0]!,
  );
  expect(
    within(screen.getByRole("complementary", { name: "Carbon intensity index" })).getByText(
      /Mixed EU is excluded/,
    ),
  ).toBeVisible();
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
  for (const [city, country] of [
    ["Zurich", "Switzerland"],
    ["Frankfurt", "Germany"],
    ["Dublin", "Ireland"],
  ]) {
    const card = comparison.getByRole("heading", { name: country! }).closest("article")!;
    expect(within(card).getByText(city!)).toBeVisible();
    expect(card.firstElementChild?.tagName).toBe("svg");
    expect(card.children[1]?.querySelector("dl")).toBeInTheDocument();
  }
  expect(comparison.getByText("75.25 kWh")).toBeVisible();
  expect(comparison.getByText("8.5 kg CO₂e")).toBeVisible();
  expect(comparison.getAllByText("Unavailable")).toHaveLength(9);
  expect(
    within(screen.getByLabelText("Dotted map of European reporting regions")).getAllByRole(
      "button",
    ),
  ).toHaveLength(1);
});

it("offers only departments and providers and falls back for a stale selection", () => {
  render(<GeographicBreakdowns locations={[zurich, mixed]} metric="costChf" />);
  const select = screen.getByLabelText("Group by");
  expect(
    within(select)
      .getAllByRole("option")
      .map((option) => option.textContent),
  ).toEqual(["Departments", "Providers"]);
  fireEvent.change(select, { target: { value: "byDepartment" } });
  expect(select).toHaveValue("byDepartment");
  fireEvent.change(select, { target: { value: "byTool" } });
  expect(select).toHaveValue("byProvider");
});

it("includes Iberia, keeps non-focus countries gray and leaves a dark border gutter", () => {
  render(<GeographicView locations={[zurich]} metric="costChf" onMetricChange={() => {}} />);
  const map = screen.getByLabelText("Dotted map of European reporting regions");
  const dots = (code: string) => map.querySelector(`[data-country="${code}"] path:last-child`);
  for (const code of ["ESP", "PRT", "FRA", "GBR", "ITA"]) {
    expect(dots(code)).toHaveAttribute("stroke", "#73777D");
  }
  expect(dots("CHE")).toHaveAttribute("stroke", "#238A57");
  expect(dots("DEU")).toHaveAttribute("stroke", "#72C565");
  expect(dots("IRL")).toHaveAttribute("stroke", "#C5E66B");
  expect(
    map.querySelectorAll("[data-country] path:last-child:not([stroke='#73777D'])"),
  ).toHaveLength(3);
  expect(map.querySelector("[data-country='ESP'] path:first-child")).toHaveAttribute(
    "stroke",
    "#292C30",
  );
  expect(dots("ESP")).toHaveAttribute("stroke-linecap", "round");
  const square = geographicDots("M0,0 10,0 10,10 0,10Z", [0, 0, 10, 10], 2);
  expect(square).toContain("M2.00,2.00h.001");
  expect(square).not.toContain("M0.00,");
});

it("ranks group values with a shared full-width track, common zero and subtotal shares", () => {
  const { container } = render(
    <InspectorProvider>
      <RegionalBars
        metric="costChf"
        rule="Regional attribution"
        rows={[
          { label: "Provider B", costChf: 10, energyKwh: 70, co2Kg: null },
          { label: "Provider A", costChf: 30, energyKwh: 40, co2Kg: 7 },
        ]}
      />
    </InspectorProvider>,
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
  expect(screen.queryByRole("button", { name: "Methodology" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /evidence for regional attribution/i }));
  expect(
    within(screen.getByRole("complementary", { name: "Attribution methodology" })).getByText(
      "Regional attribution",
    ),
  ).toBeVisible();
});
