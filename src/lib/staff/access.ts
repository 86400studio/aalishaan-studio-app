import {
  ROLE_AREAS,
  ROLE_LABELS,
  holdsAreas,
  isStaffRole,
  type PermissionArea,
  type StaffRole,
} from "./permissions";

/**
 * The access decision of the S1.2 server guard — S1.2 (docs/TECH-ARCHITECTURE.md §5; docs/SECURITY-CHECKLIST.md
 * §3, §9 rule 1). A pure function over facts the server has already established: it performs no I/O and is
 * unit-tested row by row (tests/unit/staff-access.test.ts). `src/lib/server/staff-session.ts` gathers the facts
 * — the Auth server's answer for the cookie session, the session's assurance level, the factors on the user, the
 * `staff_profiles` row read with the privileged client — and acts on the decision: redirect, render the honest
 * state, or continue. Nothing in the browser decides anything.
 *
 * The decision table, in order of precedence:
 *   1. the facts could not be established (configuration, Auth or database failure) → `unavailable` (never a pass);
 *   1a. the Auth server refused the member's own token because the user is banned — revocation bans the Auth
 *       user — → `revoked` (the same state as row 4, reached before the staff row can be read);
 *   2. no verified user behind the cookies → `login`;
 *   3. a user without a `staff_profiles` row → `not_staff` (an Auth account is not a staff account);
 *   4. an inactive row (revoked, or disabled by S2.1) → `revoked`;
 *   5. no verified TOTP factor on the user → `enrol` (MFA is mandatory; enrolment needs this staff password session);
 *   6. the session below aal2 → `verify`;
 *   7. a required area the role does not hold → `forbidden` (nothing protected is read);
 *   8. otherwise → `allowed`, with the staff identity the page or action may use.
 */

export type AssuranceLevel = "aal1" | "aal2";

export type StaffProfileRow = {
  user_id: string;
  role: string;
  display_name: string;
  active: boolean;
  mfa_enrolled_at: string | null;
  revoked_at: string | null;
};

export type SessionFacts = {
  /** False when configuration, the Auth server or the database could not be consulted. */
  available: boolean;
  /** The user the Auth server vouched for (`auth.getUser()`), or null. */
  user: { id: string; email: string | null } | null;
  /**
   * True when the Auth server refused the session because its user is banned. Revocation bans the Auth user, so
   * this is a revoked member presenting their own, otherwise valid token — nobody else can cause it.
   */
  revokedByAuth: boolean;
  /** The current assurance level of the session, from the validated token's claims. */
  aal: AssuranceLevel | null;
  /** Whether the user carries at least one verified TOTP factor. */
  hasVerifiedTotp: boolean;
  /** The staff row read with the privileged client, or null when none exists. */
  profile: StaffProfileRow | null;
  /** The areas the route or action requires beyond an active staff session at aal2. */
  required: readonly PermissionArea[];
};

export type StaffSession = {
  userId: string;
  email: string | null;
  role: StaffRole;
  roleLabel: string;
  displayName: string;
  areas: readonly PermissionArea[];
};

export type AccessDecision =
  | { kind: "unavailable" }
  | { kind: "login" }
  | { kind: "not_staff"; userId: string }
  /** `userId` is null when the Auth server itself refused the banned member's token (no user was returned). */
  | { kind: "revoked"; userId: string | null }
  | { kind: "enrol"; userId: string }
  | { kind: "verify"; userId: string }
  | {
      kind: "forbidden";
      staff: StaffSession;
      missing: readonly PermissionArea[];
    }
  | { kind: "allowed"; staff: StaffSession };

/**
 * How a failed `auth.getUser()` counts, by the status auth-js reports with the error. A 4xx is the Auth server's
 * own answer — no session, or a token it rejects (missing, expired, forged, revoked, its session deleted) — and
 * is simply "no user". Everything else is the Auth server not answering as itself: no connection (auth-js
 * reports status 0), an answer that is not JSON (no status at all), a 5xx, or its own rate limit (429). That is
 * `unavailable` — never "no user", which would show a sign-in form that cannot work and let every attempt during
 * the outage count against the throttle.
 */
export function classifyAuthFailure(
  status: number | undefined,
): "no_user" | "unavailable" {
  if (status === undefined || status === 0 || status === 429 || status >= 500)
    return "unavailable";
  return "no_user";
}

export function decideAccess(facts: SessionFacts): AccessDecision {
  if (!facts.available) return { kind: "unavailable" };
  if (facts.revokedByAuth) return { kind: "revoked", userId: null };
  if (!facts.user) return { kind: "login" };
  const userId = facts.user.id;
  const profile = facts.profile;
  // A row that does not belong to this user, or carries a role the model does not know, is no staff row.
  if (!profile || profile.user_id !== userId || !isStaffRole(profile.role))
    return { kind: "not_staff", userId };
  if (!profile.active || profile.revoked_at !== null)
    return { kind: "revoked", userId };
  if (!facts.hasVerifiedTotp) return { kind: "enrol", userId };
  if (facts.aal !== "aal2") return { kind: "verify", userId };
  const staff = toStaffSession(facts.user, profile.role, profile.display_name);
  if (!holdsAreas(profile.role, facts.required)) {
    const missing = facts.required.filter(
      (area) => !staff.areas.includes(area),
    );
    return { kind: "forbidden", staff, missing };
  }
  return { kind: "allowed", staff };
}

export function toStaffSession(
  user: { id: string; email: string | null },
  role: StaffRole,
  displayName: string,
): StaffSession {
  return {
    userId: user.id,
    email: user.email,
    role,
    roleLabel: ROLE_LABELS[role],
    displayName,
    areas: ROLE_AREAS[role],
  };
}
