import { useQueries, useQuery } from "@tanstack/react-query";
import { api, getPlanningApi } from "./api/client";
import type { Forecast } from "./api/types";
import type { SavedPath } from "./paths";
import { useApp, useGlobalQuery } from "./store";

import { officialQuery } from "./planning";
import { approvedDemoIds } from "./proposals";

export function usePathSimulation(path: Pick<SavedPath, "measureIds" | "budgetChf">) {
  const q = officialQuery(useGlobalQuery());
  const { s } = useApp();
  const exceptions = approvedDemoIds(s.demoExceptions, api.isDemo);
  return useQuery({
    queryKey: ["path-simulation", q, [...path.measureIds].sort(), path.budgetChf, exceptions],
    queryFn: () =>
      getPlanningApi(exceptions).simulate(q, {
        measureIds: path.measureIds,
        budgetChf: path.budgetChf,
        chfPerPersonDay: 1100,
      }),
  });
}
/** One provider forecast per measure selection; each Path's line uses its own supplied forecast. */
export function useSelectionForecasts(
  metric: Forecast["metric"],
  horizon: number,
  selections: { key: string; measureIds: string[] }[],
  enabled = true,
) {
  const q = officialQuery(useGlobalQuery());
  const { s } = useApp();
  const exceptions = approvedDemoIds(s.demoExceptions, api.isDemo);
  return useQueries({
    queries: selections.map((s) => ({
      queryKey: ["forecast", q, metric, horizon, [...s.measureIds].sort(), exceptions],
      enabled,
      queryFn: () => getPlanningApi(exceptions).getForecast(q, metric, horizon, s.measureIds),
    })),
  });
}
