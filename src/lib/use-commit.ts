import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { api } from "./api/client";
import type { Measure, Priority } from "./api/types";
import { validatePreview } from "./planning";
import { useApp, useGlobalQuery } from "./store";

export interface CommitCandidate {
  name: string;
  measureIds: string[];
  budgetChf: number;
  priority: Priority;
}
/** Revalidates a candidate through GreenOpsApi.simulate, then replaces the Current Plan and opens it. */
export function useCommitPlan(measures: Measure[] | undefined) {
  const { commitPlan } = useApp();
  const q = useGlobalQuery();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const commit = async (c: CommitCandidate) => {
    if (!measures) return false;
    setPending(true);
    setError(null);
    try {
      const result = await api.simulate(q, {
        measureIds: c.measureIds,
        budgetChf: c.budgetChf,
        chfPerPersonDay: 1100,
      });
      const issue = validatePreview(c.measureIds, measures, c.budgetChf, result);
      if (issue) throw new Error(issue);
      commitPlan({ measureIds: [...c.measureIds], budgetChf: c.budgetChf, priority: c.priority });
      toast.success(`${c.name} is now your Current Plan`);
      void navigate({ to: "/current-plan", hash: "plan-summary" });
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Plan could not be saved.");
      return false;
    } finally {
      setPending(false);
    }
  };
  return { commit, pending, error, setError };
}
