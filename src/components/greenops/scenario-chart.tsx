// Adapted from the line-charts-4 Recharts pattern: card layout, grid, combined tooltip and
// clickable legend. Values come only from supplied history and forecast series; zero renders.
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ScenarioRow } from "@/lib/scenario-series";
import { isAvailable } from "@/lib/analytics";
import { cn } from "@/lib/utils";

export interface ScenarioSeries {
  key: string;
  label: string;
  color: string;
  dashed: boolean;
  hidden?: boolean;
  toggleable?: boolean;
}
export function ScenarioChart({
  rows,
  series,
  boundary,
  format,
  unit,
  milestones = [],
  height = 340,
  onToggle,
}: {
  rows: ScenarioRow[];
  series: ScenarioSeries[];
  boundary: number | null;
  format: (n: number) => string;
  unit: string;
  milestones?: { time: number; label: string }[];
  height?: number;
  onToggle?: (key: string) => void;
}) {
  const visible = series.filter((s) => !s.hidden);
  return (
    <div className="min-w-0">
      <ul className="mb-4 flex flex-wrap gap-x-4 gap-y-2 text-xs" aria-label="Chart legend">
        {series.map((s) => (
          <li key={s.key}>
            <button
              type="button"
              disabled={!s.toggleable || !onToggle}
              aria-pressed={!s.hidden}
              onClick={() => onToggle?.(s.key)}
              className={cn(
                "inline-flex items-center gap-2 rounded px-1 py-0.5",
                s.toggleable && onToggle && "hover:bg-muted",
                s.hidden && "opacity-45 line-through",
              )}
            >
              <svg width="22" height="8" aria-hidden="true">
                <line x1="1" x2="21" y1="4" y2="4" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.dashed ? "4 3" : undefined} />
              </svg>
              {s.label}
            </button>
          </li>
        ))}
      </ul>
      <div style={{ height }} className="w-full min-w-0" role="img" aria-label={`${unit} — ${visible.map((s) => s.label).join(", ")}`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 16, right: 16, bottom: 4, left: 4 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="time"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(t: number) =>
                new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" })
              }
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              stroke="var(--border)"
              minTickGap={24}
            />
            <YAxis
              domain={[0, "auto"]}
              tickFormatter={(v: number) => format(v)}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              stroke="var(--border)"
              width={92}
            />
            {boundary != null && (
              <ReferenceLine
                x={boundary}
                stroke="var(--muted-foreground)"
                strokeDasharray="2 4"
                label={{ value: "Forecast starts", position: "insideTopLeft", fill: "var(--muted-foreground)", fontSize: 11 }}
              />
            )}
            {milestones.map(({ time, label }) => (
              <ReferenceLine key={label} x={time} stroke="var(--info)" strokeDasharray="3 5" />
            ))}
            <Tooltip
              cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
              allowEscapeViewBox={{ x: false, y: false }}
              wrapperStyle={{ zIndex: 20, maxWidth: "min(320px, 80vw)" }}
              content={({ active, payload }) => {
                const r = payload?.[0]?.payload as ScenarioRow | undefined;
                if (!active || !r) return null;
                const base = r["noChange"];
                return (
                  <div className="rounded-md border bg-popover p-3 text-xs text-popover-foreground shadow-md">
                    <p className="font-semibold">{r.label}</p>
                    <p className="mb-2 text-muted-foreground">
                      {r.kind === "actual" ? "Actual observation" : "Projection"} · {unit}
                      {r.coverage ? ` · ${r.coverage}` : ""}
                    </p>
                    {visible.map((s) => {
                      const v = r[s.key];
                      if (!isAvailable(v)) return null;
                      const diff = isAvailable(base) && s.key !== "noChange" && s.key !== "history" ? base - v : null;
                      return (
                        <p key={s.key} className="flex justify-between gap-4">
                          <span className="inline-flex items-center gap-2">
                            <span className="inline-block size-2 rounded-full" style={{ background: s.color }} />
                            {s.label}
                          </span>
                          <span className="num">
                            {format(v)}
                            {diff != null && isAvailable(base) && base > 0 && (
                              <span className="ml-1 text-muted-foreground">
                                ({diff >= 0 ? "−" : "+"}
                                {format(Math.abs(diff))}, {((Math.abs(diff) / base) * 100).toFixed(1)}%)
                              </span>
                            )}
                          </span>
                        </p>
                      );
                    })}
                  </div>
                );
              }}
            />
            {visible.map((s) => (
              <Line
                key={s.key}
                dataKey={s.key}
                type="linear"
                stroke={s.color}
                strokeWidth={s.key === "history" ? 2.5 : 2}
                strokeDasharray={s.dashed ? "6 4" : undefined}
                dot={{ r: 3, fill: s.color, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
                connectNulls={s.key !== "history"}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Solid marks observed monthly values · dashed marks projections · {unit}
      </p>
    </div>
  );
}
