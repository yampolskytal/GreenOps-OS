import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Pencil, Trash2, Plus, Check, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useApp, useGlobalQuery } from "@/lib/store";
import { api } from "@/lib/api/client";
import { createPath, MAX_PATHS, type SavedPath } from "@/lib/paths";
import { useMeasures } from "@/lib/queries";
import { chf } from "@/lib/format";
import { TargetPanel } from "./targets";
import { DetailDrawer } from "./details";
import { Q } from "./ui";

export function PathComparison({
  preview,
  onLoad,
}: {
  preview: Pick<SavedPath, "measureIds" | "budgetChf" | "priority">;
  onLoad: (path: SavedPath) => void;
}) {
  const { s, set } = useApp();
  const [name, setName] = useState("");
  const [deleting, setDeleting] = useState<SavedPath | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <section id="paths" className="mt-8 border-t pt-6">
      <header className="mb-5 flex flex-wrap justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Compare Paths</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Independent saved alternatives · up to three · not your Current Plan
          </p>
        </div>
        {s.paths.length < MAX_PATHS && (
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!name.trim()) return;
              try {
                set({ paths: createPath(s.paths, { ...preview, id: crypto.randomUUID(), name }) });
                setName("");
                setError(null);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Path could not be saved.");
              }
            }}
          >
            <Input
              aria-label="Save preview Path name"
              placeholder="Name this preview"
              maxLength={60}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-48 max-w-full"
            />
            <Button type="submit" variant="outline" disabled={!name.trim()}>
              <Plus />
              Save Preview as Path
            </Button>
          </form>
        )}
      </header>
      {error && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {error}
        </p>
      )}
      {!s.paths.length && (
        <p className="py-6 text-sm text-muted-foreground">
          No Paths saved. Save your preview, including combinations that miss limits, to keep
          exploring later.
        </p>
      )}
      <div className="grid items-start gap-5 xl:grid-cols-3 lg:grid-cols-2">
        {s.paths.map((path) => (
          <PathCard
            key={path.id}
            path={path}
            onLoad={() => onLoad(path)}
            onDelete={() => setDeleting(path)}
            onRename={(name) =>
              set({ paths: s.paths.map((p) => (p.id === path.id ? { ...p, name } : p)) })
            }
          />
        ))}
      </div>
      <Dialog
        open={deleting != null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this Path?</DialogTitle>
            <DialogDescription>
              {deleting?.name} will be removed. Preview and Current Plan stay unchanged.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Keep Path
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleting) set({ paths: s.paths.filter((p) => p.id !== deleting.id) });
                setDeleting(null);
              }}
            >
              Delete Path
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
function PathCard({
  path,
  onLoad,
  onDelete,
  onRename,
}: {
  path: SavedPath;
  onLoad: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
}) {
  const q = useGlobalQuery();
  const measures = useMeasures();
  const sim = useQuery({
    queryKey: ["path-simulation", q, path],
    queryFn: () =>
      api.simulate(q, {
        measureIds: path.measureIds,
        budgetChf: path.budgetChf,
        chfPerPersonDay: 1100,
      }),
  });
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(path.name);
  const chosen = measures.data?.filter((m) => path.measureIds.includes(m.id)) ?? [];
  const blocked = chosen.filter((m) => m.risk.level === "blocked" || !m.includable).length;
  const review = chosen.filter((m) => m.risk.level === "review").length;
  return (
    <article className="min-w-0 rounded-lg border bg-card p-4">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-2">
        {renaming ? (
          <form
            className="flex min-w-0 gap-1"
            onSubmit={(event) => {
              event.preventDefault();
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
              onChange={(event) => setName(event.target.value)}
            />
            <Button aria-label="Save Path name" size="icon" disabled={!name.trim()}>
              <Check />
            </Button>
          </form>
        ) : (
          <div className="min-w-0">
            <h3 className="font-semibold">{path.name}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{path.measureIds.length} measures</p>
          </div>
        )}
        <div className="flex gap-1">
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Rename ${path.name}`}
            title="Rename Path"
            onClick={() => setRenaming(!renaming)}
          >
            <Pencil />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Delete ${path.name}`}
            title="Delete Path"
            onClick={onDelete}
          >
            <Trash2 />
          </Button>
        </div>
      </header>
      <Q q={sim}>
        {(r) => (
          <>
            <p className="num mb-4 text-lg font-semibold">
              {chf(r.savingsChf)}{" "}
              <span className="text-xs font-normal text-muted-foreground">
                projected annual savings
              </span>
            </p>
            <TargetPanel r={r} />
            <p className="mt-4 text-xs text-muted-foreground">
              {blocked} blocked · {review} review required ·{" "}
              {chosen.length < path.measureIds.length
                ? "Unknown measures — insufficient data"
                : r.feasible && !blocked
                  ? "Meets numerical criteria"
                  : "Not submission-ready"}
              .{" "}
              {api.isDemo
                ? "DEMO — not verified for submission."
                : "Approval and evidence verification still required."}
            </p>
          </>
        )}
      </Q>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onLoad}>
          Load as Preview
          <ArrowRight />
        </Button>
        <DetailDrawer
          title={`${path.name} · measures`}
          trigger={
            <Button variant="ghost" size="sm">
              <List />
              View measures
            </Button>
          }
        >
          <ul className="space-y-3">
            {chosen.map((m) => (
              <li key={m.id}>
                <b>{m.title}</b>
                <p className="mt-1 text-muted-foreground">
                  {m.risk.level} · {m.risk.why || "Reason not supplied"}
                </p>
              </li>
            ))}
          </ul>
        </DetailDrawer>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Load as Preview to validate and commit. Paths never commit automatically.
      </p>
    </article>
  );
}
