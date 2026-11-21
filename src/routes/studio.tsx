import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/greenops/shell";
import { ChartCard, Q } from "@/components/greenops/ui";
import { BudgetSlider } from "@/components/greenops/portfolio";
import { TargetPanel } from "@/components/greenops/targets";
import { MeasureCard } from "@/components/greenops/measure-card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api/client";
import type { OptimizeResult, Priority } from "@/lib/api/types";
import { useMeasures, useOverview, useSimulation } from "@/lib/queries";
import { useApp, useGlobalQuery } from "@/lib/store";
import { chf, kg, kwh, pct } from "@/lib/format";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/studio")({
  head: () =>
    seo(
      "Optimization Studio — GreenOps OS",
      "Review automatic budget-based suggestions, explicitly select safe measures and verify projected targets.",
    ),
  component: Studio,
});
const PRIOS = [
  { id: "balanced" as const, label: "Balanced" },
  { id: "cost" as const, label: "Cost savings" },
  { id: "co2" as const, label: "CO₂ reduction" },
];
function Studio() {
  const { s, set } = useApp();
  const q = useGlobalQuery(),
    ms = useMeasures(),
    sim = useSimulation(),
    ov = useOverview();
  const [settings, setSettings] = useState({ budgetChf: s.budgetChf, priority: s.priority });
  const [replace, setReplace] = useState<OptimizeResult | null>(null);
  const [sort, setSort] = useState("risk");
  const [risk, setRisk] = useState("actionable");
  useEffect(() => {
    const t = setTimeout(() => setSettings({ budgetChf: s.budgetChf, priority: s.priority }), 250);
    return () => clearTimeout(t);
  }, [s.budgetChf, s.priority]);
  const suggestions = useQuery({
    queryKey: ["suggestion", q, settings],
    queryFn: () => api.optimize(q, { ...settings, chfPerPersonDay: 1100 }),
  });
  const updating = settings.budgetChf !== s.budgetChf || settings.priority !== s.priority;
  const apply = (r: OptimizeResult) => {
    if (s.measureIds.length) setReplace(r);
    else set({ measureIds: r.measureIds });
  };
  return (
    <AppShell
      kicker="Decide · Optimization Studio"
      title="Build a better operating plan"
      subtitle="Choose your priority and budget, then review suggested measures to build your optimization plan. Only explicit choices change your plan."
    >
      <div className="grid gap-10 xl:grid-cols-[.9fr_1.1fr]">
        <ChartCard title="Optimization settings">
          <BudgetSlider />
          <p className="mb-3 mt-6 text-sm font-medium">Optimization priority</p>
          <div className="flex flex-wrap gap-1">
            {PRIOS.map((p) => (
              <Button
                key={p.id}
                size="sm"
                variant={s.priority === p.id ? "secondary" : "ghost"}
                onClick={() => set({ priority: p.id as Priority })}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <div className="mt-8 border-t pt-5">
            <h3 className="mb-3 text-sm font-semibold">Suggested package</h3>
            {updating ? (
              <p role="status" className="text-sm text-muted-foreground">
                Updating recommendation…
              </p>
            ) : (
              <Q q={suggestions}>
                {(a) => (
                  <>
                    <div className="mb-4 flex flex-wrap gap-x-6 gap-y-3 text-xs">
                      <span>
                        Cost reduction <b>{pct(a.result.costReductionPct)}</b>
                      </span>
                      <span>
                        CO₂ reduction <b>{pct(a.result.co2ReductionPct)}</b>
                      </span>
                      <span>
                        Effort <b>{a.result.effortDays} PD</b>
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {a.measureIds.length} suggested measures · {chf(a.result.effortChf)}{" "}
                      implementation
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {a.result.feasible
                        ? api.isDemo
                          ? "Demo package meets numerical targets; safety approval is not established."
                          : "Calculated targets met; review pending approvals."
                        : `No feasible package under these settings. ${a.result.reasons.join(" ")}`}
                    </p>
                    <Button
                      className="mt-4"
                      disabled={!a.measureIds.length}
                      onClick={() => apply(a)}
                    >
                      Apply proposed package
                      <ArrowRight />
                    </Button>
                    <p className="mt-3 text-xs text-muted-foreground">
                      Suggested IDs: {a.measureIds.join(" · ") || "None"}. Your current selections
                      stay unchanged until you apply.
                    </p>
                  </>
                )}
              </Q>
            )}
          </div>
        </ChartCard>
        <ChartCard
          title="Selected plan · projected targets"
          subtitle={`${s.measureIds.length} measures selected`}
        >
          <Q q={sim}>
            {(r) => (
              <>
                <TargetPanel r={r} />
                <p className="mt-4 text-xs text-muted-foreground">
                  Budget used: {chf(r.effortChf)} · remaining: {chf(s.budgetChf - r.effortChf)}
                </p>
                {r.excluded.length > 0 && (
                  <p className="mt-3 text-xs text-destructive">
                    Excluded: {r.excluded.map((e) => `${e.id}: ${e.reason}`).join(" · ")}
                  </p>
                )}
              </>
            )}
          </Q>
        </ChartCard>
      </div>
      <section className="mt-8 border-t pt-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <ShieldCheck className="size-5 text-primary" />
            Recommendations & Safety Shield
          </h2>
          <div className="flex flex-wrap gap-2">
            <Select value={risk} onValueChange={setRisk}>
              <SelectTrigger className="w-40" aria-label="Recommendation risk">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[
                  ["actionable", "Actionable"],
                  ["low", "Low risk"],
                  ["review", "Needs review"],
                  ["blocked", "Blocked"],
                  ["all", "All risks"],
                ].map(([v, l]) => (
                  <SelectItem key={v} value={v ?? ""}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger className="w-44" aria-label="Sort recommendations">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[
                  ["risk", "Lowest risk"],
                  ["cost", "Cost savings"],
                  ["co2", "CO₂ reduction"],
                  ["energy", "Energy savings"],
                  ["effort", "Lowest effort"],
                ].map(([v, l]) => (
                  <SelectItem key={v} value={v ?? ""}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Q q={ms}>
          {(all) => (
            <div className="space-y-3">
              {[...all]
                .filter(
                  (m) =>
                    risk === "all" ||
                    (risk === "actionable" && m.risk.level !== "blocked") ||
                    m.risk.level === risk,
                )
                .sort((a, b) =>
                  sort === "cost"
                    ? b.savingsChf - a.savingsChf
                    : sort === "co2"
                      ? b.savingsCo2KgLocation - a.savingsCo2KgLocation
                      : sort === "energy"
                        ? b.savingsKwh - a.savingsKwh
                        : sort === "effort"
                          ? a.effortPersonDays - b.effortPersonDays
                          : ["low", "review", "blocked"].indexOf(a.risk.level) -
                            ["low", "review", "blocked"].indexOf(b.risk.level),
                )
                .map((m) => (
                  <MeasureCard key={m.id} m={m} />
                ))}
            </div>
          )}
        </Q>
      </section>
      <section className="mt-10 border-t pt-6">
        <h2 className="mb-5 text-lg font-semibold">Baseline → projected with selected plan</h2>
        <Q q={ov}>
          {(o) => (
            <Q q={sim}>
              {(r) => (
                <div className="space-y-6">
                  {[
                    {
                      label: "Annual cost",
                      before: o.cost.value.mid,
                      saving: r.savingsChf,
                      fmt: chf,
                    },
                    {
                      label: "Location-based CO₂",
                      before: o.co2Location.value.mid,
                      saving: r.savingsCo2Kg,
                      fmt: kg,
                    },
                    { label: "Energy", before: o.energy.value.mid, saving: r.savingsKwh, fmt: kwh },
                  ].map((row) => (
                    <div key={row.label}>
                      <div className="mb-2 flex flex-wrap justify-between gap-3 text-sm">
                        <span className="font-medium">{row.label}</span>
                        <span className="num">
                          {row.fmt(row.before)} → {row.fmt(row.before - row.saving)}
                        </span>
                      </div>
                      <div className="space-y-2">
                        <div className="h-2 rounded bg-muted" />
                        <div
                          className="h-2 rounded bg-primary transition-[width] duration-500"
                          style={{
                            width: `${Math.max(0, (row.before - row.saving) / Math.max(1, row.before)) * 100}%`,
                          }}
                        />
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Projected saving: {row.fmt(row.saving)} ·{" "}
                        {pct((row.saving / Math.max(1, row.before)) * 100)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Q>
          )}
        </Q>
      </section>
      <Dialog
        open={replace != null}
        onOpenChange={(o) => {
          if (!o) setReplace(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Replace your selected plan?</DialogTitle>
            <DialogDescription>
              This replaces {s.measureIds.length} current selections with{" "}
              {replace?.measureIds.length ?? 0} proposed measures. It does not approve or execute
              changes.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setReplace(null)}>
              Keep current plan
            </Button>
            <Button
              onClick={() => {
                if (replace) set({ measureIds: replace.measureIds });
                setReplace(null);
              }}
            >
              Replace plan
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
