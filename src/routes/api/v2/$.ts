import { createFileRoute } from "@tanstack/react-router";
import { Buffer } from "node:buffer";
import {
  APPROVED_BACKEND_ORIGIN,
  MAX_REQUEST_BYTES,
  MAX_RESPONSE_BYTES,
  UPSTREAM_TIMEOUT_MS,
  supportedEndpoint,
  validBody,
  validQuery,
  createRequestLimiter,
} from "@/lib/api/proxy-policy";
import { validateApiResponse } from "@/lib/api/response-schemas";
const limitRequest = createRequestLimiter();

const failure = (status: number, error: string) =>
  Response.json(
    { error },
    {
      status,
      headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    },
  );
async function boundedText(stream: ReadableStream<Uint8Array> | null, limit: number) {
  if (!stream) return "";
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let size = 0,
    text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new RangeError("Payload limit");
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

async function proxy(request: Request): Promise<Response> {
  const incoming = new URL(request.url);
  const prefix = "/api/v2/";

  if (!incoming.pathname.startsWith(prefix)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const path = incoming.pathname.slice(prefix.length);
  if (!supportedEndpoint(request.method, path))
    return failure(404, "Endpoint unavailable for this public demo.");
  if (!validQuery(incoming.searchParams, path))
    return failure(400, "Invalid reporting parameters.");
  // Hosting supplies CF-Connecting-IP. Do not trust user-controlled forwarded IP headers.
  const retryAfter = limitRequest(
    request.headers.get("cf-connecting-ip") ?? "unidentified",
    request.method,
    path,
  );
  if (retryAfter) {
    const response = failure(429, "Too many requests. Please retry shortly.");
    response.headers.set("Retry-After", String(retryAfter));
    return response;
  }
  // Only calculation POSTs are permitted. Imports, approvals, rebuilds and persisted writes are not proxied.
  if (request.method === "POST") {
    const origin = request.headers.get("origin");
    if (
      (origin && origin !== incoming.origin) ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      return failure(403, "Cross-site requests are not permitted.");
  }

  const backend = process.env["GREENOPS_BACKEND_URL"];
  const user = process.env["GREENOPS_BACKEND_USERNAME"];
  const password = process.env["GREENOPS_BACKEND_PASSWORD"];

  if (!backend || !user || !password) {
    return Response.json({ error: "Backend proxy not configured" }, { status: 503 });
  }

  try {
    const target = new URL(backend);

    if (target.origin !== APPROVED_BACKEND_ORIGIN || target.username || target.password)
      return failure(503, "The approved backend connection is not configured correctly.");

    target.pathname = incoming.pathname;
    target.search = incoming.search;
    const headers = new Headers({
      Authorization: "Basic " + Buffer.from(`${user}:${password}`, "utf8").toString("base64"),
      Accept: "application/json",
    });

    let body: string | undefined;

    if (request.method === "POST") {
      if (!request.headers.get("content-type")?.startsWith("application/json")) {
        return Response.json({ error: "JSON required" }, { status: 415 });
      }

      if (Number(request.headers.get("content-length")) > MAX_REQUEST_BYTES)
        return failure(413, "Request too large.");
      try {
        body = await boundedText(request.body, MAX_REQUEST_BYTES);
        if (!validBody(path, JSON.parse(body))) return failure(400, "Invalid calculation request.");
      } catch (error) {
        return failure(
          error instanceof RangeError ? 413 : 400,
          "Invalid or oversized JSON request.",
        );
      }

      headers.set("Content-Type", "application/json");
    }

    // Browser cookies, authorization and Origin are never sent upstream.
    const response = await fetch(target, {
      method: request.method,
      headers,
      ...(body !== undefined ? { body } : {}),
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!response.ok) {
      await response.body?.cancel();
      const message =
        response.status === 401 || response.status === 403
          ? "The backend rejected this request. Check its saved credentials and permissions."
          : response.status === 429
            ? "The backend is busy. Please retry shortly."
            : response.status >= 500
              ? "The backend may be starting up. Please retry shortly."
              : "The backend could not complete this request.";
      return failure(
        response.status >= 300 && response.status < 400 ? 502 : response.status,
        message,
      );
    }
    if (!response.headers.get("content-type")?.includes("application/json")) {
      await response.body?.cancel();
      return failure(
        502,
        "The backend returned an invalid response. No demo data was substituted.",
      );
    }
    const text = await boundedText(response.body, MAX_RESPONSE_BYTES);
    try {
      validateApiResponse(`/${path}`, JSON.parse(text));
    } catch {
      return failure(
        502,
        "The backend returned incomplete or invalid data. No demo data was substituted.",
      );
    }
    if (text.includes(password) || text.includes(headers.get("Authorization") ?? ""))
      return failure(502, "The backend response could not be safely returned.");
    return new Response(text, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") ?? "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return failure(
      error instanceof DOMException && ["TimeoutError", "AbortError"].includes(error.name)
        ? 504
        : 502,
      "The backend is unavailable or still starting. Please retry shortly. No demo data was substituted.",
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
