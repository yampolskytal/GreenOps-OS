import { useEffect, useRef, useState, type ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Info, OctagonX, ShieldAlert, FileSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import type { Calculation, Evidence, RiskLevel, ValueKind } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { AnalyticalInspector } from "./analytical-inspector";

/** Replaceable loading animation (21st.dev component will drop in here). */
export function Loader({ label = "Loading" }: { label?: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 py-10 text-muted-foreground"
      role="status"
    >
      <div className="relative h-8 w-8">
        <span className="absolute inset-0 animate-ping rounded-full bg-primary/30" />
        <span className="absolute inset-1.5 rounded-full bg-gradient-primary" />
      </div>
      <span className="text-xs">{label}…</span>
    </div>
  );
}

export function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-dashed p-8 text-center">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
export function ErrorState({ error }: { error: unknown }) {
  return (
    <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-5 text-sm">
      <p className="font-medium text-destructive">Couldn't load this section</p>
      <p className="mt-1 text-muted-foreground">
        {error instanceof Error ? error.message : "Unknown error"}. Check that the backend is
        reachable.
      </p>
    </div>
  );
}
export function Q<T>({
  q,
  children,
  label,
}: {
  q: UseQueryResult<T>;
  children: (d: T) => ReactNode;
  label?: string;
}) {
  if (q.isPending) return <Loader {...(label ? { label } : {})} />;
  if (q.isError) return <ErrorState error={q.error} />;
  return <>{children(q.data)}</>;
}

export function DemoTag({ className }: { className?: string }) {
  if (!api.isDemo) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-warning/50 bg-warning/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-warning",
        className,
      )}
    >
      <span className="demo-stripe h-2 w-3 rounded-sm" />
      Demo
    </span>
  );
}

const kindStyle: Record<ValueKind, string> = {
  measured: "text-success",
  financial: "text-info",
  estimated: "text-warning",
  modeled: "text-forecast",
  simulated: "text-primary",
  forecast: "text-forecast",
};
const kindText: Record<ValueKind, string> = {
  measured: "Measured usage",
  financial: "From invoices",
  estimated: "Estimated",
  modeled: "Modeled",
  simulated: "Simulated",
  forecast: "Forecast",
};
export function KindTag({ kind }: { kind: ValueKind }) {
  return (
    <span className={cn("text-[10px] font-semibold uppercase tracking-wider", kindStyle[kind])}>
      {kindText[kind]}
    </span>
  );
}

export function CalcInfo({ calc, children }: { calc: Calculation; children?: ReactNode }) {
  return (
    <AnalyticalInspector
      title={calc.title}
      description={
        <>
          <KindTag kind={calc.kind} /> · {calc.period}
        </>
      }
      trigger={
        children ?? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={`How is "${calc.title}" calculated?`}
            className="rounded-full p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <Info className="h-3.5 w-3.5" />
          </Button>
        )
      }
    >
      <div className="space-y-5 px-4 pb-8 text-sm">
        <Block title="Formula">
          <code className="num block rounded-lg bg-muted p-3 text-xs leading-relaxed">
            {calc.formula}
          </code>
          <p className="mt-1 text-xs text-muted-foreground">Unit: {calc.units}</p>
        </Block>
        {calc.inputs.length > 0 && (
          <Block title="Inputs">
            <ul className="space-y-1">
              {calc.inputs.map((i) => (
                <li key={i.label} className="flex justify-between">
                  <span className="text-muted-foreground">{i.label}</span>
                  <span className="num">{i.value}</span>
                </li>
              ))}
            </ul>
          </Block>
        )}
        {calc.factors && (
          <Block title="Conversion factors (low · mid · high)">
            <ul className="space-y-2">
              {calc.factors.map((f) => (
                <li key={f.label}>
                  <div className="flex justify-between">
                    <span>{f.label}</span>
                    <span className="num">
                      {f.low} · {f.mid} · {f.high}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{f.source}</p>
                </li>
              ))}
            </ul>
          </Block>
        )}
        <Block title="Data sources">
          <div className="flex flex-wrap gap-1.5">
            {calc.sources.map((s) => (
              <span key={s} className="num rounded bg-secondary px-1.5 py-0.5 text-[11px]">
                {s}
              </span>
            ))}
          </div>
        </Block>
        <Block title="Assumptions">
          <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
            {calc.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </Block>
        <Block title="Limitations">
          <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
            {calc.limitations.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </Block>
      </div>
    </AnalyticalInspector>
  );
}
function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h4>
      {children}
    </section>
  );
}

export function EvidencePopover({
  evidence,
  label = "Evidence",
}: {
  evidence: Evidence[];
  label?: string;
}) {
  return (
    <AnalyticalInspector
      title={label}
      description="Available source references"
      trigger={
        <Button variant="ghost" size="sm">
          <FileSearch />
          {label} ({evidence.length})
        </Button>
      }
    >
      <div className="mt-5">
        <ul className="space-y-2">
          {evidence.map((e) => (
            <li key={e.source + e.detail}>
              <p className="num text-[11px] text-info">{e.source}</p>
              <p className="text-muted-foreground">{e.detail}</p>
            </li>
          ))}
        </ul>
      </div>
    </AnalyticalInspector>
  );
}

export function ChartCard({
  title,
  subtitle,
  info,
  action,
  children,
  className,
}: {
  title: string;
  subtitle?: string | undefined;
  info?: Calculation;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rise-in min-w-0 py-5", className)}>
      <header className="mb-4 flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="text-base font-semibold">{title}</h3>
            {info && <CalcInfo calc={info} />}
          </div>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function AnimatedNumber({
  value,
  format,
}: {
  value: number;
  format: (n: number) => string;
}) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 600);
      const e = 1 - Math.pow(1 - p, 3);
      setShown(a + (value - a) * e);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{format(shown)}</>;
}

export function KpiCard({
  label,
  value,
  format,
  sub,
  calc,
  kind,
  tone = "default",
  icon,
}: {
  label: string;
  value: number | null;
  format: (n: number) => string;
  sub?: string;
  calc?: Calculation;
  kind?: ValueKind;
  tone?: "default" | "good" | "warn" | "bad";
  icon?: ReactNode;
}) {
  return (
    <div className="rise-in min-w-0 border-b py-5">
      <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs font-medium">{label}</span>
        <span className="ml-auto flex items-center gap-1">
          {kind && <KindTag kind={kind} />}
          {calc && <CalcInfo calc={calc} />}
        </span>
      </div>
      <p
        className={cn(
          "num mt-3 break-words text-2xl font-semibold",
          tone === "good" && "text-success",
          tone === "warn" && "text-warning",
          tone === "bad" && "text-destructive",
        )}
      >
        {value == null || !Number.isFinite(value) ? (
          "Unavailable"
        ) : (
          <AnimatedNumber value={value} format={format} />
        )}
      </p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function TargetProgress({
  label,
  achieved,
  target,
  direction,
  unitLabel,
}: {
  label: string;
  achieved: number;
  target: number;
  direction: "atLeast" | "atMost";
  unitLabel: (n: number) => string;
}) {
  const met = direction === "atLeast" ? achieved >= target : achieved <= target;
  const scale = direction === "atLeast" ? target * 1.5 : target * 1.25;
  const w = Math.max(0, Math.min(100, (achieved / scale) * 100));
  const mark = (target / scale) * 100;
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="flex items-center gap-1.5">
          {met ? (
            <CheckCircle2 className="h-4 w-4 text-success" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-warning" />
          )}
          {label}
        </span>
        <span className="num text-xs">
          <span className={met ? "text-success" : "text-warning"}>{unitLabel(achieved)}</span>
          <span className="text-muted-foreground">
            {" "}
            {direction === "atLeast" ? "≥" : "≤"} {unitLabel(target)}
          </span>
        </span>
      </div>
      <div className="relative h-2.5 overflow-visible rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-700 ease-out",
            met ? "bg-success" : direction === "atMost" ? "bg-destructive" : "bg-warning",
          )}
          style={{ width: `${w}%` }}
        />
        <div
          className="absolute -top-1 h-4.5 w-0.5 rounded bg-foreground/80"
          style={{ left: `${mark}%` }}
          title="Target"
        />
      </div>
    </div>
  );
}

export const riskMeta: Record<RiskLevel, { label: string; cls: string; Icon: typeof ShieldAlert }> =
  {
    low: {
      label: "Low risk",
      cls: "border-success/40 bg-success/10 text-success",
      Icon: CheckCircle2,
    },
    review: {
      label: "Review required",
      cls: "border-warning/40 bg-warning/10 text-warning",
      Icon: ShieldAlert,
    },
    blocked: {
      label: "Blocked",
      cls: "border-destructive/50 bg-destructive/10 text-destructive",
      Icon: OctagonX,
    },
  };
export function RiskBadge({ level }: { level: RiskLevel }) {
  const m = riskMeta[level];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        m.cls,
      )}
    >
      <m.Icon className="h-3 w-3" />
      {m.label}
    </span>
  );
}

/** Horizontal bars — preferred over tables for rankings. */
export function BarList({
  items,
  format,
  color = "bg-primary",
}: {
  items: { label: string; value: number; hint?: string }[];
  format: (n: number) => string;
  color?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-3">
      {items.map((i) => (
        <li key={i.label}>
          <div className="mb-1 flex flex-wrap justify-between gap-2 text-sm">
            <span>
              {i.label}
              {i.hint && <span className="ml-2 text-xs text-muted-foreground">{i.hint}</span>}
            </span>
            <span className="num text-xs">{format(i.value)}</span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full transition-[width] duration-700", color)}
              style={{ width: `${(i.value / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
