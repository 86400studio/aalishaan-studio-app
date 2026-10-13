import "server-only";

import { createHash } from "node:crypto";

/**
 * The staff sign-in throttle — S1.2 (docs/TECH-ARCHITECTURE.md §5, §7; docs/SECURITY-CHECKLIST.md §5).
 * Upstash Redis over its REST pipeline, in two steps of the sign-in:
 *
 *   - the password step: one request counts the attempt against two fixed windows — the e-mail address
 *     (5 attempts per 15 minutes) and the client address (20 per 15 minutes) — before the password is ever
 *     checked, so a wrong guess and a right one cost the same;
 *   - the code step: each six-digit code tried against a member's authenticator counts against that member
 *     (5 per 15 minutes), so a stolen password cannot be followed by an unbounded run of code guesses.
 *
 * The identifiers reach Redis only as SHA-256 hashes: no address of either kind and no user id is stored or
 * logged in clear (a hash, not a secret: someone who can read the database can still test a known address
 * against a key).
 *
 * Fails closed, everywhere: a missing or malformed name, a network error, a timeout, a non-2xx answer or an
 * unexpected body refuses the step with `unavailable`. The owner sets the TEST database's values in the
 * Preview and Development scopes and the PROD database's in Production (ENVIRONMENT-PARITY §4); without them
 * nobody can sign in, which is the intended failure mode of an abuse control. The two names are read here and
 * nowhere else in `src/` (the eslint server-only names rule).
 */

export const LOGIN_LIMITS = {
  email: { max: 5, windowMs: 15 * 60 * 1000 },
  ip: { max: 20, windowMs: 15 * 60 * 1000 },
  code: { max: 5, windowMs: 15 * 60 * 1000 },
} as const;

export const THROTTLE_TIMEOUT_MS = 3000;

export type ThrottleOutcome =
  { ok: true } | { ok: false; reason: "rate_limited" | "unavailable" };

export type UpstashEnv = {
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
};

export function readUpstashEnv(): UpstashEnv {
  return {
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  };
}

/** The REST origin, accepted only as a plain https URL with no path, query, fragment or credentials. */
export function upstashOrigin(value: string | undefined): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "")
    return null;
  if (url.search !== "" || url.hash !== "") return null;
  if (url.pathname !== "/" && url.pathname !== "") return null;
  return url.origin;
}

/**
 * The e-mail address as every sink sees it — trimmed and lower-cased once. The sign-in action sends this one
 * string to the throttle, to the audit hash and to the Auth server, so two spellings of one address can never
 * be counted under two keys while the Auth server folds them into one account.
 */
export function normaliseEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** A stable key part that carries no identifier in clear: lower-cased, trimmed, SHA-256 hex (unsalted). */
export function hashIdentifier(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

export function throttleKeys(
  email: string,
  ip: string,
): { email: string; ip: string } {
  return {
    email: `login:email:${hashIdentifier(email)}`,
    ip: `login:ip:${hashIdentifier(ip || "unknown")}`,
  };
}

/** The pipeline: INCR each key, then set its window once (PEXPIRE … NX leaves a running window alone). */
export function throttleCommands(keys: {
  email: string;
  ip: string;
}): unknown[][] {
  return [
    ["INCR", keys.email],
    ["PEXPIRE", keys.email, LOGIN_LIMITS.email.windowMs, "NX"],
    ["INCR", keys.ip],
    ["PEXPIRE", keys.ip, LOGIN_LIMITS.ip.windowMs, "NX"],
  ];
}

/**
 * The two counts out of a pipeline answer, or null for anything other than four `{ result }` entries whose INCR
 * results are non-negative integers (an `{ error }` entry anywhere makes the whole answer unusable).
 */
export function parsePipelineCounts(
  body: unknown,
): { email: number; ip: number } | null {
  if (!Array.isArray(body) || body.length !== 4) return null;
  for (const entry of body) {
    if (typeof entry !== "object" || entry === null) return null;
    if ("error" in entry) return null;
  }
  const email = (body[0] as { result?: unknown }).result;
  const ip = (body[2] as { result?: unknown }).result;
  if (!Number.isInteger(email) || !Number.isInteger(ip)) return null;
  if ((email as number) < 0 || (ip as number) < 0) return null;
  return { email: email as number, ip: ip as number };
}

export function evaluateCounts(counts: {
  email: number;
  ip: number;
}): ThrottleOutcome {
  if (counts.email > LOGIN_LIMITS.email.max || counts.ip > LOGIN_LIMITS.ip.max)
    return { ok: false, reason: "rate_limited" };
  return { ok: true };
}

/** The key of the code step: one counter per member, by the hash of their user id. */
export function codeThrottleKey(userId: string): string {
  return `login:code:${hashIdentifier(userId)}`;
}

export function codeThrottleCommands(key: string): unknown[][] {
  return [
    ["INCR", key],
    ["PEXPIRE", key, LOGIN_LIMITS.code.windowMs, "NX"],
  ];
}

/**
 * The count out of the code step's pipeline answer, or null for anything other than two `{ result }` entries
 * whose INCR result is a non-negative integer.
 */
export function parseCodeCount(body: unknown): number | null {
  if (!Array.isArray(body) || body.length !== 2) return null;
  for (const entry of body) {
    if (typeof entry !== "object" || entry === null) return null;
    if ("error" in entry) return null;
  }
  const count = (body[0] as { result?: unknown }).result;
  if (!Number.isInteger(count) || (count as number) < 0) return null;
  return count as number;
}

export type ThrottleDependencies = {
  env: UpstashEnv;
  fetch: typeof fetch;
};

function defaultDependencies(): ThrottleDependencies {
  return { env: readUpstashEnv(), fetch: globalThis.fetch };
}

/** One pipeline request; the parsed JSON body, or `null` for every way the request can fail. */
async function runPipeline(
  commands: unknown[][],
  deps: ThrottleDependencies,
): Promise<{ body: unknown } | null> {
  const origin = upstashOrigin(deps.env.UPSTASH_REDIS_REST_URL);
  const token = deps.env.UPSTASH_REDIS_REST_TOKEN;
  if (!origin || typeof token !== "string" || token.trim() === "") return null;
  let response: Response;
  try {
    response = await deps.fetch(`${origin}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
      signal: AbortSignal.timeout(THROTTLE_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  try {
    return { body: await response.json() };
  } catch {
    return null;
  }
}

/**
 * Counts one sign-in attempt for `email` from `ip` and says whether it may proceed. Every failure path answers
 * `unavailable`; nothing about the attempt is logged.
 */
export async function consumeLoginAttempt(
  attempt: { email: string; ip: string },
  deps: ThrottleDependencies = defaultDependencies(),
): Promise<ThrottleOutcome> {
  const answer = await runPipeline(
    throttleCommands(throttleKeys(attempt.email, attempt.ip)),
    deps,
  );
  if (!answer) return { ok: false, reason: "unavailable" };
  const counts = parsePipelineCounts(answer.body);
  if (!counts) return { ok: false, reason: "unavailable" };
  return evaluateCounts(counts);
}

/**
 * Counts one code tried against the authenticator of the member `userId` and says whether it may be checked.
 * Counted before the Auth server sees the code, right or wrong; every failure path answers `unavailable`.
 */
export async function consumeCodeAttempt(
  userId: string,
  deps: ThrottleDependencies = defaultDependencies(),
): Promise<ThrottleOutcome> {
  if (userId.trim() === "") return { ok: false, reason: "unavailable" };
  const answer = await runPipeline(
    codeThrottleCommands(codeThrottleKey(userId)),
    deps,
  );
  if (!answer) return { ok: false, reason: "unavailable" };
  const count = parseCodeCount(answer.body);
  if (count === null) return { ok: false, reason: "unavailable" };
  return count > LOGIN_LIMITS.code.max
    ? { ok: false, reason: "rate_limited" }
    : { ok: true };
}

/**
 * The client address Vercel vouches for (`x-real-ip`; `x-forwarded-for`'s first entry as the fallback). An
 * absent address throttles under one shared "unknown" key rather than skipping the per-address window.
 */
export function clientAddressOf(headers: Headers): string {
  const real = headers.get("x-real-ip");
  if (real && real.trim() !== "") return real.trim();
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return "";
}
