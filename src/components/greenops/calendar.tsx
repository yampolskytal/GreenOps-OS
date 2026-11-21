import { useRef, useState } from "react";
import type { DailyFootprint } from "@/lib/api/types";
import { chf, kg } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";
import { AnalyticalInspector } from "./analytical-inspector";
import { DetailDrawer } from "./details";
import { Info } from "lucide-react";
import { SKYLINE_ENCODING } from "@/lib/analytics";
import { availableRange } from "@/lib/calendar-model";
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
  const [period, setPeriod] = useState<"year" | "month">("year");
  const months = [...new Set(days.map((d) => d.date.slice(0, 7)))].sort();
  const [selectedMonth, setMonth] = useState("");
  const month = months.includes(selectedMonth) ? selectedMonth : (months[0] ?? "");
  const heightMetric: CalMetric = SKYLINE_ENCODING.height;
  const colorMetric: CalMetric = SKYLINE_ENCODING.color;
  const frame = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<DailyFootprint | null>(null);
  const [dayOpen, setDayOpen] = useState(false);
  const shown = period === "month" ? days.filter((d) => d.date.startsWith(month)) : days;
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
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {(["year", "month"] as const).map((p) => (
          <Button
            key={p}
            size="sm"
            variant={period === p ? "secondary" : "ghost"}
            onClick={() => setPeriod(p)}
          >
            {p === "year" ? "Year" : "Month"}
          </Button>
        ))}
        {period === "month" && (
          <>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Previous month"
              disabled={months.indexOf(month) <= 0}
              onClick={() => setMonth(months[months.indexOf(month) - 1] ?? month)}
            >
              <ArrowLeft />
            </Button>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="w-36" aria-label="Calendar month">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {months.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Next month"
              disabled={months.indexOf(month) >= months.length - 1}
              onClick={() => setMonth(months[months.indexOf(month) + 1] ?? month)}
            >
              <ArrowRight />
            </Button>
          </>
        )}
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
      <p className="mb-3 text-xs text-muted-foreground">Select a month to inspect</p>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-2" aria-label="Select footprint month">
        {months.map((m) => (
          <Button
            key={m}
            size="sm"
            variant={period === "month" && month === m ? "secondary" : "outline"}
            aria-pressed={period === "month" && month === m}
            className="shrink-0"
            onClick={() => {
              setMonth(m);
              setPeriod("month");
              setSel(null);
            }}
          >
            {m}
          </Button>
        ))}
      </div>
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
          Each bar is one day. Taller bars mean higher spending. Darker bars mean higher CO₂
          emissions. Select a bar for details.
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
            title={period === "month" ? month : `${days[0]?.date} — ${days.at(-1)?.date}`}
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
