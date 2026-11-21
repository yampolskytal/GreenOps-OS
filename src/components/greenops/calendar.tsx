import { useMemo, useRef, useState } from "react";
import type { DailyFootprint } from "@/lib/api/types";
import { kg } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RotateCcw } from "lucide-react";
import { AnalyticalInspector } from "./analytical-inspector";
import { DetailDrawer } from "./details";
import { Info } from "lucide-react";
import { marketCoverageLabel, SKYLINE_ENCODING } from "@/lib/analytics";
import { buildFootprintGrid, type buildCalendarScale } from "@/lib/calendar-model";
import { footprintRange } from "@/lib/footprint-range";
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
  const sortedDays = useMemo(() => [...days].sort((a, b) => a.date.localeCompare(b.date)), [days]);
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
  const frame = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<DailyFootprint | null>(null);
  const [dayOpen, setDayOpen] = useState(false);
  const comparing = view === "3d" && compare;
  const heightMetric = comparing ? SKYLINE_ENCODING.height : metric;
  const color = comparing ? SKYLINE_ENCODING.color : metric;
  const activeMonth = period === "month" ? month : undefined;
  const shown = useMemo(
    () => (validRange ? footprintRange(sortedDays, from, to) : []),
    [sortedDays, validRange, from, to],
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
  const grid = useMemo(
    () => buildFootprintGrid(data, Date.parse(to), 1, activeMonth, Date.parse(from)),
    [data, from, to, activeMonth],
  );
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
      {shown.length > 0 && (
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
              title={`${from} — ${to}`}
              footer="Dashed cells: unavailable metric coverage"
              onCellClick={(d) => {
                setSel(shown.find((x) => x.date === d.date) ?? null);
                setDayOpen(true);
              }}
            />
          </div>
        </div>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        Daily coverage: {shown.filter((d) => d.coverage === "measured").length} measured ·{" "}
        {shown.filter((d) => d.coverage === "allocated").length} allocated ·{" "}
        {shown.filter((d) => d.coverage === "estimated").length} estimated ·{" "}
        {shown.filter((d) => d.coverage === "unavailable").length} unavailable.
      </p>
      {color === "co2KgMarket" && (
        <p className="mt-2 text-xs text-muted-foreground">
          Market-based values cover activity with a supported factor. Open a day for its coverage and sources.
        </p>
      )}
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
            {sel.marketCoverage && (
              <div className="space-y-2 border-t pt-3">
                <h4 className="font-semibold">Market-based CO₂</h4>
                <p>{display(sel, "co2KgMarket")} · {marketCoverageLabel(sel.marketCoverage)}</p>
                {[...sel.marketCoverage.missingInputs, ...sel.marketCoverage.assumptions].map((s) => (
                  <p key={s} className="text-muted-foreground">{s}</p>
                ))}
                <p className="break-words text-muted-foreground">{sel.marketCoverage.sources.join(" · ")}</p>
              </div>
            )}
          </div>
        )}
      </AnalyticalInspector>
    </div>
  );
}
