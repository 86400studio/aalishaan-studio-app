import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Hermetic guards of 0003_staff_auth and its down file (docs/database-changes/S1.2-0003-staff-auth.md): additive,
 * one non-recursive policy at aal2, a SELECT-only grant, a hardened function, no SECURITY DEFINER, TRUNCATE untouched,
 * the down file reversing exactly what the forward file adds and saying what it loses.
 */

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (relative: string) =>
  readFileSync(path.join(ROOT, relative), "utf8");

const up = read("supabase/migrations/0003_staff_auth.sql");
const upLower = up.toLowerCase();
const down = read("supabase/rollbacks/0003_staff_auth.down.sql");
const downLower = down.toLowerCase();

/** The SQL without its comments (so a word in a comment never satisfies a check on the statements). */
function statementsOnly(sql: string): string {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n")
    .toLowerCase();
}

describe("supabase/migrations/0003_staff_auth.sql — additive", () => {
  const code = statementsOnly(up);

  it("adds exactly three columns to staff_profiles and two bounded constraints", () => {
    expect(code).toContain("alter table public.staff_profiles");
    expect(code.match(/add column/g)).toHaveLength(3);
    for (const column of [
      "mfa_enrolled_at timestamptz",
      "revoked_at      timestamptz",
      "revoked_reason  text",
    ])
      expect(code).toContain(column);
    expect(code).toContain(
      "check (revoked_reason is null or char_length(revoked_reason) <= 500)",
    );
    expect(code).toContain("check (revoked_at is null or active = false)");
  });

  it("creates the six-area enum and the one immutable, pinned, non-definer mapping function", () => {
    expect(code).toContain(
      "create type public.permission_area as enum ('work', 'support', 'finance', 'catalogue', 'settings', 'export')",
    );
    expect(code.match(/create (or replace )?function/g)).toHaveLength(1);
    expect(code).toContain(
      "create or replace function public.staff_permission_areas(role public.staff_role)",
    );
    expect(code).toContain("returns public.permission_area[]");
    expect(code).toContain("immutable");
    expect(code).toContain("set search_path = ''");
    const definition = code.slice(
      code.indexOf("create or replace function"),
      code.indexOf("$$;") + 3,
    );
    expect(definition).not.toContain("security definer");
    // Outside string literals (the comments the file stores in the catalogue), the words never appear.
    expect(code.replace(/'[^']*'/g, "''")).not.toContain("security definer");
    expect(code).toContain(
      "revoke execute on function public.staff_permission_areas(public.staff_role) from public, anon",
    );
    expect(code).toContain(
      "grant execute on function public.staff_permission_areas(public.staff_role) to authenticated, service_role",
    );
  });

  it("grants authenticated SELECT only, under one own-row policy that requires aal2 and references no other table", () => {
    expect(code.match(/grant /g)).toHaveLength(2);
    expect(code).toContain(
      "grant select on table public.staff_profiles to authenticated",
    );
    expect(code).not.toMatch(/grant (insert|update|delete|all)/);
    expect(code.match(/create policy/g)).toHaveLength(1);
    const policy = code.slice(
      code.indexOf("create policy"),
      code.indexOf("comment on policy"),
    );
    expect(policy).toContain("on public.staff_profiles");
    expect(policy).toContain("for select");
    expect(policy).toContain("to authenticated");
    expect(policy).toContain("user_id = (select auth.uid())");
    expect(policy).toContain("(select auth.jwt() ->> 'aal') = 'aal2'");
    // Non-recursive: the policy body names no table (no `from public.`, no join, no function of the project).
    expect(policy).not.toContain("from public.");
    expect(policy).not.toContain("staff_permission_areas");
    expect(policy).not.toContain("exists");
  });

  it("touches no other table, opens nothing to anon and never SECURITY DEFINER", () => {
    for (const other of [
      "orders",
      "audit_log",
      "business_rules",
      "customers_contact",
      "artworks",
    ])
      expect(code).not.toMatch(new RegExp(`public\\.${other}\\b`));
    expect(code).not.toMatch(/to anon\b/);
    expect(code).not.toMatch(/grant [^;]* to public\b/);
    expect(code).not.toContain("truncate");
  });

  it("is additive: no drop, delete, truncate, alter type or destructive statement", () => {
    expect(code).not.toMatch(/\bdrop\b/);
    expect(code).not.toMatch(/\bdelete\b/);
    expect(code).not.toMatch(/\btruncate\b/);
    expect(code).not.toMatch(/alter type/);
    expect(code).not.toMatch(/alter system/);
    expect(code).not.toMatch(/\binsert\b/);
    expect(code).not.toMatch(/\bupdate\b/);
  });

  it("has no pipeline-incompatible statement and states its decisions in comments", () => {
    expect(upLower).not.toContain("concurrently");
    expect(upLower).not.toMatch(/\bvacuum\b/);
    expect(upLower).toContain("no self-referencing policy");
    expect(upLower).toContain(
      "mirrors this mapping in src/lib/staff/permissions.ts",
    );
  });
});

describe("supabase/rollbacks/0003_staff_auth.down.sql — schema recovery only", () => {
  const code = statementsOnly(down);

  it("reverses exactly the forward file's objects, in reverse order", () => {
    const order = [
      "drop policy if exists staff_profiles_select_own on public.staff_profiles",
      "revoke select on table public.staff_profiles from authenticated",
      "drop function if exists public.staff_permission_areas(public.staff_role)",
      "drop type if exists public.permission_area",
      "drop constraint if exists staff_profiles_revoked_not_active",
      "drop constraint if exists staff_profiles_revoked_reason_length",
      "drop column if exists revoked_reason",
      "drop column if exists revoked_at",
      "drop column if exists mfa_enrolled_at",
    ];
    let position = -1;
    for (const statement of order) {
      const next = code.indexOf(statement);
      expect(next, statement).toBeGreaterThan(position);
      position = next;
    }
    expect(code.match(/drop column/g)).toHaveLength(3);
    expect(code).not.toMatch(/drop table/);
    // The S1.1 role enum is referenced as the function's argument type and never dropped.
    expect(code).not.toMatch(/drop type if exists public\.staff_role/);
    expect(code).not.toMatch(/\bdelete\b/);
  });

  it("says plainly that it deletes the recorded values and does not restore them, and names the ledger repair", () => {
    expect(downLower).toContain(
      "deletes every member's recorded mfa enrolment time",
    );
    expect(downLower).toContain("down-sql reverses schema, never data");
    expect(downLower).toContain("migration repair --status reverted 0003");
    expect(downLower).toContain("outside supabase/migrations/");
  });
});
