import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/greenops/shell";
import { ChartCard, Loader } from "@/components/greenops/ui";
import { api } from "@/lib/api/client";
import type { ImportResult } from "@/lib/api/types";
import { recognize } from "@/lib/api/schemas";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { seo } from "@/lib/seo";
import Papa from "papaparse";

export const Route = createFileRoute("/import")({
  head: () =>
    seo(
      "Data import — GreenOps OS",
      "Upload new CSV exports; files are checked and handed to the backend for processing.",
    ),
  component: Import,
});
interface Checked {
  file: File;
  source: string | null;
  missing: string[];
  preview: string[][];
  error?: string;
}

async function check(file: File): Promise<Checked> {
  if (file.name.endsWith(".jsonl")) {
    const required: Record<string, string[]> = {
      "ci_pipeline_runs.jsonl": ["pipeline", "repo", "started_at"],
      "ai_agent_runs.jsonl": ["run_id", "agent", "start"],
    };
    const fields = required[file.name];
    const result = { file, source: file.name, missing: [], preview: [] };
    if (!fields) return { ...result, error: "Unknown JSONL source filename" };
    try {
      const sample = await file.slice(0, 65536).text();
      const row = JSON.parse(sample.trimStart().split(/\r?\n/, 1)[0] ?? "");
      if (!row || Array.isArray(row) || typeof row !== "object") throw new Error();
      return { ...result, missing: fields.filter(k => !(k in row)), preview: [Object.keys(row)] };
    } catch { return { ...result, error: "Cannot preview the first JSON record" }; }
  }
  if (!file.name.toLowerCase().endsWith(".csv"))
    return { file, source: null, missing: [], preview: [], error: "Choose a CSV or JSONL source" };
  const text = await file.slice(0, 20000).text();
  const parsed = Papa.parse<string[]>(text, { preview: 4, skipEmptyLines: true });
  const rows = parsed.data;
  const r = recognize(rows[0] ?? []);
  return {
    file,
    source: r?.source ?? null,
    missing: r?.missing ?? [],
    preview: rows,
    ...(r ? {} : { error: "Unknown source type — columns don't match any known file" }),
  };
}

function Import() {
  return (
    <AppShell
      kicker="Data & Reports"
      title="Data management"
      subtitle="Validate files before sending them to the team backend."
    >
      <DataManagement />
    </AppShell>
  );
}

export function DataManagement() {
  const [files, setFiles] = useState<Checked[]>([]);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<ImportResult | null>(null);
  const qc = useQueryClient();
  const { set } = useApp();
  const add = async (list: FileList | null) => {
    if (!list) return;
    setRes(null);
    const c = await Promise.all(Array.from(list).map(check));
    setFiles((f) => [...f, ...c]);
  };
  const send = async () => {
    setBusy(true);
    try {
      const r = await api.importFiles(
        files.filter((f) => !f.error && f.missing.length === 0).map((f) => f.file),
      );
      setRes(r);
      if (r.accepted && r.datasetVersion) {
        set({ datasetVersion: r.datasetVersion });
        void qc.invalidateQueries();
      }
    } catch (e) {
      setRes({
        accepted: false,
        message: e instanceof Error ? e.message : "Upload failed",
        issues: [],
      });
    } finally {
      setBusy(false);
    }
  };
  const valid = files.filter((f) => !f.error && f.missing.length === 0);
  return (
    <>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void add(e.dataTransfer.files);
        }}
        className={cn(
          "card-elevated flex cursor-pointer flex-col items-center justify-center border-2 border-dashed p-12 text-center transition focus-within:ring-2 focus-within:ring-primary",
          drag && "border-primary shadow-glow",
        )}
      >
        <UploadCloud className="h-10 w-10 text-primary" />
        <p className="mt-3 font-semibold">Choose CSV or JSONL files, or drop them here</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Supported: the 13 core and 15 bonus sources from the data dictionary
        </p>
        <input
          type="file"
          accept=".csv,.jsonl"
          aria-label="Choose CSV or JSONL source files"
          multiple
          className="sr-only"
          onChange={(e) => void add(e.target.files)}
        />
      </label>
      {files.length > 0 && (
        <ChartCard
          title="Files"
          subtitle="Local preview · the backend validates the complete files on import."
          className="mt-6"
          action={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFiles([]);
                setRes(null);
              }}
            >
              Clear
            </Button>
          }
        >
          <ul className="space-y-3">
            {files.map((f, i) => (
              <li key={i} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2 break-words text-sm">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="num">{f.file.name}</span>
                  <span className="ml-auto">
                    {f.error ? (
                      <span className="flex items-center gap-1 text-xs text-destructive">
                        <XCircle className="h-4 w-4" />
                        {f.error}
                      </span>
                    ) : f.missing.length ? (
                      <span className="flex items-center gap-1 text-xs text-warning">
                        <AlertTriangle className="h-4 w-4" />
                        {f.source} · missing {f.missing.join(", ")}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-success">
                        <CheckCircle2 className="h-4 w-4" />
                        Recognised as {f.source}
                      </span>
                    )}
                  </span>
                </div>
                {f.preview.length > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {f.preview[0]?.length} columns detected · content validation pending backend
                    confirmation
                  </p>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button disabled={busy || valid.length === 0} onClick={send}>
              Send {valid.length} file(s) for processing
            </Button>
            {busy && <Loader label="Uploading" />}
          </div>
          {res && (
            <div
              className={cn(
                "mt-4 rounded-lg border p-3 text-sm",
                res.accepted
                  ? "border-success/40 bg-success/10"
                  : "border-warning/40 bg-warning/10",
              )}
            >
              <p className="font-semibold">
                {res.accepted ? `Imported as ${res.datasetVersion}` : "Not imported"}
              </p>
              <p className="mt-1 text-muted-foreground">{res.message}</p>
              {res.issues.length > 0 && (
                <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
                  {res.issues.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              )}
              {res.accepted && (
                <Button
                  variant="link"
                  onClick={() => void qc.invalidateQueries()}
                  className="mt-2 px-0"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Refresh dashboards
                </Button>
              )}
            </div>
          )}
        </ChartCard>
      )}
    </>
  );
}
