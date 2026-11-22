// GreenOps adaptation of the supplied LineChart6: metric cards, dotted plot, cursor and active point.
import { useState, useId } from "react";
import { Cloud, Leaf, Wallet, Zap } from "lucide-react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceDot,
} from "recharts";
import { useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import type { HistoricalMetric, MonthlyObservation, Overview } from "@/lib/api/types";
import {
  isAvailable,
  marketCoverageLabel,
  monthLabel,
  monthlyTotal,
  monthlyComparison,
  percentDifference,
} from "@/lib/analytics";
import { carbonMass, carbonUnit, chf, kwh } from "@/lib/format";
import { api } from "@/lib/api/client";
import { DetailBlock, EvidenceInfoButton } from "./details";
import { AnalyticalInspector } from "./analytical-inspector";
import { AnnualEmissionsEvidence, type EmissionsProjection } from "./emissions-evidence";
import { CalculationDetails } from "./ui";
import { historicalDomain } from "@/lib/historical-domain";
import { priorCalendarMonth } from "@/lib/administration";

const METRICS = [
  {
    key: "costChf",
    label: "Cost",
    unit: "CHF",
    format: chf,
    Icon: Wallet,
    color: "var(--chart-1)",
  },
  {
    key: "energyKwh",
    label: "Energy",
    unit: "kWh",
    format: kwh,
    Icon: Zap,
    color: "var(--chart-4)",
  },
  {
    key: "co2Kg",
    label: "Location-based CO₂",
    unit: "kg CO₂",
    Icon: Cloud,
    color: "var(--historical-line)",
  },
  {
    key: "co2KgMarket",
    label: "Market-based CO₂",
    unit: "kg CO₂e",
    Icon: Leaf,
    color: "var(--chart-3)",
  },
] as const;

function monthlyMetrics(overview?: Overview) {
  return METRICS.map((m) => {
    if ("format" in m) return m;
    const kpi = m.key === "co2Kg" ? overview?.co2Location : overview?.co2Market;
    const sourceUnit =
      overview?.monthly.find((row) => row.evidence?.[m.key])?.evidence?.[m.key]?.units ??
      kpi?.calc.units ??
      m.unit;
    const unit = carbonUnit(sourceUnit);
    // The monthly observation fields are measured in kilograms.
    return { ...m, unit, format: (value: number | null | undefined) => carbonMass(value, unit) };
  });
}

export type HistoricalSelection = { metric: HistoricalMetric; month: string | undefined };

export function HistoricalPerformance({
  overview,
  emissionsProjection,
  initialSelection,
  onSelectionChange,
}: {
  overview: Overview;
  emissionsProjection?: EmissionsProjection;
  initialSelection?: HistoricalSelection | undefined;
  onSelectionChange?: (selection: HistoricalSelection) => void;
}) {
  const metrics = monthlyMetrics(overview);
  const rows = overview.monthly;
  const first = metrics.find((m) => rows.some((row) => isAvailable(row[m.key]))) ?? metrics[0]!;
  const [metric, updateMetric] = useState<HistoricalMetric>(initialSelection?.metric ?? first.key);
  const [selectedMonth, updateMonth] = useState<string | undefined>(initialSelection?.month);
  const setMetric = (value: HistoricalMetric) => {
    updateMetric(value);
    onSelectionChange?.({ metric: value, month: selectedMonth });
  };
  const setSelectedMonth = (value: string) => {
    updateMonth(value);
    onSelectionChange?.({ metric, month: value });
  };
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const reduced = useReducedMotion();
  const summaryId = useId();
  const current = metrics.find((m) => m.key === metric) ?? first;
  const selected = rows.find((r) => r.month === selectedMonth) ?? rows.at(-1);
  const period = rows.length
    ? `${monthLabel(rows[0]?.month ?? "")} — ${monthLabel(rows.at(-1)?.month ?? "")}`
    : "Unavailable";
  const evidence = selected?.evidence?.[metric];
  const total = monthlyTotal(rows, metric);
  const values = rows.map((r) => r[metric]).filter(isAvailable);
  const domain = historicalDomain(values, false);
  return (
    <section data-analysis-region className="min-w-0 border-b py-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Monthly performance</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {period} · monthly totals ·{" "}
            {api.isDemo ? "DEMO historical illustration" : "Backend reporting values"}
          </p>
        </div>
      </header>
      <div className="@container">
        <div className="grid grid-cols-1 gap-x-3 @sm:grid-cols-2 @4xl:grid-cols-4">
          {metrics.map((m) => {
            const t = monthlyTotal(rows, m.key);
            const comparison = monthlyComparison(rows, m.key);
            return (
              <div key={m.key} className="relative min-w-0">
                <Button
                  variant="ghost"
                  aria-pressed={metric === m.key}
                  onClick={() => setMetric(m.key)}
                  className="grid h-full min-h-28 w-full auto-rows-min items-start justify-start gap-2 whitespace-normal rounded-none border-b-2 border-border p-3 pr-11 text-left aria-pressed:border-accent-ink aria-pressed:bg-primary/10"
                >
                  <span className="flex min-h-9 items-center text-xs font-medium">{m.label}</span>
                  <span className="num break-words text-xl font-semibold">{m.format(t.value)}</span>
                  <span className="text-[11px] font-normal text-muted-foreground">
                    {t.available}/{t.total} months ·{" "}
                    {m.key === "co2KgMarket" && !api.isDemo
                      ? "covered activity subtotal"
                      : t.available < t.total
                        ? "available subtotal"
                        : "historical period total"}
                  </span>
                  {comparison?.percentage != null && (
                    <span
                      className={`text-[11px] ${comparison.percentage >= 0 ? "text-success" : "text-warning"}`}
                    >
                      {Math.abs(comparison.percentage).toFixed(1)}%{" "}
                      {comparison.percentage >= 0 ? "decrease" : "increase"} vs {comparison.period}
                    </span>
                  )}
                </Button>
                <div className="absolute right-1 top-3">
                  <EvidenceInfoButton
                    description={m.label}
                    onClick={() => {
                      setMetric(m.key);
                      setEvidenceOpen(true);
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <AnalyticalInspector
        title={`${current.label} · historical evidence`}
        description={`${selected ? monthLabel(selected.month) : period} · ${current.unit}/month`}
        trigger={null}
        open={evidenceOpen}
        onOpenChange={setEvidenceOpen}
        contentKey={`${metric}:${selected?.month ?? ""}`}
      >
        <DetailBlock title="Monthly observations">
          <p>
            {total.available}/{total.total} months available ·{" "}
            {selected?.status ?? "Status unavailable"}
          </p>
          <p>{selected ? current.format(selected[metric]) : "No month selected"}</p>
          {metric === "co2KgMarket" && selected?.marketCoverage && (
            <p>{marketCoverageLabel(selected.marketCoverage)}</p>
          )}
        </DetailBlock>
        {evidence ? (
          <CalculationDetails key={`${metric}:${selected?.month}`} calc={evidence} />
        ) : (
          <p className="text-muted-foreground">
            Month-specific calculation details are unavailable.
          </p>
        )}
        {(metric === "co2Kg" || metric === "co2KgMarket") && (
          <AnnualEmissionsEvidence
            overview={overview}
            market={metric === "co2KgMarket"}
            projection={emissionsProjection}
          />
        )}
      </AnalyticalInspector>
      {total.value != null ? (
        <>
          <div
            data-inspector-interactive
            className="historical-plot mt-6 h-80 min-w-0"
            role="img"
            aria-label={`${current.label} monthly totals`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={rows}
                margin={{ top: 15, left: 5, right: 28, bottom: 10 }}
                onClick={(state) => {
                  if (typeof state?.activeLabel === "string") setSelectedMonth(state.activeLabel);
                }}
              >
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(month: string) => monthLabel(month)}
                  minTickGap={24}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                />
                <YAxis
                  width={110}
                  domain={domain}
                  tickCount={5}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={current.format}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                />
                <Tooltip
                  cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
                  content={({ active, payload }) => {
                    const row = payload?.[0]?.payload;
                    if (!active || !row) return null;
                    const value: unknown = row[metric];
                    const previous = row.previous?.[metric];
                    const change =
                      isAvailable(value) && previous
                        ? percentDifference(previous.value, value)
                        : null;
                    return (
                      <div className="rounded-lg border bg-popover p-3 text-xs shadow-sm">
                        <b>{monthLabel(row.month)}</b>
                        <p className="mt-2">
                          {current.label}:{" "}
                          {isAvailable(value) ? current.format(value) : "Unavailable"}
                        </p>
                        <p className="mt-1 text-muted-foreground">
                          {row.status ?? (api.isDemo ? "DEMO" : "Status not supplied")} ·{" "}
                          {current.unit}/month
                        </p>
                        {metric === "co2KgMarket" && row.marketCoverage?.coveragePct != null && (
                          <p className="mt-1 text-muted-foreground">
                            {row.marketCoverage.coveragePct.toFixed(1)}% of modeled energy covered
                          </p>
                        )}
                        {change != null && (
                          <p className={change >= 0 ? "text-success" : "text-warning"}>
                            {Math.abs(change).toFixed(1)}%{" "}
                            {change > 0 ? "decrease" : change < 0 ? "increase" : "change"} vs{" "}
                            {previous.period}
                          </p>
                        )}
                      </div>
                    );
                  }}
                />
                {selected && isAvailable(selected[metric]) && (
                  <ReferenceDot
                    x={selected.month}
                    y={selected[metric]}
                    r={6}
                    fill="var(--historical-line)"
                    stroke="var(--foreground)"
                  />
                )}
                <Line
                  type="linear"
                  dataKey={metric}
                  stroke="var(--historical-line)"
                  strokeWidth={2.5}
                  connectNulls={false}
                  dot={{ r: 3, fill: "var(--historical-line)", stroke: "var(--background)" }}
                  activeDot={{
                    r: 6,
                    fill: "var(--historical-line)",
                    stroke: "var(--background)",
                    strokeWidth: 2,
                  }}
                  isAnimationActive={!reduced}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="num text-xs text-muted-foreground">
              {current.unit}/month · observed min{" "}
              {values.length ? current.format(Math.min(...values)) : "Unavailable"} · max{" "}
              {values.length ? current.format(Math.max(...values)) : "Unavailable"}
            </p>
          </div>
        </>
      ) : (
        <p className="py-8 text-muted-foreground">Monthly {current.label} is unavailable.</p>
      )}
      {rows.length > 0 && (
        <div
          className="mt-3 flex gap-2 overflow-x-auto pb-2"
          aria-label="Inspect a monthly observation"
        >
          {rows.map((r) => (
            <Button
              key={r.month}
              size="sm"
              variant={selected?.month === r.month ? "default" : "outline"}
              className="shrink-0"
              aria-label={`${monthLabel(r.month)} ${current.label}: ${isAvailable(r[metric]) ? current.format(r[metric]) : "Unavailable"}`}
              aria-pressed={selected?.month === r.month}
              onClick={() => setSelectedMonth(r.month)}
            >
              {monthLabel(r.month)}
            </Button>
          ))}
        </div>
      )}
      {selected && (
        <SelectedMonthSummary id={summaryId} rows={rows} selected={selected} overview={overview} />
      )}
    </section>
  );
}

export function SelectedMonthSummary({
  id,
  rows,
  selected,
  overview,
}: {
  id: string;
  rows: MonthlyObservation[];
  selected: MonthlyObservation;
  overview?: Overview;
}) {
  const previous = rows.find((row) => row.month === priorCalendarMonth(selected.month));
  return (
    <section id={id} aria-label="Selected month summary" className="@container mt-5 border-t pt-4">
      <header className="mb-3 flex flex-wrap items-center gap-3">
        <h3 className="font-semibold">{monthLabel(selected.month, "long")} — Observed results</h3>
        <span className="text-xs text-muted-foreground">
          {selected.status ?? (api.isDemo ? "DEMO" : "Status not supplied")}
        </span>
      </header>
      <dl className="grid gap-3 @md:grid-cols-2 @4xl:grid-cols-4">
        {monthlyMetrics(overview).map(({ key, label, Icon, color, format }) => {
          const value = selected[key];
          const before = previous?.[key];
          const change =
            isAvailable(value) && isAvailable(before) ? percentDifference(before, value) : null;
          return (
            <div key={key} className="min-w-0 border-b px-2 pb-3 pt-1">
              <dt className="flex items-center gap-2 text-xs">
                <Icon aria-hidden className="size-4 shrink-0" style={{ color }} />
                {label}
              </dt>
              <dd className="num mt-2 break-words text-lg font-semibold">
                {isAvailable(value) ? format(value) : "Unavailable"}
              </dd>
              <dd>
                <ObservationSparkline
                  rows={rows}
                  metric={key}
                  selected={selected.month}
                  color={color}
                />
              </dd>
              <dd className="text-xs text-muted-foreground">
                {change == null
                  ? "Monthly change unavailable"
                  : `${change === 0 ? "0.0%" : `${Math.abs(change).toFixed(1)}% ${change > 0 ? "decrease" : "increase"}`} vs previous month`}
              </dd>
              {key === "co2KgMarket" && (
                <dd className="mt-1 text-xs text-muted-foreground">
                  {selected.marketCoverage
                    ? marketCoverageLabel(selected.marketCoverage)
                    : "Market coverage unavailable."}
                  {selected.marketCoverage?.status === "partial" && " Covered subtotal."}
                </dd>
              )}
            </div>
          );
        })}
      </dl>
    </section>
  );
}

function monthIndex(month: string) {
  const year = Number(month.slice(0, 4));
  const number = Number(month.slice(5, 7));
  return year * 12 + number;
}

function ObservationSparkline({
  rows,
  metric,
  selected,
  color,
}: {
  rows: MonthlyObservation[];
  metric: HistoricalMetric;
  selected: string;
  color: string;
}) {
  const values = rows.map((row) => row[metric]).filter(isAvailable);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const first = monthIndex(rows[0]?.month ?? selected);
  const span = monthIndex(rows.at(-1)?.month ?? selected) - first;
  const x = (month: string) => (span > 0 ? 6 + ((monthIndex(month) - first) / span) * 108 : 60);
  const y = (value: number) => (max > min ? 33 - ((value - min) / (max - min)) * 26 : 20);
  return (
    <svg
      viewBox="0 0 120 40"
      className="my-1 h-10 w-full"
      role="img"
      aria-label={
        values.length
          ? "Historical observations with selected month marked"
          : "Historical observations unavailable"
      }
    >
      <line
        x1={x(selected)}
        x2={x(selected)}
        y1="3"
        y2="37"
        className="stroke-muted-foreground/50"
        strokeDasharray="2 2"
      />
      {rows.map((row, index) => {
        const value = row[metric];
        if (!isAvailable(value)) return null;
        const previous = rows[index - 1];
        const before = previous?.[metric];
        return (
          <g key={row.month}>
            {previous &&
              previous.month === priorCalendarMonth(row.month) &&
              isAvailable(before) && (
                <line
                  x1={x(previous.month)}
                  y1={y(before)}
                  x2={x(row.month)}
                  y2={y(value)}
                  stroke={color}
                  strokeWidth="1.75"
                />
              )}
            <circle
              cx={x(row.month)}
              cy={y(value)}
              r={row.month === selected ? 3.5 : 1.75}
              fill={color}
              className={row.month === selected ? "stroke-foreground" : undefined}
            />
          </g>
        );
      })}
    </svg>
  );
}
