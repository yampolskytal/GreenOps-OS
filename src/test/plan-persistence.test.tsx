import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { AppStateProvider, useApp } from "@/lib/store";
import { useState } from "react";
function CommitProbe() {
  const { s, commitPlan } = useApp();
  const [error, setError] = useState(false);
  return (
    <>
      <output aria-label="Saved plan">{s.measureIds.join(",")}</output>
      {error && <span role="alert">Storage failed</span>}
      <button
        onClick={() => {
          try {
            commitPlan({ measureIds: ["M1"], budgetChf: 16500, priority: "balanced" });
          } catch {
            setError(true);
          }
        }}
      >
        Commit
      </button>
    </>
  );
}
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});
describe("explicit Current Plan persistence", () => {
  it("persists the committed measure before updating the shared view", () => {
    render(
      <AppStateProvider>
        <CommitProbe />
      </AppStateProvider>,
    );
    fireEvent.click(screen.getByText("Commit"));
    expect(screen.getByLabelText("Saved plan")).toHaveTextContent("M1");
    const stored = JSON.parse(localStorage.getItem("greenops-state-v1") ?? "{}");
    expect(stored.measureIds).toEqual(["M1"]);
    expect(stored.budgetChf).toBe(16500);
  });
  it("does not update the Current Plan if persistence fails", () => {
    render(
      <AppStateProvider>
        <CommitProbe />
      </AppStateProvider>,
    );
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    fireEvent.click(screen.getByText("Commit"));
    expect(screen.getByLabelText("Saved plan")).toBeEmptyDOMElement();
    expect(screen.getByRole("alert")).toHaveTextContent("Storage failed");
  });
});
