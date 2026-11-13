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
 * The checkout's rate limits — S1.6 (docs/TECH-ARCHITECTURE.md §7; docs/SECURITY-CHECKLIST.md §5). Upstash Redis
 * over the same REST pipeline as the staff sign-in throttle (src/lib/server/login-throttle.ts `runPipeline`), in a
 * namespace of its own, so the staff quotas and the bag's (src/lib/server/bag-throttle.ts) are untouched:
 *
 *   - `checkout:submit:ip:<hash>` — 10 submissions per client address per 10 minutes, counted before Turnstile is
 *     verified and before anything is written, so a refused submission costs the same as an accepted one;
 *   - `checkout:resume:ip:<hash>` — 60 resumes per client address per 10 minutes (a resume reads one attempt by its
 *     key and may make one bounded provider read).
 *
 * Fixed windows: `INCR`, then `PEXPIRE … NX` so a running window is left alone and every key expires by itself.
 * The address reaches Redis only as a SHA-256 hash; an absent address shares one "unknown" key rather than
 * skipping the limit. Fails closed everywhere, the Preview included: a missing or malformed name, a network
 * error, a timeout, a non-2xx answer or an unexpected body is `unavailable` and the action stops.
 */

export const CHECKOUT_LIMITS = {
  submit: { max: 10, windowMs: 10 * 60 * 1000 },
  resume: { max: 60, windowMs: 10 * 60 * 1000 },
} as const;

export type CheckoutThrottleKind = keyof typeof CHECKOUT_LIMITS;

export function checkoutThrottleKey(
  kind: CheckoutThrottleKind,
  address: string,
): string {
  return `checkout:${kind}:ip:${hashIdentifier(address || "unknown")}`;
}

export function checkoutThrottleCommands(
  kind: CheckoutThrottleKind,
  key: string,
): unknown[][] {
  return [
    ["INCR", key],
    ["PEXPIRE", key, CHECKOUT_LIMITS[kind].windowMs, "NX"],
  ];
}

function defaultDependencies(): ThrottleDependencies {
  return { env: readUpstashEnv(), fetch: globalThis.fetch };
}

/** Counts one checkout action for `address` and says whether it may proceed. Nothing about it is logged. */
export async function consumeCheckoutAttempt(
  kind: CheckoutThrottleKind,
  address: string,
  deps: ThrottleDependencies = defaultDependencies(),
): Promise<ThrottleOutcome> {
  const answer = await runPipeline(
    checkoutThrottleCommands(kind, checkoutThrottleKey(kind, address)),
    deps,
  );
  if (!answer) return { ok: false, reason: "unavailable" };
  const count = parseCodeCount(answer.body);
  if (count === null) return { ok: false, reason: "unavailable" };
  return count > CHECKOUT_LIMITS[kind].max
    ? { ok: false, reason: "rate_limited" }
    : { ok: true };
}
