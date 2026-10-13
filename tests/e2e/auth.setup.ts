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

/**
 * The limit of each of the two steps that wait on the Auth server — the password step and the code step — inside
 * the project's 90-second test timeout (playwright.config.ts). A Preview whose functions start cold has taken
 * well over the suite's default limits for the first fixture.
 */
const STEP_TIMEOUT_MS = 45_000;

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
    // A failed fill prints its call log, and the call log quotes the value: the password never gets that far.
    await page
      .getByLabel("Password")
      .fill(fixture.password)
      .catch(() => {
        throw new Error(
          `${role}: the password field of the sign-in page could not be filled`,
        );
      });
    await page.getByRole("button", { name: "Sign in" }).click();
    // The next step, or the sign-in page's own refusal — named here, so a used-up throttle window or a missing
    // setting does not surface as a bare navigation timeout. The value is one of the page's fixed error codes.
    await page.waitForURL(
      (url) =>
        /^\/admin\/login\/(verify|enrol)$/.test(url.pathname) ||
        url.searchParams.has("error"),
      { timeout: STEP_TIMEOUT_MS },
    );
    const refused = new URL(page.url()).searchParams.get("error");
    if (refused)
      throw new Error(
        `${role}: the sign-in was refused with "${refused}" — throttled: the app's own limit (5 sign-ins per address, 20 per client address, per 15 minutes) is used up, wait for the window; unavailable: the Upstash names in the Preview scope or the TEST project's settings; credentials: the fixture's password, or run pnpm db:test:staff-users --apply under the owner's TEST authorisation`,
      );

    // MFA cannot be skipped: a password session alone opens nothing — /admin sends it back to the second step.
    await page.goto("/admin", { waitUntil: "load" });
    expect(new URL(page.url()).pathname).toMatch(
      /^\/admin\/login\/(verify|enrol)$/,
    );
    await expect(page.getByText("Signed in as")).toHaveCount(0);

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
      const qr = page.getByRole("img", {
        name: "QR code for your authenticator app",
      });
      // Not a locator assertion: when one fails, Playwright writes a snapshot of the page's text into
      // test-results/, and the key for manual entry is on this page. A wait and a value check leave no snapshot.
      await qr.waitFor({ state: "visible" });
      // Visible is not enough — a broken image is visible too: the picture must have decoded.
      await expect
        .poll(
          () =>
            qr.evaluate((image) => (image as HTMLImageElement).naturalWidth),
          { message: "the enrolment QR decodes as an image" },
        )
        .toBeGreaterThan(0);
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
      .fill(totpCode(secret!))
      .catch(() => {
        throw new Error(`${role}: the code field could not be filled`);
      });
    await page
      .getByRole("button", { name: atEnrolment ? "Confirm" : "Verify" })
      .click();
    // The shell, or the page's own refusal — named, so a refused or throttled code is not a bare timeout. The
    // notice is the page's (inside <main>); its text is one of the registered strings. Both waits carry the same
    // explicit limit: left to their defaults the wait for the notice (the action timeout) gives up before the
    // wait for the shell (the navigation timeout), and a code the Auth server accepted slowly — a cold Preview —
    // would be reported as "did not reach the shell".
    const notice = page.locator('main [role="alert"]');
    const outcome = await Promise.race([
      page
        .waitForURL((url) => url.pathname === "/admin", {
          timeout: STEP_TIMEOUT_MS,
        })
        .then(
          () => "shell" as const,
          () => "timeout" as const,
        ),
      notice.waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS }).then(
        () => "refused" as const,
        () => "timeout" as const,
      ),
    ]);
    if (outcome !== "shell")
      throw new Error(
        outcome === "refused"
          ? `${role}: the code step was refused — the page says: "${((await notice.textContent()) ?? "").trim()}" (five codes per member per 15 minutes; a clock that is off by more than a step)`
          : `${role}: the code step did not reach the shell`,
      );
    await expect(
      page.getByText(`Signed in as ${fixture.displayName}`, { exact: false }),
    ).toBeVisible();

    await page.context().storageState({ path: storageStatePath(role) });
  });
}
