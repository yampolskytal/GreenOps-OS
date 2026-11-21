import type { Kpi, Overview, SimulationResult, MarketCoverage } from "@/lib/api/types";
import { accountingComparison, marketCoverageLabel } from "@/lib/analytics";
import { kg } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { DetailBlock, DetailDrawer } from "./details";
import { CalcInfo } from "./ui";
export function EmissionsEvidence({
  overview,
}: {
  overview: Pick<Overview, "co2Location" | "co2Market">;
}) {
  const comparison = accountingComparison(overview.co2Location, overview.co2Market);
  return (
    <DetailDrawer
      title="Emissions accounting evidence"
      trigger={
        <Button variant="outline" size="sm">
          Compare accounting methods
        </Button>
      }
    >
      <EmissionMetric label="Location-based CO₂" kpi={overview.co2Location} />
      <EmissionMetric
        label="Market-based CO₂"
        {...(overview.co2Market ? { kpi: overview.co2Market } : {})}
      />
      <DetailBlock title="Difference between accounting methods">
        <p>
          {comparison
            ? `${kg(comparison.difference)}${comparison.percentage != null ? ` · ${comparison.percentage.toFixed(1)}%` : ""}`
            : "Comparison unavailable: matching units, reporting period and coverage are required."}
        </p>
      </DetailBlock>
      <p className="text-muted-foreground">
        These are alternative accounting perspectives, never added together. Contractual accounting
        differences do not automatically reduce electricity use or physical emissions. The mandatory
        40% target uses location-based emissions only.
      </p>
    </DetailDrawer>
  );
}
export function EmissionMetric({ label, kpi }: { label: string; kpi?: Kpi | null }) {
  return (
    <DetailBlock title={label}>
      {kpi ? (
        <>
          <p className="num">
            {kg(kpi.value.mid)} · {kpi.calc.period}
          </p>
          <p className="mt-2">{kpi.calc.formula}</p>
          <p className="mt-2 text-muted-foreground">
            Coverage: {kpi.coverage ?? "Not supplied"} · Region: {kpi.region ?? "Not supplied"}
          </p>
          <p className="mt-2 text-muted-foreground">
            Missing inputs: {kpi.missingInputs?.join(" · ") || "Not supplied"}
          </p>
          <p className="mt-2 text-muted-foreground">
            Procurement assumptions: {kpi.procurementAssumptions?.join(" · ") || "Not supplied"}
          </p>
          <CalcInfo calc={kpi.calc} />
        </>
      ) : (
        <p className="text-muted-foreground">
          Unavailable at this reporting level; awaiting backend values and methodology.
        </p>
      )}
    </DetailBlock>
  );
}

export function AdministrationEmissions({
  overview,
  result,
  savingsPending,
  savingsError,
}: {
  overview: Overview;
  result: SimulationResult | undefined;
  savingsPending: boolean;
  savingsError: boolean;
}) {
  const methods = [
    {
      label: "Location-based CO₂",
      kpi: overview.co2Location,
      savings: result?.savingsCo2Kg,
      description:
        "Uses regional electricity grid factors. This is the basis for the carbon reduction target.",
    },
    {
      label: "Market-based CO₂",
      kpi: overview.co2Market,
      savings: result?.savingsCo2KgMarket,
      coverage: overview.co2Market?.marketCoverage ?? overview.marketCoverage,
      savingsCoverage: result?.marketCoverage,
      description: "Uses supplier and contractual factors for covered activity.",
    },
  ];
  return (
    <section className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {methods.map(({ label, kpi, savings, coverage, savingsCoverage, description }) => (
          <article
            key={label}
            className="flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-5"
          >
            <h2 className="font-semibold">{label}</h2>
            <p className="num text-2xl font-semibold">{kg(kpi?.value.mid)}</p>
            <p className="text-xs text-muted-foreground">
              {kpi?.calc.period ?? "Annual total unavailable"}
              {coverage?.status === "partial" && " · Covered subtotal"}
            </p>
            <p className="text-sm">{description}</p>
            <p className="text-sm text-muted-foreground">
              {coverage
                ? marketCoverageLabel(coverage)
                : (kpi?.coverage ?? "Coverage unavailable.")}
            </p>
            <div className="border-t pt-3 text-sm">
              <p>
                Projected annual savings ·{" "}
                {savingsPending && savings == null
                  ? "Calculating…"
                  : savingsError
                    ? "Calculation unavailable"
                    : kg(savings)}
              </p>
              {savingsCoverage && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {marketCoverageLabel(savingsCoverage)}{" "}
                  {savingsCoverage.status === "partial" && "Savings are a covered subtotal."}
                </p>
              )}
            </div>
            <div className="mt-auto">
              <DetailDrawer
                title={`${label} calculation and evidence`}
                trigger={
                  <Button size="sm" variant="outline">
                    Calculation &amp; Evidence
                  </Button>
                }
              >
                <EmissionMetric label={label} kpi={kpi ?? null} />
                {coverage && (
                  <CoverageEvidence title="Baseline market coverage" coverage={coverage} />
                )}
                {savingsCoverage && (
                  <CoverageEvidence
                    title="Projected market savings coverage"
                    coverage={savingsCoverage}
                  />
                )}
                {savingsCoverage && result?.savingsCo2KgMarketRange && (
                  <DetailBlock title="Projected market savings range">
                    {kg(result.savingsCo2KgMarketRange.low)}–
                    {kg(result.savingsCo2KgMarketRange.high)}
                  </DetailBlock>
                )}
              </DetailDrawer>
            </div>
          </article>
        ))}
      </div>
      <EmissionsEvidence overview={overview} />
    </section>
  );
}

function CoverageEvidence({ title, coverage }: { title: string; coverage: MarketCoverage }) {
  return (
    <DetailBlock title={title}>
      <p>{marketCoverageLabel(coverage)}</p>
      <p>{coverage.uncoveredRegions.join(" · ")}</p>
      <p>{coverage.missingInputs.join(" · ")}</p>
      <p>{coverage.assumptions.join(" · ")}</p>
      <p>{coverage.sources.join(" · ")}</p>
      {coverage.factors.map((factor) => (
        <p key={factor.label + factor.source}>
          {factor.label} · low {factor.low} · central {factor.mid} · high {factor.high} ·{" "}
          {factor.source}
        </p>
      ))}
      <p>
        {coverage.missingEnergyRows} rows missing energy · {coverage.missingFactorRows} rows missing
        factors
      </p>
    </DetailBlock>
  );
}
