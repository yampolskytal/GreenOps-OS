import type { Kpi, Overview, SimulationResult, MarketCoverage } from "@/lib/api/types";
import { accountingComparison, marketCoverageLabel } from "@/lib/analytics";
import { carbonMass, carbonUnit, formatEvidenceText } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { DetailBlock, DetailDrawer, EvidenceSources } from "./details";
import { CalcInfo } from "./ui";
export function EmissionsEvidence({
  overview,
}: {
  overview: Pick<Overview, "co2Location" | "co2Market" | "marketCoverage">;
}) {
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
      <AccountingComparison overview={overview} />
    </DetailDrawer>
  );
}
function AccountingComparison({
  overview,
}: {
  overview: Pick<Overview, "co2Location" | "co2Market" | "marketCoverage">;
}) {
  const coverage = overview.co2Market?.marketCoverage ?? overview.marketCoverage;
  const comparison =
    coverage?.status === "partial" || coverage?.status === "unavailable"
      ? null
      : accountingComparison(overview.co2Location, overview.co2Market);
  return (
    <>
      <DetailBlock title="Difference between accounting methods">
        <p>
          {comparison
            ? `${carbonMass(comparison.difference, overview.co2Location.unit)}${comparison.percentage != null ? ` · ${comparison.percentage.toFixed(1)}%` : ""}`
            : "Comparison unavailable: matching units, reporting period and coverage are required."}
        </p>
      </DetailBlock>
      <p className="text-muted-foreground">
        These are alternative accounting perspectives, never added together. Contractual accounting
        differences do not automatically reduce electricity use or physical emissions. The mandatory
        40% target uses location-based emissions only.
      </p>
    </>
  );
}

export function EmissionMetric({ label, kpi }: { label: string; kpi?: Kpi | null }) {
  return (
    <DetailBlock title={label}>
      {kpi ? (
        <>
          <p className="num">
            {carbonMass(kpi.value.mid, kpi.calc.units)} · {kpi.calc.period}
          </p>
          <p className="mt-2">{formatEvidenceText(kpi.calc.formula)}</p>
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

export type EmissionsProjection = {
  result: SimulationResult | undefined;
  pending: boolean;
  error: boolean;
  label: string;
};

export function AnnualEmissionsEvidence({
  overview,
  market,
  projection,
}: {
  overview: Overview;
  market: boolean;
  projection?: EmissionsProjection | undefined;
}) {
  const kpi = market ? overview.co2Market : overview.co2Location;
  const baselineCoverage = market ? (kpi?.marketCoverage ?? overview.marketCoverage) : undefined;
  const savings = market
    ? projection?.result?.savingsCo2KgMarket
    : projection?.result?.savingsCo2Kg;
  const savingsCoverage = market ? projection?.result?.marketCoverage : undefined;
  const savingsRange = market ? projection?.result?.savingsCo2KgMarketRange : undefined;
  const unit = carbonUnit(kpi?.calc.units ?? (market ? "kg CO₂e" : "kg CO₂"));
  return (
    <>
      <p>
        {market
          ? "Uses supplier and contractual factors for covered activity."
          : "Uses regional electricity grid factors. The carbon reduction target uses this method."}
      </p>
      <EmissionMetric
        label={
          market
            ? "Annual market-based baseline (covered activity)"
            : "Annual location-based baseline"
        }
        kpi={kpi ?? null}
      />
      {baselineCoverage && (
        <CoverageEvidence title="Baseline market coverage" coverage={baselineCoverage} />
      )}
      {projection && (
        <DetailBlock title="Projected annual savings">
          <p>
            {projection.label} ·{" "}
            {savings != null
              ? carbonMass(savings, unit)
              : projection.pending
                ? "Calculating…"
                : projection.error
                  ? "Calculation unavailable"
                  : "Unavailable"}
          </p>
          {savingsCoverage?.status === "partial" && <p>Savings are a covered subtotal.</p>}
          {savingsRange && (
            <p>
              Projected range · {carbonMass(savingsRange.low, unit)}–
              {carbonMass(savingsRange.high, unit)}
            </p>
          )}
        </DetailBlock>
      )}
      {savingsCoverage && (
        <CoverageEvidence title="Projected market savings coverage" coverage={savingsCoverage} />
      )}
      {market && <AccountingComparison overview={overview} />}
    </>
  );
}

export function CoverageEvidence({ title, coverage }: { title: string; coverage: MarketCoverage }) {
  return (
    <DetailBlock title={title}>
      <p>{marketCoverageLabel(coverage)}</p>
      <p>{coverage.uncoveredRegions.join(" · ")}</p>
      <p>{coverage.missingInputs.join(" · ")}</p>
      <p>{coverage.assumptions.join(" · ")}</p>
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
      <EvidenceSources sources={coverage.sources} />
    </DetailBlock>
  );
}
