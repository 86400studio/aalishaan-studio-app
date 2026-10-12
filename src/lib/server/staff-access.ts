import "server-only";

import { isStaffRole, type StaffRole } from "@/lib/staff/permissions";

import {
  recordStaffAudit,
  type AuditWriteResult,
  type PrivilegedClient,
} from "./staff-audit";

/**
 * Staff access changes on the server — S1.2 (docs/TECH-ARCHITECTURE.md §5; docs/ROADMAP.md S1.2 "session
 * revocation", "audit rows"). Each function takes the privileged client and the acting staff member, writes
 * the change and its audit row, and is called only after `guardAction` has allowed the caller (the `settings`
 * area for revocation and role changes — owner-only at launch, D-35). S2.1 gives these functions their Staff &
 * Access UI; S1.2 exercises revocation on TEST through `pnpm db:test:staff-users --revoke`, which performs the
 * same three writes with the same privileged key.
 *
 * Revocation is two writes in one order: the staff row first (`active = false`, `revoked_at`, `revoked_reason`
 * — the guard reads `active` on every request, so the next request is denied), then the Auth ban (no new or
 * refreshed token for that user), then the audit row. A revoked member's existing cookies are worthless after
 * the first write; the ban only removes the refresh path as well.
 */

/** Supabase's longest ban: a century, which revokes refresh for good until the owner lifts it. */
export const REVOCATION_BAN_DURATION = "876600h";

export type AccessChangeResult =
  | { ok: true; audit: AuditWriteResult }
  | { ok: false; step: "profile" | "auth" | "validation"; code: string };

export async function recordMfaEnrolled(
  privileged: PrivilegedClient,
  userId: string,
): Promise<AccessChangeResult> {
  const now = new Date().toISOString();
  const { error } = await privileged
    .from("staff_profiles")
    .update({ mfa_enrolled_at: now })
    .eq("user_id", userId);
  if (error)
    return { ok: false, step: "profile", code: error.code ?? "unknown" };
  const audit = await recordStaffAudit(privileged, {
    action: "staff.mfa_enrolled",
    entityId: userId,
    actorId: userId,
    next: { mfa_enrolled_at: now },
  });
  return { ok: true, audit };
}

export async function revokeStaffAccess(
  privileged: PrivilegedClient,
  change: { userId: string; actorId: string; reason: string },
): Promise<AccessChangeResult> {
  const reason = change.reason.trim();
  if (reason.length === 0 || reason.length > 500)
    return { ok: false, step: "validation", code: "reason_length" };
  const now = new Date().toISOString();
  const { data, error } = await privileged
    .from("staff_profiles")
    .update({ active: false, revoked_at: now, revoked_reason: reason })
    .eq("user_id", change.userId)
    .select("role, display_name")
    .maybeSingle();
  if (error)
    return { ok: false, step: "profile", code: error.code ?? "unknown" };
  if (!data) return { ok: false, step: "profile", code: "not_found" };
  const ban = await privileged.auth.admin.updateUserById(change.userId, {
    ban_duration: REVOCATION_BAN_DURATION,
  });
  if (ban.error)
    return { ok: false, step: "auth", code: ban.error.code ?? "unknown" };
  const audit = await recordStaffAudit(privileged, {
    action: "staff.access_revoked",
    entityId: change.userId,
    actorId: change.actorId,
    previous: { active: true },
    next: { active: false, revoked_at: now },
    reason,
  });
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
      code: current.error.code ?? "unknown",
    };
  if (!current.data) return { ok: false, step: "profile", code: "not_found" };
  const { error } = await privileged
    .from("staff_profiles")
    .update({ role: change.role })
    .eq("user_id", change.userId);
  if (error)
    return { ok: false, step: "profile", code: error.code ?? "unknown" };
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
