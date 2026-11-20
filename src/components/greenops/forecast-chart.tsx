import { Area, ComposedChart, CartesianGrid, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Forecast } from "@/lib/api/types";

export function ForecastChart({ f, format, height = 260 }: { f: Forecast; format: (n: number) => string; height?: number }) {
  const data = f.points.map((p) => ({ year: String(p.year), base: p.baseline.mid, baseRange: [p.baseline.low, p.baseline.high], opt: p.optimized.mid, optRange: [p.optimized.low, p.optimized.high], observed: p.observed }));
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="year" tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={format} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={false} tickLine={false} width={72} />
          <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} formatter={(v: number | number[]) => (Array.isArray(v) ? `${format(v[0]!)} – ${format(v[1]!)}` : format(v))} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Area dataKey="baseRange" name="Range without action" stroke="none" fill="var(--forecast)" fillOpacity={0.15} isAnimationActive />
          <Area dataKey="optRange" name="Range with package" stroke="none" fill="var(--primary)" fillOpacity={0.18} />
          <Line dataKey="base" name="Forecast without action" stroke="var(--forecast)" strokeDasharray="5 4" strokeWidth={2} dot={false} />
          <Line dataKey="opt" name="Forecast with package" stroke="var(--primary)" strokeDasharray="5 4" strokeWidth={2.5} dot={false} />
          <Line dataKey="observed" name="Baseline year (observed)" stroke="var(--foreground)" strokeWidth={0} dot={{ r: 5, fill: "var(--foreground)" }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
