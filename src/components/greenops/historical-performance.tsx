// GreenOps adaptation of the supplied LineChart6: metric cards, dotted plot, cursor and active point.
import { useState, useId } from "react";
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
import type { HistoricalMetric, Overview } from "@/lib/api/types";
import {
  isAvailable,
  monthLabel,
  monthlyTotal,
  monthlyComparison,
  percentDifference,
} from "@/lib/analytics";
import { chf, kg, kwh } from "@/lib/format";
import { api } from "@/lib/api/client";
import { DetailBlock, DetailDrawer } from "./details";
import { CalcInfo } from "./ui";
import { historicalDomain } from "@/lib/historical-domain";
import { reveal } from "@/lib/reveal";

const METRICS = [
  { key: "costChf" as const, label: "Cost", unit: "CHF/month", format: chf },
  { key: "co2Kg" as const, label: "CO₂ — Location-based", unit: "kg CO₂/month", format: kg },
  { key: "energyKwh" as const, label: "Energy", unit: "kWh/month", format: kwh },
  { key: "co2KgMarket" as const, label: "CO₂ — Market-based", unit: "kg CO₂/month", format: kg },
] as const;
export function HistoricalPerformance({
  overview,
  operational = false,
}: {
  overview: Overview;
  operational?: boolean;
}) {
  const metrics = operational
    ? [METRICS[2], METRICS[0], METRICS[1], METRICS[3]].filter((m) => m != null)
    : METRICS;
  const first =
    metrics.find((m) => overview.monthly.some((r) => isAvailable(r[m.key]))) ?? METRICS[0];
  const [metric, setMetric] = useState<HistoricalMetric>(first.key);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const reduced = useReducedMotion();
  const summaryId = useId();
  const [zero, setZero] = useState(false);
  const chooseMonth = (month: string) => {
    setSelectedMonth(month);
    reveal(summaryId);
  };
  const current = METRICS.find((m) => m.key === metric) ?? METRICS[0];
  const rows = overview.monthly;
  const selected = rows.find((r) => r.month === selectedMonth);
  const period = rows.length
    ? `${monthLabel(rows[0]?.month ?? "")} — ${monthLabel(rows.at(-1)?.month ?? "")}`
    : "Unavailable";
  const evidence = selected?.evidence?.[metric];
  const total = monthlyTotal(rows, metric);
  const values = rows.map((r) => r[metric]).filter(isAvailable);
  const domain = historicalDomain(values, zero);
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
        <DetailDrawer
          title={`${current.label} · historical evidence`}
          description={`${selected ? monthLabel(selected.month) : period} · ${current.unit}`}
          trigger={
            <Button variant="outline" size="sm">
              Calculation & Evidence
            </Button>
          }
        >
          <DetailBlock title="Selected metric & reporting period">
            <p>
              {current.label} · {selected ? monthLabel(selected.month) : period}
            </p>
            <p className="mt-2">
              {current.unit} · {selected?.status ?? (api.isDemo ? "DEMO" : "Status not supplied")}
            </p>
          </DetailBlock>
          <DetailBlock title="Displayed coverage">
            <p>
              {total.available}/{total.total} months available. Missing observations are not zero.
            </p>
          </DetailBlock>
          {evidence ? (
            <>
              <DetailBlock title="Formula">
                <p>{evidence.formula}</p>
              </DetailBlock>
              <DetailBlock title="Source records">
                <p>{evidence.sources.join(" · ") || "Unavailable"}</p>
              </DetailBlock>
              <DetailBlock title="Assumptions">
                <p>{evidence.assumptions.join(" · ") || "None supplied"}</p>
              </DetailBlock>
              <DetailBlock title="Limitations">
                <p>{evidence.limitations.join(" · ") || "None supplied"}</p>
              </DetailBlock>
            </>
          ) : (
            <DetailBlock title="Monthly evidence unavailable">
              <p>
                No {selected ? "month-specific" : "monthly"} formula, source records or allocation
                assumptions have been supplied. Annual KPI evidence does not validate these monthly
                points.
              </p>
            </DetailBlock>
          )}
        </DetailDrawer>
      </header>
      <div className="grid grid-cols-1 border-y sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((m) => {
          const t = monthlyTotal(rows, m.key);
          const comparison = monthlyComparison(rows, m.key);
          return (
            <Button
              key={m.key}
              variant="ghost"
              disabled={t.value == null}
              aria-pressed={metric === m.key}
              onClick={() => {
                setMetric(m.key);
              }}
              className={`h-auto min-h-28 flex-col items-start justify-center whitespace-normal rounded-none border-r p-4 text-left ${metric === m.key ? "bg-muted" : ""}`}
            >
              <span className="text-xs text-muted-foreground">{m.label}</span>
              <span className="num mt-2 break-words text-xl font-semibold">
                {t.value == null ? "Unavailable" : m.format(t.value)}
              </span>
              <span className="mt-2 text-[11px] font-normal text-muted-foreground">
                {t.available}/{t.total} months ·{" "}
                {t.available < t.total ? "available subtotal" : "historical period total"}
              </span>
              {comparison?.percentage != null && (
                <span
                  className={`mt-2 text-[11px] ${comparison.percentage >= 0 ? "text-success" : "text-warning"}`}
                >
                  {Math.abs(comparison.percentage).toFixed(1)}%{" "}
                  {comparison.percentage >= 0 ? "decrease" : "increase"} vs {comparison.period}
                </span>
              )}
            </Button>
          );
        })}
      </div>
      {total.value != null ? (
        <>
          <div
            className="historical-plot mt-6 h-80 min-w-0"
            role="img"
            aria-label={`${current.label} monthly totals`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={rows}
                margin={{ top: 15, left: 5, right: 28, bottom: 10 }}
                onClick={(state) => {
                  if (typeof state?.activeLabel === "string") chooseMonth(state.activeLabel);
                }}
              >
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={monthLabel}
                  minTickGap={24}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                />
                <YAxis
                  width={95}
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
                          {current.unit}
                        </p>
                        {change != null && (
                          <p className={change >= 0 ? "text-success" : "text-warning"}>
                            {change.toFixed(1)}% decrease vs {previous.period}
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
                    fill="var(--chart-2)"
                    stroke="var(--foreground)"
                  />
                )}
                <Line
                  type="linear"
                  dataKey={metric}
                  stroke="var(--chart-2)"
                  strokeWidth={2.5}
                  connectNulls={false}
                  dot={{ r: 3, fill: "var(--chart-2)", stroke: "var(--background)" }}
                  activeDot={{
                    r: 6,
                    fill: "var(--chart-2)",
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
              {current.unit} · observed min{" "}
              {values.length ? current.format(Math.min(...values)) : "Unavailable"} · max{" "}
              {values.length ? current.format(Math.max(...values)) : "Unavailable"}
            </p>
            <Button size="sm" variant="ghost" aria-pressed={zero} onClick={() => setZero(!zero)}>
              {zero ? "Focused axis" : "Start at zero"}
            </Button>
          </div>
          <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="w-6 border-t-2 border-chart-2" />
            {current.label} · {current.unit} · solid line and points: supplied historical totals ·
            gaps: unavailable
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Select a month to inspect its results
          </p>
          <div
            className="mt-3 flex gap-2 overflow-x-auto pb-2"
            aria-label="Inspect a monthly observation"
          >
            {rows.map((r) => (
              <Button
                key={r.month}
                size="sm"
                variant={selectedMonth === r.month ? "secondary" : "outline"}
                className="shrink-0"
                aria-label={`${monthLabel(r.month)} ${current.label}: ${isAvailable(r[metric]) ? current.format(r[metric]) : "Unavailable"}`}
                aria-pressed={selectedMonth === r.month}
                onClick={() => chooseMonth(r.month)}
              >
                {monthLabel(r.month)}
              </Button>
            ))}
          </div>
          {selected && (
            <section id={summaryId} role="status" className="mt-5 border-t pt-4">
              <header className="mb-3 flex flex-wrap items-center gap-3">
                <h3 className="font-semibold">{monthLabel(selected.month)}</h3>
                <span className="text-xs text-muted-foreground">
                  {selected.status ?? (api.isDemo ? "DEMO" : "Status not supplied")}
                </span>
              </header>
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {METRICS.map((m) => {
                  const calculation = selected.evidence?.[m.key];
                  return (
                    <div key={m.key} className="min-w-0 border-b pb-3">
                      <dt className="text-xs text-muted-foreground">{m.label}</dt>
                      <dd className="num mt-2 break-words text-base">
                        {isAvailable(selected[m.key]) ? m.format(selected[m.key]) : "Unavailable"}
                      </dd>
                      {calculation && <CalcInfo calc={calculation} />}
                    </div>
                  );
                })}
              </dl>
            </section>
          )}
        </>
      ) : (
        <p className="py-12 text-muted-foreground">
          Monthly {current.label} is unavailable. Annual totals cannot supply monthly observations.
        </p>
      )}
    </section>
  );
}
