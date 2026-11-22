import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppStateProvider, useApp, useDisplayedPlan } from "@/lib/store";
import { StartingPlanNotice } from "@/components/greenops/starting-plan-notice";
import { demoMeasures } from "@/lib/api/demo-data";
import { StartingPlanInitializer } from "@/components/greenops/starting-plan-initializer";
import { api } from "@/lib/api/client";
import type { OptimizeResult } from "@/lib/api/types";
import { recommendationOptions, restoreInitialization } from "@/lib/starting-plan";

const navigation = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("@tanstack/react-router", async (load) => ({
  ...(await load<typeof import("@tanstack/react-router")>()),
  useNavigate: () => navigation.navigate,
  Link: ({ children }: { children: React.ReactNode }) => <a href="/studio">{children}</a>,
}));

const KEY = "greenops-state-v1";
const candidate: OptimizeResult = {
  measureIds: ["backend-measure-42"],
  result: {
    savingsChf: 116517,
    savingsKwh: 18000,
    savingsCo2Kg: 3440,
    effortDays: 15,
    effortChf: 16500,
    costReductionPct: 25.1,
    co2ReductionPct: 43.5,
    constraints: [],
    feasible: true,
    reasons: [],
    excluded: [],
    paybackMonths: 1.7,
  },
};
const q = {
  datasetVersion: "demo-v0",
  from: "2025-09",
  to: "2026-08",
  department: "all",
  provider: "all",
};
function Probe() {
  const { s, set, commitPlan, retryInitialization } = useApp();
  const plan = useDisplayedPlan();
  return (
    <>
      <output aria-label="Status">{s.initialization.status}</output>
      <output aria-label="Displayed IDs">{plan.measureIds.join(",")}</output>
      <output aria-label="Committed IDs">{s.measureIds.join(",")}</output>
      <output aria-label="Ready">{String(plan.ready)}</output>
      <button onClick={() => set({ role: "cfo" })}>Role</button>
      <button onClick={() => set({ budgetChf: 5500, priority: "cost" })}>Settings</button>
      <button
        onClick={() => commitPlan({ measureIds: ["custom-id"], budgetChf: 5500, priority: "cost" })}
      >
        Commit custom
      </button>
      <button
        onClick={() => commitPlan({ measureIds: [], budgetChf: s.budgetChf, priority: s.priority })}
      >
        Clear
      </button>
      <button onClick={retryInitialization}>Retry</button>
    </>
  );
}
function mount(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return render(
    <QueryClientProvider client={client}>
      <AppStateProvider>
        <StartingPlanInitializer />
        <Probe />
      </AppStateProvider>
    </QueryClientProvider>,
  );
}
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("first-time backend recommendation", () => {
  it("requests Balanced, CHF 16,500 and CHF 1,100/day against the official all-entity baseline once", async () => {
    const optimize = vi.spyOn(api, "optimize").mockResolvedValue(candidate);
    mount();
    await waitFor(() => expect(screen.getByLabelText("Status")).toHaveTextContent("suggested"));
    expect(optimize).toHaveBeenCalledExactlyOnceWith(q, {
      budgetChf: 16500,
      priority: "balanced",
      chfPerPersonDay: 1100,
    });
    const request = optimize.mock.calls[0]?.[1];
    expect(request ? request.budgetChf / request.chfPerPersonDay : null).toBe(15);
    expect(screen.getByLabelText("Displayed IDs")).toHaveTextContent("backend-measure-42");
    expect(screen.getByLabelText("Committed IDs")).toBeEmptyDOMElement();
  });
  it("does not expose zero plan projections or duplicate requests while pending or switching roles", async () => {
    let resolve: ((r: OptimizeResult) => void) | undefined;
    const optimize = vi.spyOn(api, "optimize").mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    mount();
    await waitFor(() => expect(screen.getByLabelText("Status")).toHaveTextContent("loading"));
    expect(screen.getByLabelText("Ready")).toHaveTextContent("false");
    fireEvent.click(screen.getByText("Role"));
    expect(optimize).toHaveBeenCalledTimes(1);
    resolve?.(candidate);
    await waitFor(() => expect(screen.getByLabelText("Ready")).toHaveTextContent("true"));
  });
  it("shares its in-flight optimizer request with Studio", async () => {
    const optimize = vi.spyOn(api, "optimize").mockResolvedValue(candidate);
    const client = new QueryClient();
    const [a, b] = await Promise.all([
      client.fetchQuery(recommendationOptions(q, 16500, "balanced")),
      client.fetchQuery(recommendationOptions(q, 16500, "balanced")),
    ]);
    expect(a).toEqual(b);
    expect(optimize).toHaveBeenCalledTimes(1);
  });
  it("persists a suggestion without committing or approving it and reuses it after reload", async () => {
    const optimize = vi.spyOn(api, "optimize").mockResolvedValue(candidate);
    const app = mount();
    await waitFor(() => expect(screen.getByLabelText("Status")).toHaveTextContent("suggested"));
    app.unmount();
    mount();
    await waitFor(() =>
      expect(screen.getByLabelText("Displayed IDs")).toHaveTextContent("backend-measure-42"),
    );
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    expect(saved.measureIds).toEqual([]);
    expect(saved.demoExceptions).toEqual({});
    expect(saved.initialization.candidate.result).toEqual(candidate.result);
    expect(optimize).toHaveBeenCalledTimes(1);
  });
  it.each([
    ["existing committed plan", { measureIds: ["existing"] }],
    ["intentionally empty legacy plan", { measureIds: [] }],
    [
      "existing saved Path",
      {
        paths: [
          { id: "p", name: "Existing", measureIds: ["p1"], budgetChf: 16500, priority: "balanced" },
        ],
      },
    ],
    ["user optimization settings", { budgetChf: 5500, priority: "cost" }],
    [
      "existing planning decisions",
      { demoExceptions: { M1: { approved: false, reason: "Not approved", role: "ceo" } } },
    ],
  ])("never initializes over %s", async (_label, state) => {
    localStorage.setItem(KEY, JSON.stringify(state));
    const optimize = vi.spyOn(api, "optimize").mockResolvedValue(candidate);
    mount();
    await waitFor(() => expect(screen.getByLabelText("Status")).toHaveTextContent("preserved"));
    expect(optimize).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(KEY) ?? "{}")).toMatchObject(state);
  });
  it("ignores a late initialization response after a user commits a custom plan", async () => {
    let resolve: ((r: OptimizeResult) => void) | undefined;
    vi.spyOn(api, "optimize").mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    mount();
    await waitFor(() => expect(screen.getByLabelText("Status")).toHaveTextContent("loading"));
    fireEvent.click(screen.getByText("Commit custom"));
    resolve?.(candidate);
    await waitFor(() =>
      expect(screen.getByLabelText("Displayed IDs")).toHaveTextContent("custom-id"),
    );
    expect(screen.getByLabelText("Status")).toHaveTextContent("committed");
  });
  it("protects settings changed during generation from a late response", async () => {
    let resolve: ((r: OptimizeResult) => void) | undefined;
    vi.spyOn(api, "optimize").mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    mount();
    await waitFor(() => expect(screen.getByLabelText("Status")).toHaveTextContent("loading"));
    fireEvent.click(screen.getByText("Settings"));
    resolve?.(candidate);
    await waitFor(() => expect(screen.getByLabelText("Status")).toHaveTextContent("preserved"));
    expect(JSON.parse(localStorage.getItem(KEY) ?? "{}")).toMatchObject({
      budgetChf: 5500,
      priority: "cost",
      measureIds: [],
    });
  });
  it("persists deliberate clearing and never restores the suggested or committed selection", async () => {
    const optimize = vi.spyOn(api, "optimize").mockResolvedValue(candidate);
    const app = mount();
    await waitFor(() => expect(screen.getByLabelText("Status")).toHaveTextContent("suggested"));
    fireEvent.click(screen.getByText("Clear"));
    app.unmount();
    mount();
    await waitFor(() => expect(screen.getByLabelText("Status")).toHaveTextContent("cleared"));
    expect(screen.getByLabelText("Displayed IDs")).toBeEmptyDOMElement();
    expect(optimize).toHaveBeenCalledTimes(1);
  });
  it("uses no demo fallback after failure and retries only on an explicit request", async () => {
    const optimize = vi
      .spyOn(api, "optimize")
      .mockRejectedValueOnce(new Error("Backend unavailable"))
      .mockResolvedValueOnce(candidate);
    mount();
    await waitFor(() => expect(screen.getByLabelText("Status")).toHaveTextContent("error"));
    expect(screen.getByLabelText("Ready")).toHaveTextContent("false");
    expect(screen.getByLabelText("Displayed IDs")).toBeEmptyDOMElement();
    expect(optimize).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("Retry"));
    await waitFor(() => expect(screen.getByLabelText("Status")).toHaveTextContent("suggested"));
    expect(optimize).toHaveBeenCalledTimes(2);
  });
  it("does not repeat an interrupted calculation automatically on refresh", () => {
    const restored = restoreInitialization(
      {
        initialization: { status: "loading", candidate: null, error: null, requestId: "in-flight" },
      },
      true,
    );
    expect(restored.status).toBe("error");
    expect(restored.candidate).toBeNull();
  });
  it("preserves backend exclusions and numerical shortfalls without automatic approval", async () => {
    const restricted = {
      ...candidate,
      result: {
        ...candidate.result,
        feasible: false,
        co2ReductionPct: 12,
        excluded: [{ id: "protected", reason: "Human approval required" }],
        reasons: ["Location reduction is below 40%"],
      },
    };
    vi.spyOn(api, "optimize").mockResolvedValue(restricted);
    mount();
    await waitFor(() => expect(screen.getByLabelText("Status")).toHaveTextContent("suggested"));
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    expect(saved.initialization.candidate.result).toEqual(restricted.result);
    expect(saved.measureIds).toEqual([]);
    expect(saved.demoExceptions).toEqual({});
  });
  it("preserves a newly committed custom plan across provider remounts", async () => {
    const optimize = vi.spyOn(api, "optimize").mockResolvedValue(candidate);
    const app = mount();
    await waitFor(() => expect(screen.getByLabelText("Status")).toHaveTextContent("suggested"));
    fireEvent.click(screen.getByText("Commit custom"));
    app.unmount();
    mount();
    await waitFor(() =>
      expect(screen.getByLabelText("Committed IDs")).toHaveTextContent("custom-id"),
    );
    expect(optimize).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(KEY) ?? "{}")).toMatchObject({
      measureIds: ["custom-id"],
      budgetChf: 5500,
      priority: "cost",
    });
  });
});
it("confirms adoption before validating and saving the Current Plan", async () => {
  const measure = demoMeasures.find((item) => item.includable && item.risk.level !== "blocked")!;
  const recommendation = { ...candidate, measureIds: [measure.id] };
  vi.spyOn(api, "optimize").mockResolvedValue(recommendation);
  vi.spyOn(api, "getMeasures").mockResolvedValue([measure]);
  const simulate = vi.spyOn(api, "simulate").mockResolvedValue(recommendation.result);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AppStateProvider>
        <StartingPlanInitializer />
        <StartingPlanNotice />
        <Probe />
      </AppStateProvider>
    </QueryClientProvider>,
  );
  const adopt = await screen.findByRole("button", { name: "Adopt recommended plan" });
  await waitFor(() => expect(adopt).toBeEnabled());
  fireEvent.click(adopt);
  const dialog = within(screen.getByRole("dialog", { name: "Commit recommended plan?" }));
  expect(dialog.getByText(/Annual savings/)).toBeVisible();
  expect(simulate).not.toHaveBeenCalled();
  fireEvent.click(dialog.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Committed IDs")).toBeEmptyDOMElement();
  expect(simulate).not.toHaveBeenCalled();
  fireEvent.click(adopt);
  fireEvent.click(screen.getByRole("button", { name: "Commit as Current Plan" }));
  await waitFor(() => expect(screen.getByLabelText("Committed IDs")).toHaveTextContent(measure.id));
  expect(simulate).toHaveBeenCalledTimes(1);
  expect(navigation.navigate).toHaveBeenCalledWith({ to: "/current-plan", hash: "plan-summary" });
});
