import { describe, expect, it } from "vitest";

import {
  PUBLISHABLE_KEY_PREFIX,
  SECRET_KEY_PREFIX,
  browserConfig,
  deploymentContext,
  identityOf,
  isPreviewTestTarget,
  projectRefFromUrl,
  serverConfig,
  type ServerConfig,
  type ServerIdentity,
  type ServerSupabaseEnv,
} from "@/lib/supabase/config";

const TEST_REF = "abcdefghijklmnopqrst";
const PROD_REF = "tsrqponmlkjihgfedcba";
const TEST_URL = `https://${TEST_REF}.supabase.co`;
const PROD_URL = `https://${PROD_REF}.supabase.co`;
// Low-entropy stand-ins built at run time; no credential-like literal is committed.
const PUBLISHABLE = `sb_publishable_${"p".repeat(30)}`;
const SECRET = `sb_secret_${"s".repeat(30)}`;
// The shape of a legacy JWT key (three dot-separated segments starting "eyJ"); not a token.
const LEGACY_JWT = `eyJ${"a".repeat(20)}.eyJ${"b".repeat(20)}.${"c".repeat(20)}`;

function previewEnv(
  overrides: Partial<ServerSupabaseEnv> = {},
): ServerSupabaseEnv {
  return {
    NEXT_PUBLIC_SUPABASE_URL: TEST_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE,
    SUPABASE_SECRET_KEY: SECRET,
    SUPABASE_TEST_PROJECT_REF: TEST_REF,
    SUPABASE_PROD_PROJECT_REF: PROD_REF,
    VERCEL_ENV: "preview",
    ...overrides,
  };
}

describe("projectRefFromUrl", () => {
  it.each([
    [TEST_URL, TEST_REF],
    [`${TEST_URL}/`, TEST_REF],
  ])("accepts %s", (url, ref) => {
    expect(projectRefFromUrl(url)).toBe(ref);
  });

  it.each([
    [undefined],
    [""],
    ["   "],
    ["not a url"],
    [`http://${TEST_REF}.supabase.co`],
    [`https://user:secret@${TEST_REF}.supabase.co`],
    [`${TEST_URL}/rest/v1`],
    [`${TEST_URL}?apikey=x`],
    [`${TEST_URL}#fragment`],
    ["https://abc.supabase.co"],
    [`https://${TEST_REF}.supabase.co.evil.example`],
    [`https://${TEST_REF}.example.com`],
    [`https://evil.example/${TEST_REF}.supabase.co`],
  ])("rejects %j", (url) => {
    expect(projectRefFromUrl(url)).toBeNull();
  });
});

describe("deploymentContext", () => {
  it.each([
    [undefined, "development"],
    ["", "development"],
    ["development", "development"],
    ["preview", "preview"],
    ["production", "production"],
    ["Production", "unknown"],
    ["staging", "unknown"],
  ])("maps VERCEL_ENV=%j to %s", (value, expected) => {
    expect(deploymentContext(value)).toBe(expected);
  });
});

describe("key shapes — current-format keys only, never decoded", () => {
  it("documents the two prefixes", () => {
    expect(PUBLISHABLE_KEY_PREFIX).toBe("sb_publishable_");
    expect(SECRET_KEY_PREFIX).toBe("sb_secret_");
  });
});

describe("browserConfig (public values only)", () => {
  it("accepts the two public values and normalises the URL to its origin", () => {
    const result = browserConfig({
      NEXT_PUBLIC_SUPABASE_URL: `${TEST_URL}/`,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE,
    });
    expect(result).toEqual({
      ok: true,
      config: {
        url: TEST_URL,
        publishableKey: PUBLISHABLE,
        projectRef: TEST_REF,
      },
    });
  });

  it.each([
    [
      "no URL",
      { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE },
      "not_configured",
    ],
    ["no key", { NEXT_PUBLIC_SUPABASE_URL: TEST_URL }, "not_configured"],
    [
      "a blank key",
      {
        NEXT_PUBLIC_SUPABASE_URL: TEST_URL,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: " ",
      },
      "not_configured",
    ],
    [
      "a non-Supabase URL",
      {
        NEXT_PUBLIC_SUPABASE_URL: "https://example.com",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE,
      },
      "invalid_url",
    ],
    [
      "a secret key behind the public name",
      {
        NEXT_PUBLIC_SUPABASE_URL: TEST_URL,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: SECRET,
      },
      "invalid_key",
    ],
    [
      "a legacy JWT behind the public name",
      {
        NEXT_PUBLIC_SUPABASE_URL: TEST_URL,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: LEGACY_JWT,
      },
      "invalid_key",
    ],
    [
      "an arbitrary string behind the public name",
      {
        NEXT_PUBLIC_SUPABASE_URL: TEST_URL,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-but-not-a-key",
      },
      "invalid_key",
    ],
  ])("reports %s as %s", (_label, env, reason) => {
    expect(browserConfig(env)).toEqual({ ok: false, reason });
  });
});

describe("serverConfig (fail closed)", () => {
  it("accepts TEST in a Preview and expects the TEST ref", () => {
    const result = serverConfig(previewEnv());
    expect(result).toEqual({
      ok: true,
      config: {
        url: TEST_URL,
        secretKey: SECRET,
        projectRef: TEST_REF,
        context: "preview",
        expectedRef: TEST_REF,
        testRef: TEST_REF,
        prodRef: PROD_REF,
      },
    });
  });

  it("accepts TEST in a local process (no VERCEL_ENV) as development", () => {
    const result = serverConfig(previewEnv({ VERCEL_ENV: undefined }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.context).toBe("development");
  });

  it("accepts PROD in Production and expects the PROD ref", () => {
    const result = serverConfig(
      previewEnv({
        VERCEL_ENV: "production",
        NEXT_PUBLIC_SUPABASE_URL: PROD_URL,
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.projectRef).toBe(PROD_REF);
      expect(result.config.expectedRef).toBe(PROD_REF);
      expect(result.config.context).toBe("production");
    }
  });

  it.each([
    [
      "Production pointed at TEST",
      previewEnv({ VERCEL_ENV: "production" }),
      "identity_mismatch",
    ],
    [
      "a Preview pointed at PROD",
      previewEnv({ NEXT_PUBLIC_SUPABASE_URL: PROD_URL }),
      "identity_mismatch",
    ],
    [
      "a local process pointed at PROD",
      previewEnv({ VERCEL_ENV: undefined, NEXT_PUBLIC_SUPABASE_URL: PROD_URL }),
      "identity_mismatch",
    ],
    [
      "a URL pointing at a third project",
      previewEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://zzzzzzzzzzzzzzzzzzzz.supabase.co",
      }),
      "identity_mismatch",
    ],
    [
      "an unknown deployment context",
      previewEnv({ VERCEL_ENV: "staging" }),
      "unknown_context",
    ],
    [
      "equal refs",
      previewEnv({ SUPABASE_PROD_PROJECT_REF: TEST_REF }),
      "refs_not_distinct",
    ],
    [
      "a malformed TEST ref",
      previewEnv({ SUPABASE_TEST_PROJECT_REF: "abc" }),
      "not_configured",
    ],
    [
      "a malformed PROD ref",
      previewEnv({ SUPABASE_PROD_PROJECT_REF: "ABCDEFGHIJKLMNOPQRST" }),
      "not_configured",
    ],
    [
      "an invalid URL",
      previewEnv({ NEXT_PUBLIC_SUPABASE_URL: `${TEST_URL}/rest/v1` }),
      "invalid_url",
    ],
    [
      "a publishable key in the secret slot",
      previewEnv({ SUPABASE_SECRET_KEY: PUBLISHABLE }),
      "invalid_key",
    ],
    [
      "a legacy JWT in the secret slot",
      previewEnv({ SUPABASE_SECRET_KEY: LEGACY_JWT }),
      "invalid_key",
    ],
  ])("refuses %s with %s", (_label, env, reason) => {
    expect(serverConfig(env)).toEqual({ ok: false, reason });
  });

  it.each([
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_TEST_PROJECT_REF",
    "SUPABASE_PROD_PROJECT_REF",
  ] as const)("reports not_configured when %s is missing or blank", (name) => {
    expect(serverConfig(previewEnv({ [name]: undefined }))).toEqual({
      ok: false,
      reason: "not_configured",
    });
    expect(serverConfig(previewEnv({ [name]: "  " }))).toEqual({
      ok: false,
      reason: "not_configured",
    });
  });

  it("never needs the publishable key on the server", () => {
    expect(
      serverConfig(
        previewEnv({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined }),
      ).ok,
    ).toBe(true);
  });
});

describe("identityOf — the facts without the secret", () => {
  it("copies exactly the identity fields and never the key", () => {
    const result = serverConfig(previewEnv());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const identity = identityOf(result.config);
    expect(identity).toEqual({
      url: TEST_URL,
      projectRef: TEST_REF,
      context: "preview",
      expectedRef: TEST_REF,
      testRef: TEST_REF,
      prodRef: PROD_REF,
    });
    expect(Object.keys(identity)).not.toContain("secretKey");
    expect(JSON.stringify(identity)).not.toContain(SECRET);
  });

  it("does not pass extra fields through", () => {
    const config = {
      url: TEST_URL,
      secretKey: SECRET,
      projectRef: TEST_REF,
      context: "preview",
      expectedRef: TEST_REF,
      testRef: TEST_REF,
      prodRef: PROD_REF,
      extra: SECRET,
    } as ServerConfig & { extra: string };
    expect(Object.keys(identityOf(config)).sort()).toEqual([
      "context",
      "expectedRef",
      "prodRef",
      "projectRef",
      "testRef",
      "url",
    ]);
  });
});

describe("isPreviewTestTarget", () => {
  function identity(overrides: Partial<ServerIdentity>): ServerIdentity {
    return {
      url: TEST_URL,
      projectRef: TEST_REF,
      context: "preview",
      expectedRef: TEST_REF,
      testRef: TEST_REF,
      prodRef: PROD_REF,
      ...overrides,
    };
  }

  it("is true only for TEST inside a Preview", () => {
    expect(isPreviewTestTarget(identity({}))).toBe(true);
  });

  it.each([
    ["a local process", identity({ context: "development" })],
    [
      "Production on PROD",
      identity({
        context: "production",
        projectRef: PROD_REF,
        expectedRef: PROD_REF,
        url: PROD_URL,
      }),
    ],
    ["a Preview whose URL is PROD", identity({ projectRef: PROD_REF })],
    ["equal refs", identity({ prodRef: TEST_REF })],
  ])("is false for %s", (_label, value) => {
    expect(isPreviewTestTarget(value)).toBe(false);
  });
});
