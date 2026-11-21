// PriceTargetFan adaptation: source-backed history, scenario paths, ranges and keyboard inspection.
import { useState, useRef, useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  forecastLabel,
  isAvailable,
  percentDifference,
  recentForecastHistory,
} from "@/lib/analytics";
import type { Forecast, MonthlyObservation, Range } from "@/lib/api/types";
import { api } from "@/lib/api/client";

type PlotPoint = {
  time: number;
  label: string;
  observed: number | null;
  baseline?: Range;
  optimized?: Range;
  coverage: string;
  projected: boolean;
};
const validRange = (r: Range | null | undefined): r is Range =>
  !!r && [r.low, r.mid, r.high].every(isAvailable) && r.low <= r.mid && r.mid <= r.high;
export function ForecastChart({
  f,
  format,
  height = 320,
  history = [],
}: {
  f: Forecast;
  format: (n: number) => string;
  height?: number;
  history?: MonthlyObservation[];
}) {
  const reduced = useReducedMotion();
  const [active, setActive] = useState<number | null>(null);
  const chart = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(700);
  useEffect(() => {
    const node = chart.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setWidth(Math.max(240, node.clientWidth)));
    observer.observe(node);
    return () => observer.disconnect();
  }, [f.metric, f.points.length]);
  const actual = f.granularity === "monthly" ? recentForecastHistory(history, f.metric) : [];
  const source: PlotPoint[] = f.points
    .map((p) => ({
      time: p.date ? new Date(p.date).getTime() : Date.UTC(p.year, 0, 1),
      label: forecastLabel(p),
      observed: isAvailable(p.observed) ? p.observed : null,
      ...(validRange(p.baseline) ? { baseline: p.baseline } : {}),
      ...(validRange(p.optimized) ? { optimized: p.optimized } : {}),
      coverage:
        p.coverage ??
        (f.granularity === "monthly" ? "Supplied monthly model point" : "Supplied annual endpoint"),
      projected: !isAvailable(p.observed),
    }))
    .filter((p) => Number.isFinite(p.time));
  const combined = new Map<number, PlotPoint>();
  for (const row of actual)
    combined.set(new Date(row.date).getTime(), {
      time: new Date(row.date).getTime(),
      label: row.label,
      observed: row.value,
      coverage: row.coverage,
      projected: false,
    });
  for (const p of source) {
    const old = combined.get(p.time);
    combined.set(
      p.time,
      old
        ? {
            ...p,
            observed: old.observed,
            projected: false,
            coverage: `${old.coverage} · ${p.coverage}`,
          }
        : p,
    );
  }
  const points = [...combined.values()].sort((a, b) => a.time - b.time);
  const values = points
    .flatMap((p) => [
      p.observed,
      p.baseline?.low,
      p.baseline?.high,
      p.optimized?.low,
      p.optimized?.high,
    ])
    .filter(isAvailable);
  const first = points[0],
    last = points.at(-1);
  if (!first || !last || !values.length)
    return (
      <p className="py-12 text-muted-foreground">
        Cannot calculate: forecast observations or model values are unavailable.
      </p>
    );
  const W = width,
    H = height,
    left = width < 480 ? 72 : 95,
    right = 16,
    top = 34,
    bottom = 52;
  const min = Math.min(0, ...values),
    max = Math.max(1, ...values) * 1.08;
  const x = (p: PlotPoint) =>
    left + ((p.time - first.time) / Math.max(1, last.time - first.time)) * (W - left - right);
  const y = (v: number) => top + (1 - (v - min) / (max - min)) * (H - top - bottom);
  const lastActual = points.filter((p) => p.observed != null).at(-1);
  const boundary = lastActual?.time ?? points.find((p) => p.projected)?.time ?? first.time;
  const scenario = points.filter((p) => p.time >= boundary);
  const line = (key: "baseline" | "optimized", bound: "low" | "mid" | "high") => {
    let connected = false;
    return scenario
      .map((p) => {
        const r = p[key];
        if (!r) {
          connected = false;
          return "";
        }
        const segment = `${connected ? "L" : "M"}${x(p)},${y(r[bound])}`;
        connected = true;
        return segment;
      })
      .join(" ");
  };
  const band = (key: "baseline" | "optimized") => {
    const segments: PlotPoint[][] = [];
    let group: PlotPoint[] = [];
    for (const p of scenario) {
      if (p[key]) group.push(p);
      else if (group.length) {
        segments.push(group);
        group = [];
      }
    }
    if (group.length) segments.push(group);
    return segments
      .map(
        (segment) =>
          segment.map((p, i) => `${i ? "L" : "M"}${x(p)},${y(p[key]?.high ?? 0)}`).join(" ") +
          " " +
          [...segment]
            .reverse()
            .map((p) => `L${x(p)},${y(p[key]?.low ?? 0)}`)
            .join(" ") +
          " Z",
      )
      .join(" ");
  };
  let prior: PlotPoint | null = null;
  const actualPath = points
    .map((p) => {
      if (p.observed == null) {
        prior = null;
        return "";
      }
      const consecutive =
        prior && (f.granularity !== "monthly" || p.time - prior.time <= 32 * 86400000);
      const d = `${consecutive ? "L" : "M"}${x(p)},${y(p.observed)}`;
      prior = p;
      return d;
    })
    .join(" ");
  const selected = active == null ? null : points[active];
  const hasBands = scenario.some(
    (p) =>
      (p.baseline && p.baseline.low !== p.baseline.high) ||
      (p.optimized && p.optimized.low !== p.optimized.high),
  );
  return (
    <div ref={chart} className="min-w-0">
      <div className="mb-4 flex flex-wrap gap-x-5 gap-y-2 text-xs" aria-label="Forecast legend">
        <span className="flex items-center gap-2">
          <span className="w-6 border-t-2 border-forecast-actual" />
          Actual history
        </span>
        <span className="flex items-center gap-2">
          <span className="w-6 border-t-2 border-dashed border-forecast-without" />
          Without changes
        </span>
        <span className="flex items-center gap-2">
          <span className="w-6 border-t-2 border-dashed border-forecast-plan" />
          With Current Plan
        </span>
        {hasBands && <span>Shaded bands: supplied low–high uncertainty</span>}
        <span className="text-muted-foreground">
          {f.unit} · {api.isDemo ? "DEMO projection" : "Active provider"}
        </span>
      </div>
      <div className="w-full">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full"
          role="img"
          aria-label={`${f.unit}: actual history, without changes and Current Plan projections`}
        >
          {[0, 1, 2, 3, 4].map((i) => {
            const value = min + ((max - min) * i) / 4;
            return (
              <g key={i}>
                <line x1={left} x2={W - right} y1={y(value)} y2={y(value)} stroke="var(--border)" />
                <text
                  x={left - 10}
                  y={y(value) + 4}
                  textAnchor="end"
                  fontSize="12"
                  fill="var(--muted-foreground)"
                >
                  {format(value)}
                </text>
              </g>
            );
          })}
          <text x={left} y={17} fontSize="11" fill="var(--muted-foreground)">
            {lastActual
              ? width < 480
                ? "Actual → Forecast"
                : "Actual period → Forecast starts → Projected period"
              : width < 480
                ? "Projected period"
                : "Historical observations unavailable · Projected period"}
          </text>
          <line
            x1={x({ ...first, time: boundary })}
            x2={x({ ...first, time: boundary })}
            y1={top}
            y2={H - bottom}
            stroke="var(--muted-foreground)"
            strokeDasharray="3 5"
          />
          {(["baseline", "optimized"] as const).map((key) => (
            <g key={key}>
              {hasBands && (
                <motion.path
                  d={band(key)}
                  fill={key === "baseline" ? "var(--forecast-without)" : "var(--forecast-plan)"}
                  fillOpacity={0.1}
                  initial={{ opacity: reduced ? 1 : 0 }}
                  animate={{ opacity: 1 }}
                />
              )}
              <motion.path
                d={line(key, "mid")}
                fill="none"
                stroke={key === "baseline" ? "var(--forecast-without)" : "var(--forecast-plan)"}
                strokeWidth={2.5}
                strokeDasharray="6 5"
                initial={{ opacity: reduced ? 1 : 0 }}
                animate={{ opacity: 1 }}
              />
            </g>
          ))}
          <path d={actualPath} fill="none" stroke="var(--forecast-actual)" strokeWidth={2.5} />
          {points.map((p, i) => (
            <g key={`${p.time}-${i}`}>
              {p.observed != null && (
                <circle cx={x(p)} cy={y(p.observed)} r={4} fill="var(--forecast-actual)" />
              )}
              {(i === 0 ||
                i === points.length - 1 ||
                i % Math.max(1, Math.ceil(points.length / (width < 480 ? 2 : 5))) === 0) && (
                <text
                  x={x(p)}
                  y={H - 15}
                  textAnchor={i === points.length - 1 ? "end" : i === 0 ? "start" : "middle"}
                  fontSize="11"
                  fill="var(--muted-foreground)"
                >
                  {p.label}
                </text>
              )}
              {(p.optimized || p.observed != null) && (
                <circle
                  cx={x(p)}
                  cy={y(p.optimized?.mid ?? p.observed ?? 0)}
                  r={9}
                  fill="transparent"
                  tabIndex={0}
                  role="button"
                  aria-label={`${p.label}: ${p.projected ? "Projected" : "Actual"}, ${p.optimized ? format(p.optimized.mid) : p.observed != null ? format(p.observed) : "Unavailable"}`}
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onClick={() => setActive(i)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setActive(i);
                    }
                  }}
                />
              )}
            </g>
          ))}
        </svg>
      </div>
      <div role="status" className="mt-3 min-h-24 border-t pt-3 text-xs">
        {selected ? (
          <>
            <b>
              {selected.label} · {selected.projected ? "Projected" : "Actual observation"}
            </b>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
              <span>
                Actual: {selected.observed == null ? "Unavailable" : format(selected.observed)}
              </span>
              <span>
                Without changes: {selected.baseline ? format(selected.baseline.mid) : "Unavailable"}
              </span>
              <span>
                Current Plan: {selected.optimized ? format(selected.optimized.mid) : "Unavailable"}
              </span>
              {selected.baseline && selected.optimized && (
                <span>
                  Difference: {format(selected.baseline.mid - selected.optimized.mid)}
                  {percentDifference(selected.baseline.mid, selected.optimized.mid) != null
                    ? ` · ${percentDifference(selected.baseline.mid, selected.optimized.mid)?.toFixed(1)}%`
                    : ""}
                </span>
              )}
              <span className="text-muted-foreground">{selected.coverage}</span>
            </div>
          </>
        ) : (
          <p className="text-muted-foreground">
            {f.granularity === "monthly"
              ? `${actual.filter((p) => p.value != null).length}/6 recent historical months available. Missing observations remain gaps.`
              : "Annual model endpoints only. Monthly history cannot be mixed with annual totals; no monthly or quarterly variation is inferred."}
          </p>
        )}
        <p className="mt-2 text-muted-foreground">
          Zero-based axis: {format(min)}–{format(max)} {f.unit}. Forecast starts:{" "}
          {lastActual?.label ?? "No actual boundary supplied"}. Lines connect supplied model
          endpoints, not additional observations.
        </p>
      </div>
    </div>
  );
}
