import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import * as Sentry from "@sentry/nextjs";

/**
 * Temporary S0.1 diagnostic behind `POST /api/sentry-test` (docs/TECH-ARCHITECTURE.md §3c): lets the owner
 * raise one synthetic Sentry issue on a deployment to prove that the alert reaches them. The route, this
 * helper and its tests are removed by the S0.2 PR at the latest, and SENTRY_TEST_TOKEN is revoked.
 *
 * - Authorisation is `Authorization: Bearer <SENTRY_TEST_TOKEN>`, checked here on the server before anything
 *   is emitted. An unset, empty or short configured token disables the route (fail closed).
 * - Every denied request gets the same generic 404 and emits nothing.
 * - The request body and query string are never read: the event text is fixed.
 */

/** A configured token shorter than this is treated as unset. */
export const MIN_TOKEN_LENGTH = 32;
/** Upper bound on waiting for Sentry to accept the event before responding. */
export const FLUSH_TIMEOUT_MS = 2000;
export const SYNTHETIC_EVENT_MESSAGE =
  "Aalishaan Studio S0.1 synthetic Sentry test event";

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

function jsonResponse(
  status: number,
  body: { status: string },
  headers?: HeadersInit,
): Response {
  const response = Response.json(body, { status, headers });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function handleSentryTest(request: Request): Promise<Response> {
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
      process.env.SENTRY_TEST_TOKEN,
    )
  ) {
    return jsonResponse(404, { status: "not_found" });
  }

  const client = Sentry.getClient();
  if (!client?.getDsn()) {
    // Monitoring is optional at runtime (TECH-ARCHITECTURE §7); an unconfigured SDK is not an alert PASS.
    return jsonResponse(503, { status: "sentry_not_configured" });
  }

  const { environment, release } = client.getOptions();
  Sentry.withScope((scope) => {
    scope.setTag("diagnostic", "s0.1-sentry-test");
    // One issue per environment and release, so each Preview candidate and Production raise a new-issue alert.
    scope.setFingerprint([
      "s0.1-sentry-test",
      environment ?? "unknown",
      release ?? "unknown",
    ]);
    Sentry.captureException(new Error(SYNTHETIC_EVENT_MESSAGE));
  });

  const delivered = await Sentry.flush(FLUSH_TIMEOUT_MS);
  return delivered
    ? jsonResponse(200, { status: "sent" })
    : jsonResponse(503, { status: "not_confirmed" });
}
