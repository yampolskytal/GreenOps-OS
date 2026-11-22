import { useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { scenarioAxis, scenarioDateTicks, type ScenarioRow } from "@/lib/scenario-series";
import { isAvailable, percentDifference } from "@/lib/analytics";
import { formatNumber, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface ScenarioSeries {
  key: string;
  label: string;
  color: string;
  dashed: boolean;
  hidden?: boolean;
  toggleable?: boolean;
}

function Swatch({ series }: { series: ScenarioSeries }) {
  return (
    <svg width="24" height="8" aria-hidden="true" className="shrink-0">
      <line
        x1="1"
        x2="23"
        y1="4"
        y2="4"
        stroke={series.color}
        strokeWidth="2.5"
        strokeDasharray={series.dashed ? "5 3" : undefined}
      />
    </svg>
  );
}

function Observation({
  row,
  series,
  format,
  compact = false,
}: {
  row: ScenarioRow;
  series: ScenarioSeries[];
  format: (n: number) => string;
  compact?: boolean;
}) {
  const observed = row.kind === "actual";
  const comparison = series.filter((item) =>
    observed ? item.key === "history" : item.key !== "history",
  );
  const baseline = row["noChange"];
  return (
    <>
      <p className="font-semibold">
        {row.label} — {observed ? "Actual observation" : "Projected outcomes"}
      </p>
      {row.coverage && <p className="mt-1 text-xs text-muted-foreground">{row.coverage}</p>}
      <dl className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5">
        {comparison.map((item) => {
          const value = row[item.key];
          const range = row.ranges?.[item.key];
          const difference =
            item.key !== "noChange" && !observed && isAvailable(baseline) && isAvailable(value)
              ? value - baseline
              : null;
          const percentage =
            difference != null && isAvailable(baseline) && isAvailable(value)
              ? percentDifference(baseline, value)
              : null;
          return (
            <div key={item.key} className="col-span-2 grid grid-cols-subgrid items-baseline">
              <dt className="flex min-w-0 items-center gap-2">
                <Swatch series={item} />
                <span className="min-w-0 break-words">{item.label}</span>
              </dt>
              <dd className="num max-w-full text-right">
                {isAvailable(value) ? format(value) : "Unavailable"}
                {difference != null && (
                  <span className="block text-xs text-muted-foreground">
                    {difference === 0
                      ? "No modeled difference"
                      : `${format(Math.abs(difference))} ${difference > 0 ? "higher" : "lower"}`}
                    {percentage != null && difference !== 0 && ` (${pct(Math.abs(percentage))})`}
                  </span>
                )}
                {!compact && range && range.low !== range.high && (
                  <span className="block text-xs text-muted-foreground">
                    Low–high · {format(range.low)}–{format(range.high)}
                  </span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </>
  );
}

export function ScenarioChart({
  rows,
  series,
  boundary,
  annualPeriods = false,
  format,
  unit,
  milestones = [],
  height = 340,
  onToggle,
  showBand = false,
  selectedDate,
  onDateChange,
}: {
  rows: ScenarioRow[];
  series: ScenarioSeries[];
  boundary: number;
  annualPeriods?: boolean;
  format: (n: number) => string;
  unit: string;
  milestones?: { time: number; label: string }[];
  height?: number;
  onToggle?: (key: string) => void;
  showBand?: boolean;
  selectedDate?: number | undefined;
  onDateChange?: (time: number) => void;
}) {
  const visible = series.filter((s) => !s.hidden);
  const [localTime, setLocalTime] = useState<number>();
  const selectedTime = onDateChange ? selectedDate : localTime;
  const setSelectedTime = onDateChange ?? setLocalTime;
  const dates = new Map(rows.map((row) => [row.time, row]));
  const selected =
    dates.get(selectedTime ?? NaN) ??
    (annualPeriods ? rows.find((row) => row.kind === "projected") : undefined) ??
    rows.filter((row) => row.kind === "actual" && isAvailable(row["history"])).at(-1) ??
    rows.filter((row) => row.kind === "actual").at(-1) ??
    rows[0];
  const [includeRange, setIncludeRange] = useState(false);
  const bandAvailable =
    showBand &&
    !annualPeriods &&
    visible.some(({ key }) => key === "noChange") &&
    rows.some((row) => {
      const range = row.ranges?.["noChange"];
      return range && range.low !== range.high;
    });
  const showBaselineBand = bandAvailable && includeRange;
  const timeline = annualPeriods ? rows.filter((row) => row.kind === "actual") : rows;
  const annualRows = annualPeriods ? rows.filter((row) => row.kind === "projected") : [];
  const scenarios = visible.filter((s) => s.key !== "history");
  const barMax = Math.max(
    1,
    ...annualRows.flatMap((r) => scenarios.map((s) => r[s.key]).filter(isAvailable)),
  );
  const values = timeline.flatMap((row) => {
    const values = visible.map(({ key }) => row[key]).filter(isAvailable);
    const range = showBaselineBand ? row.ranges?.["noChange"] : null;
    if (range) values.push(range.low, range.high);
    return values;
  });
  const start = rows[0]?.time ?? boundary;
  const end = timeline.at(-1)?.time ?? boundary;
  const [width, setWidth] = useState(720);
  const { ticks, yearsOnly } = scenarioDateTicks(start, end, width);
  const yAxis = scenarioAxis(values);
  return (
    <div className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{unit}</span>
        <p>Actual history through August 2026 · Projected future from September 2026</p>
      </div>
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs" aria-label="Chart legend">
        {series.map((item) => (
          <li key={item.key}>
            {item.toggleable && onToggle ? (
              <button
                type="button"
                aria-pressed={!item.hidden}
                onClick={() => onToggle(item.key)}
                className={cn(
                  "inline-flex items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-muted",
                  item.hidden && "opacity-60 line-through",
                )}
              >
                <Swatch series={item} />
                {item.label}
              </button>
            ) : (
              <span className="inline-flex items-center gap-2 py-1">
                <Swatch series={item} />
                {item.label}
              </span>
            )}
          </li>
        ))}
        {bandAvailable && (
          <li className="py-1">
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={includeRange}
                onChange={(e) => setIncludeRange(e.target.checked)}
              />
              Show baseline low–high range
            </label>
          </li>
        )}
      </ul>
      <div
        className={
          annualPeriods
            ? "grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"
            : undefined
        }
      >
        {annualPeriods && (
          <section className="min-w-0 lg:order-2" aria-label="Annual scenario comparison">
            <h3 className="text-sm font-semibold">Forecast by fiscal year</h3>
            <p className="mb-3 text-xs text-muted-foreground">
              Average per month over each year · shared scale from zero
            </p>
            {annualRows.map((row) => (
              <button
                key={row.time}
                type="button"
                onClick={() => setSelectedTime(row.time)}
                aria-pressed={selected?.time === row.time}
                className="block w-full border-t px-2 py-3 text-left hover:bg-muted aria-pressed:bg-muted/50"
              >
                <span className="text-xs font-semibold">{row.label}</span>
                {scenarios.map((s) => {
                  const value = row[s.key];
                  return (
                    <span key={s.key} className="mt-1.5 block">
                      <span className="flex justify-between gap-2 text-xs">
                        <span>{s.label}</span>
                        <span className="num">
                          {isAvailable(value) ? format(value) : "Unavailable"}
                        </span>
                      </span>
                      {isAvailable(value) && (
                        <span className="mt-1 block h-1.5 rounded bg-muted">
                          <span
                            className="block h-full rounded"
                            style={{ width: `${(100 * value) / barMax}%`, background: s.color }}
                          />
                        </span>
                      )}
                    </span>
                  );
                })}
              </button>
            ))}
          </section>
        )}
        <div className="min-w-0">
          {annualPeriods && (
            <h3 className="mb-2 text-sm font-semibold">Observed monthly history</h3>
          )}
          {annualPeriods && !values.length && (
            <p className="text-xs text-muted-foreground">No observed values available.</p>
          )}
          {values.length > 0 && (
            <div
              style={{ height: annualPeriods ? 215 : height }}
              className="w-full min-w-0"
              data-inspector-interactive
              role="img"
              aria-label={`Forecast timeline · ${unit}`}
            >
              <ResponsiveContainer width="100%" height="100%" onResize={setWidth}>
                <ComposedChart
                  data={timeline}
                  margin={{ top: 20, right: 16, bottom: 6, left: 0 }}
                  onClick={(event) => {
                    const time = Number(event?.activeLabel);
                    if (dates.has(time)) setSelectedTime(time);
                  }}
                >
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="time"
                    type="number"
                    scale="time"
                    domain={[start, end]}
                    ticks={ticks}
                    minTickGap={28}
                    tickFormatter={(time: number) =>
                      new Date(time).toLocaleDateString("en-US", {
                        ...(yearsOnly ? {} : { month: "short" }),
                        year: yearsOnly ? "numeric" : "2-digit",
                        timeZone: "UTC",
                      })
                    }
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                    stroke="var(--border)"
                  />
                  <YAxis
                    type="number"
                    domain={yAxis.domain}
                    ticks={yAxis.ticks}
                    tickFormatter={(value: number) =>
                      formatNumber(value, { maximumSignificantDigits: 6 })
                    }
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                    stroke="var(--border)"
                    width={
                      Math.max(
                        ...yAxis.ticks.map(
                          (v) => formatNumber(v, { maximumSignificantDigits: 6 }).length,
                        ),
                      ) *
                        7 +
                      14
                    }
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                  />
                  {end > boundary && (
                    <ReferenceArea
                      x1={boundary}
                      x2={end}
                      fill="var(--muted-foreground)"
                      fillOpacity={0.07}
                    />
                  )}
                  {!annualPeriods && (
                    <ReferenceLine
                      x={boundary}
                      stroke="var(--muted-foreground)"
                      strokeDasharray="3 3"
                      label={{
                        value: "Forecast starts",
                        position: "insideTopLeft",
                        fill: "var(--muted-foreground)",
                        fontSize: 11,
                      }}
                    />
                  )}
                  {milestones
                    .filter(({ time }) => time >= boundary && time <= end)
                    .map(({ time, label }) => (
                      <ReferenceLine
                        key={label}
                        x={time}
                        stroke="var(--info)"
                        strokeDasharray="3 5"
                      />
                    ))}
                  {selected && selected.time <= end && selected.time !== boundary && (
                    <ReferenceLine x={selected.time} stroke="var(--ring)" strokeOpacity={0.55} />
                  )}
                  <Tooltip
                    cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
                    filterNull={false}
                    wrapperStyle={{ zIndex: 20, maxWidth: "min(340px, 75vw)" }}
                    content={({ active, label }) => {
                      const row = dates.get(Number(label));
                      return active && row ? (
                        <div className="rounded-md border bg-popover p-3 text-xs text-popover-foreground shadow-md">
                          <Observation row={row} series={visible} format={format} compact />
                        </div>
                      ) : null;
                    }}
                  />
                  {showBaselineBand && (
                    <Area
                      dataKey={(row: ScenarioRow) => {
                        const range = row.ranges?.["noChange"];
                        return range ? [range.low, range.high] : null;
                      }}
                      type="linear"
                      stroke="none"
                      fill="var(--scenario-none)"
                      fillOpacity={0.14}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  )}
                  {visible
                    .filter((item) => !annualPeriods || item.key === "history")
                    .map((item) => (
                      <Line
                        key={item.key}
                        dataKey={item.key}
                        type="linear"
                        stroke={item.color}
                        strokeWidth={item.key === "history" ? 2.5 : 2}
                        strokeDasharray={item.dashed ? "5 3" : undefined}
                        dot={{ r: 2.5, fill: item.color, strokeWidth: 0 }}
                        activeDot={{ r: 5 }}
                        connectNulls={false}
                        isAnimationActive={false}
                      />
                    ))}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
      {selected && (
        <section aria-label="Selected forecast date" className="mt-3 border-t pt-3 text-sm">
          <div className="grid items-start gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div>
              <Observation row={selected} series={visible} format={format} />
            </div>
            <label className="grid gap-1 text-xs text-muted-foreground">
              Inspect a date
              <select
                value={selected.time}
                onChange={(event) => setSelectedTime(Number(event.target.value))}
                className="h-9 w-full min-w-0 max-w-56 rounded-md border bg-card px-2 text-sm text-foreground"
              >
                <optgroup label="Actual history">
                  {rows
                    .filter((row) => row.kind === "actual")
                    .map((row) => (
                      <option key={row.time} value={row.time}>
                        {row.label}
                      </option>
                    ))}
                </optgroup>
                {rows.some((row) => row.kind === "projected") && (
                  <optgroup label="Projected future">
                    {rows
                      .filter((row) => row.kind === "projected")
                      .map((row) => (
                        <option key={row.time} value={row.time}>
                          {row.label}
                        </option>
                      ))}
                  </optgroup>
                )}
              </select>
            </label>
          </div>
        </section>
      )}
    </div>
  );
}
