import { useMemo, useState } from "react";
import type { DailyFootprint } from "@/lib/api/types";
import { chf, kg, kwh } from "@/lib/format";
import { cn } from "@/lib/utils";

export type CalMetric = "co2Kg" | "costChf" | "energyKwh";
const FMT: Record<CalMetric, (n: number) => string> = { co2Kg: kg, costChf: chf, energyKwh: kwh };
const HUE: Record<CalMetric, string> = { co2Kg: "var(--success)", costChf: "var(--info)", energyKwh: "var(--primary)" };
const WD = ["Mon", "", "Wed", "", "Fri", "", "Sun"];

/** Contribution-style daily heatmap. Daily values are allocated/estimated from coarser sources — labelled as such. */
export function FootprintCalendar({ days, metric }: { days: DailyFootprint[]; metric: CalMetric }) {
  const [view, setView] = useState<"year" | "month">("year");
  const months = useMemo(() => Array.from(new Set(days.map((d) => d.date.slice(0, 7)))), [days]);
  const [month, setMonth] = useState(months[months.length - 1] ?? "");
  const [sel, setSel] = useState<DailyFootprint | null>(null);
  const shown = view === "year" ? days : days.filter((d) => d.date.startsWith(month));
  const max = Math.max(1, ...days.map((d) => d[metric])); const min = Math.min(...days.map((d) => d[metric]));
  const weeks = useMemo(() => {
    const out: (DailyFootprint | null)[][] = []; let wk: (DailyFootprint | null)[] = [];
    shown.forEach((d, i) => { const dow = (new Date(`${d.date}T00:00:00Z`).getUTCDay() + 6) % 7; if (i === 0) wk = Array(dow).fill(null); wk.push(d); if (dow === 6) { out.push(wk); wk = []; } });
    if (wk.length) out.push(wk); return out;
  }, [shown]);
  const idx = sel ? days.findIndex((d) => d.date === sel.date) : -1;
  const around = idx >= 0 ? days.slice(Math.max(0, idx - 3), idx + 4).filter((d) => d.date !== sel?.date) : [];
  const avg = around.length ? around.reduce((a, d) => a + d[metric], 0) / around.length : 0;
  const cell = view === "year" ? "h-3 w-3 rounded-[3px]" : "h-9 w-9 rounded-md";
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
      <div className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {(["year", "month"] as const).map((v) => <button key={v} onClick={() => setView(v)} className={cn("rounded-md px-2.5 py-1 text-xs capitalize", view === v ? "bg-secondary" : "text-muted-foreground")}>{v}</button>)}
          {view === "month" && <select value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-md border bg-surface px-2 py-1 text-xs">{months.map((m) => <option key={m}>{m}</option>)}</select>}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2">
          <div className={cn("flex flex-col text-[10px] text-muted-foreground", view === "year" ? "gap-[3px]" : "gap-1")}>{WD.map((w, i) => <span key={i} className={cn("flex items-center", view === "year" ? "h-3" : "h-9")}>{view === "month" ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i] : w}</span>)}</div>
          {weeks.map((w, i) => (
            <div key={i} className={cn("flex flex-col", view === "year" ? "gap-[3px]" : "gap-1")}>
              {w.map((d, j) => d ? (
                <button key={d.date} onClick={() => setSel(d)} title={`${d.date}: ${FMT[metric](d[metric])}`} aria-label={`${d.date}: ${FMT[metric](d[metric])}`}
                  className={cn(cell, "relative transition hover:ring-2 hover:ring-foreground/60", sel?.date === d.date && "ring-2 ring-foreground", d.holiday && "outline outline-1 outline-warning")}
                  style={{ background: `color-mix(in oklab, ${HUE[metric]} ${12 + ((d[metric] - min) / (max - min || 1)) * 88}%, var(--muted))` }}>
                  {view === "month" && <span className="text-[10px] text-foreground/80">{Number(d.date.slice(8))}</span>}
                </button>
              ) : <span key={j} className={cell} />)}
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">Less {[12, 35, 60, 85, 100].map((p) => <span key={p} className="h-3 w-3 rounded-[3px]" style={{ background: `color-mix(in oklab, ${HUE[metric]} ${p}%, var(--muted))` }} />)} More · <span className="inline-block h-3 w-3 rounded-[3px] outline outline-1 outline-warning" /> public holiday</div>
      </div>
      <div className="rounded-xl border bg-surface p-4">
        {!sel ? <p className="text-sm text-muted-foreground">Click a day to see what drove it.</p> : (
          <div className="rise-in space-y-3 text-sm" key={sel.date}>
            <div><p className="num text-xs text-muted-foreground">{sel.date}</p><p className="num text-2xl font-semibold">{FMT[metric](sel[metric])}</p>
              <p className="text-xs">{sel.holiday ? <span className="text-warning">Public holiday — {sel.holiday}</span> : sel.workday ? "Workday" : "Weekend"}</p></div>
            <p className="text-xs text-muted-foreground">vs. surrounding days: <span className={sel[metric] > avg ? "text-warning" : "text-success"}>{avg ? `${(((sel[metric] - avg) / avg) * 100).toFixed(0)}%` : "–"}</span></p>
            <div><p className="mb-1 text-xs text-muted-foreground">Main contributors (CO₂)</p><ul className="space-y-1">{sel.contributors.map((c) => <li key={c.label} className="flex justify-between text-xs"><span>{c.label}</span><span className="num">{kg(c.co2Kg)}</span></li>)}</ul></div>
            <p className={cn("rounded-md px-2 py-1.5 text-[11px]", sel.coverage === "measured" ? "bg-success/10 text-success" : "bg-warning/10 text-warning")}>{sel.coverage === "measured" ? "Measured daily" : sel.coverage === "allocated" ? "Allocated: weekly/monthly sources spread across days" : "Estimated: source data missing for this day"}</p>
          </div>
        )}
      </div>
    </div>
  );
}
