/**
 * Contract between the GreenOps OS frontend and the team backend.
 * Proposed shapes — align with the backend endpoint spec when it arrives.
 */
export type Role = "ceo" | "cfo" | "it";
export type LocationId = "zurich" | "frankfurt" | "dublin" | "eu-mixed";
export type ServiceType = "Cloud" | "Servers" | "AI" | "SaaS" | "Data platform";
export type Provider =
  "Azure" | "AWS" | "Swiss hoster" | "Anthropic" | "OpenAI" | "Microsoft" | "Other SaaS";
export type RiskLevel = "low" | "review" | "blocked";
/** How a number was obtained — always shown to the user. */
export type ValueKind =
  "measured" | "financial" | "estimated" | "modeled" | "simulated" | "forecast";

export interface Range {
  low: number;
  mid: number;
  high: number;
}

export interface Calculation {
  title: string;
  formula: string;
  inputs: { label: string; value: string }[];
  units: string;
  sources: string[];
  period: string;
  factors?: { label: string; low: string; mid: string; high: string; source: string }[];
  assumptions: string[];
  limitations: string[];
  kind: ValueKind;
}

export interface GlobalQuery {
  datasetVersion: string;
  from: string; // YYYY-MM
  to: string; // YYYY-MM
  department: string | "all";
  provider: string | "all";
}

export interface Kpi {
  value: Range;
  unit: string;
  kind: ValueKind;
  calc: Calculation;
  coverage?: string;
  region?: string;
  entity?: string;
  missingInputs?: string[];
  procurementAssumptions?: string[];
}

export type DataStatus =
  "source-backed" | "allocated" | "estimated" | "needs-review" | "unavailable" | "demo";
export type HistoricalMetric = "costChf" | "co2Kg" | "energyKwh" | "co2KgMarket";
export interface MonthlyObservation {
  month: string;
  costChf: number | null;
  energyKwh: number | null;
  co2Kg: number | null;
  co2KgMarket?: number | null;
  status?: DataStatus;
  evidence?: Partial<Record<HistoricalMetric, Calculation>>;
  previous?: Partial<Record<HistoricalMetric, { value: number; period: string }>>;
}

export interface Overview {
  baselinePeriod: string;
  cost: Kpi;
  energy: Kpi;
  co2Location: Kpi;
  co2Market?: Kpi | null;
  monthly: MonthlyObservation[];
  forecastSupport?: { metric: Forecast["metric"]; horizons: number[] }[];
  topOpportunities: string[]; // measure ids
  managementRisks: { title: string; detail: string; level: RiskLevel }[];
}

export interface Breakdown {
  label: string;
  costChf: number | null;
  co2Kg: number | null;
  energyKwh: number | null;
  co2KgMarket?: number | null;
}
export interface Breakdowns {
  byDepartment: Breakdown[];
  byProvider: Breakdown[];
  byService: Breakdown[];
  byTool: Breakdown[];
  allocationRule: string;
}

export interface ResourceSummary {
  id: string;
  name: string;
  provider: Provider;
  location: LocationId;
  environment: "prod" | "test" | "dev";
  department: string;
  criticality: "high" | "medium" | "low";
  vcpu?: number;
  cpuAvgPct?: number;
  gpuAvgPct?: number;
  runtimeH30d: number | null;
  activeH30d?: number | null;
  idleCostChfYear: number | null;
  flag?: string;
  co2Location?: Kpi | null;
  co2Market?: Kpi | null;
}

export interface LocationSummary {
  id: LocationId;
  label: string;
  country: string;
  lat: number;
  lng: number;
  resourceCount: number;
  costChf: number;
  energyKwh: number;
  co2KgLocation: number;
  co2KgMarket: number;
  gridKgPerKwh: Range;
  providers: string[];
  risks: string[];
}

export interface Evidence {
  source: string;
  detail: string;
}

export interface Measure {
  id: string;
  title: string;
  description: string;
  resource: string;
  change: string;
  service: ServiceType;
  effortPersonDays: number;
  savingsChf: number;
  savingsKwh: number;
  savingsCo2KgLocation: number;
  savingsCo2KgMarket: number;
  risk: {
    level: RiskLevel;
    why: string;
    consequences: string;
    protectionWindows: string[];
    conflicts: string[];
    approver?: string;
  };
  evidence: Evidence[];
  assumptions: string[];
  includable: boolean;
}

export interface Finding {
  id: string;
  title: string;
  description: string;
  resource: string;
  category:
    | "servers"
    | "data-platform"
    | "saas"
    | "ai-licences"
    | "ai-models"
    | "ci"
    | "logs"
    | "reports"
    | "redundancy"
    | "conflict";
  impactChfYear: number | null;
  impactKwhYear: number | null;
  impactCo2KgYear: number | null;
  evidence: Evidence[];
  assumptions: string[];
  risk: RiskLevel;
  action: string;
  measureId?: string;
}

export interface SimulationInput {
  measureIds: string[];
  budgetChf: number;
  chfPerPersonDay: number;
}
export interface Constraint {
  label: string;
  achieved: number;
  target: number;
  unit: "%" | "CHF" | "PD";
  direction: "atLeast" | "atMost";
  met: boolean;
}
export interface SimulationResult {
  savingsChf: number;
  savingsKwh: number;
  savingsCo2Kg: number;
  savingsCo2KgMarket?: number | null;
  effortDays: number;
  effortChf: number;
  costReductionPct: number;
  co2ReductionPct: number;
  constraints: Constraint[];
  feasible: boolean;
  reasons: string[];
  excluded: { id: string; reason: string }[];
  paybackMonths: number | null;
}
export type Priority = "balanced" | "cost" | "co2";
export interface OptimizeInput {
  budgetChf: number;
  priority: Priority;
  chfPerPersonDay: number;
}
export interface OptimizeResult {
  measureIds: string[];
  result: SimulationResult;
}

export interface ForecastPoint {
  year: number;
  date?: string;
  periodLabel?: string;
  coverage?: string;
  baseline: Range;
  optimized: Range;
  observed?: number | null;
}
export interface Forecast {
  metric: "cost" | "energy" | "co2Location" | "co2Market";
  unit: string;
  growthAssumption: string;
  points: ForecastPoint[];
  granularity?: "monthly" | "annual";
  methodology?: Calculation;
  implementationTiming?: string;
}

export interface DailyFootprint {
  date: string;
  costChf: number | null;
  energyKwh: number | null;
  co2Kg: number | null;
  co2KgMarket?: number | null;
  workday: boolean;
  holiday?: string;
  coverage: "measured" | "allocated" | "estimated" | "unavailable";
  contributors: { label: string; co2Kg: number }[];
}

export interface DatasetHealth {
  file: string;
  kind: "core" | "bonus";
  rows: number;
  coverage: string;
  latest: string;
  missing: number;
  duplicates: number;
  conflicts: number;
  unmapped: number;
  drafts: number;
  status: "ok" | "warning" | "error";
}
export interface DataQuality {
  version: string;
  importedAt: string;
  datasets: DatasetHealth[];
  conflicts: { title: string; sources: string[] }[];
}

export interface ImportResult {
  accepted: boolean;
  datasetVersion?: string;
  message: string;
  issues: string[];
}

export type ChatAction =
  | { type: "navigate"; to: string; hash?: string; label: string }
  | {
      type: "setFilters";
      label: string;
      department?: string;
      provider?: string;
      from?: string;
      to?: string;
    }
  | { type: "setRole"; role: Role; label: string }
  | {
      type: "stagePlan";
      measureIds: string[];
      budgetChf: number;
      priority: Priority;
      label: string;
    }
  | { type: "highlight"; resourceId: string; label: string }
  | { type: "openMeasure"; measureId: string; label: string }
  | { type: "openSimulation"; label: string };
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  evidence?: Evidence[];
  calculation?: string;
  actions?: ChatAction[];
  demo?: boolean;
  /** Opaque follow-up context returned by the backend assistant; sent back with the history. */
  context?: unknown;
}

export interface ExportFile {
  filename: string;
  csv: string;
  issues: string[];
  submittable: boolean;
}

export interface CarbonJob {
  job: string;
  window: "fixed" | "flexible";
  currentStart: string;
  suggestedStart: string;
  co2SavedKgYear: number;
}
export interface PipelineInsight {
  label: string;
  value: string;
  detail: string;
}
export interface ClusterGroup {
  name: string;
  members: number;
  description: string;
  outliers: string[];
}

export interface Bonus {
  carbonJobs: CarbonJob[];
  pipelines: PipelineInsight[];
  clusters: ClusterGroup[];
  aiModels: { model: string; provider: string; tokensM: number; costChf: number; share: number }[];
  seats: { product: string; purchased: number; active: number; wasteChfMonth: number }[];
}

export interface GreenOpsApi {
  readonly isDemo: boolean;
  getOverview(q: GlobalQuery): Promise<Overview>;
  getBreakdowns(q: GlobalQuery): Promise<Breakdowns>;
  getResources(q: GlobalQuery): Promise<ResourceSummary[]>;
  getLocations(q: GlobalQuery): Promise<LocationSummary[]>;
  getFindings(q: GlobalQuery): Promise<Finding[]>;
  getMeasures(q: GlobalQuery): Promise<Measure[]>;
  simulate(q: GlobalQuery, input: SimulationInput): Promise<SimulationResult>;
  optimize(q: GlobalQuery, input: OptimizeInput): Promise<OptimizeResult>;
  getForecast(
    q: GlobalQuery,
    metric: Forecast["metric"],
    horizonYears: number,
    measureIds?: string[],
  ): Promise<Forecast>;
  getDailyFootprint(q: GlobalQuery): Promise<DailyFootprint[]>;
  getDataQuality(q: GlobalQuery): Promise<DataQuality>;
  getBonus(q: GlobalQuery): Promise<Bonus>;
  importFiles(files: File[]): Promise<ImportResult>;
  chat(q: GlobalQuery, history: ChatMessage[]): Promise<ChatMessage>;
  exportBaseline(q: GlobalQuery): Promise<ExportFile>;
  exportMeasures(q: GlobalQuery, measureIds: string[]): Promise<ExportFile>;
}
