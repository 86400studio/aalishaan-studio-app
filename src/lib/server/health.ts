import "server-only";

import {
  createBrowserSupabaseClient,
  readPublicSupabaseEnv,
  type BrowserClientOptions,
  type BrowserClientResult,
} from "@/lib/supabase/browser";

import {
  createPrivilegedClient,
  type PrivilegedClientResult,
} from "./supabase";

/**
 * `GET /api/health` — S0.2 (docs/TECH-ARCHITECTURE.md §3c). Two bounded, read-only, non-cached server
 * queries of `system_checks`, reported as a coarse status:
 *
 * 1. the privileged client (secret key) reads one row — `200 {"status":"ok"}` needs it to succeed; an empty
 *    baseline table (zero rows) is healthy: the S2.20 probes that will fill it do not exist yet and nothing
 *    here claims they passed;
 * 2. the **public client of this very build** — `createBrowserSupabaseClient()` with the build-inlined
 *    `NEXT_PUBLIC_*` values, the same factory and values the browser bundle carries (session features off,
 *    which never changes the key, the URL or the read) — must point at the project the privileged identity
 *    verified, then reads the same table and must be *denied at the table*: Postgres permission denied
 *    (the baseline's grant-level denial), or an explicit empty array that is only accepted when the
 *    privileged read saw at least one row. Nothing else counts (Codex rounds 1 and 2): a schema-missing
 *    answer cannot be denial once the privileged read proved the table exists, and a malformed success
 *    body proves nothing. That proves the deployment's publishable key and URL are accepted by the intended
 *    project (P1, the public half, on the deployed candidate) and that anonymous access to the baseline is
 *    closed.
 *
 * `503 {"status":"unavailable","reason":…}` with one of a fixed set of reasons: configuration missing or
 * pointing at the wrong project, the baseline schema missing (Production before the owner applies
 * 0000_init), a query failing or timing out, the public pair not configured or pointing at another project,
 * the publishable key rejected, the public client able to read rows, or public denial unproven. Never rows,
 * refs, keys or upstream bodies; never a write on GET; `Cache-Control: no-store`. Worst case two sequential
 * 2.5 s reads.
 */

export const HEALTH_QUERY_TIMEOUT_MS = 2500;

/** PostgREST / Postgres codes that mean the baseline table is not there (schema cache or catalogue). */
const SCHEMA_MISSING_CODES = new Set(["PGRST205", "42P01"]);
/** Postgres "permission denied": the public key reached the database and was refused at the table. */
const PUBLIC_DENIED_CODES = new Set(["42501"]);

/**
 * The public client on the server keeps the browser factory, key and URL but no session machinery: a
 * server process has nothing to persist, refresh or detect, and supabase-js's default auto-refresh would
 * otherwise leave a 30 s ticker behind on every health call.
 */
export const PUBLIC_CLIENT_SERVER_OPTIONS: BrowserClientOptions = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};

export type HealthReason =
  | "not_configured"
  | "identity_mismatch"
  | "schema_missing"
  | "query_failed"
  | "public_not_configured"
  | "public_identity_mismatch"
  | "public_key_rejected"
  | "public_access_open"
  | "public_denial_unproven";

export type HealthResult =
  { status: "ok" } | { status: "unavailable"; reason: HealthReason };

export type HealthDependencies = {
  /** The privileged (secret-key) client of this deployment. */
  createClient: () => PrivilegedClientResult;
  /** The public client of this build — the browser factory with the build-inlined public values. */
  createPublicClient: () => BrowserClientResult;
};

/** The real wiring: the privileged factory, and the browser factory over the build-inlined public values. */
export function defaultDependencies(): HealthDependencies {
  return {
    createClient: createPrivilegedClient,
    createPublicClient: () =>
      createBrowserSupabaseClient(
        readPublicSupabaseEnv(),
        PUBLIC_CLIENT_SERVER_OPTIONS,
      ),
  };
}

function configReason(
  reason: Extract<PrivilegedClientResult, { ok: false }>["reason"],
): HealthReason {
  return reason === "identity_mismatch" || reason === "refs_not_distinct"
    ? "identity_mismatch"
    : "not_configured";
}

type PublicOutcome = "accepted" | HealthReason;

/**
 * Classifies the public client's bounded read, taken after the privileged read proved the table exists.
 * Accepted means the key reached the database and the table refused it — or RLS returned an explicit
 * empty array while the privileged read had proved there was something to hide.
 */
export function classifyPublicRead(
  outcome: {
    data: unknown;
    error: { code?: string } | null;
    status?: number;
  },
  privilegedRowsSeen: number,
): PublicOutcome {
  const { data, error } = outcome;
  if (error) {
    const code = typeof error.code === "string" ? error.code : "";
    if (PUBLIC_DENIED_CODES.has(code)) return "accepted";
    // The gateway refuses an unknown key before PostgREST runs: an HTTP 401/403 without a Postgres code.
    if (code === "" && (outcome.status === 401 || outcome.status === 403))
      return "public_key_rejected";
    // The privileged read has just proved the table exists, so a "missing table" answer to the public
    // client establishes nothing (Codex round 2).
    if (SCHEMA_MISSING_CODES.has(code)) return "public_denial_unproven";
    return "query_failed";
  }
  // Only an explicit empty array can be an RLS-filtered denial; anything else is malformed.
  if (!Array.isArray(data)) return "public_denial_unproven";
  if (data.length > 0) return "public_access_open";
  return privilegedRowsSeen > 0 ? "accepted" : "public_denial_unproven";
}

export async function checkHealth(
  deps: HealthDependencies = defaultDependencies(),
): Promise<HealthResult> {
  const created = deps.createClient();
  if (!created.ok)
    return { status: "unavailable", reason: configReason(created.reason) };
  let privilegedRowsSeen = 0;
  try {
    const { data, error } = await created.client
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
    // A success without an explicit array is malformed; it cannot prove the secret key read the table.
    if (!Array.isArray(data))
      return { status: "unavailable", reason: "query_failed" };
    privilegedRowsSeen = data.length;
  } catch {
    return { status: "unavailable", reason: "query_failed" };
  }

  // The public half: this build's own public client must point at the verified project, be accepted by it
  // and be denied at the table.
  const pub = deps.createPublicClient();
  if (!pub.ok)
    return { status: "unavailable", reason: "public_not_configured" };
  if (pub.projectRef !== created.identity.projectRef)
    return { status: "unavailable", reason: "public_identity_mismatch" };
  try {
    const outcome = await pub.client
      .from("system_checks")
      .select("id")
      .limit(1)
      .abortSignal(AbortSignal.timeout(HEALTH_QUERY_TIMEOUT_MS));
    const verdict = classifyPublicRead(outcome, privilegedRowsSeen);
    if (verdict !== "accepted")
      return { status: "unavailable", reason: verdict };
  } catch {
    return { status: "unavailable", reason: "query_failed" };
  }
  return { status: "ok" };
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

/** Only GET (and the HEAD Next.js derives from it) reaches the queries; nothing here writes. */
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
