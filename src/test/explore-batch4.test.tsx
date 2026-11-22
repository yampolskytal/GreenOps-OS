import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Route } from "@/routes/explore";
import { InspectorProvider } from "@/components/greenops/analytical-inspector";
import { demoBreakdowns, demoFindings, demoMeasures, demoResources } from "@/lib/api/demo-data";
import type { DailyFootprint } from "@/lib/api/types";
import type { buildFootprintGrid } from "@/lib/calendar-model";

const router = vi.hoisted(() => ({ hash: "", navigate: vi.fn() }));
const daily = vi.fn(() => ({ data: days }));
const findings = vi.fn(() => ({ data: demoFindings }));
const days: DailyFootprint[] = Array.from({ length: 365 }, (_, i) => ({
  date: new Date(Date.UTC(2025, 8, 1 + i)).toISOString().slice(0, 10),
  costChf: i === 350 ? null : i,
  co2Kg: i * 3,
  energyKwh: i * 2,
  workday: true,
  coverage: i === 349 ? "estimated" : "measured",
  contributors: [],
}));

vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { hash: string; pathname: string } }) => unknown;
  }) => select({ location: { hash: router.hash, pathname: "/explore" } }),
  useNavigate: () => router.navigate,
  Link: ({ children, to, hash }: { children: ReactNode; to: string; hash?: string }) => (
    <a href={hash ? `${to}#${hash}` : to}>{children}</a>
  ),
}));
vi.mock("@/components/greenops/shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => (
    <InspectorProvider>
      <main>{children}</main>
    </InspectorProvider>
  ),
}));
vi.mock("@/components/greenops/exploration-scope", () => ({ ExplorationScope: () => null }));
vi.mock("@/lib/queries", () => ({
  useDaily: () => daily(),
  useBonus: () => ({ isPending: true }),
  useBreakdowns: () => ({ data: demoBreakdowns }),
  useResources: () => ({ data: demoResources }),
  useFindings: () => findings(),
  useMeasures: () => ({ data: demoMeasures }),
}));
vi.mock("@/components/greenops/contribution-skyline", () => ({
  default: ({
    footprintGrid,
    selectedDate,
    onCellClick,
    palette,
  }: {
    footprintGrid: ReturnType<typeof buildFootprintGrid>;
    selectedDate: string | null;
    onCellClick: (day: { date: string }) => void;
    palette: string[];
  }) => (
    <div
      data-testid="calendar-grid"
      data-weeks={footprintGrid.weeks}
      data-palette={palette.join(",")}
    >
      {footprintGrid.cells
        .filter((cell) =>
          [
            "2025-09-01",
            "2025-09-02",
            "2026-07-16",
            "2026-08-14",
            "2026-08-17",
            "2026-08-31",
          ].includes(cell.date),
        )
        .map((cell) => (
          <button
            key={cell.date}
            onClick={() => onCellClick(cell)}
            aria-label={`Day ${cell.date}`}
            aria-pressed={cell.date === selectedDate}
            data-level={cell.level}
            data-missing={cell.missing}
            data-height={cell.count}
            data-color={cell.colorCount}
          />
        ))}
    </div>
  ),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  router.hash = "";
});

const Page = Route.options.component!;
const tab = (name: string) =>
  fireEvent.keyDown(screen.getByRole("tab", { name }), { key: "Enter" });
const day = (date: string) => screen.getByRole("button", { name: `Day ${date}` });

it("keeps a compact cross-month range, updates the dock in place, and clears out-of-range observations", () => {
  render(<Page />);
  expect(screen.getAllByRole("tab").map((item) => item.textContent)).toEqual([
    "Digital Footprint",
    "Compare",
    "Waste Findings",
  ]);
  expect(screen.getByRole("button", { name: "Official baseline year" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(findings).not.toHaveBeenCalled();
  fireEvent.click(day("2025-09-01"));
  const panel = screen.getByRole("complementary", { name: "2025-09-01" });
  fireEvent.pointerDown(day("2025-09-02"));
  fireEvent.click(day("2025-09-02"));
  expect(screen.getByRole("complementary", { name: "2025-09-02" })).toBe(panel);
  fireEvent.click(screen.getByRole("button", { name: "Last 30 days" }));
  expect(panel).toBeVisible();
  expect(within(panel).getByText(/outside the current range/)).toBeVisible();
  expect(screen.getByRole("button", { name: "Last 30 days" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByTestId("calendar-grid")).toHaveAttribute("data-weeks", "7");
  expect(screen.getByTestId("calendar-grid").closest("[data-compact]")).not.toBeNull();
  expect(screen.getByTestId("calendar-grid")).toHaveAttribute(
    "data-palette",
    "var(--heat-1),var(--heat-2),var(--heat-3),var(--heat-4)",
  );
  fireEvent.click(screen.getByRole("button", { name: "3D skyline" }));
  const target = day("2026-08-31");
  expect(target).toHaveAttribute("data-height", "364");
  expect(target).toHaveAttribute("data-color", "1092");
  expect(day("2026-08-17")).toHaveAttribute("data-missing", "true");
  fireEvent.click(target);
  expect(target).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("complementary", { name: "2026-08-31" })).toBe(panel);
  fireEvent.change(screen.getByLabelText("Footprint from date"), {
    target: { value: "2026-08-12" },
  });
  expect(screen.getByRole("button", { name: "Last 30 days" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  tab("Compare");
  expect(screen.queryByTestId("calendar-grid")).not.toBeInTheDocument();
  tab("Digital Footprint");
  expect(screen.getByLabelText("Footprint from date")).toHaveValue("2026-08-12");
  expect(day("2026-08-31")).toHaveAttribute("aria-pressed", "true");
  fireEvent.change(screen.getByLabelText("Footprint to date"), { target: { value: "2026-08-14" } });
  fireEvent.change(screen.getByLabelText("Footprint from date"), {
    target: { value: "2026-07-16" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Flat heat map" }));
  expect(screen.getByTestId("calendar-grid")).toHaveAttribute("data-weeks", "7");
  expect(day("2026-07-16")).toBeInTheDocument();
  expect(day("2026-08-14")).toBeInTheDocument();
});

it("uses linked comparison settings and retains full-denominator shares while searching", () => {
  router.hash = "#compare-byProvider-costChf";
  render(<Page />);
  expect(screen.getByRole("tab", { name: "Compare" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByLabelText("Comparison category")).toHaveValue("byProvider");
  expect(daily).not.toHaveBeenCalled();
  const legend = screen.getByRole("group", { name: "Categories and shares" });
  const first = within(legend).getAllByRole("button")[0]!;
  const text = first.textContent;
  const name = demoBreakdowns.byProvider.reduce((a, b) =>
    (a.costChf ?? 0) > (b.costChf ?? 0) ? a : b,
  ).label;
  fireEvent.change(screen.getByRole("textbox", { name: "Search comparison" }), {
    target: { value: name },
  });
  expect(within(legend).getAllByRole("button")[0]?.textContent).toBe(text);
  fireEvent.change(screen.getByRole("textbox", { name: "Search comparison" }), {
    target: { value: "" },
  });
  fireEvent.change(screen.getByLabelText("Comparison category"), { target: { value: "servers" } });
  expect(screen.getByLabelText("Category share donut")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Comparison metric"), { target: { value: "cpuAvgPct" } });
  expect(screen.getByText(/cannot be summed into shares/)).toBeVisible();
  expect(screen.queryByLabelText("Category share donut")).not.toBeInTheDocument();
});

it("discloses three ranked findings, preserves filters and actions, and keeps blocked measures out of Path actions", () => {
  render(<Page />);
  tab("Waste Findings");
  const items = () => document.querySelectorAll("[id^='finding-']");
  expect(items()).toHaveLength(3);
  expect(screen.getAllByRole("button", { name: "Add to Paths" }).length).toBeGreaterThan(0);
  expect(screen.getAllByRole("link", { name: "Review optimization" })[0]).toHaveAttribute(
    "href",
    expect.stringMatching(/^\/studio#measure-/),
  );
  fireEvent.click(
    screen.getByRole("button", { name: `Show ${demoFindings.length - 3} more findings` }),
  );
  expect(items()).toHaveLength(demoFindings.length);
  fireEvent.click(screen.getByRole("button", { name: "Show less" }));
  expect(items()).toHaveLength(3);
  fireEvent.change(screen.getByLabelText("Show findings"), { target: { value: "blocked" } });
  expect(items().length).toBeGreaterThan(0);
  expect(screen.queryByRole("button", { name: "Add to Paths" })).not.toBeInTheDocument();
  tab("Compare");
  tab("Waste Findings");
  expect(screen.getByLabelText("Show findings")).toHaveValue("blocked");
  fireEvent.change(screen.getByLabelText("Search findings"), {
    target: { value: "no matching source" },
  });
  expect(items()).toHaveLength(0);
  expect(screen.getByRole("status")).toHaveTextContent("No findings match");
  expect(screen.queryByRole("button", { name: /more findings/ })).not.toBeInTheDocument();
});
