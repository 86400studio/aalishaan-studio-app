/**
 * Supabase configuration shared by the browser client (`./browser.ts`, public values only) and the
 * server-only privileged client (`@/lib/server/supabase.ts`) — S0.2 (docs/TECH-ARCHITECTURE.md §2, §6;
 * docs/ENVIRONMENT-PARITY.md §4). Pure functions over an env-like object: nothing here reads
 * `process.env`, creates a client, performs I/O or holds a secret, so the module is safe in both bundles.
 *
 * Identity is decided from configured facts, never inferred: the project ref parsed from the API URL must
 * equal the independently configured ref that the deployment context expects (Production → PROD, everything
 * else → TEST), and the two refs must differ. No key is ever decoded: the current keys are opaque and are
 * only checked for their documented shape — a publishable key starts with `sb_publishable_`, a secret key
 * with `sb_secret_`; a legacy JWT (`anon` / `service_role`) in either slot is refused (S0.2 decision: the
 * project uses the current key format only).
 */

export type DeploymentContext =
  "production" | "preview" | "development" | "unknown";

/** A Supabase project ref is the 20-letter subdomain of `https://<ref>.supabase.co`. */
export const PROJECT_REF_PATTERN = /^[a-z]{20}$/;
const SUPABASE_HOST_PATTERN = /^([a-z]{20})\.supabase\.co$/;

export const SECRET_KEY_PREFIX = "sb_secret_";
export const PUBLISHABLE_KEY_PREFIX = "sb_publishable_";

export function isProjectRef(value: unknown): value is string {
  return typeof value === "string" && PROJECT_REF_PATTERN.test(value);
}

function present(value: string | undefined): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * The project ref of a Supabase API URL, or null unless the value is exactly `https://<ref>.supabase.co`
 * (an optional trailing slash; no userinfo, path, query or fragment).
 */
export function projectRefFromUrl(value: string | undefined): string | null {
  if (!present(value)) return null;
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
  const match = SUPABASE_HOST_PATTERN.exec(url.hostname);
  return match ? match[1] : null;
}

/**
 * From Vercel's trusted deployment context (`VERCEL_ENV`), never `NODE_ENV` or a request header. Absent
 * (a local process) means development; any other value is unknown and fails closed downstream.
 */
export function deploymentContext(
  vercelEnv: string | undefined,
): DeploymentContext {
  if (vercelEnv === undefined || vercelEnv === "") return "development";
  if (
    vercelEnv === "production" ||
    vercelEnv === "preview" ||
    vercelEnv === "development"
  )
    return vercelEnv;
  return "unknown";
}

// --- Browser (public) configuration --------------------------------------------------------------------

export type PublicSupabaseEnv = {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
};

export type BrowserConfig = {
  url: string;
  publishableKey: string;
  projectRef: string;
};

export type BrowserConfigReason =
  "not_configured" | "invalid_url" | "invalid_key";

export type BrowserConfigResult =
  | { ok: true; config: BrowserConfig }
  | { ok: false; reason: BrowserConfigReason };

/**
 * The two public values, validated: the key must have the publishable shape, so a secret key or a legacy
 * JWT behind the public name is refused without decoding anything.
 */
export function browserConfig(env: PublicSupabaseEnv): BrowserConfigResult {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!present(url) || !present(key))
    return { ok: false, reason: "not_configured" };
  const projectRef = projectRefFromUrl(url);
  if (!projectRef) return { ok: false, reason: "invalid_url" };
  if (!key.startsWith(PUBLISHABLE_KEY_PREFIX))
    return { ok: false, reason: "invalid_key" };
  return {
    ok: true,
    config: { url: new URL(url).origin, publishableKey: key, projectRef },
  };
}

// --- Server (privileged) configuration ---------------------------------------------------------------------

export type ServerSupabaseEnv = PublicSupabaseEnv & {
  SUPABASE_SECRET_KEY?: string;
  SUPABASE_TEST_PROJECT_REF?: string;
  SUPABASE_PROD_PROJECT_REF?: string;
  VERCEL_ENV?: string;
};

/** The identity facts of a privileged configuration — everything but the secret, safe to report or pass on. */
export type ServerIdentity = {
  url: string;
  /** The ref the API URL points at. */
  projectRef: string;
  context: Exclude<DeploymentContext, "unknown">;
  /** The ref this context must use: PROD in Production, TEST everywhere else. */
  expectedRef: string;
  testRef: string;
  prodRef: string;
};

export type ServerConfig = ServerIdentity & { secretKey: string };

/** What a target decision needs: never the secret. */
export type TargetIdentity = Pick<
  ServerIdentity,
  "context" | "projectRef" | "testRef" | "prodRef"
>;

export type ServerConfigReason =
  | "not_configured"
  | "invalid_url"
  | "invalid_key"
  | "unknown_context"
  | "refs_not_distinct"
  | "identity_mismatch";

export type ServerConfigResult =
  | { ok: true; config: ServerConfig }
  | { ok: false; reason: ServerConfigReason };

/**
 * Validates the privileged configuration and fails closed: every name present, both refs well formed and
 * distinct, the URL's ref equal to the ref this deployment context expects, and the secret key of the
 * secret shape. Reasons are enumerated so a caller can report them without any value.
 */
export function serverConfig(env: ServerSupabaseEnv): ServerConfigResult {
  const context = deploymentContext(env.VERCEL_ENV);
  if (context === "unknown") return { ok: false, reason: "unknown_context" };
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = env.SUPABASE_SECRET_KEY;
  const testRef = env.SUPABASE_TEST_PROJECT_REF;
  const prodRef = env.SUPABASE_PROD_PROJECT_REF;
  if (
    !present(url) ||
    !present(secretKey) ||
    !present(testRef) ||
    !present(prodRef)
  )
    return { ok: false, reason: "not_configured" };
  if (!isProjectRef(testRef) || !isProjectRef(prodRef))
    return { ok: false, reason: "not_configured" };
  if (testRef === prodRef) return { ok: false, reason: "refs_not_distinct" };
  const projectRef = projectRefFromUrl(url);
  if (!projectRef) return { ok: false, reason: "invalid_url" };
  if (!secretKey.startsWith(SECRET_KEY_PREFIX))
    return { ok: false, reason: "invalid_key" };
  const expectedRef = context === "production" ? prodRef : testRef;
  if (projectRef !== expectedRef)
    return { ok: false, reason: "identity_mismatch" };
  return {
    ok: true,
    config: {
      url: new URL(url).origin,
      secretKey,
      projectRef,
      context,
      expectedRef,
      testRef,
      prodRef,
    },
  };
}

/** The identity facts of a configuration, built field by field so the secret can never ride along. */
export function identityOf(config: ServerConfig): ServerIdentity {
  return {
    url: config.url,
    projectRef: config.projectRef,
    context: config.context,
    expectedRef: config.expectedRef,
    testRef: config.testRef,
    prodRef: config.prodRef,
  };
}

/**
 * True only for an identity that is verifiably the TEST project inside a Preview deployment — the sole
 * target the S0.2 proof operation and the fixture tools accept. PROD, a local process and an unknown
 * context are all refused.
 */
export function isPreviewTestTarget(identity: TargetIdentity): boolean {
  return (
    identity.context === "preview" &&
    identity.projectRef === identity.testRef &&
    identity.projectRef !== identity.prodRef
  );
}
