import "server-only";

/**
 * Cloudflare Turnstile, the server half — S1.6 (docs/TECH-ARCHITECTURE.md §7; docs/SECURITY-CHECKLIST.md §5).
 * Every checkout submission carries a token from the widget and the server verifies it here, once, before any
 * business write: `POST https://challenges.cloudflare.com/turnstile/v0/siteverify` (a fixed URL) with the secret,
 * the token and the client address Vercel vouches for. A token is single-use and lives five minutes; Cloudflare
 * itself refuses a spent or expired one.
 *
 * Fails closed: a missing secret or token, a network error, a timeout, a non-200 answer, a body that is not the
 * documented shape, or Cloudflare's own `internal-error` / secret errors answer `unavailable`; a refused token
 * answers `failed` (the page asks for a fresh one). Nothing else passes.
 *
 * A real key's answer must also name this deployment and this form: `hostname` among the deployment's own
 * hostnames (from Vercel's system values, never from the request) and `action` equal to `checkout`.
 *
 * Cloudflare's published dummy secrets (always pass / always fail / token already spent) answer with the hostname
 * `example.com` and no action, so for them — and only for them — those two checks cannot apply. They are test
 * configuration chosen by environment, never by the browser: in Production a dummy secret is `unavailable`, so a
 * test key can never stand in for the real control there.
 *
 * The secret arrives as an argument (read by the sales gate); nothing here reads the environment, and neither the
 * token, the secret nor Cloudflare's body is logged or returned.
 */

export const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const TURNSTILE_ACTION = "checkout";
export const TURNSTILE_TIMEOUT_MS = 5000;
export const TURNSTILE_MAX_TOKEN_LENGTH = 2048;

/** Cloudflare's documented testing secrets (developers.cloudflare.com/turnstile/troubleshooting/testing). */
export const TURNSTILE_DUMMY_SECRETS: readonly string[] = [
  "1x0000000000000000000000000000000AA",
  "2x0000000000000000000000000000000AA",
  "3x0000000000000000000000000000000AA",
];

export type TurnstileOutcome =
  { ok: true } | { ok: false; reason: "failed" | "unavailable" };

export type TurnstileRequest = {
  token: string;
  secret: string;
  /** The client address, when known. */
  remoteIp: string;
  /** The deployment's own hostnames. */
  expectedHostnames: readonly string[];
  /** True in the Production deployment context: a dummy secret is refused there. */
  production: boolean;
};

/** Errors that mean the control itself is not working — never the visitor's fault. */
const CONTROL_ERRORS = new Set([
  "missing-input-secret",
  "invalid-input-secret",
  "bad-request",
  "internal-error",
]);

export async function verifyTurnstile(
  request: TurnstileRequest,
  fetcher: typeof fetch = globalThis.fetch,
): Promise<TurnstileOutcome> {
  const { token, secret } = request;
  if (typeof secret !== "string" || secret.trim() === "")
    return { ok: false, reason: "unavailable" };
  if (
    typeof token !== "string" ||
    token === "" ||
    token.length > TURNSTILE_MAX_TOKEN_LENGTH
  )
    return { ok: false, reason: "failed" };
  const dummy = TURNSTILE_DUMMY_SECRETS.includes(secret);
  if (dummy && request.production) return { ok: false, reason: "unavailable" };

  const form = new URLSearchParams();
  form.set("secret", secret);
  form.set("response", token);
  if (request.remoteIp !== "") form.set("remoteip", request.remoteIp);

  let response: Response;
  try {
    response = await fetcher(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      signal: AbortSignal.timeout(TURNSTILE_TIMEOUT_MS),
      cache: "no-store",
      redirect: "error",
    });
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if (response.status !== 200) return { ok: false, reason: "unavailable" };
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if (typeof body !== "object" || body === null)
    return { ok: false, reason: "unavailable" };
  const answer = body as Record<string, unknown>;
  if (typeof answer.success !== "boolean")
    return { ok: false, reason: "unavailable" };
  if (!answer.success) {
    const codes = Array.isArray(answer["error-codes"])
      ? answer["error-codes"]
      : [];
    return codes.some(
      (code) => typeof code === "string" && CONTROL_ERRORS.has(code),
    )
      ? { ok: false, reason: "unavailable" }
      : { ok: false, reason: "failed" };
  }
  if (dummy) return { ok: true };
  const hostname =
    typeof answer.hostname === "string" ? answer.hostname.toLowerCase() : "";
  if (hostname === "" || !request.expectedHostnames.includes(hostname))
    return { ok: false, reason: "failed" };
  if (answer.action !== TURNSTILE_ACTION)
    return { ok: false, reason: "failed" };
  return { ok: true };
}
