import type { ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Briefcase, Calculator, Server, SlidersHorizontal, Search, CalendarDays, TrendingUp, Upload, FileCheck2, Sparkles, Leaf } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api/client";
import type { Role } from "@/lib/api/types";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { DataHealth } from "./data-health";
import { ChatPanel } from "./chat";

export const ROLES: { id: Role; to: "/ceo" | "/cfo" | "/it"; label: string; Icon: typeof Briefcase }[] = [
  { id: "ceo", to: "/ceo", label: "CEO", Icon: Briefcase },
  { id: "cfo", to: "/cfo", label: "CFO", Icon: Calculator },
  { id: "it", to: "/it", label: "IT Manager", Icon: Server },
];
const TOOLS = [
  { to: "/studio", label: "Optimization Studio", Icon: SlidersHorizontal },
  { to: "/findings", label: "Waste findings", Icon: Search },
  { to: "/footprint", label: "Footprint & map", Icon: CalendarDays },
  { to: "/forecast", label: "Forecast", Icon: TrendingUp },
  { to: "/import", label: "Data import", Icon: Upload },
  { to: "/submission", label: "Submission Center", Icon: FileCheck2 },
] as const;
const RANGES = [{ v: "2025-09|2026-08", l: "Baseline year (Sep 25 – Aug 26)" }, { v: "2026-03|2026-08", l: "Last 6 months" }, { v: "2024-11|2026-08", l: "Full period" }];
const DEPTS = ["all", "Consulting", "Sales", "Finance", "Marketing", "HR", "IT", "Management"];
const PROVIDERS = ["all", "Azure", "AWS", "Swiss hoster"];

export function RoleSwitcher() {
  const { s, set } = useApp(); const navigate = useNavigate();
  const path = useRouterState({ select: (r) => r.location.pathname });
  const current = ROLES.find((r) => r.to === path)?.id ?? s.role;
  return (
    <div className="inline-flex rounded-lg border bg-surface p-0.5" role="tablist" aria-label="Role">
      {ROLES.map((r) => (
        <button key={r.id} role="tab" aria-selected={current === r.id} onClick={() => { set({ role: r.id }); navigate({ to: r.to }); }}
          className={cn("inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition", current === r.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
          <r.Icon className="h-3.5 w-3.5" />{r.label}
        </button>
      ))}
    </div>
  );
}

function Filters() {
  const { s, set } = useApp();
  const trig = "h-8 w-auto gap-1.5 border-border bg-surface text-xs";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={s.datasetVersion} onValueChange={(v) => set({ datasetVersion: v })}><SelectTrigger className={trig} aria-label="Dataset version"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="demo-v0">Dataset: demo-v0</SelectItem></SelectContent></Select>
      <Select value={`${s.from}|${s.to}`} onValueChange={(v) => { const [from, to] = v.split("|"); set({ from: from!, to: to! }); }}><SelectTrigger className={trig} aria-label="Date range"><SelectValue /></SelectTrigger><SelectContent>{RANGES.map((r) => <SelectItem key={r.v} value={r.v}>{r.l}</SelectItem>)}</SelectContent></Select>
      <Select value={s.department} onValueChange={(v) => set({ department: v })}><SelectTrigger className={trig} aria-label="Department"><SelectValue /></SelectTrigger><SelectContent>{DEPTS.map((d) => <SelectItem key={d} value={d}>{d === "all" ? "All departments" : d}</SelectItem>)}</SelectContent></Select>
      <Select value={s.provider} onValueChange={(v) => set({ provider: v })}><SelectTrigger className={trig} aria-label="Provider"><SelectValue /></SelectTrigger><SelectContent>{PROVIDERS.map((d) => <SelectItem key={d} value={d}>{d === "all" ? "All providers" : d}</SelectItem>)}</SelectContent></Select>
    </div>
  );
}

export function DemoBanner() {
  if (!api.isDemo) return null;
  return (
    <div className="flex items-center gap-3 border-b border-warning/40 bg-warning/10 px-4 py-1.5 text-xs text-warning">
      <span className="demo-stripe h-3 w-6 rounded-sm" /><b className="uppercase tracking-wider">Demo data</b>
      <span className="text-warning/80">All figures are placeholders, not results from the dataset. Connect the team backend to see real analytics.</span>
    </div>
  );
}

export function AppShell({ title, subtitle, kicker, children, actions }: { title: string; subtitle?: string; kicker: string; children: ReactNode; actions?: ReactNode }) {
  const { set } = useApp();
  const item = "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/75 transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";
  const active = { className: "!bg-sidebar-accent !text-sidebar-accent-foreground shadow-[inset_2px_0_0_var(--primary)]" };
  return (
    <div className="flex min-h-screen flex-col">
      <DemoBanner />
      <div className="flex flex-1">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-3 lg:flex">
          <Link to="/" className="mb-6 flex items-center gap-2 px-2 pt-1"><span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-primary"><Leaf className="h-4 w-4 text-primary-foreground" /></span><span className="font-display text-base font-semibold">GreenOps <span className="text-primary">OS</span></span></Link>
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Dashboards</p>
          {ROLES.map((r) => <Link key={r.to} to={r.to} onClick={() => set({ role: r.id })} className={item} activeProps={active}><r.Icon className="h-4 w-4" />{r.label}</Link>)}
          <p className="px-3 pb-1 pt-5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Workspace</p>
          {TOOLS.map((t) => <Link key={t.to} to={t.to} className={item} activeProps={active}><t.Icon className="h-4 w-4" />{t.label}</Link>)}
          <div className="mt-auto rounded-lg border border-sidebar-border p-3 text-[11px] text-muted-foreground">Plans improvements only. GreenOps OS never changes live infrastructure.</div>
        </aside>
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
            <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 lg:px-8">
              <RoleSwitcher />
              <div className="mx-1 hidden h-5 w-px bg-border md:block" />
              <Filters />
              <div className="ml-auto flex items-center gap-2">
                <DataHealth />
                <button onClick={() => set({ chatOpen: true })} className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"><Sparkles className="h-3.5 w-3.5" />Ask GreenOps</button>
              </div>
            </div>
            <nav className="flex gap-1 overflow-x-auto px-4 pb-2 lg:hidden">{TOOLS.map((t) => <Link key={t.to} to={t.to} className="shrink-0 rounded-md px-2.5 py-1 text-xs text-muted-foreground" activeProps={{ className: "bg-secondary !text-foreground" }}>{t.label}</Link>)}</nav>
          </header>
          <main className="mx-auto max-w-[1400px] px-4 py-8 lg:px-8">
            <div className="rise-in mb-8 flex flex-wrap items-end gap-4">
              <div className="flex-1"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{kicker}</p><h1 className="mt-1 text-3xl font-semibold md:text-4xl">{title}</h1>{subtitle && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>}</div>
              {actions}
            </div>
            {children}
          </main>
        </div>
      </div>
      <ChatPanel />
    </div>
  );
}
