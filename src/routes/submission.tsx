import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Download, FileSpreadsheet, AlertTriangle, CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/greenops/shell";
import { ChartCard } from "@/components/greenops/ui";
import { api } from "@/lib/api/client";
import type { ExportFile } from "@/lib/api/types";
import { useApp, useGlobalQuery } from "@/lib/store";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/submission")({
  head: () => seo("Submission Center — GreenOps OS", "Export the baseline & assumptions and measures package CSVs in the exact template format."),
  component: Submission,
});

function download(f: ExportFile) {
  const url = URL.createObjectURL(new Blob([f.csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = f.filename; a.click(); URL.revokeObjectURL(url);
}

function Submission() {
  const q = useGlobalQuery(); const { s } = useApp();
  const [files, setFiles] = useState<Record<string, ExportFile>>({});
  const items = [
    { key: "baseline", title: "Baseline and assumptions", tpl: "template_baseline_and_assumptions.csv", desc: "Totals for Sep 2025 – Aug 2026 and every factor with low/mid/high, source and calculation.", run: () => api.exportBaseline(q) },
    { key: "measures", title: "Package of measures", tpl: "template_measures_package.csv", desc: `One row per measure in your plan (${s.measureIds.length} selected): effort, savings, risks and sources.`, run: () => api.exportMeasures(q, s.measureIds) },
  ];
  return (
    <AppShell kicker="Submission Center" title="Export the mandatory files" subtitle="Files keep the exact column names and order of the organisers' templates. Values come from the backend.">
      <div className="grid gap-6 lg:grid-cols-2">{items.map((it) => { const f = files[it.key]; return (
        <ChartCard key={it.key} title={it.title} subtitle={it.tpl}>
          <div className="flex gap-3"><FileSpreadsheet className="h-10 w-10 shrink-0 text-primary" /><p className="text-sm text-muted-foreground">{it.desc}</p></div>
          <button onClick={async () => { const r = await it.run(); setFiles((x) => ({ ...x, [it.key]: r })); }} className="mt-4 rounded-lg border px-3 py-2 text-sm hover:border-primary">Check & prepare</button>
          {f && <div className="rise-in mt-4 space-y-3">
            <div className={f.submittable ? "rounded-lg border border-success/40 bg-success/10 p-3 text-sm" : "rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm"}>
              <p className="flex items-center gap-2 font-semibold">{f.submittable ? <><CheckCircle2 className="h-4 w-4 text-success" />Ready to submit</> : <><AlertTriangle className="h-4 w-4 text-warning" />Not ready to submit</>}</p>
              {f.issues.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">{f.issues.slice(0, 8).map((x) => <li key={x}>{x}</li>)}{f.issues.length > 8 && <li>…and {f.issues.length - 8} more</li>}</ul>}
            </div>
            <button onClick={() => download(f)} className="inline-flex items-center gap-2 rounded-lg bg-gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground"><Download className="h-4 w-4" />Download {f.filename}</button>
          </div>}
        </ChartCard>
      ); })}</div>
    </AppShell>
  );
}
