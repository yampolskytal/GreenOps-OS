import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, FileSpreadsheet, AlertTriangle, CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/greenops/shell";
import { ChartCard } from "@/components/greenops/ui";
import { api } from "@/lib/api/client";
import type { ExportFile } from "@/lib/api/types";
import { useApp, useDisplayedPlan, useGlobalQuery } from "@/lib/store";
import { officialQuery, canDownloadExport } from "@/lib/planning";
import { Button } from "@/components/ui/button";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/submission")({
  head: () =>
    seo(
      "Submission Center — GreenOps OS",
      "Export the baseline & assumptions and measures package CSVs in the exact template format.",
    ),
  component: Submission,
});

function download(f: ExportFile) {
  const url = URL.createObjectURL(new Blob([f.csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = f.filename;
  a.click();
  URL.revokeObjectURL(url);
}

function Submission() {
  return (
    <AppShell
      kicker="Data & Reports"
      title="Submission"
      subtitle="Official baseline: September 2025 — August 2026."
    >
      <SubmissionContent />
    </AppShell>
  );
}

export function SubmissionContent() {
  const q = officialQuery(useGlobalQuery());
  const { s } = useApp();
  const plan = useDisplayedPlan();
  const [files, setFiles] = useState<Record<string, { key: string; file: ExportFile }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const contextKey = JSON.stringify([q, s.measureIds]);
  const items = [
    {
      key: "baseline",
      title: "Baseline and assumptions",
      tpl: "template_baseline_and_assumptions.csv",
      desc: "Totals for Sep 2025 – Aug 2026 and every factor with low/mid/high, source and calculation.",
      run: () => api.exportBaseline(q),
    },
    {
      key: "measures",
      title: "Package of measures",
      tpl: "template_measures_package.csv",
      desc: plan.suggested
        ? `${plan.measureIds.length} measures are suggested. Adopt or customize the recommendation before exporting the package.`
        : `One row per committed measure (${s.measureIds.length} selected): effort, savings, risks and sources.`,
      run: () => api.exportMeasures(q, s.measureIds),
    },
  ];
  return (
    <>
      {error && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        {items.map((it) => {
          const cached = files[it.key];
          const f = cached?.key === contextKey ? cached.file : undefined;
          return (
            <ChartCard key={it.key} title={it.title} subtitle={it.tpl}>
              <div className="flex gap-3">
                <FileSpreadsheet className="h-10 w-10 shrink-0 text-primary" />
                <p className="text-sm text-muted-foreground">{it.desc}</p>
              </div>
              <Button
                variant="outline"
                disabled={
                  busy != null || (it.key === "measures" && (!plan.ready || plan.suggested))
                }
                onClick={async () => {
                  setBusy(it.key);
                  setError(null);
                  try {
                    const r = await it.run();
                    setFiles((x) => ({ ...x, [it.key]: { key: contextKey, file: r } }));
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Unable to prepare export");
                  } finally {
                    setBusy(null);
                  }
                }}
                className="mt-4 rounded-lg border px-3 py-2 text-sm hover:border-primary"
              >
                {busy === it.key ? "Checking…" : "Check & prepare"}
              </Button>
              {it.key === "measures" && plan.suggested && (
                <Button asChild variant="link">
                  <Link to="/current-plan">Review and adopt plan</Link>
                </Button>
              )}
              {f && (
                <div className="rise-in mt-4 space-y-3">
                  <div
                    className={
                      !api.isDemo && f.submittable
                        ? "rounded-lg border border-success/40 bg-success/10 p-3 text-sm"
                        : "rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm"
                    }
                  >
                    <p className="flex items-center gap-2 font-semibold">
                      {!api.isDemo && f.submittable ? (
                        <>
                          <CheckCircle2 className="h-4 w-4 text-success" />
                          CSV validated for submission
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="h-4 w-4 text-warning" />
                          Not ready to submit
                        </>
                      )}
                    </p>
                    {f.issues.length > 0 && (
                      <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
                        {f.issues.slice(0, 8).map((x) => (
                          <li key={x}>{x}</li>
                        ))}
                        {f.issues.length > 8 && <li>…and {f.issues.length - 8} more</li>}
                      </ul>
                    )}
                  </div>
                  <Button
                    disabled={!canDownloadExport(api.isDemo)}
                    onClick={() => {
                      if (canDownloadExport(api.isDemo)) download(f);
                    }}
                  >
                    <Download className="h-4 w-4" />
                    {api.isDemo
                      ? "Demo export disabled"
                      : `${f.submittable ? "Download" : "Download incomplete draft"} ${f.filename}`}
                  </Button>
                </div>
              )}
            </ChartCard>
          );
        })}
      </div>
    </>
  );
}
