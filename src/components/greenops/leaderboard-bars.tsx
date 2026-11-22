// Adapted from the supplied 21st.dev LeaderboardBars: rank translation, grow-in and hover focus retained.
import { useMemo, useState } from "react";
import { Search, Boxes } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DetailDrawer, EvidenceInfoButton } from "./details";
export interface ComparisonItem {
  id: string;
  label: string;
  value: number | null;
  detail?: string;
  shareLabel?: string;
  content?: React.ReactNode;
}
export function LeaderboardBars({
  items,
  format,
  label,
  methodologyIcon = false,
}: {
  items: ComparisonItem[];
  format: (n: number) => string;
  label: string;
  methodologyIcon?: boolean;
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
  const values = items.flatMap(({ value }) =>
    value != null && Number.isFinite(value) ? [value] : [],
  );
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  return (
    <div>
      <div className="mb-5 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <DetailDrawer
          title="Attribution methodology"
          trigger={
            methodologyIcon ? (
              <EvidenceInfoButton description="regional attribution" />
            ) : (
              <Button variant="ghost" size="sm">
                Methodology
              </Button>
            )
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
        Shared scale with a common zero: {format(min)}–{format(max)} · Unavailable values have no
        fill
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
                    <span className="block">
                      {i.value == null ? "Unavailable" : format(i.value)}
                    </span>
                    {i.shareLabel && (
                      <span className="block text-muted-foreground">{i.shareLabel}</span>
                    )}
                  </span>
                  <span
                    data-comparison-track
                    data-value={i.value ?? "unavailable"}
                    data-maximum={max}
                    className="relative col-span-3 block h-2.5 w-full overflow-hidden rounded bg-muted"
                  >
                    <span
                      className="vlb-bar absolute inset-y-0 rounded bg-primary"
                      style={{
                        left: `${((Math.min(0, i.value ?? 0) - min) / span) * 100}%`,
                        width: `${(Math.abs(i.value ?? 0) / span) * 100}%`,
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
