// Adapted from the supplied 21st.dev LeaderboardBars: rank translation, grow-in and hover focus retained.
import { useMemo, useState } from "react";
import { Search, Boxes } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DetailDrawer } from "./details";
export interface ComparisonItem {
  id: string;
  label: string;
  value: number | null;
  detail?: string;
  content?: React.ReactNode;
}
export function LeaderboardBars({
  items,
  format,
  label,
}: {
  items: ComparisonItem[];
  format: (n: number) => string;
  label: string;
}) {
  const [search, setSearch] = useState("");
  const sorted = useMemo(
    () =>
      [...items]
        .filter((i) => i.label.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity)),
    [items, search],
  );
  const rows = sorted;
  const max = Math.max(1, ...items.map((i) => (Number.isFinite(i.value) ? (i.value ?? 0) : 0)));
  return (
    <div>
      <div className="mb-5 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <DetailDrawer
          title="Attribution methodology"
          trigger={
            <Button variant="ghost" size="sm">
              Methodology
            </Button>
          }
        >
          <p>{label}</p>
        </DetailDrawer>
        <div className="relative max-w-56">
          <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
          <Input
            aria-label="Search comparison"
            placeholder="Find an entity…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        <span className="mr-2 inline-block h-2 w-5 rounded bg-primary" />
        Shared zero-based scale: {format(0)}–{format(max)} · Unavailable values have no fill
      </p>
      <div className="space-y-4">
        {rows.map((i, rank) => (
          <div key={i.id} className="min-w-0">
            <DetailDrawer
              fullWidth
              title={i.label}
              trigger={
                <Button
                  variant="ghost"
                  className="comparison-row grid h-auto w-full grid-cols-[20px_minmax(0,1fr)_auto] gap-x-3 gap-y-2 whitespace-normal rounded-none px-0 py-2 text-left"
                >
                  <Boxes className="size-5 text-muted-foreground" />
                  <span className="min-w-0 break-words font-medium">{i.label}</span>
                  <span className="num shrink-0 text-right text-xs">
                    {i.value == null ? "—" : format(i.value)}
                  </span>
                  <span
                    data-comparison-track
                    data-value={i.value ?? "unavailable"}
                    data-maximum={max}
                    className="col-span-3 block h-2.5 w-full overflow-hidden rounded bg-muted"
                  >
                    <span
                      className="vlb-bar block h-full rounded bg-primary"
                      style={{
                        width: i.value == null ? "0%" : `${(Math.max(0, i.value) / max) * 100}%`,
                        animationDelay: `${rank * 55}ms`,
                      }}
                    />
                  </span>
                </Button>
              }
            >
              {i.content ?? (
                <p>{i.detail ?? "Detailed source breakdown is unavailable for this entity."}</p>
              )}
            </DetailDrawer>
          </div>
        ))}
      </div>
      {!rows.length && (
        <p className="py-8 text-center text-sm text-muted-foreground">No matching entities</p>
      )}
    </div>
  );
}
