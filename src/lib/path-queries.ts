import { useQueries, useQuery } from "@tanstack/react-query";
import { api } from "./api/client";
import type { Forecast } from "./api/types";
import type { SavedPath } from "./paths";
import { useGlobalQuery } from "./store";

export function usePathSimulation(path: Pick<SavedPath, "measureIds" | "budgetChf">) {
  const q = useGlobalQuery();
  return useQuery({
    queryKey: ["path-simulation", q, [...path.measureIds].sort(), path.budgetChf],
    queryFn: () =>
      api.simulate(q, { measureIds: path.measureIds, budgetChf: path.budgetChf, chfPerPersonDay: 1100 }),
  });
}
/** One provider forecast per measure selection; each Path's line uses its own supplied forecast. */
export function useSelectionForecasts(
  metric: Forecast["metric"],
  horizon: number,
  selections: { key: string; measureIds: string[] }[],
  enabled = true,
) {
  const q = useGlobalQuery();
  return useQueries({
    queries: selections.map((s) => ({
      queryKey: ["forecast", q, metric, horizon, [...s.measureIds].sort()],
      enabled,
      queryFn: () => api.getForecast(q, metric, horizon, s.measureIds),
    })),
  });
}
