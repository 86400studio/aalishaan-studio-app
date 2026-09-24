import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The real route and guard run; only event delivery (the Sentry SDK) is replaced.
const sentry = vi.hoisted(() => {
  const scope = { setTag: vi.fn(), setFingerprint: vi.fn() };
  return {
    scope,
    captureException: vi.fn(),
    withScope: vi.fn((callback: (s: typeof scope) => void) => callback(scope)),
    flush: vi.fn<(timeout?: number) => Promise<boolean>>(async () => true),
    getClient: vi.fn(() => ({
      getDsn: () => ({ host: "ingest.example.test" }),
      getOptions: () => ({
        environment: "preview",
        release: "0123456789abcdef",
      }),
    })),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({
  captureException: sentry.captureException,
  withScope: sentry.withScope,
  flush: sentry.flush,
  getClient: sentry.getClient,
}));

import * as route from "@/app/api/sentry-test/route";
import {
  FLUSH_TIMEOUT_MS,
  MIN_TOKEN_LENGTH,
  SYNTHETIC_EVENT_MESSAGE,
  handleSentryTest,
} from "@/lib/server/sentry-test";

// Low-entropy stand-ins built at run time; no credential-like literal is committed.
const CONFIGURED = "a".repeat(48);
const SAME_LENGTH_WRONG = "b".repeat(48);
const URL_UNDER_TEST = "https://preview.example.test/api/sentry-test";

function post(
  headers: Record<string, string> = {},
  init: RequestInit = {},
): Request {
  return new Request(URL_UNDER_TEST, { method: "POST", headers, ...init });
}

function emitted(): boolean {
  return (
    sentry.captureException.mock.calls.length > 0 ||
    sentry.withScope.mock.calls.length > 0 ||
    sentry.flush.mock.calls.length > 0
  );
}

async function expectDenied(response: Response): Promise<void> {
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ status: "not_found" });
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(emitted()).toBe(false);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SENTRY_TEST_TOKEN", CONFIGURED);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/sentry-test — allowed", () => {
  it("emits exactly one fixed synthetic event for the exact Bearer token", async () => {
    const response = await route.POST(
      post({ authorization: `Bearer ${CONFIGURED}` }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "sent" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(sentry.captureException).toHaveBeenCalledTimes(1);
    const [error] = sentry.captureException.mock.calls[0];
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(SYNTHETIC_EVENT_MESSAGE);
    expect(sentry.scope.setTag).toHaveBeenCalledWith(
      "diagnostic",
      "s0.1-sentry-test",
    );
    expect(sentry.scope.setFingerprint).toHaveBeenCalledWith([
      "s0.1-sentry-test",
      "preview",
      "0123456789abcdef",
    ]);
    expect(sentry.flush).toHaveBeenCalledWith(FLUSH_TIMEOUT_MS);
  });

  it("ignores caller-supplied content: body and query never reach the event", async () => {
    const response = await route.POST(
      new Request(`${URL_UNDER_TEST}?message=injected`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${CONFIGURED}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ message: "injected" }),
      }),
    );

    expect(response.status).toBe(200);
    expect((sentry.captureException.mock.calls[0][0] as Error).message).toBe(
      SYNTHETIC_EVENT_MESSAGE,
    );
    expect(JSON.stringify(sentry.scope.setTag.mock.calls)).not.toContain(
      "injected",
    );
    expect(
      JSON.stringify(sentry.scope.setFingerprint.mock.calls),
    ).not.toContain("injected");
  });

  it("reports an unconfirmed delivery generically when the bounded flush times out", async () => {
    sentry.flush.mockResolvedValueOnce(false);
    const response = await route.POST(
      post({ authorization: `Bearer ${CONFIGURED}` }),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "not_confirmed" });
  });

  it("never claims success when the SDK has no DSN, and emits nothing", async () => {
    sentry.getClient.mockReturnValueOnce(undefined as never);
    const response = await route.POST(
      post({ authorization: `Bearer ${CONFIGURED}` }),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "sentry_not_configured" });
    expect(emitted()).toBe(false);
  });
});

describe("POST /api/sentry-test — denied without emitting", () => {
  it.each([
    ["no Authorization header", {}],
    ["an empty Authorization header", { authorization: "" }],
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
    ["the token in another header", { "x-sentry-test-token": CONFIGURED }],
  ])("denies %s", async (_label, headers) => {
    await expectDenied(
      await route.POST(post(headers as Record<string, string>)),
    );
  });

  it("denies a token passed in the query string", async () => {
    await expectDenied(
      await route.POST(
        new Request(`${URL_UNDER_TEST}?token=${CONFIGURED}`, {
          method: "POST",
        }),
      ),
    );
  });

  it("denies every request when SENTRY_TEST_TOKEN is unset", async () => {
    vi.stubEnv("SENTRY_TEST_TOKEN", undefined);
    await expectDenied(
      await route.POST(post({ authorization: "Bearer undefined" })),
    );
    await expectDenied(
      await route.POST(post({ authorization: `Bearer ${CONFIGURED}` })),
    );
  });

  it("denies every request when SENTRY_TEST_TOKEN is empty", async () => {
    vi.stubEnv("SENTRY_TEST_TOKEN", "");
    await expectDenied(await route.POST(post({ authorization: "Bearer " })));
    await expectDenied(await route.POST(post({ authorization: "Bearer" })));
  });

  it("denies even a matching credential when the configured token is too short", async () => {
    const short = "c".repeat(MIN_TOKEN_LENGTH - 1);
    vi.stubEnv("SENTRY_TEST_TOKEN", short);
    await expectDenied(
      await route.POST(post({ authorization: `Bearer ${short}` })),
    );
  });

  it("never echoes the configured or presented token", async () => {
    const response = await route.POST(
      post({ authorization: `Bearer ${SAME_LENGTH_WRONG}` }),
    );
    const body = await response.text();
    expect(body).not.toContain(CONFIGURED);
    expect(body).not.toContain(SAME_LENGTH_WRONG);
  });
});

describe("other methods never emit", () => {
  it("exports POST as the route's only method handler", () => {
    for (const method of ["GET", "HEAD", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
      expect(route).not.toHaveProperty(method);
    }
    expect(typeof route.POST).toBe("function");
  });

  it.each(["GET", "HEAD", "PUT", "PATCH", "DELETE", "OPTIONS"])(
    "the handler refuses %s with 405 even with the correct token",
    async (method) => {
      const response = await handleSentryTest(
        new Request(URL_UNDER_TEST, {
          method,
          headers: { authorization: `Bearer ${CONFIGURED}` },
        }),
      );
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("POST");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(emitted()).toBe(false);
    },
  );
});
