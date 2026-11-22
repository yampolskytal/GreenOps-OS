import { useId, useRef, useState, type ReactNode } from "react";
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
  { key: "costChf", label: "Cost", format: chf },
  {
    key: "co2KgLocation",
    label: "Emissions",
    format: (value: number | null) => carbonMass(value, "kg CO₂e"),
  },
  {
    key: "energyKwh",
    label: "Energy consumption",
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
    color: "#bdd681",
    pitch: 1.35,
  },
  {
    id: "frankfurt",
    city: "Frankfurt",
    country: "Germany",
    code: "DEU",
    color: "#86b888",
    pitch: 2.35,
  },
  { id: "dublin", city: "Dublin", country: "Ireland", code: "IRL", color: "#d0d88b", pitch: 1.7 },
] as const;

function DottedOutline({
  code,
  color,
  pitch,
  radius = pitch * 0.33,
}: {
  code?: string;
  color: string;
  pitch: number;
  radius?: number;
}) {
  const pattern = useId();
  return (
    <>
      <defs>
        <pattern id={pattern} width={pitch} height={pitch} patternUnits="userSpaceOnUse">
          <circle cx={pitch / 2} cy={pitch / 2} r={radius} fill={color} />
        </pattern>
      </defs>
      {code ? (
        <path d={EUROPE_BOUNDARIES[code]} fill={`url(#${pattern})`} fillRule="evenodd" />
      ) : (
        <rect x="-1000" y="-1000" width="2500" height="2500" fill={`url(#${pattern})`} />
      )}
    </>
  );
}

function EuropeanOutline({ attributed }: { attributed: LocationSummary["id"][] }) {
  const pattern = useId();
  return (
    <>
      <DottedOutline color="var(--geo-grid)" pitch={5} radius={0.65} />
      <defs>
        <pattern id={pattern} width="5" height="5" patternUnits="userSpaceOnUse">
          <circle cx="2.5" cy="2.5" r="1.55" fill="var(--geo-land)" />
        </pattern>
      </defs>
      {Object.entries(EUROPE_BOUNDARIES).map(([code, path]) => {
        const region = REGIONS.find(
          (entry) => entry.code === code && attributed.includes(entry.id),
        );
        return region ? (
          <DottedOutline key={code} code={code} color={region.color} pitch={5} />
        ) : (
          <path key={code} d={path} fill={`url(#${pattern})`} fillRule="evenodd" />
        );
      })}
    </>
  );
}

function suppliedValue(location: LocationSummary, metric: GeoMetric) {
  const value = location[metric];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function geographicRows(locations: LocationSummary[], metric: GeoMetric) {
  const values = locations.flatMap((location) => {
    const value = suppliedValue(location, metric);
    return value == null ? [] : [value];
  });
  const low = Math.min(...values);
  const high = Math.max(...values);
  return locations.map((location) => {
    const value = suppliedValue(location, metric);
    const index =
      value == null || low === high
        ? 2
        : Math.min(4, Math.floor(((value - low) / (high - low)) * 5));
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
  const values = rows.flatMap(({ value }) => (value == null ? [] : [value]));
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
            viewBox="94 179 250 150"
            className="mx-auto block w-full max-w-2xl"
            aria-label="Dotted map of European reporting regions"
          >
            <EuropeanOutline attributed={locations.map(({ id }) => id)} />
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
                    r="5"
                    fill={color ?? "var(--geo-background)"}
                    stroke={highlightedCity === location.id ? "#f9da7d" : "#f8f2df"}
                    strokeWidth={highlightedCity === location.id ? 2.5 : 1.25}
                    strokeDasharray={color == null ? "2 2" : undefined}
                  />
                  <text
                    x="7"
                    y="4"
                    fill="currentColor"
                    stroke="var(--geo-background)"
                    strokeWidth="3"
                    paintOrder="stroke"
                    fontSize="8.5"
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
        <div className="grid gap-4 @lg:grid-cols-3">
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
                className="min-w-0 rounded-md border border-transparent p-1 data-[city-selected=true]:border-accent-ink data-[city-selected=true]:bg-accent/40"
              >
                <svg
                  viewBox={COUNTRY_VIEWS[code]}
                  aria-hidden="true"
                  className="geographic-map h-36 w-full rounded-md border p-2"
                >
                  <DottedOutline color="var(--geo-grid)" pitch={pitch} radius={pitch * 0.14} />
                  <DottedOutline code={code} color={color} pitch={pitch} />
                  {coordinates && (
                    <circle
                      cx={coordinates[0]}
                      cy={coordinates[1]}
                      r={pitch * 1.35}
                      fill="#f9da7d"
                      stroke="var(--geo-background)"
                      strokeWidth={pitch * 0.55}
                    />
                  )}
                </svg>
                <h4 className="mt-2 min-h-8 text-sm font-semibold">
                  {city}, {country}
                </h4>
                <dl className="divide-y border-y">
                  {METRICS.map(({ key, label, format }) => (
                    <div
                      key={key}
                      className="flex min-h-12 items-center justify-between gap-2 py-2 text-xs"
                    >
                      <dt className="text-muted-foreground">
                        {key === "co2KgLocation" ? "Location-based CO₂" : label}
                      </dt>
                      <dd className="num text-right font-medium">
                        {format(location ? suppliedValue(location, key) : null)}
                      </dd>
                    </div>
                  ))}
                </dl>
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
