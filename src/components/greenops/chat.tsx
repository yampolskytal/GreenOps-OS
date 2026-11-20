import { useState, useRef, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Send, Sparkles, Calculator } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { api } from "@/lib/api/client";
import type { ChatAction, ChatMessage } from "@/lib/api/types";
import { useApp, useGlobalQuery } from "@/lib/store";
import { DemoTag, EvidencePopover } from "./ui";

const SUGGESTED = [
  "How many AI seats were bought but not used in August 2026?",
  "What does it bring to start the GPU server only when needed?",
  "May the production platform be switched off at night and at weekends?",
];

/** Persistent assistant. Backend LLM integration point: api.chat(). Voice (ElevenLabs) can plug in here later. */
export function ChatPanel() {
  const { s, set } = useApp(); const q = useGlobalQuery(); const navigate = useNavigate();
  const [msgs, setMsgs] = useState<ChatMessage[]>([]); const [input, setInput] = useState(""); const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);
  const ask = async (text: string) => {
    if (!text.trim() || busy) return;
    const next = [...msgs, { role: "user" as const, content: text }]; setMsgs(next); setInput(""); setBusy(true);
    try { const r = await api.chat(q, next); setMsgs([...next, r]); }
    catch (e) { setMsgs([...next, { role: "assistant", content: `Sorry, the assistant is unreachable (${e instanceof Error ? e.message : "error"}).` }]); }
    finally { setBusy(false); }
  };
  const run = (a: ChatAction) => {
    set({ chatOpen: false });
    if (a.type === "navigate") navigate({ to: a.to });
    else if (a.type === "openSimulation") navigate({ to: "/studio" });
    else if (a.type === "openMeasure") navigate({ to: "/studio", hash: `measure-${a.measureId}` });
    else navigate({ to: "/it", hash: `res-${a.resourceId}` });
  };
  return (
    <Sheet open={s.chatOpen} onOpenChange={(o) => set({ chatOpen: o })}>
      <SheetContent className="flex w-full flex-col p-0 sm:max-w-md">
        <SheetHeader className="border-b p-4"><SheetTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" />GreenOps Assistant <DemoTag /></SheetTitle><SheetDescription>Every answer should come with a calculation or source.</SheetDescription></SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {msgs.length === 0 && (
            <div className="space-y-2"><p className="text-xs text-muted-foreground">Try asking:</p>
              {SUGGESTED.map((t) => <button key={t} onClick={() => ask(t)} className="block w-full rounded-lg border p-3 text-left text-sm transition hover:border-primary">{t}</button>)}
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={m.role === "user" ? "ml-8 rounded-xl bg-primary/15 p-3 text-sm" : "mr-4 space-y-2 rounded-xl border bg-card p-3 text-sm"}>
              <p>{m.content}</p>
              {m.calculation && <p className="num flex gap-1.5 rounded bg-muted p-2 text-[11px] text-muted-foreground"><Calculator className="h-3.5 w-3.5 shrink-0" />{m.calculation}</p>}
              {m.evidence && <EvidencePopover evidence={m.evidence} label="Sources" />}
              {m.actions && <div className="flex flex-wrap gap-1.5">{m.actions.map((a) => <button key={a.label} onClick={() => run(a)} className="rounded-full border border-primary/50 px-2.5 py-1 text-xs text-primary hover:bg-primary/10">{a.label}</button>)}</div>}
            </div>
          ))}
          {busy && <p className="text-xs text-muted-foreground animate-pulse">Thinking…</p>}
          <div ref={end} />
        </div>
        <form onSubmit={(e) => { e.preventDefault(); void ask(input); }} className="flex gap-2 border-t p-3">
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about costs, CO₂, risks…" className="flex-1 rounded-lg border bg-surface px-3 py-2 text-sm outline-none focus:border-primary" />
          <button type="submit" aria-label="Send" disabled={busy} className="rounded-lg bg-primary px-3 text-primary-foreground disabled:opacity-50"><Send className="h-4 w-4" /></button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
