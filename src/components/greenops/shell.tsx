import { reveal } from "@/lib/reveal";
import { useEffect, useState, type ReactNode } from "react";
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
import { useFindings, useMeasures, useResources, useBreakdowns } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { DataHealth } from "./data-health";
import { ChatPanel } from "./chat";
import { InspectorProvider } from "./analytical-inspector";
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
  useEffect(() => {
    const dashboardRole = ROLES.find((r) => r.to === path)?.id;
    if (dashboardRole && dashboardRole !== s.role) set({ role: dashboardRole });
  }, [path, s.role, set]);
  const hash = useRouterState({ select: (r) => r.location.hash });
  useEffect(() => {
    if (hash) reveal(hash.replace(/^#/, ""));
  }, [hash, path]);
  const collapsed = s.sidebarCollapsed;
  const nav = [
    {
      to: ROLES.find((r) => r.id === current)?.to ?? "/ceo",
      label: "Dashboard",
      Icon: LayoutDashboard,
    },
    { to: "/explore" as const, label: "Explore & Findings", Icon: Search },
    { to: "/studio" as const, label: "Optimization Studio", Icon: SlidersHorizontal },
    { to: "/current-plan" as const, label: "Current Plan", Icon: ClipboardList },
    { to: "/forecast" as const, label: "Forecasts", Icon: TrendingUp },
    { to: "/data" as const, label: "Data & Reports", Icon: Files },
  ];
  return (
    <InspectorProvider>
      <div className="greenops-shell flex min-h-screen">
        <aside
          aria-label="Main navigation"
          className={cn(
            "app-navigation",
            "sticky top-0 flex h-screen shrink-0 flex-col border-r bg-sidebar p-3 transition-[width]",
            collapsed ? "w-16" : "w-56 max-sm:w-16",
          )}
        >
          <Link to="/" className="mb-8 flex items-center gap-2 px-1 py-2" title="GreenOps OS">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary">
              <Leaf className="size-4 text-primary-foreground" />
            </span>
            {!collapsed && (
              <span className="font-display font-semibold max-lg:hidden">
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
                title={`Role: ${ROLES.find((r) => r.id === current)?.label}`}
                className={cn("bg-card", collapsed ? "w-10 px-1" : "max-sm:w-10 max-sm:px-1")}
              >
                <SelectValue>
                  {collapsed ? (
                    current.toUpperCase()
                  ) : (
                    <>
                      <span className="max-lg:hidden">
                        {ROLES.find((r) => r.id === current)?.label}
                      </span>
                      <span className="hidden max-lg:inline text-[10px]">
                        {current.toUpperCase()}
                      </span>
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
                  {!collapsed && <span className="max-lg:hidden">{n.label}</span>}
                </Link>
              </Button>
            ))}
          </nav>
          <div className="mt-auto space-y-4">
            <Button
              variant="outline"
              className="w-full justify-start max-lg:justify-center max-lg:px-0"
              title="Ask GreenOps"
              aria-label="Ask GreenOps"
              onClick={() => set({ chatOpen: true })}
            >
              <Sparkles />
              <span className={cn("max-lg:hidden", collapsed && "hidden")}>Ask GreenOps</span>
            </Button>
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
          <header className="flex flex-wrap items-center gap-3 border-b bg-background px-5 py-3 lg:px-8">
            <span className="mr-auto text-xs text-muted-foreground">
              GreenOps OS · {api.isDemo ? "Demo workspace" : "Connected workspace"}
            </span>
            <GlobalSearch />
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
            <div className="mb-8 grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
              <div className="min-w-0 flex-1">
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
        <ChatPanel />
      </div>
    </InspectorProvider>
  );
}
