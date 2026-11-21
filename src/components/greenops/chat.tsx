import { useState, useRef, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Send, Calculator } from "lucide-react";
import { AnalyticalInspector } from "./analytical-inspector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api/client";
import type { ChatAction, ChatMessage } from "@/lib/api/types";
import { useApp, useGlobalQuery } from "@/lib/store";
import { EvidencePopover } from "./ui";
import { toast } from "sonner";
import { createPath, findPathByName, replacePath } from "@/lib/paths";

const ASSISTANT_PATH = "Assistant suggestion";

const SUGGESTED = [
  "How many AI seats were bought but not used in August 2026?",
  "Build a plan that meets both targets and let me preview it",
  "Show only the IT department and open the cost breakdown",
  "Forecast CO₂ for the next 3 years with the current plan",
];

/** Persistent assistant. Backend LLM integration point: api.chat(). Voice (ElevenLabs) can plug in here later. */
export function ChatPanel() {
  const { s, set } = useApp();
  const q = useGlobalQuery();
  const navigate = useNavigate();
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy]);
  const ask = async (text: string) => {
    if (!text.trim() || busy) return;
    const next = [...msgs, { role: "user" as const, content: text }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    try {
      const r = await api.chat(q, next);
      setMsgs([...next, r]);
    } catch (e) {
      setMsgs([
        ...next,
        {
          role: "assistant",
          content: `Sorry, the assistant is unreachable (${e instanceof Error ? e.message : "error"}).`,
        },
      ]);
    } finally {
      setBusy(false);
    }
  };
  const run = (a: ChatAction) => {
    set({ chatOpen: false });
    if (a.type === "navigate") navigate(a.hash ? { to: a.to, hash: a.hash } : { to: a.to });
    else if (a.type === "openSimulation") navigate({ to: "/studio" });
    else if (a.type === "openMeasure") navigate({ to: "/studio", hash: `measure-${a.measureId}` });
    else if (a.type === "setFilters") {
      const { type: _t, label: _l, ...filters } = a;
      set(filters);
    } else if (a.type === "setRole") {
      set({ role: a.role });
      navigate({ to: `/${a.role}` });
    } else if (a.type === "stagePlan") {
      // Saved as an uncommitted Path; committing to the Current Plan stays an explicit user step.
      const plan = { measureIds: a.measureIds, budgetChf: a.budgetChf, priority: a.priority };
      const existing = findPathByName(s.paths, ASSISTANT_PATH);
      try {
        set({
          paths: existing
            ? replacePath(s.paths, existing.id, plan)
            : createPath(s.paths, { id: `assistant-${Date.now()}`, name: ASSISTANT_PATH, ...plan }),
        });
        toast.success(`Saved as Path "${ASSISTANT_PATH}" — not committed`);
        navigate({ to: "/studio", hash: "paths" });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not save the Path");
      }
    } else navigate({ to: "/it", hash: `res-${a.resourceId}` });
  };
  return (
    <AnalyticalInspector
      title="Ask GreenOps"
      description={
        api.isDemo
          ? "DEMO replies — no connected LLM; illustrative evidence only"
          : "Evidence-oriented sustainability analysis"
      }
      trigger={null}
      open={s.chatOpen}
      onOpenChange={(open) => set({ chatOpen: open })}
    >
      <div className="space-y-4">
        {msgs.length === 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Try asking:</p>
            {SUGGESTED.map((t) => (
              <Button
                variant="outline"
                key={t}
                onClick={() => ask(t)}
                className="h-auto w-full justify-start whitespace-normal p-3 text-left"
              >
                {t}
              </Button>
            ))}
          </div>
        )}
        {msgs.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user"
                ? "ml-8 rounded-xl bg-primary/15 p-3 text-sm"
                : "mr-4 space-y-2 rounded-xl border bg-card p-3 text-sm"
            }
          >
            <p>{m.content}</p>
            {m.calculation && (
              <p className="num flex gap-1.5 rounded bg-muted p-2 text-[11px] text-muted-foreground">
                <Calculator className="h-3.5 w-3.5 shrink-0" />
                {m.calculation}
              </p>
            )}
            {m.evidence && <EvidencePopover evidence={m.evidence} label="Sources" />}
            {m.actions && (
              <div className="flex flex-wrap gap-1.5">
                {m.actions.map((a) => (
                  <Button
                    variant="outline"
                    size="sm"
                    key={a.label}
                    onClick={() => run(a)}
                    className="h-auto whitespace-normal text-xs"
                  >
                    {a.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
        ))}
        {busy && <p className="text-xs text-muted-foreground animate-pulse">Thinking…</p>}
        <div ref={end} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
        className="flex gap-2 border-t p-3"
      >
        <Input
          aria-label="Ask GreenOps question"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about costs, CO₂, risks…"
          className="min-w-0 flex-1"
        />
        <Button type="submit" size="icon" aria-label="Send" disabled={busy || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </AnalyticalInspector>
  );
}
