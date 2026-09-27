import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  identityOf,
  serverConfig,
  type ServerConfigReason,
  type ServerIdentity,
  type ServerSupabaseEnv,
} from "@/lib/supabase/config";

/**
 * The privileged (secret-key) Supabase client — S0.2 (docs/TECH-ARCHITECTURE.md §2, §6;
 * docs/ENV-VARS-SAFETY.md). `server-only` makes any import from a browser bundle a build error, and the
 * import-boundary rule in eslint.config.mjs reports it before the build. Rules:
 *
 * - A client is created per call and never exported as a shared singleton; nothing here is re-exported.
 * - It never inherits a user's session: no session persistence, no token refresh, no URL detection, and
 *   no request cookie or header is read. The secret key alone authorises it (it bypasses RLS).
 * - Configuration is validated first and fails closed (`serverConfig`): a missing name, an unknown
 *   deployment context, equal refs, or a URL whose ref is not the one this context expects yields a
 *   reason, not a client. Production legitimately resolves to PROD; every other context must be TEST.
 * - The secret never leaves this module: callers receive the client and the identity facts only.
 * - Nothing is required at import or build time: an unconfigured deployment reports `not_configured`.
 */

export type IdentityResult =
  | { ok: true; identity: ServerIdentity }
  | { ok: false; reason: ServerConfigReason };

export type PrivilegedClientResult =
  | { ok: true; client: SupabaseClient; identity: ServerIdentity }
  | { ok: false; reason: ServerConfigReason };

/** The server-only names, read here and nowhere else in `src/`. */
export function readServerSupabaseEnv(): ServerSupabaseEnv {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    SUPABASE_TEST_PROJECT_REF: process.env.SUPABASE_TEST_PROJECT_REF,
    SUPABASE_PROD_PROJECT_REF: process.env.SUPABASE_PROD_PROJECT_REF,
    VERCEL_ENV: process.env.VERCEL_ENV,
  };
}

/** The identity facts alone — no client is constructed, so a target decision can precede any client. */
export function resolveServerIdentity(
  env: ServerSupabaseEnv = readServerSupabaseEnv(),
): IdentityResult {
  const result = serverConfig(env);
  return result.ok ? { ok: true, identity: identityOf(result.config) } : result;
}

export function createPrivilegedClient(
  env: ServerSupabaseEnv = readServerSupabaseEnv(),
): PrivilegedClientResult {
  const result = serverConfig(env);
  if (!result.ok) return result;
  const { config } = result;
  const client = createClient(config.url, config.secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return { ok: true, client, identity: identityOf(config) };
}
