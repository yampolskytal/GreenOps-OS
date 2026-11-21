import { z } from "zod";

export const APPROVED_BACKEND_ORIGIN = "https://greenops-os-v5-4.onrender.com";
export const MAX_REQUEST_BYTES = 64 * 1024;
export const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
export const UPSTREAM_TIMEOUT_MS = 90_000;
export const GET_ENDPOINTS = new Set([
  "overview",
  "breakdowns",
  "resources",
  "locations",
  "findings",
  "measures",
  "forecast",
  "metrics/daily",
  "data-quality",
  "bonus",
  "exports/baseline",
]);
const id = z.string().min(1).max(240);
const selection = z
  .array(id)
  .max(100)
  .refine((ids) => new Set(ids).size === ids.length);
const budget = z.number().finite().min(0).max(1_000_000);
const simulation = z
  .object({
    measureIds: selection,
    budgetChf: budget.optional(),
    chfPerPersonDay: z.number().finite().min(1).max(100_000).optional(),
  })
  .strict();
const POST_SCHEMAS: Record<string, z.ZodType> = {
  simulation,
  optimize: z
    .object({
      budgetChf: budget,
      chfPerPersonDay: z.number().finite().min(1).max(100_000).optional(),
      priority: z.enum(["balanced", "cost", "co2"]),
    })
    .strict(),
  "exports/measures": z.object({ measureIds: selection }).strict(),
  chat: z
    .object({
      planMeasureIds: selection.optional(),
      messages: z
        .array(
          z
            .object({
              role: z.enum(["user", "assistant"]),
              content: z.string().min(1).max(4000),
              context: z.object({
                metric: z.enum(["chf", "kwh", "kg", "kg_market"]),
                grouping: z.enum(["department", "tool", "category", "provider", "region", "project", "resource", "month"]).nullable(),
                filters: z.record(z.enum(["department", "tool", "category", "provider", "region", "project", "resource", "month"]),
                  z.array(z.string().max(200)).max(30)),
              }).strict().optional(),
            })
            .strict(),
        )
        .min(1)
        .max(20),
    })
    .strict(),
};
export function supportedEndpoint(method: string, path: string) {
  return method === "GET"
    ? GET_ENDPOINTS.has(path)
    : method === "POST" && Object.hasOwn(POST_SCHEMAS, path);
}
export function validBody(path: string, body: unknown) {
  if (!Object.hasOwn(POST_SCHEMAS, path)) return false;
  return POST_SCHEMAS[path]?.safeParse(body).success === true;
}
export const REQUEST_LIMITS = { get: 120, post: 20, chat: 6 } as const;
/** Best-effort, per runtime instance only; intentionally not a distributed guarantee. */
export function createRequestLimiter() {
  const buckets = new Map<string, { started: number; count: number }>();
  return (visitor: string, method: string, path: string, now = Date.now()) => {
    for (const [key, bucket] of buckets) if (now - bucket.started >= 60_000) buckets.delete(key);
    const category = method === "GET" ? "get" : path === "chat" ? "chat" : "post";
    const key = `${visitor}:${category}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      if (buckets.size >= 10_000) return 60;
      bucket = { started: now, count: 0 };
      buckets.set(key, bucket);
    }
    if (bucket.count >= REQUEST_LIMITS[category])
      return Math.max(1, Math.ceil((60_000 - (now - bucket.started)) / 1000));
    bucket.count++;
    return 0;
  };
}
export function validQuery(params: URLSearchParams, path: string) {
  if (params.toString().length > 16_384) return false;
  const allowed = new Set(["version", "from", "to", "department", "provider"]);
  if (path === "forecast") ["metric", "horizon", "measureIds"].forEach((key) => allowed.add(key));
  for (const [key, value] of params) {
    if (!allowed.has(key) || params.getAll(key).length !== 1) return false;
    if (key === "measureIds") {
      if (!selection.safeParse(value ? value.split(",") : []).success) return false;
    } else if (value.length > 240 || /[\u0000-\u001f]/.test(value)) return false;
    if (["from", "to"].includes(key) && !/^\d{4}-\d{2}(?:-\d{2})?$/.test(value)) return false;
    if (key === "horizon" && !["1", "2", "3"].includes(value)) return false;
    if (key === "metric" && !["cost", "energy", "co2Location", "co2Market"].includes(value))
      return false;
  }
  const from = params.get("from"),
    to = params.get("to");
  return !from || !to || from <= to;
}
