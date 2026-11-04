import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";
import { describe, expect, it, vi } from "vitest";

import { ALIAS_REDIRECTS } from "@/lib/redirects";

/**
 * The redirect manifest so far (docs/TECH-ARCHITECTURE.md §3d): the four aliases of the S1.3 route group and, from
 * S1.4, the prototype's Shop All path — each a 301 to a route the app serves — and nothing of the later groups (the
 * legacy nested artwork alias is S1.5's). Hermetic.
 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const manifest = JSON.parse(
  readFileSync(path.join(ROOT, "prototype/site-manifest.json"), "utf8"),
) as { aliases: Record<string, string> };

/** next.config.ts as the framework loads it — an object or a function of the phase. */
async function loadNextConfig(): Promise<NextConfig> {
  vi.resetModules();
  const loaded = (await import("../../next.config")).default as
    | NextConfig
    | ((
        phase: string,
        context: { defaultConfig: NextConfig },
      ) => Promise<NextConfig> | NextConfig);
  return typeof loaded === "function"
    ? await loaded("phase-production-build", { defaultConfig: {} })
    : loaded;
}

describe("src/lib/redirects.ts — the S1.3 aliases and S1.4's Shop All alias", () => {
  it("is exactly the five aliases so far, each pointing at a route the app serves", () => {
    expect(ALIAS_REDIRECTS).toEqual([
      { source: "/home", destination: "/" },
      { source: "/about-us", destination: "/about" },
      { source: "/track-order", destination: "/track" },
      { source: "/order/demo", destination: "/track" },
      { source: "/shop-all", destination: "/shop" },
    ]);
    for (const { source, destination } of ALIAS_REDIRECTS) {
      expect(source, "an alias of the prototype's manifest").toSatisfy(
        (s: string) =>
          Object.prototype.hasOwnProperty.call(manifest.aliases, s),
      );
      // `/shop` is a destination since S1.4 (the Shop All route).
      expect(destination).toMatch(/^\/(about|track|shop)?$/);
      expect(source).not.toBe(destination);
    }
  });

  it("each duplicate leads to the route serving the same prototype page; /order/demo is D-09's nearest honest page", () => {
    for (const { source, destination } of ALIAS_REDIRECTS) {
      if (source === "/order/demo") continue;
      expect(manifest.aliases[destination], source).toBe(
        manifest.aliases[source],
      );
    }
    expect(manifest.aliases["/order/demo"]).not.toBe(
      manifest.aliases["/track"],
    );
  });

  // Loading next.config.ts pulls in the Sentry build tooling; on a cold runner that first import can exceed
  // Vitest's 5 s default, so these tests get a longer (still bounded) limit.
  it(
    "next.config.ts answers exactly these five, each with status 301, and no other redirect",
    { timeout: 30_000 },
    async () => {
      const config = await loadNextConfig();
      expect(await config.redirects?.()).toEqual(
        ALIAS_REDIRECTS.map(({ source, destination }) => ({
          source,
          destination,
          statusCode: 301,
        })),
      );
    },
  );

  it(
    "next.config.ts sends /shop-all to /shop with status 301 (S1.4)",
    { timeout: 30_000 },
    async () => {
      const config = await loadNextConfig();
      expect(await config.redirects?.()).toContainEqual({
        source: "/shop-all",
        destination: "/shop",
        statusCode: 301,
      });
    },
  );
});
