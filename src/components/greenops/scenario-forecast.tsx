import { useState } from "react";
import type { Forecast, ForecastPoint } from "@/lib/api/types";
import { api } from "@/lib/api/client";
import { useOverview } from "@/lib/queries";
import { useSelectionForecasts } from "@/lib/path-queries";
import { buildScenarioChart, FORECAST_BOUNDARY } from "@/lib/scenario-series";
import {
  isAvailable,
  marketCoverageLabel,
  forecastLabel,
  SUPPORTED_FORECAST_HORIZONS,
} from "@/lib/analytics";
import {
  carbonMass,
  carbonUnit,
  chf,
  formatEvidenceText,
  formatNumber,
  group,
  pct,
} from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ScenarioChart, type ScenarioSeries } from "./scenario-chart";
import { DetailBlock, DetailDrawer, EvidenceInfoButton } from "./details";
import { CalculationDetails } from "./ui";
import { CoverageEvidence } from "./emissions-evidence";

export const FORECAST_METRICS = [
  { id: "cost", label: "Cost", unit: "CHF" },
  { id: "energy", label: "Energy", unit: "kWh" },
  { id: "co2Location", label: "Location-based CO₂", unit: "kg CO₂" },
  { id: "co2Market", label: "Market-based CO₂", unit: "kg CO₂" },
] as const;
export interface ScenarioSelection {
  key: string;
  label: string;
  color: string;
  measureIds: string[];
  toggleable?: boolean;
  defaultHidden?: boolean;
}
export type ScenarioSettings = {
  metric: Forecast["metric"] | null;
  horizon: number | null;
  hidden: Record<string, boolean>;
  selectedDate?: number;
};
function forecastUnit(metric: Forecast["metric"], sourceUnit?: string) {
  const standard = FORECAST_METRICS.find((entry) => entry.id === metric)?.unit ?? "";
  return metric === "co2Location" || metric === "co2Market"
    ? carbonUnit(sourceUnit ?? standard)
    : standard;
}

function formatValue(value: number | null | undefined, unit: string) {
  if (!isAvailable(value)) return "Unavailable";
  if (unit === "CHF") return chf(value);
  if (unit === "kWh") return `${formatNumber(value, { maximumFractionDigits: 3 })} kWh`;
  return carbonMass(value, unit);
}

function formatSummary(value: number | null | undefined, unit: string) {
  if (!isAvailable(value)) return "Unavailable";
  if (unit === "CHF") return `CHF ${group(value)}`;
  if (unit.startsWith("kg")) return `${group(value)} ${unit}`;
  return formatValue(value, unit);
}

function annualOutlook(forecast: Forecast | undefined) {
  return (forecast?.annualTotals ?? (forecast?.granularity === "annual" ? forecast.points : []))
    .filter((point) =>
      point.date ? Date.parse(point.date) >= FORECAST_BOUNDARY : point.year > 2026,
    )
    .sort((a, b) => a.year - b.year);
}

export function ScenarioForecastPanel({
  selections,
  title,
  emptyNote,
  showDetails = false,
  initialMetric,
  settings,
  onSettingsChange,
}: {
  selections: ScenarioSelection[];
  title: string;
  emptyNote?: string;
  initialMetric?: Forecast["metric"];
  settings?: ScenarioSettings | undefined;
  onSettingsChange?: (settings: ScenarioSettings) => void;
  showDetails?: boolean;
}) {
  const ov = useOverview(true);
  const support = ov.data?.forecastSupport ?? [];
  const [local, setLocal] = useState<ScenarioSettings>({
    metric: initialMetric ?? null,
    horizon: null,
    hidden: {},
  });
  const current = settings ?? local;
  const { metric: chosen, horizon: chosenH, hidden } = current;
  const update = (patch: Partial<ScenarioSettings>) =>
    (onSettingsChange ?? setLocal)({ ...current, ...patch });
  const metric =
    chosen ??
    FORECAST_METRICS.find(({ id }) =>
      support.some((entry) => entry.metric === id && entry.horizons.length),
    )?.id ??
    "cost";
  const unavailableMetrics = FORECAST_METRICS.filter(
    ({ id }) => !support.some((entry) => entry.metric === id && entry.horizons.length),
  ).map(({ label }) => label);
  const horizons = SUPPORTED_FORECAST_HORIZONS.filter((year) =>
    support.some((entry) => entry.metric === metric && entry.horizons.includes(year)),
  );
  const horizon = chosenH ?? horizons.at(-1) ?? 3;
  const enabled = horizons.some((year) => year === horizon);
  const querySelections = selections.length
    ? selections
    : [{ key: "baseline", label: "Without changes", measureIds: [] }];
  const results = useSelectionForecasts(metric, horizon, querySelections, enabled);
  const forecasts = querySelections.map((selection, index) => {
    const forecast = results[index]?.data;
    return {
      ...selection,
      forecast: enabled && forecast?.metric === metric ? forecast : undefined,
    };
  });
  const primary = forecasts.find(({ forecast }) => forecast)?.forecast;
  const pending = ov.isPending || (enabled && results.some((result) => result.isPending));
  const failed = enabled ? results.find((result) => result.isError) : undefined;
  const chart = buildScenarioChart(ov.data?.monthly ?? [], metric, forecasts);
  const unit = forecastUnit(metric, primary?.unit);
  const annual = annualOutlook(primary);
  const drivers = primary?.drivers ?? [];
  const capacity = drivers.find(
    (driver) =>
      !driver.label.startsWith("Selected") &&
      !driver.label.startsWith("Contract") &&
      driver.basis === "annual",
  );
  const series: ScenarioSeries[] = [
    { key: "history", label: "Actual history", color: "var(--scenario-history)", dashed: false },
    ...(enabled
      ? [
          {
            key: "noChange",
            label: "Without changes",
            color: "var(--scenario-none)",
            dashed: true,
            toggleable: !showDetails,
            hidden: hidden["noChange"] === true,
          },
          ...selections.map((selection) => ({
            key: selection.key,
            label: selection.label,
            color: selection.color,
            dashed: true,
            toggleable: selection.toggleable ?? true,
            hidden: hidden[selection.key] ?? selection.defaultHidden ?? false,
          })),
        ]
      : []),
  ];
  const projected = chart.rows.filter((row) => row.kind === "projected");
  const overlap =
    selections.length > 0 &&
    projected.some((row) => isAvailable(row["noChange"])) &&
    selections.every(
      ({ key }) =>
        projected.some((row) => isAvailable(row[key])) &&
        projected.every((row) => row[key] == null || row[key] === row["noChange"]),
    );
  const unsupportedMarketEffect =
    metric === "co2Market" &&
    forecasts.some(
      ({ key, forecast }) =>
        key !== "baseline" && forecast?.points.some((point) => point.optimized == null),
    );
  const evidence = primary ? <ForecastEvidence forecasts={forecasts} /> : null;
  const lastAnnual = annual.at(-1);
  const lastProjected = projected.filter((row) => isAvailable(row["noChange"])).at(-1);
  return (
    <section className="min-w-0" aria-label={title}>
      <div className="mb-3 flex items-center gap-1">
        <h2 className="text-base font-semibold">{title}</h2>
        {evidence && (
          <DetailDrawer
            title="Forecast assumptions & calculation"
            trigger={<EvidenceInfoButton description="forecast methodology and annual outlook" />}
          >
            <div className="space-y-4">
              {showDetails && annual.length > 0 && (
                <DetailBlock title="Annual outlook">
                  {[...new Set(annual.flatMap(({ coverage }) => (coverage ? [coverage] : [])))].map(
                    (coverage) => (
                      <p key={coverage} className="text-xs text-muted-foreground">
                        {coverage}
                      </p>
                    ),
                  )}
                  {annual.map((point) => (
                    <AnnualProjection
                      key={point.year}
                      point={point}
                      unit={unit}
                      planLabel={selections[0]?.label}
                    />
                  ))}
                </DetailBlock>
              )}
              {evidence}
            </div>
          </DetailDrawer>
        )}
      </div>
      <div className="@container">
        <div className="grid gap-3 border-b pb-3 @3xl:grid-cols-[minmax(0,1fr)_auto] @3xl:gap-6">
          <div role="group" aria-label="Metric" className="min-w-0">
            <p className="mb-1 text-xs font-medium text-muted-foreground">Metric</p>
            <div className="flex flex-wrap gap-1">
              {FORECAST_METRICS.map(({ id, label }) => (
                <Button
                  key={id}
                  size="sm"
                  variant="ghost"
                  className="secondary-selection"
                  aria-pressed={metric === id}
                  disabled={!support.some((entry) => entry.metric === id && entry.horizons.length)}
                  title={
                    support.some((entry) => entry.metric === id && entry.horizons.length)
                      ? undefined
                      : "Forecast unavailable from the provider"
                  }
                  onClick={() =>
                    update({
                      metric: id,
                      horizon: support.some(
                        (entry) => entry.metric === id && entry.horizons.includes(horizon),
                      )
                        ? horizon
                        : null,
                    })
                  }
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
          <div role="group" aria-label="Forecast horizon" className="@3xl:text-right">
            <p className="mb-1 text-xs font-medium text-muted-foreground">Forecast horizon</p>
            <div className="flex flex-wrap gap-1 @3xl:justify-end">
              {SUPPORTED_FORECAST_HORIZONS.map((year) => (
                <Button
                  key={year}
                  size="sm"
                  variant="ghost"
                  className="secondary-selection"
                  aria-pressed={horizon === year}
                  disabled={!horizons.includes(year)}
                  onClick={() => update({ horizon: year })}
                >
                  {year} {year === 1 ? "year" : "years"}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>
      {showDetails && (lastAnnual || lastProjected) && (
        <ImpactSummary
          label={
            lastAnnual
              ? `Annual projection · ${forecastLabel(lastAnnual)}`
              : `Monthly projection · ${lastProjected?.label}`
          }
          baseline={lastAnnual ? lastAnnual.baseline.mid : Number(lastProjected?.["noChange"])}
          planValue={lastAnnual ? lastAnnual.optimized?.mid : lastProjected?.["plan"]}
          planLabel={selections[0]?.label}
          unit={unit}
        />
      )}
      <div className="my-3 space-y-1 text-xs text-muted-foreground" role="status">
        {pending && <p>Updating projections…</p>}
        {!ov.isPending && support.length > 0 && unavailableMetrics.length > 0 && (
          <p>Provider forecast unavailable for {unavailableMetrics.join(", ")}.</p>
        )}
        {ov.isError && (
          <p className="text-destructive">Historical observations could not be loaded.</p>
        )}
        {!pending && !enabled && (
          <p>
            This metric or horizon has no forecast from the provider. Available history is shown
            below.
          </p>
        )}
        {failed && (
          <p className="text-destructive">
            A forecast could not be calculated. {failed.error?.message}
          </p>
        )}
        {emptyNote && <p>{emptyNote}</p>}
        <p>
          {chart.historyCount}/12 observed months available.{api.isDemo && " Demo figures."}
        </p>
        {primary?.marketScopeLabel ? (
          <p>{primary.marketScopeLabel}</p>
        ) : (
          primary?.marketCoverage && <p>{marketCoverageLabel(primary.marketCoverage)}</p>
        )}
        {!pending && enabled && !lastProjected && !failed && (
          <p>No projected values were supplied for this selection.</p>
        )}
        {chart.resolutionMismatch && (
          <p className="text-warning">
            A scenario uses a different reporting resolution and is unavailable in this comparison.
          </p>
        )}
        {unsupportedMarketEffect && (
          <p className="text-warning">
            A strategy has no supported market-based effect for this scope.
          </p>
        )}
        {overlap && !pending && (
          <p>Scenario lines overlap because the provider returned matching projections.</p>
        )}
      </div>
      <ScenarioChart
        rows={chart.rows}
        boundary={chart.boundary}
        annualPeriods={chart.granularity === "annual"}
        series={series}
        unit={
          chart.granularity === "annual"
            ? `${unit} / month · annual projections shown as monthly averages`
            : `${unit} / month`
        }
        format={(value) => formatValue(value, unit)}
        showBand={showDetails}
        selectedDate={current.selectedDate}
        onDateChange={(selectedDate) => update({ selectedDate })}
        milestones={capacity ? [{ time: Date.parse(capacity.date), label: capacity.label }] : []}
        onToggle={(key) =>
          update({
            hidden: {
              ...hidden,
              [key]: !(series.find((item) => item.key === key)?.hidden ?? false),
            },
          })
        }
      />
    </section>
  );
}

function ImpactSummary({
  label,
  baseline,
  planValue,
  planLabel,
  unit,
}: {
  label: string;
  baseline: number;
  planValue: unknown;
  planLabel: string | undefined;
  unit: string;
}) {
  const difference = isAvailable(planValue) ? planValue - baseline : null;
  const change =
    difference != null && baseline !== 0 ? Math.abs(difference / baseline) * 100 : null;
  return (
    <section aria-label="Projected impact" className="@container border-b py-3">
      <h3 className="mb-2 text-xs font-medium text-muted-foreground">{label}</h3>
      <dl className="grid gap-2 @lg:grid-cols-3">
        <div>
          <dt className="text-xs text-muted-foreground">Without changes</dt>
          <dd className="num font-semibold">{formatSummary(baseline, unit)}</dd>
        </div>
        {planLabel && (
          <>
            <div>
              <dt className="text-xs text-muted-foreground">{planLabel}</dt>
              <dd className="num font-semibold">
                {formatSummary(isAvailable(planValue) ? planValue : null, unit)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Projected difference</dt>
              <dd
                className={`num font-semibold ${difference == null || difference === 0 ? "" : difference < 0 ? "text-success" : "text-warning"}`}
              >
                {difference == null
                  ? "Unavailable"
                  : difference === 0
                    ? "No modeled difference"
                    : `${formatSummary(Math.abs(difference), unit)} ${difference > 0 ? "higher" : "lower"}${change == null ? "" : ` · ${pct(change)}`}`}
              </dd>
            </div>
          </>
        )}
      </dl>
    </section>
  );
}

function AnnualProjection({
  point,
  unit,
  planLabel,
}: {
  point: ForecastPoint;
  unit: string;
  planLabel: string | undefined;
}) {
  return (
    <div className="min-w-0">
      <ImpactSummary
        label={`Annual total · ${forecastLabel(point)}`}
        baseline={point.baseline.mid}
        planValue={point.optimized?.mid}
        planLabel={planLabel}
        unit={unit}
      />
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer">Supplied annual low–high ranges</summary>
        <p className="mt-1">
          Without changes · {formatValue(point.baseline.low, unit)}–
          {formatValue(point.baseline.high, unit)}
        </p>
        {planLabel && (
          <p>
            {planLabel} ·{" "}
            {point.optimized
              ? `${formatValue(point.optimized.low, unit)}–${formatValue(point.optimized.high, unit)}`
              : "Unavailable"}
          </p>
        )}
      </details>
    </div>
  );
}

function ForecastEvidence({
  forecasts,
}: {
  forecasts: { key: string; label: string; measureIds: string[]; forecast: Forecast | undefined }[];
}) {
  const available = forecasts.filter(({ forecast }) => forecast != null);
  return (
    <div className="space-y-3">
      {available.map(
        ({ key, label, measureIds, forecast }) =>
          forecast && (
            <details key={key} open={available.length === 1} className="border-b pb-3">
              <summary className="cursor-pointer font-semibold">{label}</summary>
              <div className="mt-3 space-y-4 text-sm">
                <DetailBlock title="Growth and implementation">
                  <p>{formatEvidenceText(forecast.growthAssumption)}</p>
                  {forecast.implementationTiming && <p>{forecast.implementationTiming}</p>}
                  <p>Modeled selection · {measureIds.join(", ") || "No measures selected"}</p>
                  <p>
                    {forecast.granularity === "monthly"
                      ? "The chart uses the supplied monthly model values."
                      : "Annual totals are shown as one monthly-average point per supplied year. No intermediate values are inferred."}
                  </p>
                </DetailBlock>
                {forecast.marketScopeLabel && !forecast.marketCoverage && (
                  <p>{forecast.marketScopeLabel}</p>
                )}
                {forecast.marketCoverage && (
                  <CoverageEvidence
                    title="Market-based scope and coverage"
                    coverage={forecast.marketCoverage}
                  />
                )}
                {forecast.methodology && <CalculationDetails calc={forecast.methodology} />}
                {forecast.drivers && forecast.drivers.length > 0 && (
                  <DetailBlock title="What changes the forecast">
                    <ul className="space-y-2">
                      {forecast.drivers.map((driver) => (
                        <li key={driver.date + driver.label}>
                          <p>
                            {driver.label} ·{" "}
                            {formatValue(
                              driver.amount,
                              forecastUnit(forecast.metric, forecast.unit),
                            )}{" "}
                            {driver.basis === "annual" ? "/ year" : "once"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {driver.date} · {driver.source}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </DetailBlock>
                )}
              </div>
            </details>
          ),
      )}
    </div>
  );
}
