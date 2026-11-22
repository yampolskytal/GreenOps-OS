import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/greenops/shell";
import { DataManagement } from "./import";
import { SubmissionContent } from "./submission";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useQuality, useOverview } from "@/lib/queries";
import { Q } from "@/components/greenops/ui";
import { EmissionsEvidence } from "@/components/greenops/emissions-evidence";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/data")({
  head: () =>
    seo(
      "Data & Reports — GreenOps OS",
      "Validate data quality, manage dataset versions and prepare the two official hackathon submissions.",
    ),
  component: DataReports,
});
function DataReports() {
  const quality = useQuality(),
    ov = useOverview();
  return (
    <AppShell
      kicker="Connect · Report"
      title="Data & Reports"
      subtitle="Manage source data, review data quality and prepare your submission exports."
    >
      <Tabs defaultValue="management">
        <TabsList aria-label="Data and Reports sections" className="mb-6">
          <TabsTrigger value="management">Data Management</TabsTrigger>
          <TabsTrigger value="submission">Submission</TabsTrigger>
        </TabsList>
        <TabsContent value="management">
          <Q q={quality}>
            {(d) => (
              <div className="mb-6 flex flex-wrap gap-x-10 gap-y-4 border-b pb-6 text-sm">
                <div>
                  <p className="text-muted-foreground">Current dataset</p>
                  <p className="mt-1">{d.datasetName ?? "Active dataset"} · {d.version}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Data as of</p>
                  <p className="num mt-1">{d.asOf ?? d.importedAt ?? "Unavailable"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Sources</p>
                  <p className="num mt-1">
                    {d.datasets.length} · {d.datasets.filter((x) => x.status !== "ok").length} need
                    review
                  </p>
                </div>
              </div>
            )}
          </Q>
          <DataManagement />
          <div className="mt-6">
            <Q q={ov}>{(o) => <EmissionsEvidence overview={o} />}</Q>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Real market-based results require the team API contract: annual totals, period, units,
            region, methodology, factors, sources, coverage, missing inputs and procurement
            assumptions. Monthly/daily values and scenario effects must be supplied separately.
          </p>
          <p className="mt-6 text-xs text-muted-foreground">
            Files are previewed locally. Once the backend confirms an import, dashboards use the new dataset.
          </p>
        </TabsContent>
        <TabsContent value="submission">
          <p className="mb-6 text-sm text-muted-foreground">
            Official baseline: September 2025 — August 2026. Demo data cannot be downloaded as an
            official submission.
          </p>
          <SubmissionContent />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
