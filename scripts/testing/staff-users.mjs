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
 *                      revokeStaffAccess() performs; the next request of that member is denied. The audit row
 *                      states what the tool read before the change; a fixture already revoked, a TEST row that
 *                      differs from the fixture or one that holds the owner role is left alone;
 *   --restore <role>   with --apply: the reverse (active = true, the ban lifted, an audit row).
 *
 * Addresses must be whole @example.test addresses (a reserved domain — never a real person); passwords are read
 * from the environment and never printed, nor is any TOTP secret or token. PROD, an unknown target, missing
 * names or a mismatched ref are refused before any request, with names only. Nothing is written without --apply.
 *
 * What --apply leaves on TEST stays there: no tool or grant in this repository deletes an Auth user or a
 * staff_profiles row, and audit rows are insert-only for every role.
 */
import { createClient } from "@supabase/supabase-js";

import { loadLocalEnv } from "./lib/env.mjs";
import { redact } from "./lib/http.mjs";
import {
  STAFF_ENV_NAMES,
  accessExercise,
  accessExerciseGate,
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
 * What an error is called in the tool's output: the platform's code, else the HTTP status, else "no response" —
 * never a library or upstream message, which could carry a page of markup or a value.
 * @param {{ code?: string, status?: number } | null | undefined} error
 * @param {number} [status]
 */
function describe(error, status) {
  if (error?.code) return error.code;
  const http = status ?? error?.status;
  return http ? `HTTP ${http}` : "no response";
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
    // The factors are what the Auth server holds (a read); `mfa_enrolled_at` is the informational column, which
    // an MFA reset or a schema rollback leaves out of step with them — so both are shown, each under its name.
    let factors = "";
    if (entry.userId) {
      const listed = await client.auth.admin.mfa.listFactors({
        userId: entry.userId,
      });
      factors = listed.error
        ? `, factors not read (${describe(listed.error)})`
        : `, verified factors ${(listed.data?.factors ?? []).filter((f) => f.status === "verified").length}`;
    }
    const line = `${entry.fixture.role.padEnd(12)} user ${entry.userAction === "exists" ? `exists (${entry.userId})` : "to create"}${factors}; profile ${entry.profileAction}${
      entry.profile
        ? ` (active ${entry.profile.active}, mfa_enrolled_at ${entry.profile.mfa_enrolled_at ? "set" : "empty"}${entry.profile.revoked_at ? ", REVOKED" : ""})`
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
      const insertion = await client.from("staff_profiles").insert({
        user_id: userId,
        role: entry.fixture.role,
        display_name: entry.fixture.displayName,
        active: true,
      });
      if (insertion.error) {
        console.error(
          `  ${entry.fixture.role}: staff_profiles insert failed (${describe(insertion.error, insertion.status)})`,
        );
        process.exitCode = 1;
        return;
      }
      inserted += 1;
      // The row as this run has just written it — what a --revoke in the same run finds.
      entry.profile = {
        user_id: userId,
        role: entry.fixture.role,
        display_name: entry.fixture.displayName,
        active: true,
        mfa_enrolled_at: null,
        revoked_at: null,
      };
      entry.profileAction = "unchanged";
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
    const entry = plan.find((e) => e.fixture.role === exercise);
    if (!userId || !entry) {
      console.error(
        `  ${exercise}: no fixture user on TEST — run --apply first`,
      );
      process.exitCode = 1;
      return;
    }
    const revoking = Boolean(args.revoke);
    // Only on the fixture's own, unchanged row, and only when there is something to change.
    const gate = accessExerciseGate({
      revoking,
      profileAction: entry.profileAction,
      profile: entry.profile,
    });
    if (!gate.run) {
      if (gate.refusal) {
        console.error(`  ${exercise}: refused — ${gate.reason}`);
        process.exitCode = 1;
      } else console.log(`  ${exercise}: ${gate.reason}`);
      return;
    }
    const before = {
      active: entry.profile?.active ?? true,
      revoked_at: entry.profile?.revoked_at ?? null,
    };
    const writes = accessExercise({
      revoking,
      userId,
      before,
      now: new Date().toISOString(),
    });
    const profile = await client
      .from("staff_profiles")
      .update(writes.profile)
      .eq("user_id", userId)
      .select("user_id");
    if (profile.error || (profile.data ?? []).length !== 1) {
      console.error(
        `  ${exercise}: staff_profiles update failed (${profile.error ? describe(profile.error, profile.status) : "no row changed"}) — nothing else written`,
      );
      process.exitCode = 1;
      return;
    }
    const ban = await client.auth.admin.updateUserById(userId, {
      ban_duration: writes.banDuration,
    });
    // The staff row has changed, so the audit row is written whatever the ban answered — and says which.
    const audit = await client
      .from("audit_log")
      .insert(writes.audit(!ban.error));
    if (audit.error)
      console.error(
        `  ${exercise}: audit_log insert failed (${describe(audit.error, audit.status)})`,
      );
    if (ban.error)
      console.error(
        `  ${exercise}: auth.admin.updateUserById failed (${describe(ban.error)}) — the staff row is ${revoking ? "inactive" : "active"}, the Auth ban is unchanged`,
      );
    if (audit.error || ban.error) {
      process.exitCode = 1;
      return;
    }
    console.log(
      `${revoking ? "Revoked" : "Restored"} ${exercise} (${userId}): profile ${revoking ? "inactive" : "active"}, Auth ban ${revoking ? "set" : "lifted"}, audit row written. ${revoking ? "The member's next /admin request is denied." : ""}`,
    );
  }
}

/** The values a thrown message must never show (a malformed key can end up quoted in a library error). */
const NEVER_PRINTED = [
  "SUPABASE_SECRET_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  ...STAFF_ENV_NAMES.filter((name) => name.endsWith("_PASSWORD")),
];

main().catch((error) => {
  console.error(
    redact(
      error instanceof Error ? error.message : String(error),
      NEVER_PRINTED.map((name) => process.env[name]),
    ),
  );
  process.exitCode = 1;
});
