import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InspectorProvider } from "@/components/greenops/analytical-inspector";
import { RuntimePanel } from "@/components/greenops/runtime-panel";
import { demoResources } from "@/lib/api/demo-data";
import type { ResourceSummary } from "@/lib/api/types";

vi.mock("@tanstack/react-router", () => ({ useRouterState: () => "" }));
vi.mock("@/lib/queries", () => ({ useMeasures: () => ({ data: [], isPending: false, isError: false }) }));

afterEach(cleanup);

describe("IT resource disclosure", () => {
  it("shows a short plain list and reveals usage only in the selected resource", () => {
    const resources: ResourceSummary[] = Array.from({ length: 8 }, (_, i) => ({
      ...demoResources[0]!, id: `resource-${i}`, name: `Resource ${i}`, runtimeH30d: 720 - i,
      activeH30d: 48, cpuAvgPct: 15,
    }));
    render(<InspectorProvider><RuntimePanel resources={resources} /></InspectorProvider>);
    const list = screen.getByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(6);
    expect(document.querySelector("[data-runtime-track]")).toBeNull();
    expect(screen.queryByText("Consumption and cost")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show 2 more resources" }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(8);
    fireEvent.click(within(list).getByRole("button", { name: /Resource 0/ }));
    expect(screen.getByText("Consumption and cost")).toBeVisible();
    expect(screen.getByText("Recorded active workload · 48 h")).toBeVisible();
    expect(document.querySelector("[data-runtime-track]")).not.toBeNull();
    expect(list.querySelector("[data-runtime-track]")).toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Show fewer resources" }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(6);
  });
});
