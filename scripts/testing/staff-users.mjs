#!/usr/bin/env node
// @ts-check
/**
 * `pnpm db:test:staff-users` — the three TEST staff fixtures of S1.2 (docs/ROADMAP.md S1.2; the S1.2 record;
 * docs/testing-setup/SETUP-CHECKLIST.md Part 2). Under the owner's scoped TEST authorisation and only after a
 * fresh preflight (target, both keys, auth health, the baseline, 0003_staff_auth applied), it:
 *
 *   (default)          dry run — reports which fixture users and staff_profiles rows exist and what --apply would do;
 *   --apply            creates the missing Auth users through the admin API (e-mail confirmed, no mail sent) from
 *                      E2E_STAFF_<ROLE>_EMAIL / _PASSWORD and inserts their staff_profiles rows; an existing row
 *                      that differs (role or name) is reported and kept, never overwritten;
 *   --reset-mfa        with --apply: deletes every MFA factor of the three fixture users, so the Playwright
 *                      auth-setup project enrols them again (the harness keeps each secret under .auth/);
 *   --revoke <role>    with --apply: the S1.2 revocation exercise on one fixture (never the owner) — active = false,
 *                      revoked_at, revoked_reason, an Auth ban, an audit row — the same three writes the server's
 *                      revokeStaffAccess() performs; the next request of that member is denied;
 *   --restore <role>   with --apply: the reverse (active = true, the ban lifted, an audit row).
 *
 * Addresses must end in @example.test (a reserved domain — never a real person); passwords are read from the
 * environment and never printed, nor is any TOTP secret or token. PROD, an unknown target, missing names or a
 * mismatched ref are refused before any request, with names only. Nothing is written without --apply.
 */
import { createClient } from "@supabase/supabase-js";

import { loadLocalEnv } from "./lib/env.mjs";
import {
  REVOCATION_BAN_DURATION,
  REVOCATION_EXERCISE_REASON,
  STAFF_ENV_NAMES,
  parseStaffArgs,
  planStaffUsers,
  readStaffFixtures,
} from "./lib/staff.mjs";
import {
  probeIdentity,
  probeProblems,
  resolveTestTarget,
} from "./lib/supabase-target.mjs";

const TIMEOUT_MS = 15_000;

/**
 * @param {{ code?: string, message?: string } | null} error
 * @param {number} [status]
 */
function describe(error, status) {
  if (error?.code) return error.code;
  if (!error) return "no answer";
  return status ? `HTTP ${status}` : (error.message ?? "error");
}

/**
 * Lists every Auth user (TEST holds a handful) as { id, email }; values other than the address are dropped.
 * @param {import("@supabase/supabase-js").SupabaseClient} client
 */
async function listUsers(client) {
  /** @type {Array<{ id: string, email: string }>} */
  const users = [];
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw new Error(`auth.admin.listUsers: ${describe(error)}`);
    for (const user of data.users)
      if (typeof user.email === "string")
        users.push({ id: user.id, email: user.email });
    if (data.users.length < 200) break;
  }
  return users;
}

async function main() {
  const args = parseStaffArgs(process.argv.slice(2));
  if (args.errors.length > 0) {
    console.error("Refused before any request:");
    for (const reason of args.errors) console.error(`  - ${reason}`);
    process.exitCode = 2;
    return;
  }
  const writes = args.resetMfa || args.revoke || args.restore;
  if (writes && !args.apply) {
    console.log(
      "Dry run: --reset-mfa, --revoke and --restore write only together with --apply. Showing the plan.",
    );
  }

  const env = loadLocalEnv();
  console.log(
    env.loaded
      ? `Loaded ${env.names} name(s) from ${env.file} (values never shown).`
      : `${env.file} not found — using the shell environment only.`,
  );
  const target = resolveTestTarget(process.env);
  if (!target.ok) {
    console.error("Refused before any request:");
    for (const reason of target.reasons) console.error(`  - ${reason}`);
    process.exitCode = 2;
    return;
  }
  const fixtures = readStaffFixtures(process.env);
  if (!fixtures.ok) {
    console.error(
      `Refused before any request (the harness names are ${STAFF_ENV_NAMES.join(", ")}):`,
    );
    for (const reason of fixtures.reasons) console.error(`  - ${reason}`);
    process.exitCode = 2;
    return;
  }

  const probe = await probeIdentity(target.target);
  const problems = probeProblems(probe);
  if (problems.length > 0) {
    console.error("Preflight FAILED — nothing written:");
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `TEST project ${target.target.ref} verified (keys accepted, auth healthy, baseline present; PROD ref ${target.target.prodRef} differs).`,
  );

  const client = createClient(target.target.url, target.target.secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  // 0003_staff_auth must be applied: the S1.2 columns are read, which fails on the S1.1 shape.
  const shape = await client
    .from("staff_profiles")
    .select("user_id, role, display_name, active, mfa_enrolled_at, revoked_at")
    .limit(500)
    .abortSignal(AbortSignal.timeout(TIMEOUT_MS));
  if (shape.error) {
    console.error(
      shape.error.code === "42703" || shape.error.code === "PGRST204"
        ? "Refused: staff_profiles lacks the S1.2 columns — apply 0003_staff_auth to TEST first (docs/database-changes/S1.2-0003-staff-auth.md)."
        : `Refused: staff_profiles could not be read (${describe(shape.error, shape.status)}) — apply 0002_orders and 0003_staff_auth to TEST first.`,
    );
    process.exitCode = 1;
    return;
  }
  /** @type {Array<{ user_id: string, role: string, display_name: string, active: boolean, mfa_enrolled_at: string | null, revoked_at: string | null }>} */
  const profiles = /** @type {any} */ (shape.data ?? []);

  const users = await listUsers(client);
  const plan = planStaffUsers(fixtures.fixtures, users, profiles);

  console.log(
    args.apply
      ? "Applying…"
      : "Dry run — comparing the fixtures with TEST, writing nothing.",
  );
  for (const entry of plan) {
    const line = `${entry.fixture.role.padEnd(12)} user ${entry.userAction === "exists" ? `exists (${entry.userId})` : "to create"}; profile ${entry.profileAction}${
      entry.profile
        ? ` (active ${entry.profile.active}, mfa ${entry.profile.mfa_enrolled_at ? "enrolled" : "not enrolled"}${entry.profile.revoked_at ? ", REVOKED" : ""})`
        : ""
    }`;
    console.log(`  ${line}`);
    if (entry.profileAction === "differs" && entry.profile)
      console.log(
        `    kept as is: TEST has role ${entry.profile.role}, name "${entry.profile.display_name}"; the fixture says ${entry.fixture.role}, "${entry.fixture.displayName}" — not overwritten`,
      );
  }

  if (!args.apply) return;

  let created = 0;
  let inserted = 0;
  const ids = new Map(plan.map((e) => [e.fixture.role, e.userId]));
  for (const entry of plan) {
    let userId = entry.userId;
    if (entry.userAction === "create") {
      const { data, error } = await client.auth.admin.createUser({
        email: entry.fixture.email,
        password: entry.fixture.password,
        email_confirm: true,
        user_metadata: { fixture: "s1.2-staff", role: entry.fixture.role },
      });
      if (error || !data.user) {
        console.error(
          `  ${entry.fixture.role}: auth.admin.createUser failed (${describe(error)})`,
        );
        process.exitCode = 1;
        return;
      }
      userId = data.user.id;
      created += 1;
      console.log(`  ${entry.fixture.role}: user created (${userId})`);
    }
    ids.set(entry.fixture.role, userId);
    if (entry.profileAction === "insert" && userId) {
      const { error } = await client.from("staff_profiles").insert({
        user_id: userId,
        role: entry.fixture.role,
        display_name: entry.fixture.displayName,
        active: true,
      });
      if (error) {
        console.error(
          `  ${entry.fixture.role}: staff_profiles insert failed (${describe(error)})`,
        );
        process.exitCode = 1;
        return;
      }
      inserted += 1;
      console.log(`  ${entry.fixture.role}: staff profile inserted`);
    }
  }
  console.log(
    `Users: ${created} created. Profiles: ${inserted} inserted; the rest kept.`,
  );

  if (args.resetMfa) {
    let removed = 0;
    for (const [role, userId] of ids) {
      if (!userId) continue;
      const factors = await client.auth.admin.mfa.listFactors({ userId });
      if (factors.error) {
        console.error(
          `  ${role}: mfa.listFactors failed (${describe(factors.error)})`,
        );
        process.exitCode = 1;
        return;
      }
      for (const factor of factors.data?.factors ?? []) {
        const deleted = await client.auth.admin.mfa.deleteFactor({
          id: factor.id,
          userId,
        });
        if (deleted.error) {
          console.error(
            `  ${role}: mfa.deleteFactor failed (${describe(deleted.error)})`,
          );
          process.exitCode = 1;
          return;
        }
        removed += 1;
      }
    }
    console.log(
      `MFA reset: ${removed} factor(s) removed. Delete the harness's .auth/ state so the auth-setup project enrols again.`,
    );
  }

  const exercise = args.revoke ?? args.restore;
  if (exercise) {
    const userId = ids.get(exercise);
    if (!userId) {
      console.error(
        `  ${exercise}: no fixture user on TEST — run --apply first`,
      );
      process.exitCode = 1;
      return;
    }
    const revoking = Boolean(args.revoke);
    const now = new Date().toISOString();
    const update = revoking
      ? {
          active: false,
          revoked_at: now,
          revoked_reason: REVOCATION_EXERCISE_REASON,
        }
      : { active: true, revoked_at: null, revoked_reason: null };
    const profile = await client
      .from("staff_profiles")
      .update(update)
      .eq("user_id", userId);
    if (profile.error) {
      console.error(
        `  ${exercise}: staff_profiles update failed (${describe(profile.error)})`,
      );
      process.exitCode = 1;
      return;
    }
    const ban = await client.auth.admin.updateUserById(userId, {
      ban_duration: revoking ? REVOCATION_BAN_DURATION : "none",
    });
    if (ban.error) {
      console.error(
        `  ${exercise}: auth.admin.updateUserById failed (${describe(ban.error)})`,
      );
      process.exitCode = 1;
      return;
    }
    const audit = await client.from("audit_log").insert({
      actor_type: "system",
      actor_id: null,
      action: revoking ? "staff.access_revoked" : "staff.access_restored",
      entity_type: "staff_profile",
      entity_id: userId,
      previous: { active: !revoking },
      next: revoking
        ? { active: false, revoked_at: now }
        : { active: true, revoked_at: null },
      reason: REVOCATION_EXERCISE_REASON,
    });
    if (audit.error) {
      console.error(
        `  ${exercise}: audit_log insert failed (${describe(audit.error)})`,
      );
      process.exitCode = 1;
      return;
    }
    console.log(
      `${revoking ? "Revoked" : "Restored"} ${exercise} (${userId}): profile ${revoking ? "inactive" : "active"}, Auth ban ${revoking ? "set" : "lifted"}, audit row written. ${revoking ? "The member's next /admin request is denied." : ""}`,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
