import type { ComponentType, ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route as Studio } from "@/routes/studio";
import { Route as CurrentPlan } from "@/routes/current-plan";
import { SubmissionContent } from "@/routes/submission";
import { InspectorProvider } from "@/components/greenops/analytical-inspector";
import { AppStateProvider } from "@/lib/store";
import { api } from "@/lib/api/client";
import { demoOverview, demoMeasures, DEMO_BASELINE } from "@/lib/api/demo-data";
import { evaluatePackage } from "@/lib/optimizer";
import type { MarketCoverage } from "@/lib/api/types";
import { toCsv, MEASURES_HEADER } from "@/lib/api/templates";

const router = vi.hoisted(() => ({ hash: "", navigate: vi.fn() }));
const storageKey = "greenops-state-v1";
const stored = () => JSON.parse(localStorage.getItem(storageKey) ?? "{}");
const calculate = (ids: string[], budgetChf = 16500) =>
  evaluatePackage(demoMeasures, ids, DEMO_BASELINE, budgetChf, 1100);
const coverage: MarketCoverage = {
  status: "partial",
  modeledKwh: 100,
  coveredKwh: 65,
  uncoveredKwh: 35,
  allocatedCoveredKwh: 0,
  coveragePct: 65,
  missingEnergyRows: 0,
  missingFactorRows: 2,
  uncoveredRegions: [],
  sources: ["suppliers.csv"],
  factors: [],
  assumptions: ["Contract applies to covered activity"],
  missingInputs: ["Missing regional factor for supplier"],
};
const result = {
  ...calculate(["M1"]),
  savingsCo2KgMarket: 600,
  marketCoverage: coverage,
};
const originalPath = {
  id: "saved",
  name: "Existing Path",
  slot: "a",
  measureIds: ["M3"],
  budgetChf: 16500,
  priority: "balanced",
};

vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { hash: string; pathname: string } }) => unknown;
  }) => select({ location: { hash: router.hash, pathname: "/studio" } }),
  useNavigate: () => router.navigate,
  Link: ({ children, to, hash }: { children: ReactNode; to: string; hash?: string }) => (
    <a href={hash ? `${to}#${hash}` : to}>{children}</a>
  ),
}));
vi.mock("@/components/greenops/shell", () => ({
  AppShell: ({
    title,
    children,
    actions,
  }: {
    title: string;
    children: ReactNode;
    actions: ReactNode;
  }) => (
    <InspectorProvider>
      <main>
        <h1>{title}</h1>
        {actions}
        {children}
      </main>
    </InspectorProvider>
  ),
}));
vi.mock("@/components/greenops/portfolio", () => ({
  BudgetSlider: ({ value, onChange }: { value: number; onChange: (value: number) => void }) => (
    <input
      type="number"
      aria-label="Implementation budget"
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  ),
}));
vi.mock("@/components/greenops/scenario-forecast", () => ({
  ScenarioForecastPanel: ({ title }: { title: string }) => <h2>{title}</h2>,
}));
vi.mock("@/lib/queries", () => ({
  useMeasures: () => ({ data: demoMeasures }),
  useOverview: () => ({ data: demoOverview }),
  useSimulation: () => ({ data: result }),
}));
vi.mock("@/lib/path-queries", () => ({
  usePathSimulation: ({ measureIds, budgetChf }: { measureIds: string[]; budgetChf: number }) => ({
    data: {
      ...calculate(measureIds, budgetChf),
      marketCoverage: coverage,
      savingsCo2KgMarket: 600,
    },
  }),
}));
vi.mock("@/lib/reveal", () => ({ reveal: vi.fn() }));

const tab = (name: string) =>
  fireEvent.keyDown(screen.getByRole("tab", { name }), { key: "Enter" });
function page(Component: ComponentType) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AppStateProvider>
        <Component />
      </AppStateProvider>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  localStorage.setItem(
    storageKey,
    JSON.stringify({
      measureIds: ["M3"],
      budgetChf: 16500,
      priority: "balanced",
      paths: [originalPath],
    }),
  );
  vi.spyOn(api, "optimize").mockImplementation(async (_q, input) => ({
    measureIds: ["M1"],
    result: { ...result, effortChf: input.budgetChf - 1000 },
  }));
  vi.spyOn(api, "simulate").mockImplementation(async (_q, input) =>
    calculate(input.measureIds, input.budgetChf),
  );
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  router.hash = "";
  router.navigate.mockClear();
});

it("keeps recommendation actions with the settings, debounces changes, and saves a Path independently", async () => {
  page(Studio.options.component!);
  expect(screen.getAllByRole("tab").map((item) => item.textContent)).toEqual([
    "Recommendations",
    "Compare Paths",
    "All Measures",
  ]);
  const actions = within(screen.getByLabelText("Recommendation actions"));
  const save = actions.getByRole("button", { name: "Save as Path" });
  await waitFor(() => expect(save).toBeEnabled());
  const comparisons = screen.getAllByText("After recommendation");
  for (const row of comparisons)
    expect(row.parentElement?.parentElement?.nextElementSibling).toHaveTextContent("Baseline");
  expect(screen.queryByText("Projected package meets calculated targets")).not.toBeInTheDocument();
  expect(screen.queryByText("Missing regional factor for supplier")).not.toBeInTheDocument();

  fireEvent.click(actions.getByRole("button", { name: "View measures" }));
  expect(
    screen.getByRole("complementary", { name: "Recommended package · exact measures" }),
  ).toBeVisible();
  fireEvent.keyDown(document, { key: "Escape" });
  fireEvent.change(screen.getByLabelText("Implementation budget"), { target: { value: "11000" } });
  expect(save).toBeDisabled();
  expect(actions.getByRole("button", { name: "Commit as Current Plan" })).toBeDisabled();
  expect(stored()).toMatchObject({
    budgetChf: 16500,
    priority: "balanced",
    measureIds: ["M3"],
    studioSettings: { budgetChf: 11000 },
  });
  await waitFor(() => expect(save).toBeEnabled());
  expect(api.optimize).toHaveBeenCalledTimes(2);

  tab("All Measures");
  const search = screen.getByLabelText("Search recommendations");
  fireEvent.change(search, { target: { value: "GPU" } });
  tab("Recommendations");
  expect(screen.getByRole("button", { name: "Save as Path" })).toBeEnabled();
  expect(api.optimize).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole("button", { name: "Save as Path" }));
  fireEvent.change(screen.getByLabelText("Path name"), {
    target: { value: "Recommended alternative" },
  });
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Save Path" }));
  expect(screen.getByRole("tab", { name: "Compare Paths" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(stored().paths).toHaveLength(2);
  expect(stored().paths[1]).toMatchObject({
    name: "Recommended alternative",
    budgetChf: 11000,
    measureIds: ["M1"],
  });
  expect(stored().measureIds).toEqual(["M3"]);
  expect(router.navigate).toHaveBeenCalledWith({
    to: "/studio",
    hash: expect.stringMatching(/^path-/),
  });
  tab("All Measures");
  expect(screen.getByLabelText("Search recommendations")).toHaveValue("GPU");
});

it("deep-links to saved Paths, keeps compact market coverage, and commits through backend validation", async () => {
  router.hash = "#path-saved";
  page(Studio.options.component!);
  expect(screen.getByRole("tab", { name: "Compare Paths" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(screen.getByRole("complementary", { name: "Existing Path · measures" })).toBeVisible();
  expect(screen.getAllByText("Projected outcomes by Path")).toHaveLength(1);
  expect(api.optimize).not.toHaveBeenCalled();
  expect(screen.getByText(/65.0% of modeled energy covered/)).toBeVisible();
  expect(screen.queryByText("Missing regional factor for supplier")).not.toBeInTheDocument();

  fireEvent.keyDown(document, { key: "Escape" });
  fireEvent.click(screen.getByRole("button", { name: "Rename Existing Path" }));
  fireEvent.change(screen.getByLabelText("Rename Path"), { target: { value: "Edited Path" } });
  fireEvent.click(screen.getByRole("button", { name: "Save Path name" }));
  expect(stored().paths[0].name).toBe("Edited Path");
  fireEvent.click(screen.getByRole("button", { name: "Commit to Current Plan" }));
  fireEvent.click(screen.getByRole("button", { name: "Save as non-compliant Current Plan" }));
  await waitFor(() =>
    expect(router.navigate).toHaveBeenCalledWith({ to: "/current-plan", hash: "plan-summary" }),
  );
  expect(api.simulate).toHaveBeenCalledWith(expect.any(Object), {
    measureIds: ["M3"],
    budgetChf: 16500,
    chfPerPersonDay: 1100,
  });
  expect(stored().paths[0].name).toBe("Edited Path");
});

it("blocks an excluded recommendation and commits a recalculated eligible package explicitly", async () => {
  vi.mocked(api.optimize).mockResolvedValueOnce({ measureIds: ["M7"], result: calculate(["M7"]) });
  page(Studio.options.component!);
  const commit = screen.getByRole("button", { name: "Commit as Current Plan" });
  expect(await screen.findByText(/contains blocked or excluded measures/)).toBeVisible();
  expect(commit).toBeDisabled();
  expect(api.simulate).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Cost savings" }));
  await waitFor(() => expect(commit).toBeEnabled());
  fireEvent.click(commit);
  const dialog = screen.getByRole("dialog");
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Save as non-compliant Current Plan" }),
  );
  await waitFor(() => expect(stored().measureIds).toEqual(["M1"]));
  expect(stored().paths).toEqual([originalPath]);
  expect(stored().priority).toBe("cost");
});

it("opens a linked blocked measure and preserves original eligibility", () => {
  router.hash = "#measure-M7";
  page(Studio.options.component!);
  expect(screen.getByRole("tab", { name: "All Measures" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const blocked = document.getElementById("measure-M7")!;
  expect(within(blocked).getByText(/Blocked — hypothetical Path/)).toBeVisible();
  expect(screen.queryByRole("button", { name: /unblock/i })).not.toBeInTheDocument();
});

it("separates Current Plan outcomes, contributions and submission evidence", () => {
  page(CurrentPlan.options.component!);
  expect(screen.getAllByRole("tab").map((item) => item.textContent)).toEqual([
    "Overview",
    "Selected Measures",
    "Readiness & Evidence",
  ]);
  const comparison = screen.getAllByText("After Current Plan")[0]!;
  expect(comparison.parentElement?.parentElement?.nextElementSibling).toHaveTextContent("Baseline");
  expect(screen.queryByText("Challenge Targets")).not.toBeInTheDocument();
  tab("Selected Measures");
  expect(document.getElementById("measure-M3")).toBeInTheDocument();
  expect(screen.queryByText("Annual spending")).not.toBeInTheDocument();
  tab("Readiness & Evidence");
  expect(screen.getByRole("link", { name: "Submission reports and exports" })).toHaveAttribute(
    "href",
    "/submission",
  );
  expect(screen.getByText(/65.0% of modeled energy covered/)).toBeVisible();
  expect(screen.queryByText("Missing regional factor for supplier")).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "View calculation and evidence for plan readiness" }),
  );
  expect(screen.getByText("Missing regional factor for supplier")).toBeVisible();
  expect(stored().measureIds).toEqual(["M3"]);
});

it("keeps CSV validation and preparation on the official submission workflow", async () => {
  const exportMeasures = vi.spyOn(api, "exportMeasures").mockResolvedValue({
    filename: "measures.csv",
    csv: toCsv(MEASURES_HEADER, []),
    issues: ["Required approval outstanding"],
    submittable: false,
  });
  page(SubmissionContent);
  const packageCard = screen.getByText("Package of measures").closest("section")!;
  fireEvent.click(within(packageCard).getByRole("button", { name: "Check & prepare" }));
  await waitFor(() =>
    expect(exportMeasures).toHaveBeenCalledWith(
      expect.objectContaining({ from: "2025-09", to: "2026-08" }),
      ["M3"],
    ),
  );
  expect(await screen.findByText("Not ready to submit")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Download incomplete draft measures.csv" }),
  ).toBeEnabled();
});
