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
 * docs/TECH-ARCHITECTURE.md §5). Written into the S1.1 insert-only `audit_log` with the privileged client, after
 * the server guard has decided; never from the browser. A failed sign-in carries only the SHA-256 of the
 * address that was tried, so the log holds no e-mail address of an attacker's guess; every other row names the
 * staff user by id.
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

/** One row per event; the insert's failure is reported, never thrown, so a login never fails on the audit alone. */
export async function recordStaffAudit(
  privileged: PrivilegedClient,
  entry: StaffAuditEntry,
): Promise<AuditWriteResult> {
  const { error } = await privileged.from("audit_log").insert({
    actor_type: entry.actorId ? "staff" : "system",
    actor_id: entry.actorId,
    action: entry.action,
    entity_type: "staff_profile",
    entity_id: entry.entityId,
    previous: entry.previous ?? null,
    next: entry.next ?? null,
    reason: entry.reason ?? null,
  });
  return error ? { ok: false, code: error.code ?? "unknown" } : { ok: true };
}
