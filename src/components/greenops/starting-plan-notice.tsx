import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApp, useDisplayedPlan } from "@/lib/store";
import { useMeasures } from "@/lib/queries";
import { useCommitPlan } from "@/lib/use-commit";

export function PlanningProjection({ children }: { children: ReactNode }) {
  const plan = useDisplayedPlan();
  return plan.ready ? <>{children}</> : null;
}
export function StartingPlanNotice({ compact = false }: { compact?: boolean }) {
  const { s, hydrated, retryInitialization } = useApp();
  const plan = useDisplayedPlan();
  const measures = useMeasures();
  const commit = useCommitPlan(measures.data);
  if (!hydrated || ["new", "loading"].includes(s.initialization.status))
    return (
      <section aria-busy="true" className="mb-6 border-y py-5">
        <p role="status" className="text-sm text-muted-foreground">
          Preparing your recommended strategy…
        </p>
        <div aria-hidden="true" className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-12 rounded bg-muted motion-safe:animate-pulse" />
          ))}
        </div>
      </section>
    );
  if (s.initialization.status === "error")
    return (
      <section className="mb-6 border-y py-5">
        <p role="alert" className="text-sm font-medium">
          Your recommendation could not be generated.
        </p>
        <p
          className={
            compact ? "mt-0.5 text-xs text-muted-foreground" : "mt-2 text-sm text-muted-foreground"
          }
        >
          {s.initialization.error} Available baseline data remains unchanged.
        </p>
        <Button variant="outline" className="mt-3" onClick={retryInitialization}>
          <RefreshCw />
          Retry
        </Button>
      </section>
    );
  if (!plan.suggested) return null;
  const candidate = s.initialization.candidate;
  if (!candidate) return null;
  const selected = measures.data?.filter((m) => candidate.measureIds.includes(m.id));
  return (
    <section
      aria-label="Recommended starting plan"
      className={
        compact ? "flex flex-wrap items-center gap-x-4 gap-y-2 border-b pb-3" : "mb-6 border-y py-5"
      }
    >
      <div>
        <h2 className={compact ? "text-sm font-semibold" : "text-lg font-semibold"}>
          Recommended starting plan
        </h2>
        <p
          className={
            compact ? "mt-0.5 text-xs text-muted-foreground" : "mt-2 text-sm text-muted-foreground"
          }
        >
          {candidate.measureIds.length} recommended measures · Balanced · CHF 16,500 budget · 15
          person-days maximum
        </p>
        <p
          className={
            compact ? "mt-0.5 text-xs text-muted-foreground" : "mt-2 text-sm text-muted-foreground"
          }
        >
          {!compact && (
            <>
              {selected
                ? `${selected.filter((m) => m.risk.level === "review" || !!m.risk.approver).length} require human review`
                : "Checking human reviews…"}
              {selected &&
                ` · ${selected.filter((m) => !m.includable || m.risk.level === "blocked").length} blocked`}
              {` · ${candidate.result.excluded.length} excluded`}.{" "}
            </>
          )}
          Suggested strategy awaiting adoption.
        </p>
      </div>
      <div className={compact ? "flex flex-wrap gap-2" : "mt-4 flex flex-wrap gap-2"}>
        <Button
          disabled={commit.pending || !measures.data}
          onClick={() =>
            void commit.commit({
              name: "Recommended starting plan",
              measureIds: candidate.measureIds,
              budgetChf: 16500,
              priority: "balanced",
            })
          }
        >
          <Check />
          {commit.pending ? "Validating…" : "Adopt recommended plan"}
        </Button>
        <Button asChild variant="outline">
          <Link to="/studio" hash="recommended">
            Customize strategy
            <ArrowRight />
          </Link>
        </Button>
      </div>
      {(commit.error || measures.isError) && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {commit.error ?? measures.error?.message}
        </p>
      )}
    </section>
  );
}
