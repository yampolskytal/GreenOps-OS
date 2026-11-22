import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { ResourceSummary } from "@/lib/api/types";
import { formatNumber } from "@/lib/format";
import { AnalyticalInspector } from "./analytical-inspector";
import { ResourceDetails, runtimeHours } from "./resource-details";

export function InfrastructureGrid({
  resources,
  selectedId,
  onSelect,
}: {
  resources: ResourceSummary[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = resources.find((resource) => resource.id === selectedId);
  if (!resources.length)
    return <p className="py-8 text-muted-foreground">No resources match the selected filters.</p>;
  return (
    <section aria-label="Infrastructure resources" className="@container">
      <ul
        aria-label="Resources"
        className="grid grid-cols-1 gap-2 @lg:grid-cols-2 @3xl:grid-cols-3 @5xl:grid-cols-4"
      >
        {resources.map((r) => (
          <li key={r.id} className="min-w-0">
            <button
              type="button"
              id={`res-${r.id}`}
              aria-label={`View resource ${r.name} · ${r.id}`}
              aria-pressed={selectedId === r.id}
              onClick={() => {
                onSelect(r.id);
                setOpen(true);
              }}
              className="grid h-full w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] content-start items-start gap-x-2 gap-y-1.5 rounded-lg border bg-card px-3 py-2.5 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring aria-pressed:border-accent-ink"
            >
              <span className="truncate text-sm font-medium" title={r.name}>
                {r.name}
              </span>
              <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
              <span
                className="col-span-2 truncate text-xs text-muted-foreground"
                title={`${r.id} · ${r.provider} · ${r.environment}`}
              >
                {r.id} · {r.provider} · {r.environment}
              </span>
              <span className="col-span-2 flex flex-wrap items-baseline gap-x-2 text-xs">
                <span className="num">Runtime {runtimeHours(r.runtimeH30d)}</span>
                {r.cpuAvgPct != null && (
                  <span className="num text-muted-foreground">
                    CPU {formatNumber(r.cpuAvgPct)}%
                  </span>
                )}
                {r.cpuAvgPct == null && r.gpuAvgPct != null && (
                  <span className="num text-muted-foreground">
                    GPU {formatNumber(r.gpuAvgPct)}%
                  </span>
                )}
              </span>
              <span
                className={`col-span-2 justify-self-start whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium capitalize ${r.criticality === "high" || r.flag ? "bg-warning/10 text-warning" : "bg-muted text-muted-foreground"}`}
                title={r.flag ?? `${r.criticality} criticality`}
              >
                {r.criticality} criticality{r.flag && " · flagged"}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <AnalyticalInspector
        title={selected?.name ?? "Resource evidence"}
        trigger={null}
        open={open}
        onOpenChange={setOpen}
        contentKey={selected?.id ?? ""}
      >
        {selected ? (
          <ResourceDetails key={selected.id} resource={selected} />
        ) : (
          <p>Select a resource to see its evidence.</p>
        )}
      </AnalyticalInspector>
    </section>
  );
}
