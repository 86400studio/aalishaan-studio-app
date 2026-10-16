import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  classifyAuthFailure,
  decideAccess,
  type AccessDecision,
  type AssuranceLevel,
  type SessionFacts,
  type StaffProfileRow,
  type StaffSession,
} from "@/lib/staff/access";
import { loginUrlFor, safeNextPath } from "@/lib/staff/next-path";
import type { PermissionArea } from "@/lib/staff/permissions";
import { browserConfig, type BrowserConfig } from "@/lib/supabase/config";
import { readPublicSupabaseEnv } from "@/lib/supabase/browser";

import { createPrivilegedClient, resolveServerIdentity } from "./supabase";

/**
 * The staff session and the server guard — S1.2 (docs/TECH-ARCHITECTURE.md §5; docs/SECURITY-CHECKLIST.md §3,
 * §9 rule 1; docs/THREAT-MODEL.md). Everything under `/admin` passes through here, on the server, for every
 * page render and inside every server action:
 *
 *   1. the session is held in `httpOnly` cookies scoped to `/admin` and read by a per-request `@supabase/ssr`
 *      client built with the public values — the only module that may import that package (eslint rule 3);
 *   2. the identity behind the cookies is established by `auth.getUser()` against the Auth server — never by
 *      decoding a cookie alone — and the public values must point at the project the privileged identity
 *      verified (`resolveServerIdentity`), or the request is refused as unavailable;
 *   3. the assurance level comes from the claims of the token the Auth server has just validated; the verified
 *      TOTP factors from the user object; the staff row from `staff_profiles`, read with the privileged client;
 *   4. the pure `decideAccess` turns those facts into one decision (docs in src/lib/staff/access.ts); the page
 *      helper redirects or renders the honest state, the action helper returns the decision and never mutates.
 *
 * The privileged client never reads a request cookie or header. No secret, token, code or address is logged.
 */

/** The cookie name prefix and attributes of the staff session (the SSR client chunks long values itself). */
export const STAFF_COOKIE_OPTIONS = {
  name: "aalishaan-staff",
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/admin",
} as const;

export type CookieClientConfigResult =
  | { ok: true; config: BrowserConfig }
  | {
      ok: false;
      reason:
        | "not_configured"
        | "invalid_url"
        | "invalid_key"
        | "identity_mismatch"
        | "server_not_configured";
    };

/**
 * The public values the cookie client uses, accepted only when they point at the very project the privileged
 * identity resolved for this deployment context — a Preview whose public pair pointed elsewhere would otherwise
 * authenticate staff against the wrong project.
 */
export function cookieClientConfig(): CookieClientConfigResult {
  const publicResult = browserConfig(readPublicSupabaseEnv());
  if (!publicResult.ok) return publicResult;
  const identity = resolveServerIdentity();
  if (!identity.ok)
    return {
      ok: false,
      reason:
        identity.reason === "identity_mismatch" ||
        identity.reason === "refs_not_distinct"
          ? "identity_mismatch"
          : "server_not_configured",
    };
  if (identity.identity.projectRef !== publicResult.config.projectRef)
    return { ok: false, reason: "identity_mismatch" };
  return { ok: true, config: publicResult.config };
}

type CookieRecord = { name: string; value: string };
type CookieToSet = CookieRecord & { options: Record<string, unknown> };

type CookieStore = {
  getAll(): CookieRecord[];
  set(name: string, value: string, options?: Record<string, unknown>): unknown;
};

/**
 * A per-request client over a Next.js cookie store (`cookies()` in a page or an action). Pages cannot write
 * cookies: a refresh that lands during a render is written by `src/proxy.ts` on the next request instead, so the
 * write is attempted and a refusal is ignored, exactly as Supabase's guide prescribes.
 */
export function createCookieClient(
  config: BrowserConfig,
  store: CookieStore,
): SupabaseClient {
  return createServerClient(config.url, config.publishableKey, {
    cookieOptions: STAFF_COOKIE_OPTIONS,
    cookies: {
      getAll: () => store.getAll().map(({ name, value }) => ({ name, value })),
      setAll: (toSet: CookieToSet[]) => {
        try {
          for (const { name, value, options } of toSet)
            store.set(name, value, options);
        } catch {
          // A Server Component cannot set cookies; the proxy refreshes the session on the next request.
        }
      },
    },
  });
}

/** The current request's cookie client, or the configuration reason why none can be built. */
export async function staffCookieClient(): Promise<
  | { ok: true; supabase: SupabaseClient }
  | {
      ok: false;
      reason: Extract<CookieClientConfigResult, { ok: false }>["reason"];
    }
> {
  const config = cookieClientConfig();
  if (!config.ok) return config;
  const store = await cookies();
  return { ok: true, supabase: createCookieClient(config.config, store) };
}

/**
 * Deletes the staff session's cookies from this browser: the session value, its numbered chunks and the keys the
 * library derives from the cookie name, each with the attributes it was set with (a cookie is only deleted by its
 * own path). For a server action — a page cannot write cookies. The library's own sign-out does this when it can;
 * it does not when the session's token has expired and the Auth server cannot be reached to renew it, and a
 * member who pressed "Sign out" must not stay signed in on that browser.
 */
export async function forgetStaffSessionCookies(): Promise<void> {
  const { name, ...attributes } = STAFF_COOKIE_OPTIONS;
  const store = await cookies();
  for (const cookie of store.getAll()) {
    if (
      cookie.name === name ||
      cookie.name.startsWith(`${name}.`) ||
      cookie.name.startsWith(`${name}-`)
    )
      store.set(cookie.name, "", { ...attributes, maxAge: 0 });
  }
}

const PROFILE_COLUMNS =
  "user_id, role, display_name, active, mfa_enrolled_at, revoked_at";

function assuranceLevelOf(value: unknown): AssuranceLevel | null {
  return value === "aal1" || value === "aal2" ? value : null;
}

type UserLike = {
  id: string;
  email?: string;
  factors?: Array<{ factor_type: string; status: string }>;
};

/** True when the Auth server's user object carries at least one verified TOTP factor. */
export function hasVerifiedTotp(user: UserLike): boolean {
  return (user.factors ?? []).some(
    (factor) => factor.factor_type === "totp" && factor.status === "verified",
  );
}

export type StaffFactsResult = {
  facts: SessionFacts;
  /** The cookie client of this request, for the caller that must act on the session (sign out, MFA). */
  supabase: SupabaseClient | null;
};

/**
 * Gathers the facts `decideAccess` needs. Every failure to establish a fact yields `available: false`, which the
 * decision turns into the honest unavailable state — never a pass.
 */
export async function collectStaffFacts(
  required: readonly PermissionArea[],
): Promise<StaffFactsResult> {
  const unavailable = (supabase: SupabaseClient | null): StaffFactsResult => ({
    supabase,
    facts: {
      available: false,
      user: null,
      revokedByAuth: false,
      aal: null,
      hasVerifiedTotp: false,
      profile: null,
      required,
    },
  });

  const client = await staffCookieClient();
  if (!client.ok) return unavailable(null);
  const { supabase } = client;

  try {
    return await gatherStaffFacts(supabase, required, unavailable);
  } catch {
    // A library call that throws instead of answering — a cookie that is not a session at all is decoded before
    // any request is made — has established nothing: unavailable, never an unhandled error and never a pass.
    return unavailable(supabase);
  }
}

/** The Auth and database reads of `collectStaffFacts`, in the one order that makes the level trustworthy. */
async function gatherStaffFacts(
  supabase: SupabaseClient,
  required: readonly PermissionArea[],
  unavailable: (supabase: SupabaseClient | null) => StaffFactsResult,
): Promise<StaffFactsResult> {
  const userResult = await supabase.auth.getUser();
  if (userResult.error) {
    // An Auth-server or network failure is unavailable; a missing, expired or invalid session is simply no user
    // (`classifyAuthFailure` — a network failure carries status 0, an unreadable answer none at all).
    if (classifyAuthFailure(userResult.error.status) === "unavailable")
      return unavailable(supabase);
    return {
      supabase,
      facts: {
        available: true,
        user: null,
        // Revocation bans the Auth user, and the Auth server then refuses that member's own token. That refusal
        // is the revoked state — the member is told why nothing opens — not a sign-in form that cannot work.
        revokedByAuth: userResult.error.code === "user_banned",
        aal: null,
        hasVerifiedTotp: false,
        profile: null,
        required,
      },
    };
  }
  const user = userResult.data.user;
  if (!user)
    return {
      supabase,
      facts: {
        available: true,
        user: null,
        revokedByAuth: false,
        aal: null,
        hasVerifiedTotp: false,
        profile: null,
        required,
      },
    };

  // The level is the `aal` claim of the session's access token, decoded locally by auth-js. It is trusted here
  // only because `getUser()` above has just had the Auth server validate that very token (same cookie store, same
  // request): keep this call after it, and never read a level from a token the Auth server has not vouched for.
  const aalResult = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalResult.error) return unavailable(supabase);

  const privileged = createPrivilegedClient();
  if (!privileged.ok) return unavailable(supabase);
  const profileResult = await privileged.client
    .from("staff_profiles")
    .select(PROFILE_COLUMNS)
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileResult.error) return unavailable(supabase);

  return {
    supabase,
    facts: {
      available: true,
      user: { id: user.id, email: user.email ?? null },
      revokedByAuth: false,
      aal: assuranceLevelOf(aalResult.data.currentLevel),
      hasVerifiedTotp: hasVerifiedTotp(user as UserLike),
      profile: (profileResult.data as StaffProfileRow | null) ?? null,
      required,
    },
  };
}

/** The access decision for the current request, with the cookie client the caller may act on. */
export async function getStaffAccess(
  required: readonly PermissionArea[],
): Promise<{ decision: AccessDecision; supabase: SupabaseClient | null }> {
  const { facts, supabase } = await collectStaffFacts(required);
  return { decision: decideAccess(facts), supabase };
}

export type PageGate =
  | { ok: true; staff: StaffSession }
  | {
      ok: false;
      state: "forbidden" | "revoked" | "not_staff" | "unavailable";
      staff: StaffSession | null;
    };

/**
 * The guard of a protected page. Redirects to the sign-in, verification or enrolment page when the session is
 * missing or incomplete (with the validated return path); returns the honest state to render for a member who
 * may not open the page, a revoked member, an Auth account that is no staff account, or an unavailable
 * dependency. A page calls this before it reads anything and renders nothing protected unless `ok` is true.
 */
export async function guardAdminPage(options: {
  required: readonly PermissionArea[];
  /** The path (and query) the sign-in should return to — validated before use. */
  returnTo: string;
}): Promise<PageGate> {
  const { decision } = await getStaffAccess(options.required);
  const next = safeNextPath(options.returnTo);
  switch (decision.kind) {
    case "allowed":
      return { ok: true, staff: decision.staff };
    case "login":
      redirect(loginUrlFor(next));
    case "verify":
      redirect(`/admin/login/verify?next=${encodeURIComponent(next)}`);
    case "enrol":
      redirect(`/admin/login/enrol?next=${encodeURIComponent(next)}`);
    case "forbidden":
      return { ok: false, state: "forbidden", staff: decision.staff };
    case "revoked":
      return { ok: false, state: "revoked", staff: null };
    case "not_staff":
      return { ok: false, state: "not_staff", staff: null };
    case "unavailable":
      return { ok: false, state: "unavailable", staff: null };
  }
}

export type ActionGate =
  | { ok: true; staff: StaffSession; supabase: SupabaseClient }
  | { ok: false; decision: Exclude<AccessDecision, { kind: "allowed" }> };

/**
 * The guard of a server action: the same decision, returned rather than acted on, so the action can refuse
 * without mutating. Every action re-authorises on its own — an action reached from a page that already passed
 * the guard is still refused here if the session has changed since.
 */
export async function guardAction(
  required: readonly PermissionArea[],
): Promise<ActionGate> {
  const { decision, supabase } = await getStaffAccess(required);
  if (decision.kind === "allowed" && supabase)
    return { ok: true, staff: decision.staff, supabase };
  if (decision.kind === "allowed")
    return { ok: false, decision: { kind: "unavailable" } };
  return { ok: false, decision };
}

/**
 * The proxy's work (`src/proxy.ts`, `/admin/:path*` only): let the SSR client refresh an expiring session and
 * write the refreshed cookies to the response, with the cache headers the package requires. It decides nothing:
 * an unauthenticated request passes through to the page, whose guard redirects it.
 */
export async function refreshStaffSessionCookies(
  request: NextRequest,
): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  const config = cookieClientConfig();
  if (!config.ok) return response;
  const supabase = createServerClient(
    config.config.url,
    config.config.publishableKey,
    {
      cookieOptions: STAFF_COOKIE_OPTIONS,
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet: CookieToSet[], headers: Record<string, string>) => {
          for (const { name, value } of toSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of toSet)
            response.cookies.set(name, value, options);
          for (const [key, value] of Object.entries(headers))
            response.headers.set(key, value);
        },
      },
    },
  );
  // Reading the claims refreshes an expired access token when a refresh token is present; nothing else is done
  // with the result here — the page's guard asks the Auth server itself. A cookie that is not a session at all
  // can make the decode throw: the proxy stays a pass-through and the page's guard decides.
  try {
    await supabase.auth.getClaims();
  } catch {
    // Deliberately empty: the proxy decides nothing and must not fail the request.
  }
  return response;
}
