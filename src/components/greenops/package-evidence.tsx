import type { SimulationResult } from "@/lib/api/types";
import { marketCoverageLabel } from "@/lib/analytics";
import { formatEvidenceText, kg } from "@/lib/format";
import { DetailBlock } from "./details";
import { CoverageEvidence } from "./emissions-evidence";

export function MarketSavingsSummary({ result }: { result: SimulationResult }) {
  const coverage = result.marketCoverage;
  return (
    <>
      <p>
        Market-based CO₂e savings · {kg(result.savingsCo2KgMarket)}
        {result.savingsCo2KgMarket != null && "/year"}
      </p>
      {coverage && (
        <p className="text-xs text-muted-foreground">
          {marketCoverageLabel(coverage)}{" "}
          {coverage.status === "partial" && "Savings represent a covered subtotal."}
        </p>
      )}
    </>
  );
}

export function PackageEvidence({ result }: { result: SimulationResult }) {
  const range = result.savingsCo2KgMarketRange ?? result.marketSavings?.projectionRange;
  const market = result.marketSavings;
  return (
    <>
      <DetailBlock title="Calculation notes">
        {result.reasons.length ? (
          result.reasons.map((reason) => <p key={reason}>{formatEvidenceText(reason)}</p>)
        ) : (
          <p>No additional calculation notes were supplied.</p>
        )}
      </DetailBlock>
      {result.excluded.length > 0 && (
        <DetailBlock title="Excluded measures">
          {result.excluded.map(({ id, reason }) => (
            <p key={id}>
              {id} · {formatEvidenceText(reason)}
            </p>
          ))}
        </DetailBlock>
      )}
      <DetailBlock title="Market-based projection">
        <MarketSavingsSummary result={result} />
        {range && (
          <p>
            Projected range · {kg(range.low)}–{kg(range.high)}/year
          </p>
        )}
        {!!market?.partialMeasureIds?.length && (
          <p>Partially covered measures · {market.partialMeasureIds.join(", ")}</p>
        )}
        {!!market?.unavailableMeasureIds?.length && (
          <p>Market savings unavailable · {market.unavailableMeasureIds.join(", ")}</p>
        )}
        {!!market?.forecastLimitedMeasureIds?.length && (
          <p>Forecast coverage limited · {market.forecastLimitedMeasureIds.join(", ")}</p>
        )}
      </DetailBlock>
      {result.marketCoverage && (
        <CoverageEvidence
          title="Market-based coverage and assumptions"
          coverage={result.marketCoverage}
        />
      )}
    </>
  );
}
