import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  LOGIN_LIMITS,
  THROTTLE_TIMEOUT_MS,
  clientAddressOf,
  consumeLoginAttempt,
  evaluateCounts,
  hashIdentifier,
  parsePipelineCounts,
  throttleCommands,
  throttleKeys,
  upstashOrigin,
} from "@/lib/server/login-throttle";

/**
 * The sign-in throttle fails closed and never carries an address in clear (docs/SECURITY-CHECKLIST.md §5;
 * docs/TECH-ARCHITECTURE.md §7). No network: `fetch` is injected.
 */

const ENV = {
  UPSTASH_REDIS_REST_URL: "https://example-redis.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: `token-${"t".repeat(24)}`,
};
const ATTEMPT = { email: "Owner@Example.test ", ip: "203.0.113.7" };

function okResponse(
  emailCount: number,
  ipCount: number,
  extra: unknown[] = [],
) {
  return new Response(
    JSON.stringify([
      { result: emailCount },
      { result: 1 },
      { result: ipCount },
      { result: 1 },
      ...extra,
    ]),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function fetchReturning(response: Response | Error) {
  return vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  }) as unknown as typeof fetch;
}

describe("the limits and keys", () => {
  it("counts 5 per e-mail and 20 per address in 15-minute windows", () => {
    expect(LOGIN_LIMITS).toEqual({
      email: { max: 5, windowMs: 900_000 },
      ip: { max: 20, windowMs: 900_000 },
    });
    expect(THROTTLE_TIMEOUT_MS).toBeLessThanOrEqual(5000);
  });

  it("hashes identifiers after trimming and lower-casing, so no address reaches Redis in clear", () => {
    const keys = throttleKeys(ATTEMPT.email, ATTEMPT.ip);
    expect(keys.email).toBe(
      `login:email:${hashIdentifier("owner@example.test")}`,
    );
    expect(keys.email).toMatch(/^login:email:[0-9a-f]{64}$/);
    expect(keys.ip).toMatch(/^login:ip:[0-9a-f]{64}$/);
    expect(keys.email).not.toContain("owner");
    expect(keys.ip).not.toContain("203.0.113.7");
    expect(hashIdentifier("A@B.c")).toBe(hashIdentifier("  a@b.c"));
  });

  it("falls back to one shared key when no client address is known", () => {
    expect(throttleKeys("a@b.c", "").ip).toBe(throttleKeys("x@y.z", "").ip);
    expect(throttleKeys("a@b.c", "").ip).toBe(
      `login:ip:${hashIdentifier("unknown")}`,
    );
  });

  it("builds the four-command pipeline: INCR then a window that is only set once", () => {
    const keys = throttleKeys("a@b.c", "1.2.3.4");
    expect(throttleCommands(keys)).toEqual([
      ["INCR", keys.email],
      ["PEXPIRE", keys.email, 900_000, "NX"],
      ["INCR", keys.ip],
      ["PEXPIRE", keys.ip, 900_000, "NX"],
    ]);
  });
});

describe("upstashOrigin", () => {
  it.each([
    ["https://example-redis.upstash.io", "https://example-redis.upstash.io"],
    ["https://example-redis.upstash.io/", "https://example-redis.upstash.io"],
  ])("accepts %s", (input, expected) => {
    expect(upstashOrigin(input)).toBe(expected);
  });

  it.each([
    [undefined],
    [""],
    ["http://example-redis.upstash.io"],
    ["https://user:pw@example-redis.upstash.io"],
    ["https://example-redis.upstash.io/pipeline"],
    ["https://example-redis.upstash.io/?x=1"],
    ["not a url"],
  ])("refuses %j", (input) => {
    expect(upstashOrigin(input)).toBeNull();
  });
});

describe("parsePipelineCounts and evaluateCounts", () => {
  it("reads the two INCR results and nothing else", () => {
    expect(
      parsePipelineCounts([
        { result: 3 },
        { result: 1 },
        { result: 7 },
        { result: 0 },
      ]),
    ).toEqual({ email: 3, ip: 7 });
  });

  it.each([
    [
      "an error entry",
      [{ result: 1 }, { error: "ERR" }, { result: 1 }, { result: 1 }],
    ],
    ["too few entries", [{ result: 1 }, { result: 1 }]],
    [
      "too many entries",
      [
        { result: 1 },
        { result: 1 },
        { result: 1 },
        { result: 1 },
        { result: 1 },
      ],
    ],
    [
      "a string count",
      [{ result: "1" }, { result: 1 }, { result: 1 }, { result: 1 }],
    ],
    [
      "a negative count",
      [{ result: -1 }, { result: 1 }, { result: 1 }, { result: 1 }],
    ],
    [
      "a fractional count",
      [{ result: 1.5 }, { result: 1 }, { result: 1 }, { result: 1 }],
    ],
    ["an object body", { result: 1 }],
    ["a null entry", [null, { result: 1 }, { result: 1 }, { result: 1 }]],
    ["a null body", null],
  ])("refuses %s", (_label, body) => {
    expect(parsePipelineCounts(body)).toBeNull();
  });

  it("allows up to the limit and refuses the attempt beyond it on either key", () => {
    expect(evaluateCounts({ email: 5, ip: 20 })).toEqual({ ok: true });
    expect(evaluateCounts({ email: 6, ip: 1 })).toEqual({
      ok: false,
      reason: "rate_limited",
    });
    expect(evaluateCounts({ email: 1, ip: 21 })).toEqual({
      ok: false,
      reason: "rate_limited",
    });
  });
});

describe("consumeLoginAttempt", () => {
  it("posts the pipeline to the origin with the bearer token, a timeout and no caching, and allows a first attempt", async () => {
    const fetch = fetchReturning(okResponse(1, 1));
    const outcome = await consumeLoginAttempt(ATTEMPT, { env: ENV, fetch });
    expect(outcome).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (fetch as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://example-redis.upstash.io/pipeline");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${ENV.UPSTASH_REDIS_REST_TOKEN}`,
    );
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(init.body as string) as unknown[][];
    expect(body).toHaveLength(4);
    expect(JSON.stringify(body)).not.toContain("example.test");
    expect(JSON.stringify(body)).not.toContain("203.0.113.7");
  });

  it("refuses the sixth attempt for an e-mail and the twenty-first for an address", async () => {
    expect(
      await consumeLoginAttempt(ATTEMPT, {
        env: ENV,
        fetch: fetchReturning(okResponse(6, 2)),
      }),
    ).toEqual({ ok: false, reason: "rate_limited" });
    expect(
      await consumeLoginAttempt(ATTEMPT, {
        env: ENV,
        fetch: fetchReturning(okResponse(2, 21)),
      }),
    ).toEqual({ ok: false, reason: "rate_limited" });
  });

  it.each([
    ["the URL name missing", { ...ENV, UPSTASH_REDIS_REST_URL: undefined }],
    ["the URL blank", { ...ENV, UPSTASH_REDIS_REST_URL: "  " }],
    [
      "the URL not https",
      { ...ENV, UPSTASH_REDIS_REST_URL: "http://example-redis.upstash.io" },
    ],
    ["the token missing", { ...ENV, UPSTASH_REDIS_REST_TOKEN: undefined }],
    ["the token blank", { ...ENV, UPSTASH_REDIS_REST_TOKEN: "" }],
  ])(
    "fails closed without touching the network when %s",
    async (_label, env) => {
      const fetch = fetchReturning(okResponse(1, 1));
      expect(await consumeLoginAttempt(ATTEMPT, { env, fetch })).toEqual({
        ok: false,
        reason: "unavailable",
      });
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["a network error", new Error("ECONNRESET")],
    [
      "a timeout",
      new DOMException("The operation was aborted", "TimeoutError"),
    ],
    ["a 401", new Response("{}", { status: 401 })],
    ["a 500", new Response("boom", { status: 500 })],
    ["a non-JSON 200", new Response("not json", { status: 200 })],
    [
      "an error entry",
      new Response(
        JSON.stringify([
          { error: "WRONGTYPE" },
          { result: 1 },
          { result: 1 },
          { result: 1 },
        ]),
        { status: 200 },
      ),
    ],
    [
      "a short answer",
      new Response(JSON.stringify([{ result: 1 }]), { status: 200 }),
    ],
  ])("fails closed on %s", async (_label, response) => {
    expect(
      await consumeLoginAttempt(ATTEMPT, {
        env: ENV,
        fetch: fetchReturning(response),
      }),
    ).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("clientAddressOf", () => {
  it("prefers x-real-ip, then the first x-forwarded-for entry, else empty", () => {
    expect(
      clientAddressOf(
        new Headers({
          "x-real-ip": " 198.51.100.4 ",
          "x-forwarded-for": "1.1.1.1",
        }),
      ),
    ).toBe("198.51.100.4");
    expect(
      clientAddressOf(
        new Headers({ "x-forwarded-for": "198.51.100.9, 10.0.0.1" }),
      ),
    ).toBe("198.51.100.9");
    expect(clientAddressOf(new Headers())).toBe("");
  });
});
