import { createFileRoute, Link } from "@tanstack/react-router";
import { Server, ShieldAlert, Clock, ArrowRight } from "lucide-react";
import { AppShell } from "@/components/greenops/shell";
import { ChartCard, KpiCard, Q } from "@/components/greenops/ui";
import { Button } from "@/components/ui/button";
import { DetailDrawer } from "@/components/greenops/details";
import { ResourceDetails } from "@/components/greenops/resource-details";
import { MeasureCard } from "@/components/greenops/measure-card";
import { useMeasures, useResources, useOverview } from "@/lib/queries";
import { runtimeSegments } from "@/lib/planning";
import { HistoricalPerformance } from "@/components/greenops/historical-performance";
import { seo } from "@/lib/seo";
import { DemoExceptions } from "@/components/greenops/demo-exceptions";
export const Route = createFileRoute("/it")({
  head: () =>
    seo(
      "IT Operations Dashboard — GreenOps OS",
      "Resource runtime, active workload coverage and safe operational recommendations.",
    ),
  component: It,
});
function It() {
  const rs = useResources(),
    ms = useMeasures(),
    ov = useOverview();
  return (
    <AppShell
      kicker="IT Manager · Dashboard"
      title="Operational efficiency, safely"
      subtitle="Separate recorded workload from runtime—and review dependencies before making a change."
    >
      <Q q={rs}>
        {(res) => (
          <>
            <div className="grid gap-6 border-b pb-6 md:grid-cols-3">
              <KpiCard
                label="Resources in view"
                value={res.length}
                format={String}
                sub="Servers & clusters"
                icon={<Server className="size-4" />}
              />
              <KpiCard
                label="High-criticality resources"
                value={res.filter((r) => r.criticality === "high").length}
                format={String}
                sub="Require protection review"
                icon={<ShieldAlert className="size-4" />}
              />
              <KpiCard
                label="Always-on resources"
                value={res.filter((r) => r.runtimeH30d != null && r.runtimeH30d >= 700).length}
                format={String}
                sub="At least 700 h in the last 30 days"
                icon={<Clock className="size-4" />}
              />
            </div>
            <section id="runtime" className="mt-6">
              <ChartCard
                title="Runtime versus active use"
                subtitle="Hours in the last 30 days · not all inactive runtime is safely removable"
              >
                <div className="mb-5 flex flex-wrap gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <span className="size-2 rounded bg-success" />
                    Recorded active workload
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="size-2 rounded bg-info" />
                    Running without recorded activity
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="size-2 rounded bg-muted" />
                    Unknown coverage
                  </span>
                </div>
                <div className="space-y-5">
                  {res.map((r) => {
                    const parts = runtimeSegments(r.runtimeH30d, r.activeH30d);
                    const scale = Math.max(1, r.runtimeH30d ?? 0);
                    return (
                      <DetailDrawer
                        fullWidth
                        key={r.id}
                        title={r.name}
                        trigger={
                          <Button
                            variant="ghost"
                            id={`res-${r.id}`}
                            data-runtime-resource={r.id}
                            className="runtime-resource grid h-auto w-full grid-cols-1 justify-stretch whitespace-normal rounded-lg border p-4 text-left"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="mb-3 grid min-w-0 gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
                                <span data-runtime-name className="min-w-0 break-words font-medium">
                                  {r.name}
                                </span>
                                <span
                                  data-runtime-hours
                                  className="num text-xs text-muted-foreground md:text-right"
                                >
                                  {parts.active == null
                                    ? "Active use unavailable"
                                    : `${parts.active} h active`}{" "}
                                  /{" "}
                                  {r.runtimeH30d == null
                                    ? "Runtime unavailable"
                                    : `${r.runtimeH30d} h running`}
                                </span>
                              </span>
                              <span
                                data-runtime-track
                                className="flex h-3 w-full overflow-hidden rounded bg-muted/40"
                              >
                                <span
                                  className="bg-success"
                                  style={{ width: `${((parts.active ?? 0) / scale) * 100}%` }}
                                />
                                <span
                                  className="bg-info"
                                  style={{ width: `${((parts.inactive ?? 0) / scale) * 100}%` }}
                                />
                                <span
                                  className="bg-muted"
                                  style={{ width: `${((parts.unknown ?? scale) / scale) * 100}%` }}
                                />
                              </span>
                              <span className="mt-1 block text-xs font-normal text-muted-foreground">
                                {r.provider} · {r.location} · {r.environment}
                                {r.flag ? ` · ${r.flag}` : ""}
                                <span className="mt-2 block">
                                  {parts.unknown !== 0
                                    ? "Unknown or insufficient active-use coverage."
                                    : "Active workload and unrecorded runtime as a share of this resource’s running hours."}{" "}
                                  Inactive runtime is not shutdown approval.
                                </span>
                              </span>
                            </span>
                          </Button>
                        }
                      >
                        <ResourceDetails resource={r} />
                      </DetailDrawer>
                    );
                  })}
                </div>
                {!res.length && (
                  <p className="py-10 text-muted-foreground">
                    No resources match the selected filters.
                  </p>
                )}
              </ChartCard>
            </section>
          </>
        )}
      </Q>
      <Q q={ov}>{(o) => <HistoricalPerformance overview={o} operational />}</Q>
      <section className="mt-8 border-t pt-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Recommended operational changes</h2>
          <Button asChild variant="link" className="h-auto max-w-full whitespace-normal px-0">
            <Link to="/explore" hash="compare">
              Detailed infrastructure analysis
              <ArrowRight />
            </Link>
          </Button>
        </div>
        <Q q={ms}>
          {(all) => (
            <div className="space-y-3">
              {[...all]
                .filter(
                  (m) =>
                    m.service === "Servers" ||
                    m.service === "Cloud" ||
                    m.service === "Data platform",
                )
                .sort(
                  (a, b) =>
                    ["low", "review", "blocked"].indexOf(a.risk.level) -
                    ["low", "review", "blocked"].indexOf(b.risk.level),
                )
                .slice(0, 4)
                .map((m) => (
                  <MeasureCard key={m.id} m={m} readOnly />
                ))}
            </div>
          )}
        </Q>
      </section>
      <Q q={ms}>{(all) => <DemoExceptions measures={all} />}</Q>
    </AppShell>
  );
}
