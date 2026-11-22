import { afterEach, describe, it, expect } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { AppStateProvider, useApp } from "@/lib/store";
import { saveMeasuresToPaths } from "@/lib/paths";
function Probe() {
  const { s, set, decideException } = useApp();
  return (
    <>
      <output aria-label="State">{JSON.stringify(s)}</output>
      <button onClick={() => set({ role: "ceo" })}>CEO</button>
      <button onClick={() => set({ role: "cfo" })}>CFO</button>
      <button onClick={() => set({ role: "it" })}>IT</button>
      <button onClick={() => decideException("M7", "Protected production workload", true)}>
        Approve
      </button>
      <button onClick={() => decideException("M7", "Protected production workload", false)}>
        Revoke
      </button>
      <button
        onClick={() => {
          set((state) => ({
            paths: saveMeasuresToPaths(
              state.paths,
              ["M1", "M2"],
              [],
              "A",
              { budgetChf: 16500, priority: "balanced" },
              "a",
            ).paths,
          }));
          set((state) => ({
            paths: saveMeasuresToPaths(
              state.paths,
              ["M3", "M4"],
              [],
              "A",
              { budgetChf: 16500, priority: "balanced" },
              "a",
            ).paths,
          }));
        }}
      >
        Bulk save
      </button>
    </>
  );
}
const state = () => JSON.parse(screen.getByLabelText("State").textContent ?? "{}");
afterEach(() => {
  cleanup();
  localStorage.clear();
});
describe("V7 persistent demo decisions and atomic writes", () => {
  it("only the CEO presentation role changes demo decisions", () => {
    render(
      <AppStateProvider>
        <Probe />
      </AppStateProvider>,
    );
    fireEvent.click(screen.getByText("CFO"));
    fireEvent.click(screen.getByText("Approve"));
    expect(state().demoExceptions).toEqual({});
    fireEvent.click(screen.getByText("IT"));
    fireEvent.click(screen.getByText("Approve"));
    expect(state().demoExceptions).toEqual({});
    fireEvent.click(screen.getByText("CEO"));
    fireEvent.click(screen.getByText("Approve"));
    expect(state().demoExceptions.M7.approved).toBe(true);
    expect(state().demoExceptions.M7.reason).toBe("Protected production workload");
    fireEvent.click(screen.getByText("CFO"));
    fireEvent.click(screen.getByText("Revoke"));
    expect(state().demoExceptions.M7.approved).toBe(true);
    fireEvent.click(screen.getByText("CEO"));
    fireEvent.click(screen.getByText("Revoke"));
    expect(state().demoExceptions.M7.approved).toBe(false);
  });
  it("persists approvals across reloads and role changes", () => {
    const view = render(
      <AppStateProvider>
        <Probe />
      </AppStateProvider>,
    );
    fireEvent.click(screen.getByText("CEO"));
    fireEvent.click(screen.getByText("Approve"));
    fireEvent.click(screen.getByText("CFO"));
    view.unmount();
    render(
      <AppStateProvider>
        <Probe />
      </AppStateProvider>,
    );
    expect(state().role).toBe("cfo");
    expect(state().demoExceptions.M7.approved).toBe(true);
    expect(state().demoExceptions.M7.role).toBe("ceo");
  });
  it("retains all IDs from batched functional saves and never changes Current Plan", () => {
    const view = render(
      <AppStateProvider>
        <Probe />
      </AppStateProvider>,
    );
    fireEvent.click(screen.getByText("Bulk save"));
    expect(state().paths[0].measureIds).toEqual(["M1", "M2", "M3", "M4"]);
    expect(state().measureIds).toEqual([]);
    view.unmount();
    render(
      <AppStateProvider>
        <Probe />
      </AppStateProvider>,
    );
    expect(state().paths[0].measureIds).toEqual(["M1", "M2", "M3", "M4"]);
  });
});
