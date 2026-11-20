import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { UploadCloud, FileText, CheckCircle2, AlertTriangle, XCircle, RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/greenops/shell";
import { ChartCard, Loader } from "@/components/greenops/ui";
import { api } from "@/lib/api/client";
import type { ImportResult } from "@/lib/api/types";
import { recognize } from "@/lib/api/schemas";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/import")({
  head: () => seo("Data import — GreenOps OS", "Upload new CSV exports; files are checked and handed to the backend for processing."),
  component: Import,
});
interface Checked { file: File; source: string | null; missing: string[]; preview: string[][]; error?: string }

async function check(file: File): Promise<Checked> {
  if (!file.name.toLowerCase().endsWith(".csv")) return { file, source: null, missing: [], preview: [], error: "Not a CSV file" };
  const text = await file.slice(0, 20000).text(); const lines = text.split(/\r?\n/).filter(Boolean).slice(0, 4);
  const rows = lines.map((l) => l.split(",")); const r = recognize(rows[0] ?? []);
  return { file, source: r?.source ?? null, missing: r?.missing ?? [], preview: rows, ...(r ? {} : { error: "Unknown source type — columns don't match any known file" }) };
}

function Import() {
  const [files, setFiles] = useState<Checked[]>([]); const [drag, setDrag] = useState(false); const [busy, setBusy] = useState(false); const [res, setRes] = useState<ImportResult | null>(null);
  const qc = useQueryClient(); const { s, set } = useApp();
  const add = async (list: FileList | null) => { if (!list) return; setRes(null); const c = await Promise.all(Array.from(list).map(check)); setFiles((f) => [...f, ...c]); };
  const send = async () => { setBusy(true); try { const r = await api.importFiles(files.filter((f) => !f.error).map((f) => f.file)); setRes(r); if (r.accepted && r.datasetVersion) set({ datasetVersion: r.datasetVersion }); } catch (e) { setRes({ accepted: false, message: e instanceof Error ? e.message : "Upload failed", issues: [] }); } finally { setBusy(false); } };
  const valid = files.filter((f) => !f.error);
  return (
    <AppShell kicker="Data import" title="Add new data" subtitle="New files never overwrite history — the backend creates a new dataset version.">
      <label onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); void add(e.dataTransfer.files); }}
        className={cn("card-elevated flex cursor-pointer flex-col items-center justify-center border-2 border-dashed p-12 text-center transition", drag && "border-primary shadow-glow")}>
        <UploadCloud className="h-10 w-10 text-primary" /><p className="mt-3 font-semibold">Drop CSV files here or click to choose</p><p className="mt-1 text-sm text-muted-foreground">Supported: the 13 core and 15 bonus sources from the data dictionary</p>
        <input type="file" accept=".csv" multiple className="hidden" onChange={(e) => void add(e.target.files)} />
      </label>
      {files.length > 0 && (
        <ChartCard title="Files" subtitle={`Current dataset: ${s.datasetVersion}`} className="mt-6" action={<button onClick={() => { setFiles([]); setRes(null); }} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>}>
          <ul className="space-y-3">{files.map((f, i) => (
            <li key={i} className="rounded-lg border p-3">
              <div className="flex items-center gap-2 text-sm"><FileText className="h-4 w-4 text-muted-foreground" /><span className="num">{f.file.name}</span>
                <span className="ml-auto">{f.error ? <span className="flex items-center gap-1 text-xs text-destructive"><XCircle className="h-4 w-4" />{f.error}</span> : f.missing.length ? <span className="flex items-center gap-1 text-xs text-warning"><AlertTriangle className="h-4 w-4" />{f.source} · missing {f.missing.join(", ")}</span> : <span className="flex items-center gap-1 text-xs text-success"><CheckCircle2 className="h-4 w-4" />Recognised as {f.source}</span>}</span></div>
              {f.preview.length > 0 && <pre className="num mt-2 overflow-x-auto rounded bg-muted/60 p-2 text-[10px] text-muted-foreground">{f.preview.map((r) => r.slice(0, 8).join("  ·  ")).join("\n")}</pre>}
            </li>
          ))}</ul>
          <div className="mt-4 flex items-center gap-3">
            <button disabled={busy || valid.length === 0} onClick={send} className="rounded-lg bg-gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Send {valid.length} file(s) for processing</button>
            {busy && <Loader label="Uploading" />}
          </div>
          {res && <div className={cn("mt-4 rounded-lg border p-3 text-sm", res.accepted ? "border-success/40 bg-success/10" : "border-warning/40 bg-warning/10")}>
            <p className="font-semibold">{res.accepted ? `Imported as ${res.datasetVersion}` : "Not imported"}</p><p className="mt-1 text-muted-foreground">{res.message}</p>
            {res.issues.length > 0 && <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">{res.issues.map((x) => <li key={x}>{x}</li>)}</ul>}
            {res.accepted && <button onClick={() => void qc.invalidateQueries()} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary"><RefreshCw className="h-3.5 w-3.5" />Refresh dashboards</button>}
          </div>}
        </ChartCard>
      )}
    </AppShell>
  );
}
