import "server-only";

import {
  hashIdentifier,
  parseCodeCount,
  readUpstashEnv,
  runPipeline,
  type ThrottleDependencies,
  type ThrottleOutcome,
} from "./login-throttle";

/**
 * The bag endpoint's rate limit — S1.6, carried from S1.5 (D-58 #3; docs/THREAT-MODEL.md, the read-amplification
 * residual of `POST /api/bag`). Upstash Redis over the staff throttle's REST pipeline
 * (src/lib/server/login-throttle.ts `runPipeline`), in its own namespace — separate from the staff quotas and the
 * checkout's (src/lib/server/checkout-throttle.ts):
 *
 *   - `bag:ip:<hash>` — 600 bag checks per client address per 10 minutes. Every check of a non-empty bag is one
 *     fresh read of the public projection; the limit bounds that read, it does not challenge the visitor (D-58
 *     assigns a rate limit to this read-only endpoint, not Turnstile). The number is sized so ordinary browsing —
 *     and the deployed test suite, which shares one address — stays well inside it while a burst is refused.
 *
 * Counted after the request has passed its bounds and its strict schema and only for a non-empty bag: a malformed
 * request is refused without a Redis call, and an empty bag is answered without the limiter or the projection.
 * The address reaches Redis only as a SHA-256 hash; an absent address shares one "unknown" key.
 *
 * Fails closed, the Preview included: a missing or malformed name, a network error, a timeout, a non-2xx answer or
 * an unexpected body is `unavailable` — the endpoint answers 503 and the browser keeps the rows and says the bag
 * could not be checked. It never answers an empty successful bag. The hashing lives here, not in
 * src/lib/server/bag.ts, which stays free of any write-shaped call.
 */

export const BAG_LIMIT = { max: 600, windowMs: 10 * 60 * 1000 } as const;

export function bagThrottleKey(address: string): string {
  return `bag:ip:${hashIdentifier(address || "unknown")}`;
}

export function bagThrottleCommands(key: string): unknown[][] {
  return [
    ["INCR", key],
    ["PEXPIRE", key, BAG_LIMIT.windowMs, "NX"],
  ];
}

function defaultDependencies(): ThrottleDependencies {
  return { env: readUpstashEnv(), fetch: globalThis.fetch };
}

/** Counts one bag check for `address` and says whether the projection may be read. Nothing about it is logged. */
export async function consumeBagCheck(
  address: string,
  deps: ThrottleDependencies = defaultDependencies(),
): Promise<ThrottleOutcome> {
  const answer = await runPipeline(
    bagThrottleCommands(bagThrottleKey(address)),
    deps,
  );
  if (!answer) return { ok: false, reason: "unavailable" };
  const count = parseCodeCount(answer.body);
  if (count === null) return { ok: false, reason: "unavailable" };
  return count > BAG_LIMIT.max
    ? { ok: false, reason: "rate_limited" }
    : { ok: true };
}
