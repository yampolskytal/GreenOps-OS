import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/greenops/shell";
import { ChartCard, DemoTag, Q } from "@/components/greenops/ui";
import { ForecastChart } from "@/components/greenops/forecast-chart";
import type { Forecast } from "@/lib/api/types";
import { useForecast } from "@/lib/queries";
import { kchf, kg, kwh } from "@/lib/format";
import { cn } from "@/lib/utils";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/forecast")({
  head: () => seo("Forecast — GreenOps OS", "Costs, energy and CO₂ for the coming years, with and without the package, with ranges."),
  component: ForecastPage,
});
const METRICS: { id: Forecast["metric"]; label: string; fmt: (n: number) => string }[] = [
  { id: "cost", label: "Cost", fmt: kchf }, { id: "energy", label: "Energy", fmt: kwh }, { id: "co2Location", label: "CO₂ location-based", fmt: kg }, { id: "co2Market", label: "CO₂ market-based", fmt: kg },
];

function ForecastPage() {
  const [metric, setMetric] = useState<Forecast["metric"]>("co2Location"); const [h, setH] = useState(3);
  const fc = useForecast(metric, h); const m = METRICS.find((x) => x.id === metric)!;
  return (
    <AppShell kicker="Forecast" title="Looking ahead" subtitle="Forecasts are estimates, not observations. Shaded areas show low–high ranges." actions={<DemoTag />}>
      <ChartCard title={`${m.label} per year`} action={<div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">Horizon</span>{[3, 5].map((y) => <button key={y} onClick={() => setH(y)} className={cn("rounded-md px-2.5 py-1 text-xs", h === y ? "bg-secondary" : "text-muted-foreground")}>{y} years</button>)}</div>}>
        <div className="mb-4 flex flex-wrap gap-1">{METRICS.map((x) => <button key={x.id} onClick={() => setMetric(x.id)} className={cn("rounded-full border px-3 py-1 text-xs", metric === x.id ? "border-primary text-primary" : "text-muted-foreground")}>{x.label}</button>)}</div>
        <Q q={fc}>{(f) => <><ForecastChart f={f} format={m.fmt} height={340} /><div className="mt-4 rounded-lg bg-muted/60 p-3 text-sm"><b>Growth assumption:</b> <span className="text-muted-foreground">{f.growthAssumption}</span></div></>}</Q>
      </ChartCard>
    </AppShell>
  );
}
