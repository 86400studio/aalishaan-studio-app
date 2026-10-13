import "server-only";

import { isStaffRole, type StaffRole } from "@/lib/staff/permissions";

import {
  recordStaffAudit,
  type AuditWriteResult,
  type PrivilegedClient,
} from "./staff-audit";

/**
 * Staff access changes on the server — S1.2 (docs/TECH-ARCHITECTURE.md §5; docs/ROADMAP.md S1.2 "session
 * revocation", "audit rows"). Each function takes the privileged client and the staff member it concerns, writes
 * the change and its audit row, and is to be called only after the guard has allowed the caller (`guardAction`
 * with the `settings` area for revocation and role changes — owner-only at launch, D-35). At S1.2 only
 * `recordMfaEnrolled` has a caller (the enrolment action); `revokeStaffAccess` and `changeStaffRole` get their
 * first action and their Staff & Access UI in S2.1, and S1.2 exercises revocation on TEST through
 * `pnpm db:test:staff-users --revoke`, which writes the same three things with the same privileged key.
 *
 * Revocation, in one order: the staff row first (`active = false`, `revoked_at`, `revoked_reason` — the guard
 * reads the row on every request, so the member's next request is denied), then the Auth ban (no new or
 * refreshed token for that user), then the audit row — which is written once the staff row has changed, whatever
 * the ban answered, and says which. A revoked member's existing cookies are worthless after the first write; the
 * ban only removes the refresh path as well.
 */

/** Supabase's longest ban: a century, which revokes refresh for good until the owner lifts it. */
export const REVOCATION_BAN_DURATION = "876600h";

export type AccessChangeResult =
  | { ok: true; audit: AuditWriteResult }
  | {
      ok: false;
      step: "profile" | "auth" | "validation";
      code: string;
      /** Present when the change itself was made and only a later step failed: the row that recorded it. */
      audit?: AuditWriteResult;
    };

/**
 * Records that the member has verified a TOTP factor: the informational `mfa_enrolled_at` and the audit row.
 * The audit row is written even when the column could not be updated — the factor exists either way.
 */
export async function recordMfaEnrolled(
  privileged: PrivilegedClient,
  userId: string,
): Promise<AccessChangeResult> {
  const now = new Date().toISOString();
  const { error } = await privileged
    .from("staff_profiles")
    .update({ mfa_enrolled_at: now })
    .eq("user_id", userId);
  const audit = await recordStaffAudit(privileged, {
    action: "staff.mfa_enrolled",
    entityId: userId,
    actorId: userId,
    next: error ? { mfa_enrolled_at: null } : { mfa_enrolled_at: now },
  });
  if (error)
    return {
      ok: false,
      step: "profile",
      code: error.code || "unknown",
      audit,
    };
  return { ok: true, audit };
}

export async function revokeStaffAccess(
  privileged: PrivilegedClient,
  change: { userId: string; actorId: string; reason: string },
): Promise<AccessChangeResult> {
  const reason = change.reason.trim();
  if (reason.length === 0 || reason.length > 500)
    return { ok: false, step: "validation", code: "reason_length" };
  // The state before the change is read, not assumed: the audit row says what was really there.
  const current = await privileged
    .from("staff_profiles")
    .select("active, revoked_at")
    .eq("user_id", change.userId)
    .maybeSingle();
  if (current.error)
    return {
      ok: false,
      step: "profile",
      code: current.error.code || "unknown",
    };
  if (!current.data) return { ok: false, step: "profile", code: "not_found" };
  const now = new Date().toISOString();
  const { error } = await privileged
    .from("staff_profiles")
    .update({ active: false, revoked_at: now, revoked_reason: reason })
    .eq("user_id", change.userId);
  if (error)
    return { ok: false, step: "profile", code: error.code || "unknown" };
  const ban = await privileged.auth.admin.updateUserById(change.userId, {
    ban_duration: REVOCATION_BAN_DURATION,
  });
  const audit = await recordStaffAudit(privileged, {
    action: "staff.access_revoked",
    entityId: change.userId,
    actorId: change.actorId,
    previous: {
      active: current.data.active,
      revoked_at: current.data.revoked_at,
    },
    next: {
      active: false,
      revoked_at: now,
      auth_ban: ban.error ? "failed" : "set",
    },
    reason,
  });
  if (ban.error)
    return {
      ok: false,
      step: "auth",
      code: ban.error.code || "unknown",
      audit,
    };
  return { ok: true, audit };
}

export async function changeStaffRole(
  privileged: PrivilegedClient,
  change: { userId: string; actorId: string; role: StaffRole; reason: string },
): Promise<AccessChangeResult> {
  if (!isStaffRole(change.role))
    return { ok: false, step: "validation", code: "role" };
  const reason = change.reason.trim();
  if (reason.length === 0 || reason.length > 500)
    return { ok: false, step: "validation", code: "reason_length" };
  const current = await privileged
    .from("staff_profiles")
    .select("role")
    .eq("user_id", change.userId)
    .maybeSingle();
  if (current.error)
    return {
      ok: false,
      step: "profile",
      code: current.error.code || "unknown",
    };
  if (!current.data) return { ok: false, step: "profile", code: "not_found" };
  const { error } = await privileged
    .from("staff_profiles")
    .update({ role: change.role })
    .eq("user_id", change.userId);
  if (error)
    return { ok: false, step: "profile", code: error.code || "unknown" };
  const audit = await recordStaffAudit(privileged, {
    action: "staff.role_changed",
    entityId: change.userId,
    actorId: change.actorId,
    previous: { role: current.data.role },
    next: { role: change.role },
    reason,
  });
  return { ok: true, audit };
}
