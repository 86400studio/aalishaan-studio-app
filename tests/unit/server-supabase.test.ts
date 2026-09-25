import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The real factory and validation run; only the SDK constructor is replaced.
const sdk = vi.hoisted(() => ({
  createClient: vi.fn(() => ({ kind: "fake-client" })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient: sdk.createClient }));

import * as serverModule from "@/lib/server/supabase";
import {
  createPrivilegedClient,
  readServerSupabaseEnv,
  resolveServerIdentity,
} from "@/lib/server/supabase";
import type { ServerSupabaseEnv } from "@/lib/supabase/config";

const TEST_REF = "abcdefghijklmnopqrst";
const PROD_REF = "tsrqponmlkjihgfedcba";
const TEST_URL = `https://${TEST_REF}.supabase.co`;
const PROD_URL = `https://${PROD_REF}.supabase.co`;
const SECRET = `sb_secret_${"s".repeat(30)}`;
const PUBLISHABLE = `sb_publishable_${"p".repeat(30)}`;
// The shape of a legacy JWT key (three dot-separated segments starting "eyJ"); not a token.
const LEGACY_JWT = `eyJ${"a".repeat(20)}.eyJ${"b".repeat(20)}.${"c".repeat(20)}`;

const PREVIEW_TEST_IDENTITY = {
  url: TEST_URL,
  projectRef: TEST_REF,
  context: "preview",
  expectedRef: TEST_REF,
  testRef: TEST_REF,
  prodRef: PROD_REF,
};

function env(overrides: Partial<ServerSupabaseEnv> = {}): ServerSupabaseEnv {
  return {
    NEXT_PUBLIC_SUPABASE_URL: TEST_URL,
    SUPABASE_SECRET_KEY: SECRET,
    SUPABASE_TEST_PROJECT_REF: TEST_REF,
    SUPABASE_PROD_PROJECT_REF: PROD_REF,
    VERCEL_ENV: "preview",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("src/lib/server/supabase.ts — the privileged client factory", () => {
  it("creates nothing at import time and exports only functions (no shared singleton, no re-export)", () => {
    expect(sdk.createClient).not.toHaveBeenCalled();
    for (const [name, value] of Object.entries(serverModule)) {
      expect(typeof value, name).toBe("function");
    }
  });

  it("creates a session-less client from a valid TEST configuration in a Preview and returns the identity without the secret", () => {
    const result = createPrivilegedClient(env());
    expect(result.ok).toBe(true);
    expect(sdk.createClient).toHaveBeenCalledTimes(1);
    const [url, key, options] = sdk.createClient.mock.calls[0] as unknown[];
    expect(url).toBe(TEST_URL);
    expect(key).toBe(SECRET);
    expect(options).toEqual({
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    if (result.ok) {
      expect(result.identity).toEqual(PREVIEW_TEST_IDENTITY);
      expect(Object.keys(result).sort()).toEqual(["client", "identity", "ok"]);
      expect(Object.keys(result.identity)).not.toContain("secretKey");
      expect(JSON.stringify(result)).not.toContain(SECRET);
    }
  });

  it("creates a PROD client only in Production", () => {
    const result = createPrivilegedClient(
      env({ VERCEL_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: PROD_URL }),
    );
    expect(result.ok).toBe(true);
    expect(sdk.createClient).toHaveBeenCalledWith(
      PROD_URL,
      SECRET,
      expect.anything(),
    );
    if (result.ok) {
      expect(result.identity.context).toBe("production");
      expect(result.identity.projectRef).toBe(PROD_REF);
      expect(result.identity.expectedRef).toBe(PROD_REF);
    }
  });

  it("creates a new client per call — never a cached instance", () => {
    createPrivilegedClient(env());
    createPrivilegedClient(env());
    expect(sdk.createClient).toHaveBeenCalledTimes(2);
  });

  it.each([
    [
      "Production pointed at TEST",
      env({ VERCEL_ENV: "production" }),
      "identity_mismatch",
    ],
    [
      "a Preview pointed at PROD",
      env({ NEXT_PUBLIC_SUPABASE_URL: PROD_URL }),
      "identity_mismatch",
    ],
    ["an unknown context", env({ VERCEL_ENV: "staging" }), "unknown_context"],
    [
      "equal refs",
      env({ SUPABASE_PROD_PROJECT_REF: TEST_REF }),
      "refs_not_distinct",
    ],
    [
      "no secret key",
      env({ SUPABASE_SECRET_KEY: undefined }),
      "not_configured",
    ],
    ["no URL", env({ NEXT_PUBLIC_SUPABASE_URL: undefined }), "not_configured"],
    [
      "no TEST ref",
      env({ SUPABASE_TEST_PROJECT_REF: undefined }),
      "not_configured",
    ],
    [
      "no PROD ref",
      env({ SUPABASE_PROD_PROJECT_REF: undefined }),
      "not_configured",
    ],
    [
      "a publishable key in the secret slot",
      env({ SUPABASE_SECRET_KEY: PUBLISHABLE }),
      "invalid_key",
    ],
    [
      "a legacy JWT in the secret slot",
      env({ SUPABASE_SECRET_KEY: LEGACY_JWT }),
      "invalid_key",
    ],
    [
      "a URL with a path",
      env({ NEXT_PUBLIC_SUPABASE_URL: `${TEST_URL}/rest/v1` }),
      "invalid_url",
    ],
  ])("refuses %s with %s and creates no client", (_label, value, reason) => {
    expect(createPrivilegedClient(value)).toEqual({ ok: false, reason });
    expect(resolveServerIdentity(value)).toEqual({ ok: false, reason });
    expect(sdk.createClient).not.toHaveBeenCalled();
  });

  it("reads exactly the server names from process.env, nothing else", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", TEST_URL);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", PUBLISHABLE);
    vi.stubEnv("SUPABASE_SECRET_KEY", SECRET);
    vi.stubEnv("SUPABASE_TEST_PROJECT_REF", TEST_REF);
    vi.stubEnv("SUPABASE_PROD_PROJECT_REF", PROD_REF);
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(readServerSupabaseEnv()).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: TEST_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE,
      SUPABASE_SECRET_KEY: SECRET,
      SUPABASE_TEST_PROJECT_REF: TEST_REF,
      SUPABASE_PROD_PROJECT_REF: PROD_REF,
      VERCEL_ENV: "preview",
    });
  });

  it("reports not_configured from an empty environment (credential-free build and Code Check)", () => {
    for (const name of [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_SECRET_KEY",
      "SUPABASE_TEST_PROJECT_REF",
      "SUPABASE_PROD_PROJECT_REF",
      "VERCEL_ENV",
    ])
      vi.stubEnv(name, undefined);
    expect(createPrivilegedClient()).toEqual({
      ok: false,
      reason: "not_configured",
    });
    expect(resolveServerIdentity()).toEqual({
      ok: false,
      reason: "not_configured",
    });
    expect(sdk.createClient).not.toHaveBeenCalled();
  });
});

describe("resolveServerIdentity — the identity facts without any client", () => {
  it("returns the identity of a valid configuration and constructs nothing", () => {
    expect(resolveServerIdentity(env())).toEqual({
      ok: true,
      identity: PREVIEW_TEST_IDENTITY,
    });
    expect(sdk.createClient).not.toHaveBeenCalled();
  });

  it("never carries the secret", () => {
    const result = resolveServerIdentity(env());
    expect(JSON.stringify(result)).not.toContain(SECRET);
    if (result.ok)
      expect(Object.keys(result.identity).sort()).toEqual([
        "context",
        "expectedRef",
        "prodRef",
        "projectRef",
        "testRef",
        "url",
      ]);
  });

  it("reads process.env by default", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", PROD_URL);
    vi.stubEnv("SUPABASE_SECRET_KEY", SECRET);
    vi.stubEnv("SUPABASE_TEST_PROJECT_REF", TEST_REF);
    vi.stubEnv("SUPABASE_PROD_PROJECT_REF", PROD_REF);
    vi.stubEnv("VERCEL_ENV", "production");
    expect(resolveServerIdentity()).toEqual({
      ok: true,
      identity: {
        url: PROD_URL,
        projectRef: PROD_REF,
        context: "production",
        expectedRef: PROD_REF,
        testRef: TEST_REF,
        prodRef: PROD_REF,
      },
    });
    expect(sdk.createClient).not.toHaveBeenCalled();
  });
});
