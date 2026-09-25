// @ts-check
/**
 * TEST target resolution and read-only identity probes for the S0.2 harness (docs/ENVIRONMENT-PARITY.md
 * §10, §12 P1/P11). Every message names variables, never values. The rules mirror
 * src/lib/supabase/config.ts; they are repeated here because these scripts run outside the Next.js bundle.
 */

export const PROJECT_REF = /^[a-z]{20}$/;
const SUPABASE_HOST = /^([a-z]{20})\.supabase\.co$/;
const PUBLISHABLE_KEY_PREFIX = "sb_publishable_";
const SECRET_KEY_PREFIX = "sb_secret_";

/** The names a TEST run needs; the two refs are non-secret identifiers, the rest are values never printed. */
export const TARGET_NAMES = Object.freeze([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_TEST_PROJECT_REF",
  "SUPABASE_PROD_PROJECT_REF",
]);

/**
 * @param {string | undefined} value
 * @returns {value is string}
 */
function present(value) {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * The project ref of a Supabase API URL, or null unless it is exactly `https://<ref>.supabase.co[/]`.
 * @param {string | undefined} value
 * @returns {string | null}
 */
export function projectRefFromUrl(value) {
  if (!present(value)) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "")
    return null;
  if (url.search !== "" || url.hash !== "") return null;
  if (url.pathname !== "/" && url.pathname !== "") return null;
  const match = SUPABASE_HOST.exec(url.hostname);
  return match ? match[1] : null;
}

/**
 * @typedef {{
 *   url: string,
 *   ref: string,
 *   testRef: string,
 *   prodRef: string,
 *   publishableKey: string,
 *   secretKey: string,
 * }} TestTarget
 */

/**
 * Resolves the TEST target from configured facts and fails closed with names-only reasons: every name
 * present, both refs well formed and distinct, the URL's ref equal to the TEST ref (a URL pointing at the
 * PROD ref is refused outright), and both keys of their documented shape (current-format keys only; a
 * legacy JWT in either slot is refused).
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @returns {{ ok: true, target: TestTarget } | { ok: false, reasons: string[] }}
 */
export function resolveTestTarget(env) {
  const missing = TARGET_NAMES.filter((name) => !present(env[name]));
  if (missing.length > 0)
    return { ok: false, reasons: missing.map((name) => `${name} is not set`) };
  const url = /** @type {string} */ (env.NEXT_PUBLIC_SUPABASE_URL);
  const publishableKey = /** @type {string} */ (
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
  const secretKey = /** @type {string} */ (env.SUPABASE_SECRET_KEY);
  const testRef = /** @type {string} */ (env.SUPABASE_TEST_PROJECT_REF);
  const prodRef = /** @type {string} */ (env.SUPABASE_PROD_PROJECT_REF);
  /** @type {string[]} */
  const reasons = [];
  if (!PROJECT_REF.test(testRef))
    reasons.push(
      "SUPABASE_TEST_PROJECT_REF is not a project ref (20 lower-case letters)",
    );
  if (!PROJECT_REF.test(prodRef))
    reasons.push(
      "SUPABASE_PROD_PROJECT_REF is not a project ref (20 lower-case letters)",
    );
  if (testRef === prodRef)
    reasons.push(
      "SUPABASE_TEST_PROJECT_REF equals SUPABASE_PROD_PROJECT_REF — TEST and PROD must be distinct projects",
    );
  const ref = projectRefFromUrl(url);
  if (!ref)
    reasons.push(
      "NEXT_PUBLIC_SUPABASE_URL is not an https://<ref>.supabase.co origin",
    );
  else if (ref === prodRef)
    reasons.push(
      "NEXT_PUBLIC_SUPABASE_URL points at SUPABASE_PROD_PROJECT_REF — refused",
    );
  else if (ref !== testRef)
    reasons.push(
      "NEXT_PUBLIC_SUPABASE_URL does not point at SUPABASE_TEST_PROJECT_REF",
    );
  if (!publishableKey.startsWith(PUBLISHABLE_KEY_PREFIX))
    reasons.push(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not a publishable key (sb_publishable_…)",
    );
  if (!secretKey.startsWith(SECRET_KEY_PREFIX))
    reasons.push("SUPABASE_SECRET_KEY is not a secret key (sb_secret_…)");
  if (reasons.length > 0 || !ref) return { ok: false, reasons };
  return {
    ok: true,
    target: {
      url: new URL(url).origin,
      ref,
      testRef,
      prodRef,
      publishableKey,
      secretKey,
    },
  };
}

/**
 * @typedef {{
 *   publicKeyAccepted: boolean,
 *   secretKeyAccepted: boolean,
 *   authHealthy: boolean,
 *   baseline: "present" | "absent" | "unknown",
 *   anonRead: { status: number, rows: number | null },
 *   statuses: Record<string, number>,
 * }} IdentityProbe
 */

/**
 * Read-only probes against the resolved TEST project. The REST root with each key proves that the key is
 * accepted by exactly this project's gateway (an opaque key is never decoded); the Auth health endpoint
 * proves the project is up (P11, including the Free-plan pause); a bounded read of `system_checks` with
 * the secret key reports whether the 0000_init baseline exists; the same read with the publishable key
 * must be denied or empty. Only statuses and row counts are kept — never a body.
 * @param {TestTarget} target
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [options]
 * @returns {Promise<IdentityProbe>}
 */
export async function probeIdentity(target, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 8000;
  /** @type {Record<string, number>} */
  const statuses = {};

  /**
   * @param {string} label
   * @param {string} pathname
   * @param {string} key
   * @returns {Promise<{ status: number, rows: number | null }>}
   */
  async function probe(label, pathname, key) {
    const response = await fetchImpl(`${target.url}${pathname}`, {
      method: "GET",
      headers: { apikey: key, authorization: `Bearer ${key}` },
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    let rows = null;
    if (response.status === 200) {
      // Drain the body without keeping it; only an array length is retained.
      const text = await response.text();
      try {
        const parsed = JSON.parse(text);
        rows = Array.isArray(parsed) ? parsed.length : null;
      } catch {
        rows = null;
      }
    } else {
      await response.arrayBuffer();
    }
    statuses[label] = response.status;
    return { status: response.status, rows };
  }

  const publicRoot = await probe(
    "rest root (publishable key)",
    "/rest/v1/",
    target.publishableKey,
  );
  const secretRoot = await probe(
    "rest root (secret key)",
    "/rest/v1/",
    target.secretKey,
  );
  const auth = await probe(
    "auth health",
    "/auth/v1/health",
    target.publishableKey,
  );
  const baselineRead = await probe(
    "system_checks (secret key)",
    "/rest/v1/system_checks?select=id&limit=1",
    target.secretKey,
  );
  const anonRead = await probe(
    "system_checks (publishable key)",
    "/rest/v1/system_checks?select=id&limit=1",
    target.publishableKey,
  );

  /** @type {"present" | "absent" | "unknown"} */
  let baseline = "unknown";
  if (baselineRead.status === 200) baseline = "present";
  else if (baselineRead.status === 404) baseline = "absent";

  return {
    publicKeyAccepted: publicRoot.status === 200,
    secretKeyAccepted: secretRoot.status === 200,
    authHealthy: auth.status === 200,
    baseline,
    anonRead: { status: anonRead.status, rows: anonRead.rows },
    statuses,
  };
}

/**
 * The names-only verdict of a probe: what blocks a fixture or proof run.
 * @param {IdentityProbe} probe
 * @param {{ requireBaseline?: boolean }} [options]
 * @returns {string[]}
 */
export function probeProblems(probe, options = {}) {
  /** @type {string[]} */
  const problems = [];
  if (!probe.publicKeyAccepted)
    problems.push(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not accepted by the TEST project's API",
    );
  if (!probe.secretKeyAccepted)
    problems.push(
      "SUPABASE_SECRET_KEY is not accepted by the TEST project's API",
    );
  if (!probe.authHealthy)
    problems.push(
      "the TEST project's Auth health endpoint did not answer 200 (paused project or outage — resume it in the Supabase dashboard and retry)",
    );
  if (options.requireBaseline !== false && probe.baseline !== "present")
    problems.push(
      probe.baseline === "absent"
        ? "system_checks is absent: apply 0000_init to TEST first (docs/database-changes/S0.2-0000-init.md)"
        : "system_checks could not be read with SUPABASE_SECRET_KEY",
    );
  if (probe.anonRead.status === 200 && (probe.anonRead.rows ?? 0) > 0)
    problems.push(
      "the publishable key can read system_checks rows — RLS or grants are wrong; stop and fix the baseline",
    );
  return problems;
}
