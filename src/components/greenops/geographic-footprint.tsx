import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Cloud, Info, Wallet, Zap } from "lucide-react";
import { geographicDots } from "@/lib/geographic-dots";
import { COUNTRY_VIEWS, EUROPE_BOUNDARIES, europePoint } from "@/lib/europe-boundaries";
import { GeographicBreakdowns } from "./geographic-breakdowns";
import type { LocationSummary } from "@/lib/api/types";
import { carbonMass, chf, formatNumber } from "@/lib/format";
import { useLocations } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { AnalyticalInspector } from "./analytical-inspector";
import { DetailBlock, DetailDrawer, EvidenceInfoButton } from "./details";
import { Q } from "./ui";

const METRICS = [
  { key: "costChf", label: "Cost", format: chf, icon: Wallet },
  {
    key: "co2KgLocation",
    label: "Emissions",
    icon: Cloud,
    format: (value: number | null) => carbonMass(value, "kg CO₂e"),
  },
  {
    key: "energyKwh",
    label: "Energy consumption",
    icon: Zap,
    format: (value: number | null) =>
      value == null ? "Unavailable" : `${formatNumber(value, { maximumFractionDigits: 3 })} kWh`,
  },
] as const;
type GeoMetric = (typeof METRICS)[number]["key"];

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
  { id: "dublin", city: "Dublin", country: "Ireland", code: "IRL", color: "#C5E66B", pitch: 1.7 },
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

function suppliedValue(location: LocationSummary, metric: GeoMetric) {
  const value = location[metric];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function geographicRows(locations: LocationSummary[], metric: GeoMetric) {
  return locations.map((location) => ({
    location,
    city: REGIONS.find(({ id }) => id === location.id)?.city,
    value: suppliedValue(location, metric),
  }));
}

export function carbonIntensityIndices(locations: LocationSummary[]) {
  // /locations returns both modeled metrics for the same filtered period and ledger rows.
  const regions: { id: LocationSummary["id"]; emissions: number; energy: number }[] = [];
  const indices = new Map<LocationSummary["id"], number>();
  for (const { id } of REGIONS) {
    const location = locations.find((entry) => entry.id === id);
    if (!location) return indices;
    const emissions = suppliedValue(location, "co2KgLocation");
    const energy = suppliedValue(location, "energyKwh");
    // Zero energy cannot be distinguished from missing modeled coverage in the subtotal.
    if (emissions == null || emissions < 0 || energy == null || energy <= 0) return indices;
    regions.push({ id, emissions, energy });
  }

  const emissionsTotal = regions.reduce((sum, { emissions }) => sum + emissions, 0);
  const energyTotal = regions.reduce((sum, { energy }) => sum + energy, 0);
  if (!Number.isFinite(emissionsTotal) || !Number.isFinite(energyTotal) || emissionsTotal <= 0)
    return indices;
  for (const { id, emissions, energy } of regions) {
    const index = emissions / emissionsTotal / (energy / energyTotal);
    if (Number.isFinite(index)) indices.set(id, index);
  }
  return indices;
}

export function GeographicFootprint({
  metric,
  onMetricChange,
}: {
  metric: GeoMetric;
  onMetricChange: (metric: GeoMetric) => void;
}) {
  const locations = useLocations();
  return (
    <Q q={locations}>
      {(rows) => (
        <GeographicView locations={rows} metric={metric} onMetricChange={onMetricChange}>
          <GeographicBreakdowns locations={rows} metric={metric} />
        </GeographicView>
      )}
    </Q>
  );
}

export function GeographicView({
  locations,
  metric,
  onMetricChange,
  children,
}: {
  locations: LocationSummary[];
  metric: GeoMetric;
  onMetricChange: (metric: GeoMetric) => void;
  children?: ReactNode;
}) {
  const [active, setActive] = useState<LocationSummary["id"] | null>(null);
  const [highlightedCity, setHighlightedCity] = useState<LocationSummary["id"] | null>(null);
  const comparison = useRef<HTMLElement>(null);
  const goToCity = (id: LocationSummary["id"]) => {
    setHighlightedCity(id);
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    comparison.current?.scrollIntoView?.({
      behavior: reduceMotion ? "instant" : "smooth",
      block: "start",
    });
  };
  const selectedMetric = METRICS.find(({ key }) => key === metric) ?? METRICS[0];
  const format = selectedMetric.format;
  const rows = geographicRows(locations, metric);
  const selected = rows.find(({ location }) => location.id === active);
  const ranked = rows
    .filter(({ city }) => city)
    .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
  const unallocated = rows.filter(({ city }) => !city);
  const maximum = Math.max(0, ...ranked.map(({ value }) => value ?? 0));
  const intensity = carbonIntensityIndices(locations);

  return (
    <section className="@container space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Geographic footprint</h2>
        <div role="group" aria-label="Geographic metric" className="flex flex-wrap gap-1">
          {METRICS.map(({ key, label }) => (
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
        Figures are regional subtotals from the provider. City labels mark approximate regional
        locations. Facility-level totals and exact addresses are unavailable.
      </p>
      <div className="grid items-start gap-4 @3xl:grid-cols-[minmax(0,1fr)_minmax(15rem,0.65fr)]">
        <div className="geographic-map rounded-lg border p-3" data-inspector-interactive>
          <svg
            viewBox={EUROPE_VIEW.join(" ")}
            className="mx-auto block w-full max-w-2xl"
            aria-label="Dotted map of European reporting regions"
          >
            <EuropeanOutline />
            {rows.map(({ city, location, value }) => {
              if (!city || !Number.isFinite(location.lat) || !Number.isFinite(location.lng))
                return null;
              const [x, y] = europePoint(location.lng, location.lat);
              return (
                <g
                  key={location.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={highlightedCity === location.id}
                  aria-label={`${city} area · ${format(value)}`}
                  className="cursor-pointer focus-visible:outline-none focus-visible:[&>circle]:stroke-white"
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
                  </title>
                  <circle r="3.5" fill="#fff" />
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
        </div>
        <div className="card-elevated min-w-0 px-3 py-2">
          <h3 className="border-b px-1 pb-2 text-sm font-semibold">Location leaderboard</h3>
          {ranked.length > 0 && (
            <ol aria-label="Ranked mapped cities" className="divide-y">
              {ranked.map(({ location, value, city }, index) => (
                <li key={location.id} className="py-1">
                  <div className="flex min-w-0 items-center gap-1">
                    <button
                      type="button"
                      aria-pressed={highlightedCity === location.id}
                      data-inspector-interactive
                      className="secondary-selection grid min-w-0 flex-1 grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 rounded-sm px-1 py-2 text-left text-xs hover:bg-accent"
                      onClick={() => goToCity(location.id)}
                    >
                      <span className="num text-muted-foreground">{index + 1}</span>
                      <span className="min-w-0 break-words font-medium">{city}</span>
                      <span className="num text-right">{format(value)}</span>
                      <span
                        data-location-track
                        className="col-span-3 h-1.5 w-full rounded-full bg-muted"
                      >
                        {value != null && maximum > 0 && (
                          <span
                            className="block h-full rounded-full bg-success"
                            style={{ width: `${(Math.max(0, value) / maximum) * 100}%` }}
                          />
                        )}
                      </span>
                    </button>
                    <EvidenceInfoButton
                      label={`View location evidence for ${city}`}
                      onClick={() => setActive(location.id)}
                    />
                  </div>
                </li>
              ))}
            </ol>
          )}
          {unallocated.map(({ location, value }) => (
            <div key={location.id} className="border-t px-1 py-2">
              <button
                type="button"
                aria-pressed={active === location.id}
                data-inspector-interactive
                className="secondary-selection grid w-full grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-sm py-1 text-left text-xs hover:bg-accent"
                onClick={() => setActive(location.id)}
              >
                <span className="font-medium">{location.label}</span>
                <span className="num text-right">{format(value)}</span>
              </button>
              <p className="text-xs text-muted-foreground">No city allocation supplied.</p>
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
            const coordinates =
              location && Number.isFinite(location.lat) && Number.isFinite(location.lng)
                ? europePoint(location.lng, location.lat)
                : null;
            const index = intensity.get(id);
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
                    {METRICS.map(({ key, label, format, icon: Icon }) => (
                      <div
                        key={key}
                        className="grid min-h-10 grid-cols-[0.8rem_minmax(0,1fr)] items-baseline gap-x-1.5 text-xs"
                      >
                        <Icon aria-hidden className="size-3 self-start text-muted-foreground" />
                        <div>
                          <dt className="text-muted-foreground">
                            {key === "co2KgLocation" ? "Location-based CO₂" : label}
                          </dt>
                          <dd className="num font-medium">
                            {format(location ? suppliedValue(location, key) : null)}
                          </dd>
                        </div>
                      </div>
                    ))}
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
                          The index divides the region’s share of location-based CO₂ emissions by
                          its share of modeled energy across Zurich, Frankfurt, and Dublin in the
                          current reporting period and filters. Mixed EU is excluded.
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
      {children}
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
            <DetailBlock title="Regional values">
              {METRICS.map(({ key, label, format }) => (
                <p key={key}>
                  {label} · {format(suppliedValue(selected.location, key))}
                </p>
              ))}
              <p>{formatNumber(selected.location.resourceCount)} resources in the provider group</p>
            </DetailBlock>
            <DetailBlock title="Attribution and coverage">
              <p>
                {selected.location.country} ·{" "}
                {selected.city ? "Approximate regional location" : "No city allocation supplied"}
              </p>
              <p>Providers · {selected.location.providers.join(", ") || "Unavailable"}</p>
              {selected.location.gridKgPerKwh && (
                <p>
                  Regional grid factor ·{" "}
                  {formatNumber(selected.location.gridKgPerKwh.mid, { maximumFractionDigits: 4 })}{" "}
                  kg CO₂e/kWh
                </p>
              )}
              {selected.location.risks.map((risk, index) => (
                <p key={index}>{risk}</p>
              ))}
            </DetailBlock>
          </div>
        )}
      </AnalyticalInspector>
    </section>
  );
}
