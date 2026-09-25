import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import { isPreviewTestTarget } from "@/lib/supabase/config";

import {
  createPrivilegedClient,
  resolveServerIdentity,
  type IdentityResult,
  type PrivilegedClientResult,
} from "./supabase";

/**
 * The S0.2 Preview proof harness behind `POST /api/setup-proof` (docs/TECH-ARCHITECTURE.md §3c;
 * docs/ENVIRONMENT-PARITY.md §12 P1/P2 pattern). It exists so the roadmap's acceptance — a bounded
 * synthetic write that ORIGINATES IN THE DEPLOYED PREVIEW and lands only in TEST — can be executed and
 * re-executed at the immutable candidate. It is not a product API: S1.1 removes it and revokes its token
 * before product data is introduced.
 *
 * Fail-closed order, before any client, network or database operation:
 *   1. only POST;
 *   2. the trusted deployment context (`VERCEL_ENV`) must be exactly `preview` — Production, a local
 *      process and an unknown context are denied;
 *   3. an exact `Authorization: Bearer <S0_2_PROOF_TOKEN>` (server-only; unset, empty or short disables
 *      the route) — absent, malformed or wrong credentials are denied;
 *   4. a small, exact JSON body `{ "action": "create" | "read" | "cleanup", "marker": "s0-2-proof:<id>" }`;
 *   5. the configured identity (no client yet) must resolve to the independently configured TEST ref,
 *      distinct from the PROD ref, inside a Preview (`isPreviewTestTarget`); only then is a client built.
 * Every denial in 2–3 is the same generic `404` and touches nothing. Only then does the run marker get
 * created, read or deleted — one fixed synthetic `system_checks` row; cleanup can only delete the row that
 * carries exactly that marker and `synthetic = true`. No caller-selected table, SQL, URL or environment;
 * no upstream body in any response; `Cache-Control: no-store`. Deployment Protection is separate from this
 * authorisation.
 */

/** A configured token shorter than this is treated as unset. */
export const MIN_TOKEN_LENGTH = 32;
/** Upper bound on the request body; the fixed payload is far smaller. */
export const MAX_BODY_BYTES = 512;
/** Upper bound on each database operation. */
export const QUERY_TIMEOUT_MS = 5000;
/** The run marker: the fixed namespace and a short lower-case id chosen per run by the proof process. */
export const MARKER_PATTERN = /^s0-2-proof:[a-z0-9]{8,32}$/;
export const PROOF_ACTIONS = ["create", "read", "cleanup"] as const;
export type ProofAction = (typeof PROOF_ACTIONS)[number];
/** The fixed row the proof creates; nothing in it comes from the request except the marker. */
export const FIXED_ROW = {
  status: "ok",
  synthetic: true,
  note: "S0.2 Preview proof marker — synthetic; removed by the proof run's cleanup step",
} as const;

// RFC 6750 b64token after the exact scheme "Bearer" and one space; nothing else is accepted.
const BEARER_CREDENTIAL = /^Bearer ([A-Za-z0-9\-._~+/]+=*)$/;

function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/** True only when the header carries exactly the configured token. Never throws. */
export function isAuthorized(
  authorization: string | null,
  configuredToken: string | undefined,
): boolean {
  if (!configuredToken || configuredToken.length < MIN_TOKEN_LENGTH)
    return false;
  const credential =
    authorization === null ? null : BEARER_CREDENTIAL.exec(authorization);
  if (!credential) return false;
  // Equal-length digests: the comparison takes the same time whatever the presented token's length.
  return timingSafeEqual(sha256(credential[1]), sha256(configuredToken));
}

export type ProofRequest = { action: ProofAction; marker: string };

/** Exactly two string fields with the expected shapes; anything else (extra keys, arrays, other types) is null. */
export function parseProofRequest(text: string): ProofRequest | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    return null;
  const keys = Object.keys(parsed);
  if (keys.length !== 2 || !keys.includes("action") || !keys.includes("marker"))
    return null;
  const { action, marker } = parsed as Record<string, unknown>;
  if (
    typeof action !== "string" ||
    !(PROOF_ACTIONS as readonly string[]).includes(action)
  )
    return null;
  if (typeof marker !== "string" || !MARKER_PATTERN.test(marker)) return null;
  return { action: action as ProofAction, marker };
}

/** Reads at most `maxBytes`; null when the body is longer or a declared length is invalid or too large. */
async function readBounded(
  request: Request,
  maxBytes: number,
): Promise<string | null> {
  const declared = request.headers.get("content-length");
  if (
    declared !== null &&
    (!/^\d+$/.test(declared) || Number(declared) > maxBytes)
  )
    return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function jsonResponse(
  status: number,
  body: Record<string, unknown>,
  headers?: HeadersInit,
): Response {
  const response = Response.json(body, { status, headers });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

const NOT_FOUND = { status: "not_found" };

export type SetupProofDependencies = {
  env: { VERCEL_ENV?: string; S0_2_PROOF_TOKEN?: string };
  /** The identity facts from configuration — no client is constructed. */
  resolveIdentity: () => IdentityResult;
  /** The privileged client, built only after the identity passed the target check. */
  createClient: () => PrivilegedClientResult;
};

function defaultDependencies(): SetupProofDependencies {
  return {
    env: {
      VERCEL_ENV: process.env.VERCEL_ENV,
      S0_2_PROOF_TOKEN: process.env.S0_2_PROOF_TOKEN,
    },
    resolveIdentity: resolveServerIdentity,
    createClient: createPrivilegedClient,
  };
}

export async function handleSetupProof(
  request: Request,
  deps: SetupProofDependencies = defaultDependencies(),
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse(
      405,
      { status: "method_not_allowed" },
      { Allow: "POST" },
    );
  }
  // Trusted deployment context first: outside a Preview every request is denied whatever it carries.
  if (deps.env.VERCEL_ENV !== "preview") return jsonResponse(404, NOT_FOUND);
  if (
    !isAuthorized(
      request.headers.get("authorization"),
      deps.env.S0_2_PROOF_TOKEN,
    )
  )
    return jsonResponse(404, NOT_FOUND);

  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json\b/i.test(contentType))
    return jsonResponse(400, { status: "invalid_request" });
  const text = await readBounded(request, MAX_BODY_BYTES);
  const proof = text === null ? null : parseProofRequest(text);
  if (!proof) return jsonResponse(400, { status: "invalid_request" });

  // The target is decided from configured facts before any client exists: TEST inside a Preview, or
  // nothing. PROD and every other context are refused here.
  const resolved = deps.resolveIdentity();
  if (!resolved.ok || !isPreviewTestTarget(resolved.identity))
    return jsonResponse(503, { status: "target_unavailable" });
  const created = deps.createClient();
  if (!created.ok || !isPreviewTestTarget(created.identity))
    return jsonResponse(503, { status: "target_unavailable" });
  const { client } = created;
  const { action, marker } = proof;

  try {
    if (action === "create") {
      const { error } = await client
        .from("system_checks")
        .insert({ check_key: marker, ...FIXED_ROW })
        .select("id")
        .abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS));
      if (error)
        return error.code === "23505"
          ? jsonResponse(409, { status: "exists", marker })
          : jsonResponse(503, { status: "db_error" });
      return jsonResponse(200, { status: "created", marker });
    }
    if (action === "read") {
      const { data, error } = await client
        .from("system_checks")
        .select("id")
        .eq("check_key", marker)
        .eq("synthetic", true)
        .limit(1)
        .abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS));
      if (error) return jsonResponse(503, { status: "db_error" });
      return jsonResponse(200, {
        status: "read",
        marker,
        found: Array.isArray(data) && data.length > 0,
      });
    }
    // cleanup: only the row that carries exactly this run's marker and is synthetic.
    const { data, error } = await client
      .from("system_checks")
      .delete()
      .eq("check_key", marker)
      .eq("synthetic", true)
      .select("id")
      .abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS));
    if (error) return jsonResponse(503, { status: "db_error" });
    return jsonResponse(200, {
      status: "cleaned",
      marker,
      deleted: Array.isArray(data) ? data.length : 0,
    });
  } catch {
    return jsonResponse(503, { status: "db_error" });
  }
}
