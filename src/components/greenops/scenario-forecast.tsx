import { useEffect, useState } from "react";
import type { Forecast } from "@/lib/api/types";
import { api } from "@/lib/api/client";
import { useOverview } from "@/lib/queries";
import { useSelectionForecasts } from "@/lib/path-queries";
import { buildScenarioChart } from "@/lib/scenario-series";
import { SUPPORTED_FORECAST_HORIZONS } from "@/lib/analytics";
import { kchf, kg, kwh } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ScenarioChart, type ScenarioSeries } from "./scenario-chart";

export const FORECAST_METRICS = [
  { id: "cost" as const, label: "Cost", unit: "CHF", fmt: kchf },
  { id: "co2Location" as const, label: "CO₂ location-based", unit: "kg CO₂", fmt: kg },
  { id: "energy" as const, label: "Energy", unit: "kWh", fmt: kwh },
  { id: "co2Market" as const, label: "CO₂ market-based", unit: "kg CO₂", fmt: kg },
];
export interface ScenarioSelection {
  key: string;
  label: string;
  color: string;
  measureIds: string[];
  toggleable?: boolean;
  defaultHidden?: boolean;
}
export function ScenarioForecastPanel({
  selections,
  title,
  emptyNote,
  onForecast,
  showDetails = false,
  initialMetric,
}: {
  selections: ScenarioSelection[];
  title: string;
  emptyNote?: string;
  initialMetric?: Forecast["metric"];
  onForecast?: (forecast: Forecast | null) => void;
  showDetails?: boolean;
}) {
  const ov = useOverview();
  const support = ov.data?.forecastSupport ?? [];
  const supported = (id: Forecast["metric"]) => support.some((x) => x.metric === id && x.horizons.length);
  const [chosen, setChosen] = useState<Forecast["metric"] | null>(initialMetric ?? null);
  const [chosenH, setH] = useState<number | null>(null);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const metric = chosen && supported(chosen) ? chosen : (FORECAST_METRICS.find((m) => supported(m.id))?.id ?? "cost");
  const horizons = (support.find((x) => x.metric === metric)?.horizons ?? []).filter((n) =>
    SUPPORTED_FORECAST_HORIZONS.some((h) => h === n),
  );
  const horizon = chosenH && horizons.includes(chosenH) ? chosenH : (horizons.at(-1) ?? 1);
  const enabled = horizons.includes(horizon);
  const m = FORECAST_METRICS.find((x) => x.id === metric) ?? FORECAST_METRICS[0]!;
  const results = useSelectionForecasts(metric, horizon, selections, enabled);
  const primary = results[0]?.data ?? null;
  useEffect(() => onForecast?.(primary), [onForecast, primary]);
  const pending = results.some((r) => r.isPending && enabled);
  const failed = results.find((r) => r.isError);
  const chart = buildScenarioChart(
    ov.data?.monthly ?? [],
    metric,
    selections.map((s, i) => ({ key: s.key, forecast: results[i]?.data })),
  );
  const unit = `${m.unit} / month`;
  const futureYears = primary?.annualTotals?.filter((p) => p.year > 2026) ?? [];
  const drivers = primary?.drivers ?? [];
  const capacity = drivers.filter((d) => !d.label.startsWith("Selected") && !d.label.startsWith("Contract") && d.basis === "annual");
  const milestone = capacity[0] ? [{
    time: Date.parse(`${capacity[0].date}T00:00:00Z`), label: capacity[0].label,
  }] : [];
  const series: ScenarioSeries[] = [
    { key: "history", label: "Actual (monthly)", color: "var(--scenario-history)", dashed: false },
    { key: "noChange", label: "Without changes", color: "var(--scenario-none)", dashed: true, toggleable: true, hidden: hidden["noChange"] === true },
    ...selections.map((s) => ({
      key: s.key,
      label: s.label,
      color: s.color,
      dashed: true,
      toggleable: s.toggleable ?? true,
      hidden: hidden[s.key] ?? s.defaultHidden ?? false,
    })),
  ];
  const identical =
    selections.length > 0 &&
    chart.rows.some((r) => r["noChange"] != null) &&
    chart.rows.every((r) => selections.every((s) => r[s.key] == null || r[s.key] === r["noChange"]));
  const withoutMarketEffect = metric === "co2Market" && results.some((r, i) =>
    (selections[i]?.measureIds.length ?? 0) > 0 && r.data?.points.slice(1).some((p) => p.optimized === null),
  );
  const marketScope = metric === "co2Market" && results.find((r) => r.data?.marketScopeLabel)?.data?.marketScopeLabel;
  return (
    <section className="min-w-0 rounded-lg border bg-card p-4 sm:p-5" aria-label={title}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold">{title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {m.label} · {unit} · {horizon}-year horizon ·{" "}
            {api.isDemo ? "DEMO projections" : "Team backend projections"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Metric">
            <span className="mr-1 text-xs text-muted-foreground">Metric</span>
            {FORECAST_METRICS.map((x) => (
              <Button
                key={x.id}
                size="sm"
                variant={metric === x.id ? "secondary" : "ghost"}
                aria-pressed={metric === x.id}
                disabled={!supported(x.id)}
                title={supported(x.id) ? undefined : "Not supported by the data provider"}
                onClick={() => setChosen(x.id)}
              >
                {x.label}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Horizon">
            <span className="mr-1 text-xs text-muted-foreground">Horizon</span>
            {horizons.map((y) => (
              <Button
                key={y}
                size="sm"
                variant={horizon === y ? "secondary" : "ghost"}
                aria-pressed={horizon === y}
                onClick={() => setH(y)}
              >
                {y} yr
              </Button>
            ))}
          </div>
        </div>
      </header>
      {!ov.isPending && !support.length ? (
        <p className="py-10 text-sm text-muted-foreground">
          Forecast availability is not supplied by the data provider. No projections are shown.
        </p>
      ) : failed ? (
        <p role="alert" className="py-10 text-sm text-destructive">
          Cannot calculate forecast: {failed.error?.message}
        </p>
      ) : (
        <>
          <ScenarioChart
            rows={chart.rows}
            series={series}
            boundary={chart.boundary}
            format={m.fmt}
            unit={unit}
            milestones={milestone}
            onToggle={(key) => setHidden((h) => ({ ...h, [key]: !(series.find((s) => s.key === key)?.hidden ?? false) }))}
          />
          <div className="mt-2 space-y-1 text-xs text-muted-foreground" role="status">
            {pending && <p>Updating projections…</p>}
            {chart.historyCount === 0 && <p>Monthly historical observations unavailable.</p>}
            {chart.historyCount > 0 && <p>{chart.historyCount} observed months shown.</p>}
            {marketScope && <p>{marketScope} Plan projections include supported effects on that scope.</p>}
            {withoutMarketEffect && <p className="text-warning">A scenario has no supported market-based projection.</p>}
            {chart.granularity === "annual" && (
              <p>
                Quarterly forecast data is unavailable — the provider supplies annual totals, shown
                here as one monthly-average point per year. No intermediate values are drawn.
              </p>
            )}
            {chart.granularity === "quarterly" && <p>Each forecast point shows the monthly average for that quarter.</p>}
            {!selections.length && emptyNote && <p>{emptyNote}</p>}
            {identical && !withoutMarketEffect && !pending && selections.length > 0 && (
              <p className="text-warning">
                Scenario lines overlap “Without changes”: no committed or selected measures with a
                modeled effect on {m.label}.
              </p>
            )}
          </div>
          {showDetails && futureYears.length > 0 && (
            <div className="mt-4 grid gap-2 sm:grid-cols-3" aria-label="Projected annual totals">
              {futureYears.map((p, i) => {
                const difference = p.optimized ? p.baseline.mid - p.optimized.mid : null;
                return (
                  <dl key={p.year} className="rounded-md bg-muted/40 p-3 text-sm">
                    <dt className="font-semibold">Year {i + 1} · {p.periodLabel ?? p.year}</dt>
                    <dd className="mt-1 text-muted-foreground">Without changes · {m.fmt(p.baseline.mid)}</dd>
                    <dd className="text-muted-foreground">With plan · {p.optimized ? m.fmt(p.optimized.mid) : "Unavailable"}</dd>
                    {difference != null && <dd className="mt-1 num font-medium">{m.fmt(Math.abs(difference))} {difference < 0 ? "higher" : "lower"} with plan</dd>}
                  </dl>
                );
              })}
            </div>
          )}
          {showDetails && drivers.length > 0 && (
            <details className="mt-4 rounded-md border p-3" open>
              <summary className="cursor-pointer text-sm font-semibold">What changes the forecast</summary>
              <ul className="mt-3 divide-y text-sm">
                {drivers.map((driver) => (
                  <li key={`${driver.date}-${driver.label}`} className="grid gap-x-4 gap-y-1 py-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <div><p>{driver.label}</p><p className="text-xs text-muted-foreground">{driver.date} · {driver.source}</p></div>
                    <span className="num whitespace-nowrap">{driver.amount < 0 ? "−" : "+"}{m.fmt(Math.abs(driver.amount))}
                      {driver.basis === "annual" ? " / year" : " once"}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
