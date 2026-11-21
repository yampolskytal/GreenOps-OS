import type { Kpi, Overview } from "@/lib/api/types";
import { accountingComparison } from "@/lib/analytics";
import { kg } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { DetailBlock, DetailDrawer } from "./details";
import { CalcInfo } from "./ui";
export function EmissionsEvidence({
  overview,
}: {
  overview: Pick<Overview, "co2Location" | "co2Market">;
}) {
  const comparison = accountingComparison(overview.co2Location, overview.co2Market);
  return (
    <DetailDrawer
      title="Emissions accounting evidence"
      trigger={
        <Button variant="outline" size="sm">
          Compare accounting methods
        </Button>
      }
    >
      <EmissionMetric label="Location-based CO₂" kpi={overview.co2Location} />
      <EmissionMetric
        label="Market-based CO₂"
        {...(overview.co2Market ? { kpi: overview.co2Market } : {})}
      />
      <DetailBlock title="Difference between accounting methods">
        <p>
          {comparison
            ? `${kg(comparison.difference)}${comparison.percentage != null ? ` · ${comparison.percentage.toFixed(1)}%` : ""}`
            : "Comparison unavailable: matching units, reporting period and coverage are required."}
        </p>
      </DetailBlock>
      <p className="text-muted-foreground">
        These are alternative accounting perspectives, never added together. Contractual accounting
        differences do not automatically reduce electricity use or physical emissions. The mandatory
        40% target uses location-based emissions only.
      </p>
    </DetailDrawer>
  );
}
export function EmissionMetric({ label, kpi }: { label: string; kpi?: Kpi | null }) {
  return (
    <DetailBlock title={label}>
      {kpi ? (
        <>
          <p className="num">
            {kg(kpi.value.mid)} · {kpi.calc.period}
          </p>
          <p className="mt-2">{kpi.calc.formula}</p>
          <p className="mt-2 text-muted-foreground">
            Coverage: {kpi.coverage ?? "Not supplied"} · Region: {kpi.region ?? "Not supplied"}
          </p>
          <p className="mt-2 text-muted-foreground">
            Missing inputs: {kpi.missingInputs?.join(" · ") || "Not supplied"}
          </p>
          <p className="mt-2 text-muted-foreground">
            Procurement assumptions: {kpi.procurementAssumptions?.join(" · ") || "Not supplied"}
          </p>
          <CalcInfo calc={kpi.calc} />
        </>
      ) : (
        <p className="text-muted-foreground">
          Unavailable at this reporting level; awaiting backend values and methodology.
        </p>
      )}
    </DetailBlock>
  );
}
