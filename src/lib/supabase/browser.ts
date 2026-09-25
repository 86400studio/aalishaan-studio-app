import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  browserConfig,
  type BrowserConfigReason,
  type PublicSupabaseEnv,
} from "./config";

/**
 * The browser (public) Supabase client factory — S0.2 (docs/TECH-ARCHITECTURE.md §2, §6). It reads only
 * the two public values, so nothing privileged can reach a bundle: the secret key lives behind
 * `@/lib/server/supabase.ts` (`server-only`), which the import-boundary rule in eslint.config.mjs keeps out
 * of browser code. No page creates a client yet; S1.4 first reads the public catalogue projection.
 *
 * Missing or invalid configuration is reported, never thrown at import or build time, so the holding page
 * and the hermetic Code Check stay credential-free.
 */

export type BrowserClientResult =
  | { ok: true; client: SupabaseClient; projectRef: string }
  | { ok: false; reason: BrowserConfigReason };

/** Public values are inlined at build time only when written as `process.env.NEXT_PUBLIC_*` literals. */
export function readPublicSupabaseEnv(): PublicSupabaseEnv {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

export function createBrowserSupabaseClient(
  env: PublicSupabaseEnv = readPublicSupabaseEnv(),
): BrowserClientResult {
  const result = browserConfig(env);
  if (!result.ok) return result;
  return {
    ok: true,
    projectRef: result.config.projectRef,
    client: createClient(result.config.url, result.config.publishableKey),
  };
}
