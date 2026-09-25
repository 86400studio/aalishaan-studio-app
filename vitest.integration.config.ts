import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

import { loadLocalEnv } from "./scripts/testing/lib/env.mjs";
import { resolveTestTarget } from "./scripts/testing/lib/supabase-target.mjs";

/**
 * Real TEST integration — S0.2 (docs/TECH-ARCHITECTURE.md §2; docs/ENVIRONMENT-PARITY.md §10). A separate
 * configuration so `pnpm test:unit` never contacts a remote service. The trusted local process loads
 * `.env.local` here (values never printed) and the TEST target is resolved before Vitest starts: missing
 * or refused configuration fails the run with names only — integration is never silently skipped.
 * The identity probes and the baseline check run in tests/integration/global-setup.ts.
 */
loadLocalEnv();
const target = resolveTestTarget(process.env);
if (!target.ok) {
  throw new Error(
    `pnpm test:integration needs the verified TEST project (docs/ENVIRONMENT-PARITY.md §10): ${target.reasons.join("; ")}`,
  );
}

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    exclude: ["prototype/**", "node_modules/**"],
    environment: "node",
    globalSetup: ["tests/integration/global-setup.ts"],
    // Fixture runs are serialised: one file, one worker, no parallel writes to the shared TEST project.
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 30_000,
    hookTimeout: 30_000,
    retry: 0,
    passWithNoTests: false,
  },
});
