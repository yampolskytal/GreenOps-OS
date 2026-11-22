import { useState } from "react";
import type { Measure } from "@/lib/api/types";
import { api } from "@/lib/api/client";
import { useApp } from "@/lib/store";
import { decisionGroup } from "@/lib/administration";
import { carbonMass, chf, formatEvidenceText, kg, kwh } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { DetailBlock, EvidenceSources } from "./details";
import { AnalyticalInspector } from "./analytical-inspector";
import { CheckCircle2 } from "lucide-react";
import { RiskBadge } from "./ui";

type ReviewFilter = "all" | "blocked" | "review" | "unblocked";
const groups = [
  ["all", "All decisions", ""],
  ["blocked", "Blocked", "text-destructive"],
  ["review", "Review required", "text-warning"],
  ["unblocked", "Unblocked", "text-success"],
] as const;

export function ApprovalWorkspace({ measures }: { measures: Measure[] }) {
  const { s, decideException } = useApp();
  const decisions = api.isDemo ? s.demoExceptions : s.simulationDecisions;
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [membership, setMembership] = useState("all");
  const [sort, setSort] = useState("risk");
  const [selectedId, setSelectedId] = useState<string>();
  const [pending, setPending] = useState<Measure | null>(null);
  const [error, setError] = useState("");
  const items = measures.flatMap((measure) => {
    const original = decisionGroup(measure);
    if (original == null) return [];
    const decision = decisions[measure.id];
    const effective = decision?.approved ? ("unblocked" as const) : original;
    return [{ measure, original, decision, effective }];
  });
  const categories = [...new Set(items.map(({ measure }) => measure.service))].sort();
  const term = search.trim().toLowerCase();
  const matching = items.filter(
    ({ measure: m, decision }) =>
      `${m.title} ${m.resource}`.toLowerCase().includes(term) &&
      (status === "all" ||
        status === (!decision ? "pending" : decision.approved ? "approved" : "rejected")) &&
      (category === "all" || m.service === category) &&
      (membership === "all" || s.measureIds.includes(m.id) === (membership === "included")),
  );
  const rank = { blocked: 0, review: 1, unblocked: 2 };
  const visible = matching
    .filter(({ effective }) => filter === "all" || effective === filter)
    .sort((a, b) => {
      if (sort === "cost") return b.measure.savingsChf - a.measure.savingsChf;
      if (sort === "carbon") return b.measure.savingsCo2KgLocation - a.measure.savingsCo2KgLocation;
      return rank[a.effective] - rank[b.effective];
    });
  const selection = visible.find(({ measure }) => measure.id === selectedId) ?? visible[0];
  const selected = selection?.measure;
  // Commit the fallback so changing filters again does not resurrect an old selection.
  if (selected?.id !== selectedId) setSelectedId(selected?.id);
  const record = (m: Measure, approved: boolean | null) => {
    try {
      decideException(m.id, m.risk.why, approved, !api.isDemo);
      setError("");
      setPending(null);
    } catch {
      setError("The decision could not be saved on this device.");
      setPending(null);
    }
  };
  return (
    <section id="approvals" className="@container space-y-4">
      <div className="grid grid-cols-2 gap-2 @xl:grid-cols-4 @xl:gap-3">
        {groups.map(([id, label, color]) => (
          <button
            key={id}
            type="button"
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
            className={`rounded-lg border bg-card p-2 text-center hover:bg-accent sm:p-4 ${filter === id ? "border-accent-ink bg-primary/10" : ""}`}
          >
            <span className={`num block text-2xl font-semibold ${color}`}>
              {id === "all"
                ? matching.length
                : matching.filter(({ effective }) => effective === id).length}
            </span>
            <span className="text-xs">{label}</span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-2">
        <Input
          aria-label="Search recommendations"
          placeholder="Name or resource"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <ApprovalSelect
          label="Decision status"
          value={status}
          onChange={setStatus}
          options={[
            ["all", "Any decision"],
            ["pending", "Undecided"],
            ["approved", "Approved locally"],
            ["rejected", "Rejected"],
          ]}
        />
        <ApprovalSelect
          label="Resource category"
          value={category}
          onChange={setCategory}
          options={[["all", "All categories"], ...categories.map((name) => [name, name] as const)]}
        />
        <ApprovalSelect
          label="Current Plan membership"
          value={membership}
          onChange={setMembership}
          options={[
            ["all", "Any membership"],
            ["included", "In Current Plan"],
            ["excluded", "Outside Current Plan"],
          ]}
        />
        <ApprovalSelect
          label="Sort recommendations"
          value={sort}
          onChange={setSort}
          options={[
            ["risk", "Risk"],
            ["cost", "Financial impact"],
            ["carbon", "CO₂ impact"],
          ]}
        />
      </div>
      {selected && selection ? (
        <div className="grid min-w-0 gap-3 @2xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <ul
            aria-label="Recommendations"
            className="max-h-80 space-y-1 overflow-y-auto rounded-lg border bg-card p-2 @2xl:max-h-[32rem]"
          >
            {visible.map(({ measure: m, effective, original }) => (
              <li key={m.id}>
                <button
                  type="button"
                  aria-pressed={selected.id === m.id}
                  onClick={() => setSelectedId(m.id)}
                  className="w-full rounded-md border border-transparent p-2 text-left text-sm hover:bg-accent aria-pressed:border-primary aria-pressed:bg-accent"
                >
                  <span className="block break-words font-medium">{m.title}</span>
                  <span className="my-1 block break-words text-xs text-muted-foreground">
                    {m.resource}
                  </span>
                  <DecisionBadge effective={effective} original={original} />
                </button>
              </li>
            ))}
          </ul>
          <article className="min-w-0 space-y-4 break-words rounded-lg border bg-card p-4">
            <header className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="font-semibold">{selected.title}</h2>
                <p className="text-sm text-muted-foreground">{selected.resource}</p>
              </div>
              <DecisionBadge effective={selection.effective} original={selection.original} />
            </header>
            <p className="text-sm">{selected.description || selected.change}</p>
            <DetailBlock
              title={
                selection.original === "blocked"
                  ? "Original restriction"
                  : "Why is review required?"
              }
            >
              <p className="text-sm">
                {selected.risk.why || selected.decision?.reason || "Reason unavailable"}
              </p>
              {selected.risk.consequences && (
                <p className="mt-1 text-sm text-muted-foreground">{selected.risk.consequences}</p>
              )}
            </DetailBlock>
            <DetailBlock title="Potential annual impact">
              <p className="text-sm">
                {chf(selected.savingsChf)} · {kg(selected.savingsCo2KgLocation)} location-based CO₂
                · {kwh(selected.savingsKwh)}
              </p>
              {selected.savingsCo2KgMarket != null && (
                <p className="text-sm">
                  {carbonMass(selected.savingsCo2KgMarket, "kg CO₂e")} market-based
                  {selected.marketCoverage?.status === "partial" ? " · covered subtotal" : ""}
                </p>
              )}
            </DetailBlock>
            <p className="text-sm text-muted-foreground">
              {selection.decision?.approved === false && "Previous simulation decision declined. "}
              {api.isDemo
                ? "Original restrictions still apply. Demo projections are illustrative."
                : !selected.includable || selected.risk.level === "blocked"
                  ? "The backend excludes this measure under its original restrictions."
                  : "Original operational approvals and submission checks still apply."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setEvidenceOpen(true)}>
                More information
              </Button>
              {s.role === "ceo" && (
                <>
                  {!selection.decision?.approved && (
                    <Button size="sm" onClick={() => setPending(selected)}>
                      {selection.original === "blocked"
                        ? "Unblock for simulation"
                        : "Confirm review for simulation"}
                    </Button>
                  )}
                  {selection.decision && (
                    <Button size="sm" variant="ghost" onClick={() => record(selected, null)}>
                      Revoke decision
                    </Button>
                  )}
                </>
              )}
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </article>
        </div>
      ) : (
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">
          No matching decisions. Change the status or clear a filter.
        </p>
      )}
      <AnalyticalInspector
        title={selected?.title ?? "Recommendation evidence"}
        trigger={null}
        open={evidenceOpen}
        onOpenChange={setEvidenceOpen}
        contentKey={selected?.id ?? ""}
      >
        {selected ? (
          <RecommendationEvidence key={selected.id} measure={selected} />
        ) : (
          <p>No matching recommendation selected.</p>
        )}
      </AnalyticalInspector>
      <Dialog
        open={pending != null && s.role === "ceo"}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm simulation decision?</DialogTitle>
            <DialogDescription>
              {pending?.title}. This saves a local planning decision. Original restrictions and
              submission eligibility still apply.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (pending && s.role === "ceo") record(pending, true);
              }}
            >
              Confirm simulation decision
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ApprovalSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      aria-label={label}
      className="h-9 min-w-0 rounded-md border bg-card px-2 text-sm"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map(([id, text]) => (
        <option key={id} value={id}>
          {text}
        </option>
      ))}
    </select>
  );
}

function DecisionBadge({
  effective,
  original,
}: {
  effective: "blocked" | "review" | "unblocked";
  original: "blocked" | "review";
}) {
  if (effective !== "unblocked") return <RiskBadge level={effective} />;
  return (
    <span className="risk-badge inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded border border-success/40 bg-success/10 px-1.5 text-[10px] font-semibold text-success">
      <CheckCircle2 aria-hidden className="size-3 shrink-0" />
      {original === "blocked" ? "Unblocked" : "Review confirmed"} · simulation only
    </span>
  );
}

function RecommendationEvidence({ measure }: { measure: Measure }) {
  return (
    <>
      <DetailBlock title="Original restriction">
        <RiskBadge level={measure.risk.level} />
        <p>{measure.risk.why}</p>
        <p>
          {measure.includable && measure.risk.level !== "blocked"
            ? "Backend eligible"
            : "Backend excluded"}
        </p>
      </DetailBlock>
      <DetailBlock title="Resource, change and consequences">
        <p>
          {measure.resource} · {measure.change}
        </p>
        <p>{measure.risk.consequences}</p>
      </DetailBlock>
      <DetailBlock title="Protection windows">
        {measure.risk.protectionWindows.join(" · ") || "None supplied"}
      </DetailBlock>
      <DetailBlock title="Required approvals">
        {measure.risk.approver || "None supplied"}
      </DetailBlock>
      <DetailBlock title="Dependencies and conflicts">
        {measure.risk.conflicts.join(" · ") || "None supplied"}
      </DetailBlock>
      <DetailBlock title="Assumptions">
        {formatEvidenceText(measure.assumptions.join(" · ")) || "None supplied"}
      </DetailBlock>
      {measure.decision && (
        <DetailBlock title="Backend decision">
          <p>
            {measure.decision.status} · {formatEvidenceText(measure.decision.reason)}
          </p>
          <p>{measure.decision.nextStep && formatEvidenceText(measure.decision.nextStep)}</p>
          {measure.decision.replacement && (
            <p>
              Linked measures · {measure.decision.replacement.measureIds.join(", ")}. Maximum annual
              quote {chf(measure.decision.replacement.maxAnnualQuoteChf)} · Remaining CO₂ gap{" "}
              {kg(measure.decision.replacement.remainingCo2GapKg)}.
            </p>
          )}
        </DetailBlock>
      )}
      <EvidenceSources sources={measure.evidence} />
    </>
  );
}
