import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import type { LocationSummary } from "@/lib/api/types";

export type MapMetric = "costChf" | "co2KgLocation" | "resourceCount";
const COLOR: Record<MapMetric, string> = { costChf: "var(--info)", co2KgLocation: "var(--success)", resourceCount: "var(--forecast)" };

/** Browser-only map; markers are approximate regions, not exact data centres. */
export default function InfraMap({ locations, metric, selected, onSelect }: { locations: LocationSummary[]; metric: MapMetric; selected: string | null; onSelect: (id: string) => void }) {
  const max = Math.max(...locations.map((l) => l[metric]));
  return (
    <MapContainer center={[50.2, 3.5]} zoom={4.4} zoomSnap={0.2} scrollWheelZoom={false} style={{ height: 420, borderRadius: 12 }}>
      <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution='&copy; OpenStreetMap &copy; CARTO' />
      <CircleMarker center={[47.56, 7.59]} radius={5} pathOptions={{ color: "#fff", fillColor: "#fff", fillOpacity: 1, weight: 1 }}><Tooltip permanent direction="left" offset={[-6, 0]}>Basel HQ</Tooltip></CircleMarker>
      {locations.map((l) => (
        <CircleMarker key={l.id} center={[l.lat, l.lng]} radius={10 + 28 * Math.sqrt(l[metric] / max)} eventHandlers={{ click: () => onSelect(l.id) }}
          pathOptions={{ color: COLOR[metric], fillColor: COLOR[metric], fillOpacity: selected === l.id ? 0.6 : 0.3, weight: selected === l.id ? 3 : 1.5, dashArray: l.id === "eu-mixed" ? "4 4" : undefined }}>
          <Tooltip>{l.label}</Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
