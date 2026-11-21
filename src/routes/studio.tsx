import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookmarkPlus, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/greenops/shell";
import { ChartCard, Q } from "@/components/greenops/ui";
import { BudgetSlider } from "@/components/greenops/portfolio";
import { PathComparison, CommitPathDialog } from "@/components/greenops/path-comparison";
import { PathMembership } from "@/components/greenops/path-membership";
import { MeasureCard } from "@/components/greenops/measure-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api/client";
import type { Priority } from "@/lib/api/types";
import { useMeasures } from "@/lib/queries";
import { useApp, useGlobalQuery } from "@/lib/store";
import { createPath, MAX_PATHS, replacePath } from "@/lib/paths";
import { useCommitPlan } from "@/lib/use-commit";
import { reveal } from "@/lib/reveal";
import { chf, kg, pct } from "@/lib/format";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/studio")({
  head: () =>
    seo(
      "Optimization Studio — GreenOps OS",
      "Build up to three alternative Paths, compare their projected outcomes on one chart and commit the best one to your Current Plan.",
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
  const q = useGlobalQuery();
  const ms = useMeasures();
  const [budgetChf, setBudget] = useState<number | null>(null);
  const [priority, setPriority] = useState<Priority | null>(null);
  const budget = budgetChf ?? s.budgetChf;
  const prio = priority ?? s.priority;
  const [bulk, setBulk] = useState<string[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [commitOpen, setCommitOpen] = useState(false);
  const commit = useCommitPlan(ms.data);
  const recommended = useQuery({
    queryKey: ["recommended-package", q, budget, prio],
    queryFn: () => api.optimize(q, { budgetChf: budget, priority: prio, chfPerPersonDay: 1100 }),
    enabled: false,
  });
  const generate = async () => {
    const r = await recommended.refetch();
    reveal("recommended");
    if (r.data) toast.success(`Recommended package: ${r.data.measureIds.length} measures`);
    else if (r.error) toast.error("Recommendation could not be generated");
  };
  const pkg = recommended.data;
  return (
    <AppShell
      kicker="Decide · Optimization Studio"
      title="Build and compare strategies"
      subtitle="Create up to three Paths, compare their projected outcomes, then commit one to your Current Plan."
    >
      <div className="grid gap-6 xl:grid-cols-[.8fr_1.2fr]">
        <ChartCard title="Recommendation settings">
          <BudgetSlider value={budget} onChange={setBudget} />
          <p className="mb-2 mt-6 text-sm font-medium">Optimization priority</p>
          <div className="flex flex-wrap gap-1">
            {PRIOS.map((p) => (
              <Button
                key={p.id}
                size="sm"
                aria-pressed={prio === p.id}
                variant={prio === p.id ? "secondary" : "ghost"}
                onClick={() => setPriority(p.id)}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <p className="mt-5 text-xs text-muted-foreground">
            Official limits: CHF 16,500 · 15 person-days. Critical operations stay protected.{" "}
            {api.isDemo ? "DEMO optimizer — illustrative only." : "Calculated by the team backend."}
          </p>
          <Button className="mt-5" disabled={recommended.isFetching} onClick={() => void generate()}>
            <Sparkles />
            {recommended.isFetching ? "Generating…" : "Generate recommendation"}
          </Button>
        </ChartCard>
        <section id="recommended" className="rounded-lg border bg-card p-5">
          <h2 className="font-semibold">Recommended package</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Best-found package for {PRIOS.find((p) => p.id === prio)?.label.toLowerCase()} within{" "}
            {chf(budget)} — not guaranteed optimal.
          </p>
          {recommended.isError && (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {recommended.error.message}
            </p>
          )}
          {!pkg && !recommended.isFetching && (
            <p className="mt-6 text-sm text-muted-foreground">
              Choose a budget and priority, then generate a recommendation.
            </p>
          )}
          {pkg && (
            <>
              <dl className="num mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                <Stat label="Measures" value={String(pkg.measureIds.length)} />
                <Stat label="Annual savings" value={`${chf(pkg.result.savingsChf)} · ${pct(pkg.result.costReductionPct)}`} />
                <Stat label="CO₂ (location)" value={`${kg(pkg.result.savingsCo2Kg)} · ${pct(pkg.result.co2ReductionPct)}`} />
                <Stat label="Effort" value={`${pkg.result.effortDays.toFixed(1)} PD`} />
                <Stat label="Budget" value={chf(pkg.result.effortChf)} />
                <Stat
                  label="Review"
                  value={`${ms.data?.filter((m) => pkg.measureIds.includes(m.id) && m.risk.level === "review").length ?? 0} need review`}
                />
              </dl>
              <p className="mt-4 text-xs text-muted-foreground">
                {pkg.result.feasible
                  ? "Meets numerical constraints; human approvals still required."
                  : pkg.result.reasons.join(" ") || "Does not meet every numerical target."}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setSaveOpen(true)}>
                  <BookmarkPlus />
                  Save as Path
                </Button>
                <Button
                  onClick={() => {
                    commit.setError(null);
                    setCommitOpen(true);
                  }}
                >
                  Commit as Current Plan
                  <ArrowRight />
                </Button>
              </div>
            </>
          )}
        </section>
      </div>

      <PathComparison />

      <section id="recommendations" className="mt-8 border-t pt-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <ShieldCheck className="size-5 text-primary" />
            Recommendations & Safety Shield
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground" role="status">
              {bulk.length} selected
            </span>
            {bulk.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setBulk([])}>
                Clear
              </Button>
            )}
            <PathMembership
              measureIds={bulk}
              label={bulk.length ? `Add ${bulk.length} to Paths` : "Select measures to add"}
              onDone={() => setBulk([])}
            />
          </div>
        </div>
        <Q q={ms}>
          {(all) => (
            <div className="space-y-3">
              {all.map((m) => (
                <MeasureCard
                  key={m.id}
                  m={m}
                  bulkSelected={bulk.includes(m.id)}
                  onBulkToggle={(v) =>
                    setBulk((ids) => (v ? [...new Set([...ids, m.id])] : ids.filter((x) => x !== m.id)))
                  }
                />
              ))}
            </div>
          )}
        </Q>
      </section>

      {pkg && (
        <SavePackageDialog
          open={saveOpen}
          onOpenChange={setSaveOpen}
          onSave={(name, replaceId) => {
            const base = { measureIds: [...pkg.measureIds], budgetChf: budget, priority: prio };
            try {
              let id = replaceId;
              if (replaceId) set({ paths: replacePath(s.paths, replaceId, { ...base, name }) });
              else {
                id = crypto.randomUUID();
                set({ paths: createPath(s.paths, { ...base, id, name }) });
              }
              setSaveOpen(false);
              toast.success(`Saved recommendation as “${name}”`);
              reveal(`path-${id}`);
              return null;
            } catch (e) {
              return e instanceof Error ? e.message : "Could not save Path.";
            }
          }}
        />
      )}
      {pkg && commitOpen && (
        <CommitPathDialog
          path={{ name: "Recommended package", measureIds: pkg.measureIds, budgetChf: budget }}
          committedCount={s.measureIds.length}
          pending={commit.pending}
          error={commit.error}
          onCancel={() => setCommitOpen(false)}
          onConfirm={async () => {
            const ok = await commit.commit({
              name: "Recommended package",
              measureIds: pkg.measureIds,
              budgetChf: budget,
              priority: prio,
            });
            if (ok) setCommitOpen(false);
          }}
        />
      )}
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words">{value}</dd>
    </div>
  );
}

function SavePackageDialog({
  open,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSave: (name: string, replaceId?: string) => string | null;
}) {
  const { s } = useApp();
  const [name, setName] = useState("Recommended package");
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const full = s.paths.length >= MAX_PATHS;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save recommendation as a Path</DialogTitle>
          <DialogDescription>
            {full
              ? "You already have three Paths. Choose one to replace — its measures will be overwritten."
              : "Creates a new Path with these measures. Your Current Plan stays unchanged."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return setError("Give the Path a name.");
            if (full && !replaceId) return setError("Choose a Path to replace.");
            setError(onSave(name.trim(), replaceId ?? undefined));
          }}
        >
          <Input aria-label="Path name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          {s.paths.length > 0 && (
            <fieldset className="space-y-2 text-sm">
              <legend className="mb-1 text-xs text-muted-foreground">
                {full ? "Replace" : "Or replace an existing Path (optional)"}
              </legend>
              {s.paths.map((p) => (
                <label key={p.id} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="replace"
                    checked={replaceId === p.id}
                    onChange={() => setReplaceId(p.id)}
                  />
                  {p.name} · {p.measureIds.length} measures
                </label>
              ))}
              {!full && replaceId && (
                <Button type="button" size="sm" variant="ghost" onClick={() => setReplaceId(null)}>
                  Create new instead
                </Button>
              )}
            </fieldset>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">{replaceId ? "Replace Path" : "Save Path"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
