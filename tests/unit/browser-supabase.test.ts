import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The real factories and validation run; only the SDK constructor is replaced.
const sdk = vi.hoisted(() => ({
  createClient: vi.fn(() => ({ kind: "fake-client" })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient: sdk.createClient }));

import {
  PUBLIC_CLIENT_SERVER_OPTIONS,
  defaultDependencies,
} from "@/lib/server/health";
import { createPrivilegedClient } from "@/lib/server/supabase";
import {
  createBrowserSupabaseClient,
  readPublicSupabaseEnv,
} from "@/lib/supabase/browser";

const TEST_REF = "abcdefghijklmnopqrst";
const TEST_URL = `https://${TEST_REF}.supabase.co`;
// Low-entropy stand-ins built at run time; no credential-like literal is committed.
const PUBLISHABLE = `sb_publishable_${"p".repeat(30)}`;
const SECRET = `sb_secret_${"s".repeat(30)}`;
const LEGACY_JWT = `eyJ${"a".repeat(20)}.eyJ${"b".repeat(20)}.${"c".repeat(20)}`;

const PUBLIC_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: TEST_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE,
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("src/lib/supabase/browser.ts — the public client factory", () => {
  it("creates the client from the two public values and forwards no options by default", () => {
    const result = createBrowserSupabaseClient(PUBLIC_ENV);
    expect(result.ok).toBe(true);
    expect(sdk.createClient).toHaveBeenCalledTimes(1);
    expect(sdk.createClient).toHaveBeenCalledWith(
      TEST_URL,
      PUBLISHABLE,
      undefined,
    );
    if (result.ok) expect(result.projectRef).toBe(TEST_REF);
  });

  it("forwards client options unchanged (the server passes the session-less trio)", () => {
    createBrowserSupabaseClient(PUBLIC_ENV, PUBLIC_CLIENT_SERVER_OPTIONS);
    const [url, key, options] = sdk.createClient.mock.calls[0] as unknown[];
    expect(url).toBe(TEST_URL);
    expect(key).toBe(PUBLISHABLE);
    expect(options).toBe(PUBLIC_CLIENT_SERVER_OPTIONS);
  });

  it.each([
    [
      "a secret key behind the public name",
      { ...PUBLIC_ENV, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: SECRET },
      "invalid_key",
    ],
    [
      "a legacy JWT behind the public name",
      { ...PUBLIC_ENV, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: LEGACY_JWT },
      "invalid_key",
    ],
    [
      "a URL with a path",
      { ...PUBLIC_ENV, NEXT_PUBLIC_SUPABASE_URL: `${TEST_URL}/rest/v1` },
      "invalid_url",
    ],
    ["nothing configured", {}, "not_configured"],
  ])("refuses %s with %s and creates no client", (_label, env, reason) => {
    expect(createBrowserSupabaseClient(env)).toEqual({ ok: false, reason });
    expect(sdk.createClient).not.toHaveBeenCalled();
  });

  it("reads exactly the two public names from process.env", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", TEST_URL);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", PUBLISHABLE);
    vi.stubEnv("SUPABASE_SECRET_KEY", SECRET);
    expect(readPublicSupabaseEnv()).toEqual(PUBLIC_ENV);
  });
});

describe("GET /api/health wiring — this build's public client on the server", () => {
  it("passes the session-less trio, so no auto-refresh ticker is left behind per call", () => {
    expect(PUBLIC_CLIENT_SERVER_OPTIONS).toEqual({
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  });

  it("builds the public client through the browser factory over the process.env public values with those options", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", TEST_URL);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", PUBLISHABLE);
    const deps = defaultDependencies();
    expect(deps.createClient).toBe(createPrivilegedClient);
    const result = deps.createPublicClient();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.projectRef).toBe(TEST_REF);
    expect(sdk.createClient).toHaveBeenCalledTimes(1);
    expect(sdk.createClient).toHaveBeenCalledWith(
      TEST_URL,
      PUBLISHABLE,
      PUBLIC_CLIENT_SERVER_OPTIONS,
    );
  });

  it("reports public_not_configured material when the public pair is absent, creating nothing", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", undefined);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", undefined);
    expect(defaultDependencies().createPublicClient()).toEqual({
      ok: false,
      reason: "not_configured",
    });
    expect(sdk.createClient).not.toHaveBeenCalled();
  });
});
