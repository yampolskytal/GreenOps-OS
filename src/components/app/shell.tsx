import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Leaf } from "lucide-react";
import { api } from "@/lib/api/client";
import type { Finding } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const tabs = [
  { to: "/ceo", label: "CEO", sub: "Target & package" },
  { to: "/cfo", label: "CFO", sub: "Costs & allocation" },
  { to: "/it", label: "IT Manager", sub: "Resources & limits" },
] as const;

export function MockBanner() {
  if (!api.isMock) return null;
  return (
    <div className="flex items-center gap-3 border-b border-warning bg-warning/20 px-6 py-1.5 text-xs text-warning-foreground">
      <span className="mock-stripe h-3 w-6 rounded-sm" />
      <span className="font-medium uppercase tracking-wider">Mock data</span>
      <span>Placeholder values — not calculated from the dataset. Set VITE_API_BASE_URL to connect the backend.</span>
    </div>
  );
}

export function AppShell({ title, kicker, children }: { title: string; kicker: string; children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <MockBanner />
      <header className="border-b bg-ink text-ink-foreground">
        <div className="mx-auto flex max-w-7xl items-center gap-8 px-6 py-3">
          <Link to="/" className="flex items-center gap-2 font-display text-lg">
            <Leaf className="h-5 w-5 text-chart-2" /> GreenLedger
          </Link>
          <nav className="flex gap-1">
            {tabs.map((t) => (
              <Link key={t.to} to={t.to} className="rounded-md px-3 py-1.5 text-sm opacity-70 transition hover:opacity-100"
                activeProps={{ className: "bg-primary !opacity-100" }}>
                {t.label}
              </Link>
            ))}
          </nav>
          <span className="ml-auto text-xs opacity-60">Baseline Sep 2025 – Aug 2026 · location-based CO₂</span>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">{kicker}</p>
        <h1 className="mb-8 mt-1 text-4xl">{title}</h1>
        {children}
      </main>
    </div>
  );
}

export function Kpi({ label, value, hint, tone = "default" }: { label: string; value: string; hint?: string; tone?: "default" | "good" | "bad" }) {
  return (
    <div className="panel p-5">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("num mt-2 text-2xl font-medium", tone === "good" && "text-primary", tone === "bad" && "text-destructive")}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Panel({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("panel p-5", className)}>
      <h2 className="mb-4 text-lg">{title}</h2>
      {children}
    </section>
  );
}

const kindLabel: Record<Finding["kind"], string> = { waste: "Waste", contradiction: "Contradiction", "protection-window": "Protection window", handover: "Human decision" };
export function FindingList({ items }: { items: Finding[] }) {
  return (
    <ul className="space-y-3">
      {items.map((f) => (
        <li key={f.id} className={cn("border-l-2 pl-3", f.severity === "high" ? "border-destructive" : f.severity === "medium" ? "border-warning" : "border-chart-2")}>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{kindLabel[f.kind]}</p>
          <p className="font-medium">{f.title}</p>
          <p className="text-sm text-muted-foreground">{f.detail}</p>
          <p className="num mt-1 text-[11px] text-muted-foreground">{f.sources.join(" · ")}</p>
        </li>
      ))}
    </ul>
  );
}

export function Meter({ label, value, target }: { label: string; value: number; target: number }) {
  const ok = value >= target;
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm"><span>{label}</span><span className={cn("num", ok ? "text-primary" : "text-destructive")}>{value.toFixed(1)}% / {target}%</span></div>
      <div className="relative h-2.5 rounded-full bg-muted">
        <div className={cn("h-full rounded-full", ok ? "bg-primary" : "bg-destructive")} style={{ width: `${Math.min(100, (value / (target * 1.5)) * 100)}%` }} />
        <div className="absolute top-[-3px] h-4 w-0.5 bg-foreground" style={{ left: `${100 / 1.5}%` }} />
      </div>
    </div>
  );
}
