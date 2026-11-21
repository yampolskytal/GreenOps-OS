import { useQuery } from "@tanstack/react-query";
import { api, getPlanningApi } from "./api/client";
import type { Forecast } from "./api/types";
import { useApp, useGlobalQuery, useDisplayedPlan } from "./store";
import { officialQuery } from "./planning";
import { approvedDemoIds } from "./proposals";

const k = (name: string, q: object, extra: unknown[] = []) => [name, q, ...extra];
export const useOverview = (official = false) => {
  const selection = useGlobalQuery();
  const q = official ? officialQuery(selection) : selection;
  return useQuery({ queryKey: k("overview", q), queryFn: () => api.getOverview(q) });
};
export const useBreakdowns = () => {
  const q = useGlobalQuery();
  return useQuery({ queryKey: k("breakdowns", q), queryFn: () => api.getBreakdowns(q) });
};
export const useResources = () => {
  const q = useGlobalQuery();
  return useQuery({ queryKey: k("resources", q), queryFn: () => api.getResources(q) });
};
export const useLocations = () => {
  const q = useGlobalQuery();
  return useQuery({ queryKey: k("locations", q), queryFn: () => api.getLocations(q) });
};
export const useFindings = () => {
  const q = useGlobalQuery();
  return useQuery({ queryKey: k("findings", q), queryFn: () => api.getFindings(q) });
};
export const useMeasures = () => {
  const q = officialQuery(useGlobalQuery());
  return useQuery({ queryKey: k("measures", q), queryFn: () => api.getMeasures(q) });
};
export const useDaily = () => {
  const q = useGlobalQuery();
  return useQuery({ queryKey: k("daily", q), queryFn: () => api.getDailyFootprint(q) });
};
export const useQuality = () => {
  const q = useGlobalQuery();
  return useQuery({ queryKey: k("quality", q), queryFn: () => api.getDataQuality(q) });
};
export const useBonus = () => {
  const q = useGlobalQuery();
  return useQuery({ queryKey: k("bonus", q), queryFn: () => api.getBonus(q) });
};
export const useForecast = (metric: Forecast["metric"], horizon: number, enabled = true) => {
  const q = useGlobalQuery();
  const { s } = useApp();
  const plan = useDisplayedPlan();
  const exceptions = approvedDemoIds(s.demoExceptions, api.isDemo);
  return useQuery({
    queryKey: k("forecast", q, [metric, horizon, plan.measureIds, exceptions]),
    enabled: enabled && plan.ready,
    queryFn: () =>
      getPlanningApi(exceptions).getForecast(officialQuery(q), metric, horizon, plan.measureIds),
  });
};
/** Simulation of the currently selected package (shared across views). */
export const useSimulation = () => {
  const q = officialQuery(useGlobalQuery());
  const { s } = useApp();
  const plan = useDisplayedPlan();
  const suggestedResult = plan.suggested ? s.initialization.candidate?.result : undefined;
  return useQuery({
    queryKey: k("sim", q, [plan.measureIds, plan.budgetChf, s.demoExceptions]),
    enabled: plan.ready,
    ...(suggestedResult ? { initialData: suggestedResult, staleTime: Infinity } : {}),
    queryFn: () =>
      getPlanningApi(approvedDemoIds(s.demoExceptions, api.isDemo)).simulate(q, {
        measureIds: plan.measureIds,
        budgetChf: plan.budgetChf,
        chfPerPersonDay: 1100,
      }),
  });
};
