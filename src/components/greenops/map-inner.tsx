import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import type { LocationSummary } from "@/lib/api/types";

export type MapMetric = "costChf" | "co2KgLocation" | "resourceCount";
const COLOR: Record<MapMetric, string> = {
  costChf: "var(--info)",
  co2KgLocation: "var(--success)",
  resourceCount: "var(--forecast)",
};

/** Browser-only map; markers are approximate regions, not exact data centres. */
export default function InfraMap({
  locations,
  metric,
  selected,
  onSelect,
}: {
  locations: LocationSummary[];
  metric: MapMetric;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const pins = locations.flatMap((location) =>
    location.id !== "eu-mixed" &&
    location.id !== "unknown" &&
    location.lat != null &&
    location.lng != null
      ? [{ location, lat: location.lat, lng: location.lng }]
      : [],
  );
  const max = Math.max(1, ...pins.map(({ location }) => location[metric] ?? 0));
  return (
    <MapContainer
      center={[50.2, 3.5]}
      zoom={4.4}
      zoomSnap={0.2}
      scrollWheelZoom={false}
      style={{ height: 420, borderRadius: 12 }}
    >
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
        className="map-tiles-dark"
      />
      {pins.map(({ location: l, lat, lng }) => (
        <CircleMarker
          key={l.id}
          center={[lat, lng]}
          radius={10 + 28 * Math.sqrt(Math.max(0, l[metric] ?? 0) / max)}
          eventHandlers={{ click: () => onSelect(l.id) }}
          pathOptions={{
            color: COLOR[metric],
            fillColor: COLOR[metric],
            fillOpacity: l[metric] == null ? 0 : selected === l.id ? 0.6 : 0.3,
            weight: selected === l.id ? 3 : 1.5,
            dashArray: l[metric] == null ? "4 4" : undefined,
          }}
        >
          <Tooltip>{l.label}</Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
