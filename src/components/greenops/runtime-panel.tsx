import { useId, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, ChevronUp } from "lucide-react";
import type { ResourceSummary } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { ChartCard } from "./ui";
import { DetailDrawer } from "./details";
import { ResourceDetails } from "./resource-details";

const INITIAL_RESOURCES = 6;

export function RuntimePanel({ resources }: { resources: ResourceSummary[] }) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const hash = useRouterState({ select: (r) => r.location.hash.replace(/^#/, "") });
  const items = [...resources].sort((a, b) =>
    Number(b.activeH30d != null) - Number(a.activeH30d != null) ||
    (b.runtimeH30d ?? -1) - (a.runtimeH30d ?? -1) || a.id.localeCompare(b.id),
  );
  const visible = items.filter((r, index) => expanded || index < INITIAL_RESOURCES || hash === `res-${r.id}`);
  const initiallyHidden = items.slice(INITIAL_RESOURCES).filter((r) => hash !== `res-${r.id}`).length;

  return (
    <ChartCard title="Runtime versus active use" subtitle="Select a resource to see its usage, consumption and safety checks.">
      <ul id={listId} className="space-y-2">
        {visible.map((r) => (
          <li key={r.id}>
            <DetailDrawer
              fullWidth
              title={r.name}
              trigger={
                <Button variant="ghost" id={`res-${r.id}`} data-runtime-resource={r.id}
                  className="flex h-auto w-full justify-between gap-3 whitespace-normal rounded-lg border px-4 py-3 text-left">
                  <span className="min-w-0">
                    <span className="block break-words font-medium">{r.name}</span>
                    <span className="block break-words text-xs text-muted-foreground">{r.id} · {r.provider} · {r.environment}</span>
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                </Button>
              }
            >
              <ResourceDetails resource={r} />
            </DetailDrawer>
          </li>
        ))}
      </ul>
      {initiallyHidden > 0 && (
        <Button variant="outline" size="sm" className="mt-3" aria-expanded={expanded} aria-controls={listId}
          onClick={() => setExpanded((value) => !value)}>
          {expanded ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
          {expanded ? "Show fewer resources" : `Show ${initiallyHidden} more resources`}
        </Button>
      )}
      {!items.length && <p className="py-8 text-muted-foreground">No resources match the selected filters.</p>}
    </ChartCard>
  );
}
