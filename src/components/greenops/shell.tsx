import { useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Briefcase,
  Calculator,
  Server,
  SlidersHorizontal,
  Search,
  TrendingUp,
  Files,
  Sparkles,
  Leaf,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Moon,
  Sun,
  ClipboardList,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { api } from "@/lib/api/client";
import type { Role } from "@/lib/api/types";
import { useApp } from "@/lib/store";
import {
  useFindings,
  useMeasures,
  useResources,
  useSimulation,
  useBreakdowns,
  useQuality,
} from "@/lib/queries";
import { cn } from "@/lib/utils";
import { chf, kg, kwh } from "@/lib/format";
import { DataHealth } from "./data-health";
import { ChatPanel } from "./chat";
import { DetailDrawer } from "./details";
import { MeasureCard } from "./measure-card";
import { TargetPanel } from "./targets";
import { Q } from "./ui";
export const ROLES: {
  id: Role;
  to: "/ceo" | "/cfo" | "/it";
  label: string;
  Icon: typeof Briefcase;
}[] = [
  { id: "ceo", to: "/ceo", label: "CEO", Icon: Briefcase },
  { id: "cfo", to: "/cfo", label: "CFO", Icon: Calculator },
  { id: "it", to: "/it", label: "IT Manager", Icon: Server },
];
function Filters() {
  const { s, set } = useApp();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({
    from: s.from,
    to: s.to,
    department: s.department,
    provider: s.provider,
    datasetVersion: s.datasetVersion,
  });
  const quality = useQuality();
  const b = useBreakdowns();
  const count = Number(s.department !== "all") + Number(s.provider !== "all");
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o)
          setDraft({
            from: s.from,
            to: s.to,
            department: s.department,
            provider: s.provider,
            datasetVersion: s.datasetVersion,
          });
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <SlidersHorizontal />
          Filters{count > 0 && <span className="num">{count}</span>}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reporting filters</DialogTitle>
          <DialogDescription>
            Display selections are shared across roles. Official submissions keep the baseline year.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {[
            {
              key: "department" as const,
              label: "Department",
              options: [
                ["all", "All departments"],
                ...(b.data?.byDepartment.map((d) => [d.label, d.label]) ?? []),
              ],
            },
            {
              key: "provider" as const,
              label: "Provider",
              options: [
                ["all", "All providers"],
                ...(b.data?.byProvider.map((d) => [d.label, d.label]) ?? []),
              ],
            },
            {
              key: "datasetVersion" as const,
              label: "Dataset",
              options: [
                [
                  quality.data?.version ?? s.datasetVersion,
                  quality.data?.version ?? s.datasetVersion,
                ],
              ],
            },
          ].map((field) => (
            <label key={field.key} className="block text-sm">
              {field.label}
              <Select
                value={draft[field.key]}
                onValueChange={(v) => setDraft((d) => ({ ...d, [field.key]: v }))}
              >
                <SelectTrigger className="mt-1" aria-label={field.label}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {field.options.map(([v, l]) => (
                    <SelectItem key={v} value={v ?? ""}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          ))}
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              From
              <Input
                type="month"
                value={draft.from}
                onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
              />
            </label>
            <label className="text-sm">
              To
              <Input
                type="month"
                value={draft.to}
                onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
              />
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() =>
              setDraft({
                ...draft,
                from: "2025-09",
                to: "2026-08",
                department: "all",
                provider: "all",
              })
            }
          >
            Reset
          </Button>
          <Button
            disabled={!draft.from || !draft.to || draft.from > draft.to}
            onClick={() => {
              set(draft);
              setOpen(false);
            }}
          >
            Apply
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
function GlobalSearch() {
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const rs = useResources(),
    ms = useMeasures(),
    fs = useFindings(),
    br = useBreakdowns();
  const navigate = useNavigate();
  const results = [
    ...(rs.data ?? []).map((r) => ({
      label: r.name,
      type: "Resource",
      to: "/it" as const,
      hash: `res-${r.id}`,
    })),
    ...(ms.data ?? []).map((m) => ({
      label: m.title,
      type: "Recommendation",
      to: "/studio" as const,
      hash: `measure-${m.id}`,
    })),
    ...(fs.data ?? []).map((f) => ({
      label: f.title,
      type: "Finding",
      to: "/explore" as const,
      hash: `finding-${f.id}`,
    })),
    ...(br.data ? [...br.data.byDepartment, ...br.data.byProvider, ...br.data.byTool] : []).map(
      (b) => ({ label: b.label, type: "Comparison", to: "/explore" as const, hash: "compare" }),
    ),
    ...[
      "Footprint calendar",
      "Runtime versus active use",
      "Monthly performance",
      "Projected targets",
    ].map((label, i) => ({
      label,
      type: "Analysis",
      to: i === 0 ? ("/explore" as const) : i === 1 ? ("/it" as const) : ("/ceo" as const),
      hash: i === 0 ? "footprint" : i === 1 ? "runtime" : i === 2 ? "monthly" : "targets",
    })),
  ].filter((r) => term.trim() && r.label.toLowerCase().includes(term.toLowerCase()));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Search GreenOps" title="Search">
          <Search />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Search GreenOps</DialogTitle>
          <DialogDescription>
            Resources, findings, recommendations and available analysis
          </DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          aria-label="Global search"
          placeholder="Search company data…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
        <div className="max-h-80 overflow-y-auto">
          {results.slice(0, 15).map((r, i) => (
            <Button
              key={r.type + r.label + i}
              variant="ghost"
              className="h-auto w-full justify-between whitespace-normal py-3 text-left"
              onClick={() => {
                setOpen(false);
                void navigate({ to: r.to, hash: r.hash });
              }}
            >
              <span>{r.label}</span>
              <span className="ml-3 text-xs text-muted-foreground">{r.type}</span>
            </Button>
          ))}
          {term && !results.length && (
            <p className="py-5 text-sm text-muted-foreground">No matching content</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
function CurrentPlan({ collapsed }: { collapsed: boolean }) {
  const { s } = useApp();
  const ms = useMeasures(),
    sim = useSimulation();
  return (
    <DetailDrawer
      title="Current optimization plan"
      description="Selected proposals, not executed changes"
      trigger={
        <Button
          variant="outline"
          className={cn(
            "w-full",
            collapsed ? "px-0" : "justify-start max-sm:justify-center max-sm:px-0",
          )}
          title="Current Plan"
        >
          <ClipboardList />
          {!collapsed && (
            <span className="flex min-w-0 flex-1 items-center max-sm:hidden">
              Current Plan <span className="num ml-auto">{s.measureIds.length}</span>
            </span>
          )}
        </Button>
      }
    >
      <Q q={sim}>
        {(r) => (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-muted-foreground">Annual savings</p>
                <p className="num">{chf(r.savingsChf)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Implementation</p>
                <p className="num">
                  {chf(r.effortChf)} · {r.effortDays} PD
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">CO₂ benefit</p>
                <p className="num">{kg(r.savingsCo2Kg)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Energy benefit</p>
                <p className="num">{kwh(r.savingsKwh)}</p>
              </div>
            </div>
            <TargetPanel r={r} />
          </>
        )}
      </Q>
      <Q q={ms}>
        {(all) => (
          <div className="space-y-3">
            {all
              .filter((m) => s.measureIds.includes(m.id))
              .map((m) => (
                <MeasureCard key={m.id} m={m} compact />
              ))}
            {!s.measureIds.length && <p className="text-muted-foreground">No measures selected.</p>}
          </div>
        )}
      </Q>
    </DetailDrawer>
  );
}
export function DemoBanner() {
  return api.isDemo ? (
    <div className="flex items-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-1.5 text-xs text-warning">
      <span className="demo-stripe h-3 w-4 shrink-0 rounded" />
      <b>DEMO</b>
      <span>Illustrative data · not source-backed company results</span>
    </div>
  ) : null;
}
export function AppShell({
  title,
  subtitle,
  kicker,
  children,
  actions,
}: {
  title: string;
  subtitle?: string;
  kicker: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const { s, set } = useApp();
  const navigate = useNavigate();
  const path = useRouterState({ select: (r) => r.location.pathname });
  const current = ROLES.find((r) => r.to === path)?.id ?? s.role ?? "ceo";
  const collapsed = s.sidebarCollapsed;
  const nav = [
    {
      to: ROLES.find((r) => r.id === current)?.to ?? "/ceo",
      label: "Dashboard",
      Icon: LayoutDashboard,
    },
    { to: "/explore" as const, label: "Explore & Findings", Icon: Search },
    { to: "/studio" as const, label: "Optimization Studio", Icon: SlidersHorizontal },
    { to: "/forecast" as const, label: "Forecasts", Icon: TrendingUp },
    { to: "/data" as const, label: "Data & Reports", Icon: Files },
  ];
  return (
    <div className="flex min-h-screen">
      <aside
        className={cn(
          "sticky top-0 flex h-screen shrink-0 flex-col border-r bg-sidebar p-3 transition-[width]",
          collapsed ? "w-16" : "w-56 max-sm:w-16",
        )}
      >
        <Link to="/" className="mb-8 flex items-center gap-2 px-1 py-2" title="GreenOps OS">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary">
            <Leaf className="size-4 text-primary-foreground" />
          </span>
          {!collapsed && (
            <span className="font-display font-semibold max-sm:hidden">
              GreenOps <span className="text-primary">OS</span>
            </span>
          )}
        </Link>
        <div className="mb-8">
          <Select
            value={current}
            onValueChange={(v) => {
              const r = ROLES.find((x) => x.id === v);
              if (r) {
                set({ role: r.id });
                void navigate({ to: r.to });
              }
            }}
          >
            <SelectTrigger
              aria-label="Presentation role"
              className={cn("bg-card", collapsed ? "w-10 px-1" : "max-sm:w-10 max-sm:px-1")}
            >
              <SelectValue>
                {collapsed ? (
                  current.toUpperCase()
                ) : (
                  <>
                    <span className="max-sm:hidden">
                      {ROLES.find((r) => r.id === current)?.label}
                    </span>
                    <span className="hidden max-sm:inline">{current.toUpperCase()}</span>
                  </>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <nav className="space-y-2">
          {nav.map((n) => (
            <Button
              key={n.label}
              asChild
              variant="ghost"
              className={cn(
                "h-11 w-full justify-start px-3",
                path === n.to && "bg-card text-primary",
                collapsed && "justify-center px-0",
              )}
            >
              <Link to={n.to} title={n.label}>
                <n.Icon className="size-4 shrink-0" />
                {!collapsed && <span className="max-sm:hidden">{n.label}</span>}
              </Link>
            </Button>
          ))}
        </nav>
        <div className="mt-auto space-y-4">
          <CurrentPlan collapsed={collapsed} />
          <Button
            variant="ghost"
            size="icon"
            className="w-full"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => set({ sidebarCollapsed: !collapsed })}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </Button>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <DemoBanner />
        <header className="sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b bg-background/95 px-5 py-3 backdrop-blur lg:px-8">
          <span className="mr-auto text-xs text-muted-foreground">
            {s.from} — {s.to}
          </span>
          <GlobalSearch />
          <Filters />
          <DataHealth />
          <Button
            variant="ghost"
            size="icon"
            title={s.theme === "dark" ? "Light theme" : "Dark theme"}
            aria-label={s.theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            onClick={() => set({ theme: s.theme === "dark" ? "light" : "dark" })}
          >
            {s.theme === "dark" ? <Sun /> : <Moon />}
          </Button>
        </header>
        <main className="mx-auto max-w-[1400px] px-5 pb-24 pt-8 lg:px-8">
          <div className="mb-8 flex flex-wrap items-end gap-4">
            <div className="flex-1">
              <p className="text-xs font-semibold text-primary">{kicker}</p>
              <h1 className="mt-2 text-3xl font-semibold">{title}</h1>
              {subtitle && (
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>
              )}
            </div>
            {actions}
          </div>
          {children}
        </main>
      </div>
      <Button
        className="fixed bottom-6 right-6 z-40 h-12 rounded-full shadow-lg"
        onClick={() => set({ chatOpen: true })}
      >
        <Sparkles />
        AI Copilot
      </Button>
      <ChatPanel />
    </div>
  );
}
