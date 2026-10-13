import { defineConfig, devices } from "@playwright/test";

import { loadLocalEnv } from "./scripts/testing/lib/env.mjs";
import { resolveTargetFromEnv } from "./tests/e2e/harness/target";

/**
 * Playwright — S0.2 (docs/TECH-ARCHITECTURE.md §2; docs/ENVIRONMENT-PARITY.md §10). The target is
 * validated here, at configuration time, so a missing or malformed PLAYWRIGHT_BASE_URL fails before any
 * browser starts (there is no fallback and no local `webServer`); the deployment-evidence check runs in
 * global setup. In preview mode the owner's `.env.local` supplies the harness inputs (the shell wins); local
 * mode ignores that file. Both projects are required: the reporter fails the run when either ran nothing, and the
 * global teardown fails a run in which a `--reporter` flag replaced that reporter. Retries are off so a
 * flaky outcome stays visible; traces, screenshots, videos and the HTML report are off, and so is the page
 * snapshot Playwright otherwise writes to `test-results/<test>/error-context.md` when a test fails (it would
 * hold the values of the form fields on screen — a fixture password, the TOTP key of the enrolment page), so no
 * artifact can carry a credential.
 */
// Preview mode reads the owner's git-ignored .env.local like every other harness command (a value already
// set in the shell wins); local mode never loads it, so a Preview secret in that file cannot reach a local run.
if (process.env.PLAYWRIGHT_TARGET_MODE !== "local") loadLocalEnv();
// The runner skips the failure page snapshot on exactly this name; the workers load this file too.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = "1";
const target = resolveTargetFromEnv(process.env);

/**
 * The one test that signs a saved session out (tests/e2e/admin-access.support.spec.ts). Signing out ends that
 * session on the Auth server, and desktop and mobile-390 replay the same saved session one after the other — so
 * neither runs it, and the `auth-teardown` project runs it once after both have finished.
 */
const SIGN_OUT_TEST = /@sign-out/;

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["./tests/e2e/harness/required-projects-reporter.ts"]],
  outputDir: "test-results",
  use: {
    baseURL: target.origin,
    trace: "off",
    screenshot: "off",
    video: "off",
    ignoreHTTPSErrors: false,
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },
  projects: [
    // S1.2: one auth-setup step per staff role (docs/testing-setup/SETUP-CHECKLIST.md Part 2). It signs each
    // TEST fixture in through the real pages and saves its storage state under the git-ignored .auth/ folder;
    // the two required projects depend on it and never run the setup file themselves.
    {
      name: "auth-setup",
      testMatch: /auth\.setup\.ts$/,
      teardown: "auth-teardown",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    // Runs after every project that depends on auth-setup has finished: the sign-out test, once.
    {
      name: "auth-teardown",
      testMatch: /admin-access\.support\.spec\.ts$/,
      grep: SIGN_OUT_TEST,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "desktop",
      testIgnore: /auth\.setup\.ts$/,
      grepInvert: SIGN_OUT_TEST,
      dependencies: ["auth-setup"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "mobile-390",
      testIgnore: /auth\.setup\.ts$/,
      grepInvert: SIGN_OUT_TEST,
      dependencies: ["auth-setup"],
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
