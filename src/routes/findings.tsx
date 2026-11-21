import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/greenops/shell";
import { Q, RiskBadge } from "@/components/greenops/ui";
import { DetailDrawer, DetailBlock } from "@/components/greenops/details";
import { MeasureCard } from "@/components/greenops/measure-card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFindings, useMeasures } from "@/lib/queries";
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
export function WasteFindings() {
  const fs = useFindings(),
    ms = useMeasures();
  const [risk, setRisk] = useState("all");
  const [sort, setSort] = useState("risk");
  return (
    <div>
      <p className="mb-5 text-sm text-muted-foreground">
        Discover potential inefficiencies, filter findings by actionability and sort them by impact
        or risk.
      </p>
      <div className="mb-6 flex flex-wrap gap-3">
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Show findings</p>
          <Select value={risk} onValueChange={setRisk}>
            <SelectTrigger className="w-64 max-w-full" aria-label="Show findings">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[
                ["actionable", "Actionable opportunities"],
                ["all", "All findings"],
                ["low", "Low risk"],
                ["review", "Review required"],
                ["blocked", "Blocked measures"],
              ].map(([v, l]) => (
                <SelectItem key={v} value={v ?? ""}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Sort by</p>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-64 max-w-full" aria-label="Sort by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[
                ["risk", "Lowest risk"],
                ["cost", "Highest cost savings"],
                ["co2", "Highest CO₂ savings"],
                ["energy", "Highest energy savings"],
                ["effort", "Lowest implementation effort"],
              ].map(([v, l]) => (
                <SelectItem key={v} value={v ?? ""}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Q q={fs}>
        {(all) => (
          <Q q={ms}>
            {(measures) => (
              <div className="space-y-3">
                {[...all]
                  .filter(
                    (f) =>
                      risk === "all" ||
                      (risk === "actionable" && f.risk !== "blocked") ||
                      f.risk === risk,
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
                  )
                  .map((f) => {
                    const m = measures.find((x) => x.id === f.measureId);
                    return (
                      <div id={`finding-${f.id}`} key={f.id}>
                        {m ? (
                          <>
                            <MeasureCard m={m} readOnly />
                            <Button asChild size="sm" variant="link" className="mt-1">
                              <Link to="/studio" hash={`measure-${m.id}`}>
                                Review optimization
                              </Link>
                            </Button>
                          </>
                        ) : (
                          <article className="flex flex-wrap items-center gap-4 rounded-lg border bg-card p-4">
                            <div className="min-w-0 flex-1">
                              <p className="text-xs text-muted-foreground">{f.resource}</p>
                              <h3 className="mt-1 text-sm font-semibold">{f.title}</h3>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {chf(f.impactChfYear)} · {kg(f.impactCo2KgYear)} CO₂ ·{" "}
                                {kwh(f.impactKwhYear)}
                              </p>
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
                              <DetailBlock title="Evidence">
                                {f.evidence.map((e) => (
                                  <p key={e.source + e.detail} className="mb-3">
                                    <span className="num block text-xs text-info">{e.source}</span>
                                    {e.detail}
                                  </p>
                                ))}
                              </DetailBlock>
                              <p className="text-muted-foreground">
                                No supported measure is linked; this finding cannot be added to the
                                plan yet.
                              </p>
                            </DetailDrawer>
                          </article>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </Q>
        )}
      </Q>
    </div>
  );
}
