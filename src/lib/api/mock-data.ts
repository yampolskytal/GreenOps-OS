/**
 * MOCK DATA — illustrative only, NOT computed from the hackathon dataset.
 * Shapes follow types.ts; values are rough placeholders until the backend is wired.
 */
import type { ExecutiveOverview, FinanceView, ItView } from "./types";

export const mockOverview: ExecutiveOverview = {
  baseline: {
    period: "Sep 2025 – Aug 2026",
    costChf: { low: 402000, mid: 428000, high: 455000 },
    energyKwh: { low: 61000, mid: 78000, high: 99000 },
    co2KgLocation: { low: 9800, mid: 13400, high: 18100 },
    co2KgMarket: { low: 2100, mid: 3600, high: 5200 },
  },
  targets: { co2Pct: 40, costPct: 25, budgetChf: 16500, chfPerPersonDay: 1100 },
  package: [
    { id: "M1", description: "Start GPU server only on demand", resource: "vm-gpu-01 (Frankfurt)", change: "Auto-shutdown after 30 min idle; start via ticket/Slack", category: "Servers", effortPersonDays: 2, savingsChf: 21400, savingsKwh: 14200, savingsCo2KgLocation: 3200, risks: "Training runs in project P007 need booked windows", assumptions: "0.35–0.7 kWh/GPU-h, DE grid 0.38 kg/kWh", needsHumanDecision: false, owner: "IT Manager" },
    { id: "M2", description: "Move dev cluster Frankfurt → Zurich", resource: "dbx-dev (DE)", change: "Re-deploy in Switzerland North in Q4", category: "Data platform", effortPersonDays: 4, savingsChf: 6800, savingsKwh: 2100, savingsCo2KgLocation: 1500, risks: "Data residency checked; short dev downtime", assumptions: "CH grid 0.03–0.05 kg/kWh", needsHumanDecision: true, owner: "CTO" },
    { id: "M3", description: "Cancel idle AI and SaaS seats", resource: "ai_subscriptions, saas_contracts", change: "Reduce seats to 30-day active +10% at next notice date", category: "SaaS", effortPersonDays: 1.5, savingsChf: 38600, savingsKwh: 900, savingsCo2KgLocation: 160, risks: "Notice periods 30–90 days", assumptions: "List prices, ECB FX rates", needsHumanDecision: false, owner: "CFO" },
    { id: "M4", description: "Switch off test VMs nights & weekends", resource: "14 test/dev VMs (Dublin)", change: "Schedule 19:00–07:00 + weekends off", category: "Cloud", effortPersonDays: 2, savingsChf: 24900, savingsKwh: 8600, savingsCo2KgLocation: 1400, risks: "Release weeks excluded (change tickets)", assumptions: "IE grid 0.29 kg/kWh, PUE 1.2–1.5", needsHumanDecision: false, owner: "IT Manager" },
    { id: "M5", description: "Route simple AI tasks to small models", resource: "ai_usage (classification, summaries)", change: "Gateway rule: tasks of type 'classify' → small model", category: "AI", effortPersonDays: 3, savingsChf: 14800, savingsKwh: 3100, savingsCo2KgLocation: 600, risks: "Quality check on 200 samples first", assumptions: "Energy/token scales with model size", needsHumanDecision: true, owner: "Head of Consulting" },
    { id: "M6", description: "Right-size over-provisioned servers", resource: "9 VMs < 10% CPU avg", change: "Halve vCPU at next maintenance window", category: "Servers", effortPersonDays: 2.5, savingsChf: 11200, savingsKwh: 2400, savingsCo2KgLocation: 400, risks: "Peak CPU checked per week", assumptions: "server_metrics_weekly peaks", needsHumanDecision: false, owner: "IT Manager" },
  ],
  byCategory: [
    { category: "Cloud", costChf: 118000, co2Kg: 3900 },
    { category: "Servers", costChf: 96000, co2Kg: 6300 },
    { category: "AI", costChf: 71000, co2Kg: 1500 },
    { category: "SaaS", costChf: 104000, co2Kg: 500 },
    { category: "Data platform", costChf: 39000, co2Kg: 1200 },
  ],
  byLocation: [
    { location: "CH", co2Kg: 1700, gridKgPerKwh: 0.04 },
    { location: "DE", co2Kg: 7600, gridKgPerKwh: 0.38 },
    { location: "IE", co2Kg: 3300, gridKgPerKwh: 0.29 },
    { location: "EU-mixed", co2Kg: 800, gridKgPerKwh: 0.25 },
  ],
  findings: [
    { id: "F1", kind: "protection-window", title: "Production platform needed at month-end close", detail: "Finance runs reports on the last 3 workdays, including evenings. No night switch-off without CFO approval.", sources: ["data_platform_usage.csv", "it_tickets.csv", "business_calendar.csv"], severity: "high" },
    { id: "F2", kind: "contradiction", title: "Provider report ≠ sum of daily costs", detail: "Monthly provider total differs by ~6% from daily line items for March 2026.", sources: ["provider_monthly_report.csv", "azure_costs.csv"], severity: "medium" },
    { id: "F3", kind: "handover", title: "Backup archive in Dublin: retention obligation unclear", detail: "Tagged 'retention required' but no owner. Hand over to data protection officer.", sources: ["backup_chains.csv", "mapping_departments_tools.csv"], severity: "medium" },
  ],
};

const months = ["2025-09","2025-10","2025-11","2025-12","2026-01","2026-02","2026-03","2026-04","2026-05","2026-06","2026-07","2026-08"];
export const mockFinance: FinanceView = {
  monthly: months.map((m, i) => ({ month: m, costChf: 33000 + Math.round(Math.sin(i / 1.7) * 2500) + i * 180, co2Kg: 1050 + Math.round(Math.cos(i / 2) * 120) })),
  byDepartment: [
    { department: "Consulting", costChf: 162000, co2Kg: 5900, fte: 58 },
    { department: "IT", costChf: 98000, co2Kg: 4300, fte: 9 },
    { department: "Sales", costChf: 47000, co2Kg: 900, fte: 14 },
    { department: "Marketing", costChf: 39000, co2Kg: 1100, fte: 8 },
    { department: "Finance", costChf: 31000, co2Kg: 500, fte: 6 },
    { department: "HR", costChf: 18000, co2Kg: 200, fte: 5 },
    { department: "Management", costChf: 14000, co2Kg: 200, fte: 4 },
    { department: "Overhead (shared)", costChf: 19000, co2Kg: 300, fte: 0 },
  ],
  topDrivers: [
    { label: "GPU server vm-gpu-01", category: "Servers", location: "DE", costChf: 31200, co2Kg: 5900, source: "azure_costs.csv" },
    { label: "Microsoft 365 Business Standard", category: "SaaS", location: "EU-mixed", costChf: 23400, co2Kg: 180, source: "saas_contracts.csv" },
    { label: "Test VMs (Dublin)", category: "Cloud", location: "IE", costChf: 34100, co2Kg: 2900, source: "aws_costs.csv" },
    { label: "Claude Sonnet via API", category: "AI", location: "EU-mixed", costChf: 28700, co2Kg: 600, source: "ai_usage.csv" },
    { label: "Dev cluster Frankfurt", category: "Data platform", location: "DE", costChf: 15200, co2Kg: 1100, source: "data_platform_usage.csv" },
  ],
  idleSeats: [
    { product: "Claude Team", purchased: 40, active: 23, monthlyWasteChf: 376, noticeDays: 30, contractEnd: "2026-12-31" },
    { product: "ChatGPT Business", purchased: 25, active: 11, monthlyWasteChf: 310, noticeDays: 30, contractEnd: "2026-10-31" },
    { product: "Microsoft Copilot", purchased: 30, active: 12, monthlyWasteChf: 478, noticeDays: 90, contractEnd: "2027-06-30" },
  ],
  currencyMix: [{ currency: "CHF", sharePct: 46 }, { currency: "USD", sharePct: 38 }, { currency: "EUR", sharePct: 16 }],
  allocationRule: "Direct costs by tag/cost center; shared licences by FTE (headcount.csv); unresolved rows → Overhead.",
};
mockFinance.topDrivers.sort((a, b) => b.costChf - a.costChf);

export const mockIt: ItView = {
  servers: [
    { id: "vm-gpu-01", provider: "Azure", region: "germanywestcentral", location: "DE", vcpu: 24, cpuAvgPct: 6, uptimeH30d: 720, environment: "prod", criticality: "medium", lastLogin: "2026-07-14", flag: "GPU 4% avg, always on" },
    { id: "aws-test-07", provider: "AWS", region: "eu-west-1", location: "IE", vcpu: 4, cpuAvgPct: 3, uptimeH30d: 720, environment: "test", criticality: "low", lastLogin: "2026-03-02", flag: "No login for 6 months" },
    { id: "aws-test-11", provider: "AWS", region: "eu-west-1", location: "IE", vcpu: 8, cpuAvgPct: 9, uptimeH30d: 720, environment: "test", criticality: "low", lastLogin: "2026-08-28", flag: "Runs nights & weekends" },
    { id: "az-app-02", provider: "Azure", region: "switzerlandnorth", location: "CH", vcpu: 16, cpuAvgPct: 7, uptimeH30d: 720, environment: "prod", criticality: "high", lastLogin: "2026-09-03", flag: "Over-provisioned" },
    { id: "az-db-01", provider: "Azure", region: "switzerlandnorth", location: "CH", vcpu: 8, cpuAvgPct: 41, uptimeH30d: 720, environment: "prod", criticality: "high", lastLogin: "2026-09-05" },
    { id: "host-web-03", provider: "Hoster", region: "zurich", location: "CH", vcpu: 4, cpuAvgPct: 22, uptimeH30d: 720, environment: "prod", criticality: "high", lastLogin: "2026-09-01" },
    { id: "az-dev-05", provider: "Azure", region: "germanywestcentral", location: "DE", vcpu: 8, cpuAvgPct: 2, uptimeH30d: 698, environment: "dev", criticality: "low", lastLogin: "2025-12-19", flag: "Orphaned? owner left" },
  ],
  gpu: { id: "vm-gpu-01", gpuAvgPct: 4, uptimeH30d: 720, costChfYear: 31200, location: "DE" },
  platform: [
    { cluster: "dbx-prod (Zurich)", runtimeH: 720, activeH: 212, protectedWindows: ["Month-end close (last 3 workdays)", "Daily 06:00 load"] },
    { cluster: "dbx-dev (Frankfurt)", runtimeH: 560, activeH: 96, protectedWindows: [] },
  ],
  ai: [
    { model: "Claude Sonnet 4.6", provider: "Anthropic", tokensM: 412, costChf: 2390 },
    { model: "GPT-5.4", provider: "OpenAI", tokensM: 288, costChf: 1720 },
    { model: "Small model (classify)", provider: "Mixed", tokensM: 96, costChf: 140 },
  ],
  findings: [
    { id: "IT1", kind: "protection-window", title: "Release freeze week 38", detail: "Change ticket blocks server changes 14–18 Sep.", sources: ["it_tickets.csv"], severity: "high" },
    { id: "IT2", kind: "contradiction", title: "Inventory says 'dev', tags say 'prod'", detail: "az-app-02 environment differs between inventory and Azure tags.", sources: ["server_inventory.csv", "azure_costs.csv"], severity: "medium" },
    { id: "IT3", kind: "waste", title: "Nightly builds with zero commits", detail: "~40% of nightly runs had no commits since last build.", sources: ["extra/ci_pipeline_runs.jsonl"], severity: "low" },
  ],
};
