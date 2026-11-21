// Adapted from uploaded EstimatedDateBadge: compact status card, chevron, animated expansion and traced border.
import { useState, useEffect } from "react";
import { ChevronDown, Plus, Check, Lock } from "lucide-react";
import type { Measure } from "@/lib/api/types";
import { chf, kg, kwh } from "@/lib/format";
import { useApp } from "@/lib/store";
import { Link, useRouterState } from "@tanstack/react-router";
import { canSelectMeasure } from "@/lib/planning";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RiskBadge } from "./ui";
import { PathMembership } from "./path-membership";
import { DetailBlock, DetailDrawer } from "./details";
export function MeasureCard({
  m,
  compact = false,
  selected,
  onToggle,
}: {
  m: Measure;
  compact?: boolean;
  selected?: boolean;
  onToggle?: () => void;
}) {
  const { s } = useApp();
  const [open, setOpen] = useState(false);
  const hash = useRouterState({ select: (r) => r.location.hash });
  const committed = s.measureIds.includes(m.id);
  const inPlan = selected ?? committed;
  useEffect(() => {
    const inspect = () => {
      if (window.location.hash === `#measure-${m.id}`) {
        setOpen(true);
        setTimeout(
          () => document.getElementById(`measure-${m.id}`)?.scrollIntoView({ block: "start" }),
          80,
        );
      }
    };
    inspect();
    window.addEventListener("hashchange", inspect);
    return () => window.removeEventListener("hashchange", inspect);
  }, [m.id, hash]);
  const blocked = !canSelectMeasure(m);
  const details = (
    <div className="space-y-5">
      <DetailBlock title="Recommended change">
        <p>{m.change}</p>
      </DetailBlock>
      <DetailBlock title="Why & possible consequences">
        <p>{m.risk.why || "Reason not supplied"}</p>
        <p className="mt-2 text-muted-foreground">{m.risk.consequences}</p>
      </DetailBlock>
      <DetailBlock title="Dependencies & protection windows">
        <p>
          {(m.risk.protectionWindows ?? []).join(" · ") ||
            "No windows supplied — confirm before implementation."}
        </p>
      </DetailBlock>
      <DetailBlock title="Human approval">
        <p>{m.risk.approver ?? "Approver not specified; confirm responsibility."}</p>
        <p className="mt-1 text-muted-foreground">
          {blocked
            ? "Blocked as proposed"
            : m.risk.level === "review"
              ? "Pending human review; selection is not approval."
              : "Planning only; no infrastructure changes have been executed."}
        </p>
      </DetailBlock>
      <DetailBlock title="Assumptions & conflicting evidence">
        <ul className="space-y-2">
          {[...(m.assumptions ?? []), ...(m.risk.conflicts ?? [])].map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </DetailBlock>
      <DetailBlock title="Source evidence">
        {(m.evidence ?? []).length ? (
          m.evidence.map((e) => (
            <div key={e.source + e.detail} className="mb-3">
              <p className="num break-words text-xs text-info">{e.source}</p>
              <p className="mt-1 text-muted-foreground">{e.detail}</p>
            </div>
          ))
        ) : (
          <p>Unavailable</p>
        )}
      </DetailBlock>
    </div>
  );
  return (
    <article
      id={`measure-${m.id}`}
      className={cn(
        "recommendation relative rounded-lg border bg-card",
        inPlan && "border-primary",
        blocked && "border-destructive/40",
      )}
    >
      <div className="relative grid min-w-0 gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <Button
          variant="ghost"
          className="h-auto min-w-0 flex-1 justify-between whitespace-normal p-0 text-left hover:bg-transparent"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <span>
            <span className="block text-xs text-muted-foreground">
              {m.resource} · {m.service}
            </span>
            <span className="mt-1 block font-semibold">{m.title}</span>
            <span className="mt-1 block text-xs font-normal text-muted-foreground">
              Annual savings: {chf(m.savingsChf)} · Annual CO₂ reduction:{" "}
              {kg(m.savingsCo2KgLocation)} · Implementation effort: {m.effortPersonDays} person-days
            </span>
          </span>
          <ChevronDown className={cn("shrink-0 transition-transform", open && "rotate-180")} />
        </Button>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <RiskBadge level={m.risk.level} />
          <span className="text-xs text-muted-foreground">
            {selected === undefined
              ? committed
                ? "In Current Plan"
                : "Not selected"
              : committed && selected
                ? "In both"
                : committed
                  ? "In Current Plan"
                  : selected
                    ? "In Preview only"
                    : "Not selected"}
          </span>
        </div>
        <div className="flex flex-wrap gap-2 sm:col-span-2 sm:justify-end">
          <PathMembership measureId={m.id} />
          {onToggle ? (
            <Button
              size="sm"
              variant={inPlan ? "default" : "outline"}
              disabled={blocked}
              onClick={onToggle}
            >
              {blocked ? <Lock /> : inPlan ? <Check /> : <Plus />}
              {blocked ? "Blocked" : inPlan ? "Remove from Preview" : "Add to Preview"}
            </Button>
          ) : (
            <Button size="sm" variant="outline" asChild>
              <Link to="/studio" hash={`measure-${m.id}`}>
                {blocked ? <Lock /> : inPlan ? <Check /> : <Plus />}
                {blocked ? "Blocked" : inPlan ? "In Current Plan" : "Preview measure"}
              </Link>
            </Button>
          )}
        </div>
      </div>
      {open && (
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
          aria-hidden="true"
        >
          <rect
            x="1"
            y="1"
            width="calc(100% - 2px)"
            height="calc(100% - 2px)"
            rx="8"
            fill="none"
            stroke="var(--border)"
            strokeWidth="1"
            pathLength="1"
            className="sliding-line"
          />
        </svg>
      )}
      <div className={cn("details-section", open && "open")}>
        <div className="details-content">
          <div className="space-y-3 border-t px-4 py-4">
            <p className="text-sm text-muted-foreground">{m.description}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <DetailBlock title="Recommendation">
                <p className="text-sm">{m.change}</p>
              </DetailBlock>
              <DetailBlock title="Safety review">
                <p className="text-sm">{m.risk.why || "Reason not supplied"}</p>
              </DetailBlock>
            </div>
            {!compact && (
              <p className="text-xs text-muted-foreground">
                Energy benefit: {kwh(m.savingsKwh)}/yr ·{" "}
                {(m.risk.protectionWindows ?? []).join(" · ") || "Protection windows not specified"}
              </p>
            )}
            <DetailDrawer
              title={m.title}
              trigger={
                <Button variant="outline" size="sm">
                  View Full Details
                </Button>
              }
            >
              {details}
            </DetailDrawer>
          </div>
        </div>
      </div>
    </article>
  );
}
