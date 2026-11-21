import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { InspectorProvider, AnalyticalInspector } from "@/components/greenops/analytical-inspector";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("Information dock breakpoint", () => {
  it("switches triggers without closing the dock between pointerdown and click", () => {
    render(
      <InspectorProvider>
        <AnalyticalInspector title="First" trigger={<button>First details</button>}>
          First evidence
        </AnalyticalInspector>
        <AnalyticalInspector title="Second" trigger={<button>Second details</button>}>
          Second evidence
        </AnalyticalInspector>
      </InspectorProvider>,
    );
    fireEvent.click(screen.getByText("First details"));
    const dock = screen.getByLabelText("Analysis details");
    fireEvent.pointerDown(screen.getByText("Second details"));
    expect(screen.getByText("First evidence")).toBeVisible();
    fireEvent.click(screen.getByText("Second details"));
    expect(screen.getByText("Second evidence")).toBeVisible();
    expect(screen.getByLabelText("Analysis details")).toBe(dock);
    expect(dock.parentElement?.getAttribute("data-inspector")).toBe("open");
  });
  it.each([768, 1109, 1440])("keeps information in the side-panel mode at %i pixels", (width) => {
    const match = vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
      matches: width >= 768,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    render(
      <InspectorProvider>
        <AnalyticalInspector title="Resource information" trigger={<button>Information</button>}>
          <p>Resource evidence</p>
        </AnalyticalInspector>
      </InspectorProvider>,
    );
    fireEvent.click(screen.getByText("Information"));
    expect(match).toHaveBeenCalledWith("(min-width: 768px)");
    expect(screen.getByText("Resource evidence")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Back to Analysis" })).not.toBeInTheDocument();
  });
});
