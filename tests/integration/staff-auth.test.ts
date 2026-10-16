import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  STAFF_FIXTURES,
  readStaffFixtures,
} from "../../scripts/testing/lib/staff.mjs";
import { resolveTestTarget } from "../../scripts/testing/lib/supabase-target.mjs";

/**
 * 0003_staff_auth on the real TEST project, after the apply and `pnpm db:test:staff-users --apply`
 * (docs/database-changes/S1.2-0003-staff-auth.md → Verification; ENVIRONMENT-PARITY.md §12 P8b): the staff table
 * stays closed to the publishable key with privileged post-checks that nothing changed; the mapping function is
 * closed to anon and exact for the privileged role; a signed-in staff member at aal1 (password only) reads no row —
 * their own included — because the own-row policy needs aal2, holds no write on the table, and may call the
 * mapping function. This suite does not enrol a factor, so it does not read through the policy at aal2: the
 * policy's allowed branch (an aal2 member reads exactly their own row) is proved by the read-only probe of the
 * change record (Verification 5b), and the server guard's aal2 path — which reads the row with the privileged
 * client, not through the policy — by the Playwright auth-setup project on the Preview and the hermetic
 * decision-table tests. It never skips: missing names fail with the names only.
 */

const NO_SESSION = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};

let privileged: SupabaseClient;
let anon: SupabaseClient;
let url = "";
let publishableKey = "";
let supportEmail = "";
let supportPassword = "";

function denied(
  result: { error: { code?: string } | null; status: number; data: unknown },
  label: string,
) {
  expect(result.error?.code, `${label}: Postgres code`).toBe("42501");
  expect([401, 403], `${label}: HTTP status`).toContain(result.status);
}

async function staffCount(): Promise<number> {
  const { count, error } = await privileged
    .from("staff_profiles")
    .select("*", { count: "exact", head: true });
  expect(error).toBeNull();
  // A null count would make "before" and "after" compare equal without anything having been counted.
  expect(count, "staff_profiles: privileged count").not.toBeNull();
  return count ?? -1;
}

beforeAll(async () => {
  const target = resolveTestTarget(process.env);
  if (!target.ok) throw new Error(target.reasons.join("; "));
  url = target.target.url;
  publishableKey = target.target.publishableKey;
  privileged = createClient(url, target.target.secretKey, NO_SESSION);
  anon = createClient(url, publishableKey, NO_SESSION);

  const shape = await privileged
    .from("staff_profiles")
    .select("user_id, role, active, mfa_enrolled_at, revoked_at")
    .limit(1);
  if (shape.error)
    throw new Error(
      `0003_staff_auth is not applied on TEST (staff_profiles: ${shape.error.code}) — apply it first (docs/database-changes/S1.2-0003-staff-auth.md)`,
    );

  const fixtures = readStaffFixtures(process.env);
  if (!fixtures.ok)
    throw new Error(
      `the TEST staff fixtures are not configured: ${fixtures.reasons.join("; ")} — set the names in the trusted local process and run pnpm db:test:staff-users --apply`,
    );
  const support = fixtures.fixtures.find((f) => f.role === "support");
  if (!support) throw new Error("no support fixture");
  supportEmail = support.email;
  supportPassword = support.password;
});

describe("staff_profiles stays private to the publishable key", () => {
  it("refuses an anonymous select, insert, update and delete with 42501 and changes nothing", async () => {
    const before = await staffCount();
    denied(await anon.from("staff_profiles").select("*").limit(1), "select");
    denied(
      await anon.from("staff_profiles").insert({
        user_id: "00000000-0000-4000-8000-000000000000",
        role: "support",
        display_name: "zz anon",
      }),
      "insert",
    );
    denied(
      await anon
        .from("staff_profiles")
        .update({ display_name: "zz anon" })
        .eq("display_name", "zz-no-such-row"),
      "update",
    );
    denied(
      await anon
        .from("staff_profiles")
        .delete()
        .eq("display_name", "zz-no-such-row"),
      "delete",
    );
    expect(await staffCount()).toBe(before);
  });

  it("refuses the anonymous caller the mapping function and gives the privileged role the exact D-35 mapping", async () => {
    const anonCall = await anon.rpc("staff_permission_areas", {
      role: "owner_admin",
    });
    expect(anonCall.error?.code, "anon rpc").toBe("42501");
    for (const [role, areas] of [
      [
        "owner_admin",
        ["work", "support", "finance", "catalogue", "settings", "export"],
      ],
      ["operations", ["work", "catalogue"]],
      ["support", ["support"]],
    ] as const) {
      const { data, error } = await privileged.rpc("staff_permission_areas", {
        role,
      });
      expect(error, role).toBeNull();
      expect(data, role).toEqual([...areas]);
    }
  });
});

describe("the three TEST fixtures", () => {
  it("each have an active staff_profiles row with their role (pnpm db:test:staff-users --apply)", async () => {
    const { data, error } = await privileged
      .from("staff_profiles")
      .select("role, display_name, active")
      .in(
        "display_name",
        STAFF_FIXTURES.map((fixture) => fixture.displayName),
      )
      // The enum's own order: owner_admin, operations, support — the order of STAFF_FIXTURES.
      .order("role");
    expect(error).toBeNull();
    expect(data).toEqual(
      STAFF_FIXTURES.map((fixture) => ({
        role: fixture.role,
        display_name: fixture.displayName,
        active: true,
      })),
    );
  });
});

describe("a staff member's password session (aal1)", () => {
  let session: SupabaseClient;
  let supportUserId = "";

  beforeAll(async () => {
    session = createClient(url, publishableKey, NO_SESSION);
    const signedIn = await session.auth.signInWithPassword({
      email: supportEmail,
      password: supportPassword,
    });
    if (signedIn.error)
      throw new Error(
        `the support fixture could not sign in (${signedIn.error.code ?? signedIn.error.status}) — run pnpm db:test:staff-users --apply, and check that the user is not revoked`,
      );
    supportUserId = signedIn.data.user?.id ?? "";
    expect(supportUserId).not.toBe("");
    const aal = await session.auth.mfa.getAuthenticatorAssuranceLevel();
    expect(aal.error).toBeNull();
    expect(aal.data?.currentLevel).toBe("aal1");
  });

  // The suite leaves no session behind on TEST: this one is ended on the Auth server when the block is done.
  afterAll(async () => {
    await session?.auth.signOut({ scope: "local" });
  });

  it("has a staff_profiles row that the privileged client sees, with the support role", async () => {
    const { data, error } = await privileged
      .from("staff_profiles")
      .select("user_id, role, active")
      .eq("user_id", supportUserId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).toMatchObject({
      user_id: supportUserId,
      role: "support",
      active: true,
    });
  });

  it("reads no staff_profiles row at aal1 — not even its own: the policy requires MFA", async () => {
    const own = await session
      .from("staff_profiles")
      .select("user_id, role")
      .eq("user_id", supportUserId);
    expect(own.error).toBeNull();
    expect(own.data).toEqual([]);
    const all = await session.from("staff_profiles").select("user_id");
    expect(all.error).toBeNull();
    expect(all.data).toEqual([]);
  });

  it("holds no write on staff_profiles and no privilege on the other private tables", async () => {
    const before = await staffCount();
    denied(
      await session
        .from("staff_profiles")
        .update({ display_name: "zz session" })
        .eq("user_id", supportUserId),
      "update own row",
    );
    denied(
      await session.from("staff_profiles").insert({
        user_id: supportUserId,
        role: "owner_admin",
        display_name: "zz",
      }),
      "insert",
    );
    denied(
      await session.from("audit_log").select("*").limit(1),
      "audit_log select",
    );
    denied(await session.from("orders").select("*").limit(1), "orders select");
    expect(await staffCount()).toBe(before);
    const own = await privileged
      .from("staff_profiles")
      .select("display_name, role")
      .eq("user_id", supportUserId)
      .single();
    expect(own.data).toMatchObject({ role: "support" });
    expect(own.data?.display_name).not.toBe("zz session");
  });

  it("may call the mapping function (granted to authenticated) and gets its own role's areas", async () => {
    const { data, error } = await session.rpc("staff_permission_areas", {
      role: "support",
    });
    expect(error).toBeNull();
    expect(data).toEqual(["support"]);
  });
});
