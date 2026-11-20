/**
 * DEMO DATA — illustrative placeholders, NOT computed from the hackathon dataset.
 * Every screen that renders these shows a DEMO marker. Replace via the HTTP adapter.
 */
import type { Bonus, Breakdowns, Calculation, DataQuality, DailyFootprint, Finding, LocationSummary, Measure, Overview, ResourceSummary } from "./types";

export const DEMO_BASELINE = { costChf: 428000, co2Kg: 13400, energyKwh: 78000 };

const grid = [
  { label: "Grid mix Switzerland", low: "0.03", mid: "0.04", high: "0.13", source: "to research (e.g. Electricity Maps / BAFU) — demo value" },
  { label: "Grid mix Germany", low: "0.33", mid: "0.38", high: "0.45", source: "to research (UBA) — demo value" },
  { label: "Grid mix Ireland", low: "0.25", mid: "0.29", high: "0.35", source: "to research (SEAI / EirGrid) — demo value" },
  { label: "PUE", low: "1.2", mid: "1.35", high: "1.6", source: "to research — demo value" },
];
const calc = (title: string, formula: string, units: string, kind: Calculation["kind"], sources: string[], extra: Partial<Calculation> = {}): Calculation => ({
  title, formula, units, kind, sources, period: "Sep 2025 – Aug 2026", inputs: [], assumptions: ["Demo placeholder until backend delivers the calculation."], limitations: ["Synthetic dataset; data-quality issues (duplicates, drafts, missing tags) handled by backend."], ...extra,
});

export const demoOverview: Overview = {
  baselinePeriod: "Sep 2025 – Aug 2026",
  cost: { value: { low: 402000, mid: 428000, high: 455000 }, unit: "CHF", kind: "financial", calc: calc("Total annual digital cost", "Σ cloud + hoster + AI usage + AI subscriptions + SaaS, converted to CHF at monthly ECB rate", "CHF / year", "financial", ["azure_costs.csv", "aws_costs.csv", "hoster_invoice.csv", "ai_usage.csv", "ai_subscriptions.csv", "saas_contracts.csv", "exchange_rates.csv"], { inputs: [{ label: "Cloud (Azure + AWS)", value: "CHF 118,000" }, { label: "Servers & hoster", value: "CHF 96,000" }, { label: "AI", value: "CHF 71,000" }, { label: "SaaS", value: "CHF 104,000" }, { label: "Data platform", value: "CHF 39,000" }] }) },
  energy: { value: { low: 61000, mid: 78000, high: 99000 }, unit: "kWh", kind: "estimated", calc: calc("Estimated energy", "(vCPU-h × kWh/vCPU-h + node-h × kWh/node-h + GPU-h × kWh/GPU-h + GB-days × kWh/GB-day + tokens × kWh/1k + messages × kWh/msg) × PUE", "kWh / year", "estimated", ["server_metrics_weekly.csv", "data_platform_usage.csv", "ai_usage.csv", "ai_subscriptions.csv"], { factors: [grid[3]!, { label: "kWh per vCPU-hour", low: "0.004", mid: "0.008", high: "0.015", source: "to research — demo" }, { label: "kWh per GPU-hour", low: "0.3", mid: "0.45", high: "0.7", source: "to research — demo" }] }) },
  co2Location: { value: { low: 9800, mid: 13400, high: 18100 }, unit: "kg CO₂", kind: "modeled", calc: calc("Location-based CO₂", "Σ energy per location × grid mix of that location", "kg CO₂ / year", "modeled", ["server_inventory.csv", "extra/data_center_locations.csv"], { factors: grid.slice(0, 3) }) },
  co2Market: { value: { low: 2100, mid: 3600, high: 5200 }, unit: "kg CO₂", kind: "modeled", calc: calc("Market-based CO₂ (bonus)", "Σ energy × provider-reported residual / contractual factor", "kg CO₂ / year", "modeled", ["provider sustainability reports — to research"]) },
  monthly: ["2025-09","2025-10","2025-11","2025-12","2026-01","2026-02","2026-03","2026-04","2026-05","2026-06","2026-07","2026-08"].map((month, i) => ({
    month, costChf: 34200 + Math.round(Math.sin(i / 1.6) * 2600) + i * 210, energyKwh: 6300 + Math.round(Math.cos(i / 2.1) * 480), co2Kg: 1080 + Math.round(Math.cos(i / 2) * 130),
  })),
  topOpportunities: ["M3", "M1", "M4"],
  managementRisks: [
    { title: "Production platform must stay on at month-end", detail: "Finance closes the books on the last 3 workdays incl. evenings. A night shutdown is blocked until the CFO decides.", level: "blocked" },
    { title: "Moving the dev cluster needs CTO approval", detail: "Data residency and short downtime must be accepted by the CTO.", level: "review" },
    { title: "Copilot contract has 90 days notice", detail: "Seat reduction only takes effect after the notice period.", level: "review" },
  ],
};

export const demoBreakdowns: Breakdowns = {
  byDepartment: [
    ["Consulting", 162000, 5900, 33000], ["IT", 98000, 4300, 24000], ["Sales", 47000, 900, 5200], ["Marketing", 39000, 1100, 6100],
    ["Finance", 31000, 500, 3100], ["HR", 18000, 200, 1500], ["Management", 14000, 200, 1300], ["Shared (allocated)", 19000, 300, 3800],
  ].map(([label, costChf, co2Kg, energyKwh]) => ({ label: label as string, costChf: costChf as number, co2Kg: co2Kg as number, energyKwh: energyKwh as number })),
  byProvider: [
    { label: "Azure", costChf: 121000, co2Kg: 6900, energyKwh: 31000 }, { label: "AWS", costChf: 58000, co2Kg: 3300, energyKwh: 12500 },
    { label: "Swiss hoster", costChf: 39000, co2Kg: 400, energyKwh: 9800 }, { label: "Microsoft 365", costChf: 64000, co2Kg: 300, energyKwh: 4100 },
    { label: "Anthropic", costChf: 44000, co2Kg: 900, energyKwh: 5600 }, { label: "OpenAI", costChf: 27000, co2Kg: 600, energyKwh: 3900 },
    { label: "Other SaaS", costChf: 75000, co2Kg: 1000, energyKwh: 11100 },
  ],
  byService: [
    { label: "Cloud", costChf: 118000, co2Kg: 3900, energyKwh: 19000 }, { label: "Servers", costChf: 96000, co2Kg: 6300, energyKwh: 26000 },
    { label: "AI", costChf: 71000, co2Kg: 1500, energyKwh: 9500 }, { label: "SaaS", costChf: 104000, co2Kg: 500, energyKwh: 13500 },
    { label: "Data platform", costChf: 39000, co2Kg: 1200, energyKwh: 10000 },
  ],
  byTool: [
    { label: "GPU server", costChf: 31200, co2Kg: 4100, energyKwh: 10800 }, { label: "Test environments", costChf: 34100, co2Kg: 2300, energyKwh: 7900 },
    { label: "Customer portal", costChf: 28400, co2Kg: 600, energyKwh: 5200 }, { label: "Data platform", costChf: 39000, co2Kg: 1200, energyKwh: 10000 },
    { label: "Power BI", costChf: 12600, co2Kg: 200, energyKwh: 1900 },
  ],
  allocationRule: "Direct costs via tags, cost centre or master data; shared licences split by FTE (headcount.csv); anything unresolvable stays visible as 'Shared'.",
};

export const demoResources: ResourceSummary[] = [
  { id: "vm-gpu-01", name: "GPU server", provider: "Azure", location: "frankfurt", environment: "prod", department: "Consulting", criticality: "medium", vcpu: 24, cpuAvgPct: 6, gpuAvgPct: 4, runtimeH30d: 720, activeH30d: 31, idleCostChfYear: 29900, flag: "GPU busy 4% of the time, never switched off" },
  { id: "aws-test-07", name: "Test VM portal", provider: "AWS", location: "dublin", environment: "test", department: "IT", criticality: "low", vcpu: 4, cpuAvgPct: 3, runtimeH30d: 720, activeH30d: 40, idleCostChfYear: 3400, flag: "No login for 6 months" },
  { id: "aws-test-11", name: "Test VM shop", provider: "AWS", location: "dublin", environment: "test", department: "IT", criticality: "low", vcpu: 8, cpuAvgPct: 9, runtimeH30d: 720, activeH30d: 210, idleCostChfYear: 5100, flag: "Runs nights & weekends" },
  { id: "az-app-02", name: "App server", provider: "Azure", location: "zurich", environment: "prod", department: "IT", criticality: "high", vcpu: 16, cpuAvgPct: 7, runtimeH30d: 720, activeH30d: 720, idleCostChfYear: 6200, flag: "Oversized for its load" },
  { id: "az-db-01", name: "Database", provider: "Azure", location: "zurich", environment: "prod", department: "IT", criticality: "high", vcpu: 8, cpuAvgPct: 41, runtimeH30d: 720, activeH30d: 720, idleCostChfYear: 0 },
  { id: "host-web-03", name: "Webshop (hoster)", provider: "Swiss hoster", location: "zurich", environment: "prod", department: "Sales", criticality: "high", vcpu: 4, cpuAvgPct: 22, runtimeH30d: 720, activeH30d: 720, idleCostChfYear: 0 },
  { id: "az-dev-05", name: "Dev VM analytics", provider: "Azure", location: "frankfurt", environment: "dev", department: "Consulting", criticality: "low", vcpu: 8, cpuAvgPct: 2, runtimeH30d: 698, activeH30d: 12, idleCostChfYear: 4300, flag: "Owner left company?" },
  { id: "dbx-prod", name: "Data platform (prod)", provider: "Azure", location: "zurich", environment: "prod", department: "Consulting", criticality: "high", runtimeH30d: 720, activeH30d: 212, idleCostChfYear: 11800, flag: "Runs 24/7, used 30% of the time" },
  { id: "dbx-dev", name: "Data platform (dev)", provider: "Azure", location: "frankfurt", environment: "dev", department: "Consulting", criticality: "low", runtimeH30d: 560, activeH30d: 96, idleCostChfYear: 7400, flag: "Abroad, mostly idle" },
];

export const demoLocations: LocationSummary[] = [
  { id: "zurich", label: "Zurich area", country: "Switzerland", lat: 47.37, lng: 8.54, resourceCount: 31, costChf: 214000, energyKwh: 39000, co2KgLocation: 1600, co2KgMarket: 700, gridKgPerKwh: { low: 0.03, mid: 0.04, high: 0.13 }, providers: ["Azure", "Swiss hoster"], risks: ["Production platform & database — critical"] },
  { id: "frankfurt", label: "Frankfurt area", country: "Germany", lat: 50.11, lng: 8.68, resourceCount: 9, costChf: 72000, energyKwh: 20000, co2KgLocation: 7600, co2KgMarket: 1600, gridKgPerKwh: { low: 0.33, mid: 0.38, high: 0.45 }, providers: ["Azure"], risks: ["GPU server used by project P007"] },
  { id: "dublin", label: "Dublin area", country: "Ireland", lat: 53.35, lng: -6.26, resourceCount: 13, costChf: 58000, energyKwh: 11400, co2KgLocation: 3300, co2KgMarket: 900, gridKgPerKwh: { low: 0.25, mid: 0.29, high: 0.35 }, providers: ["AWS"], risks: ["Backup archive retention unclear"] },
  { id: "eu-mixed", label: "EU (AI & SaaS, mixed)", country: "EU", lat: 50.5, lng: 4.5, resourceCount: 22, costChf: 84000, energyKwh: 7600, co2KgLocation: 900, co2KgMarket: 400, gridKgPerKwh: { low: 0.2, mid: 0.25, high: 0.3 }, providers: ["Anthropic", "OpenAI", "Microsoft", "SaaS vendors"], risks: [] },
];

const ev = (source: string, detail: string) => ({ source, detail });
const m = (x: Omit<Measure, "includable"> & { includable?: boolean }): Measure => ({ includable: true, ...x });
export const demoMeasures: Measure[] = [
  m({ id: "M1", title: "Start the GPU server only when needed", description: "Switch off after 30 min idle, start on request.", resource: "vm-gpu-01 (Frankfurt)", change: "Auto-shutdown + start via ticket, from Oct 2026", service: "Servers", effortPersonDays: 2, savingsChf: 21400, savingsKwh: 8400, savingsCo2KgLocation: 3200, savingsCo2KgMarket: 600, risk: { level: "low", why: "Non-critical; few active users.", consequences: "Start-up wait of ~5 min.", protectionWindows: ["Booked training runs for project P007"], conflicts: [], approver: "IT Manager" }, evidence: [ev("server_metrics_weekly.csv", "GPU busy ~4% on average"), ev("it_tickets.csv", "2 requests for GPU access in 6 months")], assumptions: ["0.3–0.7 kWh per GPU-hour", "German grid 0.33–0.45 kg/kWh"] }),
  m({ id: "M2", title: "Move dev data platform to Zurich", description: "Re-deploy the development cluster in Switzerland.", resource: "dbx-dev (Frankfurt)", change: "Re-deploy in Q4 2026", service: "Data platform", effortPersonDays: 4, savingsChf: 6800, savingsKwh: 2100, savingsCo2KgLocation: 1500, savingsCo2KgMarket: 200, risk: { level: "review", why: "Data residency and migration downtime.", consequences: "1–2 days without dev environment.", protectionWindows: [], conflicts: [], approver: "CTO" }, evidence: [ev("data_platform_usage.csv", "Active ~17% of runtime")], assumptions: ["Swiss grid 0.03–0.13 kg/kWh"] }),
  m({ id: "M3", title: "Cancel unused AI and SaaS seats", description: "Reduce seats to active users + 10% at the next notice date.", resource: "AI subscriptions, SaaS contracts", change: "Reduce at contract notice dates", service: "SaaS", effortPersonDays: 1.5, savingsChf: 38600, savingsKwh: 900, savingsCo2KgLocation: 160, savingsCo2KgMarket: 80, risk: { level: "low", why: "Seats can be re-added.", consequences: "Some users must request access again.", protectionWindows: [], conflicts: ["Copilot: 90-day notice"], approver: "CFO" }, evidence: [ev("ai_subscriptions.csv", "Seats bought vs active in last 30 days"), ev("saas_contracts.csv", "Notice periods")], assumptions: ["List prices; ECB monthly rates"] }),
  m({ id: "M4", title: "Switch off test machines at night and weekends", description: "Schedule 19:00–07:00 and weekends off.", resource: "14 test/dev VMs (Dublin)", change: "Schedule from Oct 2026", service: "Cloud", effortPersonDays: 2, savingsChf: 24900, savingsKwh: 4800, savingsCo2KgLocation: 1400, savingsCo2KgMarket: 300, risk: { level: "low", why: "Test only.", consequences: "Manual start needed for late releases.", protectionWindows: ["Release weeks (change tickets)"], conflicts: [], approver: "IT Manager" }, evidence: [ev("aws_costs.csv", "Billed 24/7"), ev("business_calendar.csv", "Workdays only needed")], assumptions: ["Irish grid 0.25–0.35 kg/kWh"] }),
  m({ id: "M5", title: "Use smaller AI models for simple tasks", description: "Route classification and short summaries to small models.", resource: "AI gateway", change: "Gateway routing rule", service: "AI", effortPersonDays: 3, savingsChf: 14800, savingsKwh: 2600, savingsCo2KgLocation: 600, savingsCo2KgMarket: 300, risk: { level: "review", why: "Answer quality could drop.", consequences: "Rework for consultants.", protectionWindows: [], conflicts: [], approver: "Head of Consulting" }, evidence: [ev("ai_usage.csv", "Large models used for classification")], assumptions: ["Energy per token scales with model size — to research"] }),
  m({ id: "M6", title: "Right-size oversized servers", description: "Halve vCPUs on servers with low load.", resource: "9 VMs < 10% CPU", change: "At next maintenance window", service: "Servers", effortPersonDays: 2.5, savingsChf: 11200, savingsKwh: 1700, savingsCo2KgLocation: 400, savingsCo2KgMarket: 100, risk: { level: "low", why: "Peaks checked per week.", consequences: "Possible slowdowns if peaks grow.", protectionWindows: ["Release freeze week 38"], conflicts: ["az-app-02: env differs between inventory and tags"], approver: "IT Manager" }, evidence: [ev("server_metrics_weekly.csv", "Weekly CPU peaks < 35%")], assumptions: [] }),
  m({ id: "M7", title: "Switch off production platform at night", description: "Stop the production cluster 22:00–06:00 and weekends.", resource: "dbx-prod (Zurich)", change: "Schedule", service: "Data platform", effortPersonDays: 1.5, savingsChf: 18000, savingsKwh: 2900, savingsCo2KgLocation: 120, savingsCo2KgMarket: 60, includable: false, risk: { level: "blocked", why: "Month-end close and the 06:00 daily load need the platform.", consequences: "Finance reports late; customer dashboards empty.", protectionWindows: ["Last 3 workdays of each month", "Daily 06:00 load"], conflicts: ["Ticket says 'never used at night', usage logs show evening queries"], approver: "CFO + CTO" }, evidence: [ev("data_platform_usage.csv", "Queries until 23:00 at month-end"), ev("it_tickets.csv", "Incident after a past shutdown")], assumptions: [] }),
  m({ id: "M8", title: "Skip nightly builds without changes", description: "Only build at night when there were new commits.", resource: "8 repositories", change: "Pipeline condition", service: "Cloud", effortPersonDays: 1, savingsChf: 3100, savingsKwh: 1100, savingsCo2KgLocation: 330, savingsCo2KgMarket: 60, risk: { level: "low", why: "No functional change.", consequences: "None expected.", protectionWindows: [], conflicts: [], approver: "IT Manager" }, evidence: [ev("extra/ci_pipeline_runs.jsonl", "~40% of nightly runs had no new commits")], assumptions: [] }),
  m({ id: "M9", title: "Shorten log retention", description: "Keep debug logs 30 instead of 90 days.", resource: "20 services", change: "Retention policy", service: "Cloud", effortPersonDays: 1, savingsChf: 4200, savingsKwh: 600, savingsCo2KgLocation: 90, savingsCo2KgMarket: 30, risk: { level: "review", why: "Some logs may have legal retention.", consequences: "Compliance breach if wrong.", protectionWindows: [], conflicts: [], approver: "Data protection officer" }, evidence: [ev("extra/log_volume.csv", "Retention 90 days on all services")], assumptions: [] }),
  m({ id: "M10", title: "Stop refreshing unused reports", description: "Pause refresh for reports nobody opened in 90 days.", resource: "Power BI reports", change: "Disable schedule", service: "SaaS", effortPersonDays: 1, savingsChf: 2400, savingsKwh: 300, savingsCo2KgLocation: 40, savingsCo2KgMarket: 20, risk: { level: "low", why: "Reports remain available.", consequences: "Stale data if someone opens them.", protectionWindows: [], conflicts: [], approver: "Finance" }, evidence: [ev("extra/powerbi_usage.csv", "Refreshed daily, zero views")], assumptions: [] }),
  m({ id: "M11", title: "Move test environments to Zurich", description: "Relocate Dublin test workloads to Switzerland.", resource: "Test envs (Dublin)", change: "Migration in Q1 2027", service: "Cloud", effortPersonDays: 3, savingsChf: 2000, savingsKwh: 0, savingsCo2KgLocation: 1100, savingsCo2KgMarket: 100, risk: { level: "review", why: "Zurich prices are higher per vCPU-hour.", consequences: "Slightly higher unit cost.", protectionWindows: [], conflicts: [], approver: "CTO" }, evidence: [ev("aws_costs.csv", "eu-west-1 vs eu-central-2 list prices")], assumptions: [] }),
  m({ id: "M12", title: "Run flexible jobs in low-carbon hours", description: "Shift flexible batch jobs to hours with cleaner power.", resource: "Data platform jobs", change: "Scheduler windows", service: "Data platform", effortPersonDays: 2, savingsChf: 800, savingsKwh: 0, savingsCo2KgLocation: 350, savingsCo2KgMarket: 0, risk: { level: "low", why: "Only jobs marked flexible.", consequences: "Results ready later in the day.", protectionWindows: ["Fixed-window jobs untouched"], conflicts: [], approver: "IT Manager" }, evidence: [ev("extra/data_platform_jobs.csv", "time_window = flexible")], assumptions: ["Hourly grid intensity — to research"] }),
];
export const DEMO_DEFAULT_PACKAGE = ["M1", "M3", "M4", "M6", "M2", "M8", "M10"];

export const demoFindings: Finding[] = demoMeasures.map((x): Finding => ({
  id: `F-${x.id}`, title: x.title, description: x.description, resource: x.resource,
  category: ({ M1: "servers", M2: "data-platform", M3: "saas", M4: "servers", M5: "ai-models", M6: "servers", M7: "data-platform", M8: "ci", M9: "logs", M10: "reports", M11: "redundancy", M12: "data-platform" } as const)[x.id as "M1"] ?? "servers",
  impactChfYear: x.savingsChf, impactKwhYear: x.savingsKwh, impactCo2KgYear: x.savingsCo2KgLocation, evidence: x.evidence, assumptions: x.assumptions, risk: x.risk.level, action: x.change, measureId: x.id,
})).concat([{ id: "F-C1", title: "Provider report doesn't match daily costs", description: "Monthly provider total differs ~6% from daily line items in March 2026.", resource: "Azure", category: "conflict", impactChfYear: 0, impactKwhYear: 0, impactCo2KgYear: 0, evidence: [ev("extra/provider_monthly_report.csv", "Monthly total"), ev("azure_costs.csv", "Sum of daily rows")], assumptions: [], risk: "review", action: "Hand over to Finance to reconcile" }]);

// Deterministic PRNG so server and browser render identical values.
function rng(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }
const HOLIDAYS: Record<string, string> = { "2025-12-25": "Christmas", "2025-12-26": "St Stephen's Day", "2026-01-01": "New Year", "2026-01-02": "Berchtoldstag", "2026-04-03": "Good Friday", "2026-04-06": "Easter Monday", "2026-05-01": "Labour Day", "2026-05-14": "Ascension", "2026-05-25": "Whit Monday", "2026-08-01": "Swiss National Day" };
export function demoDaily(from: string, to: string): DailyFootprint[] {
  const r = rng(42); const out: DailyFootprint[] = [];
  const d = new Date(`${from}-01T00:00:00Z`); const end = new Date(`${to}-01T00:00:00Z`); end.setUTCMonth(end.getUTCMonth() + 1);
  while (d < end) {
    const iso = d.toISOString().slice(0, 10); const wd = d.getUTCDay(); const holiday = HOLIDAYS[iso];
    const workday = wd !== 0 && wd !== 6 && !holiday; const f = workday ? 1 : 0.62; const noise = 0.85 + r() * 0.3;
    const co2 = 36.7 * f * noise; out.push({ date: iso, costChf: Math.round(1170 * f * noise), energyKwh: Math.round(213 * f * noise), co2Kg: Math.round(co2 * 10) / 10, workday, ...(holiday ? { holiday } : {}),
      coverage: d.getUTCDate() % 7 === 0 ? "estimated" : "allocated",
      contributors: [{ label: "GPU server (Frankfurt)", co2Kg: Math.round(co2 * 0.31 * 10) / 10 }, { label: "Test VMs (Dublin)", co2Kg: Math.round(co2 * 0.17 * 10) / 10 }, { label: "Data platform", co2Kg: Math.round(co2 * 0.09 * 10) / 10 }] });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export const demoQuality: DataQuality = {
  version: "demo-v0", importedAt: "2026-09-06",
  datasets: [
    ["azure_costs.csv", "core", 41210, 14, 37, 2, 118, 0, "warning"], ["aws_costs.csv", "core", 19880, 3, 12, 0, 64, 0, "ok"], ["hoster_invoice.csv", "core", 5120, 0, 0, 1, 210, 0, "warning"],
    ["data_platform_usage.csv", "core", 1360, 6, 0, 0, 0, 0, "ok"], ["ai_usage.csv", "core", 28400, 22, 41, 0, 9, 0, "ok"], ["ai_subscriptions.csv", "core", 66, 0, 0, 0, 0, 4, "warning"],
    ["saas_contracts.csv", "core", 352, 2, 3, 0, 0, 11, "warning"], ["server_inventory.csv", "core", 53, 1, 0, 3, 2, 0, "warning"], ["server_metrics_weekly.csv", "core", 4930, 17, 0, 0, 0, 0, "ok"],
    ["exchange_rates.csv", "core", 23, 0, 0, 0, 0, 0, "ok"], ["it_tickets.csv", "core", 290, 5, 2, 0, 18, 0, "ok"], ["business_calendar.csv", "core", 675, 0, 0, 0, 0, 0, "ok"], ["mapping_departments_tools.csv", "core", 96, 3, 0, 2, 0, 0, "warning"],
  ].map(([file, kind, rows, missing, duplicates, conflicts, unmapped, drafts, status]) => ({ file: file as string, kind: kind as "core", rows: rows as number, coverage: "2024-11 – 2026-09", latest: "2026-09-06", missing: missing as number, duplicates: duplicates as number, conflicts: conflicts as number, unmapped: unmapped as number, drafts: drafts as number, status: status as "ok" })),
  conflicts: [{ title: "Provider monthly total vs daily Azure costs (Mar 2026)", sources: ["extra/provider_monthly_report.csv", "azure_costs.csv"] }, { title: "az-app-02 environment: 'dev' in inventory, 'prod' in tags", sources: ["server_inventory.csv", "azure_costs.csv"] }, { title: "SaaS contracts: draft and final row for the same month", sources: ["saas_contracts.csv"] }],
};

export const demoBonus: Bonus = {
  carbonJobs: [
    { job: "nightly_feature_refresh", window: "flexible", currentStart: "19:00", suggestedStart: "02:00", co2SavedKgYear: 140 },
    { job: "ml_retrain_weekly", window: "flexible", currentStart: "Mon 08:00", suggestedStart: "Sun 13:00", co2SavedKgYear: 160 },
    { job: "daily_finance_load", window: "fixed", currentStart: "06:00", suggestedStart: "06:00 (fixed)", co2SavedKgYear: 0 },
  ],
  pipelines: [
    { label: "Nightly runs without new commits", value: "~40%", detail: "extra/ci_pipeline_runs.jsonl" },
    { label: "Re-runs after failure", value: "~12%", detail: "run_attempt > 1" },
    { label: "Runners in Dublin", value: "~70%", detail: "Could run in Zurich" },
  ],
  clusters: [
    { name: "Always-on, barely used", members: 11, description: "Run 24/7 with < 10% CPU", outliers: ["vm-gpu-01"] },
    { name: "Office-hours workloads", members: 24, description: "Busy on workdays 08–18", outliers: [] },
    { name: "Batch & nightly", members: 9, description: "Short bursts at night", outliers: ["aws-test-11"] },
  ],
  aiModels: [
    { model: "Claude Sonnet 4.6", provider: "Anthropic", tokensM: 412, costChf: 28700, share: 52 },
    { model: "GPT-5.4", provider: "OpenAI", tokensM: 288, costChf: 19400, share: 36 },
    { model: "Small models", provider: "Mixed", tokensM: 96, costChf: 1400, share: 12 },
  ],
  seats: [
    { product: "Claude Team", purchased: 40, active: 23, wasteChfMonth: 376 },
    { product: "ChatGPT Business", purchased: 25, active: 11, wasteChfMonth: 310 },
    { product: "Microsoft Copilot", purchased: 30, active: 12, wasteChfMonth: 478 },
  ],
};
