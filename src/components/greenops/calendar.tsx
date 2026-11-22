import { useMemo, useRef, useState } from "react";
import type { DailyFootprint } from "@/lib/api/types";
import { carbonMass, chf, formatNumber, kg } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RotateCcw } from "lucide-react";
import { AnalyticalInspector } from "./analytical-inspector";
import { DetailBlock, EvidenceInfoButton, EvidenceSources } from "./details";
import { marketCoverageLabel, SKYLINE_ENCODING } from "@/lib/analytics";
import { buildFootprintGrid, DAY_MS, type buildCalendarScale } from "@/lib/calendar-model";
import { footprintRange } from "@/lib/footprint-range";
import ContributionSkyline from "./contribution-skyline";
export type CalMetric = "co2Kg" | "costChf" | "energyKwh" | "co2KgMarket";
const PALETTE = ["var(--heat-1)", "var(--heat-2)", "var(--heat-3)", "var(--heat-4)"];
const LABELS = {
  co2Kg: "Location-based CO₂",
  co2KgMarket: "Market-based CO₂",
  costChf: "Cost",
  energyKwh: "Energy",
};
const fmt = {
  co2KgMarket: (v: number) => carbonMass(v, "kg CO₂e"),
  co2Kg: (v: number) => carbonMass(v, "kg CO₂"),
  costChf: chf,
  energyKwh: (v: number) => `${formatNumber(v, { maximumFractionDigits: 3 })} kWh`,
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
    <div className="max-w-md text-xs text-muted-foreground">
      <p>Color · {LABELS[metric]}</p>
      {scale && scale.min < scale.max ? (
        <>
          <div className="mt-2 flex h-2 overflow-hidden rounded">
            {PALETTE.map((background) => (
              <span key={background} className="flex-1" style={{ background }} />
            ))}
          </div>
          <div className="num mt-2 flex flex-wrap justify-between gap-2 text-[10px]">
            {scale.ticks.map((value) => (
              <span key={value}>{fmt[metric](value)}</span>
            ))}
          </div>
          <p className="mt-1">
            Left to right · lower to higher.
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

export type FootprintSelection = {
  range: { from: string; to: string } | null;
  view: "2d" | "3d";
  date: string | null;
};

const presets = [
  [0, "Last 30 days"],
  [6, "Last 6 months"],
  [null, "Official baseline year"],
] as const;
const initial: FootprintSelection = { range: null, view: "2d", date: null };

function presetRange(months: number | null, availableFrom: string, availableTo: string) {
  if (months == null) return { from: "2025-09-01", to: "2026-08-31" };
  const end = new Date(`${availableTo}T00:00:00Z`);
  if (months === 0) end.setUTCDate(end.getUTCDate() - 29);
  else {
    end.setUTCMonth(end.getUTCMonth() - months);
    end.setUTCDate(end.getUTCDate() + 1);
  }
  const from = end.toISOString().slice(0, 10);
  return { from: from < availableFrom ? availableFrom : from, to: availableTo };
}

export function FootprintCalendar({
  days,
  metric,
  compare,
  onCompareChange,
  selection,
  onSelectionChange,
}: {
  days: DailyFootprint[];
  metric: CalMetric;
  compare: boolean;
  onCompareChange: (compare: boolean) => void;
  selection?: FootprintSelection;
  onSelectionChange?: (selection: FootprintSelection) => void;
}) {
  const [local, setLocal] = useState(initial);
  const current = selection ?? local;
  const { range, view, date: selectedDate } = current;
  const update = (patch: Partial<FootprintSelection>) =>
    (onSelectionChange ?? setLocal)({ ...current, ...patch });
  const setView = (view: FootprintSelection["view"]) => update({ view });
  const setRange = (range: FootprintSelection["range"]) => update({ range });
  const sortedDays = useMemo(() => [...days].sort((a, b) => a.date.localeCompare(b.date)), [days]);
  const availableFrom = sortedDays[0]?.date ?? "",
    availableTo = sortedDays.at(-1)?.date ?? "";
  const from = range?.from ?? availableFrom,
    to = range?.to ?? availableTo;
  const validRange = Boolean(
    from && to && from <= to && from >= availableFrom && to <= availableTo,
  );
  const compact =
    validRange &&
    (from.slice(0, 7) === to.slice(0, 7) || Date.parse(to) - Date.parse(from) <= 30 * DAY_MS);
  const matchesPreset = availableTo
    ? presets.find(([months]) => {
        const preset = presetRange(months, availableFrom, availableTo);
        return validRange && preset.from === from && preset.to === to;
      })
    : undefined;
  const frame = useRef<HTMLDivElement>(null);
  const [inspector, setInspector] = useState<"day" | "coverage" | null>(null);
  const comparing = view === "3d" && compare;
  const heightMetric = comparing ? SKYLINE_ENCODING.height : metric;
  const color = comparing ? SKYLINE_ENCODING.color : metric;
  const activeMonth = compact ? from.slice(0, 7) : undefined;
  const shown = useMemo(
    () => (validRange ? footprintRange(sortedDays, from, to) : []),
    [sortedDays, validRange, from, to],
  );
  const selectedInRange =
    selectedDate != null && validRange && selectedDate >= from && selectedDate <= to;
  const sel = shown.find((day) => day.date === selectedDate);
  const data = useMemo(
    () =>
      shown.map((d) => ({
        date: d.date,
        count: metricValue(d, heightMetric),
        colorCount: metricValue(d, color),
        partial:
          d.coverage === "allocated" ||
          d.coverage === "estimated" ||
          (color === "co2KgMarket" && d.marketCoverage?.status === "partial"),
        detail: `${d.date} · ${comparing ? `Cost ${display(d, heightMetric)} · CO₂ ${display(d, color)}` : display(d, color)} · ${d.coverage}${color === "co2KgMarket" && d.marketCoverage?.status === "partial" ? " · covered subtotal" : ""}`,
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
              }}
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {presets.map(([months, label]) => (
            <Button
              key={label}
              size="sm"
              variant="outline"
              className="secondary-selection"
              aria-pressed={matchesPreset?.[1] === label}
              onClick={() => setRange(presetRange(months, availableFrom, availableTo))}
            >
              {label}
            </Button>
          ))}
          <div className="ml-auto flex gap-1" role="group" aria-label="Chart view">
            {(["2d", "3d"] as const).map((v) => (
              <Button
                key={v}
                size="sm"
                aria-label={v === "2d" ? "Flat heat map" : "3D skyline"}
                aria-pressed={view === v}
                variant="ghost"
                className="secondary-selection"
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
      {validRange && grid.cells.length > 0 && (
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
            {selectedInRange
              ? `${selectedDate} · ${sel ? display(sel, color) : "Unavailable"}`
              : "None in this range"}
          </p>
          <div
            className="calendar-renderer"
            data-compact={compact && view === "2d" ? "" : undefined}
            data-inspector-interactive
          >
            <ContributionSkyline
              data={data}
              footprintGrid={grid}
              heightScale={compact ? 0.28 : 1}
              {...(activeMonth ? { month: activeMonth } : {})}
              view={view}
              onViewChange={setView}
              showToggle={false}
              weekStart={1}
              palette={PALETTE}
              showStats={false}
              showLegend={false}
              title={null}
              footer={null}
              selectedDate={selectedInRange ? selectedDate : null}
              onCellClick={(d) => {
                update({ date: d.date });
                setInspector("day");
              }}
            />
          </div>
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <p className="text-xs text-muted-foreground">
          Daily coverage: {shown.filter((d) => d.coverage === "measured").length} measured ·{" "}
          {shown.filter((d) => d.coverage === "allocated").length} allocated ·{" "}
          {shown.filter((d) => d.coverage === "estimated").length} estimated ·{" "}
          {shown.filter((d) => d.coverage === "unavailable").length} unavailable.
        </p>
        <EvidenceInfoButton
          label="View daily coverage and data quality"
          onClick={() => setInspector("coverage")}
        />
      </div>
      {color === "co2KgMarket" && (
        <p className="text-xs text-muted-foreground">
          Market-based values cover activity with a supported factor.
        </p>
      )}
      <AnalyticalInspector
        title={
          inspector === "coverage"
            ? "Daily data-quality details"
            : selectedInRange
              ? selectedDate
              : "Day details"
        }
        trigger={null}
        open={inspector != null}
        onOpenChange={(open) => {
          if (!open) setInspector(null);
        }}
        contentKey={`${inspector}:${selectedInRange ? selectedDate : ""}`}
      >
        {inspector === "coverage" ? (
          <DetailBlock title="Observation coverage">
            <p>
              {shown.length} supplied days ·{" "}
              {shown.filter((d) => metricValue(d, color) === null).length} supplied days without{" "}
              {LABELS[color]}.
            </p>
            <p>
              {
                shown.filter(
                  (day) =>
                    metricValue(day, "costChf") === null || metricValue(day, "co2Kg") === null,
                ).length
              }{" "}
              supplied days lack cost or location-based CO₂.
            </p>
            <p className="mt-2">
              Dashed outlines mark unavailable values. A corner marker flags allocated, estimated or
              partially covered values. Measured zero is scaled as an observed value.
            </p>
          </DetailBlock>
        ) : sel ? (
          <div className="space-y-4 text-sm">
            <p className="num">
              {["costChf", "energyKwh", "co2Kg", "co2KgMarket"].map((key) => {
                const id = key as CalMetric;
                return (
                  <span className="block" key={id}>
                    {LABELS[id]} · {display(sel, id)}
                  </span>
                );
              })}
            </p>
            <p className="capitalize">Coverage · {sel.coverage}</p>
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
                <p>
                  {display(sel, "co2KgMarket")} · {marketCoverageLabel(sel.marketCoverage)}
                </p>
                {[...sel.marketCoverage.missingInputs, ...sel.marketCoverage.assumptions].map(
                  (s) => (
                    <p key={s} className="text-muted-foreground">
                      {s}
                    </p>
                  ),
                )}
                <EvidenceSources sources={sel.marketCoverage.sources} />
              </div>
            )}
          </div>
        ) : (
          <p>
            {selectedInRange
              ? "No observations were supplied for this date."
              : "The selected date is outside the current range. Select a day in this range to view its evidence."}
          </p>
        )}
      </AnalyticalInspector>
    </div>
  );
}
