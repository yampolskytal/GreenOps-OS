import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/greenops/shell";
import { ChartCard, Q } from "@/components/greenops/ui";
import { ForecastChart } from "@/components/greenops/forecast-chart";
import { DetailDrawer, DetailBlock } from "@/components/greenops/details";
import { Button } from "@/components/ui/button";
import type { Forecast } from "@/lib/api/types";
import { useForecast, useOverview } from "@/lib/queries";
import { useApp } from "@/lib/store";
import { aggregateForecast, forecastLabel, percentDifference } from "@/lib/analytics";
import { kchf, kg, kwh } from "@/lib/format";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/forecast")({
  head: () =>
    seo(
      "Scenario Forecasts — GreenOps OS",
      "Compare supported cost, energy and emissions forecasts with and without your saved Current Plan, with honest aggregation and uncertainty.",
    ),
  component: ForecastPage,
});
const METRICS = [
  { id: "cost" as const, label: "Cost", fmt: kchf },
  { id: "co2Location" as const, label: "CO₂ — Location-based", fmt: kg },
  { id: "energy" as const, label: "Energy", fmt: kwh },
  { id: "co2Market" as const, label: "CO₂ — Market-based", fmt: kg },
] as const;
function ForecastPage() {
  const ov = useOverview();
  const { s } = useApp();
  const [chosen, setChosen] = useState<Forecast["metric"] | null>(null);
  const [chosenHorizon, setHorizon] = useState<number | null>(null);
  const [aggregation, setAggregation] = useState<1 | 3 | 6 | null>(null);
  const support = ov.data?.forecastSupport ?? [];
  const first = METRICS.find((m) => support.some((x) => x.metric === m.id && x.horizons.length));
  const metric = chosen ?? first?.id ?? "cost";
  const horizons = support.find((x) => x.metric === metric)?.horizons ?? [];
  const h = chosenHorizon ?? horizons[0] ?? 1;
  const enabled = horizons.includes(h);
  const fc = useForecast(metric, h, enabled);
  const m = METRICS.find((x) => x.id === metric) ?? METRICS[0];
  const interval = aggregation ?? (h === 1 ? 1 : h === 5 ? 6 : 3);
  const f = fc.data ? aggregateForecast(fc.data, interval) : null;
  const last = f?.points.at(-1);
  return (
    <AppShell
      kicker="Know the limits · Forecasts"
      title="Two paths ahead"
      subtitle="Future performance with and without your saved Current Plan. Projections are not realized savings."
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-1">
          {METRICS.map((x) => (
            <Button
              key={x.id}
              size="sm"
              disabled={!support.some((a) => a.metric === x.id && a.horizons.length)}
              variant={metric === x.id ? "secondary" : "ghost"}
              onClick={() => {
                setChosen(x.id);
                setHorizon(null);
                setAggregation(null);
              }}
            >
              {x.label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-2 text-xs text-muted-foreground">Horizon</span>
          {horizons.map((y) => (
            <Button
              key={y}
              size="sm"
              variant={h === y ? "secondary" : "ghost"}
              onClick={() => {
                setHorizon(y);
                setAggregation(null);
              }}
            >
              {y} yr
            </Button>
          ))}
        </div>
      </div>
      {!ov.isPending && !support.length && (
        <p className="text-muted-foreground">
          Forecast availability is not supplied by the backend. Supported metrics, horizons, dated
          points and assumptions are required.
        </p>
      )}
      {enabled && (
        <section data-analysis-region>
          {last && f && (
            <div className="mb-6 grid gap-4 border-y py-5 sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">
                  Without optimization · {forecastLabel(last)}
                </p>
                <p className="num mt-2 text-xl">{m.fmt(last.baseline.mid)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">With Current Plan · {h} yr</p>
                <p className="num mt-2 text-xl text-accent-ink">{m.fmt(last.optimized.mid)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Scenario difference · {f.unit}</p>
                <p className="num mt-2 text-xl">{m.fmt(last.baseline.mid - last.optimized.mid)}</p>
                {percentDifference(last.baseline.mid, last.optimized.mid) != null && (
                  <p className="mt-1 text-xs text-success">
                    {percentDifference(last.baseline.mid, last.optimized.mid)?.toFixed(1)}%
                    projected improvement
                  </p>
                )}
              </div>
            </div>
          )}
          {fc.data?.granularity === "monthly" && (
            <div className="mb-4 flex flex-wrap gap-1">
              {([1, 3, 6] as const).map((n) => (
                <Button
                  size="sm"
                  key={n}
                  variant={interval === n ? "secondary" : "ghost"}
                  onClick={() => setAggregation(n)}
                >
                  {n === 1 ? "Monthly" : `${n}-month average`}
                </Button>
              ))}
            </div>
          )}
          <ChartCard title={`${m.label} · ${f?.unit ?? "reporting values"}`}>
            <Q q={fc}>
              {() =>
                f && (
                  <>
                    <ForecastChart f={f} format={m.fmt} />
                    <DetailDrawer
                      title="Forecast assumptions & calculation"
                      description={`${m.label} · ${h} years · Current Plan`}
                      trigger={
                        <Button variant="outline" className="mt-6">
                          Assumptions & Calculation
                        </Button>
                      }
                    >
                      <DetailBlock title="Growth assumptions">
                        <p>{f.growthAssumption}</p>
                      </DetailBlock>
                      <DetailBlock title="Current optimization package">
                        <p>{s.measureIds.join(" · ") || "No measures committed"}</p>
                      </DetailBlock>
                      <DetailBlock title="Implementation timing">
                        <p>{f.implementationTiming ?? "Not supplied"}</p>
                      </DetailBlock>
                      <DetailBlock title="Aggregation & coverage">
                        <p>
                          {f.granularity === "monthly"
                            ? interval === 1
                              ? "Monthly supplied values"
                              : `${interval}-month average of supplied monthly points; partial periods labeled`
                            : "Annual endpoints only. Monthly/quarterly variation unavailable."}
                        </p>
                      </DetailBlock>
                      <DetailBlock title="Forecast methodology">
                        <p>{f.methodology?.formula ?? "Not supplied"}</p>
                      </DetailBlock>
                      <DetailBlock title="Emission factors & sources">
                        <p>
                          {f.methodology?.factors
                            ?.map(
                              (a) => `${a.label}: ${a.low} / ${a.mid} / ${a.high} · ${a.source}`,
                            )
                            .join(" · ") || "Forecast-specific factors not supplied"}
                        </p>
                        <p className="mt-2">
                          {f.methodology?.sources.join(" · ") ||
                            "Forecast-specific references not supplied"}
                        </p>
                      </DetailBlock>
                      <DetailBlock title="Limitations">
                        <p>
                          {f.methodology?.limitations.join(" · ") ||
                            "Baseline evidence does not validate forecast growth. Lines connect supplied endpoints only; shading uses each scenario’s own low/high ranges."}
                        </p>
                      </DetailBlock>
                    </DetailDrawer>
                  </>
                )
              }
            </Q>
          </ChartCard>
        </section>
      )}
    </AppShell>
  );
}
