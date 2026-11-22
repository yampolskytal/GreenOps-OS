import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookmarkPlus, ShieldCheck, List } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/greenops/shell";
import { CalcInfo, Q } from "@/components/greenops/ui";
import { StartingPlanNotice } from "@/components/greenops/starting-plan-notice";
import { BudgetSlider } from "@/components/greenops/portfolio";
import { PathComparison, CommitPathDialog } from "@/components/greenops/path-comparison";
import { PathMembership } from "@/components/greenops/path-membership";
import { MeasureCard } from "@/components/greenops/measure-card";
import { PlanOutcomes } from "@/components/greenops/plan-outcomes";
import { TargetPanel } from "@/components/greenops/targets";
import { DashboardSections } from "@/components/greenops/dashboard-sections";
import { DetailDrawer, EvidenceInfoButton } from "@/components/greenops/details";
import { PackageEvidence } from "@/components/greenops/package-evidence";
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
import { useMeasures, useOverview } from "@/lib/queries";
import { useApp, useGlobalQuery } from "@/lib/store";
import { createPath, MAX_PATHS, replacePath } from "@/lib/paths";
import { useCommitPlan } from "@/lib/use-commit";
import { officialQuery } from "@/lib/planning";
import { reveal } from "@/lib/reveal";
import { chf, kg, pct } from "@/lib/format";
import { seo } from "@/lib/seo";
import { type ScenarioSettings } from "@/components/greenops/scenario-forecast";
import { recommendationOptions } from "@/lib/starting-plan";
export const Route = createFileRoute("/studio")({
  head: () =>
    seo(
      "Optimization Studio — GreenOps OS",
      "Automatically updated recommendations, three alternative Paths and explicit Current Plan proposal saving.",
    ),
  component: Studio,
});
const PRIOS = [
  {
    id: "balanced" as const,
    label: "Balanced",
    description: "Balance financial and carbon objectives",
  },
  { id: "cost" as const, label: "Cost savings", description: "Prioritize first-year net savings" },
  {
    id: "co2" as const,
    label: "CO₂ reduction",
    description: "Prioritize conservative location-based CO₂ reduction",
  },
];
function sectionForHash(hash: string) {
  if (hash === "paths" || hash.startsWith("path-")) return "paths";
  if (hash === "recommendations" || hash.startsWith("measure-")) return "measures";
  return "recommended";
}

function Studio() {
  const hash = useRouterState({ select: (r) => r.location.hash.replace(/^#/, "") });
  const navigate = useNavigate();
  const [section, setSection] = useState(() => sectionForHash(hash));
  const [scenarioSettings, setScenarioSettings] = useState<ScenarioSettings>();
  useEffect(() => {
    if (hash) setSection(sectionForHash(hash));
  }, [hash]);
  useEffect(() => {
    const openPath = (event: Event) => {
      if (!(event instanceof CustomEvent) || typeof event.detail !== "string") return;
      setSection("paths");
      void navigate({ to: "/studio", hash: `path-${event.detail}` });
    };
    window.addEventListener("greenops-open-path", openPath);
    return () => window.removeEventListener("greenops-open-path", openPath);
  }, [navigate]);
  const linkedMeasureId = hash.startsWith("measure-") ? hash.slice(8) : null;
  const { s, set, hydrated } = useApp();
  const q = officialQuery(useGlobalQuery());
  const ms = useMeasures(),
    overview = useOverview(true);
  const { budgetChf: budget, priority: prio } = s.studioSettings ?? s;
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
    [browse, setBrowse] = useState("plan"),
    [risk, setRisk] = useState("all"),
    [category, setCategory] = useState("all"),
    [resource, setResource] = useState("all"),
    [sort, setSort] = useState("cost");
  const [minCost, setMinCost] = useState(""),
    [minCo2, setMinCo2] = useState(""),
    [maxEffort, setMaxEffort] = useState("");
  const commit = useCommitPlan(ms.data);
  const recommended = useQuery({
    ...recommendationOptions(q, debouncedBudget, prio),
    ...(s.initialization.status === "suggested" &&
    s.initialization.candidate &&
    debouncedBudget === 16500 &&
    prio === "balanced"
      ? { initialData: s.initialization.candidate }
      : {}),
    enabled: section === "recommended" && hydrated && budget === debouncedBudget,
  });
  const recalculating = budget !== debouncedBudget || recommended.isFetching;
  const pkg = budget === debouncedBudget && !recommended.isError ? recommended.data : undefined;
  const currentPackage = !recalculating && pkg ? pkg : undefined;
  const excluded = currentPackage?.result.excluded ?? [];
  const hasOperationalBlock =
    !!currentPackage &&
    (excluded.length > 0 ||
      currentPackage.measureIds.some(
        (id) =>
          ms.data &&
          !ms.data.some((m) => m.id === id && m.includable && m.risk.level !== "blocked"),
      ));
  useEffect(() => {
    if (section !== "recommended" || !currentPackage) {
      setSaveOpen(false);
      setCommitOpen(false);
      setViewOpen(false);
    }
  }, [section, currentPackage]);
  useEffect(() => {
    if (
      section === "measures" &&
      linkedMeasureId &&
      ms.data?.some((m) => m.id === linkedMeasureId)
    ) {
      reveal(`measure-${linkedMeasureId}`);
    }
  }, [section, linkedMeasureId, ms.data]);
  return (
    <AppShell
      kicker="Decide · Optimization Studio"
      title="Build and compare strategies"
      subtitle="Up to three Paths, one Current Plan. Saved proposals remain unchanged while recommendations update."
      showStartingPlan={false}
    >
      <DashboardSections
        label="Optimization Studio sections"
        sectionForHash={sectionForHash}
        value={section}
        onSectionChange={(value) => {
          setSection(value);
          if (hash) void navigate({ to: "/studio", hash: "", resetScroll: false });
        }}
        sections={[
          {
            id: "recommended",
            label: "Recommendations",
            content: (
              <div className="@container space-y-4">
                <StartingPlanNotice compact />
                <div className="grid items-start gap-6 @4xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
                  <section className="min-w-0 space-y-4">
                    <h2 className="font-semibold">Recommendation settings</h2>
                    <BudgetSlider
                      value={budget}
                      onChange={(value) =>
                        set({ studioSettings: { budgetChf: value, priority: prio } })
                      }
                    />
                    <p className="mb-2 mt-6 text-sm font-medium">Optimization priority</p>
                    <div className="flex flex-wrap gap-1">
                      {PRIOS.map((p) => (
                        <Button
                          key={p.id}
                          size="sm"
                          aria-pressed={prio === p.id}
                          title={p.description}
                          variant={prio === p.id ? "default" : "ghost"}
                          onClick={() =>
                            set({ studioSettings: { budgetChf: budget, priority: p.id } })
                          }
                        >
                          {p.label}
                        </Button>
                      ))}
                    </div>
                    <p className="mt-5 text-xs text-muted-foreground">
                      Official limits: CHF 16,500 · 15 person-days.{" "}
                      {api.isDemo
                        ? "DEMO optimizer — illustrative only."
                        : "Calculated by the team backend."}
                    </p>
                    <div
                      className="grid justify-items-center gap-2 border-t pt-3"
                      role="group"
                      aria-label="Recommendation actions"
                    >
                      <div className="flex flex-wrap justify-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!currentPackage || !ms.data}
                          onClick={() => setViewOpen(true)}
                        >
                          <List />
                          View measures
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!currentPackage?.measureIds.length}
                          onClick={() => setSaveOpen(true)}
                        >
                          <BookmarkPlus />
                          Save as Path
                        </Button>
                      </div>
                      <Button
                        size="sm"
                        disabled={
                          !currentPackage?.measureIds.length || !ms.data || hasOperationalBlock
                        }
                        onClick={() => {
                          commit.setError(null);
                          setCommitOpen(true);
                        }}
                      >
                        Commit as Current Plan <ArrowRight />
                      </Button>
                    </div>
                  </section>
                  <section id="recommended" className="min-w-0">
                    <header className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
                      <h2 className="font-semibold">Recommended package</h2>
                      <span role="status" className="text-xs text-muted-foreground">
                        {recalculating ? "Recalculating…" : currentPackage ? "Updated" : ""}
                      </span>
                    </header>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {PRIOS.find((p) => p.id === prio)?.label} · budget {chf(budget)}
                      {pkg?.searchComplete === true
                        ? " · Search complete"
                        : pkg?.searchComplete === false
                          ? " · Best package found within the search limit"
                          : ""}
                    </p>
                    {recommended.isError && (
                      <p role="alert" className="mt-4 text-sm text-destructive">
                        Recommendation unavailable: {recommended.error.message}
                      </p>
                    )}
                    {pkg && !recalculating && (
                      <>
                        <p className="mt-4 text-sm">
                          {pkg.measureIds.length} recommendations ·{" "}
                          {pkg.result.effortDays.toFixed(1)} person-days ·{" "}
                          {chf(pkg.result.effortChf)} implementation cost ·{" "}
                          {ms.data?.filter(
                            (m) => pkg.measureIds.includes(m.id) && m.risk.level === "review",
                          ).length ?? 0}{" "}
                          require review
                        </p>
                        {pkg.result.firstYearNetChf != null && (
                          <p className="mt-2 text-sm">
                            First-year gross {chf(pkg.result.firstYearGrossChf)} · net{" "}
                            {chf(pkg.result.firstYearNetChf)} after implementation
                          </p>
                        )}
                        {pkg.result.costHeadroomChf != null && pkg.result.co2HeadroomKg != null && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            {chf(Math.abs(pkg.result.costHeadroomChf))}{" "}
                            {pkg.result.costHeadroomChf < 0 ? "below" : "above"} the annual cost
                            savings target · {kg(Math.abs(pkg.result.co2HeadroomKg))} CO₂e{" "}
                            {pkg.result.co2HeadroomKg < 0 ? "below" : "above"} the midpoint carbon
                            target
                            {pkg.result.conservativeCo2Pct != null &&
                              ` · Conservative carbon reduction ${pct(pkg.result.conservativeCo2Pct)}`}
                          </p>
                        )}
                        <div className="mt-5">
                          <Q q={overview}>
                            {(o) => (
                              <PlanOutcomes
                                overview={o}
                                result={pkg.result}
                                afterLabel="After recommendation"
                                projectionFirst
                              />
                            )}
                          </Q>
                        </div>
                        <div className="mt-6">
                          <TargetPanel r={pkg.result} compact indicatorsOnly />
                        </div>
                        {hasOperationalBlock && (
                          <p className="mt-3 text-sm text-warning">
                            This recommendation contains blocked or excluded measures. Review the
                            package evidence before committing.
                          </p>
                        )}
                        <DetailDrawer
                          title="Recommended package evidence"
                          trigger={<EvidenceInfoButton description="the recommended package" />}
                        >
                          <PackageEvidence result={pkg.result} />
                          {overview.data && (
                            <div className="space-y-1">
                              <p>Baseline calculation and source evidence</p>
                              <CalcInfo calc={overview.data.cost.calc} />
                              <CalcInfo calc={overview.data.co2Location.calc} />
                            </div>
                          )}
                        </DetailDrawer>
                      </>
                    )}
                    {!pkg && !recalculating && !recommended.isError && (
                      <p className="mt-6 text-sm text-muted-foreground">
                        Recommendation unavailable for these settings.
                      </p>
                    )}
                  </section>
                </div>
              </div>
            ),
          },
          {
            id: "paths",
            label: "Compare Paths",
            content: (
              <PathComparison
                scenarioSettings={scenarioSettings}
                onScenarioSettingsChange={setScenarioSettings}
              />
            ),
          },
          {
            id: "measures",
            label: "All Measures",
            content: (
              <section id="recommendations" className="pt-1">
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
                      label: "Decision",
                      value: browse,
                      change: setBrowse,
                      options: [
                        ["plan", "Plan candidates"],
                        ["evidence-needed", "Needs evidence"],
                        ["protected", "Protected actions"],
                        ["no-benefit", "No modeled benefit"],
                        ["all", "Full catalog"],
                      ],
                    },
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
                    {
                      label: "Maximum effort (person-days)",
                      value: maxEffort,
                      change: setMaxEffort,
                    },
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
                    Filters affect browsing only; saved Paths and official calculations stay
                    unchanged.
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setSearch("");
                      setBrowse("plan");
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
                            `${m.title} ${m.resource}`
                              .toLowerCase()
                              .includes(search.toLowerCase())) &&
                            (browse === "all" ||
                              (browse === "plan" && (m.includable || !m.decision)) ||
                              (browse === "protected" && m.risk.level === "blocked") ||
                              m.decision?.status === browse) &&
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
            ),
          },
        ]}
      />
      {section === "recommended" && currentPackage && (
        <AnalyticalInspector
          title="Recommended package · exact measures"
          trigger={null}
          open={viewOpen}
          onOpenChange={setViewOpen}
        >
          <p className="text-xs text-muted-foreground">
            {currentPackage.measureIds.length} generated recommendations · {chf(budget)} · {prio}
          </p>
          {ms.data
            ?.filter((m) => currentPackage.measureIds.includes(m.id))
            .map((m) => (
              <MeasureCard key={m.id} m={m} readOnly compact />
            ))}
        </AnalyticalInspector>
      )}
      {section === "recommended" && currentPackage && saveOpen && (
        <SavePackageDialog
          open={saveOpen}
          onOpenChange={setSaveOpen}
          onSave={(name, replaceId) => {
            const base = {
              measureIds: [...currentPackage.measureIds],
              budgetChf: budget,
              priority: prio,
            };
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
              setSection("paths");
              void navigate({ to: "/studio", hash: `path-${id}` });
              reveal(`path-${id}`);
              return null;
            } catch (e) {
              return e instanceof Error ? e.message : "Could not save Path.";
            }
          }}
        />
      )}
      {section === "recommended" && currentPackage && commitOpen && (
        <CommitPathDialog
          path={{
            name: "Recommended package",
            measureIds: currentPackage.measureIds,
            budgetChf: budget,
          }}
          committedCount={s.measureIds.length}
          pending={commit.pending}
          error={commit.error}
          onCancel={() => setCommitOpen(false)}
          onConfirm={async () => {
            const ok = await commit.commit({
              name: "Recommended package",
              measureIds: currentPackage.measureIds,
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
