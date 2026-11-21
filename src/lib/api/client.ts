import type { ChatMessage, GlobalQuery, GreenOpsApi } from "./types";
import {
  DEMO_BASELINE,
  demoBonus,
  demoBreakdowns,
  demoDaily,
  demoFindings,
  demoLocations,
  demoMeasures,
  demoOverview,
  demoQuality,
  demoResources,
} from "./demo-data";
import { evaluatePackage, greedyPackage } from "../optimizer";
import { BASELINE_HEADER, BASELINE_ROWS, MEASURES_HEADER, toCsv } from "./templates";
import { demoChatReply } from "./demo-chat";
import { validateApiResponse } from "./response-schemas";

const delay = <T>(v: T, _ms?: number) => Promise.resolve(v);
const base = { costChf: DEMO_BASELINE.costChf, co2Kg: DEMO_BASELINE.co2Kg };
const byDept = <T extends { department?: string }>(q: GlobalQuery, xs: T[]) =>
  q.department === "all" ? xs : xs.filter((x) => !x.department || x.department === q.department);

/** DEMO adapter — local placeholder logic. Never presents results as real analytics. */
export const demoApi: GreenOpsApi = {
  isDemo: true,
  getOverview: () =>
    delay({
      ...demoOverview,
      forecastSupport: (["cost", "co2Location", "energy", "co2Market"] as const).map((metric) => ({
        metric,
        horizons: [1, 2, 3],
      })),
    }),
  getBreakdowns: () => delay(demoBreakdowns),
  getResources: (q) =>
    delay(
      byDept(q, demoResources).filter((r) => q.provider === "all" || r.provider === q.provider),
    ),
  getLocations: () => delay(demoLocations),
  getFindings: () => delay(demoFindings),
  getMeasures: () => delay(demoMeasures),
  simulate: (_q, i) =>
    delay(evaluatePackage(demoMeasures, i.measureIds, base, i.budgetChf, i.chfPerPersonDay), 200),
  optimize: (_q, i) => {
    const ids = greedyPackage(demoMeasures, i.budgetChf, i.priority, base, i.chfPerPersonDay);
    return delay(
      {
        measureIds: ids,
        result: evaluatePackage(demoMeasures, ids, base, i.budgetChf, i.chfPerPersonDay),
      },
      300,
    );
  },
  getForecast: (_q, metric, horizon, ids = []) => {
    const start = { cost: 428000, energy: 78000, co2Location: 13400, co2Market: 3600 }[metric];
    const unit = { cost: "CHF", energy: "kWh", co2Location: "kg CO₂", co2Market: "kg CO₂" }[metric];
    const result = evaluatePackage(demoMeasures, ids, base, 16500, 1100);
    const saved =
      metric === "cost"
        ? result.savingsChf
        : metric === "energy"
          ? result.savingsKwh
          : metric === "co2Location"
            ? result.savingsCo2Kg
            : demoMeasures
                .filter((m) => ids.includes(m.id) && m.includable && m.risk.level !== "blocked")
                .reduce((a, m) => a + (m.savingsCo2KgMarket ?? 0), 0);
    const cut = Math.min(1, saved / start);
    const points = Array.from({ length: horizon + 1 }, (_, i) => {
      const year = 2026 + i;
      const g = (r: number) => start * Math.pow(1 + r, i);
      const opt = (r: number) => (i === 0 ? g(r) : g(r) * (1 - cut * Math.min(1, i)));
      return {
        year,
        baseline: { low: g(0.02), mid: g(0.05), high: g(0.09) },
        optimized: { low: opt(0.02), mid: opt(0.05), high: opt(0.09) },
        ...(i === 0 ? { observed: start } : {}),
      };
    });
    return delay({
      metric,
      unit,
      granularity: "annual",
      growthAssumption:
        "DEMO: 2% / 5% / 9% growth per year (headcount + AI adoption). Backend will justify.",
      points,
    });
  },
  getDailyFootprint: (q) => delay(demoDaily(q.from, q.to)),
  getDataQuality: () => delay(demoQuality),
  getBonus: () => delay(demoBonus),
  importFiles: (files) =>
    delay(
      {
        accepted: false,
        message:
          "Backend not connected — files were checked locally for their column headers only. Nothing was imported and no figures changed.",
        issues: files.map((f) => `${f.name}: waiting for backend import API`),
      },
      600,
    ),
  chat: (_q, history) => delay(demoChatReply(history), 700),
  exportBaseline: () => {
    const o = demoOverview;
    const v: Record<string, [number, number, number]> = {
      total_cost_baseline_year_chf: [o.cost.value.low, o.cost.value.mid, o.cost.value.high],
      total_energy_baseline_year_kwh: [o.energy.value.low, o.energy.value.mid, o.energy.value.high],
      total_co2_location_based_baseline_year_kg: [
        o.co2Location.value.low,
        o.co2Location.value.mid,
        o.co2Location.value.high,
      ],
    };
    const rows = BASELINE_ROWS.map((r) => {
      const x = v[r.parameter];
      return [
        r.parameter,
        r.must_or_bonus,
        x?.[0] ?? "",
        x?.[1] ?? "",
        x?.[2] ?? "",
        r.unit,
        x ? "DEMO placeholder" : "",
        x ? "DEMO — replace with backend calculation" : "",
      ];
    });
    const missing = BASELINE_ROWS.filter((r) => r.must_or_bonus === "Must" && !v[r.parameter]).map(
      (r) => `Missing mandatory value: ${r.parameter}`,
    );
    return delay({
      filename: "DEMO_baseline_and_assumptions.csv",
      csv: toCsv(BASELINE_HEADER, rows),
      issues: ["Contains demo placeholders — not a valid submission.", ...missing],
      submittable: false,
    });
  },
  exportMeasures: (_q, ids) => {
    const ms = demoMeasures.filter((m) => ids.includes(m.id));
    const rows = ms.map((m) => [
      m.id,
      m.description,
      m.resource,
      m.change,
      m.effortPersonDays,
      m.savingsChf,
      m.savingsKwh,
      m.savingsCo2KgLocation,
      m.savingsCo2KgMarket ?? "",
      `${m.risk.why} Protection: ${m.risk.protectionWindows.join("; ") || "none"}`,
      `DEMO. ${m.assumptions.join("; ")} Sources: ${m.evidence.map((e) => e.source).join("; ")}`,
    ]);
    const r = evaluatePackage(demoMeasures, ids, base, 16500, 1100);
    return delay({
      filename: "DEMO_measures_package.csv",
      csv: toCsv(MEASURES_HEADER, rows),
      issues: ["Contains demo placeholders — not a valid submission.", ...r.reasons],
      submittable: false,
    });
  },
};

/** HTTP adapter. Credentials stay exclusively in the same-origin server proxy. */
export function createHttpApi(baseUrl: string): GreenOpsApi {
  const qs = (q: GlobalQuery) =>
    new URLSearchParams({
      version: q.datasetVersion,
      from: q.from,
      to: q.to,
      department: q.department,
      provider: q.provider,
    }).toString();
  const req = async <T>(path: string, init?: RequestInit): Promise<T> => {
    let res: Response;
    try {
      res = await fetch(`${baseUrl}${path}`, { ...init, signal: AbortSignal.timeout(100_000) });
    } catch {
      throw new Error(
        "Backend connection unavailable or still starting. Please retry shortly. No demo data was substituted.",
      );
    }
    if (!res.ok) {
      let message = "The backend could not complete this request. Please retry shortly.";
      try {
        const error = await res.json();
        if (typeof error.error === "string") message = error.error;
      } catch {
        /* Never show raw provider errors. */
      }
      throw new Error(`${message} [${res.status}]`);
    }
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      throw new Error("The backend returned invalid JSON. No demo data was substituted.");
    }
    return validateApiResponse(path, data) as T;
  };
  const post = <T>(path: string, body: unknown) =>
    req<T>(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  return {
    isDemo: false,
    getOverview: (q) => req(`/overview?${qs(q)}`),
    getBreakdowns: (q) => req(`/breakdowns?${qs(q)}`),
    getResources: (q) => req(`/resources?${qs(q)}`),
    getLocations: (q) => req(`/locations?${qs(q)}`),
    getFindings: (q) => req(`/findings?${qs(q)}`),
    getMeasures: (q) => req(`/measures?${qs(q)}`),
    simulate: (q, i) => post(`/simulation?${qs(q)}`, i),
    optimize: (q, i) => post(`/optimize?${qs(q)}`, i),
    getForecast: (q, metric, h, ids = []) =>
      req(
        `/forecast?${qs(q)}&metric=${metric}&horizon=${h}&measureIds=${encodeURIComponent(ids.join(","))}`,
      ),
    getDailyFootprint: (q) => req(`/metrics/daily?${qs(q)}`),
    getDataQuality: (q) => req(`/data-quality?${qs(q)}`),
    getBonus: (q) => req(`/bonus?${qs(q)}`),
    importFiles: async () => ({
      accepted: false,
      message:
        "Imports are not enabled in this public workspace. An authenticated administrator connection is required. No files were uploaded and no figures changed.",
      issues: [],
    }),
    chat: (q, history: ChatMessage[]) =>
      post(`/chat?${qs(q)}`, {
        messages: history.slice(-20).map(({ role, content }) => ({ role, content })),
      }),
    exportBaseline: (q) => req(`/exports/baseline?${qs(q)}`),
    exportMeasures: (q, ids) => post(`/exports/measures?${qs(q)}`, { measureIds: ids }),
  };
}

/** All application requests use the production-capable same-origin secret-bearing proxy. */
export const api: GreenOpsApi = createHttpApi("/api/v2");

/** UI-only demo exceptions never cross the real provider boundary or alter source restrictions. */
export function getPlanningApi(exceptionIds: string[], provider: GreenOpsApi = api): GreenOpsApi {
  if (!provider.isDemo || !exceptionIds.length) return provider;
  const approved = demoMeasures.map((m) =>
    exceptionIds.includes(m.id)
      ? { ...m, includable: true, risk: { ...m.risk, level: "review" as const } }
      : m,
  );
  return {
    ...demoApi,
    simulate: async (_q, input) =>
      evaluatePackage(approved, input.measureIds, base, input.budgetChf, input.chfPerPersonDay),
    getForecast: async (q, metric, horizon, ids = []) => {
      const f = await demoApi.getForecast(q, metric, horizon, []);
      const result = evaluatePackage(approved, ids, base, 16500, 1100);
      const baseline = f.points[0]?.baseline.mid;
      if (!baseline) return f;
      const savings =
        metric === "cost"
          ? result.savingsChf
          : metric === "energy"
            ? result.savingsKwh
            : metric === "co2Location"
              ? result.savingsCo2Kg
              : approved
                  .filter((m) => ids.includes(m.id) && m.includable && m.risk.level !== "blocked")
                  .reduce((sum, m) => sum + (m.savingsCo2KgMarket ?? 0), 0);
      const cut = Math.min(1, savings / baseline);
      return {
        ...f,
        growthAssumption: `${f.growthAssumption} Conditional DEMO exceptions included; not implementation approval.`,
        points: f.points.map((p, index) => ({
          ...p,
          optimized: {
            low: p.baseline.low * (index ? 1 - cut : 1),
            mid: p.baseline.mid * (index ? 1 - cut : 1),
            high: p.baseline.high * (index ? 1 - cut : 1),
          },
        })),
      };
    },
  };
}
