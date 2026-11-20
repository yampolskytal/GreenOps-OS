import type React from "react";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { GlobalQuery, Priority, Role } from "./api/types";
import { DEMO_DEFAULT_PACKAGE } from "./api/demo-data";
import { TARGETS } from "./optimizer";

export interface AppState {
  role: Role | null;
  datasetVersion: string;
  from: string; to: string;
  department: string; provider: string;
  measureIds: string[];
  budgetChf: number;
  priority: Priority;
  chatOpen: boolean;
}
const initial: AppState = { role: null, datasetVersion: "demo-v0", from: "2025-09", to: "2026-08", department: "all", provider: "all", measureIds: DEMO_DEFAULT_PACKAGE, budgetChf: TARGETS.budgetChf, priority: "balanced", chatOpen: false };
const KEY = "greenops-state-v1";

type CtxValue = { s: AppState; set: (p: Partial<AppState>) => void };
// Keep one context instance across hot reloads so the provider and consumers always match.
const g = globalThis as unknown as { __greenopsCtx?: React.Context<CtxValue | null> };
const Ctx = (g.__greenopsCtx ??= createContext<CtxValue | null>(null));
const fallback: CtxValue = { s: initial, set: () => {} };

/** One shared state across all dashboards; persisted so role switches never reset it. */
export function AppStateProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<AppState>(initial);
  const [ready, setReady] = useState(false);
  useEffect(() => { try { const raw = localStorage.getItem(KEY); if (raw) setS({ ...initial, ...JSON.parse(raw), chatOpen: false }); } catch { /* ignore */ } setReady(true); }, []);
  useEffect(() => { if (ready) localStorage.setItem(KEY, JSON.stringify(s)); }, [s, ready]);
  const value = useMemo(() => ({ s, set: (p: Partial<AppState>) => setS((x) => ({ ...x, ...p })) }), [s]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useApp() { return useContext(Ctx) ?? fallback; }
export function useGlobalQuery(): GlobalQuery { const { s } = useApp(); return { datasetVersion: s.datasetVersion, from: s.from, to: s.to, department: s.department, provider: s.provider }; }
export function toggleId(ids: string[], id: string) { return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]; }
