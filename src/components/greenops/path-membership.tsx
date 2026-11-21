import { useState } from "react";
import { BookmarkPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useApp } from "@/lib/store";
import {
  addMeasuresToPaths,
  createPath,
  findPathByName,
  MAX_PATHS,
  pathSlot,
  setPathMembership,
} from "@/lib/paths";
import { reveal } from "@/lib/reveal";
import { useNavigate, useRouterState } from "@tanstack/react-router";

/**
 * Multi-select Path assignment. One measure → membership editing (checked = member).
 * Several measures (bulk) → adds all of them to the checked Paths.
 */
export function PathMembership({
  measureIds,
  label = "Add to Paths",
  onDone,
}: {
  measureIds: string[];
  label?: string;
  onDone?: () => void;
}) {
  const { s, set } = useApp();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const bulk = measureIds.length !== 1;
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const viewPaths = () => {
    if (pathname === "/studio") reveal("paths");
    else void navigate({ to: "/studio", hash: "paths" });
  };
  const confirm = (paths: typeof s.paths, ids: string[]) => {
    const names = paths.filter((p) => ids.includes(p.id)).map((p) => p.name);
    toast.success(
      names.length
        ? `${bulk ? `${measureIds.length} measures added to` : "Saved in"} ${names.join(", ")}`
        : "Removed from all Paths",
      { action: { label: "View Paths", onClick: viewPaths } },
    );
  };
  const save = () => {
    const next = bulk
      ? addMeasuresToPaths(s.paths, measureIds, checked)
      : setPathMembership(s.paths, measureIds[0] ?? "", checked);
    set({ paths: next });
    confirm(next, checked);
    setOpen(false);
    onDone?.();
  };
  const createAndAdd = () => {
    const trimmed = name.trim();
    if (!trimmed) return setError("Type a name for the new Path.");
    const existing = findPathByName(s.paths, trimmed);
    if (existing) {
      setChecked((ids) => [...new Set([...ids, existing.id])]);
      setName("");
      setError(`“${existing.name}” already exists — it is now selected.`);
      return;
    }
    try {
      const id = crypto.randomUUID();
      const created = createPath(s.paths, {
        id,
        name: trimmed,
        measureIds: [],
        budgetChf: s.budgetChf,
        priority: s.priority,
      });
      const ids = [...new Set([...checked, id])];
      const next = bulk
        ? addMeasuresToPaths(created, measureIds, ids)
        : setPathMembership(created, measureIds[0] ?? "", ids);
      set({ paths: next });
      confirm(next, ids);
      setName("");
      setOpen(false);
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Path could not be created.");
    }
  };
  const typed = name.trim();
  const match = typed ? findPathByName(s.paths, typed) : undefined;
  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        setError(null);
        setName("");
        if (value)
          setChecked(
            bulk ? [] : s.paths.filter((p) => p.measureIds.includes(measureIds[0] ?? "")).map((p) => p.id),
          );
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" disabled={!measureIds.length}>
          <BookmarkPlus />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" collisionPadding={12} className="w-[min(320px,calc(100vw-24px))]">
        <h3 className="font-semibold">{bulk ? `Add ${measureIds.length} measures to Paths` : "Add to Paths"}</h3>
        <p className="mt-1 text-xs text-muted-foreground">Paths only · Current Plan stays unchanged</p>
        <div className="my-4 space-y-3">
          {s.paths.map((p) => (
            <label key={p.id} className="flex items-center gap-3 text-sm">
              <Checkbox
                checked={checked.includes(p.id)}
                onCheckedChange={(value) =>
                  setChecked((ids) => (value ? [...ids, p.id] : ids.filter((id) => id !== p.id)))
                }
              />
              <span className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: `var(--path-${pathSlot(s.paths, p)})` }} />
              <span className="min-w-0 break-words">{p.name}</span>
              <span className="ml-auto text-xs text-muted-foreground">{p.measureIds.length}</span>
            </label>
          ))}
          {!s.paths.length && <p className="text-sm text-muted-foreground">No Paths yet — name one below.</p>}
        </div>
        {s.paths.length < MAX_PATHS ? (
          <form
            className="mb-4 space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              createAndAdd();
            }}
          >
            <Input
              aria-label="New Path name"
              value={name}
              maxLength={60}
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
              placeholder="New Path name, then Enter"
            />
            {typed && (
              <Button type="submit" variant="secondary" size="sm" className="h-auto w-full whitespace-normal py-2">
                {match ? `Select “${match.name}”` : `Create “${typed}” and add ${bulk ? "these measures" : "this measure"}`}
              </Button>
            )}
          </form>
        ) : (
          <p className="mb-4 text-xs text-muted-foreground">
            Maximum of three Paths reached. Edit or delete one in Compare Paths to add another.
          </p>
        )}
        {error && (
          <p role="alert" className="mb-3 text-xs text-warning">
            {error}
          </p>
        )}
        <Button className="w-full" onClick={save} disabled={!s.paths.length || (bulk && !checked.length)}>
          {bulk ? "Add to selected Paths" : "Save memberships"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
