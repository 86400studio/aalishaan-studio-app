import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import * as route from "@/app/api/setup-proof/route";
import {
  FIXED_ROW,
  MARKER_PATTERN,
  MAX_BODY_BYTES,
  MIN_TOKEN_LENGTH,
  handleSetupProof,
  isAuthorized,
  parseProofRequest,
  type SetupProofDependencies,
} from "@/lib/server/setup-proof";
import type {
  IdentityResult,
  PrivilegedClientResult,
} from "@/lib/server/supabase";
import type { ServerIdentity } from "@/lib/supabase/config";

const TEST_REF = "abcdefghijklmnopqrst";
const PROD_REF = "tsrqponmlkjihgfedcba";
const TEST_URL = `https://${TEST_REF}.supabase.co`;
const PROD_URL = `https://${PROD_REF}.supabase.co`;
// Low-entropy stand-ins built at run time; no credential-like literal is committed.
const CONFIGURED = "a".repeat(48);
const SAME_LENGTH_WRONG = "b".repeat(48);
const MARKER = "s0-2-proof:abcdef0123456789";
const URL_UNDER_TEST = "https://preview.example.test/api/setup-proof";

const PREVIEW_TEST: ServerIdentity = {
  url: TEST_URL,
  projectRef: TEST_REF,
  context: "preview",
  expectedRef: TEST_REF,
  testRef: TEST_REF,
  prodRef: PROD_REF,
};

type Call = { method: string; args: unknown[] };
type Outcome = {
  data: unknown;
  error: { code: string; message: string } | null;
};

function fakeClient(outcome: Outcome | (() => Promise<Outcome>)): {
  client: SupabaseClient;
  calls: Call[];
} {
  const calls: Call[] = [];
  const chain: Record<string, unknown> = {};
  for (const method of [
    "from",
    "select",
    "insert",
    "update",
    "upsert",
    "delete",
    "eq",
    "like",
    "limit",
    "abortSignal",
  ]) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    };
  }
  chain.then = (
    resolve: (value: unknown) => unknown,
    reject: (reason: unknown) => unknown,
  ) =>
    (typeof outcome === "function" ? outcome() : Promise.resolve(outcome)).then(
      resolve,
      reject,
    );
  return { client: chain as unknown as SupabaseClient, calls };
}

type Deps = SetupProofDependencies & {
  resolveIdentity: ReturnType<typeof vi.fn>;
  createClient: ReturnType<typeof vi.fn>;
};

/** The identity a factory result implies, so the two dependencies agree unless a test says otherwise. */
function resolvedFrom(created: PrivilegedClientResult): IdentityResult {
  return created.ok ? { ok: true, identity: created.identity } : created;
}

function deps(
  created: PrivilegedClientResult,
  env: SetupProofDependencies["env"] = {
    VERCEL_ENV: "preview",
    S0_2_PROOF_TOKEN: CONFIGURED,
  },
  resolved: IdentityResult = resolvedFrom(created),
): Deps {
  return {
    env,
    resolveIdentity: vi.fn(() => resolved),
    createClient: vi.fn(() => created),
  };
}

function okDeps(
  outcome: Outcome | (() => Promise<Outcome>) = {
    data: [{ id: "r" }],
    error: null,
  },
) {
  const { client, calls } = fakeClient(outcome);
  return { d: deps({ ok: true, client, identity: PREVIEW_TEST }), calls };
}

function post(
  init: {
    headers?: Record<string, string>;
    body?: string | null;
    method?: string;
    url?: string;
  } = {},
): Request {
  const headers: Record<string, string> = {
    authorization: `Bearer ${CONFIGURED}`,
    "content-type": "application/json",
    ...(init.headers ?? {}),
  };
  for (const [name, value] of Object.entries(headers))
    if (value === "") delete headers[name];
  return new Request(init.url ?? URL_UNDER_TEST, {
    method: init.method ?? "POST",
    headers,
    body:
      init.body === null
        ? undefined
        : (init.body ?? JSON.stringify({ action: "read", marker: MARKER })),
  });
}

/** A denial: generic 404, uncached, and neither dependency was even consulted. */
async function expectDenied(response: Response, d: Deps): Promise<void> {
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ status: "not_found" });
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(d.resolveIdentity).not.toHaveBeenCalled();
  expect(d.createClient).not.toHaveBeenCalled();
}

describe("POST /api/setup-proof — allowed (Preview, exact token, TEST target)", () => {
  it("create inserts exactly the fixed row carrying the marker, bounded, and answers created", async () => {
    const { d, calls } = okDeps();
    const response = await handleSetupProof(
      post({ body: JSON.stringify({ action: "create", marker: MARKER }) }),
      d,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "created",
      marker: MARKER,
    });
    expect(calls.map((call) => call.method)).toEqual([
      "from",
      "insert",
      "select",
      "abortSignal",
    ]);
    expect(calls[0].args).toEqual(["system_checks"]);
    expect(calls[1].args).toEqual([{ check_key: MARKER, ...FIXED_ROW }]);
    expect(calls[3].args[0]).toBeInstanceOf(AbortSignal);
    // The identity is decided before any client exists; each dependency is consulted exactly once.
    expect(d.resolveIdentity).toHaveBeenCalledTimes(1);
    expect(d.createClient).toHaveBeenCalledTimes(1);
    expect(d.resolveIdentity.mock.invocationCallOrder[0]).toBeLessThan(
      d.createClient.mock.invocationCallOrder[0],
    );
  });

  it("read answers found from a bounded select scoped to the marker and synthetic rows", async () => {
    for (const [data, found] of [
      [[{ id: "r" }], true],
      [[], false],
    ] as const) {
      const { d, calls } = okDeps({ data, error: null });
      const response = await handleSetupProof(post(), d);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        status: "read",
        marker: MARKER,
        found,
      });
      expect(calls.map((call) => call.method)).toEqual([
        "from",
        "select",
        "eq",
        "eq",
        "limit",
        "abortSignal",
      ]);
      expect(calls[2].args).toEqual(["check_key", MARKER]);
      expect(calls[3].args).toEqual(["synthetic", true]);
      expect(calls[4].args).toEqual([1]);
    }
  });

  it("cleanup deletes only the synthetic row with exactly this marker and reports the count", async () => {
    for (const [data, deleted] of [
      [[{ id: "r" }], 1],
      [[], 0],
    ] as const) {
      const { d, calls } = okDeps({ data, error: null });
      const response = await handleSetupProof(
        post({ body: JSON.stringify({ action: "cleanup", marker: MARKER }) }),
        d,
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        status: "cleaned",
        marker: MARKER,
        deleted,
      });
      expect(calls.map((call) => call.method)).toEqual([
        "from",
        "delete",
        "eq",
        "eq",
        "select",
        "abortSignal",
      ]);
      expect(calls[2].args).toEqual(["check_key", MARKER]);
      expect(calls[3].args).toEqual(["synthetic", true]);
    }
  });

  it("create with a duplicate marker answers 409 exists", async () => {
    const { d } = okDeps({
      data: null,
      error: { code: "23505", message: "duplicate key" },
    });
    const response = await handleSetupProof(
      post({ body: JSON.stringify({ action: "create", marker: MARKER }) }),
      d,
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ status: "exists", marker: MARKER });
  });

  it("a database error answers 503 db_error without the upstream message", async () => {
    const { d } = okDeps({
      data: null,
      error: {
        code: "42501",
        message: "permission denied for table system_checks",
      },
    });
    const response = await handleSetupProof(post(), d);
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ status: "db_error" });
    expect(text).not.toContain("permission denied");
  });

  it("a thrown query answers 503 db_error", async () => {
    const { d } = okDeps(() => Promise.reject(new Error("AbortError")));
    const response = await handleSetupProof(post(), d);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "db_error" });
  });

  it('an aborted query in postgrest-js\'s real shape (error code "", status 0) answers 503 db_error', async () => {
    // postgrest-js never rejects unless throwOnError(): an abort resolves with an empty-code error.
    const { d, calls } = okDeps({
      data: null,
      error: { code: "", message: "AbortError: The operation was aborted" },
    });
    const response = await handleSetupProof(post(), d);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "db_error" });
    expect(calls.at(-1)?.method).toBe("abortSignal");
  });

  it("ignores query-string and extra header content", async () => {
    const { d, calls } = okDeps();
    const response = await handleSetupProof(
      post({
        url: `${URL_UNDER_TEST}?marker=injected&table=orders`,
        headers: { "x-table": "orders" },
      }),
      d,
    );
    expect(response.status).toBe(200);
    expect(JSON.stringify(calls)).not.toContain("injected");
    expect(JSON.stringify(calls)).not.toContain("orders");
  });
});

describe("POST /api/setup-proof — denied before any client, network or database operation", () => {
  it.each([
    ["production"],
    ["development"],
    [undefined],
    [""],
    ["staging"],
    ["Preview"],
  ])("VERCEL_ENV=%j is denied even with the exact token", async (vercelEnv) => {
    const { client, calls } = fakeClient({ data: [], error: null });
    const d = deps(
      { ok: true, client, identity: PREVIEW_TEST },
      { VERCEL_ENV: vercelEnv, S0_2_PROOF_TOKEN: CONFIGURED },
    );
    await expectDenied(await handleSetupProof(post(), d), d);
    expect(calls).toEqual([]);
  });

  it.each([
    ["no Authorization header", { authorization: "" }],
    ["an empty Bearer credential", { authorization: "Bearer " }],
    ["the scheme without a credential", { authorization: "Bearer" }],
    ["a lower-case scheme", { authorization: `bearer ${CONFIGURED}` }],
    ["another scheme", { authorization: `Basic ${CONFIGURED}` }],
    ["two spaces after the scheme", { authorization: `Bearer  ${CONFIGURED}` }],
    ["a tab after the scheme", { authorization: `Bearer\t${CONFIGURED}` }],
    [
      "extra text after the token",
      { authorization: `Bearer ${CONFIGURED} extra` },
    ],
    [
      "a wrong token of the same length",
      { authorization: `Bearer ${SAME_LENGTH_WRONG}` },
    ],
    [
      "a prefix of the token",
      { authorization: `Bearer ${CONFIGURED.slice(0, -1)}` },
    ],
    [
      "the token plus one character",
      { authorization: `Bearer ${CONFIGURED}a` },
    ],
    [
      "the token in another header",
      { authorization: "", "x-proof-token": CONFIGURED },
    ],
  ])("denies %s", async (_label, headers) => {
    const { d, calls } = okDeps();
    await expectDenied(await handleSetupProof(post({ headers }), d), d);
    expect(calls).toEqual([]);
  });

  it("denies a token passed in the query string", async () => {
    const { d } = okDeps();
    await expectDenied(
      await handleSetupProof(
        post({
          headers: { authorization: "" },
          url: `${URL_UNDER_TEST}?token=${CONFIGURED}`,
        }),
        d,
      ),
      d,
    );
  });

  it.each([[undefined], [""], ["c".repeat(MIN_TOKEN_LENGTH - 1)]])(
    "denies every request when the configured token is %j (unset, empty or short)",
    async (configured) => {
      const { client, calls } = fakeClient({ data: [], error: null });
      const d = deps(
        { ok: true, client, identity: PREVIEW_TEST },
        { VERCEL_ENV: "preview", S0_2_PROOF_TOKEN: configured },
      );
      await expectDenied(
        await handleSetupProof(
          post({
            headers: { authorization: `Bearer ${configured ?? "undefined"}` },
          }),
          d,
        ),
        d,
      );
      await expectDenied(await handleSetupProof(post(), d), d);
      expect(calls).toEqual([]);
    },
  );

  it("never echoes the configured or presented token", async () => {
    const { d } = okDeps();
    const response = await handleSetupProof(
      post({ headers: { authorization: `Bearer ${SAME_LENGTH_WRONG}` } }),
      d,
    );
    const body = await response.text();
    expect(body).not.toContain(CONFIGURED);
    expect(body).not.toContain(SAME_LENGTH_WRONG);
  });

  it.each(["GET", "HEAD", "PUT", "PATCH", "DELETE", "OPTIONS"])(
    "refuses %s with 405 even with the token",
    async (method) => {
      const { d, calls } = okDeps();
      const response = await handleSetupProof(
        new Request(URL_UNDER_TEST, {
          method,
          headers: { authorization: `Bearer ${CONFIGURED}` },
        }),
        d,
      );
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("POST");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(d.resolveIdentity).not.toHaveBeenCalled();
      expect(d.createClient).not.toHaveBeenCalled();
      expect(calls).toEqual([]);
    },
  );

  it("exports POST as the route's only method handler, dynamic and on the Node runtime", () => {
    for (const method of ["GET", "HEAD", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
      expect(route).not.toHaveProperty(method);
    }
    expect(typeof route.POST).toBe("function");
    expect(route.dynamic).toBe("force-dynamic");
    expect(route.runtime).toBe("nodejs");
  });

  it("the real route denies without VERCEL_ENV=preview, touching nothing", async () => {
    vi.stubEnv("VERCEL_ENV", undefined);
    vi.stubEnv("S0_2_PROOF_TOKEN", CONFIGURED);
    const response = await route.POST(post());
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ status: "not_found" });
    vi.unstubAllEnvs();
  });
});

describe("POST /api/setup-proof — invalid input after authentication is rejected without I/O", () => {
  it.each([
    ["a non-JSON content type", { headers: { "content-type": "text/plain" } }],
    ["no content type", { headers: { "content-type": "" } }],
    ["a malformed JSON body", { body: "{" }],
    ["an empty body", { body: "" }],
    ["an array body", { body: "[]" }],
    [
      "an unknown action",
      { body: JSON.stringify({ action: "drop", marker: MARKER }) },
    ],
    ["a missing marker", { body: JSON.stringify({ action: "read" }) }],
    [
      "an extra key",
      {
        body: JSON.stringify({
          action: "read",
          marker: MARKER,
          table: "orders",
        }),
      },
    ],
    [
      "a marker outside the namespace",
      {
        body: JSON.stringify({ action: "cleanup", marker: "fixture:baseline" }),
      },
    ],
    [
      "a marker with a wildcard",
      { body: JSON.stringify({ action: "cleanup", marker: "s0-2-proof:%" }) },
    ],
    [
      "a marker with SQL-ish characters",
      {
        body: JSON.stringify({
          action: "read",
          marker: "s0-2-proof:abc' or 1=1",
        }),
      },
    ],
    [
      "an upper-case marker",
      {
        body: JSON.stringify({ action: "read", marker: "s0-2-proof:ABCDEFGH" }),
      },
    ],
    [
      "a non-string action",
      { body: JSON.stringify({ action: 1, marker: MARKER }) },
    ],
  ])("rejects %s with 400 invalid_request", async (_label, init) => {
    const { d, calls } = okDeps();
    const response = await handleSetupProof(post(init), d);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ status: "invalid_request" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(d.resolveIdentity).not.toHaveBeenCalled();
    expect(d.createClient).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it("rejects an oversized declared body", async () => {
    const { d, calls } = okDeps();
    const response = await handleSetupProof(
      post({ headers: { "content-length": String(MAX_BODY_BYTES + 1) } }),
      d,
    );
    expect(response.status).toBe(400);
    expect(d.resolveIdentity).not.toHaveBeenCalled();
    expect(d.createClient).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it("rejects an oversized streamed body", async () => {
    const { d, calls } = okDeps();
    const padded = JSON.stringify({
      action: "read",
      marker: MARKER,
      pad: "x".repeat(MAX_BODY_BYTES),
    });
    const response = await handleSetupProof(post({ body: padded }), d);
    expect(response.status).toBe(400);
    expect(d.resolveIdentity).not.toHaveBeenCalled();
    expect(d.createClient).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });
});

describe("POST /api/setup-proof — the target must be TEST inside a Preview", () => {
  const refused: Array<[string, IdentityResult]> = [
    [
      "a configuration failure",
      { ok: false as const, reason: "not_configured" as const },
    ],
    [
      "a Production configuration on PROD",
      {
        ok: true as const,
        identity: {
          ...PREVIEW_TEST,
          context: "production" as const,
          url: PROD_URL,
          projectRef: PROD_REF,
          expectedRef: PROD_REF,
        },
      },
    ],
    [
      "a development context on TEST",
      {
        ok: true as const,
        identity: { ...PREVIEW_TEST, context: "development" as const },
      },
    ],
    [
      "a Preview whose URL is PROD",
      {
        ok: true as const,
        identity: { ...PREVIEW_TEST, url: PROD_URL, projectRef: PROD_REF },
      },
    ],
    [
      "equal refs",
      { ok: true as const, identity: { ...PREVIEW_TEST, prodRef: TEST_REF } },
    ],
  ];

  it.each(refused)(
    "answers 503 target_unavailable for %s from the identity alone: no client is built and no query runs",
    async (_label, resolved) => {
      const { client, calls } = fakeClient({ data: [], error: null });
      const d = deps(
        { ok: true, client, identity: PREVIEW_TEST },
        undefined,
        resolved,
      );
      const response = await handleSetupProof(
        post({ body: JSON.stringify({ action: "create", marker: MARKER }) }),
        d,
      );
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ status: "target_unavailable" });
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(d.resolveIdentity).toHaveBeenCalledTimes(1);
      expect(d.createClient).not.toHaveBeenCalled();
      expect(calls).toEqual([]);
    },
  );

  it.each(refused)(
    "answers 503 target_unavailable when the factory itself reports %s after a good identity, and runs no query",
    async (_label, resolved) => {
      const { client, calls } = fakeClient({ data: [], error: null });
      const created: PrivilegedClientResult = resolved.ok
        ? { ok: true, client, identity: resolved.identity }
        : resolved;
      const d = deps(created, undefined, { ok: true, identity: PREVIEW_TEST });
      const response = await handleSetupProof(
        post({ body: JSON.stringify({ action: "create", marker: MARKER }) }),
        d,
      );
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ status: "target_unavailable" });
      expect(d.createClient).toHaveBeenCalledTimes(1);
      expect(calls).toEqual([]);
    },
  );
});

describe("pure guards", () => {
  it("MARKER_PATTERN accepts only the namespace plus 8–32 lower-case alphanumerics", () => {
    expect(MARKER_PATTERN.test(MARKER)).toBe(true);
    for (const bad of [
      "s0-2-proof:",
      "s0-2-proof:abc",
      "s0-2-proof:ABCDEFGH",
      "fixture:abcdefgh",
      `s0-2-proof:${"a".repeat(33)}`,
      "s0-2-proof:abcd_efgh",
      " s0-2-proof:abcdefgh",
    ]) {
      expect(MARKER_PATTERN.test(bad), bad).toBe(false);
    }
  });

  it("parseProofRequest accepts exactly {action, marker}", () => {
    expect(
      parseProofRequest(JSON.stringify({ action: "create", marker: MARKER })),
    ).toEqual({ action: "create", marker: MARKER });
    expect(
      parseProofRequest(JSON.stringify({ marker: MARKER, action: "cleanup" })),
    ).toEqual({ action: "cleanup", marker: MARKER });
    expect(parseProofRequest("null")).toBeNull();
    expect(parseProofRequest('"string"')).toBeNull();
    expect(
      parseProofRequest(
        JSON.stringify({ action: "read", marker: MARKER, extra: 1 }),
      ),
    ).toBeNull();
  });

  it("isAuthorized never throws on malformed or unequal-length input", () => {
    expect(isAuthorized(`Bearer ${CONFIGURED}`, CONFIGURED)).toBe(true);
    expect(isAuthorized(`Bearer ${CONFIGURED.slice(0, 10)}`, CONFIGURED)).toBe(
      false,
    );
    expect(isAuthorized(null, CONFIGURED)).toBe(false);
    expect(isAuthorized("Bearer \u0000", CONFIGURED)).toBe(false);
    expect(isAuthorized(`Bearer ${CONFIGURED}`, undefined)).toBe(false);
    expect(isAuthorized(`Bearer ${"c".repeat(31)}`, "c".repeat(31))).toBe(
      false,
    );
  });
});
