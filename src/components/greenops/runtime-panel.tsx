import { useId, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, ChevronUp } from "lucide-react";
import type { ResourceSummary } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { ChartCard } from "./ui";
import { DetailDrawer } from "./details";
import { ResourceDetails, runtimeHours } from "./resource-details";

const INITIAL_RESOURCES = 6;

export function RuntimePanel({
  resources,
  selectedId,
  onResourceSelect,
  expanded: expandedProp,
  onExpandedChange,
}: {
  resources: ResourceSummary[];
  selectedId?: string | undefined;
  onResourceSelect?: (id: string) => void;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}) {
  const [localExpanded, setExpanded] = useState(false);
  const expanded = expandedProp ?? localExpanded;
  const listId = useId();
  const hash = useRouterState({ select: (r) => r.location.hash.replace(/^#/, "") });
  const items = [...resources].sort(
    (a, b) =>
      Number(b.activeH30d != null) - Number(a.activeH30d != null) ||
      (b.runtimeH30d ?? -1) - (a.runtimeH30d ?? -1) ||
      a.id.localeCompare(b.id),
  );
  const isSelected = (r: ResourceSummary) => selectedId === r.id || hash === `res-${r.id}`;
  const visible = items.filter(
    (r, index) => expanded || index < INITIAL_RESOURCES || isSelected(r),
  );
  const initiallyHidden = items.slice(INITIAL_RESOURCES).filter((r) => !isSelected(r)).length;

  return (
    <ChartCard
      title="Runtime versus active use"
      subtitle="Select a resource to see its usage, consumption and safety checks."
    >
      <ul id={listId} className="@container space-y-1">
        {visible.map((r) => (
          <li key={r.id}>
            <DetailDrawer
              fullWidth
              title={r.name}
              trigger={
                <Button
                  variant="ghost"
                  id={`res-${r.id}`}
                  data-runtime-resource={r.id}
                  aria-pressed={selectedId === r.id}
                  onClick={() => onResourceSelect?.(r.id)}
                  className="grid h-auto w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 whitespace-normal border-b px-3 py-2 text-left aria-pressed:bg-accent @xl:grid-cols-[minmax(0,1fr)_8.5rem_8.5rem_auto]"
                >
                  <span className="col-start-1 row-start-1 min-w-0">
                    <span className="block break-words font-medium">{r.name}</span>
                    <span className="block break-words text-xs text-muted-foreground">
                      {r.id} · {r.provider} · {r.environment}
                    </span>
                  </span>
                  <span className="num col-start-1 row-start-2 text-xs text-muted-foreground @xl:col-start-2 @xl:row-start-1">
                    Running · {runtimeHours(r.runtimeH30d)}
                  </span>
                  <span className="num col-start-1 row-start-3 text-xs text-muted-foreground @xl:col-start-3 @xl:row-start-1">
                    Recorded active · {runtimeHours(r.activeH30d)}
                  </span>
                  <ChevronRight
                    className="col-start-2 row-start-1 size-4 text-muted-foreground @xl:col-start-4"
                    aria-hidden="true"
                  />
                </Button>
              }
            >
              <ResourceDetails resource={r} />
            </DetailDrawer>
          </li>
        ))}
      </ul>
      {initiallyHidden > 0 && (
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => {
            (onExpandedChange ?? setExpanded)(!expanded);
          }}
        >
          {expanded ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
          {expanded ? "Show fewer resources" : `Show ${initiallyHidden} more resources`}
        </Button>
      )}
      {!items.length && (
        <p className="py-8 text-muted-foreground">No resources match the selected filters.</p>
      )}
    </ChartCard>
  );
}
