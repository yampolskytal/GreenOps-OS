import { z } from "zod";

const number = z.number().finite();
const list = z.array(z.string()).default([]);
const range = z
  .object({ low: number, mid: number, high: number })
  .refine((r) => r.low <= r.mid && r.mid <= r.high, "Invalid low/mid/high range");
const riskLevel = z.enum(["low", "review", "blocked"]);
const calculation = z
  .object({
    title: z.string(),
    formula: z.string(),
    inputs: z.array(z.object({ label: z.string(), value: z.string() })).default([]),
    units: z.string(),
    sources: list,
    period: z.string(),
    assumptions: list,
    limitations: list,
    kind: z.enum(["measured", "financial", "estimated", "modeled", "simulated", "forecast"]),
    factors: z
      .array(
        z.object({
          label: z.string(),
          low: z.string(),
          mid: z.string(),
          high: z.string(),
          source: z.string(),
        }),
      )
      .optional(),
  })
  .passthrough();
const kpi = z
  .object({ value: range, unit: z.string(), kind: z.string(), calc: calculation })
  .passthrough();
const evidence = z.array(z.object({ source: z.string(), detail: z.string() })).default([]);
const measure = z
  .object({
    id: z.string(),
    title: z.string(),
    description: z.string().default(""),
    resource: z.string(),
    change: z.string().default("Not supplied"),
    service: z.string(),
    effortPersonDays: number,
    savingsChf: number,
    savingsKwh: number,
    savingsCo2KgLocation: number,
    savingsCo2KgMarket: number.nullable().optional(),
    risk: z.object({
      level: riskLevel,
      why: z.string().default("Reason not supplied"),
      consequences: z.string().default("Consequences not supplied"),
      protectionWindows: list,
      conflicts: list,
      approver: z.string().optional(),
    }),
    evidence,
    assumptions: list,
    includable: z.boolean(),
  })
  .passthrough();
const simulation = z
  .object({
    savingsChf: number,
    savingsKwh: number,
    savingsCo2Kg: number,
    savingsCo2KgMarket: number.nullable().optional(),
    effortDays: number,
    effortChf: number,
    costReductionPct: number,
    co2ReductionPct: number,
    constraints: z.array(
      z.object({
        label: z.string(),
        achieved: number,
        target: number,
        unit: z.enum(["%", "CHF", "PD"]),
        direction: z.enum(["atLeast", "atMost"]),
        met: z.boolean(),
      }),
    ),
    feasible: z.boolean(),
    reasons: list,
    excluded: z.array(z.object({ id: z.string(), reason: z.string() })).default([]),
    paybackMonths: number.nullable(),
  })
  .passthrough();
const breakdown = z
  .object({
    label: z.string(),
    costChf: number.nullable(),
    co2Kg: number.nullable(),
    energyKwh: number.nullable(),
    co2KgMarket: number.nullable().optional(),
  })
  .passthrough();
const arrayOfBreakdowns = z.array(breakdown).default([]);
const exportsSchema = z.object({
  filename: z.string(),
  csv: z.string(),
  issues: list,
  submittable: z.boolean(),
});
export const responseSchemas: Record<string, z.ZodTypeAny> = {
  "/overview": z
    .object({
      baselinePeriod: z.string(),
      cost: kpi,
      energy: kpi,
      co2Location: kpi,
      co2Market: kpi.nullable().optional(),
      monthly: z
        .array(
          z
            .object({
              month: z.string(),
              costChf: number.nullable(),
              energyKwh: number.nullable(),
              co2Kg: number.nullable(),
              co2KgMarket: number.nullable().optional(),
            })
            .passthrough(),
        )
        .default([]),
      topOpportunities: list,
      managementRisks: z
        .array(z.object({ title: z.string(), detail: z.string(), level: riskLevel }))
        .default([]),
      forecastSupport: z
        .array(
          z.object({
            metric: z.enum(["cost", "energy", "co2Location", "co2Market"]),
            horizons: z.array(number),
          }),
        )
        .optional(),
    })
    .passthrough(),
  "/breakdowns": z.object({
    byDepartment: arrayOfBreakdowns,
    byProvider: arrayOfBreakdowns,
    byTool: arrayOfBreakdowns,
    byService: arrayOfBreakdowns,
    allocationRule: z.string().default("Allocation rule not supplied"),
  }),
  "/resources": z.array(
    z
      .object({
        id: z.string(),
        name: z.string(),
        runtimeH30d: number.nullable().default(null),
        activeH30d: number.nullable().optional(),
        idleCostChfYear: number.nullable().default(null),
        provider: z.string().default("Not supplied"),
        location: z.string().default("Not supplied"),
        environment: z.string().default("Not supplied"),
        department: z.string().default("Not supplied"),
        criticality: z.string().default("unknown"),
        cpuAvgPct: number.nullable().optional(),
        gpuAvgPct: number.nullable().optional(),
        co2Location: kpi.nullable().optional(),
        co2Market: kpi.nullable().optional(),
      })
      .passthrough(),
  ),
  "/measures": z.array(measure),
  "/findings": z.array(
    z
      .object({
        id: z.string(),
        title: z.string(),
        description: z.string().default(""),
        resource: z.string(),
        category: z.string(),
        impactChfYear: number.nullable(),
        impactKwhYear: number.nullable(),
        impactCo2KgYear: number.nullable(),
        evidence,
        assumptions: list,
        risk: riskLevel,
        action: z.string().default("Action not supplied"),
      })
      .passthrough(),
  ),
  "/simulation": simulation,
  "/optimize": z.object({ measureIds: list, result: simulation }),
  "/forecast": z
    .object({
      metric: z.enum(["cost", "energy", "co2Location", "co2Market"]),
      unit: z.string(),
      growthAssumption: z.string().default("Not supplied"),
      points: z.array(
        z
          .object({
            year: number,
            date: z.string().optional(),
            baseline: range,
            optimized: range,
            observed: number.nullable().optional(),
          })
          .passthrough(),
      ),
      granularity: z.enum(["monthly", "annual"]).optional(),
      methodology: calculation.optional(),
    })
    .passthrough(),
  "/metrics/daily": z.array(
    z
      .object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        costChf: number.nullable(),
        energyKwh: number.nullable(),
        co2Kg: number.nullable(),
        co2KgMarket: number.nullable().optional(),
        workday: z.boolean(),
        coverage: z.enum(["measured", "allocated", "estimated"]),
        contributors: z.array(z.object({ label: z.string(), co2Kg: number })).default([]),
      })
      .passthrough(),
  ),
  "/data-quality": z.object({
    version: z.string(),
    importedAt: z.string(),
    datasets: z.array(
      z.object({
        file: z.string(),
        kind: z.enum(["core", "bonus"]),
        rows: number,
        coverage: z.string(),
        latest: z.string(),
        missing: number,
        duplicates: number,
        conflicts: number,
        unmapped: number,
        drafts: number,
        status: z.enum(["ok", "warning", "error"]),
      }),
    ),
    conflicts: z.array(z.object({ title: z.string(), sources: list })).default([]),
  }),
  "/bonus": z.object({
    carbonJobs: z
      .array(
        z.object({
          job: z.string(),
          window: z.enum(["fixed", "flexible"]),
          currentStart: z.string(),
          suggestedStart: z.string(),
          co2SavedKgYear: number,
        }),
      )
      .default([]),
    pipelines: z
      .array(z.object({ label: z.string(), value: z.string(), detail: z.string() }))
      .default([]),
    clusters: z
      .array(
        z.object({ name: z.string(), members: number, description: z.string(), outliers: list }),
      )
      .default([]),
    aiModels: z
      .array(
        z.object({
          model: z.string(),
          provider: z.string(),
          tokensM: number,
          costChf: number,
          share: number,
        }),
      )
      .default([]),
    seats: z
      .array(
        z.object({ product: z.string(), purchased: number, active: number, wasteChfMonth: number }),
      )
      .default([]),
  }),
  "/imports": z.object({
    accepted: z.boolean(),
    datasetVersion: z.string().optional(),
    message: z.string(),
    issues: list,
  }),
  "/chat": z
    .object({
      role: z.literal("assistant"),
      content: z.string(),
      evidence: evidence.optional(),
      calculation: z.string().optional(),
      actions: z
        .array(
          z.discriminatedUnion("type", [
            z.object({ type: z.literal("navigate"), to: z.string(), label: z.string() }),
            z.object({ type: z.literal("highlight"), resourceId: z.string(), label: z.string() }),
            z.object({ type: z.literal("openMeasure"), measureId: z.string(), label: z.string() }),
            z.object({ type: z.literal("openSimulation"), label: z.string() }),
          ]),
        )
        .optional(),
    })
    .passthrough(),
  "/exports/baseline": exportsSchema,
  "/exports/measures": exportsSchema,
};
export function validateApiResponse(path: string, data: unknown): unknown {
  const schema = responseSchemas[path.split("?")[0] ?? path];
  if (!schema) return data;
  const parsed = schema.safeParse(data);
  if (!parsed.success)
    throw new Error(
      `Cannot calculate: the provider returned incomplete or invalid ${path.split("?")[0]} data. No DEMO values were substituted.`,
    );
  return parsed.data;
}
