import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { InspectorProvider, AnalyticalInspector } from "@/components/greenops/analytical-inspector";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("Information dock breakpoint", () => {
  it("returns through multiple nested evidence levels without losing the parent panel", () => {
    render(
      <InspectorProvider>
        <AnalyticalInspector title="Resource" trigger={<button>Open resource</button>}>
          <p>Resource summary</p>
          <AnalyticalInspector title="Measure" trigger={<button>Open measure</button>}>
            <p>Measure evidence</p>
            <AnalyticalInspector title="Calculation" trigger={<button>Open calculation</button>}>
              <p>Source formula</p>
            </AnalyticalInspector>
          </AnalyticalInspector>
        </AnalyticalInspector>
      </InspectorProvider>,
    );
    fireEvent.click(screen.getByText("Open resource"));
    fireEvent.click(screen.getByText("Open measure"));
    fireEvent.click(screen.getByText("Open calculation"));
    expect(screen.getByText("Source formula")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Back to previous details" }));
    expect(screen.getByText("Measure evidence")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Back to summary" }));
    expect(screen.getByText("Resource summary")).toBeVisible();
    expect(
      screen.getByLabelText("Analysis details").parentElement?.getAttribute("data-inspector"),
    ).toBe("open");
  });
  it("opens nested full details in the existing dock and returns to the original panel", () => {
    const onOpenChange = vi.fn();
    render(
      <InspectorProvider>
        <AnalyticalInspector
          title="Recommended package"
          trigger={<button>View Measures</button>}
          onOpenChange={onOpenChange}
        >
          <p>Package summary</p>
          <AnalyticalInspector title="GPU server" trigger={<button>View Full Details</button>}>
            <p>GPU source evidence</p>
          </AnalyticalInspector>
        </AnalyticalInspector>
      </InspectorProvider>,
    );
    fireEvent.click(screen.getByText("View Measures"));
    onOpenChange.mockClear();
    const dock = screen.getByLabelText("Analysis details");
    fireEvent.click(screen.getByText("View Full Details"));
    expect(screen.getByText("GPU source evidence")).toBeVisible();
    expect(screen.getByRole("heading", { name: "GPU server" })).toBeVisible();
    expect(screen.getByText("Package summary")).not.toBeVisible();
    expect(screen.getByLabelText("Analysis details")).toBe(dock);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByRole("button", { name: "Back to summary" }));
    expect(screen.getByText("Package summary")).toBeVisible();
    fireEvent.click(screen.getByText("View Full Details"));
    expect(screen.getByText("GPU source evidence")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Close evidence" }));
    expect(dock.parentElement?.getAttribute("data-inspector")).toBe("closed");
  });
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
