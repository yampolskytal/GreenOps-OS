import { useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import type { Evidence } from "@/lib/api/types";
import { formatEvidenceText } from "@/lib/format";
import { AnalyticalInspector } from "./analytical-inspector";
import { Button } from "@/components/ui/button";
export function DetailDrawer({
  title,
  description,
  trigger,
  children,
  fullWidth = false,
}: {
  title: string;
  description?: string;
  trigger: ReactNode;
  children: ReactNode;
  fullWidth?: boolean;
}) {
  return (
    <AnalyticalInspector
      fullWidth={fullWidth}
      title={title}
      {...(description ? { description } : {})}
      trigger={trigger}
    >
      {children}
    </AnalyticalInspector>
  );
}
export function DetailBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      {children}
    </section>
  );
}
export function DetailButton() {
  return (
    <Button variant="ghost" size="sm">
      Details
    </Button>
  );
}

export function EvidenceInfoButton({
  label = "View calculation and evidence",
  description,
  onClick,
}: {
  label?: string;
  description?: string;
  onClick?: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-9 shrink-0 cursor-pointer rounded-full text-muted-foreground hover:bg-primary/15 hover:text-accent-ink"
      aria-label={description ? `${label} for ${description}` : label}
      title={label}
      onClick={onClick}
    >
      <Info aria-hidden className="size-4" />
    </Button>
  );
}

export function EvidenceSources({
  sources,
  title = "Data sources",
}: {
  sources: readonly (string | Evidence)[];
  title?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const preview = 3;
  const records = sources.map((source) =>
    typeof source === "string" ? { source, detail: "" } : source,
  );
  return (
    <DetailBlock title={title}>
      {records.length ? (
        <>
          <ul className="space-y-1">
            {(expanded ? records : records.slice(0, preview)).map((record, index) => (
              <li key={`${record.source}-${index}`} className="break-words text-xs">
                {record.source}
              </li>
            ))}
          </ul>
          <div className="mt-1 flex items-center gap-1">
            {records.length > preview && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-expanded={expanded}
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? "Show fewer sources" : "Show more sources"}
              </Button>
            )}
            <AnalyticalInspector
              title="Source evidence"
              trigger={<EvidenceInfoButton label="View detailed source evidence" />}
            >
              <ul className="space-y-3">
                {records.map(({ source, detail }, index) => (
                  <li key={`${source}-${index}`} className="break-words">
                    <p className="font-medium text-info">{source}</p>
                    {detail && (
                      <p className="text-muted-foreground">{formatEvidenceText(detail)}</p>
                    )}
                  </li>
                ))}
              </ul>
            </AnalyticalInspector>
          </div>
        </>
      ) : (
        <p className="text-muted-foreground">No sources supplied.</p>
      )}
    </DetailBlock>
  );
}
