import { createFileRoute } from "@tanstack/react-router";
import { Buffer } from "node:buffer";

const allowedGet = new Set([
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

const allowedPost = new Set([
  "simulation",
  "optimize",
  "chat",
  "exports/measures",
]);

async function proxy(request: Request): Promise<Response> {
  const incoming = new URL(request.url);
  const prefix = "/api/v2/";

  if (!incoming.pathname.startsWith(prefix)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const path = incoming.pathname.slice(prefix.length);
  const allowed = request.method === "GET" ? allowedGet : allowedPost;

  if (!allowed.has(path)) {
    return Response.json({ error: "Route not allowed" }, { status: 404 });
  }

  const backend = process.env.GREENOPS_BACKEND_URL;
  const user = process.env.GREENOPS_PROXY_USER;
  const password = process.env.GREENOPS_PROXY_PASSWORD;

  if (!backend || !user || !password) {
    return Response.json(
      { error: "Backend proxy not configured" },
      { status: 503 }
    );
  }

  try {
    const target = new URL(backend);

    if (target.protocol !== "https:") {
      return Response.json(
        { error: "HTTPS backend required" },
        { status: 503 }
      );
    }

    target.pathname = incoming.pathname;
    target.search = incoming.search;
    const headers = new Headers({
      Authorization:
        "Basic " +
        Buffer.from(`${user}:${password}`, "utf8").toString("base64"),
      Accept: "application/json",
    });

    let body: string | undefined;

    if (request.method === "POST") {
      if (!request.headers.get("content-type")?.startsWith("application/json")) {
        return Response.json(
          { error: "JSON required" },
          { status: 415 }
        );
      }

      body = await request.text();

      if (Buffer.byteLength(body, "utf8") > 512000) {
        return Response.json(
          { error: "Request too large" },
          { status: 413 }
        );
      }

      headers.set("Content-Type", "application/json");
    }

    // Do not forward the browser Origin header.
    // The Python backend rejects cross-origin writes.
    const response = await fetch(target, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
      redirect: "manual",
    });

    return new Response(response.body, {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("content-type") ?? "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("GreenOps proxy failed:", error);

    return Response.json(
      { error: "Backend unavailable" },
      { status: 502 }
    );
  }
}

export const Route = createFileRoute("/api/v2/$")({
  server: {
    handlers: {
      GET: ({ request }) => proxy(request),
      POST: ({ request }) => proxy(request),
    },
  },
});
