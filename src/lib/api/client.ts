import { queryOptions } from "@tanstack/react-query";
import type { DashboardApi } from "./types";
import { mockOverview, mockFinance, mockIt } from "./mock-data";

/** Mock adapter: returns placeholder data. */
export const mockApi: DashboardApi = {
  isMock: true,
  getExecutiveOverview: async () => mockOverview,
  getFinanceView: async () => mockFinance,
  getItView: async () => mockIt,
};

/** HTTP adapter for the teammates' backend. Endpoints are proposals — align with backend. */
export function createHttpApi(baseUrl: string): DashboardApi {
  const get = async <T,>(path: string): Promise<T> => {
    const res = await fetch(`${baseUrl}${path}`);
    if (!res.ok) throw new Error(`API ${path} failed [${res.status}]: ${await res.text()}`);
    return res.json() as Promise<T>;
  };
  return {
    isMock: false,
    getExecutiveOverview: () => get("/overview"),
    getFinanceView: () => get("/finance"),
    getItView: () => get("/it"),
  };
}

const baseUrl = import.meta.env["VITE_API_BASE_URL"] as string | undefined;
/** Set VITE_API_BASE_URL to switch from mock to the real backend. */
export const api: DashboardApi = baseUrl ? createHttpApi(baseUrl) : mockApi;

export const overviewQuery = queryOptions({ queryKey: ["overview"], queryFn: () => api.getExecutiveOverview() });
export const financeQuery = queryOptions({ queryKey: ["finance"], queryFn: () => api.getFinanceView() });
export const itQuery = queryOptions({ queryKey: ["it"], queryFn: () => api.getItView() });

/** Locale-independent Swiss grouping (1'234) so server and browser render identically. */
export const group = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "'");
export const chf = (n: number) => `CHF ${group(n)}`;
export const kg = (n: number) => `${group(n)} kg`;
