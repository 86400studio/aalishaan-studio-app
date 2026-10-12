import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  STAFF_FIXTURES,
  readStaffFixtures,
} from "../../../scripts/testing/lib/staff.mjs";

/**
 * The staff fixtures of the Playwright harness — S1.2. The addresses and passwords come from the `E2E_STAFF_*`
 * names in the trusted local process (loaded by playwright.config.ts like every harness input; never printed); the
 * signed-in storage state and the TOTP secret of each role live under the git-ignored `.auth/` folder, written by
 * the auth-setup project and read by the role specs. No file under `.auth/` is ever committed (.gitignore).
 */

export type StaffFixtureRole = (typeof STAFF_FIXTURES)[number]["role"];

export const STAFF_FIXTURE_ROLES = STAFF_FIXTURES.map(
  (f) => f.role,
) as StaffFixtureRole[];

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
export const AUTH_STATE_DIR = path.join(ROOT, ".auth");

export function storageStatePath(role: StaffFixtureRole): string {
  return path.join(AUTH_STATE_DIR, `staff-${role}.json`);
}

export function totpSecretPath(role: StaffFixtureRole): string {
  return path.join(AUTH_STATE_DIR, `staff-${role}.totp`);
}

export function fixtureFor(role: StaffFixtureRole): {
  role: StaffFixtureRole;
  displayName: string;
  email: string;
  password: string;
} {
  const fixtures = readStaffFixtures(process.env);
  if (!fixtures.ok)
    throw new Error(
      `the TEST staff fixtures are not configured: ${fixtures.reasons.join("; ")} — set the E2E_STAFF_* names in the trusted local process (never a real person's address)`,
    );
  const fixture = fixtures.fixtures.find((f) => f.role === role);
  if (!fixture) throw new Error(`no fixture for ${role}`);
  return {
    role,
    displayName: fixture.displayName,
    email: fixture.email,
    password: fixture.password,
  };
}

export function readTotpSecret(role: StaffFixtureRole): string | null {
  const file = totpSecretPath(role);
  if (!existsSync(file)) return null;
  const secret = readFileSync(file, "utf8").trim();
  return secret === "" ? null : secret;
}

export function writeTotpSecret(role: StaffFixtureRole, secret: string): void {
  mkdirSync(AUTH_STATE_DIR, { recursive: true });
  writeFileSync(totpSecretPath(role), `${secret}\n`, { mode: 0o600 });
}

/** The display label the shell shows for each role (the final Admin's labels — docs/content/locked-facts.md §9a). */
export const ROLE_LABELS: Record<StaffFixtureRole, string> = {
  owner_admin: "Owner",
  operations: "Operations",
  support: "Customer support",
};
