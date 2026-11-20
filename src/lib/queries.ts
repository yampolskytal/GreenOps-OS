import { useQuery } from "@tanstack/react-query";
import { api } from "./api/client";
import type { Forecast } from "./api/types";
import { useApp, useGlobalQuery } from "./store";

const k = (name: string, q: object, extra: unknown[] = []) => [name, q, ...extra];
export const useOverview = () => { const q = useGlobalQuery(); return useQuery({ queryKey: k("overview", q), queryFn: () => api.getOverview(q) }); };
export const useBreakdowns = () => { const q = useGlobalQuery(); return useQuery({ queryKey: k("breakdowns", q), queryFn: () => api.getBreakdowns(q) }); };
export const useResources = () => { const q = useGlobalQuery(); return useQuery({ queryKey: k("resources", q), queryFn: () => api.getResources(q) }); };
export const useLocations = () => { const q = useGlobalQuery(); return useQuery({ queryKey: k("locations", q), queryFn: () => api.getLocations(q) }); };
export const useFindings = () => { const q = useGlobalQuery(); return useQuery({ queryKey: k("findings", q), queryFn: () => api.getFindings(q) }); };
export const useMeasures = () => { const q = useGlobalQuery(); return useQuery({ queryKey: k("measures", q), queryFn: () => api.getMeasures(q) }); };
export const useDaily = () => { const q = useGlobalQuery(); return useQuery({ queryKey: k("daily", q), queryFn: () => api.getDailyFootprint(q) }); };
export const useQuality = () => { const q = useGlobalQuery(); return useQuery({ queryKey: k("quality", q), queryFn: () => api.getDataQuality(q) }); };
export const useBonus = () => { const q = useGlobalQuery(); return useQuery({ queryKey: k("bonus", q), queryFn: () => api.getBonus(q) }); };
export const useForecast = (metric: Forecast["metric"], horizon: number) => { const q = useGlobalQuery(); return useQuery({ queryKey: k("forecast", q, [metric, horizon]), queryFn: () => api.getForecast(q, metric, horizon) }); };
/** Simulation of the currently selected package (shared across views). */
export const useSimulation = () => {
  const q = useGlobalQuery(); const { s } = useApp();
  return useQuery({ queryKey: k("sim", q, [s.measureIds, s.budgetChf]), queryFn: () => api.simulate(q, { measureIds: s.measureIds, budgetChf: s.budgetChf, chfPerPersonDay: 1100 }), placeholderData: (p) => p });
};
