import { lazy, Suspense, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { AppShell } from "@/components/greenops/shell";
import { ChartCard, DemoTag, Loader, Q } from "@/components/greenops/ui";
import { FootprintCalendar, type CalMetric } from "@/components/greenops/calendar";
import type { MapMetric } from "@/components/greenops/map-inner";
import { useDaily, useLocations } from "@/lib/queries";
import { chf, kg, kwh } from "@/lib/format";
import { cn } from "@/lib/utils";
import { seo } from "@/lib/seo";

const InfraMap = lazy(() => import("@/components/greenops/map-inner"));

export const Route = createFileRoute("/footprint")({
  head: () => seo("Digital footprint & map — GreenOps OS", "Daily footprint calendar and infrastructure regions in Zurich, Frankfurt and Dublin."),
  component: Footprint,
});

function Toggle<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return <div className="inline-flex rounded-lg border bg-surface p-0.5">{options.map(([v, l]) => <button key={v} onClick={() => onChange(v)} className={cn("rounded-md px-2.5 py-1 text-xs", value === v ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{l}</button>)}</div>;
}

function Footprint() {
  const daily = useDaily(); const locs = useLocations();
  const [cm, setCm] = useState<CalMetric>("co2Kg"); const [mm, setMm] = useState<MapMetric>("co2KgLocation"); const [sel, setSel] = useState<string | null>("frankfurt");
  return (
    <AppShell kicker="Connect" title="Your digital footprint" subtitle="When and where your digital tools use energy and emit CO₂." actions={<DemoTag />}>
      <ChartCard title="Footprint calendar" subtitle="Each square is one day" action={<Toggle value={cm} onChange={setCm} options={[["co2Kg", "CO₂"], ["costChf", "Cost"], ["energyKwh", "Energy"]]} />}>
        <Q q={daily}>{(d) => <FootprintCalendar days={d} metric={cm} />}</Q>
      </ChartCard>
      <ChartCard title="Where your infrastructure runs" subtitle="Approximate regions — not exact data-centre addresses" className="mt-6" action={<Toggle value={mm} onChange={setMm} options={[["co2KgLocation", "CO₂"], ["costChf", "Cost"], ["resourceCount", "Resources"]]} />}>
        <Q q={locs}>{(ls) => {
          const l = ls.find((x) => x.id === sel);
          return (
            <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
              <ClientOnly fallback={<Loader label="Loading map" />}><Suspense fallback={<Loader label="Loading map" />}><InfraMap locations={ls} metric={mm} selected={sel} onSelect={setSel} /></Suspense></ClientOnly>
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1">{ls.map((x) => <button key={x.id} onClick={() => setSel(x.id)} className={cn("rounded-full border px-2.5 py-1 text-xs", sel === x.id ? "border-primary text-primary" : "text-muted-foreground")}>{x.label}</button>)}</div>
                {l && <div className="rise-in rounded-xl border bg-surface p-4 text-sm" key={l.id}>
                  <p className="font-display text-lg font-semibold">{l.label}</p><p className="text-xs text-muted-foreground">{l.country} · {l.providers.join(", ")}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">{[["Resources", String(l.resourceCount)], ["Cost / yr", chf(l.costChf)], ["Energy / yr", kwh(l.energyKwh)], ["Grid mix", `${l.gridKgPerKwh.mid} kg/kWh`]].map(([k, v]) => <div key={k} className="rounded bg-muted/60 p-2"><p className="text-[10px] text-muted-foreground">{k}</p><p className="num">{v}</p></div>)}</div>
                  <p className="mb-1 mt-4 text-xs text-muted-foreground">CO₂ per year: location-based vs. market-based</p>
                  {[["Location-based", l.co2KgLocation, "bg-success"], ["Market-based", l.co2KgMarket, "bg-forecast"]].map(([k, v, c]) => <div key={k as string} className="mb-2"><div className="flex justify-between text-xs"><span>{k}</span><span className="num">{kg(v as number)}</span></div><div className="mt-1 h-2 rounded-full bg-muted"><div className={cn("h-full rounded-full", c as string)} style={{ width: `${((v as number) / Math.max(l.co2KgLocation, l.co2KgMarket, 1)) * 100}%` }} /></div></div>)}
                  <p className="text-[11px] text-muted-foreground">Market-based uses providers' green-power contracts; the power on the grid is unchanged.</p>
                  {l.risks.length > 0 && <p className="mt-3 text-xs text-warning">⚠ {l.risks.join(" · ")}</p>}
                </div>}
              </div>
            </div>
          );
        }}</Q>
      </ChartCard>
    </AppShell>
  );
}
