import { useState } from "react";
import type { Measure } from "@/lib/api/types";
import { api } from "@/lib/api/client";
import { useApp } from "@/lib/store";
import { decisionGroup } from "@/lib/administration";
import { chf, kg } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { DetailDrawer, DetailBlock } from "./details";
import { RiskBadge } from "./ui";

export type ReviewFilter = "all" | "blocked" | "review";
const groups = [
  ["all", "All decisions", ""],
  ["blocked", "Blocked", "text-destructive"],
  ["review", "Review required", "text-warning"],
] as const;

export function DemoExceptions({ measures }: { measures: Measure[] }) {
  const { s } = useApp();
  const decisions = api.isDemo ? s.demoExceptions : s.simulationDecisions;
  const items = measures.filter((m) => m.risk.level !== "low" || !m.includable || decisions[m.id]);
  return (
    <section id="approvals" className="mt-8 border-t pt-6">
      <h2 className="text-lg font-semibold">
        Approvals &amp; Exceptions{" "}
        {api.isDemo && <span className="text-xs text-warning">DEMO</span>}
      </h2>
      <div className="mt-5 space-y-4">
        {items.map((m) => (
          <article key={m.id} className="rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-medium">{m.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{m.resource}</p>
              </div>
              <RiskBadge level={m.risk.level} />
            </div>
            <p className="mt-3 text-sm">{m.risk.why || "Reason unavailable"}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {m.risk.consequences || "Operational consequences unavailable"}
            </p>
            <p className="my-3 text-xs text-muted-foreground">
              {decisions[m.id]?.approved
                ? "Simulation approved locally"
                : decisions[m.id]
                  ? "Rejected for simulation"
                  : decisionGroup(m) === "blocked"
                    ? "Excluded by the provider"
                    : "Owner review required"}
            </p>
            <RecommendationEvidence measure={m} label="Inspect reason & evidence" />
          </article>
        ))}
      </div>
    </section>
  );
}

export function ApprovalWorkspace({
  measures,
  filter,
  onFilter,
}: {
  measures: Measure[];
  filter: ReviewFilter;
  onFilter: (filter: ReviewFilter) => void;
}) {
  const { s, decideException } = useApp();
  const decisions = api.isDemo ? s.demoExceptions : s.simulationDecisions;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [membership, setMembership] = useState("all");
  const [sort, setSort] = useState("risk");
  const [selectedId, setSelectedId] = useState<string>();
  const [pending, setPending] = useState<Measure | null>(null);
  const [error, setError] = useState("");
  const items = measures.filter((m) => decisionGroup(m) !== null);
  const categories = [...new Set(items.map((m) => m.service))].sort();
  const visible = items
    .filter((m) => {
      const decision = decisions[m.id];
      return (
        (filter === "all" || decisionGroup(m) === filter) &&
        `${m.title} ${m.resource}`.toLowerCase().includes(search.trim().toLowerCase()) &&
        (status === "all" ||
          status === (!decision ? "pending" : decision.approved ? "approved" : "rejected")) &&
        (category === "all" || m.service === category) &&
        (membership === "all" || s.measureIds.includes(m.id) === (membership === "included"))
      );
    })
    .sort((a, b) => {
      if (sort === "cost") return b.savingsChf - a.savingsChf;
      if (sort === "carbon") return b.savingsCo2KgLocation - a.savingsCo2KgLocation;
      return Number(decisionGroup(b) === "blocked") - Number(decisionGroup(a) === "blocked");
    });
  const selected = visible.find((m) => m.id === selectedId) ?? visible[0];
  const decision = selected && decisions[selected.id];
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
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {groups.map(([id, label, color]) => (
          <button
            key={id}
            type="button"
            aria-pressed={filter === id}
            onClick={() => onFilter(id)}
            className={`rounded-lg border bg-card p-2 text-center hover:bg-accent sm:p-4 ${filter === id ? "border-[#C8FA50]" : ""}`}
          >
            <span className={`num block text-2xl font-semibold ${color}`}>
              {id === "all" ? items.length : items.filter((m) => decisionGroup(m) === id).length}
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
      {selected ? (
        <div className="grid min-w-0 gap-3 @2xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <ul
            aria-label="Recommendations"
            className="max-h-80 space-y-1 overflow-y-auto rounded-lg border bg-card p-2 @2xl:max-h-[32rem]"
          >
            {visible.map((m) => (
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
                  <span className="flex flex-wrap items-center gap-1.5">
                    <RiskBadge level={m.risk.level} />
                    {!m.includable && m.risk.level !== "blocked" && (
                      <span className="text-xs text-muted-foreground">Provider excluded</span>
                    )}
                    {decisions[m.id] && (
                      <span className="text-xs text-muted-foreground">
                        {decisions[m.id]?.approved ? "Approved locally" : "Rejected locally"}
                      </span>
                    )}
                  </span>
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
              <RiskBadge level={selected.risk.level} />
            </header>
            <p className="text-sm">{selected.description || selected.change}</p>
            <DetailBlock
              title={
                decisionGroup(selected) === "blocked"
                  ? "Why is it blocked?"
                  : "Why is review required?"
              }
            >
              <p className="text-sm">
                {selected.risk.why || selected.decision?.reason || "Reason unavailable"}
              </p>
            </DetailBlock>
            <DetailBlock title="Operational and business consequences">
              <p className="text-sm">{selected.risk.consequences || "Consequences unavailable"}</p>
            </DetailBlock>
            <p className="text-sm">
              Potential annual savings · {chf(selected.savingsChf)} ·{" "}
              {kg(selected.savingsCo2KgLocation)} location-based CO₂
            </p>
            <p className="text-sm text-muted-foreground">
              {decision
                ? decision.approved
                  ? "Approved for simulation locally."
                  : "Rejected for simulation."
                : "Awaiting a local simulation decision."}{" "}
              {api.isDemo
                ? "Demo calculations are illustrative. Operational restrictions still apply."
                : "The connected backend applies its original eligibility rules. Local approvals cannot include a blocked measure in calculations or qualify it for submission."}
            </p>
            <div className="flex flex-wrap gap-2">
              <RecommendationEvidence measure={selected} label="More information" />
              {s.role === "ceo" && (
                <>
                  {!decision?.approved && (
                    <Button size="sm" onClick={() => setPending(selected)}>
                      {decisionGroup(selected) === "blocked"
                        ? "Unblock for simulation"
                        : "Approve for simulation"}
                    </Button>
                  )}
                  {decision?.approved !== false && (
                    <Button size="sm" variant="outline" onClick={() => record(selected, false)}>
                      Reject / Keep blocked
                    </Button>
                  )}
                  {decision && (
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
          No matching decisions.
        </p>
      )}
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

function RecommendationEvidence({ measure, label }: { measure: Measure; label: string }) {
  return (
    <DetailDrawer
      title={measure.title}
      trigger={
        <Button size="sm" variant="outline">
          {label}
        </Button>
      }
    >
      <DetailBlock title="Original restriction">
        <RiskBadge level={measure.risk.level} />
        <p>{measure.risk.why}</p>
        <p>{measure.includable ? "Backend eligible" : "Backend excluded"}</p>
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
        {measure.assumptions.join(" · ") || "None supplied"}
      </DetailBlock>
      <DetailBlock title="Sources">
        {measure.evidence.length
          ? measure.evidence.map((e) => (
              <p key={e.source + e.detail}>
                {e.source} · {e.detail}
              </p>
            ))
          : "None supplied"}
      </DetailBlock>
      {measure.decision && (
        <DetailBlock title="Backend decision">
          <p>
            {measure.decision.status} · {measure.decision.reason}
          </p>
          <p>{measure.decision.nextStep}</p>
          {measure.decision.replacement && (
            <p>
              Linked measures · {measure.decision.replacement.measureIds.join(", ")}. Maximum annual
              quote {chf(measure.decision.replacement.maxAnnualQuoteChf)} · Remaining CO₂ gap{" "}
              {kg(measure.decision.replacement.remainingCo2GapKg)}.
            </p>
          )}
        </DetailBlock>
      )}
    </DetailDrawer>
  );
}
