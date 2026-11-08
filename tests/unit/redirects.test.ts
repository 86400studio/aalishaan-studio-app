import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";
import { describe, expect, it, vi } from "vitest";

import { ARTWORK_ROUTES } from "@/content/public/product";
import { ALIAS_REDIRECTS } from "@/lib/redirects";

/**
 * The redirect manifest so far (docs/TECH-ARCHITECTURE.md §3d): the four aliases of the S1.3 route group, from S1.4
 * the prototype's Shop All path and from S1.5 the one legacy nested artwork path — each a 301 to a route the app
 * serves — and nothing of the later groups. `/product` is served, not redirected (S1.5). Hermetic.
 */
const SHIP_ALIAS = {
  source: "/collections/the-age-of-sail/the-ship-behind-the-fog-bell",
  destination: "/artworks/the-ship-behind-the-fog-bell",
};
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

describe("src/lib/redirects.ts — the S1.3 aliases, S1.4's Shop All alias and S1.5's legacy artwork alias", () => {
  it("is exactly the six aliases so far, each pointing at a route the app serves", () => {
    expect(ALIAS_REDIRECTS).toEqual([
      { source: "/home", destination: "/" },
      { source: "/about-us", destination: "/about" },
      { source: "/track-order", destination: "/track" },
      { source: "/order/demo", destination: "/track" },
      { source: "/shop-all", destination: "/shop" },
      SHIP_ALIAS,
    ]);
    for (const { source, destination } of ALIAS_REDIRECTS) {
      expect(source, "an alias of the prototype's manifest").toSatisfy(
        (s: string) =>
          Object.prototype.hasOwnProperty.call(manifest.aliases, s),
      );
      // `/shop` is a destination since S1.4 (the Shop All route), one approved artwork route since S1.5.
      expect(destination).toMatch(
        /^\/(about|track|shop|artworks\/the-ship-behind-the-fog-bell)?$/,
      );
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
    "next.config.ts answers exactly these six, each with status 301, and no other redirect",
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

  it("S1.5's alias leads to an approved, statically generated artwork route, and /product is not redirected", () => {
    expect(ARTWORK_ROUTES.map(({ slug }) => `/artworks/${slug}`)).toContain(
      SHIP_ALIAS.destination,
    );
    expect(manifest.aliases[SHIP_ALIAS.source]).toBe(
      "pages/artworks/the-ship-behind-the-fog-bell/index.html",
    );
    expect(ALIAS_REDIRECTS.map(({ source }) => source)).not.toContain(
      "/product",
    );
    // A redirect source never shadows a served route.
    for (const { source } of ALIAS_REDIRECTS) {
      expect(source).not.toMatch(/^\/artworks\//);
      expect(source).not.toBe("/product");
    }
  });

  it(
    "next.config.ts sends the legacy artwork path to its artwork with status 301; the framework keeps the query",
    { timeout: 30_000 },
    async () => {
      const config = await loadNextConfig();
      const redirects = await config.redirects?.();
      expect(redirects).toContainEqual({ ...SHIP_ALIAS, statusCode: 301 });
      // A plain source (no `:param`, no `has`) and a destination without its own query: Next.js appends the
      // request's query string to such a destination, as it does for /shop-all (catalogue.spec.ts checks that one).
      const ship = redirects?.find(
        ({ source }) => source === SHIP_ALIAS.source,
      );
      expect(ship?.destination).not.toContain("?");
      expect(ship).not.toHaveProperty("has");
    },
  );
});
