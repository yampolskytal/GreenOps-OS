import type React from "react";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { GlobalQuery, Priority, Role } from "./api/types";
import { initialMeasureIds } from "./planning";
import { TARGETS } from "./optimizer";
import type { SavedPath } from "./paths";

export interface AppState {
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
}
const initial: AppState = {
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
};
const KEY = "greenops-state-v1";

type CtxValue = {
  hydrated: boolean;
  s: AppState;
  set: (p: Partial<AppState>) => void;
  commitPlan: (plan: Pick<AppState, "measureIds" | "budgetChf" | "priority">) => void;
};
// Keep one context instance across hot reloads so the provider and consumers always match.
const g = globalThis as unknown as { __greenopsCtx?: React.Context<CtxValue | null> };
const Ctx = (g.__greenopsCtx ??= createContext<CtxValue | null>(null));
const fallback: CtxValue = {
  hydrated: false,
  s: initial,
  set: () => {},
  commitPlan: () => {
    throw new Error("Plan storage unavailable");
  },
};

/** One shared state across all dashboards; persisted so role switches never reset it. */
export function AppStateProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<AppState>(initial);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setS({ ...initial, ...JSON.parse(raw), chatOpen: false });
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);
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
  const value = useMemo(
    () => ({
      hydrated: ready,
      s,
      set: (p: Partial<AppState>) => setS((x) => ({ ...x, ...p })),
      commitPlan: (plan: Pick<AppState, "measureIds" | "budgetChf" | "priority">) => {
        const next = { ...s, ...plan };
        localStorage.setItem(KEY, JSON.stringify(next));
        setS(next);
      },
    }),
    [s, ready],
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
export function toggleId(ids: string[], id: string) {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}
