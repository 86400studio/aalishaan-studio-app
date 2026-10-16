import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { auditLogInputSchema } from "@/lib/schemas/orders";

import {
  FIXTURE_ADDRESS_SUFFIX,
  REVOCATION_BAN_DURATION,
  REVOCATION_EXERCISE_REASON,
  STAFF_ENV_NAMES,
  STAFF_FIXTURES,
  accessExercise,
  accessExerciseGate,
  parseStaffArgs,
  planStaffUsers,
  readStaffFixtures,
} from "../../scripts/testing/lib/staff.mjs";
import {
  base32Decode,
  millisecondsLeftInStep,
  totpCode,
} from "../e2e/harness/totp";

/**
 * Hermetic guards of the S1.2 harness pieces: the fixture rule (fake addresses only, names only in messages),
 * the tool's command line (nothing written without --apply; the owner never revoked by the tool), the plan that
 * never overwrites a differing TEST row, the tool's refusals before any request, and the RFC 6238 TOTP helper
 * against the published test vector. No network.
 */

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const TOOL = path.join(ROOT, "scripts/testing/staff-users.mjs");

const GOOD_ENV = {
  E2E_STAFF_OWNER_EMAIL: "owner@example.test",
  E2E_STAFF_OWNER_PASSWORD: "x".repeat(16),
  E2E_STAFF_OPERATIONS_EMAIL: "Operations@Example.test",
  E2E_STAFF_OPERATIONS_PASSWORD: "y".repeat(16),
  E2E_STAFF_SUPPORT_EMAIL: "support@example.test",
  E2E_STAFF_SUPPORT_PASSWORD: "z".repeat(16),
};

describe("the staff fixtures", () => {
  it("names the owner and the two presets with TEST display names and six env names", () => {
    expect(STAFF_FIXTURES.map((f) => f.role)).toEqual([
      "owner_admin",
      "operations",
      "support",
    ]);
    expect(STAFF_FIXTURES.map((f) => f.displayName)).toEqual([
      "Owner (TEST)",
      "Operations (TEST)",
      "Customer support (TEST)",
    ]);
    expect([...STAFF_ENV_NAMES]).toEqual([
      "E2E_STAFF_OWNER_EMAIL",
      "E2E_STAFF_OWNER_PASSWORD",
      "E2E_STAFF_OPERATIONS_EMAIL",
      "E2E_STAFF_OPERATIONS_PASSWORD",
      "E2E_STAFF_SUPPORT_EMAIL",
      "E2E_STAFF_SUPPORT_PASSWORD",
    ]);
    expect(FIXTURE_ADDRESS_SUFFIX).toBe("@example.test");
    expect(REVOCATION_BAN_DURATION).toBe("876600h");
  });

  it("reads the six names, lower-cases the addresses and keeps the passwords out of every message", () => {
    const result = readStaffFixtures(GOOD_ENV);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fixtures.map((f) => f.email)).toEqual([
        "owner@example.test",
        "operations@example.test",
        "support@example.test",
      ]);
      expect(result.fixtures[1].password).toBe("y".repeat(16));
    }
  });

  it.each([
    [
      "a missing address",
      { ...GOOD_ENV, E2E_STAFF_SUPPORT_EMAIL: undefined },
      "E2E_STAFF_SUPPORT_EMAIL is not set",
    ],
    [
      "a real-looking address",
      { ...GOOD_ENV, E2E_STAFF_OWNER_EMAIL: "someone@example.com" },
      "obviously fake address",
    ],
    // The whole address must be a fixture address — its two ends are not enough.
    [
      "a real address in front of the reserved domain",
      { ...GOOD_ENV, E2E_STAFF_OWNER_EMAIL: "x@evil.example@example.test" },
      "obviously fake address",
    ],
    [
      "two addresses in one value",
      {
        ...GOOD_ENV,
        E2E_STAFF_OWNER_EMAIL: "real.person@example.com,x@example.test",
      },
      "obviously fake address",
    ],
    [
      "a display-name form",
      {
        ...GOOD_ENV,
        E2E_STAFF_OWNER_EMAIL: "someone@example.org <x@example.test",
      },
      "obviously fake address",
    ],
    [
      "a repeated address",
      { ...GOOD_ENV, E2E_STAFF_SUPPORT_EMAIL: "owner@example.test" },
      "repeats another fixture's address",
    ],
    [
      "a short password",
      { ...GOOD_ENV, E2E_STAFF_OPERATIONS_PASSWORD: "abc123" },
      "shorter than 12 characters",
    ],
    [
      "a blank password",
      { ...GOOD_ENV, E2E_STAFF_OWNER_PASSWORD: " " },
      "E2E_STAFF_OWNER_PASSWORD is not set",
    ],
  ])("refuses %s with names only", (_label, env, message) => {
    const result = readStaffFixtures(env as Record<string, string | undefined>);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons.join("\n")).toContain(message);
      for (const reason of result.reasons) {
        expect(reason).not.toContain("x".repeat(16));
        expect(reason).not.toContain("abc123");
      }
    }
  });
});

describe("parseStaffArgs", () => {
  it("is a dry run by default and reads each flag", () => {
    expect(parseStaffArgs([])).toEqual({
      apply: false,
      resetMfa: false,
      revoke: null,
      restore: null,
      errors: [],
    });
    expect(parseStaffArgs(["--apply", "--reset-mfa"])).toMatchObject({
      apply: true,
      resetMfa: true,
    });
    expect(parseStaffArgs(["--revoke", "operations", "--apply"])).toMatchObject(
      { revoke: "operations", apply: true },
    );
    expect(parseStaffArgs(["--restore=support"])).toMatchObject({
      restore: "support",
      apply: false,
    });
  });

  it.each([
    [["--revoke"], "needs one of"],
    [["--revoke", "admin"], "needs one of"],
    [["--revoke", "operations", "--restore", "support"], "exclude each other"],
    [["--revoke", "operations", "--revoke", "support"], "more than once"],
    [["--restore=support", "--restore=operations"], "more than once"],
    [["--revoke", "owner_admin"], "never revoked by the tool"],
    [["--restore=owner_admin"], "never revoked by the tool"],
    [["--yes"], "unknown argument"],
  ])("refuses %j", (argv, message) => {
    expect(parseStaffArgs(argv).errors.join("\n")).toContain(message);
  });
});

describe("planStaffUsers", () => {
  const fixtures = (
    readStaffFixtures(GOOD_ENV) as {
      ok: true;
      fixtures: Parameters<typeof planStaffUsers>[0];
    }
  ).fixtures;

  it("creates missing users, inserts missing profiles and keeps an identical row unchanged", () => {
    const plan = planStaffUsers(
      fixtures,
      [{ id: "u-owner", email: "Owner@example.test" }],
      [
        {
          user_id: "u-owner",
          role: "owner_admin",
          display_name: "Owner (TEST)",
          active: true,
        },
      ],
    );
    expect(
      plan.map((p) => [p.fixture.role, p.userAction, p.profileAction]),
    ).toEqual([
      ["owner_admin", "exists", "unchanged"],
      ["operations", "create", "insert"],
      ["support", "create", "insert"],
    ]);
    expect(plan[0].userId).toBe("u-owner");
  });

  it("reports a differing TEST row and never plans to overwrite it", () => {
    const plan = planStaffUsers(
      fixtures,
      [{ id: "u-ops", email: "operations@example.test" }],
      [
        {
          user_id: "u-ops",
          role: "support",
          display_name: "Operations (TEST)",
          active: true,
        },
      ],
    );
    expect(plan[1]).toMatchObject({
      userAction: "exists",
      profileAction: "differs",
    });
    expect(JSON.stringify(plan)).not.toContain("overwrite");
  });
});

describe("the revocation exercise — the three writes and when they may run", () => {
  const USER_ID = "33333333-3333-4333-8333-333333333333";
  const NOW = "2026-10-12T12:00:00.000Z";
  const ACTIVE = { active: true, revoked_at: null };
  const REVOKED = { active: false, revoked_at: "2026-10-12T11:00:00.000Z" };

  it("revokes with the same three writes as the server: the row, the ban, and an audit row that says what was there before", () => {
    const writes = accessExercise({
      revoking: true,
      userId: USER_ID,
      before: ACTIVE,
      now: NOW,
    });
    expect(writes.profile).toEqual({
      active: false,
      revoked_at: NOW,
      revoked_reason: REVOCATION_EXERCISE_REASON,
    });
    expect(writes.banDuration).toBe(REVOCATION_BAN_DURATION);
    const row = writes.audit(true);
    expect(auditLogInputSchema.safeParse(row).success).toBe(true);
    expect(row).toEqual({
      actor_type: "system",
      actor_id: null,
      action: "staff.access_revoked",
      entity_type: "staff_profile",
      entity_id: USER_ID,
      // The member WAS active and is now inactive — the direction an insert-only row must get right.
      previous: { active: true, revoked_at: null },
      next: { active: false, revoked_at: NOW, auth_ban: "set" },
      reason: REVOCATION_EXERCISE_REASON,
      external_ref: null,
    });
    expect(writes.audit(false).next).toMatchObject({ auth_ban: "failed" });
  });

  it("restores with the reverse: an active row without a revocation, the ban lifted, and the previous state as read", () => {
    const writes = accessExercise({
      revoking: false,
      userId: USER_ID,
      before: REVOKED,
      now: NOW,
    });
    expect(writes.profile).toEqual({
      active: true,
      revoked_at: null,
      revoked_reason: null,
    });
    expect(writes.banDuration).toBe("none");
    const row = writes.audit(true);
    expect(auditLogInputSchema.safeParse(row).success).toBe(true);
    expect(row).toMatchObject({
      action: "staff.access_restored",
      previous: { active: false, revoked_at: REVOKED.revoked_at },
      next: { active: true, revoked_at: null, auth_ban: "lifted" },
    });
  });

  it("runs only on the fixture's own unchanged row, never on an owner row, and not twice", () => {
    const row = (overrides = {}) => ({
      role: "operations",
      ...ACTIVE,
      ...overrides,
    });
    expect(
      accessExerciseGate({
        revoking: true,
        profileAction: "unchanged",
        profile: row(),
      }),
    ).toEqual({ run: true });
    expect(
      accessExerciseGate({
        revoking: false,
        profileAction: "unchanged",
        profile: row(REVOKED),
      }),
    ).toEqual({ run: true });

    // Refusals: the row was changed on TEST, there is no row, or the row holds the owner role.
    for (const input of [
      { revoking: true, profileAction: "differs" as const, profile: row() },
      { revoking: true, profileAction: "insert" as const, profile: null },
      {
        revoking: true,
        profileAction: "unchanged" as const,
        profile: row({ role: "owner_admin" }),
      },
    ]) {
      const gate = accessExerciseGate(input);
      expect(gate).toMatchObject({ run: false, refusal: true });
    }

    // Nothing to do — and so nothing written, not even an audit row.
    expect(
      accessExerciseGate({
        revoking: true,
        profileAction: "unchanged",
        profile: row(REVOKED),
      }),
    ).toMatchObject({ run: false, refusal: false });
    expect(
      accessExerciseGate({
        revoking: false,
        profileAction: "unchanged",
        profile: row(),
      }),
    ).toMatchObject({ run: false, refusal: false });
  });
});

describe(
  "pnpm db:test:staff-users refuses before any request",
  // Each test starts a Node process that loads the Supabase SDK before it refuses: slow on a cold disk.
  { timeout: 30_000 },
  () => {
    function run(args: string[], env: Record<string, string> = {}) {
      // A directory without a .env.local as cwd, and an environment of PATH alone: no file is read and the five
      // target names are absent, so the tool must refuse before any network request, with names only.
      const result = spawnSync(process.execPath, [TOOL, ...args], {
        cwd: path.join(ROOT, "tests", "unit"),
        env: {
          PATH: process.env.PATH ?? "",
          ...env,
        } as unknown as NodeJS.ProcessEnv,
        encoding: "utf8",
        timeout: 20_000,
      });
      return {
        status: result.status,
        out: `${result.stdout}\n${result.stderr}`,
      };
    }

    it("exits 2 on a bad flag without reading the environment", () => {
      const { status, out } = run(["--revoke", "owner_admin"]);
      expect(status).toBe(2);
      expect(out).toContain("never revoked by the tool");
      expect(out).not.toContain("Loaded");
    });

    it("exits 2 when the TEST target names are missing, naming them", () => {
      const { status, out } = run([]);
      expect(status).toBe(2);
      expect(out).toContain("NEXT_PUBLIC_SUPABASE_URL is not set");
      expect(out).toContain("SUPABASE_SECRET_KEY is not set");
    });

    it("exits 2 when the target is PROD-shaped, before touching the fixtures", () => {
      const ref = "abcdefghijklmnopqrst";
      const prod = "tsrqponmlkjihgfedcba";
      const { status, out } = run([], {
        NEXT_PUBLIC_SUPABASE_URL: `https://${prod}.supabase.co`,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: `sb_publishable_${"p".repeat(30)}`,
        SUPABASE_SECRET_KEY: `sb_secret_${"s".repeat(30)}`,
        SUPABASE_TEST_PROJECT_REF: ref,
        SUPABASE_PROD_PROJECT_REF: prod,
      });
      expect(status).toBe(2);
      expect(out).toContain("points at SUPABASE_PROD_PROJECT_REF — refused");
      expect(out).not.toContain("E2E_STAFF");
    });

    it("exits 2 when a fixture address is not obviously fake, before any request", () => {
      const ref = "abcdefghijklmnopqrst";
      const { status, out } = run([], {
        NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: `sb_publishable_${"p".repeat(30)}`,
        SUPABASE_SECRET_KEY: `sb_secret_${"s".repeat(30)}`,
        SUPABASE_TEST_PROJECT_REF: ref,
        SUPABASE_PROD_PROJECT_REF: "tsrqponmlkjihgfedcba",
        ...GOOD_ENV,
        E2E_STAFF_OWNER_EMAIL: "owner@aalishaan.example",
      });
      expect(status).toBe(2);
      expect(out).toContain("obviously fake address");
      expect(out).not.toContain("x".repeat(16));
    });

    it("writes nothing without --apply: every write in the tool's code comes after the dry-run return", () => {
      const source = readFileSync(TOOL, "utf8");
      // The code, not the header comment that describes it: the guard, and each write after it.
      const guard = source.indexOf("if (!args.apply) return;");
      expect(guard).toBeGreaterThan(-1);
      expect(source.indexOf("if (!args.apply) return;", guard + 1)).toBe(-1);
      for (const write of [
        "auth.admin.createUser(",
        '.from("staff_profiles").insert(',
        "mfa.deleteFactor(",
        ".update(writes.profile)",
        "auth.admin.updateUserById(",
        '.from("audit_log")',
      ]) {
        const first = source.indexOf(write);
        expect(first, `${write} is in the tool`).toBeGreaterThan(-1);
        expect(
          first,
          `${write} comes after the dry-run return`,
        ).toBeGreaterThan(guard);
      }
      // Before the guard the tool only reads: no insert, update, upsert or delete call at all.
      const before = source.slice(0, guard);
      expect(before).not.toMatch(/\.(insert|update|upsert|delete)\(/);
      expect(before).not.toMatch(/deleteFactor|createUser|updateUserById/);
    });

    it("never prints a fixture password or a key: no output call names one, and a thrown message is redacted", () => {
      const source = readFileSync(TOOL, "utf8");
      expect(source).toContain("@example.test");
      // No console or stdout call mentions a password, a secret key or a TOTP secret, in any quoting style.
      const outputs = [
        ...source.matchAll(
          /(?:console\.(?:log|error|warn|info)|process\.(?:stdout|stderr)\.write)\(([\s\S]*?)\);/g,
        ),
      ].map((match) => match[1]);
      expect(outputs.length).toBeGreaterThan(10);
      for (const output of outputs)
        expect(output).not.toMatch(/password|secretKey|\.secret\b|totp/i);
      // The one place an unknown message is printed passes it through the redaction of the sensitive values.
      expect(source).toMatch(
        /main\(\)\.catch\(\(error\) => \{\s*console\.error\(\s*redact\(/,
      );
      expect(source).toContain('"SUPABASE_SECRET_KEY"');
      expect(source).toContain('name.endsWith("_PASSWORD")');
    });
  },
);

describe("the TOTP helper (RFC 6238, SHA-1, 30 s, 6 digits)", () => {
  // The RFC's SHA-1 secret "12345678901234567890" in base32.
  const VECTOR = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

  it("decodes base32 and matches the RFC 6238 vectors", () => {
    expect(base32Decode(VECTOR).toString("ascii")).toBe("12345678901234567890");
    expect(totpCode(VECTOR, { at: 59_000 })).toBe("287082");
    expect(totpCode(VECTOR, { at: 1_111_111_109_000 })).toBe("081804");
    expect(totpCode(VECTOR, { at: 1_234_567_890_000 })).toBe("005924");
    expect(totpCode(VECTOR, { at: 2_000_000_000_000 })).toBe("279037");
  });

  it("accepts the spaced, lower-case form the enrolment page may show and refuses garbage", () => {
    expect(
      totpCode("gezd gnbv gy3t qojq gezd gnbv gy3t qojq", { at: 59_000 }),
    ).toBe("287082");
    expect(() => totpCode("not-base32!", { at: 59_000 })).toThrow(/base32/);
  });

  it("knows how long the current step still lasts", () => {
    expect(millisecondsLeftInStep(0)).toBe(30_000);
    expect(millisecondsLeftInStep(29_000)).toBe(1_000);
    expect(millisecondsLeftInStep(59_500)).toBe(500);
  });
});
