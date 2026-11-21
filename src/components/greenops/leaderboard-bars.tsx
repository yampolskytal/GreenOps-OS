// Adapted from the supplied 21st.dev LeaderboardBars: rank translation, grow-in and hover focus retained.
import { useMemo, useState } from "react";
import { Search, ChevronDown, Boxes } from "lucide-react";
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
  const [more, setMore] = useState(false);
  const sorted = useMemo(
    () =>
      [...items]
        .filter((i) => i.label.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity)),
    [items, search],
  );
  const rows = more ? sorted : sorted.slice(0, 6);
  const max = Math.max(1, ...items.map((i) => i.value ?? 0));
  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">{label}</span>
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
      <div className="vlb-rows" style={{ height: rows.length * 72 }}>
        {rows.map((i, rank) => (
          <div
            key={i.id}
            className="vlb-row"
            style={{ transform: `translateY(${rank * 72}px)`, height: 72 }}
          >
            <DetailDrawer
              title={i.label}
              trigger={
                <Button
                  variant="ghost"
                  className="h-full w-full justify-start rounded-none px-0 text-left"
                >
                  <Boxes className="size-5 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="mb-2 flex justify-between gap-3">
                      <span className="truncate font-medium">{i.label}</span>
                      <span className="num shrink-0 text-xs">
                        {i.value == null ? "—" : format(i.value)}
                      </span>
                    </span>
                    <span className="block h-2.5 overflow-hidden rounded bg-muted">
                      <span
                        className="vlb-bar block h-full rounded bg-primary"
                        style={{
                          width: i.value == null ? "0%" : `${(Math.max(0, i.value) / max) * 100}%`,
                          animationDelay: `${rank * 55}ms`,
                        }}
                      />
                    </span>
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
      {sorted.length > 6 && (
        <Button variant="ghost" size="sm" className="mt-3" onClick={() => setMore(!more)}>
          <ChevronDown className={more ? "rotate-180" : ""} />
          {more ? "Show less" : `Show ${sorted.length - 6} more`}
        </Button>
      )}
    </div>
  );
}
