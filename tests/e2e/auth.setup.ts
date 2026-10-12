import { mkdirSync } from "node:fs";

import { expect, test } from "./harness/fixtures";
import {
  AUTH_STATE_DIR,
  STAFF_FIXTURE_ROLES,
  fixtureFor,
  readTotpSecret,
  storageStatePath,
  writeTotpSecret,
} from "./harness/staff";
import { millisecondsLeftInStep, totpCode } from "./harness/totp";

/**
 * The auth-setup project — S1.2 (docs/testing-setup/SETUP-CHECKLIST.md Part 2: "one auth-setup step per user
 * role"). For each of the three TEST staff fixtures it signs in through the real pages on the Preview — the
 * password step, then either the first enrolment (the key shown for manual entry is kept under `.auth/`, never
 * printed) or the verification step with that kept key — and saves the signed-in storage state the role specs use.
 * Every step is the application's own UI; nothing here calls Supabase directly.
 */

for (const role of STAFF_FIXTURE_ROLES) {
  test(`signs in the ${role} fixture through the sign-in, MFA and shell`, async ({
    page,
  }) => {
    const fixture = fixtureFor(role);
    mkdirSync(AUTH_STATE_DIR, { recursive: true });

    await page.goto("/admin/login", { waitUntil: "load" });
    await expect(
      page.getByRole("heading", { level: 1, name: "Sign in" }),
    ).toBeVisible();
    await page.getByLabel("Email").fill(fixture.email);
    await page.getByLabel("Password").fill(fixture.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/admin\/login\/(verify|enrol)(\?|$)/);

    const atEnrolment = /\/admin\/login\/enrol/.test(page.url());
    let secret = readTotpSecret(role);

    if (atEnrolment) {
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "Set up two-step verification",
        }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Start setup" }).click();
      const shown =
        (await page.getByTestId("totp-secret").textContent())?.trim() ?? "";
      expect(
        shown.length,
        "the enrolment page shows the key for manual entry",
      ).toBeGreaterThan(0);
      secret = shown;
      // Kept for the later runs of this project; the file is git-ignored and never printed.
      writeTotpSecret(role, secret);
      await expect(
        page.getByRole("img", { name: "QR code for your authenticator app" }),
      ).toBeVisible();
    } else {
      await expect(
        page.getByRole("heading", { level: 1, name: "Two-step verification" }),
      ).toBeVisible();
      if (!secret)
        throw new Error(
          `${role}: the fixture already has a verified factor but .auth/ holds no key for it — run pnpm db:test:staff-users --apply --reset-mfa under the owner's TEST authorisation, then run again`,
        );
    }

    // A code read in the last seconds of a step may expire before the server checks it.
    if (millisecondsLeftInStep() < 4000) await page.waitForTimeout(4000);
    await page
      .getByLabel("Code from your authenticator app")
      .fill(totpCode(secret!));
    await page
      .getByRole("button", { name: atEnrolment ? "Confirm" : "Verify" })
      .click();
    await page.waitForURL(/\/admin(\?|$)/);
    await expect(
      page.getByText(`Signed in as ${fixture.displayName}`, { exact: false }),
    ).toBeVisible();

    await page.context().storageState({ path: storageStatePath(role) });
  });
}
