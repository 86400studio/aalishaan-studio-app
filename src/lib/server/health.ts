import "server-only";

import {
  createPrivilegedClient,
  type PrivilegedClientResult,
} from "./supabase";

/**
 * `GET /api/health` — S0.2 (docs/TECH-ARCHITECTURE.md §3c). One bounded, read-only, non-cached server
 * query of `system_checks` through the privileged client, reported as a coarse status:
 *
 * - `200 {"status":"ok"}` when the query succeeds — an empty baseline table (zero rows) is healthy: the
 *   S2.20 probes that will fill it do not exist yet and nothing here claims they passed;
 * - `503 {"status":"unavailable","reason":…}` with one of a fixed set of reasons: configuration missing or
 *   pointing at the wrong project, the baseline schema missing (Production before the owner applies
 *   0000_init), or the query failing or timing out.
 *
 * Never rows, refs, keys or upstream bodies; never a write on GET; `Cache-Control: no-store`.
 */

export const HEALTH_QUERY_TIMEOUT_MS = 2500;

/** PostgREST / Postgres codes that mean the baseline table is not there (schema cache or catalogue). */
const SCHEMA_MISSING_CODES = new Set(["PGRST205", "42P01"]);

export type HealthReason =
  "not_configured" | "identity_mismatch" | "schema_missing" | "query_failed";

export type HealthResult =
  { status: "ok" } | { status: "unavailable"; reason: HealthReason };

export type HealthDependencies = {
  createClient: () => PrivilegedClientResult;
};

function configReason(
  reason: Extract<PrivilegedClientResult, { ok: false }>["reason"],
): HealthReason {
  return reason === "identity_mismatch" || reason === "refs_not_distinct"
    ? "identity_mismatch"
    : "not_configured";
}

export async function checkHealth(
  deps: HealthDependencies = { createClient: createPrivilegedClient },
): Promise<HealthResult> {
  const created = deps.createClient();
  if (!created.ok)
    return { status: "unavailable", reason: configReason(created.reason) };
  try {
    const { error } = await created.client
      .from("system_checks")
      .select("id")
      .limit(1)
      .abortSignal(AbortSignal.timeout(HEALTH_QUERY_TIMEOUT_MS));
    if (error) {
      return {
        status: "unavailable",
        reason: SCHEMA_MISSING_CODES.has(error.code)
          ? "schema_missing"
          : "query_failed",
      };
    }
    return { status: "ok" };
  } catch {
    return { status: "unavailable", reason: "query_failed" };
  }
}

function jsonResponse(
  status: number,
  body: HealthResult | { status: string },
  headers?: HeadersInit,
): Response {
  const response = Response.json(body, { status, headers });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export function healthResponse(result: HealthResult): Response {
  return jsonResponse(result.status === "ok" ? 200 : 503, result);
}

/** Only GET (and the HEAD Next.js derives from it) reaches the query; nothing here writes. */
export async function handleHealth(
  request: Request,
  deps?: HealthDependencies,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return jsonResponse(
      405,
      { status: "method_not_allowed" },
      { Allow: "GET, HEAD" },
    );
  }
  return healthResponse(await checkHealth(deps));
}
