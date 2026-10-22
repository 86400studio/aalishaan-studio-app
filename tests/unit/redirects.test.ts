import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";
import { describe, expect, it, vi } from "vitest";

import { ALIAS_REDIRECTS } from "@/lib/redirects";

/**
 * The S1.3 slice of the redirect manifest (docs/TECH-ARCHITECTURE.md §3d): the four aliases of this route
 * group, each a 301 to a route the group serves, and nothing of the later groups. Hermetic.
 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const manifest = JSON.parse(
  readFileSync(path.join(ROOT, "prototype/site-manifest.json"), "utf8"),
) as { aliases: Record<string, string> };

describe("src/lib/redirects.ts — the S1.3 aliases", () => {
  it("is exactly the four aliases of the route group, each pointing at a route the group serves", () => {
    expect(ALIAS_REDIRECTS).toEqual([
      { source: "/home", destination: "/" },
      { source: "/about-us", destination: "/about" },
      { source: "/track-order", destination: "/track" },
      { source: "/order/demo", destination: "/track" },
    ]);
    for (const { source, destination } of ALIAS_REDIRECTS) {
      expect(source, "an alias of the prototype's manifest").toSatisfy(
        (s: string) =>
          Object.prototype.hasOwnProperty.call(manifest.aliases, s),
      );
      expect(destination).toMatch(/^\/(about|track)?$/);
      expect(source).not.toBe(destination);
    }
  });

  // Loading next.config.ts pulls in the Sentry build tooling; on a cold runner that first import can exceed
  // Vitest's 5 s default, so this test gets a longer (still bounded) limit.
  it(
    "next.config.ts answers exactly these four, each with status 301, and no other redirect",
    { timeout: 30_000 },
    async () => {
      vi.resetModules();
      const loaded = (await import("../../next.config")).default as
        | NextConfig
        | ((
            phase: string,
            context: { defaultConfig: NextConfig },
          ) => Promise<NextConfig> | NextConfig);
      const config =
        typeof loaded === "function"
          ? await loaded("phase-production-build", { defaultConfig: {} })
          : loaded;
      expect(await config.redirects?.()).toEqual(
        ALIAS_REDIRECTS.map(({ source, destination }) => ({
          source,
          destination,
          statusCode: 301,
        })),
      );
    },
  );
});
