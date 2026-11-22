import { formatEvidenceText } from "@/lib/format";
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowUpRight, RotateCcw, Send } from "lucide-react";
import { AnalyticalInspector } from "./analytical-inspector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api/client";
import type { ChatAction, ChatMessage } from "@/lib/api/types";
import { useApp, useGlobalQuery } from "@/lib/store";
import { EvidencePopover } from "./ui";
import { toast } from "sonner";
import { createPath, findPathByName } from "@/lib/paths";

const ASSISTANT_PATH = "Assistant suggestion";

const SUGGESTED = [
  "What did we spend in August 2026?",
  "Open the market-based emissions calendar",
  "Why is disaster recovery protected?",
  "Which plan meets both targets?",
];

export function ChatPanel() {
  const { s, set } = useApp();
  const q = useGlobalQuery();
  const navigate = useNavigate();
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy, error]);
  const ask = async (text: string, retry = false) => {
    const question = text.trim();
    if (!question || pending.current) return;
    pending.current = true;
    const next = retry ? msgs : [...msgs, { role: "user" as const, content: question }];
    setMsgs(next);
    setInput("");
    setError(null);
    setBusy(true);
    try {
      const r = await api.chat(q, next, s.measureIds);
      setMsgs([...next, r]);
    } catch {
      setError(question);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const run = (a: ChatAction) => {
    if (a.type !== "setFilters") set({ chatOpen: false });
    if (a.type === "navigate")
      navigate(a.hash ? { to: a.to, hash: a.hash } : { to: a.to, hash: "" });
    else if (a.type === "openSimulation") navigate({ to: "/studio" });
    else if (a.type === "openMeasure") navigate({ to: "/studio", hash: `measure-${a.measureId}` });
    else if (a.type === "setFilters") {
      const { type: _t, label: _l, ...filters } = a;
      set(filters);
      toast.success("Filters applied");
    } else if (a.type === "setRole") {
      set({ role: a.role });
      navigate({ to: `/${a.role}` });
    } else if (a.type === "stagePlan") {
      // Saved as an uncommitted Path; committing to the Current Plan stays an explicit user step.
      const plan = { measureIds: a.measureIds, budgetChf: a.budgetChf, priority: a.priority };
      let name = ASSISTANT_PATH;
      for (let i = 2; findPathByName(s.paths, name); i++) name = `${ASSISTANT_PATH} ${i}`;
      try {
        set({
          paths: createPath(s.paths, { id: `assistant-${Date.now()}`, name, ...plan }),
        });
        toast.success(`Saved draft Path "${name}"`);
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
          : "Ask about your footprint, compare measures, or find a page."
      }
      trigger={null}
      open={s.chatOpen}
      onOpenChange={(open) => set({ chatOpen: open })}
    >
      <div className="space-y-4" role="log" aria-label="Conversation">
        {msgs.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Try a question</p>
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
            <p className="whitespace-pre-line leading-relaxed">
              {m.role === "assistant" ? formatEvidenceText(m.content) : m.content}
            </p>
            {m.tables?.map((table) => (
              <div key={table.title} className="overflow-x-auto rounded-md border">
                <table className="w-full border-collapse text-left text-sm">
                  <caption className="sr-only">{table.title}</caption>
                  <thead className="bg-muted">
                    <tr>
                      {table.columns.map((column, j) => (
                        <th key={j} scope="col" className="px-3 py-2 font-medium">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((row, j) => (
                      <tr key={j} className="border-t">
                        {row.map((cell, k) => (
                          <td key={k} className="px-3 py-2 align-top">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            {!!m.actions?.length && (
              <div className="flex flex-wrap gap-1.5">
                {m.actions.map((a, j) => (
                  <Button
                    variant="outline"
                    size="sm"
                    key={j}
                    onClick={() => run(a)}
                    className="h-auto whitespace-normal text-xs"
                  >
                    {a.label}
                    {a.type === "navigate" && <ArrowUpRight className="size-3" />}
                  </Button>
                ))}
              </div>
            )}
            {(m.details || m.calculation || !!m.evidence?.length) && (
              <details className="text-sm text-muted-foreground">
                <summary className="cursor-pointer">Sources and details</summary>
                <div className="mt-2 space-y-2">
                  {m.details && <p>{m.details}</p>}
                  {m.calculation && (
                    <p>
                      {m.assistant && `${m.assistant} · `}
                      {m.calculation}
                    </p>
                  )}
                  {!!m.evidence?.length && (
                    <EvidencePopover evidence={m.evidence} label="View source records" />
                  )}
                </div>
              </details>
            )}
          </div>
        ))}
        {busy && (
          <p className="text-sm text-muted-foreground" role="status">
            Checking your data…
          </p>
        )}
        {error && (
          <div className="flex items-center gap-2 text-sm" role="status">
            <p>The assistant couldn’t finish this request.</p>
            <Button size="sm" variant="outline" onClick={() => void ask(error, true)}>
              Retry
            </Button>
          </div>
        )}
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
          maxLength={500}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about costs, CO₂, risks…"
          className="min-w-0 flex-1"
        />
        <Button type="submit" size="icon" aria-label="Send" disabled={busy || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
        {msgs.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="New conversation"
            title="New conversation"
            disabled={busy}
            onClick={() => {
              setMsgs([]);
              setError(null);
              setInput("");
            }}
          >
            <RotateCcw className="size-4" />
          </Button>
        )}
      </form>
    </AnalyticalInspector>
  );
}
