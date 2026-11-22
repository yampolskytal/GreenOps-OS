import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Cloud, Wallet, Zap } from "lucide-react";
import { geographicDots } from "@/lib/geographic-dots";
import { COUNTRY_VIEWS, EUROPE_BOUNDARIES, europePoint } from "@/lib/europe-boundaries";
import { GeographicBreakdowns } from "./geographic-breakdowns";
import type { LocationSummary } from "@/lib/api/types";
import { carbonMass, chf, formatNumber } from "@/lib/format";
import { useLocations } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { AnalyticalInspector } from "./analytical-inspector";
import { DetailBlock, EvidenceInfoButton } from "./details";
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
const COLORS = ["#e0e8ac", "#afd17d", "#77a866", "#49794f", "#286044"];

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
  const values = locations.flatMap((location) => {
    if (!REGIONS.some(({ id }) => id === location.id)) return [];
    const value = suppliedValue(location, metric);
    return value == null ? [] : [value];
  });
  const low = Math.min(...values);
  const high = Math.max(...values);
  return locations.map((location) => {
    const value = suppliedValue(location, metric);
    const index =
      value == null || low === high || !Number.isFinite(low)
        ? 2
        : Math.max(0, Math.min(4, Math.floor(((value - low) / (high - low)) * 5)));
    return {
      location,
      city: REGIONS.find(({ id }) => id === location.id)?.city,
      value,
      color: value == null ? null : COLORS[index],
    };
  });
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
  const values = rows.flatMap(({ value, city }) => (value == null || !city ? [] : [value]));
  const low = Math.min(...values);
  const high = Math.max(...values);

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
            {rows.map(({ city, location, value, color }) => {
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
                  <circle
                    r="3.5"
                    fill={color ?? "var(--geo-background)"}
                    stroke={highlightedCity === location.id ? "#f9da7d" : "currentColor"}
                    strokeWidth={highlightedCity === location.id ? 1.6 : 1}
                    strokeDasharray={color == null ? "2 2" : undefined}
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
          <div className="mx-auto max-w-xs text-xs">
            <p className="mb-1">
              City markers ·{" "}
              {metric === "co2KgLocation" ? "Location-based emissions" : selectedMetric.label}
            </p>
            {values.length > 0 ? (
              <>
                <div className="flex h-2 overflow-hidden rounded-sm" aria-hidden="true">
                  {(low === high ? [COLORS[2]] : COLORS).map((color) => (
                    <span key={color} className="flex-1" style={{ backgroundColor: color }} />
                  ))}
                </div>
                <div className="num mt-1 flex flex-wrap justify-between gap-2 text-muted-foreground">
                  <span>{format(low)}</span>
                  {low !== high && <span>{format(high)}</span>}
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">No values supplied.</p>
            )}
          </div>
        </div>
        <div className="card-elevated min-w-0 px-3 py-2">
          <h3 className="border-b px-1 pb-2 text-sm font-semibold">Location breakdown</h3>
          {rows.length ? (
            <ul className="divide-y">
              {rows.map(({ location, value, color, city }) => (
                <li key={location.id}>
                  <div className="flex min-w-0 items-center gap-1">
                    <button
                      type="button"
                      aria-pressed={(city ? highlightedCity : active) === location.id}
                      data-inspector-interactive
                      className="secondary-selection grid min-w-0 flex-1 grid-cols-[0.625rem_minmax(0,1fr)_auto] items-center gap-2 rounded-sm px-1 py-2 text-left text-xs hover:bg-accent"
                      onClick={() => (city ? goToCity(location.id) : setActive(location.id))}
                    >
                      <span
                        aria-hidden
                        className="size-2.5 rounded-full border border-muted-foreground/50"
                        style={{ backgroundColor: color ?? "transparent" }}
                      />
                      <span className="min-w-0 break-words font-medium">{location.label}</span>
                      <span className="num text-right">{format(value)}</span>
                    </button>
                    {city && (
                      <EvidenceInfoButton
                        label={`View location evidence for ${city}`}
                        onClick={() => setActive(location.id)}
                      />
                    )}
                  </div>
                  {!city && (
                    <p className="pb-2 pl-5 text-xs text-muted-foreground">
                      No city allocation supplied.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
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
            return (
              <article
                key={id}
                data-city-selected={highlightedCity === id}
                className="grid min-w-0 grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] items-center gap-3 rounded-md border bg-card p-3 data-[city-selected=true]:border-accent-ink"
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
                      fill="#f9da7d"
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
