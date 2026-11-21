import { useState } from "react";
import type { Measure } from "@/lib/api/types";
import { api } from "@/lib/api/client";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { DetailDrawer, DetailBlock } from "./details";
import { RiskBadge } from "./ui";

export function DemoExceptions({ measures }: { measures: Measure[] }) {
  const { s, decideException } = useApp();
  const [pending, setPending] = useState<Measure | null>(null);
  const items = measures.filter((m) => m.risk.level !== "low" || !m.includable);
  return (
    <section id="approvals" className="mt-8 border-t pt-6">
      <h2 className="text-lg font-semibold">
        Approvals & Exceptions {api.isDemo && <span className="text-xs text-warning">DEMO</span>}
      </h2>
      <p className="mt-2 text-xs text-muted-foreground">
        {api.isDemo ? "Simulation decisions only. Exceptions never authorize real changes." : "Review the operational restrictions with the resource owner. Exporting a proposal does not authorize implementation."}
      </p>
      <div className="mt-5 space-y-4">
        {items.map((m) => {
          const decision = api.isDemo ? s.demoExceptions[m.id] : undefined;
          return (
            <article key={m.id} className="rounded-lg border bg-card p-4">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                <div className="min-w-0">
                  <h3 className="font-medium">{m.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{m.resource}</p>
                </div>
                <RiskBadge level={m.risk.level} />
              </div>
              <p className="mt-3 text-sm">{m.risk.why || "Reason unavailable"}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {m.risk.consequences || "Operational consequences not supplied"}
              </p>
              <p
                className={`mt-3 text-xs ${decision?.approved ? "text-warning" : "text-muted-foreground"}`}
              >
                {decision?.approved
                  ? "Demo exception approved — conditional proposal"
                  : decision
                    ? "Kept blocked / exception revoked"
                     : api.isDemo ? "No demo decision" : !m.includable || m.risk.level === "blocked" ? "Blocked from implementation" : "Owner review required"}
                {decision
                  ? ` · Decision made from CEO view · ${new Date(decision.decidedAt).toLocaleDateString()}`
                  : ""}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <DetailDrawer
                  title={m.title}
                  trigger={
                    <Button size="sm" variant="outline">
                      Inspect reason & evidence
                    </Button>
                  }
                >
                  <DetailBlock title="Original restriction">
                    <p>{m.risk.why}</p>
                    <RiskBadge level={m.risk.level} />
                  </DetailBlock>
                  <DetailBlock title="Affected resource & consequences">
                    <p>
                      {m.resource} · {m.change}
                    </p>
                    <p className="mt-2">{m.risk.consequences}</p>
                  </DetailBlock>
                  <DetailBlock title="Protection">
                    <p>{m.risk.protectionWindows.join(" · ") || "Not supplied"}</p>
                  </DetailBlock>
                  <DetailBlock title="Sources">
                    {m.evidence.map((e) => (
                      <p key={e.source + e.detail} className="mb-3">
                        {e.source}: {e.detail}
                      </p>
                    ))}
                  </DetailBlock>
                  {api.isDemo && <DetailBlock title="Demo decision">
                    <p>
                      {decision?.approved ? "Demo exception approved" : "Not approved"}. Real
                      implementation is not authorized.
                    </p>
                  </DetailBlock>}
                </DetailDrawer>
                {s.role === "ceo" &&
                  api.isDemo &&
                  (decision?.approved ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      onClick={() => decideException(m.id, m.risk.why, false)}
                    >
                      Revoke demo exception
                    </Button>
                  ) : (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setPending(m)}>
                        Approve demo exception
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => decideException(m.id, m.risk.why, false)}
                      >
                        Keep blocked
                      </Button>
                    </>
                  ))}
              </div>
            </article>
          );
        })}
      </div>
      <Dialog open={pending != null} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve this demo exception?</DialogTitle>
            <DialogDescription>
              {pending?.title}. Original restrictions remain in evidence. Conditional calculations
              are illustrative, not operational approval or a valid submission.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => setPending(null)}>
              Keep blocked
            </Button>
            <Button
              onClick={() => {
                if (pending) decideException(pending.id, pending.risk.why, true);
                setPending(null);
              }}
            >
              Confirm demo exception
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
