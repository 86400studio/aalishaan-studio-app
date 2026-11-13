import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  BAG_LIMIT,
  bagThrottleCommands,
  bagThrottleKey,
  consumeBagCheck,
} from "@/lib/server/bag-throttle";
import {
  handleBagRequest,
  type BagRequestDependencies,
} from "@/lib/server/bag";
import { checkoutThrottleKey } from "@/lib/server/checkout-throttle";
import type { CatalogueRead } from "@/lib/server/catalogue";
import {
  throttleKeys,
  type ThrottleDependencies,
  type ThrottleOutcome,
} from "@/lib/server/login-throttle";

/**
 * The bag endpoint's rate limit — S1.6, D-58 #3 (src/lib/server/bag-throttle.ts and its place in
 * src/lib/server/bag.ts `handleBagRequest`): an allowed read, an exhausted quota, missing or malformed controls, a
 * timeout or outage, a spoofed address — and in every denied case no read of the projection. The HTTP contract's
 * other cases stay in tests/unit/bag-validation.test.ts. Placeholder values only.
 */

const ENV = {
  UPSTASH_REDIS_REST_URL: "https://example-redis.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "placeholder-token",
};

const answering = (body: unknown, status = 200) =>
  vi.fn<typeof fetch>(async () => Response.json(body, { status }));
const counted = (count: number) => [{ result: count }, { result: 1 }];
const deps = (fetcher: typeof fetch, env = ENV): ThrottleDependencies => ({
  env,
  fetch: fetcher,
});

describe("bag throttle — its own namespace", () => {
  it("keys by the hashed address under bag:, apart from the checkout's and the staff's keys", () => {
    const key = bagThrottleKey("203.0.113.7");
    expect(key).toMatch(/^bag:ip:[0-9a-f]{64}$/);
    expect(key).not.toContain("203.0.113.7");
    expect(key).not.toBe(checkoutThrottleKey("submit", "203.0.113.7"));
    expect(key).not.toBe(throttleKeys("a@example.com", "203.0.113.7").ip);
    expect(bagThrottleKey("")).toBe(bagThrottleKey("unknown"));
    expect(bagThrottleCommands(key)).toEqual([
      ["INCR", key],
      ["PEXPIRE", key, BAG_LIMIT.windowMs, "NX"],
    ]);
    expect(BAG_LIMIT).toEqual({ max: 600, windowMs: 600_000 });
  });
});

describe("consumeBagCheck", () => {
  it("allows up to the limit and refuses the next check", async () => {
    expect(
      await consumeBagCheck("203.0.113.7", deps(answering(counted(1)))),
    ).toEqual({ ok: true });
    expect(
      await consumeBagCheck("203.0.113.7", deps(answering(counted(600)))),
    ).toEqual({ ok: true });
    expect(
      await consumeBagCheck("203.0.113.7", deps(answering(counted(601)))),
    ).toEqual({
      ok: false,
      reason: "rate_limited",
    });
  });

  it.each([
    ["a missing URL", { ...ENV, UPSTASH_REDIS_REST_URL: undefined }],
    ["a malformed URL", { ...ENV, UPSTASH_REDIS_REST_URL: "not a url" }],
    ["a missing token", { ...ENV, UPSTASH_REDIS_REST_TOKEN: undefined }],
  ])("fails closed without a network call for %s", async (_label, env) => {
    const fetcher = answering(counted(1));
    expect(
      await consumeBagCheck("203.0.113.7", { env, fetch: fetcher }),
    ).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    [
      "a network error",
      vi.fn<typeof fetch>(async () => {
        throw new TypeError("fetch failed");
      }),
    ],
    [
      "a timeout",
      vi.fn<typeof fetch>(async () => {
        throw new DOMException("timed out", "TimeoutError");
      }),
    ],
    ["a 503", answering({}, 503)],
    ["an error entry", answering([{ error: "ERR" }, { result: 1 }])],
    ["a malformed body", answering({ result: 1 })],
  ])("fails closed on %s", async (_label, fetcher) => {
    expect(await consumeBagCheck("203.0.113.7", deps(fetcher))).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });
});

const SLUG = "the-moon-between-two-peaks";

const CATALOGUE: CatalogueRead = {
  status: "ok",
  rows: [],
  omitted: 0,
};

function handlerDeps(limit: ThrottleOutcome | (() => never)) {
  return {
    read: vi.fn(async () => CATALOGUE),
    report: vi.fn<(message: string) => void>(),
    limit: vi.fn<(address: string) => Promise<ThrottleOutcome>>(async () => {
      if (typeof limit === "function") return limit();
      return limit;
    }),
  } satisfies BagRequestDependencies;
}

function bagRequest(
  items: unknown[],
  headers: Record<string, string> = {},
): Request {
  return new Request("https://studio.example.invalid/api/bag", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ items }),
  });
}

const ROW = { variant_code: `${SLUG}:white`, quantity: 1 };

describe("POST /api/bag — the limiter's place in the handler", () => {
  it("counts a non-empty bag once, by the address Vercel vouches for, before the projection is read", async () => {
    const d = handlerDeps({ ok: true });
    const response = await handleBagRequest(
      bagRequest([ROW], {
        "x-real-ip": "203.0.113.7",
        "x-forwarded-for": "198.51.100.9, 203.0.113.7",
      }),
      d,
    );
    expect(response.status).toBe(200);
    expect(d.limit).toHaveBeenCalledTimes(1);
    // The spoofable forwarded chain is ignored when the platform's own header is present.
    expect(d.limit).toHaveBeenCalledWith("203.0.113.7");
    expect(d.read).toHaveBeenCalledTimes(1);
    expect(d.limit.mock.invocationCallOrder[0]).toBeLessThan(
      d.read.mock.invocationCallOrder[0],
    );
  });

  it("answers an exhausted quota with 429 throttled, no-store, and never reads the projection", async () => {
    const d = handlerDeps({ ok: false, reason: "rate_limited" });
    const response = await handleBagRequest(bagRequest([ROW]), d);
    expect(response.status).toBe(429);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "throttled" });
    expect(d.read).not.toHaveBeenCalled();
    // A refusal by quota is not an incident: nothing is logged.
    expect(d.report).not.toHaveBeenCalled();
  });

  it.each([
    [
      "a limiter that cannot answer",
      { ok: false, reason: "unavailable" } as const,
    ],
    [
      "a limiter that throws",
      () => {
        throw new Error("boom");
      },
    ],
  ])(
    "fails closed with 503 unavailable for %s — never an empty successful bag",
    async (_label, limit) => {
      const d = handlerDeps(limit);
      const response = await handleBagRequest(bagRequest([ROW]), d);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ status: "unavailable" });
      expect(d.read).not.toHaveBeenCalled();
      // One sanitised code: no address, no bag content.
      expect(d.report.mock.calls).toEqual([["[bag] rate limit unavailable"]]);
    },
  );

  it("answers an empty bag without the limiter and without the projection", async () => {
    const d = handlerDeps({ ok: false, reason: "unavailable" });
    const response = await handleBagRequest(bagRequest([]), d);
    expect(response.status).toBe(200);
    expect(d.limit).not.toHaveBeenCalled();
    expect(d.read).not.toHaveBeenCalled();
  });

  it("refuses a malformed request before the limiter is asked (no Redis call for a bad body)", async () => {
    const d = handlerDeps({ ok: true });
    const response = await handleBagRequest(
      bagRequest([{ ...ROW, price_paise: 1 }]),
      d,
    );
    expect(response.status).toBe(400);
    expect(d.limit).not.toHaveBeenCalled();
    expect(d.read).not.toHaveBeenCalled();
  });
});
