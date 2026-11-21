import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, RotateCcw, ShieldCheck, X } from "lucide-react";
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
import { api } from "@/lib/api/client";
import type { Priority, SimulationResult } from "@/lib/api/types";
import { useMeasures, useOverview } from "@/lib/queries";
import { useApp, useGlobalQuery, toggleId } from "@/lib/store";
import { validatePreview } from "@/lib/planning";
import { percentDifference } from "@/lib/analytics";
import { chf, kg, kwh, pct } from "@/lib/format";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/studio")({
  head: () =>
    seo(
      "Optimization Studio — GreenOps OS",
      "Explore live projected outcomes without changing your saved Current Plan, then explicitly commit a validated scenario.",
    ),
  component: Studio,
});
const PRIOS = [
  { id: "balanced" as const, label: "Balanced" },
  { id: "cost" as const, label: "Cost savings" },
  { id: "co2" as const, label: "CO₂ reduction" },
];
type Draft = {
  budgetChf: number;
  priority: Priority;
  measureIds: string[];
  mode: "saved" | "suggested" | "manual";
};
function Studio() {
  const { s, set, commitPlan } = useApp();
  const q = useGlobalQuery(),
    ms = useMeasures(),
    ov = useOverview();
  const saved = (): Draft => ({
    budgetChf: s.budgetChf,
    priority: s.priority,
    measureIds: [...s.measureIds],
    mode: "saved",
  });
  const [draft, setDraft] = useState<Draft>(() =>
    s.assistantProposal ? { ...s.assistantProposal, mode: "manual" } : saved(),
  );
  // An assistant proposal opens once as a temporary preview; committing still needs the explicit confirm flow.
  useEffect(() => {
    if (s.assistantProposal) {
      setDraft({ ...s.assistantProposal, mode: "manual" });
      set({ assistantProposal: null });
    }
  }, [s.assistantProposal, set]);
  const [debounced, setDebounced] = useState(draft);
  const [confirm, setConfirm] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(draft), 250);
    return () => clearTimeout(t);
  }, [draft]);
  const scenario = useQuery({
    queryKey: ["live-preview", q, debounced],
    queryFn: async () => {
      if (debounced.mode === "suggested")
        return api.optimize(q, {
          budgetChf: debounced.budgetChf,
          priority: debounced.priority,
          chfPerPersonDay: 1100,
        });
      return {
        measureIds: debounced.measureIds,
        result: await api.simulate(q, {
          measureIds: debounced.measureIds,
          budgetChf: debounced.budgetChf,
          chfPerPersonDay: 1100,
        }),
      };
    },
  });
  const updating = JSON.stringify(draft) !== JSON.stringify(debounced) || scenario.isFetching;
  const ids = scenario.data?.measureIds ?? draft.measureIds;
  const snapshot = JSON.stringify([q, draft, ids, s.measureIds, s.budgetChf, s.priority]);
  const latest = useRef(snapshot);
  latest.current = snapshot;
  const dirty =
    JSON.stringify([ids, draft.budgetChf, draft.priority]) !==
    JSON.stringify([s.measureIds, s.budgetChf, s.priority]);
  const change = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setMessage(null);
    setError(null);
  };
  const restore = () => {
    setDraft(saved());
    setMessage(null);
    setError(null);
  };
  const commit = async () => {
    if (updating || !scenario.data || !ms.data) return;
    const context = latest.current;
    setCommitting(true);
    setError(null);
    setMessage(null);
    try {
      const validation = await api.simulate(q, {
        measureIds: ids,
        budgetChf: draft.budgetChf,
        chfPerPersonDay: 1100,
      });
      if (latest.current !== context)
        throw new Error(
          "Preview changed during validation. Review the latest outcome and try again.",
        );
      const issue = validatePreview(ids, ms.data, draft.budgetChf, validation);
      if (issue) throw new Error(issue);
      commitPlan({ measureIds: [...ids], budgetChf: draft.budgetChf, priority: draft.priority });
      setDraft({ ...draft, measureIds: [...ids], mode: "saved" });
      setConfirm(false);
      setMessage(
        "Current Plan saved on this device. Planning is not infrastructure approval or execution.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Plan could not be saved.");
    } finally {
      setCommitting(false);
    }
  };
  return (
    <AppShell
      kicker="Decide · Optimization Studio"
      title="Build a better operating plan"
      subtitle="Explore a temporary scenario. Your saved Current Plan stays unchanged until you commit."
    >
      <div data-analysis-region className="grid gap-10 xl:grid-cols-[.8fr_1.2fr]">
        <ChartCard title="Scenario settings">
          <BudgetSlider
            value={draft.budgetChf}
            onChange={(budgetChf) => change({ budgetChf, mode: "suggested" })}
          />
          <p className="mb-3 mt-6 text-sm font-medium">Optimization priority</p>
          <div className="flex flex-wrap gap-1">
            {PRIOS.map((p) => (
              <Button
                key={p.id}
                size="sm"
                aria-pressed={draft.priority === p.id}
                variant={draft.priority === p.id ? "secondary" : "ghost"}
                onClick={() => change({ priority: p.id, mode: "suggested" })}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <div className="mt-6 border-t pt-4 text-xs text-muted-foreground">
            <p>Official limits: CHF 16,500 · 15 person-days.</p>
            <p className="mt-2">
              Critical operations remain protected. Review requirements are not approvals.
            </p>
            <p className="mt-2">
              {api.isDemo
                ? "DEMO optimizer — illustrative scenarios, not verified company feasibility."
                : "Scenarios calculated by the team backend."}
            </p>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setDraft({
                  budgetChf: 16500,
                  priority: "balanced",
                  measureIds: [],
                  mode: "suggested",
                });
                setMessage(null);
                setError(null);
              }}
            >
              <RotateCcw />
              Reset Preview
            </Button>
            <Button size="sm" variant="ghost" onClick={restore}>
              <X />
              Discard Changes
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Saved Current Plan: {s.measureIds.length} measures · {chf(s.budgetChf)} budget.
          </p>
        </ChartCard>
        <ChartCard
          title="Live preview"
          subtitle="Adjust your settings to explore outcomes before saving your plan."
        >
          <p className="mb-4 text-xs font-semibold text-warning">
            {updating
              ? "Recalculating preview…"
              : dirty
                ? "Unsaved preview changes"
                : "Matches saved Current Plan"}
          </p>
          {updating ? (
            <p role="status" className="py-10 text-muted-foreground">
              Recalculating preview…
            </p>
          ) : (
            <Q q={scenario}>
              {(a) => (
                <>
                  <TargetPanel r={a.result} />
                  <p className="mt-4 text-xs text-muted-foreground">
                    Budget used: {chf(a.result.effortChf)} · remaining:{" "}
                    {chf(draft.budgetChf - a.result.effortChf)}
                  </p>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {a.result.feasible
                      ? "Numerical targets met; safety approval is not established."
                      : a.result.reasons.join(" ") || "Numerical targets not met."}
                  </p>
                  {a.result.excluded.length > 0 && (
                    <p className="mt-3 text-destructive">
                      Excluded: {a.result.excluded.map((e) => `${e.id}: ${e.reason}`).join(" · ")}
                    </p>
                  )}
                  <p className="mt-3 text-xs text-warning">
                    {ms.data?.filter(
                      (m) => a.measureIds.includes(m.id) && m.risk.level === "review",
                    ).length ?? 0}{" "}
                    measures require human review. No infrastructure actions are approved.
                  </p>
                </>
              )}
            </Q>
          )}
        </ChartCard>
      </div>
      <section className="mt-6 border-t pt-6">
        <h2 className="mb-5 flex items-center gap-2 text-lg font-semibold">
          <ShieldCheck className="size-5 text-primary" />
          Preview measures & Safety Shield
        </h2>
        {!updating && (
          <Q q={scenario}>
            {(a) => (
              <Q q={ms}>
                {(all) => (
                  <div className="space-y-3">
                    {all
                      .filter((m) => a.measureIds.includes(m.id))
                      .map((m) => (
                        <MeasureCard
                          key={m.id}
                          m={m}
                          selected
                          onToggle={() =>
                            change({ measureIds: toggleId(a.measureIds, m.id), mode: "manual" })
                          }
                        />
                      ))}
                    {!a.measureIds.length && (
                      <p className="text-muted-foreground">
                        No preview measures. Change your settings or select recommendations below.
                      </p>
                    )}
                  </div>
                )}
              </Q>
            )}
          </Q>
        )}
      </section>
      <section className="mt-8 border-t pt-6">
        <h2 className="mb-4 text-lg font-semibold">Other recommendations</h2>
        <Q q={ms}>
          {(all) => (
            <div className="space-y-3">
              {all
                .filter((m) => !ids.includes(m.id))
                .map((m) => (
                  <MeasureCard
                    key={m.id}
                    m={m}
                    selected={false}
                    onToggle={() => {
                      if (!updating) change({ measureIds: toggleId(ids, m.id), mode: "manual" });
                    }}
                  />
                ))}
            </div>
          )}
        </Q>
      </section>
      <section className="mt-8 border-t pt-6">
        <h2 className="mb-5 text-lg font-semibold">Baseline → projected live preview</h2>
        {!updating && (
          <Q q={ov}>
            {(o) => (
              <Q q={scenario}>{(a) => <PreviewComparison baseline={o} result={a.result} />}</Q>
            )}
          </Q>
        )}
      </section>
      <div className="sticky bottom-0 z-20 mt-8 flex flex-wrap items-center justify-between gap-3 border-t bg-background py-4">
        <p className="text-xs text-muted-foreground">
          {ids.length} preview measures · saved plan unchanged until commit
        </p>
        <Button
          disabled={
            updating || scenario.isError || !scenario.data || !ms.data || committing || !dirty
          }
          onClick={() => setConfirm(true)}
        >
          Commit to Current Plan
          <ArrowRight />
        </Button>
      </div>
      {message && (
        <p role="status" className="mt-3 text-sm text-success">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <Dialog
        open={confirm}
        onOpenChange={(value) => {
          if (!committing) setConfirm(value);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Commit this preview to Current Plan?</DialogTitle>
            <DialogDescription>
              This replaces {s.measureIds.length} saved selections with {ids.length} preview
              measures and saves the preview settings on this device. Pending reviews remain
              unresolved; no infrastructure changes are approved or executed.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={committing} onClick={() => setConfirm(false)}>
              Keep previewing
            </Button>
            <Button disabled={updating || committing} onClick={() => void commit()}>
              {committing ? "Validating & saving…" : "Confirm commit"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
function PreviewComparison({
  baseline: o,
  result: r,
}: {
  baseline: import("@/lib/api/types").Overview;
  result: SimulationResult;
}) {
  const rows = [
    { label: "Annual cost", before: o.cost.value.mid, saving: r.savingsChf, fmt: chf },
    {
      label: "Location-based CO₂",
      before: o.co2Location.value.mid,
      saving: r.savingsCo2Kg,
      fmt: kg,
    },
    { label: "Energy", before: o.energy.value.mid, saving: r.savingsKwh, fmt: kwh },
    ...(o.co2Market && r.savingsCo2KgMarket != null
      ? [
          {
            label: "Market-based CO₂",
            before: o.co2Market.value.mid,
            saving: r.savingsCo2KgMarket,
            fmt: kg,
          },
        ]
      : []),
  ];
  return (
    <div className="space-y-6">
      {rows.map((row) => {
        const percentage = percentDifference(row.before, row.before - row.saving);
        return (
          <div key={row.label}>
            <div className="mb-2 flex flex-wrap justify-between gap-3 text-sm">
              <span className="font-medium">{row.label}</span>
              <span className="num">
                {row.fmt(row.before)} → {row.fmt(row.before - row.saving)}
              </span>
            </div>
            <div className="h-2 rounded bg-muted">
              <div
                className="h-full rounded bg-chart-1 transition-[width]"
                style={{
                  width: `${Math.max(0, Math.min(100, row.before > 0 ? ((row.before - row.saving) / row.before) * 100 : 0))}%`,
                }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Projected saving: {row.fmt(row.saving)}
              {percentage != null ? ` · ${pct(percentage)}` : ""}
            </p>
          </div>
        );
      })}
      {(!o.co2Market || r.savingsCo2KgMarket == null) && (
        <p className="text-xs text-muted-foreground">
          Market-based scenario effects unavailable. Location-based savings are never copied to
          market accounting.
        </p>
      )}
    </div>
  );
}
