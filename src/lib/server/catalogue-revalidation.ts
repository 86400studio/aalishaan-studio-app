import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import { revalidatePath, revalidateTag } from "next/cache";

import { CATALOGUE_PAGE_PATHS } from "@/lib/catalogue/browse-model";

import { CATALOGUE_TAG } from "./catalogue";

/**
 * The catalogue's revalidation hook behind `POST /api/revalidate/catalogue` — S1.4 (docs/TECH-ARCHITECTURE.md §3c;
 * the retired S0.2 proof route's reviewed pattern). It lets a publish (the S2.5 Admin, or the owner's trusted
 * tooling) refresh the ISR browse pages at once instead of after their window. It reads and writes no data: it only
 * expires the catalogue's data-cache tag and the 17 browse paths, so the next visit renders the projection afresh — a
 * hidden or drafted artwork is gone on the next request. That visit waits for its render (no stale page after the
 * hook), so a call while the projection cannot be read turns the browse pages into the designed 500 — under `next
 * start` until a read succeeds; on Vercel the platform's cache decides after the first request
 * (src/lib/server/catalogue.ts; docs/TECH-ARCHITECTURE.md §3c).
 *
 * Fail-closed order, before any side effect:
 *   1. only POST;
 *   2. an exact `Authorization: Bearer <CATALOGUE_REVALIDATION_SECRET>` (server-only; unset, empty or shorter than 32
 *      characters disables the route, and so does a character outside the bearer token set below, as no header can
 *      carry it — `openssl rand -hex 32` gives a valid one) — absent, malformed or wrong credentials are denied;
 *   3. a small, exact JSON body `{ "target": "catalogue" }` — the only target; no caller-chosen path, tag or URL.
 * Every denial in 2 is the same generic `404`, which reads no body; invalid input after it is `400`. Only then are the
 * one allow-listed tag (`revalidateTag(…, { expire: 0 })`: never served stale again) and the 17 literal paths
 * (`revalidatePath`, which also reaches a page prerendered without the tag, as a build without its environment
 * prerenders it) expired. No secret, upstream body or stack trace in any response; `Cache-Control: no-store`.
 * Deployment Protection is separate from this authorisation. The secret is read here and nowhere else.
 */

/** A configured secret shorter than this is treated as unset. */
export const MIN_SECRET_LENGTH = 32;
/** Upper bound on the request body; the fixed payload is far smaller. */
export const MAX_BODY_BYTES = 256;
/** What a caller may ask to refresh: the whole catalogue — every consumer of the projection at once. */
export const REVALIDATION_TARGETS = ["catalogue"] as const;
export type RevalidationTarget = (typeof REVALIDATION_TARGETS)[number];

// RFC 6750 b64token after the exact scheme "Bearer" and one space; nothing else is accepted.
const BEARER_CREDENTIAL = /^Bearer ([A-Za-z0-9\-._~+/]+=*)$/;

function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/** True only when the header carries exactly the configured secret. Never throws. */
export function isAuthorized(
  authorization: string | null,
  configuredSecret: string | undefined,
): boolean {
  if (!configuredSecret || configuredSecret.length < MIN_SECRET_LENGTH)
    return false;
  const credential =
    authorization === null ? null : BEARER_CREDENTIAL.exec(authorization);
  if (!credential) return false;
  // Equal-length digests: the comparison takes the same time whatever the presented secret's length.
  return timingSafeEqual(sha256(credential[1]), sha256(configuredSecret));
}

/** Exactly one string field naming an allow-listed target; anything else (extra keys, arrays, other types) is null. */
export function parseRevalidationRequest(
  text: string,
): RevalidationTarget | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    return null;
  const keys = Object.keys(parsed);
  if (keys.length !== 1 || keys[0] !== "target") return null;
  const { target } = parsed as Record<string, unknown>;
  return typeof target === "string" &&
    (REVALIDATION_TARGETS as readonly string[]).includes(target)
    ? (target as RevalidationTarget)
    : null;
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

export type CatalogueRevalidationDependencies = {
  env: { CATALOGUE_REVALIDATION_SECRET?: string };
  revalidateTag: (tag: string, profile: { expire: number }) => void;
  revalidatePath: (path: string) => void;
};

function defaultDependencies(): CatalogueRevalidationDependencies {
  return {
    env: {
      CATALOGUE_REVALIDATION_SECRET: process.env.CATALOGUE_REVALIDATION_SECRET,
    },
    revalidateTag,
    revalidatePath,
  };
}

export async function handleCatalogueRevalidation(
  request: Request,
  deps: CatalogueRevalidationDependencies = defaultDependencies(),
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse(
      405,
      { status: "method_not_allowed" },
      { Allow: "POST" },
    );
  }
  if (
    !isAuthorized(
      request.headers.get("authorization"),
      deps.env.CATALOGUE_REVALIDATION_SECRET,
    )
  )
    return jsonResponse(404, NOT_FOUND);

  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json\b/i.test(contentType))
    return jsonResponse(400, { status: "invalid_request" });
  const text = await readBounded(request, MAX_BODY_BYTES);
  const target = text === null ? null : parseRevalidationRequest(text);
  if (target === null) return jsonResponse(400, { status: "invalid_request" });

  // The one target today: every consumer of the projection — the data-cache entry and the 17 browse pages.
  deps.revalidateTag(CATALOGUE_TAG, { expire: 0 });
  for (const path of CATALOGUE_PAGE_PATHS) deps.revalidatePath(path);
  return jsonResponse(200, {
    status: "revalidated",
    target,
    paths: CATALOGUE_PAGE_PATHS.length,
  });
}
