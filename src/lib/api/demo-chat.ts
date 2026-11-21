import type { ChatMessage } from "./types";

/** DEMO chat replies. The real assistant (team LLM backend) must back each answer with calculations or sources. */
export function demoChatReply(history: ChatMessage[]): ChatMessage {
  const q = (history[history.length - 1]?.content ?? "").toLowerCase();
  if (q.includes("market") || q.includes("location-based") || q.includes("accounting"))
    return {
      role: "assistant",
      demo: true,
      content:
        "Location-based accounting uses the electricity grid mix; market-based accounting reflects supported procurement contracts and residual factors. They are alternatives, never added together. Switching accounting methods does not automatically reduce physical electricity consumption or emissions. The mandatory 40% target remains location-based. Actual market-based evidence is awaiting the team backend contract.",
    };
  if (q.includes("seat") || q.includes("subscription"))
    return {
      role: "assistant",
      demo: true,
      content:
        "In August 2026 (demo figures): Claude Team 40 bought / 23 active, ChatGPT Business 25 / 11, Copilot 30 / 12 — 49 idle seats, about CHF 1,164 per month.",
      calculation: "idle = purchased − active_30d; cost = idle × price_per_seat × usd_chf(2026-08)",
      evidence: [
        { source: "ai_subscriptions.csv", detail: "licences_purchased, licences_active_30d" },
        { source: "exchange_rates.csv", detail: "usd_chf for 2026-08" },
      ],
      actions: [{ type: "navigate", to: "/cfo", label: "Open CFO view" }],
    };
  if (q.includes("gpu"))
    return {
      role: "assistant",
      demo: true,
      content:
        "The GPU server is busy ~4% of the time but runs 24/7. Starting it on demand costs ~2 person-days and saves about CHF 21,400 and 3.2 t CO₂ per year (demo).",
      calculation: "saved GPU-h × kWh/GPU-h (0.3–0.7) × PUE × DE grid (0.33–0.45 kg/kWh)",
      evidence: [
        { source: "server_metrics_weekly.csv", detail: "gpu_avg_pct" },
        { source: "azure_costs.csv", detail: "vm-gpu-01 daily cost" },
        { source: "it_tickets.csv", detail: "GPU access requests" },
      ],
      actions: [
        { type: "openMeasure", measureId: "M1", label: "Open measure M1" },
        { type: "highlight", resourceId: "vm-gpu-01", label: "Show GPU server" },
      ],
    };
  if (q.includes("night") || q.includes("production") || q.includes("weekend"))
    return {
      role: "assistant",
      demo: true,
      content:
        "Not as proposed. The production platform is needed on the last 3 workdays of each month (incl. evenings) and for the 06:00 daily load. The CFO and CTO must decide before any schedule change.",
      evidence: [
        { source: "data_platform_usage.csv", detail: "Evening queries at month-end" },
        { source: "business_calendar.csv", detail: "Workdays" },
        { source: "it_tickets.csv", detail: "Incident after previous shutdown" },
      ],
      actions: [{ type: "navigate", to: "/studio", label: "Open Safety Shield" }],
    };
  return {
    role: "assistant",
    demo: true,
    content:
      "This is the demo assistant. Once the team backend is connected, I will answer with calculations and sources from your data. Try one of the suggested questions.",
    actions: [{ type: "openSimulation", label: "Open Optimization Studio" }],
  };
}
