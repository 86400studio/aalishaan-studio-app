import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    // Hermetic unit tests only: no network, no secrets, never the Playwright specs (S0.2).
    include: ["tests/unit/**/*.test.ts"],
    exclude: ["prototype/**", "node_modules/**"],
    environment: "node",
    // An empty suite fails the run (TECHNICAL-INTEGRITY.md): passWithNoTests stays off.
    passWithNoTests: false,
  },
});
