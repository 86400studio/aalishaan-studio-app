import "server-only";

import { createHash } from "node:crypto";

import type { PrivilegedClientResult } from "./supabase";

/** The privileged client's type, taken from the factory so this module never imports the SDK itself. */
export type PrivilegedClient = Extract<
  PrivilegedClientResult,
  { ok: true }
>["client"];

/**
 * Audit rows for staff authentication and access events — S1.2 (docs/SECURITY-CHECKLIST.md §9 rule 7;
 * docs/TECH-ARCHITECTURE.md §5). Written into the S1.1 insert-only `audit_log` with the privileged client and
 * never from the browser: after the server guard has decided — with one stated exception, the refused password
 * of the sign-in form, which is recorded before any session exists (nobody is authenticated; the throttle has
 * already counted the attempt and bounds how many such rows one caller can cause). That row carries only the
 * SHA-256 of the address that was tried — unsalted, so not a secret, but no address in clear; every other row
 * names the staff user by id.
 *
 * The write is best-effort by design: a sign-in is not refused because its audit row could not be written.
 * It is never silent, though — a failed insert leaves one server log line with the action and the database's
 * error code, and nothing else (no id, no address, no code, no secret).
 */

export const STAFF_AUDIT_ACTIONS = [
  "staff.sign_in",
  "staff.sign_in_failed",
  "staff.mfa_enrolled",
  "staff.role_changed",
  "staff.access_revoked",
  "staff.access_restored",
] as const;
export type StaffAuditAction = (typeof STAFF_AUDIT_ACTIONS)[number];

export type StaffAuditEntry = {
  action: StaffAuditAction;
  /** The staff user the row is about (the actor for sign-in events; the subject for access changes). */
  entityId: string;
  /** The staff user who performed the action; null for a failed sign-in, where nobody is authenticated. */
  actorId: string | null;
  previous?: Record<string, unknown> | null;
  next?: Record<string, unknown> | null;
  reason?: string | null;
};

export type AuditWriteResult = { ok: true } | { ok: false; code: string };

export function emailHashFor(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

/**
 * The `audit_log` row of an entry — the shape of the S1.1 table and of its mirror `auditLogInputSchema`
 * (src/lib/schemas/orders.ts). The actor is `staff` when a staff member acted and `system` when nobody is
 * authenticated (a refused sign-in) — the table's own vocabulary (`staff`, `system`, `customer`).
 */
export function staffAuditRow(entry: StaffAuditEntry) {
  return {
    actor_type: entry.actorId ? ("staff" as const) : ("system" as const),
    actor_id: entry.actorId,
    action: entry.action,
    entity_type: "staff_profile",
    entity_id: entry.entityId,
    previous: entry.previous ?? null,
    next: entry.next ?? null,
    reason: entry.reason ?? null,
    external_ref: null,
  };
}

/**
 * One row per event. The insert's failure is reported to the caller and logged (the action and the error code
 * only), never thrown, so a sign-in never fails on the audit alone and a missing row never goes unnoticed.
 */
export async function recordStaffAudit(
  privileged: PrivilegedClient,
  entry: StaffAuditEntry,
): Promise<AuditWriteResult> {
  let code: string | null = null;
  try {
    const { error } = await privileged
      .from("audit_log")
      .insert(staffAuditRow(entry));
    if (error) code = error.code || "unknown";
  } catch {
    code = "request_failed";
  }
  if (code === null) return { ok: true };
  console.error(
    `[staff-audit] the audit row for ${entry.action} was not written (${code})`,
  );
  return { ok: false, code };
}
