import { useRef, useState } from "react";
import type { DailyFootprint } from "@/lib/api/types";
import { chf, kg } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RotateCcw } from "lucide-react";
import { AnalyticalInspector } from "./analytical-inspector";
import { DetailDrawer } from "./details";
import { Info } from "lucide-react";
import { SKYLINE_ENCODING } from "@/lib/analytics";
import { availableRange } from "@/lib/calendar-model";
import { footprintRange } from "@/lib/footprint-range";
import ContributionSkyline from "./contribution-skyline";
export type CalMetric = "co2Kg" | "costChf" | "energyKwh" | "co2KgMarket";
const LABELS = {
  co2Kg: "CO₂ — Location-based",
  co2KgMarket: "CO₂ — Market-based",
  costChf: "Cost",
  energyKwh: "Energy",
};
const UNITS = { co2Kg: "kg CO₂", co2KgMarket: "kg CO₂", costChf: "CHF", energyKwh: "kWh" };
const fmt = {
  co2KgMarket: (v: number) => `${v.toFixed(1)} kg CO₂`,
  co2Kg: (v: number) => `${v.toFixed(1)} kg CO₂`,
  costChf: chf,
  energyKwh: (v: number) => `${v.toFixed(1)} kWh`,
};
const valid = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
export function FootprintCalendar({ days, metric }: { days: DailyFootprint[]; metric: CalMetric }) {
  const [view, setView] = useState<"2d" | "3d">("2d");
  const sortedDays = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const availableFrom = sortedDays[0]?.date ?? "",
    availableTo = sortedDays.at(-1)?.date ?? "";
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const from = range?.from ?? availableFrom,
    to = range?.to ?? availableTo;
  const month = from.slice(0, 7);
  const period = month === to.slice(0, 7) ? "month" : "year";
  const validRange = Boolean(
    from && to && from <= to && from >= availableFrom && to <= availableTo,
  );
  const preset = (months: number | null) => {
    if (months == null) {
      setRange({ from: "2025-09-01", to: "2026-08-31" });
      return;
    }
    const end = new Date(`${availableTo}T00:00:00Z`);
    if (months === 0) end.setUTCDate(end.getUTCDate() - 29);
    else {
      end.setUTCMonth(end.getUTCMonth() - months);
      end.setUTCDate(end.getUTCDate() + 1);
    }
    setRange({
      from:
        end.toISOString().slice(0, 10) < availableFrom
          ? availableFrom
          : end.toISOString().slice(0, 10),
      to: availableTo,
    });
  };
  const heightMetric: CalMetric = SKYLINE_ENCODING.height;
  const colorMetric: CalMetric = SKYLINE_ENCODING.color;
  const frame = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<DailyFootprint | null>(null);
  const [dayOpen, setDayOpen] = useState(false);
  const shown = validRange ? footprintRange(sortedDays, from, to) : [];
  const color = view === "2d" ? metric : colorMetric;
  const heightRange = availableRange(shown.map((d) => d[heightMetric]));
  const colorRange = availableRange(shown.map((d) => d[color]));
  const display = (d: DailyFootprint, m: CalMetric) =>
    valid(d[m]) === null ? "Unavailable" : fmt[m](valid(d[m]) ?? 0);
  const data = shown.map((d) => ({
    date: d.date,
    count: valid(d[heightMetric]),
    colorCount: valid(d[color]),
    detail: `${d.date} · ${view === "3d" ? `Height: ${display(d, heightMetric)} · Color: ${display(d, color)}` : display(d, color)} · ${d.coverage}`,
  }));
  if (!days.length)
    return (
      <p className="py-12 text-center text-muted-foreground">
        Daily footprint data is unavailable.
      </p>
    );
  return (
    <div>
      <section className="mb-5 border-b pb-4">
        <h3 className="mb-3 text-sm font-medium">Exploration date range</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="min-w-0 text-xs text-muted-foreground">
            From date
            <Input
              aria-label="Footprint from date"
              type="date"
              min={availableFrom}
              max={availableTo}
              className="mt-1 w-full"
              value={from}
              onChange={(e) => {
                setRange({ from: e.target.value, to });
                setSel(null);
              }}
            />
          </label>
          <label className="min-w-0 text-xs text-muted-foreground">
            To date
            <Input
              aria-label="Footprint to date"
              type="date"
              min={availableFrom}
              max={availableTo}
              className="mt-1 w-full"
              value={to}
              onChange={(e) => {
                setRange({ from, to: e.target.value });
                setSel(null);
              }}
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => preset(0)}>
            Last 30 days
          </Button>
          <Button size="sm" variant="outline" onClick={() => preset(6)}>
            Last 6 months
          </Button>
          <Button size="sm" variant="outline" onClick={() => preset(null)}>
            Official baseline year
          </Button>
          <div className="ml-auto flex gap-1" role="group" aria-label="Chart view">
            {(["2d", "3d"] as const).map((v) => (
              <Button
                key={v}
                size="sm"
                aria-label={v === "2d" ? "Flat heat map" : "3D skyline"}
                aria-pressed={view === v}
                variant={view === v ? "secondary" : "ghost"}
                onClick={() => setView(v)}
              >
                {v.toUpperCase()}
              </Button>
            ))}
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {from} — {to} · {shown.length} supplied days · exploration only; official plan and exports
          retain the baseline year.
        </p>
        {!validRange && (
          <p role="alert" className="mt-2 text-sm text-warning">
            Choose a valid range within supplied coverage: {availableFrom} — {availableTo}.
          </p>
        )}
        {validRange && !shown.length && (
          <p className="mt-2 text-sm text-muted-foreground">
            No daily observations supplied in this range.
          </p>
        )}
      </section>
      {view === "3d" && (
        <div className="mb-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              frame.current
                ?.querySelector("canvas")
                ?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }))
            }
          >
            <RotateCcw />
            Reset View
          </Button>
        </div>
      )}
      {period === "month" && view === "2d" && (
        <div className="mb-1 grid grid-cols-7 text-center text-xs text-muted-foreground">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
      )}
      <div ref={frame} className="calendar-chart-frame" data-view={view}>
        {view === "3d" && (
          <div className="calendar-floating-legend">
            <p className="text-xs font-medium">
              Height: Cost (CHF) · Color: Location-based CO₂ (kg CO₂)
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <div className="flex items-end gap-3">
                  <span className="flex h-6 gap-1 items-end" aria-hidden="true">
                    <span className="h-2 w-2 bg-chart-2" />
                    <span className="h-4 w-2 bg-chart-2" />
                    <span className="h-6 w-2 bg-chart-2" />
                  </span>
                  <p className="text-xs">{UNITS[heightMetric]} · zero-based linear height</p>
                </div>
                <p className="num mt-2 text-[11px] text-muted-foreground">
                  {heightRange
                    ? `Range ${fmt[heightMetric](heightRange.min)}–${fmt[heightMetric](heightRange.max)}`
                    : "Unavailable"}
                </p>
              </div>
              <div>
                <p className="text-xs">{UNITS[color]} · lightest = lowest, darkest = highest</p>
                <div className="mt-2 flex h-2 overflow-hidden rounded">
                  {[1, 2, 3, 4].map((i) => (
                    <span key={i} className="flex-1" style={{ background: `var(--heat-${i})` }} />
                  ))}
                </div>
                <div className="num mt-2 flex flex-wrap justify-between gap-2 text-[10px] text-muted-foreground">
                  {colorRange
                    ? [0, 0.25, 0.5, 0.75, 1].map((p) => (
                        <span key={p}>
                          {fmt[color](colorRange.min + (colorRange.max - colorRange.min) * p)}
                        </span>
                      ))
                    : "Unavailable"}
                </div>
              </div>
            </div>
          </div>
        )}
        {view === "2d" && (
          <div className="mb-3 text-xs text-muted-foreground">
            <p>
              Color: {LABELS[color]} · {UNITS[color]}
            </p>
            <div className="mt-2 flex h-2 overflow-hidden rounded">
              {[1, 2, 3, 4].map((i) => (
                <span key={i} className="flex-1" style={{ background: `var(--heat-${i})` }} />
              ))}
            </div>
            <p className="num mt-2">
              {colorRange
                ? `${fmt[color](colorRange.min)} → ${fmt[color](colorRange.max)} · lightest to darkest`
                : "Unavailable"}
            </p>
          </div>
        )}
        <p className="mb-3 text-xs text-muted-foreground">
          {view === "3d" ? "Daily spending and location-based CO₂" : `Daily ${LABELS[color]}`}
        </p>
        <p className="mb-3 text-xs">
          Selected day:{" "}
          {sel ? `${sel.date} · ${display(sel, "costChf")} · ${display(sel, "co2Kg")}` : "None"}
        </p>
        <div className="calendar-renderer">
          <ContributionSkyline
            data={data}
            heightScale={period === "month" ? 0.28 : 1}
            {...(period === "month" ? { month } : {})}
            view={view}
            onViewChange={setView}
            showToggle={false}
            weekStart={1}
            palette={["var(--heat-1)", "var(--heat-2)", "var(--heat-3)", "var(--heat-4)"]}
            showStats={false}
            showLegend={false}
            title={`${from} — ${to}`}
            footer="Dashed cells: unavailable metric coverage"
            onCellClick={(d) => {
              setSel(shown.find((x) => x.date === d.date) ?? null);
              setDayOpen(true);
            }}
          />
        </div>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Daily coverage: {shown.filter((d) => d.coverage === "measured").length} measured ·{" "}
        {shown.filter((d) => d.coverage === "allocated").length} allocated ·{" "}
        {shown.filter((d) => d.coverage === "estimated").length} estimated. Missing dates are
        unavailable, not zero.
      </p>
      <DetailDrawer
        title="Daily data-quality details"
        trigger={
          <Button className="mt-3" variant="outline" size="sm">
            <Info />
            Coverage & data quality
          </Button>
        }
      >
        <p>
          {shown.length} supplied daily records in this view.{" "}
          {shown.filter((d) => d.coverage !== "measured").length} allocated or estimated, not direct
          daily observations.
        </p>
        <p className="mt-3">
          {shown.filter((d) => valid(d.costChf) == null || valid(d.co2Kg) == null).length} records
          lack cost or location-based CO₂. Absent days and missing metrics stay unavailable, never
          zero.
        </p>
        <p className="mt-3">
          Day-level factors, source references and allocation methodology are not supplied in this
          API. Coverage does not establish verified emissions factors.
        </p>
      </DetailDrawer>
      <AnalyticalInspector
        title={sel?.date ?? "Day details"}
        trigger={null}
        open={dayOpen}
        onOpenChange={(o) => {
          setDayOpen(o);
        }}
      >
        {sel && (
          <div className="mt-6 space-y-4 text-sm">
            <p className="num">
              {display(sel, "costChf")} · {display(sel, "co2Kg")} · {display(sel, "energyKwh")}
            </p>
            <p>{sel.holiday ?? (sel.workday ? "Workday" : "Weekend")}</p>
            <h4 className="font-semibold">CO₂ contributors</h4>
            {(sel.contributors ?? []).map((c) => (
              <div key={c.label} className="flex justify-between gap-4">
                <span>{c.label}</span>
                <span>{kg(c.co2Kg)}</span>
              </div>
            ))}
            <p className="text-muted-foreground">
              Day-level source references and allocation methodology are not supplied by the current
              daily API. Confirm with the team before treating estimates as measured evidence.
            </p>
          </div>
        )}
      </AnalyticalInspector>
    </div>
  );
}
