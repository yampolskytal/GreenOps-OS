import { z } from "zod";

const number = z.number().finite();
const list = z.array(z.string()).default([]);
const range = z
  .object({ low: number, mid: number, high: number })
  .refine((r) => r.low <= r.mid && r.mid <= r.high, "Invalid low/mid/high range");
const riskLevel = z.enum(["low", "review", "blocked"]);
const impactMetric = z.enum(["cost", "energy", "co2Location", "co2Market"]);
const measureDecision = z.object({
  status: z.enum(["candidate", "prerequisite", "protected", "evidence-needed", "no-benefit"]),
  reason: z.string(),
  nextStep: z.string().nullable(),
  scopedAnnualCostChf: number.nullable(),
  benefits: z.array(impactMetric),
  tradeoffs: z.array(impactMetric),
  replacement: z.object({
    measureIds: list,
    maxAnnualQuoteChf: number.nullable(),
    remainingCo2GapKg: number,
    couldMeetTargets: z.boolean(),
  }).optional(),
}).optional();
const factor = z.object({ label: z.string(), low: z.string(), mid: z.string(), high: z.string(), source: z.string() });
const marketCoverage = z.object({
  status: z.enum(["covered", "partial", "unavailable", "no-change"]),
  modeledKwh: number, coveredKwh: number, uncoveredKwh: number, allocatedCoveredKwh: number,
  coveragePct: number.min(0).max(100).nullable(),
  missingEnergyRows: number, missingFactorRows: number,
  uncoveredRegions: list, sources: list, factors: z.array(factor), assumptions: list, missingInputs: list,
}).optional();
const marketSavings = z.object({
  projectionRange: range.nullable().optional(),
  partialMeasureIds: list, unavailableMeasureIds: list, forecastLimitedMeasureIds: list,
}).optional();
const marketObservation = {
  co2KgMarket: number.nullable().optional(),
  co2KgMarketRange: range.nullable().optional(),
  marketCoverage,
};
const count = z.number().int().nonnegative();
const regionalMetrics = {
  costChf: number.nullable(),
  energyKwh: number.nullable(),
  co2KgLocation: number.nullable(),
  energyKwhRange: range.nullable().optional(),
  co2KgLocationRange: range.nullable().optional(),
  ...marketObservation,
  co2KgMarket: number.nullable().default(null),
  ledgerCoverage: z
    .object({
      totalRows: count,
      costRows: count,
      energyRows: count,
      locationRows: count,
    })
    .refine(
      ({ totalRows, costRows, energyRows, locationRows }) =>
        Math.max(costRows, energyRows, locationRows) <= totalRows,
      "Invalid ledger coverage",
    )
    .optional(),
};
const regionalBreakdowns = z
  .array(z.object({ label: z.string(), ...regionalMetrics }))
  .optional();
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
    factors: z.array(factor).optional(),
  })
  .passthrough();
const kpi = z
  .object({ value: range, unit: z.string(), kind: z.string(), calc: calculation, marketCoverage })
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
    savingsCo2KgMarketRange: range.nullable().optional(),
    marketCoverage,
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
    decision: measureDecision,
  })
  .passthrough();
const simulation = z
  .object({
    savingsChf: number,
    savingsKwh: number,
    savingsCo2Kg: number,
    savingsCo2KgMarket: number.nullable().optional(),
    savingsCo2KgMarketRange: range.nullable().optional(),
    marketCoverage,
    marketSavings,
    effortDays: number,
    effortChf: number,
    includedMeasureIds: z.array(z.string()).optional(),
    firstYearGrossChf: number.optional(),
    firstYearNetChf: number.optional(),
    conservativeCo2Pct: number.nullable().optional(),
    costHeadroomChf: number.nullable().optional(),
    co2HeadroomKg: number.nullable().optional(),
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
    ...marketObservation,
  })
  .passthrough();
const arrayOfBreakdowns = z.array(breakdown).default([]);
const exportsSchema = z.object({
  filename: z.string(),
  csv: z.string(),
  issues: list,
  submittable: z.boolean(),
});
const forecastPoint = z.object({
  year: number,
  date: z.string().optional(),
  periodLabel: z.string().optional(),
  coverage: z.string().optional(),
  baseline: range,
  optimized: range.nullable(),
  observed: number.nullable().optional(),
  marketCoverage,
}).passthrough();

const responseSchemas: Record<string, z.ZodTypeAny> = {
  "/overview": z
    .object({
      baselinePeriod: z.string(),
      cost: kpi,
      energy: kpi,
      co2Location: kpi,
      co2Market: kpi.nullable().optional(),
      marketCoverage,
      monthly: z
        .array(
          z
            .object({
              month: z.string(),
              costChf: number.nullable(),
              energyKwh: number.nullable(),
              co2Kg: number.nullable(),
              ...marketObservation,
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
  "/locations": z.array(
    z.object({
      id: z.enum(["zurich", "frankfurt", "dublin", "eu-mixed", "unknown"]),
      label: z.string(),
      country: z.string(),
      lat: number.min(-90).max(90).nullable(),
      lng: number.min(-180).max(180).nullable(),
      resourceCount: count,
      ...regionalMetrics,
      gridKgPerKwh: range.nullable(),
      carbonIntensityIndex: number.min(0).nullable().optional(),
      gridFactorEvidence: z
        .object({ source: z.string(), note: z.string() })
        .nullable()
        .optional(),
      sources: evidence.optional(),
      period: z.string().optional(),
      providers: list,
      risks: list,
      breakdowns: z
        .object({
          byDepartment: regionalBreakdowns,
          byProvider: regionalBreakdowns,
          byTool: regionalBreakdowns,
          byService: regionalBreakdowns,
        })
        .optional(),
    }),
  ),
  "/resources": z.array(
    z
      .object({
        id: z.string(),
        name: z.string(),
        runtimeH30d: number.nullable().default(null),
        activeH30d: number.nullable().optional(),
        unclassifiedRuntimeH30d: number.nullable().optional(),
        runtimeEvidence: z.object({
          from: z.string(), through: z.string(), source: z.string().nullable(), method: z.string(),
          observedDays: number.nullable(), cpuSource: z.string().nullable(), gpuSource: z.string().nullable(),
        }).optional(),
        idleCostChfYear: number.nullable().default(null),
        provider: z.string().default("Not supplied"),
        location: z.string().default("Not supplied"),
        environment: z.string().default("Not supplied"),
        department: z.string().default("Not supplied"),
        criticality: z.string().default("unknown"),
        cpuAvgPct: number.nullable().optional(),
        gpuAvgPct: number.nullable().optional(),
        cost: kpi.nullable().optional(),
        energy: kpi.nullable().optional(),
        co2Location: kpi.nullable().optional(),
        co2Market: kpi.nullable().optional(),
        marketCoverage,
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
        decision: measureDecision,
      })
      .passthrough(),
  ),
  "/simulation": simulation,
  "/optimize": z.object({ measureIds: list, result: simulation, searchComplete: z.boolean().optional() }),
  "/forecast": z
    .object({
      metric: z.enum(["cost", "energy", "co2Location", "co2Market"]),
      unit: z.string(),
      growthAssumption: z.string().default("Not supplied"),
      points: z.array(forecastPoint),
      annualTotals: z.array(forecastPoint).optional(),
      drivers: z.array(z.object({
        date: z.string(), label: z.string(), source: z.string(), amount: number,
        basis: z.enum(["annual", "one-time"]),
      })).optional(),
      granularity: z.enum(["monthly", "annual"]).optional(),
      methodology: calculation.optional(),
      marketCoverage,
      marketSavings,
    })
    .passthrough(),
  "/metrics/daily": z.array(
    z
      .object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        costChf: number.nullable(),
        energyKwh: number.nullable(),
        co2Kg: number.nullable(),
        ...marketObservation,
        workday: z.boolean(),
        coverage: z.enum(["measured", "allocated", "estimated", "unavailable"]),
        contributors: z.array(z.object({ label: z.string(), co2Kg: number })).default([]),
      })
      .passthrough(),
  ),
  "/data-quality": z.object({
    version: z.string(),
    datasetName: z.string().optional(),
    asOf: z.string().optional(),
    importedAt: z.string().optional(),
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
      details: z.string().optional(),
      assistant: z.string().optional(),
      tables: z.array(z.object({
        title: z.string(),
        columns: z.array(z.string()).min(1).max(6),
        rows: z.array(z.array(z.string()).max(6)).max(10),
      })).max(2).optional(),
      actions: z
        .array(
          z.discriminatedUnion("type", [
            z.object({
              type: z.literal("navigate"),
              to: z.string(),
              hash: z.string().optional(),
              label: z.string(),
            }),
            z.object({
              type: z.literal("setFilters"),
              label: z.string(),
              department: z.string().optional(),
              provider: z.string().optional(),
              from: z
                .string()
                .regex(/^\d{4}-\d{2}$/)
                .optional(),
              to: z
                .string()
                .regex(/^\d{4}-\d{2}$/)
                .optional(),
            }),
            z.object({
              type: z.literal("setRole"),
              role: z.enum(["ceo", "cfo", "it"]),
              label: z.string(),
            }),
            z.object({
              type: z.literal("stagePlan"),
              measureIds: z.array(z.string()).max(30),
              budgetChf: number,
              priority: z.enum(["balanced", "cost", "co2"]),
              label: z.string(),
            }),
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
