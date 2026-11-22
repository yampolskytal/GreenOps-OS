import { useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/greenops/shell";
import { Q, RiskBadge } from "@/components/greenops/ui";
import { DetailDrawer, DetailBlock, EvidenceSources } from "@/components/greenops/details";
import { MeasureCard } from "@/components/greenops/measure-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PathMembership } from "@/components/greenops/path-membership";
import type { Finding } from "@/lib/api/types";
import { ResourceDetails } from "@/components/greenops/resource-details";
import { canSelectMeasure } from "@/lib/planning";
import { useFindings, useMeasures, useResources } from "@/lib/queries";
import { chf, kg, kwh } from "@/lib/format";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/findings")({
  head: () =>
    seo(
      "Waste Findings — GreenOps OS",
      "Review potential inefficiencies, risk and source evidence before selecting changes.",
    ),
  component: Findings,
});
function Findings() {
  return (
    <AppShell kicker="Explore & Findings" title="Waste Findings">
      <WasteFindings />
    </AppShell>
  );
}
const isActionable = (finding: Finding) =>
  finding.risk !== "blocked" &&
  (!finding.decision ||
    finding.decision.status === "candidate" ||
    finding.decision.status === "prerequisite");

export type FindingsSelection = { risk: string; sort: string; search: string; expanded: boolean };

export function WasteFindings({
  selection,
  onSelectionChange,
}: {
  selection?: FindingsSelection | undefined;
  onSelectionChange?: (selection: FindingsSelection) => void;
} = {}) {
  const fs = useFindings(false);
  const ms = useMeasures();
  const resources = useResources();
  const hash = useRouterState({ select: (r) => r.location.hash.replace(/^#/, "") });
  const [local, setLocal] = useState<FindingsSelection>({
    risk: "all",
    sort: "risk",
    search: "",
    expanded: hash.startsWith("finding-"),
  });
  const current = selection ?? local;
  const { risk, sort, search, expanded } = current;
  const change = (patch: Partial<FindingsSelection>) =>
    (onSelectionChange ?? setLocal)({ ...current, ...patch });
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <select
          value={risk}
          onChange={(event) => change({ risk: event.target.value })}
          className="h-9 max-w-full rounded-md border bg-card px-2 text-sm"
          aria-label="Show findings"
        >
          {[
            ["actionable", "Actionable opportunities"],
            ["all", "All findings"],
            ["low", "Low risk"],
            ["review", "Review required"],
            ["blocked", "Blocked measures"],
          ].map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(event) => change({ sort: event.target.value })}
          className="h-9 max-w-full rounded-md border bg-card px-2 text-sm"
          aria-label="Sort by"
        >
          {[
            ["risk", "Lowest risk"],
            ["cost", "Highest cost savings"],
            ["co2", "Highest CO₂ savings"],
            ["energy", "Highest energy savings"],
            ["effort", "Lowest implementation effort"],
          ].map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <Input
          className="h-9 w-52 max-w-full"
          aria-label="Search findings"
          placeholder="Find a resource or finding…"
          value={search}
          onChange={(event) => change({ search: event.target.value })}
        />
      </div>
      <Q q={fs}>
        {(all) => (
          <Q q={ms}>
            {(measures) => {
              const term = search.trim().toLowerCase();
              const results = [...all]
                .filter(
                  (f) =>
                    (risk === "all" ||
                      (risk === "actionable" && isActionable(f)) ||
                      f.risk === risk) &&
                    `${f.title} ${f.description} ${f.resource}`.toLowerCase().includes(term),
                )
                .sort((a, b) =>
                  sort === "cost"
                    ? (b.impactChfYear ?? -Infinity) - (a.impactChfYear ?? -Infinity)
                    : sort === "co2"
                      ? (b.impactCo2KgYear ?? -Infinity) - (a.impactCo2KgYear ?? -Infinity)
                      : sort === "energy"
                        ? (b.impactKwhYear ?? -Infinity) - (a.impactKwhYear ?? -Infinity)
                        : sort === "effort"
                          ? (measures.find((m) => m.id === a.measureId)?.effortPersonDays ??
                              Infinity) -
                            (measures.find((m) => m.id === b.measureId)?.effortPersonDays ??
                              Infinity)
                          : ["low", "review", "blocked"].indexOf(a.risk) -
                            ["low", "review", "blocked"].indexOf(b.risk),
                );
              const remaining = results.length - 3;
              return (
                <div className="space-y-3">
                  {!results.length && (
                    <p role="status" className="py-6 text-sm text-muted-foreground">
                      No findings match the selected filters.
                    </p>
                  )}
                  {(expanded ? results : results.slice(0, 3)).map((f) => {
                    const m = measures.find((x) => x.id === f.measureId);
                    const resource = resources.data?.find(
                      (item) => item.id === f.resource || item.name === f.resource,
                    );
                    return (
                      <div id={`finding-${f.id}`} key={f.id}>
                        {m ? (
                          <>
                            {f.title !== m.title && (
                              <h3 className="mb-1 text-sm font-medium">{f.title}</h3>
                            )}
                            {f.description !== m.description && (
                              <p className="mb-1 text-xs text-muted-foreground">{f.description}</p>
                            )}
                            {f.resource !== m.resource && (
                              <p className="mb-1 text-xs text-muted-foreground">{f.resource}</p>
                            )}
                            <MeasureCard m={m} readOnly />
                            <div className="mt-1 flex flex-wrap gap-2">
                              {isActionable(f) && canSelectMeasure(m) && (
                                <PathMembership measureIds={[m.id]} />
                              )}
                              <Button asChild size="sm" variant="link">
                                <Link to="/studio" hash={`measure-${m.id}`}>
                                  {m.decision?.status === "evidence-needed"
                                    ? "Inspect evidence"
                                    : "Review optimization"}
                                </Link>
                              </Button>
                            </div>
                          </>
                        ) : (
                          <article className="flex flex-wrap items-center gap-4 rounded-lg border bg-card p-4">
                            <div className="min-w-0 flex-1">
                              <p className="text-xs text-muted-foreground">{f.resource}</p>
                              <h3 className="mt-1 text-sm font-semibold">{f.title}</h3>
                              <p className="mt-1 text-xs text-muted-foreground">{f.description}</p>
                              {f.impactChfYear != null ||
                              f.impactCo2KgYear != null ||
                              f.impactKwhYear != null ? (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {chf(f.impactChfYear)} · {kg(f.impactCo2KgYear)} CO₂ ·{" "}
                                  {kwh(f.impactKwhYear)}
                                </p>
                              ) : null}
                            </div>
                            <RiskBadge level={f.risk} />
                            <DetailDrawer
                              title={f.title}
                              trigger={
                                <Button variant="outline" size="sm">
                                  Details
                                </Button>
                              }
                            >
                              <p>{f.description}</p>
                              <DetailBlock title="Potential action">{f.action}</DetailBlock>
                              <DetailBlock title="Assumptions">
                                {f.assumptions.join(" · ") || "Not supplied"}
                              </DetailBlock>
                              <p className="text-muted-foreground">
                                No supported measure is linked; this finding cannot be added to the
                                plan yet.
                              </p>
                              <EvidenceSources sources={f.evidence} />
                            </DetailDrawer>
                          </article>
                        )}
                        {resource && (
                          <DetailDrawer
                            title={resource.name}
                            trigger={
                              <Button size="sm" variant="link">
                                View resource
                              </Button>
                            }
                          >
                            <ResourceDetails resource={resource} />
                          </DetailDrawer>
                        )}
                      </div>
                    );
                  })}
                  {remaining > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-expanded={expanded}
                      onClick={() => change({ expanded: !expanded })}
                    >
                      {expanded ? "Show less" : `Show ${remaining} more findings`}
                    </Button>
                  )}
                </div>
              );
            }}
          </Q>
        )}
      </Q>
    </div>
  );
}
