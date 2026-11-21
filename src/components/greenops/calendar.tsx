import { useState } from "react";
import type { DailyFootprint } from "@/lib/api/types";
import { chf, kg, kwh } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, ArrowRight, ArrowLeftRight } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { availableRange } from "@/lib/calendar-model";
import ContributionSkyline from "./contribution-skyline";
export type CalMetric = "co2Kg" | "costChf" | "energyKwh";
const LABELS = { co2Kg: "CO₂ emissions", costChf: "Cost", energyKwh: "Energy" };
const UNITS = { co2Kg: "kg CO₂", costChf: "CHF", energyKwh: "kWh" };
const fmt = {
  co2Kg: (v: number) => `${v.toFixed(1)} kg CO₂`,
  costChf: chf,
  energyKwh: (v: number) => `${v.toFixed(1)} kWh`,
};
const valid = (v: number) => (Number.isFinite(v) && v >= 0 ? v : null);
export function FootprintCalendar({ days, metric }: { days: DailyFootprint[]; metric: CalMetric }) {
  const [view, setView] = useState<"2d" | "3d">("2d");
  const [period, setPeriod] = useState<"year" | "month">("year");
  const months = [...new Set(days.map((d) => d.date.slice(0, 7)))].sort();
  const [selectedMonth, setMonth] = useState("");
  const month = months.includes(selectedMonth) ? selectedMonth : (months.at(-1) ?? "");
  const [heightMetric, setHeightMetric] = useState<CalMetric>("co2Kg");
  const [colorMetric, setColorMetric] = useState<CalMetric>("costChf");
  const [sel, setSel] = useState<DailyFootprint | null>(null);
  const shown = period === "month" ? days.filter((d) => d.date.startsWith(month)) : days;
  const color = view === "2d" ? metric : colorMetric;
  const heightRange = availableRange(shown.map((d) => d[heightMetric]));
  const colorRange = availableRange(shown.map((d) => d[color]));
  const display = (d: DailyFootprint, m: CalMetric) =>
    valid(d[m]) === null ? "Unavailable" : fmt[m](d[m]);
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
      <div className="mb-4 grid grid-cols-1 items-start gap-x-8 gap-y-4 border-y py-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_auto]">
        {view === "3d" && (
          <div className="min-w-0 flex-1">
            <div className="flex items-end gap-3">
              <span className="flex h-9 w-10 shrink-0 items-end gap-1" aria-hidden="true">
                <span className="h-3 w-2 rounded-sm bg-chart-1" />
                <span className="h-6 w-2 rounded-sm bg-chart-1" />
                <span className="h-9 w-2 rounded-sm bg-chart-1" />
              </span>
              <div>
                <p className="text-sm font-semibold">Bar height: {LABELS[heightMetric]}</p>
                <p className="text-xs text-muted-foreground">
                  {UNITS[heightMetric]} · linear scale
                </p>
              </div>
            </div>
            <Select value={heightMetric} onValueChange={(v) => setHeightMetric(v as CalMetric)}>
              <SelectTrigger className="mt-3 w-full max-w-60" aria-label="Height metric">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="num mt-2 text-xs text-muted-foreground">
              {heightRange
                ? `0 → ${fmt[heightMetric](heightRange.max)} · available range ${fmt[heightMetric](heightRange.min)}–${fmt[heightMetric](heightRange.max)}`
                : "Height metric unavailable"}
            </p>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {view === "3d" ? "Bar color" : "Cell color"}: {LABELS[color]}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {UNITS[color]} · lightest = lowest, darkest = highest
          </p>
          {view === "3d" && (
            <Select value={colorMetric} onValueChange={(v) => setColorMetric(v as CalMetric)}>
              <SelectTrigger className="mt-3 w-full max-w-60" aria-label="Color metric">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="mt-3 flex h-3 overflow-hidden rounded" aria-hidden="true">
            {[1, 2, 3, 4].map((i) => (
              <span key={i} className="flex-1" style={{ background: `var(--heat-${i})` }} />
            ))}
          </div>
          <div className="num mt-2 flex flex-wrap justify-between gap-2 text-[11px] text-muted-foreground">
            {colorRange ? (
              [0, 0.25, 0.5, 0.75, 1].map((p) => (
                <span key={p}>
                  {fmt[color](colorRange.min + (colorRange.max - colorRange.min) * p)}
                </span>
              ))
            ) : (
              <span>Color metric unavailable</span>
            )}
          </div>
        </div>
        {view === "3d" && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setHeightMetric(colorMetric);
              setColorMetric(heightMetric);
            }}
          >
            <ArrowLeftRight />
            Swap height / color
          </Button>
        )}
      </div>
      {view === "3d" && (
        <p className="mb-4 text-xs text-muted-foreground">
          Height represents one metric, while color represents another. Hover over a day to see its
          values.
        </p>
      )}
      {period === "month" && view === "2d" && <div className="mb-1 grid grid-cols-7 text-center text-xs text-muted-foreground">{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d=><span key={d}>{d}</span>)}</div>}
      <ContributionSkyline
        data={data}
        heightScale={period === "month" ? .28 : 1}
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
        onCellClick={(d) => setSel(shown.find((x) => x.date === d.date) ?? null)}
      />
      <p className="mt-4 text-xs text-muted-foreground">
        Daily coverage: {shown.filter((d) => d.coverage === "measured").length} measured ·{" "}
        {shown.filter((d) => d.coverage === "allocated").length} allocated ·{" "}
        {shown.filter((d) => d.coverage === "estimated").length} estimated. Missing dates are
        unavailable, not zero.
      </p>
      <Sheet
        open={sel != null}
        onOpenChange={(o) => {
          if (!o) setSel(null);
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{sel?.date ?? "Day details"}</SheetTitle>
            <SheetDescription>
              {sel?.coverage === "allocated"
                ? "Allocated from weekly/monthly sources; not a daily observation."
                : sel?.coverage === "estimated"
                  ? "Estimated daily value; source limitations apply."
                  : "Measured daily"}
            </SheetDescription>
          </SheetHeader>
          {sel && (
            <div className="mt-6 space-y-4 text-sm">
              <p className="num">
                {display(sel, "costChf")} · {display(sel, "co2Kg")} · {display(sel, "energyKwh")}
              </p>
              <p>{sel.holiday ?? (sel.workday ? "Workday" : "Weekend")}</p>
              <h4 className="font-semibold">CO₂ contributors</h4>
              {sel.contributors.map((c) => (
                <div key={c.label} className="flex justify-between gap-4">
                  <span>{c.label}</span>
                  <span>{kg(c.co2Kg)}</span>
                </div>
              ))}
              <p className="text-muted-foreground">
                Day-level source references and allocation methodology are not supplied by the
                current daily API. Confirm with the team before treating estimates as measured
                evidence.
              </p>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
