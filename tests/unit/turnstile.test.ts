import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  TURNSTILE_ACTION,
  TURNSTILE_DUMMY_SECRETS,
  TURNSTILE_VERIFY_URL,
  verifyTurnstile,
  type TurnstileRequest,
} from "@/lib/server/turnstile";

/**
 * Turnstile's server half — S1.6 (src/lib/server/turnstile.ts): one POST to the fixed siteverify URL, a refused
 * token is `failed`, everything that is not a clear answer is `unavailable`, a real key's answer must name this
 * deployment and this form, and Cloudflare's published dummy secrets are accepted outside Production only.
 * Placeholder values only.
 */

const REAL: TurnstileRequest = {
  token: "token-from-the-widget",
  secret: "0x4AAAAAAA-placeholder-secret",
  remoteIp: "203.0.113.7",
  expectedHostnames: ["deploy-1.vercel.app"],
  production: false,
};

const answering = (body: unknown, status = 200) =>
  vi.fn<typeof fetch>(async () => Response.json(body, { status }));

const GOOD = {
  success: true,
  hostname: "deploy-1.vercel.app",
  action: TURNSTILE_ACTION,
  challenge_ts: "2026-11-11T10:00:00Z",
};

describe("verifyTurnstile", () => {
  it("posts the secret, the token and the client address to the fixed URL, form-encoded, once", async () => {
    const fetcher = answering(GOOD);
    expect(await verifyTurnstile(REAL, fetcher)).toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(TURNSTILE_VERIFY_URL);
    expect(url).toBe(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    );
    expect(init?.method).toBe("POST");
    const form = new URLSearchParams(String(init?.body));
    expect(Object.fromEntries(form)).toEqual({
      secret: REAL.secret,
      response: REAL.token,
      remoteip: "203.0.113.7",
    });
    expect(init?.redirect).toBe("error");
  });

  it("omits the address when it is not known", async () => {
    const fetcher = answering(GOOD);
    await verifyTurnstile({ ...REAL, remoteIp: "" }, fetcher);
    expect(
      new URLSearchParams(String(fetcher.mock.calls[0][1]?.body)).has(
        "remoteip",
      ),
    ).toBe(false);
  });

  it.each([
    ["a missing token", { token: "" }],
    ["an over-long token", { token: "t".repeat(2049) }],
  ])("refuses %s as failed without a network call", async (_label, change) => {
    const fetcher = answering(GOOD);
    expect(await verifyTurnstile({ ...REAL, ...change }, fetcher)).toEqual({
      ok: false,
      reason: "failed",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("is unavailable without a secret, and makes no network call", async () => {
    const fetcher = answering(GOOD);
    for (const secret of ["", "   "])
      expect(await verifyTurnstile({ ...REAL, secret }, fetcher)).toEqual({
        ok: false,
        reason: "unavailable",
      });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    ["a spent or duplicated token", ["timeout-or-duplicate"]],
    ["an invalid token", ["invalid-input-response"]],
    ["a missing token (Cloudflare's view)", ["missing-input-response"]],
    ["no error code at all", []],
  ])("refuses %s as failed", async (_label, codes) => {
    expect(
      await verifyTurnstile(
        REAL,
        answering({ success: false, "error-codes": codes }),
      ),
    ).toEqual({ ok: false, reason: "failed" });
  });

  it.each([
    ["a wrong secret", ["invalid-input-secret"]],
    ["a missing secret", ["missing-input-secret"]],
    ["Cloudflare's internal error", ["internal-error"]],
    ["a bad request", ["bad-request"]],
  ])(
    "treats %s as the control being unavailable, not the visitor's fault",
    async (_label, codes) => {
      expect(
        await verifyTurnstile(
          REAL,
          answering({ success: false, "error-codes": codes }),
        ),
      ).toEqual({ ok: false, reason: "unavailable" });
    },
  );

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
    ["a 500", answering(GOOD, 500)],
    ["a 302", answering(GOOD, 302)],
    [
      "a body that is not JSON",
      vi.fn<typeof fetch>(async () => new Response("<html>", { status: 200 })),
    ],
    ["a body without success", answering({ hostname: "deploy-1.vercel.app" })],
    ["a non-boolean success", answering({ ...GOOD, success: "true" })],
    ["null", answering(null)],
  ])("fails closed on %s", async (_label, fetcher) => {
    expect(await verifyTurnstile(REAL, fetcher)).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("refuses a real key's success for another hostname or another action", async () => {
    for (const body of [
      { ...GOOD, hostname: "evil.example" },
      { ...GOOD, hostname: undefined },
      { ...GOOD, hostname: "example.com" },
      { ...GOOD, action: "login" },
      { ...GOOD, action: undefined },
    ])
      expect(await verifyTurnstile(REAL, answering(body))).toEqual({
        ok: false,
        reason: "failed",
      });
    // No configured hostname at all: nothing can match.
    expect(
      await verifyTurnstile(
        { ...REAL, expectedHostnames: [] },
        answering(GOOD),
      ),
    ).toEqual({ ok: false, reason: "failed" });
    // The hostname comparison ignores case, as host names do.
    expect(
      await verifyTurnstile(
        REAL,
        answering({ ...GOOD, hostname: "Deploy-1.Vercel.App" }),
      ),
    ).toEqual({ ok: true });
  });

  it("accepts a published dummy secret's success outside Production, where hostname and action cannot be checked", async () => {
    const dummyAnswer = { success: true, hostname: "example.com" };
    for (const secret of TURNSTILE_DUMMY_SECRETS)
      expect(
        await verifyTurnstile({ ...REAL, secret }, answering(dummyAnswer)),
      ).toEqual({ ok: true });
    // The always-fail and already-spent dummy secrets answer success: false — refused like any other.
    expect(
      await verifyTurnstile(
        { ...REAL, secret: TURNSTILE_DUMMY_SECRETS[1] },
        answering({
          success: false,
          "error-codes": ["invalid-input-response"],
        }),
      ),
    ).toEqual({ ok: false, reason: "failed" });
  });

  it("refuses every dummy secret in Production without a network call — a test key never stands in there", async () => {
    const fetcher = answering({ success: true, hostname: "example.com" });
    for (const secret of TURNSTILE_DUMMY_SECRETS)
      expect(
        await verifyTurnstile({ ...REAL, secret, production: true }, fetcher),
      ).toEqual({ ok: false, reason: "unavailable" });
    expect(fetcher).not.toHaveBeenCalled();
    // A real key still works in Production.
    expect(
      await verifyTurnstile({ ...REAL, production: true }, answering(GOOD)),
    ).toEqual({ ok: true });
  });
});
