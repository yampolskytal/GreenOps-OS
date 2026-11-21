import type React from "react";
import { createContext, useContext, useEffect, useMemo, useState, useRef, useCallback, type ReactNode } from "react";
import type { GlobalQuery, Priority, Role, OptimizeResult } from "./api/types";
import { initialMeasureIds } from "./planning";
import { TARGETS } from "./optimizer";
import { normalizePaths, type SavedPath } from "./paths";
import { newInitialization, restoreInitialization, settledInitialization, mayInitialize, displayedPlan, type PlanInitialization } from "./starting-plan";

export interface AppState {
  initialization: PlanInitialization;
  role: Role | null;
  datasetVersion: string;
  from: string;
  to: string;
  department: string;
  provider: string;
  measureIds: string[];
  budgetChf: number;
  priority: Priority;
  chatOpen: boolean;
  theme: "dark" | "light";
  sidebarCollapsed: boolean;
  paths: SavedPath[];
  demoExceptions: Record<
    string,
    { approved: boolean; reason: string; decidedAt: string; role: "ceo" }
  >;
}
const initial: AppState = {
  initialization: newInitialization(),
  role: null,
  datasetVersion: "demo-v0",
  from: "2025-09",
  to: "2026-08",
  department: "all",
  provider: "all",
  measureIds: initialMeasureIds,
  budgetChf: TARGETS.budgetChf,
  priority: "balanced",
  chatOpen: false,
  theme: "dark",
  sidebarCollapsed: false,
  paths: [],
  demoExceptions: {},
};
const KEY = "greenops-state-v1";

type CtxValue = {
  hydrated: boolean;
  s: AppState;
  set: (p: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void;
  decideException: (measureId: string, reason: string, approved: boolean) => void;
  commitPlan: (plan: Pick<AppState, "measureIds" | "budgetChf" | "priority">) => void;
  beginInitialization: (requestId: string) => boolean;
  finishInitialization: (requestId: string, candidate: OptimizeResult | null, error: string | null) => void;
  retryInitialization: () => void;
};
// Keep one context instance across hot reloads so the provider and consumers always match.
const g = globalThis as unknown as { __greenopsCtx?: React.Context<CtxValue | null> };
const Ctx = (g.__greenopsCtx ??= createContext<CtxValue | null>(null));
const fallback: CtxValue = {
  hydrated: false,
  s: initial,
  set: () => {},
  decideException: () => {},
  beginInitialization: () => false,
  finishInitialization: () => {},
  retryInitialization: () => {},
  commitPlan: () => {
    throw new Error("Plan storage unavailable");
  },
};

/** One shared state across all dashboards; persisted so role switches never reset it. */
export function AppStateProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<AppState>(initial);
  const [ready, setReady] = useState(false);
  const current = useRef(s);
  const publish = useCallback((next: AppState, strict = false) => {
    if (strict) localStorage.setItem(KEY, JSON.stringify(next));
    current.current = next;
    setS(next);
  }, []);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        // V5 → V6 migration: keep saved Paths and the committed plan; assign stable Path colors.
        const parsed = JSON.parse(raw) as Partial<AppState>;
        publish({
          ...initial,
          ...parsed,
          paths: normalizePaths(Array.isArray(parsed.paths) ? parsed.paths : []),
          chatOpen: false,
          initialization: restoreInitialization(parsed, true),
        });
      }
    } catch {
      publish({ ...initial, initialization: settledInitialization("preserved") });
    }
    setReady(true);
  }, [publish]);
  useEffect(() => {
    if (ready) {
      try {
        localStorage.setItem(KEY, JSON.stringify(s));
      } catch {
        /* Explicit plan commits surface persistence failures separately. */
      }
    }
  }, [s, ready]);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", s.theme === "dark");
    document.documentElement.classList.toggle("light", s.theme === "light");
  }, [s.theme]);
  const set = useCallback((p: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => {
    const x = current.current;
    const patch = typeof p === "function" ? p(x) : p;
    const planningChanged = ["measureIds", "paths", "budgetChf", "priority", "demoExceptions", "from", "to", "department", "provider", "datasetVersion"].some((key) => key in patch);
    const initialization = planningChanged && ("measureIds" in patch || ["new", "loading", "error"].includes(x.initialization.status))
      ? settledInitialization("measureIds" in patch ? (patch.measureIds?.length ? "committed" : "cleared") : "preserved")
      : x.initialization;
    publish({ ...x, ...patch, initialization });
  }, [publish]);
  const beginInitialization = useCallback((requestId: string) => {
    const x = current.current;
    if (!mayInitialize(x)) return false;
    try {
      publish({ ...x, initialization: { ...newInitialization(), status: "loading", requestId } }, true);
      return true;
    } catch {
      publish({ ...x, initialization: { ...newInitialization(), status: "error", error: "Device storage is unavailable. Enable it and retry to preserve your planning decisions." } });
      return false;
    }
  }, [publish]);
  const finishInitialization = useCallback((requestId: string, candidate: OptimizeResult | null, error: string | null) => {
    const x = current.current;
    if (x.initialization.status !== "loading" || x.initialization.requestId !== requestId) return;
    const next: AppState = { ...x, initialization: { status: candidate ? "suggested" : "error", candidate, requestId: null, error } };
    try { publish(next, true); }
    catch { publish({ ...x, initialization: { ...newInitialization(), status: "error", error: "The recommendation could not be saved on this device. Retry when storage is available." } }); }
  }, [publish]);
  const retryInitialization = useCallback(() => {
    const x = current.current;
    if (x.initialization.status === "error") publish({ ...x, initialization: newInitialization() });
  }, [publish]);
  const value = useMemo(
    () => ({
      hydrated: ready,
      s,
      set,
      beginInitialization,
      finishInitialization,
      retryInitialization,
      decideException: (measureId: string, reason: string, approved: boolean) =>
        set((x) => {
          if (x.role !== "ceo") return x;
          return {
            ...x,
            demoExceptions: {
              ...x.demoExceptions,
              [measureId]: { approved, reason, role: "ceo", decidedAt: new Date().toISOString() },
            },
          };
        }),
      commitPlan: (plan: Pick<AppState, "measureIds" | "budgetChf" | "priority">) => {
        const next = { ...current.current, ...plan, initialization: settledInitialization(plan.measureIds.length ? "committed" : "cleared") };
        publish(next, true);
      },
    }),
    [s, ready, set, publish, beginInitialization, finishInitialization, retryInitialization],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useApp() {
  return useContext(Ctx) ?? fallback;
}
export function useGlobalQuery(): GlobalQuery {
  const { s } = useApp();
  return {
    datasetVersion: s.datasetVersion,
    from: s.from,
    to: s.to,
    department: s.department,
    provider: s.provider,
  };
}
export function useDisplayedPlan() {
  const { s, hydrated } = useApp();
  const plan = displayedPlan(s);
  return { ...plan, ready: hydrated && plan.ready };
}
export function toggleId(ids: string[], id: string) {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}
