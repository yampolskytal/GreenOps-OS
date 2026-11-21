import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useApp } from "@/lib/store";
import { recommendationOptions, STARTING_SETTINGS } from "@/lib/starting-plan";

/** Mounted once above all routes; navigation and role switches cannot restart initialization. */
export function StartingPlanInitializer() {
  const { hydrated, s, beginInitialization, finishInitialization } = useApp();
  const client = useQueryClient();
  useEffect(() => {
    if (!hydrated || s.initialization.status !== "new") return;
    const requestId = crypto.randomUUID();
    if (!beginInitialization(requestId)) return;
    const q = { datasetVersion: s.datasetVersion, from: "2025-09", to: "2026-08", department: "all", provider: "all" };
    void client.fetchQuery(recommendationOptions(q, STARTING_SETTINGS.budgetChf, STARTING_SETTINGS.priority))
      .then((candidate) => finishInitialization(requestId, candidate, null))
      .catch((error: unknown) => finishInitialization(requestId, null, error instanceof Error ? error.message : "Recommendation could not be generated."));
  }, [hydrated, s.initialization.status, s.datasetVersion, client, beginInitialization, finishInitialization]);
  return null;
}