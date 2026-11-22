import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Route as Administration } from "@/routes/ceo";
import { Route as Finance } from "@/routes/cfo";
import { Route as IT } from "@/routes/it";
import { Route as CurrentPlan } from "@/routes/current-plan";
import { InspectorProvider } from "@/components/greenops/analytical-inspector";
import { demoOverview, demoBreakdowns, demoResources } from "@/lib/api/demo-data";

const routeState = vi.hoisted(() => ({ hash: "" }));
const readBreakdowns = vi.fn(() => ({ data: demoBreakdowns }));
const readForecast = vi.fn(() => ({ isPending: true }));

vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  useRouterState: (options: { select: (state: { location: { hash: string } }) => unknown }) =>
    options.select({ location: { hash: routeState.hash } }),
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
}));
vi.mock("@/components/greenops/shell", () => ({
  AppShell: ({ title, children }: { title: string; children: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      <InspectorProvider>{children}</InspectorProvider>
    </main>
  ),
}));
vi.mock("@/components/greenops/starting-plan-notice", () => ({
  StartingPlanNotice: () => null,
  PlanningProjection: () => null,
}));
vi.mock("recharts", async (original) => ({
  ...(await original<typeof import("recharts")>()),
  ResponsiveContainer: () => null,
}));
vi.mock("@/lib/queries", () => ({
  useOverview: () => ({ data: demoOverview }),
  useSimulation: () => ({ isPending: true }),
  useForecast: () => readForecast(),
  useResources: () => ({ data: demoResources }),
  useBreakdowns: () => readBreakdowns(),
  useMeasures: () => ({ data: [], isPending: false }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  routeState.hash = "";
});

function activate(name: string) {
  fireEvent.keyDown(screen.getByRole("tab", { name }), { key: "Enter" });
}

it("shows exactly four shared tabs and mounts the Administration decision workspace on demand", () => {
  const Page = Administration.options.component!;
  render(<Page />);
  expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
    "Overview",
    "Approvals & Exceptions",
    "Spending Drivers",
    "Performance",
  ]);
  expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
  expect(screen.queryByText("All decisions")).not.toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole("tab", { name: "Approvals & Exceptions" }), { key: "Enter" });
  expect(screen.getByText("All decisions")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Management risks" })).not.toBeInTheDocument();
});

it.each([Finance, IT, CurrentPlan])("keeps the approval workspace out of %s", (route) => {
  const Page = route.options.component!;
  render(<Page />);
  expect(screen.queryByRole("heading", { name: "Approvals & Exceptions" })).not.toBeInTheDocument();
  expect(screen.queryByText("All decisions")).not.toBeInTheDocument();
});

it("mounts Finance spending only when active and restores both breakdown filters", () => {
  const Page = Finance.options.component!;
  render(<Page />);
  expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
    "Overview",
    "Spending Drivers",
    "Performance",
  ]);
  expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
  expect(
    within(screen.getByLabelText("Financial indicators")).getByText("CHF 428,000"),
  ).toBeVisible();
  expect(readBreakdowns).not.toHaveBeenCalled();
  expect(readForecast).not.toHaveBeenCalled();
  activate("Spending Drivers");
  expect(screen.getByLabelText("Category share donut")).toBeInTheDocument();
  expect(screen.queryByText("Budget & economics")).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("combobox", { name: "Comparison category" }), {
    target: { value: "byProvider" },
  });
  fireEvent.change(screen.getByRole("combobox", { name: "Comparison metric" }), {
    target: { value: "energyKwh" },
  });
  activate("Overview");
  expect(screen.queryByLabelText("Category share donut")).not.toBeInTheDocument();
  activate("Spending Drivers");
  expect(screen.getByRole("combobox", { name: "Comparison category" })).toHaveValue("byProvider");
  expect(screen.getByRole("combobox", { name: "Comparison metric" })).toHaveValue("energyKwh");
});

it("opens all IT resources in the existing dock and shares selection with Runtime & Usage", () => {
  const Page = IT.options.component!;
  render(<Page />);
  expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
    "Overview",
    "Infrastructure",
    "Runtime & Usage",
    "Performance",
  ]);
  expect(screen.queryByRole("list", { name: "Resources" })).not.toBeInTheDocument();
  activate("Infrastructure");
  const grid = within(screen.getByRole("list", { name: "Resources" }));
  const cards = grid.getAllByRole("button");
  expect(cards).toHaveLength(demoResources.length);
  fireEvent.click(cards[0]!);
  const panel = screen.getByRole("complementary", { name: demoResources[0]!.name });
  fireEvent.pointerDown(cards[1]!);
  fireEvent.click(cards[1]!);
  expect(screen.getByRole("complementary", { name: demoResources[1]!.name })).toBe(panel);
  expect(within(panel).getByText("Operational safety")).toBeVisible();
  activate("Runtime & Usage");
  expect(screen.queryByRole("list", { name: "Resources" })).not.toBeInTheDocument();
  expect(screen.getByText("Runtime versus active use")).toBeVisible();
  expect(screen.getByRole("button", { name: new RegExp(demoResources[1]!.name) })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

it("routes existing IT runtime and resource hashes to their applicable tabs", () => {
  const Page = IT.options.component!;
  routeState.hash = "#runtime";
  const runtime = render(<Page />);
  expect(screen.getByRole("tab", { name: "Runtime & Usage" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  runtime.unmount();
  routeState.hash = `#res-${demoResources[0]!.id}`;
  render(<Page />);
  expect(screen.getByRole("tab", { name: "Infrastructure" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(
    within(screen.getByRole("list", { name: "Resources" })).getAllByRole("button")[0],
  ).toHaveAttribute("aria-pressed", "true");
});

it.each([Administration, Finance, IT])(
  "uses the shared company-wide month metrics on %s",
  (route) => {
    const Page = route.options.component!;
    render(<Page />);
    expect(screen.queryByText("Monthly performance")).not.toBeInTheDocument();
    activate("Performance");
    const monthList = within(screen.getByLabelText("Inspect a monthly observation"));
    expect(monthList.getAllByRole("button")).toHaveLength(12);
    const jan = monthList.getByRole("button", { name: /^Jan 2026 / });
    fireEvent.click(jan);
    expect(screen.getByRole("heading", { name: "January 2026 — Observed results" })).toBeVisible();
    expect(
      screen
        .getAllByRole("button", { name: /View calculation and evidence for/ })
        .map((button) => button.getAttribute("aria-label")?.split(" for ")[1]),
    ).toEqual(["Cost", "Energy", "Location-based CO₂", "Market-based CO₂"]);
    fireEvent.click(
      screen.getByRole("button", { name: "View calculation and evidence for Market-based CO₂" }),
    );
    expect(screen.getByText("Annual market-based baseline (covered activity)")).toBeVisible();
    expect(screen.getByText("Projected annual savings")).toBeVisible();
    if (route !== Administration) {
      activate("Overview");
      activate("Performance");
      expect(
        screen.getByRole("heading", { name: "January 2026 — Observed results" }),
      ).toBeVisible();
      expect(
        within(screen.getByLabelText("Inspect a monthly observation")).getByRole("button", {
          name: /^Jan 2026 Market-based/,
        }),
      ).toHaveAttribute("aria-pressed", "true");
    }
  },
);
