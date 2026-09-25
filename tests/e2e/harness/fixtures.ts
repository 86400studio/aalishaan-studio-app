import { test as base, expect } from "@playwright/test";

import { bootstrapBypassCookie } from "./bypass";
import { resolveTargetFromEnv, type ResolvedTarget } from "./target";

/**
 * The shared safe harness for every spec in tests/e2e (S0.2): the resolved target and a browser context
 * that reaches the protected Preview through the host-scoped bypass cookie (never a header in the browser).
 */
export const test = base.extend<{ target: ResolvedTarget }>({
  // The second parameter is Playwright's provider callback; named `provide` so it is not read as a React hook.
  target: async ({}, provide) => {
    await provide(resolveTargetFromEnv(process.env));
  },
  context: async ({ context, target }, provide) => {
    await bootstrapBypassCookie(context, target);
    await provide(context);
  },
});

export { expect };
