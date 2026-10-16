import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

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

  it("next.config.ts applies them as permanent redirects with the configured status", () => {
    const config = readFileSync(path.join(ROOT, "next.config.ts"), "utf8");
    expect(config).toMatch(
      /import \{ ALIAS_REDIRECTS \} from "\.\/src\/lib\/redirects"/,
    );
    expect(config).toMatch(/async redirects\(\)/);
    expect(config).toMatch(/statusCode: 301/);
    expect(config).not.toMatch(/permanent: (true|false)/);
  });
});
