import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import * as route from "@/app/api/health/route";
import {
  HEALTH_QUERY_TIMEOUT_MS,
  checkHealth,
  handleHealth,
  type HealthDependencies,
} from "@/lib/server/health";
import type { PrivilegedClientResult } from "@/lib/server/supabase";
import type { ServerIdentity } from "@/lib/supabase/config";

const TEST_REF = "abcdefghijklmnopqrst";
const PROD_REF = "tsrqponmlkjihgfedcba";
const TEST_URL = `https://${TEST_REF}.supabase.co`;
const SECRET = `sb_secret_${"s".repeat(30)}`;
const URL_UNDER_TEST = "https://preview.example.test/api/health";

const CONFIG: ServerIdentity = {
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

function deps(
  created: PrivilegedClientResult,
): HealthDependencies & { createClient: ReturnType<typeof vi.fn> } {
  return { createClient: vi.fn(() => created) };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("checkHealth — one bounded read-only query", () => {
  it("is ok when the read succeeds with zero rows: an empty baseline is healthy", async () => {
    const { client, calls } = fakeClient({ data: [], error: null });
    const result = await checkHealth(
      deps({ ok: true, client, identity: CONFIG }),
    );
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
    const { client } = fakeClient({
      data: [{ id: "row-1", check_key: "fixture:baseline" }],
      error: null,
    });
    const result = await checkHealth(
      deps({ ok: true, client, identity: CONFIG }),
    );
    expect(result).toEqual({ status: "ok" });
    expect(JSON.stringify(result)).not.toContain("row-1");
  });

  it.each([["PGRST205"], ["42P01"]])(
    "reports schema_missing for error code %s",
    async (code) => {
      const { client } = fakeClient({
        data: null,
        error: { code, message: "relation missing (upstream text)" },
      });
      const result = await checkHealth(
        deps({ ok: true, client, identity: CONFIG }),
      );
      expect(result).toEqual({
        status: "unavailable",
        reason: "schema_missing",
      });
    },
  );

  it("reports query_failed for any other error, never the upstream message", async () => {
    const { client } = fakeClient({
      data: null,
      error: { code: "42501", message: "permission denied for table" },
    });
    const result = await checkHealth(
      deps({ ok: true, client, identity: CONFIG }),
    );
    expect(result).toEqual({ status: "unavailable", reason: "query_failed" });
  });

  it("reports query_failed when the query throws or times out", async () => {
    const { client } = fakeClient(() =>
      Promise.reject(new Error("AbortError")),
    );
    const result = await checkHealth(
      deps({ ok: true, client, identity: CONFIG }),
    );
    expect(result).toEqual({ status: "unavailable", reason: "query_failed" });
  });

  it.each([
    ["not_configured", "not_configured"],
    ["invalid_url", "not_configured"],
    ["invalid_key", "not_configured"],
    ["unknown_context", "not_configured"],
    ["refs_not_distinct", "identity_mismatch"],
    ["identity_mismatch", "identity_mismatch"],
  ] as const)(
    "maps the configuration failure %s to %s and runs no query",
    async (reason, expected) => {
      const result = await checkHealth(deps({ ok: false, reason }));
      expect(result).toEqual({ status: "unavailable", reason: expected });
    },
  );
});

describe("GET /api/health", () => {
  it("answers 200 {status:ok} with Cache-Control: no-store", async () => {
    const { client } = fakeClient({ data: [], error: null });
    const response = await handleHealth(
      new Request(URL_UNDER_TEST),
      deps({ ok: true, client, identity: CONFIG }),
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

  it("HEAD reaches the same read-only path", async () => {
    const { client, calls } = fakeClient({ data: [], error: null });
    const response = await handleHealth(
      new Request(URL_UNDER_TEST, { method: "HEAD" }),
      deps({ ok: true, client, identity: CONFIG }),
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
      const { client, calls } = fakeClient({ data: [], error: null });
      const d = deps({ ok: true, client, identity: CONFIG });
      const response = await handleHealth(
        new Request(URL_UNDER_TEST, { method }),
        d,
      );
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("GET, HEAD");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(d.createClient).not.toHaveBeenCalled();
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
      { ok: true as const, client, identity: CONFIG },
      { ok: false as const, reason: "identity_mismatch" as const },
    ]) {
      const body = await (
        await handleHealth(new Request(URL_UNDER_TEST), deps(created))
      ).text();
      expect(body).not.toContain(TEST_REF);
      expect(body).not.toContain("supabase.co");
      expect(body).not.toContain(SECRET);
    }
  });
});
