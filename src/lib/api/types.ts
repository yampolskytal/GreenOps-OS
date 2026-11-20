/** Contract between this frontend and the teammates' backend. Keep field names stable. */
export type Role = "ceo" | "cfo" | "it";
export type Location = "CH" | "DE" | "IE" | "EU-mixed";
export type Category = "Cloud" | "Servers" | "AI" | "SaaS" | "Data platform";

export interface Range { low: number; mid: number; high: number }

export interface Baseline {
  period: string; // "2025-09 .. 2026-08"
  costChf: Range;
  energyKwh: Range;
  co2KgLocation: Range;
  co2KgMarket?: Range;
}

export interface Measure {
  id: string;
  description: string;
  resource: string;
  change: string;
  category: Category;
  effortPersonDays: number;
  savingsChf: number;
  savingsKwh: number;
  savingsCo2KgLocation: number;
  risks: string;
  assumptions: string;
  needsHumanDecision: boolean;
  owner: string;
}

export interface Driver { label: string; category: Category; location: Location; costChf: number; co2Kg: number; source: string }
export interface DeptRow { department: string; costChf: number; co2Kg: number; fte: number }
export interface MonthPoint { month: string; costChf: number; co2Kg: number }

export interface Finding {
  id: string;
  kind: "waste" | "contradiction" | "protection-window" | "handover";
  title: string;
  detail: string;
  sources: string[];
  severity: "low" | "medium" | "high";
}

export interface ExecutiveOverview {
  baseline: Baseline;
  targets: { co2Pct: number; costPct: number; budgetChf: number; chfPerPersonDay: number };
  package: Measure[];
  byCategory: { category: Category; costChf: number; co2Kg: number }[];
  byLocation: { location: Location; co2Kg: number; gridKgPerKwh: number }[];
  findings: Finding[];
}

export interface FinanceView {
  monthly: MonthPoint[];
  byDepartment: DeptRow[];
  topDrivers: Driver[];
  idleSeats: { product: string; purchased: number; active: number; monthlyWasteChf: number; noticeDays: number; contractEnd: string }[];
  currencyMix: { currency: "CHF" | "EUR" | "USD"; sharePct: number }[];
  allocationRule: string;
}

export interface ServerRow {
  id: string; provider: "Azure" | "AWS" | "Hoster"; region: string; location: Location;
  vcpu: number; cpuAvgPct: number; uptimeH30d: number; environment: "prod" | "test" | "dev";
  criticality: "high" | "medium" | "low"; lastLogin: string; flag?: string;
}

export interface ItView {
  servers: ServerRow[];
  gpu: { id: string; gpuAvgPct: number; uptimeH30d: number; costChfYear: number; location: Location };
  platform: { cluster: string; runtimeH: number; activeH: number; protectedWindows: string[] }[];
  ai: { model: string; provider: string; tokensM: number; costChf: number }[];
  findings: Finding[];
}

export interface DashboardApi {
  readonly isMock: boolean;
  getExecutiveOverview(): Promise<ExecutiveOverview>;
  getFinanceView(): Promise<FinanceView>;
  getItView(): Promise<ItView>;
}
