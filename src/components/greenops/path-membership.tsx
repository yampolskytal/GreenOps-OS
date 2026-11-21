import { useState } from "react";
import { BookmarkPlus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useApp } from "@/lib/store";
import { createPath, MAX_PATHS, setPathMembership } from "@/lib/paths";

export function PathMembership({ measureId }: { measureId: string }) {
  const { s, set } = useApp();
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<string[]>([]);
  const [name, setName] = useState("");
  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value)
          setChecked(s.paths.filter((p) => p.measureIds.includes(measureId)).map((p) => p.id));
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <BookmarkPlus />
          Add to Paths
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" collisionPadding={12} className="w-[min(300px,calc(100vw-24px))]">
        <h3 className="font-semibold">Add to Paths</h3>
        <div className="my-4 space-y-3">
          {s.paths.map((p) => (
            <label key={p.id} className="flex items-center gap-3 text-sm">
              <Checkbox
                checked={checked.includes(p.id)}
                onCheckedChange={(value) =>
                  setChecked((ids) => (value ? [...ids, p.id] : ids.filter((id) => id !== p.id)))
                }
              />
              <span className="min-w-0 break-words">{p.name}</span>
            </label>
          ))}
          {!s.paths.length && <p className="text-sm text-muted-foreground">No saved Paths yet.</p>}
        </div>
        {s.paths.length < MAX_PATHS && (
          <form
            className="mb-4 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!name.trim()) return;
              const id = crypto.randomUUID();
              set({
                paths: createPath(s.paths, {
                  id,
                  name,
                  measureIds: [],
                  budgetChf: s.budgetChf,
                  priority: s.priority,
                }),
              });
              setChecked((ids) => [...ids, id]);
              setName("");
            }}
          >
            <Input
              aria-label="New Path name"
              value={name}
              maxLength={60}
              onChange={(event) => setName(event.target.value)}
              placeholder="Path name"
              className="min-w-0"
            />
            <Button size="icon" type="submit" disabled={!name.trim()} aria-label="Create Path">
              <Plus />
            </Button>
          </form>
        )}
        <Button
          className="w-full"
          onClick={() => {
            set({ paths: setPathMembership(s.paths, measureId, checked) });
            setOpen(false);
          }}
        >
          Save memberships
        </Button>
      </PopoverContent>
    </Popover>
  );
}
