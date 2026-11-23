import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * An order page's address is a private link — S1.7 (docs/sprint-prompts/S1.7-razorpay-verification.md §H.3 "Order
 * page"; D-09): `/order/<token>` is the capability, so the token must never leave in telemetry or in a log.
 *
 * What this file proves, hermetically (`@sentry/nextjs` is a stand-in; no network, no database, no DOM):
 *   1. Browser — on the options `initBrowserSentry` hands to `Sentry.init`: an event and its breadcrumbs, as the SDK
 *      would send them, hold the token nowhere; every order address reads `/order/[token]`; queries and fragments are
 *      gone; only the user-agent header, and no user, cookie, body or query string, is left.
 *   2. Server — the same on the options `register()` hands to `Sentry.init`, with the request path that Next's
 *      `onRequestError` records in `contexts.nextjs.request_path`.
 *   3. The two copies, kept in step by hand, redact the same event to the same addresses.
 *   4. The route's own protections: its three response headers, a per-request page that is never indexed and never
 *      sent as a referrer, metadata without a token, and an error for an unreadable order that names no token.
 *   5. Logs: every `report(...)` in the payment and order modules passes fixed text with enumerated codes only.
 *   6. No order-page module writes to browser storage, and the token is handed to the status question alone.
 *
 * Beyond the fields the scrubbers name (addresses lose their query and fragment there), a last pass covers every
 * string of plain data in an event and in a breadcrumb — a console call's arguments, a stack frame's address, a
 * context, a key; sections 1–2 prove that too. Not claimed: a query string on a stack frame's address (S1.3b's
 * scrubbers never removed it; the order page reads none), the envelope's own headers, and Vercel's request log,
 * which holds every path by design (docs/THREAT-MODEL.md). Placeholder values only: the tokens below are made up.
 */

const sdk = vi.hoisted(() => ({
  init: vi.fn<(options: unknown) => void>(),
  captureException: vi.fn(),
  captureRouterTransitionStart: vi.fn(),
  captureRequestError: vi.fn(),
}));
const orders = vi.hoisted(() => ({
  readOrder: vi.fn<(token: unknown) => Promise<unknown>>(),
  orderStatusAction: vi.fn(),
}));
vi.mock("@sentry/nextjs", () => sdk);
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/order-confirmation", () => ({
  readOrder: orders.readOrder,
}));
vi.mock("@/app/(public)/order/[token]/actions", () => ({
  orderStatusAction: orders.orderStatusAction,
}));

import * as orderPage from "@/app/(public)/order/[token]/page";
import { ORDER_HEAD } from "@/content/public/order";
import type { OrderConfirmationRow } from "@/lib/schemas/order-confirmation";
import { CONFIRMATION_TOKEN_PATTERN } from "@/lib/schemas/payments";
import {
  PRIVATE_ORDER_HEADERS,
  PRIVATE_ORDER_PATHS,
} from "@/lib/security-headers";

/** 43 base64url characters — the confirmation token's shape — with both of its non-alphanumeric characters. Built
 *  from a repeated pattern: a made-up value, and plainly one (a random-looking literal trips the secret scan). */
const TOKEN = `${"Tk9_-".repeat(8)}pqr`;
const OTHER_TOKEN = `${"Qx7_".repeat(10)}abc`;
const ORIGIN = "https://aalishaan.example";
const ORDER_PATH = `/order/${TOKEN}`;
const ORDER_URL = `${ORIGIN}${ORDER_PATH}`;
const REDACTED_PATH = "/order/[token]";
const REDACTED_URL = `${ORIGIN}${REDACTED_PATH}`;
const USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) Placeholder/1.0";

type Crumb = { data?: Record<string, unknown>; [field: string]: unknown };
type TelemetryEvent = { breadcrumbs?: Crumb[]; [field: string]: unknown };
/** The part of the options passed to `Sentry.init` that decides what leaves. */
type ScrubOptions = {
  sendDefaultPii: boolean;
  beforeSend: (event: TelemetryEvent, hint: object) => TelemetryEvent | null;
  beforeBreadcrumb: (crumb: Crumb) => Crumb | null;
};

function initOptions(call = 0): ScrubOptions {
  const options = sdk.init.mock.calls[call][0] as ScrubOptions;
  expect(typeof options.beforeSend).toBe("function");
  expect(typeof options.beforeBreadcrumb).toBe("function");
  expect(options.sendDefaultPii).toBe(false);
  return options;
}

/** The options the browser SDK is initialised with (src/lib/sentry-browser.ts). */
async function browserOptions(): Promise<ScrubOptions> {
  vi.resetModules();
  sdk.init.mockClear();
  (await import("@/lib/sentry-browser")).initBrowserSentry();
  expect(sdk.init).toHaveBeenCalledTimes(1);
  return initOptions();
}

/** The options the server SDK is initialised with (src/instrumentation.ts), under the Node.js runtime. */
async function serverOptions(): Promise<ScrubOptions> {
  vi.resetModules();
  sdk.init.mockClear();
  const runtime = process.env.NEXT_RUNTIME;
  vi.stubEnv("NEXT_RUNTIME", "nodejs");
  try {
    (await import("@/instrumentation")).register();
  } finally {
    vi.unstubAllEnvs();
  }
  expect(process.env.NEXT_RUNTIME).toBe(runtime);
  expect(sdk.init).toHaveBeenCalledTimes(1);
  return initOptions();
}

/**
 * What the SDK would send: each breadcrumb passes `beforeBreadcrumb` when it is recorded, and the event that carries
 * them passes `beforeSend` last. The inputs are copied, so a fixture is never changed by a scrubber.
 */
function emit(
  options: ScrubOptions,
  event: TelemetryEvent,
  crumbs: Crumb[],
): TelemetryEvent {
  const recorded = crumbs
    .map((crumb) => options.beforeBreadcrumb(structuredClone(crumb)))
    .filter((crumb): crumb is Crumb => crumb !== null);
  const sent = options.beforeSend(
    { ...structuredClone(event), breadcrumbs: recorded },
    {},
  );
  if (sent === null) throw new Error("the event was dropped, not scrubbed");
  return sent;
}

/** What must never leave with a request, whichever side reports it. */
const PRIVATE_REQUEST_FIELDS = {
  query_string: `utm_source=email&return=${TOKEN}`,
  cookies: { session: "placeholder-cookie" },
  data: JSON.stringify([TOKEN, true]),
};

/** An uncaught error on the order page, as the browser SDK shapes it (page address, referrer, user agent). */
const browserEvent = (): TelemetryEvent => ({
  platform: "javascript",
  message: `Could not refresh ${ORDER_URL}`,
  transaction: ORDER_PATH,
  user: { id: "visitor-1", ip_address: "203.0.113.7" },
  request: {
    ...PRIVATE_REQUEST_FIELDS,
    url: `${ORDER_URL}?utm_source=email&return=${TOKEN}#order-status`,
    headers: { "User-Agent": USER_AGENT, Referer: ORDER_URL, Cookie: "s=1" },
  },
  exception: {
    values: [
      { type: "Error", value: `Unexpected response for ${ORDER_PATH}` },
      { type: "TypeError", value: `Failed to fetch ${ORDER_URL}` },
    ],
  },
  tags: { route: ORDER_PATH, handled: "no", attempt: 2 },
  contexts: {
    trace: { trace_id: "a".repeat(32), span_id: "b".repeat(16) },
    react: { componentStack: `\n    at Watcher (${ORIGIN}/_next/app.js:1:1)` },
  },
});
/** The message, exception and tags above, as they may leave. */
const REDACTED_FIELDS = {
  message: `Could not refresh ${REDACTED_URL}`,
  exception: {
    values: [
      { type: "Error", value: `Unexpected response for ${REDACTED_PATH}` },
      { type: "TypeError", value: `Failed to fetch ${REDACTED_URL}` },
    ],
  },
  tags: { route: REDACTED_PATH, handled: "no", attempt: 2 },
};

/** The browser's trail: the arrival, the status question (a server action: a POST to the page's own address), a
 *  refresh, an earlier event's description and a click. */
const browserCrumbs = (): Crumb[] => [
  {
    category: "navigation",
    data: { from: "/checkout?step=pay", to: `${ORDER_PATH}?utm=return#top` },
  },
  {
    category: "fetch",
    data: {
      method: "POST",
      url: `${ORDER_URL}?return=${TOKEN}`,
      "http.query": `?return=${TOKEN}`,
      "http.fragment": "#top",
    },
  },
  { category: "xhr", data: { method: "GET", url: `${ORDER_PATH}?_rsc=1a2b` } },
  { category: "sentry.event", message: `Error: no answer for ${ORDER_PATH}` },
  { category: "ui.click", message: "a.button.button--primary" },
];
const REDACTED_BROWSER_CRUMBS: Crumb[] = [
  { category: "navigation", data: { from: "/checkout", to: REDACTED_PATH } },
  { category: "fetch", data: { method: "POST", url: REDACTED_URL } },
  { category: "xhr", data: { method: "GET", url: REDACTED_PATH } },
  {
    category: "sentry.event",
    message: `Error: no answer for ${REDACTED_PATH}`,
  },
  { category: "ui.click", message: "a.button.button--primary" },
];

/** A failed render of the order page, as the server SDK and Next's `onRequestError` shape it. */
const serverEvent = (): TelemetryEvent => ({
  ...browserEvent(),
  platform: "node",
  transaction: `POST ${ORDER_PATH}`,
  request: {
    ...PRIVATE_REQUEST_FIELDS,
    method: "POST",
    url: `${ORDER_URL}?_rsc=1a2b&return=${TOKEN}#order-status`,
    env: { REMOTE_ADDR: "203.0.113.7", REQUEST_URI: ORDER_PATH },
    headers: {
      "user-agent": USER_AGENT,
      referer: ORDER_URL,
      cookie: "s=1",
      "next-action": "placeholder-action-id",
      "x-forwarded-for": "203.0.113.7",
    },
  },
  contexts: {
    nextjs: {
      request_path: `${ORDER_PATH}?_rsc=1a2b&return=${TOKEN}`,
      router_path: REDACTED_PATH,
      route_type: "render",
    },
    runtime: { name: "node", version: "v22.0.0" },
  },
});
const serverCrumbs = (): Crumb[] => [
  {
    category: "http",
    data: { url: `${ORDER_URL}?return=${TOKEN}`, "http.query": "?return=x" },
  },
  { category: "console", message: `render failed for ${ORDER_PATH}` },
];

/** Every address-bearing field both copies scrub, for comparing them. */
const addressesOf = (event: TelemetryEvent) => ({
  url: (event.request as { url?: unknown }).url,
  headers: (event.request as { headers?: unknown }).headers,
  transaction: event.transaction,
  message: event.message,
  exception: event.exception,
  tags: event.tags,
  breadcrumbs: event.breadcrumbs,
});

beforeEach(() => {
  sdk.init.mockClear();
  orders.readOrder.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("1. browser — what initBrowserSentry lets the SDK send from an order page", () => {
  it("emits no token: not in the address, the referrer, the transaction, a message, a tag or the trail", async () => {
    expect(TOKEN).toMatch(CONFIRMATION_TOKEN_PATTERN);
    const sent = emit(await browserOptions(), browserEvent(), browserCrumbs());
    expect(JSON.stringify(sent)).not.toContain(TOKEN);
    // The whole event as it leaves: the address without token, query or fragment; of the headers only the user
    // agent (the referrer is gone); no user, cookies, body or query string. What the browser SDK itself puts in
    // contexts holds no page address and leaves as it was.
    expect(sent).toEqual({
      platform: "javascript",
      ...REDACTED_FIELDS,
      transaction: REDACTED_PATH,
      request: { url: REDACTED_URL, headers: { "User-Agent": USER_AGENT } },
      contexts: browserEvent().contexts,
      breadcrumbs: REDACTED_BROWSER_CRUMBS,
    });
    expect(sent).not.toHaveProperty("user");
  });

  it("scrubs a breadcrumb when it is recorded, before any event carries it", async () => {
    const { beforeBreadcrumb } = await browserOptions();
    const recorded = browserCrumbs().map((crumb) => beforeBreadcrumb(crumb));
    expect(recorded).toEqual(REDACTED_BROWSER_CRUMBS);
    expect(JSON.stringify(recorded)).not.toMatch(/[?#]/);
  });
});

describe("2. server — what register() lets the SDK send for an order page's request", () => {
  it("emits no token: not in the request, Next's request path, the transaction, a message, a tag or the trail", async () => {
    const sent = emit(await serverOptions(), serverEvent(), serverCrumbs());
    expect(JSON.stringify(sent)).not.toContain(TOKEN);
    // No user, cookies, body, query string or server environment; of the headers only the user agent. The path
    // onRequestError records, query string included, keeps neither its token nor its query.
    expect(sent).toEqual({
      platform: "node",
      ...REDACTED_FIELDS,
      transaction: `POST ${REDACTED_PATH}`,
      request: {
        method: "POST",
        url: REDACTED_URL,
        headers: { "user-agent": USER_AGENT },
      },
      contexts: {
        nextjs: {
          request_path: REDACTED_PATH,
          router_path: REDACTED_PATH,
          route_type: "render",
        },
        runtime: { name: "node", version: "v22.0.0" },
      },
      breadcrumbs: [
        { category: "http", data: { url: REDACTED_URL } },
        { category: "console", message: `render failed for ${REDACTED_PATH}` },
      ],
    });
    expect(sent).not.toHaveProperty("user");
  });

  it("starts the SDK only under a server runtime, with the same scrubbers under Node.js and the edge", async () => {
    vi.resetModules();
    const server = await import("@/instrumentation");
    vi.stubEnv("NEXT_RUNTIME", "");
    server.register();
    expect(sdk.init).not.toHaveBeenCalled();
    vi.stubEnv("NEXT_RUNTIME", "edge");
    server.register();
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    server.register();
    expect(sdk.init).toHaveBeenCalledTimes(2);
    const [edge, node] = [initOptions(0), initOptions(1)];
    expect(edge.beforeSend).toBe(node.beforeSend);
    expect(edge.beforeBreadcrumb).toBe(node.beforeBreadcrumb);
  });
});

describe.each([
  ["browser (src/lib/sentry-browser.ts)", browserOptions],
  ["server (src/instrumentation.ts)", serverOptions],
] as const)("1–2. the %s scrubbers", (_name, load) => {
  it("leave every other path exactly as it was", async () => {
    const event: TelemetryEvent = {
      message: "left /checkout for /orders/x, then /order and /reorder/again",
      transaction: "/artworks/some-slug",
      request: { url: `${ORIGIN}/artworks/some-slug` },
      tags: { route: "/checkout", list: "/orders/x" },
    };
    const crumbs: Crumb[] = [
      { category: "navigation", data: { from: "/checkout", to: "/orders/x" } },
      { category: "fetch", data: { url: "/artworks/some-slug" } },
    ];
    const sent = emit(await load(), event, crumbs);
    expect(sent).toEqual({ ...event, breadcrumbs: crumbs });
  });

  it("redact an absolute address, a longer path and several order links in one string", async () => {
    expect(OTHER_TOKEN).toMatch(CONFIRMATION_TOKEN_PATTERN);
    const several = `from /order/${TOKEN} to "${ORIGIN}/order/${OTHER_TOKEN}" and on to /order/${TOKEN}/receipt`;
    const redacted = `from ${REDACTED_PATH} to "${REDACTED_URL}" and on to ${REDACTED_PATH}/receipt`;
    const sent = emit(
      await load(),
      {
        message: several,
        transaction: `GET ${ORIGIN}/order/${OTHER_TOKEN}`,
        request: { url: `${ORIGIN}/order/${OTHER_TOKEN}/?a=1#b` },
        tags: { trail: several },
      },
      [
        {
          message: several,
          data: { from: `${ORDER_URL}#top`, to: `/order/${OTHER_TOKEN}/a?b=1` },
        },
      ],
    );
    expect(JSON.stringify(sent)).not.toContain(TOKEN);
    expect(JSON.stringify(sent)).not.toContain(OTHER_TOKEN);
    expect(sent).toEqual({
      message: redacted,
      transaction: `GET ${REDACTED_URL}`,
      request: { url: `${REDACTED_URL}/` },
      tags: { trail: redacted },
      breadcrumbs: [
        {
          message: redacted,
          data: { from: REDACTED_URL, to: `${REDACTED_PATH}/a` },
        },
      ],
    });
  });

  it("redact what no named field covers: a console call's arguments, a stack frame's address, a context, extra data and a key", async () => {
    // Next logs a failed refresh of the page with the page's own address — the order page refreshes itself.
    const logged = `Failed to fetch RSC payload for ${ORDER_URL}. Falling back to browser navigation.`;
    const chunk = `${ORIGIN}/_next/static/chunks/0a1b2c.js`;
    const event: TelemetryEvent = {
      exception: {
        values: [
          {
            type: "Error",
            value: "an inline script failed",
            stacktrace: {
              frames: [
                {
                  filename: chunk,
                  abs_path: chunk,
                  lineno: 1,
                  function: "run",
                },
                // An inline script's frame: its file is the page's own address.
                { filename: ORDER_PATH, abs_path: ORDER_URL, lineno: 3 },
              ],
            },
          },
        ],
      },
      contexts: {
        page: { address: ORDER_URL, nested: { again: [ORDER_PATH, 7, null] } },
      },
      extra: { [ORDER_PATH]: "a key", note: `seen at ${ORDER_URL}` },
    };
    const crumbs: Crumb[] = [
      {
        category: "console",
        level: "error",
        message: logged,
        data: {
          logger: "console",
          arguments: [logged, { name: "TypeError", message: ORDER_PATH }, 5],
        },
      },
    ];
    const sent = emit(await load(), event, crumbs);
    expect(JSON.stringify(sent)).not.toContain(TOKEN);
    // The full stop that follows the address goes with the token: the segment ends at the next space.
    const redactedLog = `Failed to fetch RSC payload for ${REDACTED_URL} Falling back to browser navigation.`;
    expect(sent).toEqual({
      exception: {
        values: [
          {
            type: "Error",
            value: "an inline script failed",
            stacktrace: {
              frames: [
                {
                  filename: chunk,
                  abs_path: chunk,
                  lineno: 1,
                  function: "run",
                },
                { filename: REDACTED_PATH, abs_path: REDACTED_URL, lineno: 3 },
              ],
            },
          },
        ],
      },
      contexts: {
        page: {
          address: REDACTED_URL,
          nested: { again: [REDACTED_PATH, 7, null] },
        },
      },
      extra: { [REDACTED_PATH]: "a key", note: `seen at ${REDACTED_URL}` },
      breadcrumbs: [
        {
          category: "console",
          level: "error",
          message: redactedLog,
          data: {
            logger: "console",
            arguments: [
              redactedLog,
              { name: "TypeError", message: REDACTED_PATH },
              5,
            ],
          },
        },
      ],
    });
  });

  it("redact shared and cyclic data once, leave what is not plain data alone, and drop what is nested past anything the SDK sends", async () => {
    const { beforeBreadcrumb, beforeSend } = await load();

    // A breadcrumb is scrubbed as it is recorded — before the SDK has made its data plain.
    const shared = { at: ORDER_PATH };
    const loop: Record<string, unknown> = { at: ORDER_URL };
    loop.self = loop;
    const thrown = new Error(`failed for ${ORDER_PATH}`);
    const recorded = beforeBreadcrumb({
      category: "console",
      data: { arguments: [shared, shared, loop, thrown] },
    }) as { data: { arguments: unknown[] } };
    const [first, second, cycle, error] = recorded.data.arguments as [
      { at: string },
      { at: string },
      { at: string; self: unknown },
      Error,
    ];
    expect(first).toEqual({ at: REDACTED_PATH });
    expect(second).toBe(first);
    expect(cycle.at).toBe(REDACTED_URL);
    expect(cycle.self).toBe(cycle);
    // Not plain data: left as it is here. The SDK makes it plain before the event is sent, and the event's own
    // pass then covers it — the next assertion.
    expect(error).toBe(thrown);
    // The fixtures themselves are not rewritten: what leaves is a copy.
    expect(shared.at).toBe(ORDER_PATH);

    const sent = beforeSend(
      {
        breadcrumbs: [
          {
            category: "console",
            data: {
              arguments: [
                {
                  name: "Error",
                  message: `failed for ${ORDER_PATH}`,
                  stack: `Error: failed for ${ORDER_PATH}\n    at ${ORDER_URL}:1:1`,
                },
              ],
            },
          },
        ],
      },
      {},
    );
    expect(JSON.stringify(sent)).not.toContain(TOKEN);
    expect(sent?.breadcrumbs).toEqual([
      {
        category: "console",
        data: {
          arguments: [
            {
              name: "Error",
              message: `failed for ${REDACTED_PATH}`,
              // The address ends where the path does: the line and column after it go with the token.
              stack: `Error: failed for ${REDACTED_PATH}\n    at ${REDACTED_URL}`,
            },
          ],
        },
      },
    ]);

    // Deeper than anything the SDK sends (it normalises three levels): dropped, never passed on as it was.
    let nested: unknown = { at: ORDER_PATH };
    for (let level = 0; level < 24; level += 1) nested = { down: [nested] };
    const deep = beforeSend({ extra: { nested } }, {});
    const text = JSON.stringify(deep);
    expect(text).not.toContain(TOKEN);
    expect(text).toContain("[too deep]");

    // The SDK's own working data is not sent, is not plain data, and is not walked.
    class Working {
      readonly address = ORDER_URL;
    }
    const working = { scope: new Working() };
    const kept = beforeSend(
      { message: ORDER_PATH, sdkProcessingMetadata: working },
      {},
    );
    expect(kept?.message).toBe(REDACTED_PATH);
    expect(kept?.sdkProcessingMetadata).toBe(working);
  });
});

describe("3. the browser and server copies agree", () => {
  it("the same browser-shaped event leaves both identically", async () => {
    const browser = await browserOptions();
    const server = await serverOptions();
    expect(emit(server, browserEvent(), browserCrumbs())).toEqual(
      emit(browser, browserEvent(), browserCrumbs()),
    );
  });

  it("the same server-shaped request, messages, tags and trail are redacted to the same addresses by both", async () => {
    const browser = emit(await browserOptions(), serverEvent(), serverCrumbs());
    const server = emit(await serverOptions(), serverEvent(), serverCrumbs());
    expect(addressesOf(browser)).toEqual(addressesOf(server));
    expect(JSON.stringify(addressesOf(browser))).not.toContain(TOKEN);
  });
});

/** A stored order still awaiting its confirmation — made-up values of the row's own types. */
const ROW: OrderConfirmationRow = {
  order_number: "AS-1001",
  confirmation_token_hash: "c".repeat(64),
  checkout_attempt_hash: null,
  placed_at: new Date("2026-11-11T10:00:00.000Z"),
  confirmed_at: null,
  payment_status: "pending",
  fulfilment_status: "pending_payment",
  needs_review: false,
  payment_hold: null,
  expires_at: null,
  synthetic: true,
  currency: "INR",
  subtotal_paise: BigInt(4200000),
  shipping_paise: null,
  tax_paise: null,
  total_paise: BigInt(4200000),
  items: [
    {
      variant_code: "lantern:white",
      finish_code: "white",
      finish_name: "White",
      artwork_slug: "lantern",
      artwork_title: "Lantern",
      orientation: "Portrait",
      quantity: 1,
      unit_price_paise: BigInt(4200000),
      line_total_paise: BigInt(4200000),
    },
  ],
  payments: { reported: 1, authorized: 0, captured: 0, failed: 0 },
  payment_attempt_id: null,
  provider_order_state: null,
  provider_order_id: null,
  server_time: new Date("2026-11-11T10:00:05.000Z"),
};

const renderOrderPage = () =>
  orderPage.default({ params: Promise.resolve({ token: TOKEN }) });
/** The error a render ends with, or null when it rendered. */
const renderFailure = (): Promise<
  (Error & { digest?: unknown; cause?: unknown }) | null
> =>
  renderOrderPage().then(
    () => null,
    (error: Error) => error,
  );

describe("4. the order route's own protections", () => {
  it("the path family's headers are exactly no-referrer, no-store and its own noindex", () => {
    expect(PRIVATE_ORDER_PATHS).toBe("/order/:path*");
    expect(PRIVATE_ORDER_HEADERS).toEqual([
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Cache-Control", value: "no-store" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
    ]);
  });

  it("the page is rendered per request, never built ahead, never indexed and never sent as a referrer", () => {
    expect(orderPage.dynamic).toBe("force-dynamic");
    expect(orderPage.metadata.robots).toEqual({ index: false, follow: false });
    expect(orderPage.metadata.referrer).toBe("no-referrer");
    // No token is known at build time, and nothing computes metadata from the address.
    expect(orderPage).not.toHaveProperty("generateStaticParams");
    expect(orderPage).not.toHaveProperty("generateMetadata");
    // The metadata is fixed text, with nothing shaped like a token.
    expect(orderPage.metadata.title).toBe(ORDER_HEAD.title);
    expect(orderPage.metadata.description).toBe(ORDER_HEAD.description);
    expect(JSON.stringify(orderPage.metadata)).not.toMatch(/[A-Za-z0-9_-]{43}/);
  });

  it("allowed: a readable order is rendered, and the token goes to the order's own component and nowhere else", async () => {
    orders.readOrder.mockResolvedValue({ status: "ok", row: ROW });
    const page = (await renderOrderPage()) as {
      props: { children: { props: Record<string, unknown> } };
    };
    expect(orders.readOrder).toHaveBeenCalledTimes(1);
    expect(orders.readOrder).toHaveBeenCalledWith(TOKEN);
    const { children, ...shell } = page.props;
    const { token, ask, view, ...rest } = children.props;
    expect(token).toBe(TOKEN);
    expect(ask).toBe(orders.orderStatusAction);
    expect(rest).toEqual({});
    // Neither the shell nor what the page shows of the order carries the token or its stored hash.
    expect(JSON.stringify([shell, view])).not.toContain(TOKEN);
    expect(JSON.stringify(view)).not.toContain(ROW.confirmation_token_hash);
  });

  it("denied: an order that cannot be read throws an error that names no token, and nothing is rendered", async () => {
    orders.readOrder.mockResolvedValue({ status: "unavailable" });
    const error = await renderFailure();
    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toBe("the order could not be read");
    expect(error?.message).not.toContain(TOKEN);
    expect(error?.cause).toBeUndefined();
    expect(error?.digest).toBeUndefined();
    expect(orders.readOrder).toHaveBeenCalledTimes(1);
    expect(orders.orderStatusAction).not.toHaveBeenCalled();
  });

  it("denied: an unknown order is the framework's 404, whose error names no token either", async () => {
    orders.readOrder.mockResolvedValue({ status: "not_found" });
    const error = await renderFailure();
    expect(error).toBeInstanceOf(Error);
    expect(String(error?.digest)).toContain("404");
    expect(`${error?.message} ${String(error?.digest)}`).not.toContain(TOKEN);
    expect(orders.orderStatusAction).not.toHaveBeenCalled();
  });
});

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const source = (relative: string): string =>
  readFileSync(path.join(ROOT, relative), "utf8");
/** The code of a source file: block comments and line comments removed (`://` inside an address is kept). */
const codeOf = (relative: string): string =>
  source(relative)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

describe("5. logs receive fixed text and enumerated codes only", () => {
  /** A `report(` call whose one argument is a string literal or a template. */
  const LITERAL_REPORT = /\breport\(\s*("[^"\\\n]*"|`[^`\\]*`),?\s*\)/g;
  /** The only values a message may interpolate: a closed gate's reason, a refusal code, a processing outcome. */
  const ENUMERATED_CODE =
    /^(?:gate\.reason|outcome\.reason|refusal|[a-z]+\.refusal|processed\.value\.outcome)$/;
  const PRIVATE_VALUE =
    /token|hash|key|body|payload|signature|payment_?id|order_?id|url|request|secret|address|email|phone/i;

  // Each module with the fewest report(...) calls the sweep must find in it, so it never passes on nothing.
  it.each([
    ["src/lib/server/payments/webhook.ts", 5],
    ["src/lib/server/payments/reconcile.ts", 1],
    ["src/lib/server/checkout/flow.ts", 10],
    ["src/lib/server/order-confirmation.ts", 0],
  ])(
    "%s: every report(...) passes a literal or a template of enumerated codes, and the console is only its default",
    (relative, fewest) => {
      const code = codeOf(relative);
      const calls = code.match(/\breport\(/g) ?? [];
      const messages = [...code.matchAll(LITERAL_REPORT)].map(
        (call) => call[1],
      );
      expect(calls.length).toBeGreaterThanOrEqual(fewest);
      // Every call is of the literal form: none passes a variable, a concatenation or a second argument.
      expect(messages).toHaveLength(calls.length);
      for (const message of messages) {
        for (const [, value] of message.matchAll(/\$\{([^}]*)\}/g)) {
          expect(value.trim(), message).toMatch(ENUMERATED_CODE);
          expect(value, message).not.toMatch(PRIVATE_VALUE);
        }
      }
      // The console appears only as the default report dependency, which is handed the sanitised message.
      const defaults =
        code.match(/report: \(message\) => console\.error\(message\)/g) ?? [];
      expect(code.match(/\bconsole\b/g) ?? []).toHaveLength(defaults.length);
    },
  );
});

describe("6. the order page keeps nothing in the browser", () => {
  const sourcesUnder = (relative: string): string[] =>
    (readdirSync(path.join(ROOT, relative), { recursive: true }) as string[])
      .filter((file) => /\.tsx?$/.test(file))
      .map((file) => `${relative}/${file.split(path.sep).join("/")}`);
  const COMPONENTS = "src/components/order";
  const ROUTE = "src/app/(public)/order";
  const BAG = "src/components/commerce/purchased-bag.tsx";
  const SOURCES = [...sourcesUnder(COMPONENTS), BAG, ...sourcesUnder(ROUTE)];

  /** The only things a line of these modules may do with `token`. */
  const TOKEN_USES: readonly (readonly [use: string, form: RegExp])[] = [
    [
      "declared",
      /^(?:token,|token: string;|const \{ token \} = await params;|params: Promise<\{ token: string \}>;|ask: \(token: string, askProvider: boolean\) => Promise<OrderStatusAnswer>;)$/,
    ],
    ["effect dependency", /^\}, \[[\w, ]+\]\);$/],
    ["handed to the watcher", /\btoken=\{token\}/],
    ["status question", /\bask\(token, askProvider\)/],
    ["order read", /\breadOrder\(token\)/],
  ];
  /** What a module does with the token beyond declaring it, line by line. */
  const tokenUsesOf = (relative: string): string[] =>
    codeOf(relative)
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /\btoken\b/.test(line))
      .map(
        (line) =>
          TOKEN_USES.find(([, form]) => form.test(line))?.[0] ??
          `unexpected: ${line}`,
      )
      .filter((use) => use !== "declared")
      .sort();

  it.each(SOURCES)(
    "%s touches no browser storage, cookie or console",
    (relative) => {
      expect(source(relative)).not.toMatch(
        /localStorage|sessionStorage\.setItem|document\.cookie|indexedDB/,
      );
      expect(codeOf(relative)).not.toMatch(/\bconsole\b|sendBeacon/);
    },
  );

  // The page reads the order and hands the token down; the watcher asks the status question with it; nothing else.
  const USES: [module: string, uses: string[]][] = [
    [`${ROUTE}/[token]/page.tsx`, ["handed to the watcher", "order read"]],
    [`${COMPONENTS}/order-confirmation.tsx`, ["handed to the watcher"]],
    [
      `${COMPONENTS}/order-status-watcher.tsx`,
      ["effect dependency", "status question"],
    ],
    [`${COMPONENTS}/status-poll.ts`, []],
    [BAG, []],
  ];
  it.each(USES)("%s uses the token only for: %j", (relative, uses) => {
    expect(SOURCES).toContain(relative);
    expect(tokenUsesOf(relative)).toEqual(uses);
  });

  it("the sweep also covers the status question's server action", () => {
    expect(SOURCES).toContain(`${ROUTE}/[token]/actions.ts`);
  });
});
