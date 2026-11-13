import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  CHECKOUT_LIMITS,
  checkoutThrottleCommands,
  checkoutThrottleKey,
  consumeCheckoutAttempt,
} from "@/lib/server/checkout-throttle";
import {
  LOGIN_LIMITS,
  codeThrottleKey,
  throttleKeys,
  type ThrottleDependencies,
} from "@/lib/server/login-throttle";

/**
 * The checkout's rate limits — S1.6 (src/lib/server/checkout-throttle.ts): their own namespace and numbers, the
 * address only as a hash, and a closed answer for every way Redis can fail. Placeholder values only.
 */

const ENV = {
  UPSTASH_REDIS_REST_URL: "https://example-redis.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "placeholder-token",
};

function answering(body: unknown, status = 200) {
  return vi.fn<typeof fetch>(async () => Response.json(body, { status }));
}

function deps(fetcher: typeof fetch, env = ENV): ThrottleDependencies {
  return { env, fetch: fetcher };
}

const counted = (count: number) => [{ result: count }, { result: 1 }];

describe("checkout throttle — keys and commands", () => {
  it("uses its own namespace per kind and never the address in clear", () => {
    const submit = checkoutThrottleKey("submit", "203.0.113.7");
    const resume = checkoutThrottleKey("resume", "203.0.113.7");
    expect(submit).toMatch(/^checkout:submit:ip:[0-9a-f]{64}$/);
    expect(resume).toMatch(/^checkout:resume:ip:[0-9a-f]{64}$/);
    expect(submit).not.toContain("203.0.113.7");
    expect(submit).not.toBe(resume);
    // Never a staff key: the staff quotas are untouched.
    const staff = throttleKeys("a@example.com", "203.0.113.7");
    for (const key of [staff.email, staff.ip, codeThrottleKey("user")]) {
      expect(key.startsWith("login:")).toBe(true);
      expect(key).not.toBe(submit);
    }
    // An absent address shares one key rather than skipping the limit.
    expect(checkoutThrottleKey("submit", "")).toBe(
      checkoutThrottleKey("submit", "unknown"),
    );
  });

  it("counts, then sets the window once", () => {
    expect(checkoutThrottleCommands("submit", "k")).toEqual([
      ["INCR", "k"],
      ["PEXPIRE", "k", CHECKOUT_LIMITS.submit.windowMs, "NX"],
    ]);
    expect(CHECKOUT_LIMITS).toEqual({
      submit: { max: 10, windowMs: 600_000 },
      resume: { max: 60, windowMs: 600_000 },
    });
    // The staff policy is not this module's to change.
    expect(LOGIN_LIMITS.email.max).toBe(5);
  });
});

describe("consumeCheckoutAttempt", () => {
  it("allows up to the limit and refuses the next one", async () => {
    expect(
      await consumeCheckoutAttempt(
        "submit",
        "203.0.113.7",
        deps(answering(counted(1))),
      ),
    ).toEqual({ ok: true });
    expect(
      await consumeCheckoutAttempt(
        "submit",
        "203.0.113.7",
        deps(answering(counted(10))),
      ),
    ).toEqual({ ok: true });
    expect(
      await consumeCheckoutAttempt(
        "submit",
        "203.0.113.7",
        deps(answering(counted(11))),
      ),
    ).toEqual({ ok: false, reason: "rate_limited" });
    expect(
      await consumeCheckoutAttempt(
        "resume",
        "203.0.113.7",
        deps(answering(counted(60))),
      ),
    ).toEqual({ ok: true });
    expect(
      await consumeCheckoutAttempt(
        "resume",
        "203.0.113.7",
        deps(answering(counted(61))),
      ),
    ).toEqual({ ok: false, reason: "rate_limited" });
  });

  it("sends one pipeline request with the bearer token and the hashed key only", async () => {
    const fetcher = answering(counted(1));
    await consumeCheckoutAttempt("submit", "203.0.113.7", deps(fetcher));
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://example-redis.upstash.io/pipeline");
    expect(init?.method).toBe("POST");
    const body = String(init?.body);
    expect(body).not.toContain("203.0.113.7");
    expect(JSON.parse(body)).toEqual(
      checkoutThrottleCommands(
        "submit",
        checkoutThrottleKey("submit", "203.0.113.7"),
      ),
    );
  });

  it.each([
    ["a missing URL", { ...ENV, UPSTASH_REDIS_REST_URL: undefined }],
    [
      "a URL with a path",
      { ...ENV, UPSTASH_REDIS_REST_URL: "https://example-redis.upstash.io/x" },
    ],
    [
      "an http URL",
      { ...ENV, UPSTASH_REDIS_REST_URL: "http://example-redis.upstash.io" },
    ],
    ["a missing token", { ...ENV, UPSTASH_REDIS_REST_TOKEN: undefined }],
    ["a blank token", { ...ENV, UPSTASH_REDIS_REST_TOKEN: "  " }],
  ])("fails closed without a network call for %s", async (_label, env) => {
    const fetcher = answering(counted(1));
    expect(
      await consumeCheckoutAttempt("submit", "203.0.113.7", {
        env,
        fetch: fetcher,
      }),
    ).toEqual({ ok: false, reason: "unavailable" });
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
    ["a 500", answering({ error: "x" }, 500)],
    ["a 401", answering({ error: "x" }, 401)],
    [
      "a body that is not JSON",
      vi.fn<typeof fetch>(async () => new Response("<html>", { status: 200 })),
    ],
    ["an error entry", answering([{ error: "ERR" }, { result: 1 }])],
    ["a short answer", answering([{ result: 1 }])],
    ["a non-integer count", answering([{ result: "1" }, { result: 1 }])],
    ["a negative count", answering(counted(-1))],
    ["an object", answering({ result: 1 })],
  ])("fails closed on %s", async (_label, fetcher) => {
    expect(
      await consumeCheckoutAttempt("submit", "203.0.113.7", deps(fetcher)),
    ).toEqual({ ok: false, reason: "unavailable" });
  });
});
