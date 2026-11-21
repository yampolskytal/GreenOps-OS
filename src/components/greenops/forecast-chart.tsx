// Adapted from the uploaded PriceTargetFan: animated history, projection paths, endpoint focus and scrub tooltip.
import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { Forecast } from "@/lib/api/types";
export function ForecastChart({
  f,
  format,
  height = 320,
}: {
  f: Forecast;
  format: (n: number) => string;
  height?: number;
}) {
  const reduced = useReducedMotion();
  const [active, setActive] = useState<number | null>(null);
  const points = f.points;
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last)
    return (
      <p className="py-12 text-center text-muted-foreground">Forecast points are unavailable.</p>
    );
  const W = 900,
    H = 360,
    left = 85,
    right = 170,
    top = 25,
    bottom = 50;
  const nums = points
    .flatMap((p) => [
      p.baseline.low,
      p.baseline.high,
      p.optimized.low,
      p.optimized.high,
      ...(p.observed == null ? [] : [p.observed]),
    ])
    .filter(Number.isFinite);
  const min = Math.min(...nums) * 0.9,
    max = Math.max(...nums) * 1.08;
  const y = (v: number) => top + (1 - (v - min) / (max - min || 1)) * (H - top - bottom);
  const x = (i: number) => left + (i / Math.max(1, points.length - 1)) * (W - left - right);
  const path = (series: "baseline" | "optimized", bound: "low" | "mid" | "high") =>
    points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p[series][bound])}`).join(" ");
  const band = (series: "baseline" | "optimized") =>
    `${path(series, "high")} ${[...points]
      .reverse()
      .map((p, i) => `L${x(points.length - 1 - i)},${y(p[series].low)}`)
      .join(" ")} Z`;
  const observed = points.map((p, i) => ({ p, i })).filter((v) => v.p.observed != null);
  const history = observed
    .map(({ p, i }, j) => `${j ? "L" : "M"}${x(i)},${y(p.observed ?? 0)}`)
    .join(" ");
  const selected = active == null ? null : points[active];
  const lastObserved = observed.at(-1);
  const boundary = lastObserved?.i ?? 0;
  const labelBase = Math.min(
    H - bottom - 65,
    Math.max(top + 18, (y(last.baseline.mid) + y(last.optimized.mid)) / 2 - 28),
  );
  return (
    <div className="relative w-full" style={{ minHeight: height }}>
      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block min-w-[640px] w-full"
          role="img"
          aria-label={`${f.unit} forecast with and without the selected plan`}
          onPointerLeave={() => setActive(null)}
          onPointerMove={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            const px = ((e.clientX - box.left) / box.width) * W;
            setActive(
              Math.max(
                0,
                Math.min(
                  points.length - 1,
                  Math.round(((px - left) / (W - left - right)) * (points.length - 1)),
                ),
              ),
            );
          }}
        >
          {Array.from({ length: 4 }, (_, i) => min + ((max - min) * i) / 3).map((v) => (
            <g key={v}>
              <line x1={left} x2={W - right} y1={y(v)} y2={y(v)} stroke="var(--border)" />
              <text
                x={left - 8}
                y={y(v) + 4}
                textAnchor="end"
                fontSize="12"
                fill="var(--muted-foreground)"
              >
                {format(v)}
              </text>
            </g>
          ))}
          {(["baseline", "optimized"] as const).map((series, i) => (
            <g key={series}>
              <motion.path
                d={band(series)}
                fill={i ? "var(--primary)" : "var(--forecast)"}
                fillOpacity={0.12}
                initial={{ opacity: reduced ? 1 : 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: reduced ? 0 : 0.5 }}
              />
              <motion.path
                key={`${f.metric}-${points.length}-${last[series].mid}`}
                d={path(series, "mid")}
                fill="none"
                stroke={i ? "var(--primary)" : "var(--forecast)"}
                strokeWidth="2.5"
                strokeDasharray="5 5"
                initial={{ opacity: reduced ? 1 : 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: reduced ? 0 : 0.8 }}
              />
              <circle
                cx={x(points.length - 1)}
                cy={y(last[series].mid)}
                r="4"
                fill="var(--card)"
                stroke={i ? "var(--primary)" : "var(--forecast)"}
              />
              <line
                x1={x(points.length - 1) + 5}
                y1={y(last[series].mid)}
                x2={W - right + 10}
                y2={labelBase + i * 48}
                stroke={i ? "var(--primary)" : "var(--forecast)"}
                strokeOpacity=".5"
              />
              <text
                x={W - right + 16}
                y={labelBase + i * 48}
                fill={i ? "var(--primary)" : "var(--forecast)"}
                fontSize="11"
              >
                {i ? "With selected plan" : "Without optimization"}
              </text>
              <text
                x={W - right + 16}
                y={labelBase + i * 48 + 18}
                fill="var(--foreground)"
                fontSize="13"
              >
                {format(last[series].mid)}
              </text>
            </g>
          ))}
          <line
            x1={x(boundary)}
            x2={x(boundary)}
            y1={top}
            y2={H - bottom}
            stroke="var(--muted-foreground)"
            strokeDasharray="3 5"
          />
          <motion.path
            d={history}
            fill="none"
            stroke="var(--foreground)"
            strokeWidth="3"
            initial={{ opacity: reduced ? 1 : 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reduced ? 0 : 0.8 }}
          />
          {observed.map(({ p, i }) => (
            <circle key={p.year} cx={x(i)} cy={y(p.observed ?? 0)} r="4" fill="var(--foreground)" />
          ))}
          {points.map((p, i) => (
            <g key={p.year}>
              <text
                x={x(i)}
                y={H - 18}
                fill="var(--muted-foreground)"
                textAnchor="middle"
                fontSize="12"
              >
                {p.year}
              </text>
              <circle
                tabIndex={0}
                role="button"
                aria-label={`${p.year}: without plan ${format(p.baseline.mid)}, with plan ${format(p.optimized.mid)}`}
                cx={x(i)}
                cy={y(p.optimized.mid)}
                r="8"
                fill="transparent"
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                onClick={() => setActive(i)}
              />
            </g>
          ))}
          {active != null && (
            <line
              x1={x(active)}
              x2={x(active)}
              y1={top}
              y2={H - bottom}
              stroke="var(--foreground)"
              strokeOpacity=".3"
            />
          )}
        </svg>
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span>● Observed annual baseline</span>
        <span className="text-forecast">┄ Without optimization</span>
        <span className="text-primary">┄ With selected plan</span>
        <span>Shading: supported low–high estimates</span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Forecast boundary: {points[boundary]?.year}. Annual endpoints only; connecting lines are
        visual interpolation, not additional observations.
      </p>
      {selected && (
        <div role="status" className="mt-3 rounded-lg border bg-popover p-3 text-xs">
          <b>
            {selected.year}
            {selected.observed != null ? " · Observed baseline" : " · Projected"}
          </b>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
            <span>
              Without: {format(selected.baseline.mid)} ({format(selected.baseline.low)}–
              {format(selected.baseline.high)})
            </span>
            <span>
              With plan: {format(selected.optimized.mid)} ({format(selected.optimized.low)}–
              {format(selected.optimized.high)})
            </span>
            <span>Difference: {format(selected.baseline.mid - selected.optimized.mid)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
