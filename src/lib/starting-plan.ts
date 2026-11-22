import type { GlobalQuery, OptimizeResult } from "./api/types";
import { api } from "./api/client";
import { officialQuery } from "./planning";

export const STARTING_SETTINGS = {
  budgetChf: 16500,
  priority: "balanced",
  chfPerPersonDay: 1100,
} as const;
export interface PlanInitialization {
  status: "new" | "loading" | "suggested" | "error" | "preserved" | "committed" | "cleared";
  candidate: OptimizeResult | null;
  requestId: string | null;
  error: string | null;
}
export const newInitialization = (): PlanInitialization => ({
  status: "new",
  candidate: null,
  requestId: null,
  error: null,
});
export const settledInitialization = (
  status: "preserved" | "committed" | "cleared",
): PlanInitialization => ({ status, candidate: null, requestId: null, error: null });
/** Any legacy device record belongs to an existing visitor, including deliberately empty plans. */
export function restoreInitialization(
  saved: Partial<{ initialization: PlanInitialization }>,
  hadRecord: boolean,
): PlanInitialization {
  const stored = saved.initialization;
  if (!stored) return hadRecord ? settledInitialization("preserved") : newInitialization();
  if (stored.status === "loading")
    return {
      ...newInitialization(),
      status: "error",
      error: "The previous recommendation was interrupted. Retry to prepare your strategy.",
    };
  return stored;
}
export function mayInitialize(state: {
  initialization: PlanInitialization;
  measureIds: string[];
  paths: unknown[];
  budgetChf: number;
  priority: string;
  demoExceptions: object;
}) {
  return (
    state.initialization.status === "new" &&
    state.measureIds.length === 0 &&
    state.paths.length === 0 &&
    state.budgetChf === 16500 &&
    state.priority === "balanced" &&
    Object.keys(state.demoExceptions).length === 0
  );
}
export function displayedPlan(state: {
  initialization: PlanInitialization;
  measureIds: string[];
  budgetChf: number;
  priority: string;
}) {
  const suggested =
    state.initialization.status === "suggested" && state.initialization.candidate !== null;
  return {
    measureIds: suggested ? (state.initialization.candidate?.measureIds ?? []) : state.measureIds,
    budgetChf: suggested ? STARTING_SETTINGS.budgetChf : state.budgetChf,
    suggested,
    label: suggested
      ? "Recommended starting plan"
      : ["new", "loading", "error"].includes(state.initialization.status)
        ? "Starting strategy"
        : "Current Plan",
    ready: !["new", "loading", "error"].includes(state.initialization.status),
  };
}
/** Shared cache key keeps first-time initialization and Studio from sending duplicate optimizer requests. */
export function recommendationOptions(
  q: GlobalQuery,
  budgetChf: number,
  priority: "balanced" | "cost" | "co2",
) {
  return {
    queryKey: ["recommended-package", officialQuery(q), budgetChf, priority],
    queryFn: () => api.optimize(officialQuery(q), { budgetChf, priority, chfPerPersonDay: 1100 }),
    staleTime: Infinity,
    retry: false as const,
  };
}
