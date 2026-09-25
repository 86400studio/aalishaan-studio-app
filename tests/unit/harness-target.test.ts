import type { BrowserContext } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  fetchPreviewEvidence,
  matchPreviewTarget,
  validateCandidateSha,
  validateLocalBaseUrl,
  validatePreviewBaseUrl,
} from "../../scripts/testing/lib/deployment.mjs";
import {
  BASELINE_FIXTURE,
  isAllowedNamespace,
  resetFixtureNamespace,
  seedBaselineFixture,
} from "../../scripts/testing/lib/fixtures.mjs";
import {
  BYPASS_HEADER,
  bypassHeadersFor,
  fetchExact,
  locationOrigin,
  redact,
} from "../../scripts/testing/lib/http.mjs";
import {
  probeIdentity,
  probeProblems,
  resolveTestTarget,
} from "../../scripts/testing/lib/supabase-target.mjs";
import {
  SET_COOKIE_HEADER,
  bootstrapBypassCookie,
  exactRequest,
  parseSetCookie,
} from "../e2e/harness/bypass";
import {
  REPORTER_MARKER,
  assertReporterLoaded,
} from "../e2e/harness/required-projects-reporter";
import { resolveTargetFromEnv } from "../e2e/harness/target";

/**
 * Hermetic guards of the deployed harness (docs/ENVIRONMENT-PARITY.md §10) with synthetic credentials:
 * target validation, deployment-evidence matching, origin-scoped bypass and redirect handling, the bypass
 * cookie bootstrap, the reporter gate, TEST target resolution and probe interpretation, and the fixture
 * skeleton's namespace guard. No network.
 */

const PREVIEW =
  "https://aalishaan-studio-abc123def-86400studios-projects.vercel.app";
const SHA = "0123456789abcdef0123456789abcdef01234567";
const OTHER_SHA = "fedcba9876543210fedcba9876543210fedcba98";
// Low-entropy stand-ins built at run time; no credential-like literal is committed.
const BYPASS = `bypass-${"x".repeat(24)}`;
const TEST_REF = "abcdefghijklmnopqrst";
const PROD_REF = "tsrqponmlkjihgfedcba";
const TEST_URL = `https://${TEST_REF}.supabase.co`;
const PUBLISHABLE = `sb_publishable_${"p".repeat(30)}`;
const SECRET = `sb_secret_${"s".repeat(30)}`;
// The shape of a legacy JWT key (three dot-separated segments starting "eyJ"); not a token.
const LEGACY_JWT = `eyJ${"a".repeat(20)}.eyJ${"b".repeat(20)}.${"c".repeat(20)}`;

const PREVIEW_TARGET = {
  mode: "preview" as const,
  origin: PREVIEW,
  candidateSha: SHA,
  bypassSecret: BYPASS,
};
const LOCAL_TARGET = {
  mode: "local" as const,
  origin: "http://localhost:3000",
  candidateSha: null,
  bypassSecret: null,
};

type FetchCall = { url: string; init: RequestInit | undefined };

function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/** A recording fetch double; `answer` decides the response per call. */
function recordingFetch(
  answer: (
    url: string,
    init: RequestInit | undefined,
  ) => Response | Promise<Response>,
): { fetchImpl: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fetchImpl = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      return answer(url, init);
    },
  );
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

function headersOf(call: FetchCall): Record<string, string> {
  return (call.init?.headers ?? {}) as Record<string, string>;
}

describe("validatePreviewBaseUrl", () => {
  it("accepts an immutable https Vercel deployment origin (trailing slash normalised)", () => {
    expect(validatePreviewBaseUrl(PREVIEW)).toEqual({
      ok: true,
      origin: PREVIEW,
    });
    expect(validatePreviewBaseUrl(`${PREVIEW}/`)).toEqual({
      ok: true,
      origin: PREVIEW,
    });
  });

  it.each([
    [undefined, /not set/],
    ["", /not set/],
    ["not a url", /not a URL/],
    ["http://aalishaan-studio-abc-86400studios-projects.vercel.app", /https/],
    [
      "https://user:pw@aalishaan-studio-abc-86400studios-projects.vercel.app",
      /userinfo/,
    ],
    [`${PREVIEW}/?x-vercel-protection-bypass=${BYPASS}`, /query/],
    [`${PREVIEW}/#frag`, /fragment/],
    [`${PREVIEW}/api/health`, /path/],
    ["https://example.com", /Vercel deployment host/],
    ["https://aalishaan-studio-app.vercel.app", /Production domain/],
    [
      "https://aalishaan-studio-app-git-main-86400studios-projects.vercel.app",
      /branch alias/,
    ],
  ])("rejects %j", (raw, reason) => {
    const result = validatePreviewBaseUrl(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons.join("; ")).toMatch(reason);
      expect(result.reasons.join("; ")).not.toContain(BYPASS);
    }
  });
});

describe("validateLocalBaseUrl / validateCandidateSha", () => {
  it("accepts only loopback http origins", () => {
    expect(validateLocalBaseUrl("http://localhost:3000")).toEqual({
      ok: true,
      origin: "http://localhost:3000",
    });
    expect(validateLocalBaseUrl("http://127.0.0.1:3100/")).toEqual({
      ok: true,
      origin: "http://127.0.0.1:3100",
    });
    for (const bad of [
      "https://localhost:3000",
      "http://evil.example",
      "http://localhost:3000/path",
      "http://localhost:3000/?q",
      PREVIEW,
      undefined,
    ]) {
      expect(validateLocalBaseUrl(bad).ok, String(bad)).toBe(false);
    }
  });

  it("accepts only a full lower-case commit SHA", () => {
    expect(validateCandidateSha(SHA)).toEqual({ ok: true, sha: SHA });
    for (const bad of [
      undefined,
      "",
      "0123456",
      SHA.toUpperCase(),
      `${SHA}0`,
    ]) {
      expect(validateCandidateSha(bad).ok, String(bad)).toBe(false);
    }
  });
});

describe("matchPreviewTarget — the deployment record must agree on SHA, environment and origin", () => {
  const good = {
    id: 1,
    sha: SHA,
    ref: SHA,
    environment: "Preview",
    productionEnvironment: false,
    environmentUrl: `${PREVIEW}/`,
    createdAt: "2026-09-25T00:00:00Z",
  };

  it("matches a successful Preview deployment of the candidate serving the origin", () => {
    const result = matchPreviewTarget({
      origin: PREVIEW,
      sha: SHA,
      evidence: [good],
    });
    expect(result).toEqual({ ok: true, deployment: good });
  });

  it.each([
    ["another commit", { ...good, sha: OTHER_SHA }],
    ["the Production environment", { ...good, environment: "Production" }],
    [
      "a second project's Preview environment",
      { ...good, environment: "Preview – other-project" },
    ],
    ["a production_environment flag", { ...good, productionEnvironment: true }],
    [
      "another deployment URL",
      {
        ...good,
        environmentUrl:
          "https://aalishaan-studio-zzz999-86400studios-projects.vercel.app",
      },
    ],
    ["no successful status", { ...good, environmentUrl: null }],
  ])("refuses %s", (_label, deployment) => {
    const result = matchPreviewTarget({
      origin: PREVIEW,
      sha: SHA,
      evidence: [deployment],
    });
    expect(result.ok).toBe(false);
  });

  it("refuses the Production domain even with matching evidence", () => {
    const production = "https://aalishaan-studio-app.vercel.app";
    expect(
      matchPreviewTarget({
        origin: production,
        sha: SHA,
        evidence: [{ ...good, environmentUrl: production }],
      }).ok,
    ).toBe(false);
  });
});

describe("fetchPreviewEvidence — a read of the GitHub Deployments API only", () => {
  it("queries this repository by SHA and Preview environment, then each deployment's statuses", async () => {
    const { fetchImpl, calls } = recordingFetch((url) =>
      url.includes("/deployments?")
        ? jsonResponse([
            {
              id: 42,
              sha: SHA,
              ref: SHA,
              environment: "Preview",
              production_environment: false,
              created_at: "2026-09-25T00:00:00Z",
            },
          ])
        : jsonResponse([
            { state: "pending", environment_url: "" },
            { state: "success", environment_url: PREVIEW },
          ]),
    );
    const evidence = await fetchPreviewEvidence({ sha: SHA, fetchImpl });
    expect(evidence).toEqual([
      {
        id: 42,
        sha: SHA,
        ref: SHA,
        environment: "Preview",
        productionEnvironment: false,
        environmentUrl: PREVIEW,
        createdAt: "2026-09-25T00:00:00Z",
      },
    ]);
    expect(calls[0].url).toBe(
      `https://api.github.com/repos/86400studio/aalishaan-studio-app/deployments?sha=${SHA}&environment=Preview&per_page=20`,
    );
    expect(calls[1].url).toBe(
      "https://api.github.com/repos/86400studio/aalishaan-studio-app/deployments/42/statuses?per_page=10",
    );
    for (const call of calls) {
      expect(new URL(call.url).origin).toBe("https://api.github.com");
      expect(call.init?.redirect).toBe("manual");
      expect(headersOf(call).authorization).toBeUndefined();
    }
  });

  it("sends a token only as a bearer header when given, and fails on a non-200", async () => {
    const { fetchImpl, calls } = recordingFetch(() =>
      jsonResponse({ message: "forbidden" }, 403),
    );
    await expect(
      fetchPreviewEvidence({ sha: SHA, token: "gh-token-stand-in", fetchImpl }),
    ).rejects.toThrow(/403/);
    expect(headersOf(calls[0]).authorization).toBe("Bearer gh-token-stand-in");
    expect(calls[0].url).not.toContain("gh-token-stand-in");
  });

  it("names the exhausted unauthenticated rate limit and the read-only GITHUB_TOKEN remedy", async () => {
    const { fetchImpl } = recordingFetch(() =>
      jsonResponse({ message: "API rate limit exceeded" }, 403, {
        "x-ratelimit-remaining": "0",
      }),
    );
    await expect(fetchPreviewEvidence({ sha: SHA, fetchImpl })).rejects.toThrow(
      /rate limit[\s\S]*GITHUB_TOKEN/,
    );
  });

  it("refuses to query with anything but a full SHA", async () => {
    const { fetchImpl, calls } = recordingFetch(() => jsonResponse([]));
    await expect(
      fetchPreviewEvidence({ sha: "abc", fetchImpl }),
    ).rejects.toThrow(/full commit SHA/);
    expect(calls).toEqual([]);
  });
});

describe("bypass header scoping", () => {
  it("attaches the secret only to the exact validated origin", () => {
    expect(bypassHeadersFor(`${PREVIEW}/api/health`, PREVIEW, BYPASS)).toEqual({
      [BYPASS_HEADER]: BYPASS,
    });
    for (const url of [
      "https://vercel.com/sso-api?url=x",
      "https://aalishaan-studio-app.vercel.app/",
      `${PREVIEW.replace("https://", "http://")}/`,
      `https://evil.example/${PREVIEW}`,
      "https://aalishaan-studio-abc123def-86400studios-projects.vercel.app.evil.example/",
      "not a url",
    ]) {
      expect(bypassHeadersFor(url, PREVIEW, BYPASS), url).toEqual({});
    }
    expect(bypassHeadersFor(`${PREVIEW}/`, PREVIEW, null)).toEqual({});
  });

  it("fetchExact sends the header to the origin, never follows a redirect and keeps only safe headers", async () => {
    const { fetchImpl, calls } = recordingFetch(
      () =>
        new Response("redirecting", {
          status: 302,
          headers: {
            location: `https://vercel.com/sso-api?url=${encodeURIComponent(PREVIEW)}&nonce=${BYPASS}`,
            "set-cookie": "_vercel_jwt=secret-cookie; HttpOnly",
            "x-robots-tag": "noindex, nofollow",
            "x-vercel-id": "iad1::abc",
          },
        }),
    );
    const result = await fetchExact(`${PREVIEW}/`, {
      origin: PREVIEW,
      bypassSecret: BYPASS,
      fetchImpl,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].init?.redirect).toBe("manual");
    expect(headersOf(calls[0])[BYPASS_HEADER]).toBe(BYPASS);
    expect(result.status).toBe(302);
    expect(result.locationOrigin).toBe("https://vercel.com");
    // Only the security-relevant headers survive (the fake Response adds its own content-type).
    expect(result.headers).toMatchObject({
      "x-robots-tag": "noindex, nofollow",
    });
    for (const dropped of ["set-cookie", "location", "x-vercel-id"]) {
      expect(Object.keys(result.headers), dropped).not.toContain(dropped);
    }
    expect(result.setCookies).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("secret-cookie");
    expect(JSON.stringify(result)).not.toContain(BYPASS);
  });

  it("fetchExact returns Set-Cookie values only when the caller asks for them", async () => {
    const cookie =
      "_vercel_jwt=cookie-stand-in; Path=/; HttpOnly; Secure; SameSite=Lax";
    const { fetchImpl } = recordingFetch(
      () =>
        new Response("", {
          status: 307,
          headers: { location: `${PREVIEW}/`, "set-cookie": cookie },
        }),
    );
    const silent = await fetchExact(`${PREVIEW}/`, {
      origin: PREVIEW,
      fetchImpl,
    });
    expect(silent.setCookies).toEqual([]);
    const kept = await fetchExact(`${PREVIEW}/`, {
      origin: PREVIEW,
      keepSetCookies: true,
      fetchImpl,
    });
    expect(kept.setCookies).toEqual([cookie]);
    expect(kept.headers["set-cookie"]).toBeUndefined();
  });

  it("fetchExact refuses an off-origin URL before any request", async () => {
    const { fetchImpl, calls } = recordingFetch(() => jsonResponse({}));
    await expect(
      fetchExact("https://aalishaan-studio-app.vercel.app/", {
        origin: PREVIEW,
        bypassSecret: BYPASS,
        fetchImpl,
      }),
    ).rejects.toThrow(/outside the validated origin/);
    await expect(
      fetchExact(`${PREVIEW}:444/`, {
        origin: PREVIEW,
        bypassSecret: BYPASS,
        fetchImpl,
      }),
    ).rejects.toThrow();
    expect(calls).toEqual([]);
  });

  it("fetchExact bounds the body it keeps", async () => {
    const { fetchImpl } = recordingFetch(
      () => new Response("y".repeat(10_000), { status: 200 }),
    );
    const result = await fetchExact(`${PREVIEW}/`, {
      origin: PREVIEW,
      maxBodyBytes: 100,
      fetchImpl,
    });
    expect(result.body.length).toBeLessThanOrEqual(100);
    expect(result.body).not.toContain("\u0000");
  });

  it("locationOrigin keeps the origin only", () => {
    expect(
      locationOrigin(`https://vercel.com/sso-api?nonce=${BYPASS}`, PREVIEW),
    ).toBe("https://vercel.com");
    expect(locationOrigin("/relative?x=1", PREVIEW)).toBe(PREVIEW);
    expect(locationOrigin(null, PREVIEW)).toBeNull();
  });

  it("redact replaces every occurrence of every secret", () => {
    expect(
      redact(`a ${BYPASS} b ${SECRET} c ${BYPASS}`, [
        BYPASS,
        SECRET,
        undefined,
        "",
      ]),
    ).toBe("a [redacted] b [redacted] c [redacted]");
  });
});

describe("exactRequest — direct HTTP checks through Node fetch, never Playwright's request context", () => {
  it("adds the header only for the exact origin, never follows redirects and keeps only safe headers", async () => {
    const { fetchImpl, calls } = recordingFetch(() =>
      jsonResponse({ status: "ok" }, 200, { "x-robots-tag": "noindex" }),
    );
    const response = await exactRequest(
      PREVIEW_TARGET,
      "/api/health",
      {},
      fetchImpl,
    );
    expect(response.status).toBe(200);
    expect(response.headers["x-robots-tag"]).toBe("noindex");
    expect(JSON.parse(response.body)).toEqual({ status: "ok" });
    expect(calls[0].url).toBe(`${PREVIEW}/api/health`);
    expect(calls[0].init?.redirect).toBe("manual");
    expect(headersOf(calls[0])[BYPASS_HEADER]).toBe(BYPASS);

    await expect(
      exactRequest(PREVIEW_TARGET, "//evil.example/steal", {}, fetchImpl),
    ).rejects.toThrow(/refusing/);
    await expect(
      exactRequest(
        PREVIEW_TARGET,
        "https://aalishaan-studio-app.vercel.app/",
        {},
        fetchImpl,
      ),
    ).rejects.toThrow(/refusing/);
    expect(calls).toHaveLength(1);

    await exactRequest(
      LOCAL_TARGET,
      "/api/setup-proof",
      { method: "POST", headers: { "content-type": "application/json" } },
      fetchImpl,
    );
    expect(calls[1].url).toBe("http://localhost:3000/api/setup-proof");
    expect(calls[1].init?.method).toBe("POST");
    expect(headersOf(calls[1])[BYPASS_HEADER]).toBeUndefined();
    expect(headersOf(calls[1])["content-type"]).toBe("application/json");
  });

  it("redacts the secret from a transport error instead of echoing request headers", async () => {
    const { fetchImpl } = recordingFetch(() => {
      throw new Error(`connect failed; headers: ${BYPASS_HEADER}=${BYPASS}`);
    });
    let thrown: unknown;
    try {
      await exactRequest(PREVIEW_TARGET, "/", {}, fetchImpl);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain("[redacted]");
    expect((thrown as Error).message).not.toContain(BYPASS);
  });
});

describe("bootstrapBypassCookie — the secret never enters the browser context", () => {
  const VERCEL_COOKIE =
    "_vercel_jwt=cookie-stand-in; Path=/; HttpOnly; Secure; SameSite=Lax";

  function fakeContext() {
    const added: unknown[] = [];
    const addCookies = vi.fn(async (cookies: unknown[]) => {
      added.push(...cookies);
    });
    return {
      context: { addCookies } as unknown as Pick<BrowserContext, "addCookies">,
      added,
      addCookies,
    };
  }

  it("obtains the host-scoped cookie with one Node fetch and adds it to the context", async () => {
    const { fetchImpl, calls } = recordingFetch(
      () =>
        new Response("", {
          status: 307,
          headers: { location: `${PREVIEW}/`, "set-cookie": VERCEL_COOKIE },
        }),
    );
    const { context, added } = fakeContext();
    const result = await bootstrapBypassCookie(
      context,
      PREVIEW_TARGET,
      fetchImpl,
    );
    expect(result).toEqual({ cookies: 1 });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${PREVIEW}/`);
    expect(calls[0].init?.redirect).toBe("manual");
    expect(headersOf(calls[0])[BYPASS_HEADER]).toBe(BYPASS);
    expect(headersOf(calls[0])[SET_COOKIE_HEADER]).toBe("true");
    expect(added).toEqual([
      {
        name: "_vercel_jwt",
        value: "cookie-stand-in",
        url: `${PREVIEW}/`,
        secure: true,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    expect(JSON.stringify(added)).not.toContain(BYPASS);
  });

  it("fails, naming no secret, when the deployment answers without a cookie", async () => {
    const { fetchImpl } = recordingFetch(() => jsonResponse({}, 200));
    const { context, addCookies } = fakeContext();
    let thrown: unknown;
    try {
      await bootstrapBypassCookie(context, PREVIEW_TARGET, fetchImpl);
    } catch (error) {
      thrown = error;
    }
    expect((thrown as Error).message).toMatch(/without a Set-Cookie/);
    expect((thrown as Error).message).not.toContain(BYPASS);
    expect(addCookies).not.toHaveBeenCalled();
  });

  it("does nothing in local mode (no secret, no request)", async () => {
    const { fetchImpl, calls } = recordingFetch(() => jsonResponse({}));
    const { context, addCookies } = fakeContext();
    expect(
      await bootstrapBypassCookie(context, LOCAL_TARGET, fetchImpl),
    ).toEqual({ cookies: 0 });
    expect(calls).toEqual([]);
    expect(addCookies).not.toHaveBeenCalled();
  });

  it("redacts the secret from a transport error", async () => {
    const { fetchImpl } = recordingFetch(() => {
      throw new Error(`tls failure while sending ${BYPASS}`);
    });
    const { context } = fakeContext();
    let thrown: unknown;
    try {
      await bootstrapBypassCookie(context, PREVIEW_TARGET, fetchImpl);
    } catch (error) {
      thrown = error;
    }
    expect((thrown as Error).message).toContain("[redacted]");
    expect((thrown as Error).message).not.toContain(BYPASS);
  });

  it("parseSetCookie reads the name, value and the attributes the bypass cookie uses", () => {
    const before = Math.floor(Date.now() / 1000);
    const parsed = parseSetCookie(`${VERCEL_COOKIE}; Max-Age=3600`);
    expect(parsed).toMatchObject({
      name: "_vercel_jwt",
      value: "cookie-stand-in",
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "Lax",
    });
    expect(parsed?.expires).toBeGreaterThanOrEqual(before + 3600);
    expect(parseSetCookie("a=b; SameSite=None")).toMatchObject({
      sameSite: "None",
      secure: false,
      httpOnly: false,
    });
    expect(parseSetCookie("a=b; SameSite=strict; Path=/x")).toMatchObject({
      sameSite: "Strict",
      path: "/x",
    });
    expect(parseSetCookie("=novalue")).toBeNull();
    expect(parseSetCookie("garbage")).toBeNull();
  });
});

describe("required-projects reporter — a --reporter flag cannot drop the gate silently", () => {
  it("passes once the reporter announced itself, and for a --list run", () => {
    expect(() =>
      assertReporterLoaded({ [REPORTER_MARKER]: true }, [
        "node",
        "playwright",
        "test",
      ]),
    ).not.toThrow();
    expect(() =>
      assertReporterLoaded({}, ["node", "playwright", "test", "--list"]),
    ).not.toThrow();
  });

  it("fails a run in which the reporter never loaded", () => {
    expect(() =>
      assertReporterLoaded({}, [
        "node",
        "playwright",
        "test",
        "--reporter=line",
      ]),
    ).toThrow(/required-projects reporter did not run/);
  });
});

describe("resolveTargetFromEnv — PLAYWRIGHT_BASE_URL has no fallback", () => {
  const preview = {
    PLAYWRIGHT_BASE_URL: PREVIEW,
    PLAYWRIGHT_CANDIDATE_SHA: SHA,
    VERCEL_AUTOMATION_BYPASS_SECRET: BYPASS,
  };

  it("resolves a Preview target", () => {
    expect(resolveTargetFromEnv(preview)).toEqual({
      mode: "preview",
      origin: PREVIEW,
      candidateSha: SHA,
      bypassSecret: BYPASS,
    });
  });

  it.each([
    [
      "no base URL",
      { ...preview, PLAYWRIGHT_BASE_URL: undefined },
      /PLAYWRIGHT_BASE_URL is not set/,
    ],
    [
      "the Production domain",
      {
        ...preview,
        PLAYWRIGHT_BASE_URL: "https://aalishaan-studio-app.vercel.app",
      },
      /Production domain/,
    ],
    [
      "no candidate SHA",
      { ...preview, PLAYWRIGHT_CANDIDATE_SHA: undefined },
      /PLAYWRIGHT_CANDIDATE_SHA is not set/,
    ],
    [
      "no bypass secret",
      { ...preview, VERCEL_AUTOMATION_BYPASS_SECRET: undefined },
      /VERCEL_AUTOMATION_BYPASS_SECRET is not set/,
    ],
    [
      "an unknown mode",
      { ...preview, PLAYWRIGHT_TARGET_MODE: "production" },
      /PLAYWRIGHT_TARGET_MODE/,
    ],
    [
      "local mode with a Preview secret still set",
      {
        PLAYWRIGHT_TARGET_MODE: "local",
        PLAYWRIGHT_BASE_URL: "http://localhost:3000",
        VERCEL_AUTOMATION_BYPASS_SECRET: BYPASS,
      },
      /refuses to run while/,
    ],
    [
      "local mode with a proof token still set",
      {
        PLAYWRIGHT_TARGET_MODE: "local",
        PLAYWRIGHT_BASE_URL: "http://localhost:3000",
        S0_2_PROOF_TOKEN: "t".repeat(40),
      },
      /refuses to run while/,
    ],
    [
      "local mode with a remote URL",
      { PLAYWRIGHT_TARGET_MODE: "local", PLAYWRIGHT_BASE_URL: PREVIEW },
      /loopback|localhost/,
    ],
  ])("throws for %s, naming variables only", (_label, env, message) => {
    let thrown: unknown;
    try {
      resolveTargetFromEnv(env);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(message);
    expect((thrown as Error).message).not.toContain(BYPASS);
  });

  it("resolves a local target without any secret", () => {
    expect(
      resolveTargetFromEnv({
        PLAYWRIGHT_TARGET_MODE: "local",
        PLAYWRIGHT_BASE_URL: "http://localhost:3000/",
      }),
    ).toEqual({
      mode: "local",
      origin: "http://localhost:3000",
      candidateSha: null,
      bypassSecret: null,
    });
  });
});

describe("resolveTestTarget — configured facts, names-only reasons", () => {
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: TEST_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE,
    SUPABASE_SECRET_KEY: SECRET,
    SUPABASE_TEST_PROJECT_REF: TEST_REF,
    SUPABASE_PROD_PROJECT_REF: PROD_REF,
  };

  it("resolves the TEST target", () => {
    expect(resolveTestTarget(env)).toEqual({
      ok: true,
      target: {
        url: TEST_URL,
        ref: TEST_REF,
        testRef: TEST_REF,
        prodRef: PROD_REF,
        publishableKey: PUBLISHABLE,
        secretKey: SECRET,
      },
    });
  });

  it.each([
    [
      "a missing name",
      { ...env, SUPABASE_SECRET_KEY: "" },
      /SUPABASE_SECRET_KEY is not set/,
    ],
    [
      "a URL pointing at PROD",
      { ...env, NEXT_PUBLIC_SUPABASE_URL: `https://${PROD_REF}.supabase.co` },
      /points at SUPABASE_PROD_PROJECT_REF — refused/,
    ],
    [
      "a URL pointing elsewhere",
      {
        ...env,
        NEXT_PUBLIC_SUPABASE_URL: "https://zzzzzzzzzzzzzzzzzzzz.supabase.co",
      },
      /does not point at SUPABASE_TEST_PROJECT_REF/,
    ],
    [
      "equal refs",
      { ...env, SUPABASE_PROD_PROJECT_REF: TEST_REF },
      /must be distinct/,
    ],
    [
      "a malformed ref",
      { ...env, SUPABASE_TEST_PROJECT_REF: "nope" },
      /not a project ref/,
    ],
    [
      "swapped keys",
      {
        ...env,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: SECRET,
        SUPABASE_SECRET_KEY: PUBLISHABLE,
      },
      /not a publishable key[\s\S]*not a secret key/,
    ],
    [
      "a legacy JWT in the secret slot",
      { ...env, SUPABASE_SECRET_KEY: LEGACY_JWT },
      /SUPABASE_SECRET_KEY is not a secret key/,
    ],
    [
      "a legacy JWT in the publishable slot",
      { ...env, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: LEGACY_JWT },
      /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not a publishable key/,
    ],
  ])("refuses %s", (_label, value, reason) => {
    const result = resolveTestTarget(value);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const text = result.reasons.join("; ");
      expect(text).toMatch(reason);
      expect(text).not.toContain(SECRET);
      expect(text).not.toContain(PUBLISHABLE);
      expect(text).not.toContain(LEGACY_JWT);
    }
  });
});

describe("probeIdentity / probeProblems — statuses only, never bodies", () => {
  const target = {
    url: TEST_URL,
    ref: TEST_REF,
    testRef: TEST_REF,
    prodRef: PROD_REF,
    publishableKey: PUBLISHABLE,
    secretKey: SECRET,
  };

  function fakeFetch(plan: Record<string, { status: number; body?: unknown }>) {
    const seen: FetchCall[] = [];
    const fetchImpl = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        seen.push({ url, init });
        const key = new URL(url).pathname + new URL(url).search;
        const keyHeader = (init?.headers as Record<string, string>).apikey;
        const entry =
          plan[`${key}|${keyHeader === SECRET ? "secret" : "public"}`] ??
          plan[key];
        if (!entry) return new Response("nope", { status: 500 });
        return jsonResponse(entry.body ?? {}, entry.status);
      },
    );
    return { fetchImpl: fetchImpl as unknown as typeof fetch, seen };
  }

  it("reports both keys accepted, auth healthy, baseline present and the anonymous read denied", async () => {
    const { fetchImpl, seen } = fakeFetch({
      "/rest/v1/": {
        status: 200,
        body: { openapi: "3.0", paths: { "/system_checks": {} } },
      },
      "/auth/v1/health": { status: 200, body: { name: "GoTrue" } },
      "/rest/v1/system_checks?select=id&limit=1|secret": {
        status: 200,
        body: [{ id: "row-1" }],
      },
      "/rest/v1/system_checks?select=id&limit=1|public": {
        status: 401,
        body: { code: "42501" },
      },
    });
    const probe = await probeIdentity(target, { fetchImpl });
    expect(probe).toMatchObject({
      publicKeyAccepted: true,
      secretKeyAccepted: true,
      authHealthy: true,
      baseline: "present",
      anonRead: { status: 401, rows: null },
    });
    expect(JSON.stringify(probe)).not.toContain("row-1");
    expect(JSON.stringify(probe)).not.toContain("GoTrue");
    expect(probeProblems(probe)).toEqual([]);
    for (const call of seen) {
      expect(new URL(call.url).origin).toBe(TEST_URL);
      expect(call.init?.redirect).toBe("manual");
      expect(call.init?.method).toBe("GET");
    }
  });

  it("proves the publishable key on the auth health endpoint, not on the secret-only REST root", async () => {
    // The gateway answers "Secret API key required" to a publishable key on /rest/v1/ (verified live
    // 2026-09-25); that must not read as a rejected key.
    const { fetchImpl } = fakeFetch({
      "/rest/v1/|public": {
        status: 401,
        body: { message: "Secret API key required" },
      },
      "/rest/v1/|secret": { status: 200 },
      "/auth/v1/health": { status: 200 },
      "/rest/v1/system_checks?select=id&limit=1|secret": { status: 404 },
      "/rest/v1/system_checks?select=id&limit=1|public": { status: 404 },
    });
    const probe = await probeIdentity(target, { fetchImpl });
    expect(probe.publicKeyAccepted).toBe(true);
    expect(probe.secretKeyAccepted).toBe(true);
    expect(probe.authHealthy).toBe(true);
    expect(probeProblems(probe, { requireBaseline: false })).toEqual([]);
  });

  it("names the publishable key when the auth endpoint rejects it while the secret key is healthy", async () => {
    const { fetchImpl } = fakeFetch({
      "/rest/v1/": { status: 200 },
      "/auth/v1/health|public": {
        status: 401,
        body: { message: "Invalid API key" },
      },
      "/auth/v1/health|secret": { status: 200 },
      "/rest/v1/system_checks?select=id&limit=1|secret": {
        status: 200,
        body: [],
      },
      "/rest/v1/system_checks?select=id&limit=1|public": { status: 401 },
    });
    const probe = await probeIdentity(target, { fetchImpl });
    expect(probe.publicKeyAccepted).toBe(false);
    expect(probe.authHealthy).toBe(true);
    const problems = probeProblems(probe).join("; ");
    expect(problems).toMatch(
      /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not accepted/,
    );
    expect(problems).not.toMatch(/Auth health/);
  });

  it("reports an absent baseline (404) and a rejected key (401) with names-only problems", async () => {
    const { fetchImpl } = fakeFetch({
      "/rest/v1/|public": { status: 200 },
      "/rest/v1/|secret": { status: 401 },
      "/auth/v1/health": { status: 200 },
      "/rest/v1/system_checks?select=id&limit=1|secret": {
        status: 404,
        body: { code: "PGRST205" },
      },
      "/rest/v1/system_checks?select=id&limit=1|public": { status: 404 },
    });
    const probe = await probeIdentity(target, { fetchImpl });
    expect(probe.baseline).toBe("absent");
    expect(probe.secretKeyAccepted).toBe(false);
    const problems = probeProblems(probe);
    expect(problems.join("; ")).toMatch(/SUPABASE_SECRET_KEY is not accepted/);
    expect(problems.join("; ")).toMatch(/system_checks is absent/);
    expect(
      probeProblems(probe, { requireBaseline: false }).join("; "),
    ).not.toMatch(/absent/);
  });

  it("flags an anonymous read that returns rows as an RLS failure", async () => {
    const { fetchImpl } = fakeFetch({
      "/rest/v1/": { status: 200 },
      "/auth/v1/health": { status: 200 },
      "/rest/v1/system_checks?select=id&limit=1|secret": {
        status: 200,
        body: [{ id: 1 }],
      },
      "/rest/v1/system_checks?select=id&limit=1|public": {
        status: 200,
        body: [{ id: 1 }],
      },
    });
    const probe = await probeIdentity(target, { fetchImpl });
    expect(probe.anonRead).toEqual({ status: 200, rows: 1 });
    expect(probeProblems(probe).join("; ")).toMatch(/RLS or grants are wrong/);
  });

  it("treats an empty anonymous result as denied (RLS-filtered), not as a failure", async () => {
    const { fetchImpl } = fakeFetch({
      "/rest/v1/": { status: 200 },
      "/auth/v1/health": { status: 200 },
      "/rest/v1/system_checks?select=id&limit=1|secret": {
        status: 200,
        body: [],
      },
      "/rest/v1/system_checks?select=id&limit=1|public": {
        status: 200,
        body: [],
      },
    });
    const probe = await probeIdentity(target, { fetchImpl });
    expect(probe.anonRead).toEqual({ status: 200, rows: 0 });
    expect(probeProblems(probe)).toEqual([]);
  });
});

describe("fixture skeleton guards (D-22)", () => {
  function fakeClient() {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const chain: Record<string, unknown> = {};
    for (const method of [
      "from",
      "select",
      "insert",
      "upsert",
      "delete",
      "eq",
      "like",
      "abortSignal",
    ]) {
      chain[method] = (...args: unknown[]) => {
        calls.push({ method, args });
        return chain;
      };
    }
    chain.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: [{ id: 1 }], error: null }).then(resolve);
    return { client: chain as unknown as SupabaseClient, calls };
  }

  it("allows only the three S0.2 namespaces", () => {
    expect(
      ["fixture:", "integration:", "s0-2-proof:"].every(isAllowedNamespace),
    ).toBe(true);
    expect(
      ["public:", "", "fixture", "orders:", "%"].some(isAllowedNamespace),
    ).toBe(false);
  });

  it("the reset refuses another namespace or an unsafe scope before touching the client", async () => {
    const { client, calls } = fakeClient();
    await expect(resetFixtureNamespace(client, "orders:")).rejects.toThrow(
      /not an S0\.2 fixture namespace/,
    );
    await expect(
      resetFixtureNamespace(client, "fixture:", { scope: "%" }),
    ).rejects.toThrow(/scope/);
    await expect(
      resetFixtureNamespace(client, "fixture:", { scope: "a_b" }),
    ).rejects.toThrow(/scope/);
    expect(calls).toEqual([]);
  });

  it("the reset deletes only synthetic rows inside the namespace and scope", async () => {
    const { client, calls } = fakeClient();
    const result = await resetFixtureNamespace(client, "fixture:", {
      scope: "run-1-",
    });
    expect(result).toEqual({ ok: true, deleted: 1, code: null });
    expect(calls.map((call) => call.method)).toEqual([
      "from",
      "delete",
      "eq",
      "like",
      "select",
      "abortSignal",
    ]);
    expect(calls[2].args).toEqual(["synthetic", true]);
    expect(calls[3].args).toEqual(["check_key", "fixture:run-1-%"]);
  });

  it("the seed upserts exactly the fixed baseline row on check_key", async () => {
    const { client, calls } = fakeClient();
    const result = await seedBaselineFixture(client);
    expect(result).toEqual({ ok: true, count: 1, code: null });
    expect(calls.map((call) => call.method)).toEqual([
      "from",
      "upsert",
      "select",
      "abortSignal",
    ]);
    expect(calls[1].args).toEqual([
      { ...BASELINE_FIXTURE },
      { onConflict: "check_key" },
    ]);
    expect(BASELINE_FIXTURE.check_key).toMatch(/^fixture:/);
    expect(BASELINE_FIXTURE.synthetic).toBe(true);
  });
});
