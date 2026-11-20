import { Activity, AlertTriangle } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useQuality } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { DemoTag, Q } from "./ui";

export function DataHealth() {
  const q = useQuality();
  const warn = q.data?.datasets.filter((d) => d.status !== "ok").length ?? 0;
  return (
    <Sheet>
      <SheetTrigger className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs hover:border-primary">
        <Activity className={cn("h-3.5 w-3.5", warn ? "text-warning" : "text-success")} />Data health{q.data && <span className="num text-muted-foreground">{q.data.datasets.length - warn}/{q.data.datasets.length}</span>}
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader><SheetTitle className="flex items-center gap-2">Data health <DemoTag /></SheetTitle><SheetDescription>Missing values are never treated as zero without an explicit rule.</SheetDescription></SheetHeader>
        <div className="px-4 pb-8">
          <Q q={q}>{(d) => {
            const tot = (k: "missing" | "duplicates" | "conflicts" | "unmapped" | "drafts") => d.datasets.reduce((a, x) => a + x[k], 0);
            return (<div className="space-y-6">
              <div className="grid grid-cols-3 gap-2 text-center">
                {[["Dataset version", d.version], ["Latest source date", d.importedAt], ["Files", String(d.datasets.length)], ["Missing values", String(tot("missing"))], ["Duplicates", String(tot("duplicates"))], ["Unmapped rows", String(tot("unmapped"))], ["Conflicts", String(tot("conflicts"))], ["Draft vs final", String(tot("drafts"))], ["Coverage", "Nov 24 – Sep 26"]].map(([l, v]) => (
                  <div key={l} className="rounded-lg bg-muted/60 p-2"><p className="text-[10px] text-muted-foreground">{l}</p><p className="num text-sm">{v}</p></div>
                ))}
              </div>
              <div><h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sources</h4>
                <div className="grid grid-cols-2 gap-2">{d.datasets.map((x) => (
                  <div key={x.file} className="rounded-lg border p-2.5">
                    <div className="flex items-center gap-1.5"><span className={cn("h-2 w-2 rounded-full", x.status === "ok" ? "bg-success" : x.status === "warning" ? "bg-warning" : "bg-destructive")} /><span className="num truncate text-[11px]">{x.file}</span></div>
                    <p className="mt-1 text-[11px] text-muted-foreground">{x.rows.toLocaleString("en-US")} rows{x.missing ? ` · ${x.missing} missing` : ""}{x.duplicates ? ` · ${x.duplicates} dup.` : ""}{x.drafts ? ` · ${x.drafts} drafts` : ""}</p>
                  </div>))}
                </div>
              </div>
              <div><h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Source conflicts</h4>
                <ul className="space-y-2">{d.conflicts.map((c) => <li key={c.title} className="flex gap-2 text-sm"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" /><span>{c.title}<span className="num block text-[11px] text-muted-foreground">{c.sources.join(" ↔ ")}</span></span></li>)}</ul>
              </div>
            </div>);
          }}</Q>
        </div>
      </SheetContent>
    </Sheet>
  );
}
