import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import type { NextConfig } from "next";
import { afterEach, describe, expect, it, vi } from "vitest";

import { metadata } from "@/app/layout";
import robots from "@/app/robots";
import {
  HOLDING_NOINDEX_HEADER,
  contentSecurityPolicy,
  securityHeaders,
  sentryIngestOrigin,
} from "@/lib/security-headers";

const SIX_HEADERS = [
  "content-security-policy",
  "strict-transport-security",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
];
const EXAMPLE_DSN = "https://examplepublickey@o123456.ingest.us.sentry.io/7890";
const EXAMPLE_INGEST_ORIGIN = "https://o123456.ingest.us.sentry.io";

function parsePolicy(policy: string): Map<string, string[]> {
  const parsed = new Map<string, string[]>();
  for (const part of policy.split(";")) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (!name) continue;
    expect(parsed.has(name), `duplicate directive ${name}`).toBe(false);
    parsed.set(name, sources);
  }
  return parsed;
}

async function loadNextConfig(
  env: Record<string, string | undefined>,
): Promise<NextConfig> {
  vi.resetModules();
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
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

afterEach(() => {
  vi.unstubAllEnvs();
});

// Loading next.config.ts pulls in the Sentry build tooling; on a cold runner that first import can exceed
// Vitest's 5 s default, so these tests get a longer (still bounded) limit.
describe(
  "next.config.ts applies the headers to every response",
  { timeout: 30_000 },
  () => {
    it("has one rule whose source Next.js matches for pages, APIs, static files and missing paths", async () => {
      const config = await loadNextConfig({
        NEXT_PUBLIC_SENTRY_DSN: EXAMPLE_DSN,
      });
      const rules = (await config.headers?.()) ?? [];
      expect(rules).toHaveLength(1);

      // The matcher and options Next.js itself uses for custom headers (server/lib/router-utils/filesystem.js).
      const matches = getPathMatch(rules[0].source, {
        strict: true,
        removeUnnamedParams: true,
      });
      for (const path of [
        "/",
        "/api/health",
        "/api/setup-proof",
        "/robots.txt",
        "/favicon.ico",
        "/_next/static/chunks/main.js",
        "/does-not-exist",
        "/deeply/nested/missing/page",
      ]) {
        expect(matches(path), path).not.toBe(false);
      }
      expect(rules[0].has).toBeUndefined();
      expect(rules[0].missing).toBeUndefined();

      const names = rules[0].headers.map((header) => header.key.toLowerCase());
      expect(new Set(names).size).toBe(names.length);
      for (const required of [...SIX_HEADERS, "x-robots-tag"])
        expect(names).toContain(required);

      const csp = rules[0].headers.find(
        (h) => h.key.toLowerCase() === "content-security-policy",
      );
      const connect = parsePolicy(csp?.value ?? "").get("connect-src");
      expect(connect).toEqual(["'self'", EXAMPLE_INGEST_ORIGIN]);
    });

    it.each([
      ["production", "production"],
      ["preview", "preview"],
      ["development", "development"],
      [undefined, "development"],
      ["staging", "development"],
    ])(
      "tags browser events from VERCEL_ENV=%s as %s, whatever NODE_ENV says",
      async (vercelEnv, expected) => {
        const config = await loadNextConfig({
          VERCEL_ENV: vercelEnv,
          NODE_ENV: "production",
        });
        expect(config.env?.NEXT_PUBLIC_SENTRY_ENVIRONMENT).toBe(expected);
      },
    );
  },
);

describe("Content-Security-Policy", () => {
  it("blocks eval in production builds and allows it only for next dev", () => {
    const production = parsePolicy(contentSecurityPolicy());
    const development = parsePolicy(
      contentSecurityPolicy({ isDevelopment: true }),
    );
    expect(production.get("script-src")).not.toContain("'unsafe-eval'");
    expect(development.get("script-src")).toContain("'unsafe-eval'");
    for (const [name, sources] of development) {
      if (name !== "script-src") expect(sources).not.toContain("'unsafe-eval'");
    }
  });

  it("denies plugins, framing, base-tag hijacking and foreign form targets", () => {
    const policy = parsePolicy(
      contentSecurityPolicy({ sentryDsn: EXAMPLE_DSN }),
    );
    expect(policy.get("default-src")).toEqual(["'self'"]);
    expect(policy.get("object-src")).toEqual(["'none'"]);
    expect(policy.get("frame-ancestors")).toEqual(["'none'"]);
    expect(policy.get("base-uri")).toEqual(["'self'"]);
    expect(policy.get("form-action")).toEqual(["'self'"]);
    expect(policy.has("upgrade-insecure-requests")).toBe(true);
  });

  it("has no wildcard or scheme-wide source", () => {
    for (const options of [
      {},
      { sentryDsn: EXAMPLE_DSN },
      { isDevelopment: true },
    ]) {
      for (const [name, sources] of parsePolicy(
        contentSecurityPolicy(options),
      )) {
        for (const source of sources) {
          expect(source, `${name} ${source}`).not.toContain("*");
          expect(
            ["http:", "https:", "ws:", "wss:", "data:", "blob:"],
            `${name} ${source}`,
          ).not.toContain(source);
        }
      }
    }
  });

  it("names no third-party origin except the configured Sentry ingest origin", () => {
    const withoutDsn = contentSecurityPolicy();
    expect(withoutDsn).not.toMatch(/https?:\/\//);
    expect(parsePolicy(withoutDsn).get("connect-src")).toEqual(["'self'"]);

    const withDsn = contentSecurityPolicy({ sentryDsn: EXAMPLE_DSN });
    expect(withDsn.match(/https?:\/\/[^\s;]+/g)).toEqual([
      EXAMPLE_INGEST_ORIGIN,
    ]);
    // Only the origin is exposed: never the DSN's key or project path.
    expect(withDsn).not.toContain("examplepublickey");
    expect(withDsn).not.toContain("/7890");
  });

  it.each([
    [undefined],
    [""],
    ["not a url"],
    ["http://examplepublickey@o123456.ingest.us.sentry.io/7890"],
    ["javascript:alert(1)"],
    ["data:text/plain,hello"],
  ])("adds no connect-src origin for the unusable DSN %j", (dsn) => {
    expect(sentryIngestOrigin(dsn)).toBeNull();
    expect(
      parsePolicy(contentSecurityPolicy({ sentryDsn: dsn })).get("connect-src"),
    ).toEqual(["'self'"]);
  });
});

describe("the other five headers", () => {
  const byName = new Map(
    securityHeaders({ sentryDsn: EXAMPLE_DSN }).map((h) => [
      h.key.toLowerCase(),
      h.value,
    ]),
  );

  it("returns exactly the six required headers", () => {
    expect([...byName.keys()].sort()).toEqual([...SIX_HEADERS].sort());
  });

  it("keeps HTTPS for at least a year, including subdomains", () => {
    const hsts = byName.get("strict-transport-security") ?? "";
    const maxAge = Number(/max-age=(\d+)/.exec(hsts)?.[1]);
    expect(maxAge).toBeGreaterThanOrEqual(31_536_000);
    expect(hsts).toMatch(/includeSubDomains/);
  });

  it("forbids framing and MIME sniffing and limits the referrer to the origin cross-site", () => {
    expect(byName.get("x-frame-options")).toBe("DENY");
    expect(byName.get("x-content-type-options")).toBe("nosniff");
    expect([
      "no-referrer",
      "same-origin",
      "strict-origin",
      "strict-origin-when-cross-origin",
    ]).toContain(byName.get("referrer-policy"));
  });

  it("switches off powerful browser features the holding page never uses", () => {
    const features = new Map(
      (byName.get("permissions-policy") ?? "").split(",").map((entry) => {
        const [feature, allowlist] = entry.trim().split("=");
        return [feature, allowlist] as const;
      }),
    );
    for (const feature of ["camera", "microphone", "geolocation", "payment"]) {
      expect(features.get(feature), feature).toBe("()");
    }
  });

  it("marks the holding state noindex", () => {
    expect(HOLDING_NOINDEX_HEADER.key.toLowerCase()).toBe("x-robots-tag");
    expect(HOLDING_NOINDEX_HEADER.value).toMatch(/noindex/);
  });

  it("keeps pages noindex without hiding that from crawlers in robots.txt", () => {
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
    for (const rule of [robots().rules].flat()) {
      expect([rule.disallow ?? []].flat()).not.toContain("/");
    }
  });
});
