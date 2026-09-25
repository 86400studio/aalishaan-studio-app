import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import * as route from "@/app/api/health/route";
import {
  HEALTH_QUERY_TIMEOUT_MS,
  checkHealth,
  classifyPublicRead,
  handleHealth,
  type HealthDependencies,
} from "@/lib/server/health";
import type { PrivilegedClientResult } from "@/lib/server/supabase";
import type { BrowserClientResult } from "@/lib/supabase/browser";
import type { ServerIdentity } from "@/lib/supabase/config";

const TEST_REF = "abcdefghijklmnopqrst";
const PROD_REF = "tsrqponmlkjihgfedcba";
const TEST_URL = `https://${TEST_REF}.supabase.co`;
const SECRET = `sb_secret_${"s".repeat(30)}`;
const PUBLISHABLE = `sb_publishable_${"p".repeat(30)}`;
const URL_UNDER_TEST = "https://preview.example.test/api/health";

const IDENTITY: ServerIdentity = {
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
  error: { code?: string; message: string } | null;
  status?: number;
};

/** A thenable query chain that records every call; the same object is returned at every step. */
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

/** The privileged read on a table holding one row. */
const ONE_ROW: Outcome = { data: [{ id: "row-1" }], error: null, status: 200 };
/** The privileged read on an empty baseline table. */
const NO_ROW: Outcome = { data: [], error: null, status: 200 };
/** The public read the baseline promises: permission denied at the table. */
const PUBLIC_DENIED: Outcome = {
  data: null,
  error: {
    code: "42501",
    message: "permission denied for table system_checks",
  },
  status: 401,
};

type Deps = HealthDependencies & {
  createClient: ReturnType<typeof vi.fn>;
  createPublicClient: ReturnType<typeof vi.fn>;
};

function deps(
  created: PrivilegedClientResult,
  pub?: BrowserClientResult,
): Deps {
  const fallback: BrowserClientResult = {
    ok: true,
    client: fakeClient(PUBLIC_DENIED).client,
    projectRef: TEST_REF,
  };
  return {
    createClient: vi.fn(() => created),
    createPublicClient: vi.fn((): BrowserClientResult => pub ?? fallback),
  };
}

function privilegedOk(outcome: Outcome = ONE_ROW) {
  const { client, calls } = fakeClient(outcome);
  return { created: { ok: true as const, client, identity: IDENTITY }, calls };
}

function publicOk(outcome: Outcome | (() => Promise<Outcome>)) {
  const { client, calls } = fakeClient(outcome);
  return { pub: { ok: true as const, client, projectRef: TEST_REF }, calls };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("checkHealth — the privileged read", () => {
  it("is ok when the read succeeds with zero rows: an empty baseline is healthy (the public read is permission-denied)", async () => {
    const { created, calls } = privilegedOk(NO_ROW);
    const result = await checkHealth(deps(created));
    expect(result).toEqual({ status: "ok" });
    expect(calls.map((call) => call.method)).toEqual([
      "from",
      "select",
      "limit",
      "abortSignal",
    ]);
    expect(calls[0].args).toEqual(["system_checks"]);
    expect(calls[1].args).toEqual(["id"]);
    expect(calls[2].args).toEqual([1]);
    expect(calls[3].args[0]).toBeInstanceOf(AbortSignal);
    expect(HEALTH_QUERY_TIMEOUT_MS).toBeLessThanOrEqual(5000);
  });

  it("is ok with rows and returns none of them", async () => {
    const { created } = privilegedOk({
      data: [{ id: "row-1", check_key: "fixture:baseline" }],
      error: null,
    });
    const result = await checkHealth(deps(created));
    expect(result).toEqual({ status: "ok" });
    expect(JSON.stringify(result)).not.toContain("row-1");
  });

  it.each([["PGRST205"], ["42P01"]])(
    "reports schema_missing for error code %s and never reaches the public client",
    async (code) => {
      const { created } = privilegedOk({
        data: null,
        error: { code, message: "relation missing (upstream text)" },
      });
      const d = deps(created);
      expect(await checkHealth(d)).toEqual({
        status: "unavailable",
        reason: "schema_missing",
      });
      expect(d.createPublicClient).not.toHaveBeenCalled();
    },
  );

  it("reports query_failed for any other error, never the upstream message", async () => {
    const { created } = privilegedOk({
      data: null,
      error: { code: "42501", message: "permission denied for table" },
    });
    expect(await checkHealth(deps(created))).toEqual({
      status: "unavailable",
      reason: "query_failed",
    });
  });

  it("reports query_failed when the query throws or times out", async () => {
    const { client } = fakeClient(() =>
      Promise.reject(new Error("AbortError")),
    );
    expect(
      await checkHealth(deps({ ok: true, client, identity: IDENTITY })),
    ).toEqual({ status: "unavailable", reason: "query_failed" });
  });

  it.each([
    ["not_configured", "not_configured"],
    ["invalid_url", "not_configured"],
    ["invalid_key", "not_configured"],
    ["unknown_context", "not_configured"],
    ["refs_not_distinct", "identity_mismatch"],
    ["identity_mismatch", "identity_mismatch"],
  ] as const)(
    "maps the configuration failure %s to %s and runs no query, public or privileged",
    async (reason, expected) => {
      const d = deps({ ok: false, reason });
      expect(await checkHealth(d)).toEqual({
        status: "unavailable",
        reason: expected,
      });
      expect(d.createPublicClient).not.toHaveBeenCalled();
    },
  );
});

describe("checkHealth — the public half: this build's public client must be accepted and denied at the table", () => {
  it("runs the same bounded read through the public client after the privileged read", async () => {
    const { created, calls: privilegedCalls } = privilegedOk();
    const { pub, calls } = publicOk(PUBLIC_DENIED);
    const d = deps(created, pub);
    expect(await checkHealth(d)).toEqual({ status: "ok" });
    expect(d.createPublicClient).toHaveBeenCalledTimes(1);
    expect(calls.map((call) => call.method)).toEqual([
      "from",
      "select",
      "limit",
      "abortSignal",
    ]);
    expect(calls[0].args).toEqual(["system_checks"]);
    expect(calls[2].args).toEqual([1]);
    expect(calls[3].args[0]).toBeInstanceOf(AbortSignal);
    expect(privilegedCalls).toHaveLength(4);
  });

  it.each([
    ["permission denied (42501) with HTTP 401", PUBLIC_DENIED, ONE_ROW],
    [
      "permission denied (42501) with HTTP 403",
      { ...PUBLIC_DENIED, status: 403 },
      ONE_ROW,
    ],
    ["permission denied on an empty table", PUBLIC_DENIED, NO_ROW],
    [
      "an RLS-filtered empty result when the privileged read saw a row",
      { data: [], error: null, status: 200 },
      ONE_ROW,
    ],
    [
      "a table the public role cannot see (PGRST205)",
      {
        data: null,
        error: { code: "PGRST205", message: "not in schema cache" },
        status: 404,
      },
      ONE_ROW,
    ],
    [
      "a relation the public role cannot see (42P01)",
      {
        data: null,
        error: { code: "42P01", message: "relation does not exist" },
        status: 404,
      },
      ONE_ROW,
    ],
  ])("accepts %s as healthy", async (_label, outcome, privileged) => {
    const { created } = privilegedOk(privileged);
    const { pub } = publicOk(outcome);
    expect(await checkHealth(deps(created, pub))).toEqual({ status: "ok" });
  });

  it.each([
    [
      "the gateway rejecting the key (401 without a Postgres code)",
      { data: null, error: { message: "Invalid API key" }, status: 401 },
      ONE_ROW,
      "public_key_rejected",
    ],
    [
      "the gateway rejecting the key (403, empty code)",
      { data: null, error: { code: "", message: "forbidden" }, status: 403 },
      ONE_ROW,
      "public_key_rejected",
    ],
    [
      "a public read that returns rows (RLS or grants open)",
      { data: [{ id: "row-1" }], error: null, status: 200 },
      ONE_ROW,
      "public_access_open",
    ],
    [
      "an empty public result on an empty table (nothing was hidden, so nothing is proven)",
      { data: [], error: null, status: 200 },
      NO_ROW,
      "public_denial_unproven",
    ],
    [
      'a timeout (postgrest-js maps AbortSignal.timeout to code "23", status 0)',
      { data: null, error: { code: "23", message: "TimeoutError" }, status: 0 },
      ONE_ROW,
      "query_failed",
    ],
    [
      "an aborted request with an empty code (status 0)",
      { data: null, error: { code: "", message: "AbortError" }, status: 0 },
      ONE_ROW,
      "query_failed",
    ],
    [
      "any other PostgREST error",
      {
        data: null,
        error: { code: "PGRST301", message: "JWT expired" },
        status: 401,
      },
      ONE_ROW,
      "query_failed",
    ],
  ])("reports %s as %s", async (_label, outcome, privileged, reason) => {
    const { created } = privilegedOk(privileged);
    const { pub } = publicOk(outcome);
    const result = await checkHealth(deps(created, pub));
    expect(result).toEqual({ status: "unavailable", reason });
    expect(JSON.stringify(result)).not.toContain("row-1");
    expect(JSON.stringify(result)).not.toContain("Invalid API key");
  });

  it.each([["not_configured"], ["invalid_key"], ["invalid_url"]] as const)(
    "reports public_not_configured when the public pair is %s",
    async (reason) => {
      const { created } = privilegedOk();
      expect(await checkHealth(deps(created, { ok: false, reason }))).toEqual({
        status: "unavailable",
        reason: "public_not_configured",
      });
    },
  );

  it("reports query_failed when the public query throws", async () => {
    const { created } = privilegedOk();
    const { pub } = publicOk(() => Promise.reject(new Error("AbortError")));
    expect(await checkHealth(deps(created, pub))).toEqual({
      status: "unavailable",
      reason: "query_failed",
    });
  });

  it("classifyPublicRead is a pure function of the outcome and the privileged row count", () => {
    expect(classifyPublicRead(PUBLIC_DENIED, 0)).toBe("accepted");
    expect(classifyPublicRead({ data: [], error: null }, 1)).toBe("accepted");
    expect(classifyPublicRead({ data: [], error: null }, 0)).toBe(
      "public_denial_unproven",
    );
    expect(classifyPublicRead({ data: [{ id: 1 }], error: null }, 1)).toBe(
      "public_access_open",
    );
    expect(classifyPublicRead({ data: null, error: {}, status: 401 }, 1)).toBe(
      "public_key_rejected",
    );
    expect(
      classifyPublicRead({ data: null, error: { code: "XX000" } }, 1),
    ).toBe("query_failed");
  });
});

describe("GET /api/health", () => {
  it("answers 200 {status:ok} with Cache-Control: no-store", async () => {
    const { created } = privilegedOk();
    const response = await handleHealth(
      new Request(URL_UNDER_TEST),
      deps(created),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("answers 503 with a coarse reason and no-store when unavailable", async () => {
    const response = await handleHealth(
      new Request(URL_UNDER_TEST),
      deps({ ok: false, reason: "not_configured" }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: "unavailable",
      reason: "not_configured",
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("answers 503 public_key_rejected when this build's publishable key is refused", async () => {
    const { created } = privilegedOk();
    const { pub } = publicOk({
      data: null,
      error: { message: "Invalid API key" },
      status: 401,
    });
    const response = await handleHealth(
      new Request(URL_UNDER_TEST),
      deps(created, pub),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: "unavailable",
      reason: "public_key_rejected",
    });
  });

  it("HEAD reaches the same read-only path", async () => {
    const { created, calls } = privilegedOk();
    const response = await handleHealth(
      new Request(URL_UNDER_TEST, { method: "HEAD" }),
      deps(created),
    );
    expect(response.status).toBe(200);
    expect(calls.map((call) => call.method)).toEqual([
      "from",
      "select",
      "limit",
      "abortSignal",
    ]);
  });

  it.each(["POST", "PUT", "PATCH", "DELETE", "OPTIONS"])(
    "refuses %s with 405 and no query",
    async (method) => {
      const { created, calls } = privilegedOk();
      const d = deps(created);
      const response = await handleHealth(
        new Request(URL_UNDER_TEST, { method }),
        d,
      );
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("GET, HEAD");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(d.createClient).not.toHaveBeenCalled();
      expect(d.createPublicClient).not.toHaveBeenCalled();
      expect(calls).toEqual([]);
    },
  );

  it("exports GET as the route's only method handler, dynamic and on the Node runtime", () => {
    for (const method of [
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
      "HEAD",
    ]) {
      expect(route).not.toHaveProperty(method);
    }
    expect(typeof route.GET).toBe("function");
    expect(route.dynamic).toBe("force-dynamic");
    expect(route.runtime).toBe("nodejs");
  });

  it("the real route answers 503 not_configured from an empty environment, touching nothing", async () => {
    for (const name of [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_SECRET_KEY",
      "SUPABASE_TEST_PROJECT_REF",
      "SUPABASE_PROD_PROJECT_REF",
      "VERCEL_ENV",
    ])
      vi.stubEnv(name, undefined);
    const response = await route.GET(new Request(URL_UNDER_TEST));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: "unavailable",
      reason: "not_configured",
    });
  });

  it("never puts a ref, URL or key into a body", async () => {
    const { client } = fakeClient({ data: [{ id: 1 }], error: null });
    for (const created of [
      { ok: true as const, client, identity: IDENTITY },
      { ok: false as const, reason: "identity_mismatch" as const },
    ]) {
      const body = await (
        await handleHealth(new Request(URL_UNDER_TEST), deps(created))
      ).text();
      expect(body).not.toContain(TEST_REF);
      expect(body).not.toContain("supabase.co");
      expect(body).not.toContain(SECRET);
      expect(body).not.toContain(PUBLISHABLE);
    }
  });
});
