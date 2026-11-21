import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/greenops/shell";
import { ChartCard, Q } from "@/components/greenops/ui";
import { ForecastChart } from "@/components/greenops/forecast-chart";
import { DetailDrawer, DetailBlock } from "@/components/greenops/details";
import { Button } from "@/components/ui/button";
import type { Forecast } from "@/lib/api/types";
import { useForecast, useOverview } from "@/lib/queries";
import { kchf, kg, kwh } from "@/lib/format";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/forecast")({
  head: () =>
    seo(
      "Scenario Forecasts — GreenOps OS",
      "Compare annual cost, energy and emissions with and without the selected plan, including supported uncertainty ranges.",
    ),
  component: ForecastPage,
});
const METRICS = [
  { id: "cost" as const, label: "Cost", fmt: kchf },
  { id: "energy" as const, label: "Energy", fmt: kwh },
  { id: "co2Location" as const, label: "Location CO₂", fmt: kg },
  { id: "co2Market" as const, label: "Market CO₂", fmt: kg },
];
function ForecastPage() {
  const [metric, setMetric] = useState<Forecast["metric"]>("co2Location");
  const [h, setH] = useState(3);
  const fc = useForecast(metric, h),
    ov = useOverview();
  const m = METRICS.find((x) => x.id === metric) ?? METRICS[0];
  if (!m) return null;
  return (
    <AppShell
      kicker="Know the limits · Forecasts"
      title="Two paths ahead"
      subtitle="Compare future performance with and without your selected optimization measures. Projections are not realized savings."
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-1">
          {METRICS.map((x) => (
            <Button
              key={x.id}
              size="sm"
              variant={metric === x.id ? "secondary" : "ghost"}
              onClick={() => setMetric(x.id)}
            >
              {x.label}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="mr-2 text-xs text-muted-foreground">Horizon</span>
          {[1, 2, 3, 5].map((y) => (
            <Button
              key={y}
              size="sm"
              variant={h === y ? "secondary" : "ghost"}
              onClick={() => setH(y)}
            >
              {y} yr
            </Button>
          ))}
        </div>
      </div>
      <ChartCard title={`${m.label} · ${fc.data?.unit ?? "annual values"}`}>
        <Q q={fc}>
          {(f) => (
            <>
              <ForecastChart f={f} format={m.fmt} />
              <DetailDrawer
                title="Forecast assumptions & calculation"
                trigger={
                  <Button variant="outline" className="mt-6">
                    Assumptions & Calculation
                  </Button>
                }
              >
                <DetailBlock title="Growth assumptions">
                  <p>{f.growthAssumption}</p>
                </DetailBlock>
                <DetailBlock title="Projection coverage">
                  <p>
                    {f.points.length} annual points supplied. Shaded ranges come from each
                    scenario's own low and high estimates.
                  </p>
                </DetailBlock>
                <DetailBlock title="Baseline evidence">
                  {ov.data ? (
                    <>
                      <p>{ov.data.baselinePeriod}</p>
                      <p className="mt-2 text-muted-foreground">
                        {
                          (metric === "cost"
                            ? ov.data.cost
                            : metric === "energy"
                              ? ov.data.energy
                              : metric === "co2Market"
                                ? ov.data.co2Market
                                : ov.data.co2Location
                          ).calc.formula
                        }
                      </p>
                    </>
                  ) : (
                    <p>Baseline evidence unavailable.</p>
                  )}
                </DetailBlock>
                <p className="text-muted-foreground">
                  Forecast-specific factors and source references are not included in the current
                  forecast response. Do not treat baseline sources as validation of future growth.
                </p>
              </DetailDrawer>
            </>
          )}
        </Q>
      </ChartCard>
    </AppShell>
  );
}
