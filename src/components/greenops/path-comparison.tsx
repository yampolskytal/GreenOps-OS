import { useEffect, useState, type KeyboardEvent } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Check, Pencil, Plus, Trash2, ArrowRight, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useApp } from "@/lib/store";
import { api } from "@/lib/api/client";
import type { Measure } from "@/lib/api/types";
import {
  ensurePath,
  MAX_PATHS,
  pathSlot,
  recommendAdditions,
  removeFromPath,
  setPathMembership,
  type SavedPath,
} from "@/lib/paths";
import { useMeasures } from "@/lib/queries";
import { usePathSimulation } from "@/lib/path-queries";
import { useCommitPlan } from "@/lib/use-commit";
import { reveal } from "@/lib/reveal";
import { chf, kg, pct } from "@/lib/format";
import { TargetPanel } from "./targets";
import { AnalyticalInspector } from "./analytical-inspector";
import { ScenarioForecastPanel } from "./scenario-forecast";
import { RiskBadge } from "./ui";
import { cn } from "@/lib/utils";
import { approvedDemoIds, isImplementableProposal, numericalWarnings } from "@/lib/proposals";

export function PathComparison() {
  const { s, set } = useApp();
  const measures = useMeasures();
  const [name, setName] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<SavedPath | null>(null);
  const [committing, setCommitting] = useState<SavedPath | null>(null);
  const commit = useCommitPlan(measures.data);
  const openPath = s.paths.find((p) => p.id === openId) ?? null;
  const hash = useRouterState({ select: (r) => r.location.hash });
  const linkedPathId =
    hash.startsWith("path-") && s.paths.some((p) => p.id === hash.slice(5)) ? hash.slice(5) : null;
  useEffect(() => {
    const open = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail === "string") setOpenId(event.detail);
    };
    window.addEventListener("greenops-open-path", open);
    return () => window.removeEventListener("greenops-open-path", open);
  }, []);
  useEffect(() => {
    if (linkedPathId) setOpenId(linkedPathId);
  }, [linkedPathId]);
  const submitName = () => {
    const trimmed = name.trim();
    if (!trimmed) return setNote("Type a name, then press Enter to create a Path.");
    const existing = s.paths.find((p) => p.name.trim().toLowerCase() === trimmed.toLowerCase());
    if (!existing && s.paths.length >= MAX_PATHS)
      return setNote("You already have three Paths. Rename, edit or delete one to make room.");
    try {
      const r = ensurePath(
        s.paths,
        trimmed,
        { budgetChf: s.budgetChf, priority: s.priority },
        crypto.randomUUID(),
      );
      if (r.created) set({ paths: r.paths });
      setName("");
      setNote(r.created ? null : `“${trimmed}” already exists — opened it.`);
      setOpenId(r.id);
      reveal(`path-${r.id}`);
      if (r.created) toast.success(`Path “${trimmed}” created — add recommendations to it`);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Path could not be created.");
    }
  };
  return (
    <section id="paths" className="mt-8 border-t pt-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Compare Paths</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {s.paths.length}/{MAX_PATHS} alternative strategies · editing a Path never changes your
            Current Plan
          </p>
        </div>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submitName();
          }}
        >
          <Input
            aria-label="Path name"
            placeholder={
              s.paths.length >= MAX_PATHS ? "Type a Path name to open it" : "New Path name"
            }
            maxLength={60}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNote(null);
            }}
            className="w-56 max-w-full"
          />
          <Button type="submit" variant="outline">
            <Plus />
            Save Path
          </Button>
        </form>
      </header>
      {note && (
        <p role="status" className="mb-4 text-sm text-warning">
          {note}
        </p>
      )}
      {!s.paths.length && (
        <p className="mb-6 max-w-2xl text-sm text-muted-foreground">
          Paths are alternative optimization strategies. Create up to three, add recommendations to
          them, and compare their projected results before choosing a Current Plan.
        </p>
      )}
      <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))]">
        {s.paths.map((path) => (
          <PathCard
            key={path.id}
            path={path}
            slot={pathSlot(s.paths, path)}
            measures={measures.data ?? []}
            active={openId === path.id}
            onOpen={() => setOpenId(openId === path.id ? null : path.id)}
            onDelete={() => setDeleting(path)}
            onCommit={() => {
              commit.setError(null);
              setCommitting(path);
            }}
            onRename={(n) =>
              set({ paths: s.paths.map((p) => (p.id === path.id ? { ...p, name: n } : p)) })
            }
          />
        ))}
      </div>
      <div className="mt-6">
        <ScenarioForecastPanel
          title="Projected outcomes by Path"
          emptyNote="Create a Path to compare it against “Without changes”."
          selections={[
            ...s.paths.map((p) => ({
              key: `path-${pathSlot(s.paths, p)}`,
              label: p.name,
              color: `var(--path-${pathSlot(s.paths, p)})`,
              measureIds: p.measureIds,
            })),
            {
              key: "plan",
              label: "Current Plan",
              color: "var(--scenario-plan)",
              measureIds: s.measureIds,
              defaultHidden: true,
            },
          ]}
        />
      </div>
      {openPath && (
        <AnalyticalInspector
          title={`${openPath.name} · measures`}
          description="Edit this Path directly. Changes recalculate its criteria and its line in the comparison."
          open
          onOpenChange={(o) => !o && setOpenId(null)}
          trigger={<span />}
        >
          <PathInspector path={openPath} measures={measures.data ?? []} />
        </AnalyticalInspector>
      )}
      <Dialog open={deleting != null} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this Path?</DialogTitle>
            <DialogDescription>
              {deleting?.name} will be removed. Your Current Plan and other Paths stay unchanged.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Keep Path
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleting) {
                  set({ paths: s.paths.filter((p) => p.id !== deleting.id) });
                  if (openId === deleting.id) setOpenId(null);
                  toast.success(`Deleted ${deleting.name}`);
                }
                setDeleting(null);
              }}
            >
              Delete Path
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {committing && (
        <CommitPathDialog
          path={committing}
          committedCount={s.measureIds.length}
          pending={commit.pending}
          error={commit.error}
          onCancel={() => setCommitting(null)}
          onConfirm={async () => {
            const ok = await commit.commit(committing);
            if (ok) setCommitting(null);
          }}
        />
      )}
    </section>
  );
}

function CommitPathDialog({
  path,
  committedCount,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  path: Pick<SavedPath, "name" | "measureIds" | "budgetChf">;
  committedCount: number;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const sim = usePathSimulation(path);
  const r = sim.data;
  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Commit “{path.name}” to Current Plan?</DialogTitle>
          <DialogDescription>
            This replaces your current saved strategy ({committedCount} measures) with{" "}
            {path.measureIds.length} measures. The Path stays saved as an alternative. Nothing is
            approved or executed.
          </DialogDescription>
        </DialogHeader>
        {r && (
          <ul className="num space-y-1 text-sm">
            <li>
              Annual savings: {chf(r.savingsChf)} ({pct(r.costReductionPct)})
            </li>
            <li>
              Location-based CO₂ reduction: {kg(r.savingsCo2Kg)} ({pct(r.co2ReductionPct)})
            </li>
            <li>
              Effort: {r.effortDays.toFixed(1)} person-days · budget {chf(r.effortChf)}
            </li>
          </ul>
        )}
        {r && !r.feasible && (
          <p className="text-sm text-warning">
            Not submission-ready:{" "}
            {numericalWarnings(r).join("; ") || r.reasons.join(" ") || "misses numerical targets."}{" "}
            It can still be saved as a proposal.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" disabled={pending} onClick={onCancel}>
            Keep editing
          </Button>
          <Button disabled={pending || !r} onClick={onConfirm}>
            {pending
              ? "Validating…"
              : r && numericalWarnings(r).length
                ? "Save as non-compliant Current Plan"
                : "Confirm commit"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
export { CommitPathDialog };

function PathCard({
  path,
  slot,
  measures,
  active,
  onOpen,
  onDelete,
  onCommit,
  onRename,
}: {
  path: SavedPath;
  slot: string;
  measures: Measure[];
  active: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onCommit: () => void;
  onRename: (name: string) => void;
}) {
  const sim = usePathSimulation(path);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(path.name);
  const { s } = useApp();
  const approved = approvedDemoIds(s.demoExceptions, api.isDemo);
  const chosen = measures.filter((m) => path.measureIds.includes(m.id));
  const blocked = chosen.filter((m) => !isImplementableProposal(m, approved)).length;
  const review = chosen.filter((m) => m.risk.level === "review").length;
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
  const key = (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen();
    }
  };
  return (
    <article
      id={`path-${path.id}`}
      role="button"
      tabIndex={0}
      aria-pressed={active}
      aria-label={`${path.name}: open measures`}
      onClick={onOpen}
      onKeyDown={key}
      className={cn(
        "min-w-0 cursor-pointer rounded-lg border border-t-4 bg-card p-4 transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring",
        active && "ring-2 ring-ring",
      )}
      style={{ borderTopColor: `var(--path-${slot})` }}
    >
      <header className="mb-3 flex items-start justify-between gap-2">
        {renaming ? (
          <form
            className="flex min-w-0 flex-1 gap-1"
            onClick={stop}
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) {
                onRename(name.trim());
                setRenaming(false);
              }
            }}
          >
            <Input
              aria-label="Rename Path"
              value={name}
              maxLength={60}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={stop}
            />
            <Button aria-label="Save Path name" size="icon" disabled={!name.trim()}>
              <Check />
            </Button>
          </form>
        ) : (
          <div className="min-w-0">
            <h3 className="break-words font-semibold">{path.name}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {path.measureIds.length} measures · {blocked} blocked · {review} review
            </p>
          </div>
        )}
        <div className="flex shrink-0 gap-0.5" onClick={stop} onKeyDown={stop}>
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Rename ${path.name}`}
            title="Rename"
            onClick={() => setRenaming(!renaming)}
          >
            {renaming ? <X /> : <Pencil />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Delete ${path.name}`}
            title="Delete"
            onClick={onDelete}
          >
            <Trash2 />
          </Button>
        </div>
      </header>
      {sim.isPending ? (
        <p className="py-6 text-sm text-muted-foreground">Calculating…</p>
      ) : sim.isError ? (
        <p className="py-6 text-sm text-destructive">Cannot calculate: {sim.error.message}</p>
      ) : (
        <>
          <dl className="num mb-4 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Annual savings</dt>
              <dd>{chf(sim.data.savingsChf)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">CO₂ reduction / yr</dt>
              <dd>{kg(sim.data.savingsCo2Kg)}</dd>
            </div>
          </dl>
          <TargetPanel r={sim.data} />
          <p className="mt-3 text-xs text-muted-foreground">
            {blocked
              ? "Contains blocked measures — cannot be committed as is."
              : sim.data.feasible
                ? "Meets numerical criteria · approvals still required"
                : "Not submission-ready"}
            {api.isDemo ? " · DEMO" : ""}
          </p>
        </>
      )}
      <div className="mt-4 flex flex-wrap gap-2" onClick={stop} onKeyDown={stop}>
        <Button size="sm" variant="outline" onClick={onOpen}>
          <Pencil />
          Edit measures
        </Button>
        <Button
          size="sm"
          disabled={!path.measureIds.length || blocked > 0 || sim.isPending}
          onClick={onCommit}
        >
          Commit to Current Plan
          <ArrowRight />
        </Button>
      </div>
    </article>
  );
}

function PathInspector({ path, measures }: { path: SavedPath; measures: Measure[] }) {
  const { s, set } = useApp();
  const sim = usePathSimulation(path);
  const chosen = measures.filter((m) => path.measureIds.includes(m.id));
  const additions = recommendAdditions(measures, path, sim.data ?? null);
  return (
    <>
      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Measures in this Path ({chosen.length})
        </h3>
        {!chosen.length && (
          <p className="text-muted-foreground">No measures yet. Add recommended additions below.</p>
        )}
        <ul className="space-y-3">
          {chosen.map((m) => (
            <li key={m.id} className="rounded-md border p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 break-words font-medium">{m.title}</p>
                <RiskBadge level={m.risk.level} />
                {s.demoExceptions[m.id]?.approved && (
                  <span className="text-xs text-warning">Demo exception approved</span>
                )}
              </div>
              <p className="num mt-1 text-xs text-muted-foreground">
                {chf(m.savingsChf)}/yr · {kg(m.savingsCo2KgLocation)} CO₂/yr · {m.effortPersonDays}{" "}
                PD
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{m.risk.why || m.description}</p>
              <Button
                size="sm"
                variant="ghost"
                className="mt-2 text-destructive"
                onClick={() =>
                  set((state) => ({ paths: removeFromPath(state.paths, path.id, m.id) }))
                }
              >
                <X />
                Remove from Path
              </Button>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Recommended additions for this Path
        </h3>
        {!additions.length && (
          <p className="text-muted-foreground">
            No further eligible measures fit the remaining effort without blocked risks.
          </p>
        )}
        <ul className="space-y-3">
          {additions.map(({ measure: m, reason }) => (
            <li key={m.id} className="rounded-md border border-dashed p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 break-words font-medium">{m.title}</p>
                <RiskBadge level={m.risk.level} />
                {s.demoExceptions[m.id]?.approved && (
                  <span className="text-xs text-warning">Demo exception approved</span>
                )}
              </div>
              <p className="num mt-1 text-xs text-muted-foreground">
                +{chf(m.savingsChf)}/yr · +{kg(m.savingsCo2KgLocation)} CO₂/yr · +
                {m.effortPersonDays} PD
              </p>
              <p className="mt-1 text-xs">{reason}</p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2 border-info/50 text-info"
                onClick={() =>
                  set((state) => ({
                    paths: setPathMembership(state.paths, m.id, [
                      ...state.paths.filter((p) => p.measureIds.includes(m.id)).map((p) => p.id),
                      path.id,
                    ]),
                  }))
                }
              >
                <Plus />
                Add to Path
              </Button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          Ranked by supplied per-measure savings against this Path’s remaining gaps. Feasibility is
          only known after the Path recalculates.
        </p>
      </section>
    </>
  );
}
