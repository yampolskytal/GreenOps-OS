import { useEffect, useState } from "react";
import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookmarkPlus, ShieldCheck, List } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/greenops/shell";
import { ChartCard, Q } from "@/components/greenops/ui";
import { BudgetSlider } from "@/components/greenops/portfolio";
import { PathComparison, CommitPathDialog } from "@/components/greenops/path-comparison";
import { PathMembership } from "@/components/greenops/path-membership";
import { MeasureCard } from "@/components/greenops/measure-card";
import { PlanOutcomes } from "@/components/greenops/plan-outcomes";
import { TargetPanel } from "@/components/greenops/targets";
import { AnalyticalInspector } from "@/components/greenops/analytical-inspector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api/client";
import type { Priority } from "@/lib/api/types";
import { useMeasures, useOverview } from "@/lib/queries";
import { useApp, useGlobalQuery } from "@/lib/store";
import { createPath, MAX_PATHS, replacePath } from "@/lib/paths";
import { useCommitPlan } from "@/lib/use-commit";
import { officialQuery } from "@/lib/planning";
import { reveal } from "@/lib/reveal";
import { chf } from "@/lib/format";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/studio")({
  head: () =>
    seo(
      "Optimization Studio — GreenOps OS",
      "Automatically updated recommendations, three alternative Paths and explicit Current Plan proposal saving.",
    ),
  component: Studio,
});
const PRIOS = [
  { id: "balanced" as const, label: "Balanced" },
  { id: "cost" as const, label: "Cost savings" },
  { id: "co2" as const, label: "CO₂ reduction" },
];
function Studio() {
  const hash = useRouterState({ select: (r) => r.location.hash });
  const linkedMeasureId = hash.startsWith("measure-") ? hash.slice(8) : null;
  const { s, set, hydrated } = useApp();
  const q = officialQuery(useGlobalQuery());
  const ms = useMeasures(),
    overview = useOverview(true);
  const [budgetChf, setBudget] = useState<number | null>(null);
  const [priority, setPriority] = useState<Priority | null>(null);
  const budget = budgetChf ?? s.budgetChf,
    prio = priority ?? s.priority;
  const [debouncedBudget, setDebouncedBudget] = useState(budget);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedBudget(budget), 250);
    return () => clearTimeout(timer);
  }, [budget]);
  const [bulk, setBulk] = useState<string[]>([]);
  const [saveOpen, setSaveOpen] = useState(false),
    [commitOpen, setCommitOpen] = useState(false),
    [viewOpen, setViewOpen] = useState(false);
  const [search, setSearch] = useState(""),
    [risk, setRisk] = useState("all"),
    [category, setCategory] = useState("all"),
    [resource, setResource] = useState("all"),
    [sort, setSort] = useState("cost");
  const [minCost, setMinCost] = useState(""),
    [minCo2, setMinCo2] = useState(""),
    [maxEffort, setMaxEffort] = useState("");
  const commit = useCommitPlan(ms.data);
  const recommended = useQuery({
    queryKey: ["recommended-package", q, debouncedBudget, prio],
    queryFn: () =>
      api.optimize(q, { budgetChf: debouncedBudget, priority: prio, chfPerPersonDay: 1100 }),
    enabled: hydrated && budget === debouncedBudget,
  });
  const recalculating = budget !== debouncedBudget || recommended.isFetching;
  const pkg = budget === debouncedBudget ? recommended.data : undefined;
  return (
    <AppShell
      kicker="Decide · Optimization Studio"
      title="Build and compare strategies"
      subtitle="Up to three Paths, one Current Plan. Saved proposals remain unchanged while recommendations update."
    >
      <div className="grid gap-6 xl:grid-cols-[.7fr_1.3fr]">
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
            Official limits: CHF 16,500 · 15 person-days.{" "}
            {api.isDemo ? "DEMO optimizer — illustrative only." : "Calculated by the team backend."}
          </p>
        </ChartCard>
        <section id="recommended" className="min-w-0 border-b py-5">
          <header className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
            <h2 className="font-semibold">Recommended package</h2>
            <span role="status" className="text-xs text-muted-foreground">
              {recalculating ? "Recalculating…" : "Updated"}
            </span>
          </header>
          <p className="mt-2 text-xs text-muted-foreground">
            {PRIOS.find((p) => p.id === prio)?.label} · budget {chf(budget)} · best found, not
            guaranteed optimal.
          </p>
          {recommended.isError && (
            <p role="alert" className="mt-4 text-sm text-destructive">
              Recommendation unavailable: {recommended.error.message}
            </p>
          )}
          {pkg && !recalculating && (
            <>
              <p className="mt-4 text-sm">
                {pkg.measureIds.length} recommendations · {pkg.result.effortDays.toFixed(1)}{" "}
                person-days · {chf(pkg.result.effortChf)} implementation cost ·{" "}
                {ms.data?.filter((m) => pkg.measureIds.includes(m.id) && m.risk.level === "review")
                  .length ?? 0}{" "}
                require review
              </p>
              <div className="mt-5">
                <Q q={overview}>
                  {(o) => (
                    <PlanOutcomes
                      overview={o}
                      result={pkg.result}
                      afterLabel="After recommendation"
                    />
                  )}
                </Q>
              </div>
              <div className="mt-6">
                <TargetPanel r={pkg.result} compact />
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setViewOpen(true)}>
                  <List />
                  View Measures
                </Button>
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
          {!pkg && !recalculating && !recommended.isError && (
            <p className="mt-6 text-sm text-muted-foreground">
              Recommendation unavailable for these settings.
            </p>
          )}
        </section>
      </div>
      <PathComparison />
      <section id="recommendations" className="mt-8 border-t pt-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <ShieldCheck className="size-5 text-primary" />
          Recommendations & Safety Shield
        </h2>
        <div className="my-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs text-muted-foreground">
            Search
            <Input
              aria-label="Search recommendations"
              className="mt-1"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Title or resource"
            />
          </label>
          {[
            {
              label: "Risk",
              value: risk,
              change: setRisk,
              options: [
                ["all", "All"],
                ["low", "Low risk"],
                ["review", "Review required"],
                ["blocked", "Blocked"],
              ],
            },
            {
              label: "Category",
              value: category,
              change: setCategory,
              options: [
                ["all", "All categories"],
                ...[...new Set(ms.data?.map((m) => m.service))].map((v) => [v, v]),
              ],
            },
            {
              label: "Resource",
              value: resource,
              change: setResource,
              options: [
                ["all", "All resources"],
                ...[...new Set(ms.data?.map((m) => m.resource))].map((v) => [v, v]),
              ],
            },
            {
              label: "Sort",
              value: sort,
              change: setSort,
              options: [
                ["cost", "Highest cost savings"],
                ["co2", "Highest CO₂ impact"],
                ["effort", "Lowest effort"],
                ["risk", "Lowest risk"],
              ],
            },
          ].map((f) => (
            <label key={f.label} className="min-w-0 text-xs text-muted-foreground">
              {f.label}
              <Select value={f.value} onValueChange={f.change}>
                <SelectTrigger
                  aria-label={`Recommendation ${f.label.toLowerCase()}`}
                  className="mt-1 w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {f.options.map(([v, l]) => (
                    <SelectItem key={v} value={v ?? "all"}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          ))}
          {[
            { label: "Minimum annual savings (CHF)", value: minCost, change: setMinCost },
            { label: "Minimum CO₂ reduction (kg)", value: minCo2, change: setMinCo2 },
            { label: "Maximum effort (person-days)", value: maxEffort, change: setMaxEffort },
          ].map((f) => (
            <label key={f.label} className="text-xs text-muted-foreground">
              {f.label}
              <Input
                className="mt-1"
                type="number"
                min="0"
                aria-label={f.label}
                value={f.value}
                onChange={(e) => f.change(e.target.value)}
              />
            </label>
          ))}
        </div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Filters affect browsing only; saved Paths and official calculations stay unchanged.
          </p>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSearch("");
              setRisk("all");
              setCategory("all");
              setResource("all");
              setMinCost("");
              setMinCo2("");
              setMaxEffort("");
            }}
          >
            Clear filters
          </Button>
        </div>
        {bulk.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-3 border-y py-3">
            <span role="status" className="text-xs">
              {bulk.length} selected
            </span>
            <PathMembership
              measureIds={bulk}
              label={`Add ${bulk.length} to Paths`}
              onDone={() => setBulk([])}
            />
            <Button size="sm" variant="ghost" onClick={() => setBulk([])}>
              Clear selection
            </Button>
          </div>
        )}
        <Q q={ms}>
          {(all) => {
            const visible = all
              .filter(
                (m) =>
                  m.id === linkedMeasureId ||
                  ((!search ||
                    `${m.title} ${m.resource}`.toLowerCase().includes(search.toLowerCase())) &&
                    (risk === "all" || m.risk.level === risk) &&
                    (category === "all" || m.service === category) &&
                    (resource === "all" || m.resource === resource) &&
                    (!minCost || m.savingsChf >= Number(minCost)) &&
                    (!minCo2 || m.savingsCo2KgLocation >= Number(minCo2)) &&
                    (!maxEffort || m.effortPersonDays <= Number(maxEffort))),
              )
              .sort((a, b) =>
                sort === "co2"
                  ? b.savingsCo2KgLocation - a.savingsCo2KgLocation
                  : sort === "effort"
                    ? a.effortPersonDays - b.effortPersonDays
                    : sort === "risk"
                      ? ["low", "review", "blocked"].indexOf(a.risk.level) -
                        ["low", "review", "blocked"].indexOf(b.risk.level)
                      : b.savingsChf - a.savingsChf,
              );
            return (
              <div className="space-y-3">
                {visible.map((m) => (
                  <MeasureCard
                    key={m.id}
                    m={m}
                    bulkSelected={bulk.includes(m.id)}
                    onBulkToggle={(v) =>
                      setBulk((ids) =>
                        v ? [...new Set([...ids, m.id])] : ids.filter((x) => x !== m.id),
                      )
                    }
                  />
                ))}
                {!visible.length && (
                  <p className="py-6 text-sm text-muted-foreground">
                    No recommendations match these filters.
                  </p>
                )}
              </div>
            );
          }}
        </Q>
      </section>
      {pkg && (
        <AnalyticalInspector
          title="Recommended package · exact measures"
          trigger={null}
          open={viewOpen}
          onOpenChange={setViewOpen}
        >
          <p className="text-xs text-muted-foreground">
            {pkg.measureIds.length} generated recommendations · {chf(budget)} · {prio}
          </p>
          {ms.data
            ?.filter((m) => pkg.measureIds.includes(m.id))
            .map((m) => (
              <MeasureCard key={m.id} m={m} readOnly compact />
            ))}
        </AnalyticalInspector>
      )}
      {pkg && (
        <SavePackageDialog
          open={saveOpen}
          onOpenChange={setSaveOpen}
          onSave={(name, replaceId) => {
            const base = { measureIds: [...pkg.measureIds], budgetChf: budget, priority: prio };
            try {
              const id = replaceId ?? crypto.randomUUID();
              if (!replaceId) createPath(s.paths, { ...base, id, name });
              set((state) => ({
                paths: replaceId
                  ? replacePath(state.paths, replaceId, { ...base, name })
                  : createPath(state.paths, { ...base, id, name }),
              }));
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
          <Input
            aria-label="Path name"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
          />
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
          {replaceId && (
            <p className="text-sm text-warning">
              Confirm replacement: all recommendations in the selected Path will be replaced. Other
              Paths and Current Plan stay unchanged.
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
