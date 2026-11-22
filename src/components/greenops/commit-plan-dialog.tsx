import type { SimulationResult } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { chf, kg, pct } from "@/lib/format";
import { numericalWarnings } from "@/lib/proposals";

export function CommitPlanDialog({
  title,
  description,
  result: r,
  pending,
  error,
  onCancel,
  onConfirm,
  cancelLabel = "Keep editing",
  confirmLabel,
}: {
  title: string;
  description: string;
  result: SimulationResult | undefined;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  cancelLabel?: string;
  confirmLabel?: string;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {r && (
          <ul className="num space-y-1 text-sm">
            <li>
              Annual savings: {chf(r.savingsChf)} ({pct(r.costReductionPct)})
            </li>
            <li>
              Location-based CO₂ reduction: {kg(r.savingsCo2Kg)} ({pct(r.co2ReductionPct)})
            </li>
            <li>
              Effort: {r.effortDays.toFixed(1)} person-days · budget {chf(r.effortChf)}
            </li>
          </ul>
        )}
        {r && !r.feasible && (
          <p className="text-sm text-warning">
            Not submission-ready:{" "}
            {numericalWarnings(r).join("; ") || r.reasons.join(" ") || "misses numerical targets."}{" "}
            It can still be saved as a proposal.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" disabled={pending} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button disabled={pending || !r} onClick={onConfirm}>
            {pending
              ? "Validating…"
              : (confirmLabel ??
                (r && numericalWarnings(r).length
                  ? "Save as non-compliant Current Plan"
                  : "Confirm commit"))}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
