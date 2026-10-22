import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The deferred Sentry browser SDK (S1.3b, D-19), hermetically: `@sentry/nextjs` and the browser are stand-ins.
 * The SDK is initialised once with the S0.1 options; nothing loads it before the page has loaded and gone idle
 * unless an error is queued; every error queued from the first script is sent after `init`, marked unhandled;
 * the early listeners stop once the SDK's own handlers are in place; a failed load is retried; the router hook
 * never starts the load. No network, no DOM.
 */

const sdk = vi.hoisted(() => ({
  init: vi.fn(),
  captureException: vi.fn(),
  captureRouterTransitionStart: vi.fn(),
}));
vi.mock("@sentry/nextjs", () => sdk);

/** A window with real event dispatch and a hand-driven idle callback. */
function fakeWindow() {
  const target = new EventTarget();
  const idle: Array<() => void> = [];
  const win = Object.assign(target, {
    requestIdleCallback: vi.fn((callback: () => void) => {
      idle.push(callback);
      return idle.length;
    }),
    setTimeout: vi.fn(),
  });
  return { win, runIdle: () => idle.splice(0).forEach((run) => run()) };
}

const errorEvent = (fields: { error?: unknown; message?: string }) =>
  Object.assign(new Event("error"), {
    error: undefined,
    message: "",
    ...fields,
  });
const rejectionEvent = (reason: unknown) =>
  Object.assign(new Event("unhandledrejection"), { reason });

/** Lets the dynamic import and the promise chain after it settle. */
async function settle() {
  await vi.dynamicImportSettled();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

let browser: ReturnType<typeof fakeWindow>;

beforeEach(() => {
  vi.resetModules();
  sdk.init.mockReset();
  sdk.captureException.mockReset();
  sdk.captureRouterTransitionStart.mockReset();
  browser = fakeWindow();
  vi.stubGlobal("window", browser.win);
  vi.stubGlobal("document", { readyState: "loading" });
});

const STACK_LIMIT = Error.stackTraceLimit;

afterEach(() => {
  Error.stackTraceLimit = STACK_LIMIT;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("src/lib/sentry-browser.ts — the options moved unchanged", () => {
  it("initialises once, with the public DSN and environment, no default PII and both scrubbers", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://public@example.invalid/1");
    vi.stubEnv("NEXT_PUBLIC_SENTRY_ENVIRONMENT", "preview");
    const browserSdk = await import("@/lib/sentry-browser");
    browserSdk.initBrowserSentry();
    browserSdk.initBrowserSentry();
    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(sdk.init).toHaveBeenCalledWith({
      dsn: "https://public@example.invalid/1",
      environment: "preview",
      sendDefaultPii: false,
      beforeSend: browserSdk.scrubEvent,
      beforeBreadcrumb: browserSdk.scrubBreadcrumb,
    });
  });

  it("scrubEvent drops the user, cookies, body, query and every header but the user agent", async () => {
    const { scrubEvent } = await import("@/lib/sentry-browser");
    const event = scrubEvent({
      type: undefined,
      user: { email: "someone@example.invalid" },
      request: {
        url: "https://aalishaan.example/track?order=AS-1#x",
        cookies: { session: "s" },
        data: "{}",
        query_string: "order=AS-1",
        headers: { "User-Agent": "UA", Referer: "https://x", Cookie: "c" },
      },
      breadcrumbs: [
        { data: { url: "/api?token=t", "http.query": "?token=t" } },
      ],
    });
    expect(event.user).toBeUndefined();
    expect(event.request).toEqual({
      url: "https://aalishaan.example/track",
      headers: { "User-Agent": "UA" },
    });
    expect(event.breadcrumbs).toEqual([{ data: { url: "/api" } }]);
  });

  it("scrubBreadcrumb strips the query and fragment from navigation fields", async () => {
    const { scrubBreadcrumb } = await import("@/lib/sentry-browser");
    expect(
      scrubBreadcrumb({
        data: { from: "/a?x=1", to: "/b#c", "http.fragment": "#c" },
      }),
    ).toEqual({ data: { from: "/a", to: "/b" } });
  });
});

describe("src/instrumentation-client.ts — the SDK loads after the page", () => {
  it("does not load the SDK before the load event, nor before the main thread is idle", async () => {
    await import("@/instrumentation-client");
    await settle();
    expect(sdk.init).not.toHaveBeenCalled();
    browser.win.dispatchEvent(new Event("load"));
    expect(browser.win.requestIdleCallback).toHaveBeenCalledWith(
      expect.any(Function),
      { timeout: 5000 },
    );
    await settle();
    expect(sdk.init).not.toHaveBeenCalled();
    browser.runIdle();
    await settle();
    expect(sdk.init).toHaveBeenCalledTimes(1);
  });

  it("with a DSN, raises the stack depth to 50 from the first script, as the SDK's init did there before", async () => {
    Error.stackTraceLimit = 10;
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://public@example.invalid/1");
    await import("@/instrumentation-client");
    expect(Error.stackTraceLimit).toBe(50);
  });

  it("without a DSN, leaves the stack depth alone (the SDK never set it)", async () => {
    Error.stackTraceLimit = 10;
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
    await import("@/instrumentation-client");
    expect(Error.stackTraceLimit).toBe(10);
  });

  it("schedules the load at once when the page has already loaded", async () => {
    vi.stubGlobal("document", { readyState: "complete" });
    await import("@/instrumentation-client");
    browser.runIdle();
    await settle();
    expect(sdk.init).toHaveBeenCalledTimes(1);
  });

  it("falls back to a timer where requestIdleCallback is missing", async () => {
    Object.assign(browser.win, { requestIdleCallback: undefined });
    await import("@/instrumentation-client");
    browser.win.dispatchEvent(new Event("load"));
    expect(browser.win.setTimeout).toHaveBeenCalledWith(
      expect.any(Function),
      2000,
    );
  });

  it("sends an early uncaught error at once, after init, marked unhandled", async () => {
    await import("@/instrumentation-client");
    const error = new Error("boom");
    browser.win.dispatchEvent(errorEvent({ error, message: "boom" }));
    await settle();
    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(sdk.captureException).toHaveBeenCalledWith(error, {
      mechanism: {
        type: "auto.browser.global_handlers.onerror",
        handled: false,
      },
    });
    expect(sdk.init.mock.invocationCallOrder[0]).toBeLessThan(
      sdk.captureException.mock.invocationCallOrder[0],
    );
  });

  it("sends the message of an error event without an Error object", async () => {
    await import("@/instrumentation-client");
    browser.win.dispatchEvent(errorEvent({ message: "Script error." }));
    await settle();
    expect(sdk.captureException).toHaveBeenCalledWith("Script error.", {
      mechanism: {
        type: "auto.browser.global_handlers.onerror",
        handled: false,
      },
    });
  });

  it("sends an early unhandled rejection's reason", async () => {
    await import("@/instrumentation-client");
    const reason = new Error("rejected");
    browser.win.dispatchEvent(rejectionEvent(reason));
    await settle();
    expect(sdk.captureException).toHaveBeenCalledWith(reason, {
      mechanism: {
        type: "auto.browser.global_handlers.onunhandledrejection",
        handled: false,
      },
    });
  });

  it("stops listening once the SDK is initialised (its own handlers take over)", async () => {
    await import("@/instrumentation-client");
    browser.win.dispatchEvent(new Event("load"));
    browser.runIdle();
    await settle();
    browser.win.dispatchEvent(errorEvent({ error: new Error("later") }));
    browser.win.dispatchEvent(rejectionEvent("later"));
    await settle();
    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(sdk.captureException).not.toHaveBeenCalled();
  });

  it("the router hook never starts the load, and forwards once it has started", async () => {
    const client = await import("@/instrumentation-client");
    client.onRouterTransitionStart("/shop", "push");
    await settle();
    expect(sdk.init).not.toHaveBeenCalled();
    expect(sdk.captureRouterTransitionStart).not.toHaveBeenCalled();
    browser.win.dispatchEvent(new Event("load"));
    browser.runIdle();
    await settle();
    client.onRouterTransitionStart("/about", "push");
    await settle();
    expect(sdk.captureRouterTransitionStart).toHaveBeenCalledTimes(1);
    expect(sdk.captureRouterTransitionStart).toHaveBeenCalledWith(
      "/about",
      "push",
    );
  });
});

describe("src/lib/report-error.ts — the error boundaries' path", () => {
  it("loads, initialises once and captures each reported error", async () => {
    const { reportToSentry } = await import("@/lib/report-error");
    const first = new Error("first");
    const second = new Error("second");
    reportToSentry(first);
    reportToSentry(second);
    await settle();
    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(sdk.captureException).toHaveBeenNthCalledWith(1, first, undefined);
    expect(sdk.captureException).toHaveBeenNthCalledWith(2, second, undefined);
  });

  it("retries a failed load on the next report, and never throws", async () => {
    // The chunk's import fails once (an offline moment, a chunk replaced by a newer deployment).
    vi.doMock("@/lib/sentry-browser", () => {
      throw new Error("chunk failed to load");
    });
    const { reportToSentry } = await import("@/lib/report-error");
    expect(() => reportToSentry(new Error("lost"))).not.toThrow();
    await settle();
    expect(sdk.init).not.toHaveBeenCalled();
    vi.doUnmock("@/lib/sentry-browser");
    const kept = new Error("kept");
    reportToSentry(kept);
    await settle();
    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(sdk.captureException).toHaveBeenCalledWith(kept, undefined);
  });
});

describe("no client module imports the SDK statically", () => {
  async function sourcesMatching(pattern: RegExp) {
    const { readFileSync, readdirSync } = await import("node:fs");
    const path = await import("node:path");
    const root = path.join(__dirname, "../../src");
    return (readdirSync(root, { recursive: true }) as string[])
      .filter((file) => /\.(ts|tsx|js|jsx|mjs)$/.test(file))
      .filter((file) =>
        pattern.test(readFileSync(path.join(root, file), "utf8")),
      )
      .map((file) => file.split(path.sep).join("/"))
      .sort();
  }

  it("only src/lib/sentry-browser.ts and the server hook import any @sentry/ package (from, side effect or re-export)", async () => {
    expect(await sourcesMatching(/(?:from|import)\s*["']@sentry\//)).toEqual([
      "instrumentation.ts",
      "lib/sentry-browser.ts",
    ]);
  });

  it("nothing imports src/lib/sentry-browser.ts statically — only report-error.ts's import() reaches it", async () => {
    // `import("./sentry-browser")` and `typeof import(...)` do not match: a parenthesis follows `import`.
    expect(
      await sourcesMatching(
        /(?:from|^\s*import)\s*["'][^"']*sentry-browser["']/m,
      ),
    ).toEqual([]);
    expect(await sourcesMatching(/import\("\.\/sentry-browser"\)/)).toEqual([
      "lib/report-error.ts",
    ]);
  });
});
