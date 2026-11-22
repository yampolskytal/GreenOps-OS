// Adapted from uploaded EstimatedDateBadge: compact status card, chevron, animated expansion and traced border.
import { useState, useEffect } from "react";
import { ChevronDown, Plus, Check, Lock } from "lucide-react";
import type { Measure } from "@/lib/api/types";
import { chf, formatEvidenceText, kg, kwh } from "@/lib/format";
import { useApp } from "@/lib/store";
import { Link, useRouterState } from "@tanstack/react-router";
import { canSelectMeasure } from "@/lib/planning";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { RiskBadge } from "./ui";
import { PathMembership } from "./path-membership";
import { DetailBlock, DetailDrawer, EvidenceSources } from "./details";

function footprintAmount(value: number, unit: string, format: typeof kg) {
  const magnitude = Math.abs(value);
  return magnitude >= 1
    ? format(magnitude)
    : `${magnitude < 0.01 ? "<0.01" : magnitude.toFixed(2)} ${unit}`;
}

export function MeasureCard({
  m,
  compact = false,
  bulkSelected,
  onBulkToggle,
  readOnly = false,
}: {
  m: Measure;
  compact?: boolean;
  bulkSelected?: boolean;
  onBulkToggle?: (value: boolean) => void;
  readOnly?: boolean;
}) {
  const { s } = useApp();
  const [open, setOpen] = useState(false);
  const hash = useRouterState({ select: (r) => r.location.hash });
  const committed = s.measureIds.includes(m.id);
  const inPlan = committed;
  const pathNames = s.paths.filter((p) => p.measureIds.includes(m.id)).map((p) => p.name);
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
  const exception = s.demoExceptions[m.id]?.approved;
  const decision = m.decision;
  const evidenceOnly = decision?.status === "evidence-needed" || decision?.status === "no-benefit";
  const quote = decision?.replacement;
  const impact = [
    m.savingsChf !== 0 &&
      `${chf(Math.abs(m.savingsChf))} ${m.savingsChf > 0 ? "saved" : "added cost"}/year`,
    m.savingsCo2KgLocation !== 0 &&
      `${footprintAmount(m.savingsCo2KgLocation, "kg", kg)} CO₂e/year ${m.savingsCo2KgLocation > 0 ? "avoided" : "added"}`,
    m.savingsKwh !== 0 &&
      `${footprintAmount(m.savingsKwh, "kWh", kwh)}/year ${m.savingsKwh > 0 ? "saved" : "added"}`,
    !m.savingsCo2KgLocation &&
      !!m.savingsCo2KgMarket &&
      `${footprintAmount(m.savingsCo2KgMarket, "kg", kg)} market-based CO₂e/year ${m.savingsCo2KgMarket > 0 ? "avoided" : "added"}`,
  ].filter(Boolean);
  const details = (
    <div className="space-y-5">
      <DetailBlock title={evidenceOnly ? "What to verify" : "Proposed change"}>
        <p>{m.change}</p>
      </DetailBlock>
      {decision && (
        <DetailBlock title="Planning decision">
          <p>{decision.reason}</p>
          {decision.nextStep && <p className="mt-2">{decision.nextStep}</p>}
          {decision.scopedAnnualCostChf != null && (
            <p className="mt-2">
              Observed annual billed subtotal · {chf(decision.scopedAnnualCostChf)}
            </p>
          )}
          {quote && (
            <p className="mt-2">
              {quote.couldMeetTargets && quote.maxAnnualQuoteChf != null
                ? `The tested swap could meet both targets at ${chf(quote.maxAnnualQuoteChf)} per year or less, assuming the estimated rollout cost and equivalent service.`
                : quote.remainingCo2GapKg > 0
                  ? `The tested swap would still need ${kg(quote.remainingCo2GapKg)} CO₂e/year of additional savings.`
                  : "The tested swap falls short with a nonnegative quote."}
            </p>
          )}
        </DetailBlock>
      )}
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
          {evidenceOnly
            ? "For investigation."
            : blocked
              ? "Blocked as proposed"
              : m.risk.level === "review"
                ? "Pending human review; selection is not approval."
                : "Planning only; no infrastructure changes have been executed."}
        </p>
      </DetailBlock>
      <DetailBlock title="Assumptions & conflicting evidence">
        <ul className="space-y-2">
          {[...(m.assumptions ?? []), ...(m.risk.conflicts ?? [])].map((x) => (
            <li key={x}>{formatEvidenceText(x)}</li>
          ))}
        </ul>
      </DetailBlock>
      <EvidenceSources sources={m.evidence} />
    </div>
  );
  return (
    <article
      id={`measure-${m.id}`}
      className={cn(
        "recommendation card-elevated relative",
        inPlan && "border-primary",
        blocked && "border-destructive/40",
      )}
    >
      <div
        className={cn(
          "relative grid min-w-0 items-center gap-x-4 gap-y-2 px-4 py-3",
          !compact && "lg:grid-cols-[minmax(0,1fr)_auto]",
        )}
      >
        <Button
          variant="ghost"
          className="h-auto min-w-0 flex-1 justify-between whitespace-normal p-0 text-left hover:bg-transparent"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <span className="min-w-0 break-words">
            <span className="block text-xs text-muted-foreground">
              {m.resource} · {m.service}
            </span>
            <span className="mt-1 block font-semibold">{m.title}</span>
            <span className="mt-1 block text-xs font-normal text-muted-foreground">
              {evidenceOnly ||
              decision?.status === "protected" ||
              decision?.status === "prerequisite"
                ? decision?.reason
                : [...impact, `${m.effortPersonDays} person-days`].join(" · ")}
            </span>
          </span>
          <ChevronDown
            className={cn(
              "mr-1 size-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </Button>
        <div className={cn("flex flex-wrap items-center gap-2", !compact && "lg:justify-end")}>
          {evidenceOnly ? (
            <span className="text-xs text-muted-foreground">
              {decision?.status === "evidence-needed" ? "Needs evidence" : "No modeled benefit"}
            </span>
          ) : (
            <RiskBadge level={m.risk.level} />
          )}
          {exception && (
            <span className="text-xs text-warning">Demo exception approved · conditional</span>
          )}
          <span className="text-xs text-muted-foreground">
            {[
              committed ? "In Current Plan" : null,
              pathNames.length ? `Paths: ${pathNames.join(", ")}` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "Not in any Path"}
          </span>
        </div>
        <div className={cn("flex flex-wrap gap-2", !compact && "lg:col-span-2 lg:justify-end")}>
          {onBulkToggle && !evidenceOnly && (
            <label className="mr-auto inline-flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={!!bulkSelected}
                onCheckedChange={(v) => onBulkToggle(v === true)}
              />
              Select
            </label>
          )}
          {blocked && !evidenceOnly && (
            <span className="inline-flex items-center gap-1 text-xs text-destructive">
              <Lock className="size-3" />{" "}
              {exception
                ? "Conditional DEMO exception — not real authorization"
                : "Blocked — hypothetical Path opportunity only"}
            </span>
          )}
          {!readOnly && !evidenceOnly && <PathMembership measureIds={[m.id]} />}
          {!onBulkToggle && !readOnly && (
            <Button size="sm" variant="ghost" asChild>
              <Link to="/studio" hash={`measure-${m.id}`}>
                {inPlan ? <Check /> : <Plus />}
                Review optimization
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
            {!compact && !evidenceOnly && (
              <p className="text-xs text-muted-foreground">
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
