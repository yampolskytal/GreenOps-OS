import { useMemo, useRef, useState } from "react";
import type { DailyFootprint } from "@/lib/api/types";
import { kg } from "@/lib/format";
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
import { buildFootprintGrid, type buildCalendarScale } from "@/lib/calendar-model";
import ContributionSkyline from "./contribution-skyline";
export type CalMetric = "co2Kg" | "costChf" | "energyKwh" | "co2KgMarket";
const LABELS = {
  co2Kg: "CO₂ — Location-based",
  co2KgMarket: "CO₂ — Market-based",
  costChf: "Cost",
  energyKwh: "Energy",
};
const decimal = new Intl.NumberFormat("en-CH", { maximumFractionDigits: 3 });
const francs = new Intl.NumberFormat("en-CH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const fmt = {
  co2KgMarket: (v: number) => `${decimal.format(v)} kg CO₂`,
  co2Kg: (v: number) => `${decimal.format(v)} kg CO₂`,
  costChf: (v: number) => `CHF ${francs.format(v)}`,
  energyKwh: (v: number) => `${decimal.format(v)} kWh`,
};
function metricValue(day: DailyFootprint, metric: CalMetric) {
  const value = day[metric];
  return typeof value === "number" && Number.isFinite(value) && (metric === "costChf" || value >= 0)
    ? value
    : null;
}

function display(day: DailyFootprint, metric: CalMetric) {
  const value = metricValue(day, metric);
  return value === null ? "Unavailable" : fmt[metric](value);
}

function ColorLegend({
  metric,
  scale,
}: {
  metric: CalMetric;
  scale: ReturnType<typeof buildCalendarScale>;
}) {
  return (
    <div className="text-xs text-muted-foreground">
      <p>Color · {LABELS[metric]}</p>
      {scale && scale.min < scale.max ? (
        <>
          <div className="mt-2 flex h-2 overflow-hidden rounded">
            {[1, 2, 3, 4].map((level) => (
              <span key={level} className="flex-1" style={{ background: `var(--heat-${level})` }} />
            ))}
          </div>
          <div className="num mt-2 flex flex-wrap justify-between gap-2 text-[10px]">
            {scale.ticks.map((value) => (
              <span key={value}>{fmt[metric](value)}</span>
            ))}
          </div>
          <p className="mt-1">
            Darker means higher.
            {scale.compressed && " Extreme values are compressed."}
          </p>
        </>
      ) : (
        <p className="mt-2">
          {scale ? `All available days · ${fmt[metric](scale.min)}` : "Unavailable"}
        </p>
      )}
    </div>
  );
}

export function FootprintCalendar({
  days,
  metric,
  compare,
  onCompareChange,
}: {
  days: DailyFootprint[];
  metric: CalMetric;
  compare: boolean;
  onCompareChange: (compare: boolean) => void;
}) {
  const [view, setView] = useState<"2d" | "3d">("2d");
  const [period, setPeriod] = useState<"year" | "month">("year");
  const months = [...new Set(days.map((d) => d.date.slice(0, 7)))].sort();
  const [selectedMonth, setMonth] = useState("");
  const month = months.includes(selectedMonth) ? selectedMonth : (months[0] ?? "");
  const frame = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<DailyFootprint | null>(null);
  const [dayOpen, setDayOpen] = useState(false);
  const comparing = view === "3d" && compare;
  const heightMetric = comparing ? SKYLINE_ENCODING.height : metric;
  const color = comparing ? SKYLINE_ENCODING.color : metric;
  const activeMonth = period === "month" ? month : undefined;
  const shown = useMemo(
    () => (activeMonth ? days.filter((d) => d.date.startsWith(activeMonth)) : days),
    [days, activeMonth],
  );
  const data = useMemo(
    () =>
      shown.map((d) => ({
        date: d.date,
        count: metricValue(d, heightMetric),
        colorCount: metricValue(d, color),
        detail: `${d.date} · ${comparing ? `Cost ${display(d, heightMetric)} · CO₂ ${display(d, color)}` : display(d, color)} · ${d.coverage}`,
      })),
    [shown, heightMetric, color, comparing],
  );
  const grid = useMemo(() => {
    const end = Math.max(...data.map((d) => Date.parse(d.date)));
    return buildFootprintGrid(data, end, 1, activeMonth);
  }, [data, activeMonth]);
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
            variant={compare ? "secondary" : "outline"}
            aria-pressed={compare}
            onClick={() => onCompareChange(!compare)}
          >
            Compare cost and CO₂
          </Button>
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
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs">Height · {LABELS[heightMetric]}</p>
                <p className="num mt-2 text-[11px] text-muted-foreground">
                  {grid.heightDomain
                    ? `${fmt[heightMetric](grid.heightDomain.min)} to ${fmt[heightMetric](grid.heightDomain.max)}`
                    : "Unavailable"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Scaled to this period.
                  {grid.heightDomain?.compressed && " Extreme values are compressed."}
                </p>
              </div>
              <ColorLegend metric={color} scale={grid.colorDomain} />
            </div>
          </div>
        )}
        {view === "2d" && (
          <div className="mb-3">
            <ColorLegend metric={color} scale={grid.colorDomain} />
          </div>
        )}
        <p className="mb-3 text-xs text-muted-foreground">
          {comparing && "Height shows cost and color shows CO₂. "}
          Select a day for its exact values.
        </p>
        <p className="mb-3 text-xs">
          Selected day:{" "}
          {sel ? `${sel.date} · ${display(sel, "costChf")} · ${display(sel, "co2Kg")}` : "None"}
        </p>
        <div className="calendar-renderer">
          <ContributionSkyline
            data={data}
            footprintGrid={grid}
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
        {shown.filter((d) => d.coverage === "estimated").length} estimated ·{" "}
        {shown.filter((d) => d.coverage === "unavailable").length} unavailable.
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
          {shown.filter((d) => d.coverage === "allocated" || d.coverage === "estimated").length}{" "}
          allocated or estimated.
        </p>
        <p className="mt-3">
          {
            shown.filter(
              (d) => metricValue(d, "costChf") === null || metricValue(d, "co2Kg") === null,
            ).length
          }{" "}
          records lack cost or location-based CO₂. Absent days and missing metrics stay unavailable,
          never zero.
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
