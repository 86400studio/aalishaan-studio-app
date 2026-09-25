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
 * flaky outcome stays visible; traces, screenshots, videos and the HTML report are off so no artifact can
 * carry a credential.
 */
// Preview mode reads the owner's git-ignored .env.local like every other harness command (a value already
// set in the shell wins); local mode never loads it, so a Preview secret in that file cannot reach a local run.
if (process.env.PLAYWRIGHT_TARGET_MODE !== "local") loadLocalEnv();
const target = resolveTargetFromEnv(process.env);

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
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "mobile-390",
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
