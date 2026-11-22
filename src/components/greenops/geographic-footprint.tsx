import { useId, useMemo, useRef, useState } from "react";
import { Cloud, CloudCheck, Info, Wallet, Zap } from "lucide-react";
import { geographicDots } from "@/lib/geographic-dots";
import { COUNTRY_VIEWS, EUROPE_BOUNDARIES, europePoint } from "@/lib/europe-boundaries";
import { GeographicBreakdowns } from "./geographic-breakdowns";
import type { GeographicMetric, LocationSummary } from "@/lib/api/types";
import { GEOGRAPHIC_METRICS, regionalCoverage, regionalValue } from "@/lib/geographic";
import { formatNumber } from "@/lib/format";
import { useLocations } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { AnalyticalInspector } from "./analytical-inspector";
import { DetailBlock, DetailDrawer, EvidenceInfoButton, EvidenceSources } from "./details";
import { CoverageEvidence } from "./emissions-evidence";
import { Q } from "./ui";

const ICONS = {
  costChf: Wallet,
  co2KgLocation: Cloud,
  energyKwh: Zap,
  co2KgMarket: CloudCheck,
};

const REGIONS = [
  {
    id: "zurich",
    city: "Zurich",
    country: "Switzerland",
    code: "CHE",
    color: "#238A57",
    pitch: 1.35,
  },
  {
    id: "frankfurt",
    city: "Frankfurt",
    country: "Germany",
    code: "DEU",
    color: "#72C565",
    pitch: 2.7,
  },
  {
    id: "dublin",
    city: "Dublin",
    country: "Ireland",
    code: "IRL",
    color: "#C5E66B",
    pitch: 1.7,
  },
] as const;

const EUROPE_VIEW = [101, 150, 292, 291] as const;
const EUROPE_PITCH = 2.65;
const LAND_COLOR = "#73777D";
const BORDER_COLOR = "#292C30";

function BackgroundDots({
  pitch,
  bounds,
}: {
  pitch: number;
  bounds: readonly [number, number, number, number];
}) {
  const id = useId();
  const [x, y, width, height] = bounds;
  return (
    <>
      <defs>
        <pattern id={id} width={pitch} height={pitch} patternUnits="userSpaceOnUse">
          <circle cx={pitch / 2} cy={pitch / 2} r={pitch * 0.055} fill="var(--geo-grid)" />
        </pattern>
      </defs>
      <rect x={x} y={y} width={width} height={height} fill={`url(#${id})`} />
    </>
  );
}

function CountryDots({
  code,
  color,
  pitch,
  bounds,
}: {
  code: string;
  color: string;
  pitch: number;
  bounds: readonly [number, number, number, number];
}) {
  const outline = EUROPE_BOUNDARIES[code] ?? "";
  const dots = useMemo(() => geographicDots(outline, bounds, pitch), [outline, bounds, pitch]);
  if (!dots) return null;
  return (
    <g data-country={code} fill="none">
      <path d={outline} stroke={BORDER_COLOR} strokeWidth={pitch * 0.32} />
      <path d={dots} stroke={color} strokeWidth={pitch * 0.59} strokeLinecap="round" />
    </g>
  );
}

const countryBounds = Object.fromEntries(
  REGIONS.map(({ code }) => [code, COUNTRY_VIEWS[code].split(" ").map(Number)]),
) as Record<(typeof REGIONS)[number]["code"], [number, number, number, number]>;

function EuropeanOutline() {
  return (
    <>
      <BackgroundDots pitch={EUROPE_PITCH} bounds={EUROPE_VIEW} />
      {Object.keys(EUROPE_BOUNDARIES).map((code) => (
        <CountryDots
          key={code}
          code={code}
          color={REGIONS.find((entry) => entry.code === code)?.color ?? LAND_COLOR}
          pitch={EUROPE_PITCH}
          bounds={EUROPE_VIEW}
        />
      ))}
    </>
  );
}

function mapPoint({ id, lat, lng }: LocationSummary) {
  return REGIONS.some((region) => region.id === id) &&
    lat != null &&
    lng != null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
    ? europePoint(lng, lat)
    : null;
}

export function geographicRows(locations: LocationSummary[], metric: GeographicMetric) {
  return locations.map((location) => ({
    location,
    city: REGIONS.find(({ id }) => id === location.id)?.city,
    point: mapPoint(location),
    value: regionalValue(location, metric),
    coverage: regionalCoverage(location, metric),
  }));
}

export function GeographicFootprint({
  metric,
  onMetricChange,
}: {
  metric: GeographicMetric;
  onMetricChange: (metric: GeographicMetric) => void;
}) {
  const locations = useLocations();
  return (
    <Q q={locations}>
      {(rows) => (
        <GeographicView locations={rows} metric={metric} onMetricChange={onMetricChange} />
      )}
    </Q>
  );
}

export function GeographicView({
  locations,
  metric,
  onMetricChange,
}: {
  locations: LocationSummary[];
  metric: GeographicMetric;
  onMetricChange: (metric: GeographicMetric) => void;
}) {
  const [active, setActive] = useState<LocationSummary["id"] | null>(null);
  const [region, setRegion] = useState<LocationSummary["id"]>();
  const comparison = useRef<HTMLElement>(null);
  const goToCity = (id: LocationSummary["id"]) => {
    setRegion(id);
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    comparison.current?.scrollIntoView?.({
      behavior: reduceMotion ? "instant" : "smooth",
      block: "start",
    });
  };
  const selectedMetric = GEOGRAPHIC_METRICS.find(({ key }) => key === metric)!;
  const format = selectedMetric.format;
  const rows = geographicRows(locations, metric);
  const selected = rows.find(({ location }) => location.id === active);
  const ranked = rows
    .filter(({ point }) => point)
    .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
  const unallocated = rows.filter(({ point }) => !point);
  const minimum = Math.min(0, ...ranked.map(({ value }) => value ?? 0));
  const maximum = Math.max(0, ...ranked.map(({ value }) => value ?? 0));
  const span = maximum - minimum || 1;

  return (
    <section className="@container space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Geographic footprint</h2>
        <div role="group" aria-label="Geographic metric" className="flex flex-wrap gap-1">
          {GEOGRAPHIC_METRICS.map(({ key, label }) => (
            <Button
              key={key}
              type="button"
              size="sm"
              variant="ghost"
              className="secondary-selection"
              aria-pressed={metric === key}
              onClick={() => onMetricChange(key)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        City pins represent approximate reporting regions. Mixed or unresolved geography appears in
        the list without a pin.
      </p>
      <div className="grid items-start gap-4 @3xl:grid-cols-[minmax(0,1fr)_minmax(15rem,0.65fr)]">
        <div className="geographic-map rounded-lg border p-3" data-inspector-interactive>
          <svg
            viewBox={EUROPE_VIEW.join(" ")}
            className="mx-auto block w-full max-w-2xl"
            aria-label="Dotted map of European reporting regions"
          >
            <EuropeanOutline />
            {ranked.map(({ city, location, value, coverage, point }) => {
              if (!point) return null;
              const [x, y] = point;
              return (
                <g
                  key={location.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={region === location.id}
                  aria-label={`${city} area · ${format(value)}`}
                  className="cursor-pointer focus-visible:outline-none focus-visible:[&>circle]:stroke-[#f9da7d]"
                  transform={`translate(${x},${y})`}
                  onClick={() => goToCity(location.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      goToCity(location.id);
                    }
                  }}
                >
                  <title>
                    {location.label} · {format(value)}
                    {coverage && ` · ${coverage}`}
                  </title>
                  <circle
                    r="3.5"
                    fill={value == null ? "var(--geo-background)" : "#fff"}
                    stroke={
                      region === location.id ? "#f9da7d" : value == null ? "#fff" : "transparent"
                    }
                    strokeWidth="1.25"
                    strokeDasharray={value == null ? "2 1" : undefined}
                  />
                  <text
                    x="6"
                    y="2.5"
                    fill="currentColor"
                    stroke="var(--geo-background)"
                    strokeWidth="2"
                    paintOrder="stroke"
                    fontSize="6.6"
                    fontWeight="600"
                  >
                    {city}
                  </text>
                </g>
              );
            })}
          </svg>
          {ranked.some(({ value }) => value == null) && (
            <p className="text-center text-xs text-muted-foreground">
              Dashed pin · Value unavailable
            </p>
          )}
        </div>
        <div className="card-elevated min-w-0 px-3 py-2">
          <h3 className="border-b px-1 pb-2 text-sm font-semibold">Location leaderboard</h3>
          {metric === "co2KgMarket" && (
            <p className="px-1 pt-2 text-xs text-muted-foreground">
              Market-based emissions cover only activity with a supported factor.
            </p>
          )}
          {ranked.length > 0 && (
            <ol aria-label="Ranked mapped cities" className="divide-y">
              {ranked.map(({ location, value, city, coverage }, index) => (
                <li key={location.id} className="py-1">
                  <div className="flex min-w-0 items-center gap-1">
                    <button
                      type="button"
                      aria-pressed={region === location.id}
                      data-inspector-interactive
                      className="secondary-selection grid min-w-0 flex-1 grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 rounded-sm px-1 py-2 text-left text-xs hover:bg-accent"
                      onClick={() => goToCity(location.id)}
                    >
                      <span className="num text-muted-foreground">{index + 1}</span>
                      <span className="min-w-0 break-words font-medium">{city}</span>
                      <span className="num text-right">{format(value)}</span>
                      <span
                        data-location-track
                        className="relative col-span-3 h-1.5 w-full rounded-full bg-muted"
                      >
                        {value != null && (
                          <span
                            className="absolute h-full rounded-full bg-success"
                            style={{
                              left: `${((Math.min(0, value) - minimum) / span) * 100}%`,
                              width: `${(Math.abs(value) / span) * 100}%`,
                            }}
                          />
                        )}
                      </span>
                    </button>
                    <EvidenceInfoButton
                      label={`View location evidence for ${city}`}
                      onClick={() => setActive(location.id)}
                    />
                  </div>
                  {coverage && (
                    <p className="px-1 pb-1 text-xs text-muted-foreground">{coverage}</p>
                  )}
                </li>
              ))}
            </ol>
          )}
          {unallocated.map(({ location, value, coverage }) => (
            <div key={location.id} className="border-t px-1 py-2">
              <button
                type="button"
                aria-pressed={region === location.id}
                data-inspector-interactive
                className="secondary-selection grid w-full grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-sm py-1 text-left text-xs hover:bg-accent"
                onClick={() => {
                  setRegion(location.id);
                  setActive(location.id);
                }}
              >
                <span className="font-medium">{location.label}</span>
                <span className="num text-right">{format(value)}</span>
              </button>
              {coverage && <p className="text-xs text-muted-foreground">{coverage}</p>}
            </div>
          ))}
          {rows.length === 0 && (
            <p className="p-2 text-sm text-muted-foreground">
              No locations were supplied for this scope.
            </p>
          )}
        </div>
      </div>
      <section
        ref={comparison}
        id="city-area-comparison"
        aria-labelledby="city-comparison"
        className="space-y-3 border-t pt-4"
      >
        <h3 id="city-comparison" className="font-semibold">
          City-area comparison
        </h3>
        <div className="grid gap-3 @4xl:grid-cols-3">
          {REGIONS.map(({ id, city, country, code, color, pitch }) => {
            const location = locations.find((row) => row.id === id);
            const coordinates = location ? mapPoint(location) : null;
            const index = location?.carbonIntensityIndex;
            return (
              <article
                key={id}
                className="grid min-w-0 grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] items-center gap-3 rounded-md border bg-card p-3"
              >
                <svg
                  viewBox={COUNTRY_VIEWS[code]}
                  aria-hidden="true"
                  className="geographic-map h-32 w-full rounded-sm"
                >
                  <BackgroundDots pitch={pitch} bounds={countryBounds[code]} />
                  <CountryDots
                    code={code}
                    color={color}
                    pitch={pitch}
                    bounds={countryBounds[code]}
                  />
                  {coordinates && (
                    <circle
                      cx={coordinates[0]}
                      cy={coordinates[1]}
                      r={pitch * 1.05}
                      fill="#fff"
                      stroke="var(--geo-background)"
                      strokeWidth={pitch * 0.45}
                    />
                  )}
                </svg>
                <div className="min-w-0 self-start">
                  <h4 className="text-sm font-semibold">{country}</h4>
                  <p className="text-xs text-muted-foreground">{city}</p>
                  <dl className="mt-2 space-y-1.5">
                    {GEOGRAPHIC_METRICS.map(({ key, label, format }) => {
                      const Icon = ICONS[key];
                      return (
                        <div
                          key={key}
                          className="grid min-h-10 grid-cols-[0.8rem_minmax(0,1fr)] items-baseline gap-x-1.5 text-xs"
                        >
                          <Icon aria-hidden className="size-3 self-start text-muted-foreground" />
                          <div>
                            <dt className="text-muted-foreground">{label}</dt>
                            <dd className="num font-medium">
                              {format(location ? regionalValue(location, key) : null)}
                            </dd>
                          </div>
                        </div>
                      );
                    })}
                    <div className="grid min-h-10 grid-cols-[0.8rem_minmax(0,1fr)] items-start gap-x-1.5 text-xs">
                      <DetailDrawer
                        title="Carbon intensity index"
                        trigger={
                          <button
                            type="button"
                            aria-label="Explain carbon intensity index"
                            className="grid size-4 cursor-pointer place-items-center rounded text-muted-foreground hover:text-foreground"
                          >
                            <Info aria-hidden className="size-3" />
                          </button>
                        }
                      >
                        <p>
                          The backend compares each region’s location-based CO₂e per kWh with the
                          energy-weighted average for Zurich, Frankfurt, and Dublin. It uses ledger
                          rows with both values in the current scope.
                        </p>
                        <p>
                          Below 1.00× means below the mapped-region average. At 1.00× the region
                          matches the average. Above 1.00× means above the average.
                        </p>
                        <p>
                          The index is unavailable if the paired regional data are missing or the
                          comparison has no positive denominator.
                        </p>
                      </DetailDrawer>
                      <div>
                        <dt className="text-muted-foreground">Carbon intensity index</dt>
                        <dd className="num font-medium">
                          {index == null ? "Unavailable" : `${index.toFixed(2)}×`}
                        </dd>
                      </div>
                    </div>
                  </dl>
                </div>
              </article>
            );
          })}
        </div>
      </section>
      <GeographicBreakdowns
        locations={locations}
        metric={metric}
        region={region}
        onRegionChange={setRegion}
      />
      <AnalyticalInspector
        title={selected?.location.label ?? "Location evidence"}
        trigger={null}
        open={selected != null}
        onOpenChange={(open) => {
          if (!open) setActive(null);
        }}
      >
        {selected && (
          <div className="space-y-4">
            <LocationEvidence location={selected.location} pinned={selected.point != null} />
          </div>
        )}
      </AnalyticalInspector>
    </section>
  );
}

function LocationEvidence({ location, pinned }: { location: LocationSummary; pinned: boolean }) {
  const ranges = {
    costChf: null,
    energyKwh: location.energyKwhRange,
    co2KgLocation: location.co2KgLocationRange,
    co2KgMarket: location.co2KgMarketRange,
  };
  const grid = location.gridKgPerKwh;
  const gridNumber = (value: number) => formatNumber(value, { maximumFractionDigits: 4 });
  const sources = [...(location.sources ?? [])];
  if (location.gridFactorEvidence?.source)
    sources.push({
      source: location.gridFactorEvidence.source,
      detail: location.gridFactorEvidence.note,
    });
  return (
    <>
      <DetailBlock title="Regional values">
        {location.period && <p>Ledger period · {location.period}</p>}
        <p>{formatNumber(location.resourceCount)} distinct resources in this region</p>
        <dl className="space-y-2">
          {GEOGRAPHIC_METRICS.map(({ key, label, format }) => {
            const range = ranges[key];
            const coverage = key === "co2KgMarket" ? null : regionalCoverage(location, key);
            return (
              <div key={key}>
                <dt className="font-medium">{label}</dt>
                <dd>{format(regionalValue(location, key))}</dd>
                {range && range.low !== range.high && (
                  <dd>
                    Scenario range · {format(range.low)} to {format(range.high)}
                  </dd>
                )}
                {coverage && <dd>{coverage}</dd>}
              </div>
            );
          })}
        </dl>
      </DetailBlock>
      <DetailBlock title="Geographic attribution">
        <p>
          {pinned
            ? `${location.country} · Approximate reporting region`
            : "No city allocation available."}
        </p>
        <p>Providers · {location.providers.join(", ") || "Unavailable"}</p>
        {grid && (
          <p>
            Location-based electricity factor · {gridNumber(grid.mid)} kg CO₂e/kWh · Range{" "}
            {gridNumber(grid.low)} to {gridNumber(grid.high)}
          </p>
        )}
        {location.gridFactorEvidence?.note && <p>{location.gridFactorEvidence.note}</p>}
        {!location.marketCoverage && location.risks.map((risk) => <p key={risk}>{risk}</p>)}
      </DetailBlock>
      {location.marketCoverage && (
        <CoverageEvidence
          title="Market-based emissions coverage"
          coverage={location.marketCoverage}
        />
      )}
      {sources.length > 0 && <EvidenceSources sources={sources} />}
    </>
  );
}
