import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// The page's two browser-only parts render nothing on the server: a marker element shows where each one is placed.
vi.mock("@/components/commerce/purchased-bag", async () => {
  const { createElement: h } = await import("react");
  return { PurchasedBag: () => h("i", { "data-test-bag": "" }) };
});
vi.mock("@/components/order/order-status-watcher", async () => {
  const { createElement: h } = await import("react");
  return { OrderStatusWatcher: () => h("i", { "data-test-watcher": "" }) };
});

import {
  RETURN_RETRY_LIMIT,
  RETURN_RETRY_MS,
  resumeStep,
  settleReturn,
  submitStep,
} from "@/components/checkout/outcome";
import {
  OrderConfirmation,
  orderDate,
} from "@/components/order/order-confirmation";
import {
  ORDER_POLL_DELAYS_MS,
  ORDER_PROVIDER_QUESTIONS,
  runOrderPoll,
  type OrderPollOptions,
} from "@/components/order/status-poll";
import {
  CHECKOUT_NOTICES,
  CHECKOUT_TEST_MODE,
} from "@/content/public/checkout";
import * as ORDER_COPY from "@/content/public/order";
import {
  bagEqualsPurchase,
  purchasedBagDecision,
  type PurchasedBagFacts,
} from "@/lib/bag/purchased";
import type { CheckoutReturnResult } from "@/lib/schemas/checkout";
import {
  isSettledOrderState,
  mergeOrderPageState,
  orderPageState,
  orderViewOf,
  type OrderConfirmationRow,
  type OrderPageState,
  type OrderStateFacts,
  type OrderStatusAnswer,
  type PaymentCounts,
  type PaymentHold,
} from "@/lib/schemas/order-confirmation";
import { ORDER_PATH_PATTERN } from "@/lib/schemas/payments";
import type { ThrottleOutcome } from "@/lib/server/login-throttle";
import {
  isConfirmationToken,
  MISSING_ORDER_REWRITE,
  orderRouteAnswer,
  orderStatus,
  readOrder,
  type OrderStatusDependencies,
} from "@/lib/server/order-confirmation";
import type { PaymentsGate } from "@/lib/server/payments/config";
import type {
  PaymentRefusal,
  PaymentResult,
  PaymentStore,
  ProviderCheckRecord,
} from "@/lib/server/payments/store";
import type { OrderPaymentsOutcome } from "@/lib/server/razorpay";

/**
 * The order's own page — S1.7 (docs/sprint-prompts/S1.7-razorpay-verification.md §H.3 "Order page", "The bag").
 * Every database and provider call is a double; placeholder values only. What is proven here:
 *   - the page's state comes from the stored order alone: only a captured order is "confirmed", and the deadline is
 *     judged by the database's clock;
 *   - `/order/<token>` is a capability read by the token's SHA-256 only: a malformed token costs no read, an
 *     unreachable database is never a missing order, and the customer's projection carries nothing internal;
 *   - the status question asks the provider only where that can matter — once, behind the gate and the quota — and
 *     never confirms; the poll is bounded and never goes backwards;
 *   - the bag is emptied only for this browser's confirmed order while it holds exactly the purchase; the checkout
 *     leaves only for a path of an order page's shape; no confirming or failed line claims a payment.
 */

const TOKEN = `${"aB3_-".repeat(8)}xYz`;
const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const TOKEN_HASH = createHash("sha256").update(TOKEN).digest("hex");
const ORDER_PATH = `/order/${TOKEN}`;
const ATTEMPT_HASH = "c".repeat(64);
const PA_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const PROVIDER_ORDER_ID = "order_PLACEHOLDER001";
const PAYMENT_ID = "pay_PLACEHOLDER0001";
/** What no customer-facing value may carry: the token, its hash and the attempt's internal references. */
const INTERNAL = new RegExp(
  [TOKEN, TOKEN_HASH, PA_ID, PROVIDER_ORDER_ID].join("|"),
);
const ORDER_NUMBER = "AS-1001";
const ADDRESS = "203.0.113.7";
const NOW = new Date("2026-11-22T18:45:00.000Z");
const DEADLINE = new Date(NOW.getTime() + 30 * 60 * 1000);
/** A moment relative to the order's deadline. */
const at = (ms: number) => new Date(DEADLINE.getTime() + ms);

const counts = (some: Partial<PaymentCounts> = {}): PaymentCounts => ({
  reported: 0,
  authorized: 0,
  captured: 0,
  failed: 0,
  ...some,
});

const CONFIRMED: OrderPageState = { state: "confirmed" };
const PAYMENT: OrderPageState = { state: "confirming", reason: "payment" };
const REVIEW: OrderPageState = { state: "confirming", reason: "review" };
const RETRY: OrderPageState = { state: "failed", reason: "retry" };
const CLOSED: OrderPageState = { state: "failed", reason: "closed" };
const STATES = [CONFIRMED, PAYMENT, REVIEW, RETRY, CLOSED];

const LANTERN = "the-lantern-that-outlasted-the-gale:black";
const HARBOUR = "harbour-at-first-light:white";

/** A pending, linked, unexpired test order of two rows with no payment known — as `order_confirmation_view` answers. */
function row(
  overrides: Partial<OrderConfirmationRow> = {},
): OrderConfirmationRow {
  return {
    order_number: ORDER_NUMBER,
    confirmation_token_hash: TOKEN_HASH,
    checkout_attempt_hash: ATTEMPT_HASH,
    placed_at: NOW,
    confirmed_at: null,
    payment_status: "pending",
    fulfilment_status: "pending_payment",
    needs_review: false,
    payment_hold: null,
    expires_at: DEADLINE,
    synthetic: true,
    currency: "INR",
    subtotal_paise: BigInt(6100000),
    shipping_paise: null,
    tax_paise: null,
    total_paise: BigInt(6100000),
    items: [
      {
        variant_code: LANTERN,
        finish_code: "black",
        finish_name: "Black",
        artwork_slug: "the-lantern-that-outlasted-the-gale",
        artwork_title: "The Lantern That Outlasted the Gale",
        orientation: "Portrait",
        quantity: 2,
        unit_price_paise: BigInt(2100000),
        line_total_paise: BigInt(4200000),
      },
      {
        variant_code: HARBOUR,
        finish_code: "white",
        finish_name: "White",
        artwork_slug: "harbour-at-first-light",
        artwork_title: "Harbour at First Light",
        orientation: "Landscape",
        quantity: 1,
        unit_price_paise: BigInt(1900000),
        line_total_paise: BigInt(1900000),
      },
    ],
    payments: counts(),
    payment_attempt_id: PA_ID,
    provider_order_state: "linked",
    provider_order_id: PROVIDER_ORDER_ID,
    server_time: NOW,
    ...overrides,
  };
}

/** The stored orders the page's states come from. */
const REPORTED = row({ payments: counts({ reported: 1 }) });
/** Flagged for a person: a review that is not a hold (0005 writes no hold beside it). */
const UNDER_REVIEW = row({ ...REPORTED, needs_review: true });
const EXPIRED = row({ payment_status: "expired" });
const CAPTURED = row({
  payment_status: "captured",
  confirmed_at: NOW,
  payments: counts({ captured: 1 }),
});

describe("orderPageState — the page's state from the stored order", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const state = (overrides: Partial<OrderStateFacts>) =>
    orderPageState({ ...row(), ...overrides });
  const captured = { payment_status: "captured" } as const;
  const failed = { payment_status: "failed" } as const;
  const expired = { payment_status: "expired" } as const;
  const review = { needs_review: true, payment_hold: null };
  const held = (payment_hold: PaymentHold) => ({
    needs_review: true,
    payment_hold,
  });
  const paid = { payments: counts({ reported: 1 }) };
  const lost = { payments: counts({ failed: 2 }) };
  const open = { expires_at: null };
  const late = { server_time: at(1) };

  it.each<[string, Partial<OrderStateFacts>, OrderPageState]>([
    ["captured", captured, CONFIRMED],
    ["captured, under review", { ...captured, ...review }, CONFIRMED],
    ["captured, past its deadline", { ...captured, ...late }, CONFIRMED],
    ["under review", review, REVIEW],
    ["under review, a payment reported", { ...review, ...paid }, REVIEW],
    ["under review, past its deadline", { ...review, ...late }, REVIEW],
    ["under review, failed", { ...review, ...failed }, REVIEW],
    ["under review, expired", { ...review, ...expired }, REVIEW],
    ["a payment reported", paid, PAYMENT],
    ["a payment authorised", { payments: counts({ authorized: 1 }) }, PAYMENT],
    ["a payment captured", { payments: counts({ captured: 1 }) }, PAYMENT],
    ["a payment reported, past the deadline", { ...paid, ...late }, PAYMENT],
    ["a payment reported, no deadline", { ...paid, ...open }, PAYMENT],
    ["no payment, no deadline", open, REVIEW],
    ["failed payments only, no deadline", { ...lost, ...open }, REVIEW],
    ["no payment, 1 ms before the deadline", { server_time: at(-1) }, RETRY],
    ["failed payments only, before the deadline", lost, RETRY],
    ["no payment, exactly at the deadline", { server_time: at(0) }, CLOSED],
    ["no payment, past the deadline", late, CLOSED],
    ["failed", failed, CLOSED],
    ["failed, a payment reported", { ...failed, ...paid }, CLOSED],
    ["expired", expired, CLOSED],
    ["expired, no deadline", { ...expired, ...open }, CLOSED],
    // A hold (0005) is a payment known and not yet confirmed: its own signed capture clears it — never a "check".
    ["held: authorised only", held("authorized_only"), PAYMENT],
    ["held: a capture not yet verified", held("capture_unverified"), PAYMENT],
    [
      "held, past its deadline",
      { ...held("capture_unverified"), ...late },
      PAYMENT,
    ],
    ["held, no deadline", { ...held("authorized_only"), ...open }, PAYMENT],
    [
      "held, but no longer pending",
      { ...held("capture_unverified"), ...expired },
      REVIEW,
    ],
    [
      "held and captured",
      { ...held("authorized_only"), ...captured },
      CONFIRMED,
    ],
  ])("a pending order, or: %s", (_label, overrides, expected) => {
    expect(state(overrides)).toEqual(expected);
  });

  it("judges the deadline by the row's own server_time, never by this machine's clock", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2040-01-01T00:00:00.000Z"));
    expect(state({ server_time: at(-1) })).toEqual(RETRY);
    vi.setSystemTime(new Date("2000-01-01T00:00:00.000Z"));
    expect(state({ server_time: at(0) })).toEqual(CLOSED);
  });

  it("says confirmed for a captured order and for nothing else, whatever the rest of the row holds", () => {
    const statuses = ["pending", "captured", "failed", "expired"] as const;
    const kinds = ["reported", "authorized", "captured", "failed"] as const;
    const payments = [counts(), ...kinds.map((kind) => counts({ [kind]: 1 }))];
    let judged = 0;
    for (const payment_status of statuses)
      for (const needs_review of [false, true])
        for (const expires_at of [null, DEADLINE])
          for (const server_time of [at(-1), at(0), at(1)])
            for (const known of payments) {
              const facts = { payment_status, needs_review, expires_at };
              const page = state({ ...facts, server_time, payments: known });
              expect(page.state === "confirmed").toBe(
                payment_status === "captured",
              );
              judged += 1;
            }
    expect(judged).toBe(240);
  });
});

describe("mergeOrderPageState and isSettledOrderState", () => {
  it("keeps confirmed against every later answer, and otherwise lets the answer stand — forwards or backwards", () => {
    for (const answer of STATES) {
      expect(mergeOrderPageState(CONFIRMED, answer)).toEqual(CONFIRMED);
      for (const shown of [PAYMENT, REVIEW, RETRY, CLOSED])
        expect(mergeOrderPageState(shown, answer)).toBe(answer);
    }
  });

  it("treats only confirming as a state that can still change by itself", () => {
    const settled = STATES.filter(isSettledOrderState);
    expect(settled).toEqual([CONFIRMED, RETRY, CLOSED]);
  });
});

describe("orderViewOf — the customer's projection", () => {
  const keys = (value: object) => Object.keys(value).sort().join(" ");

  it("carries the order, its rows and its totals — and no contact, address, token, link hash or internal id", () => {
    const view = orderViewOf(REPORTED);
    expect(keys(view)).toBe(
      "attempt_hash items order_number placed_at shipping_paise status subtotal_paise synthetic tax_paise total_paise",
    );
    for (const item of view.items)
      expect(keys(item)).toBe(
        "artwork_slug artwork_title finish_code finish_name line_total_paise orientation quantity unit_price_paise variant_code",
      );
    expect(JSON.stringify(view)).not.toMatch(INTERNAL);
    expect([view.status, view.placed_at]).toEqual([PAYMENT, NOW.toISOString()]);
  });

  it("writes money as decimal strings of the exact paise and keeps unknown charges null", () => {
    const view = orderViewOf(row());
    const [first, second] = view.items;
    expect([view.subtotal_paise, view.total_paise]).toEqual(
      Array(2).fill("6100000"),
    );
    expect([first.unit_price_paise, first.line_total_paise]).toEqual([
      "2100000",
      "4200000",
    ]);
    expect(second.line_total_paise).toBe("1900000");
    expect([view.shipping_paise, view.tax_paise]).toEqual([null, null]);
    const charges = { shipping_paise: BigInt(0), tax_paise: BigInt(1) };
    const large = { ...charges, total_paise: BigInt("99999999999") };
    const { shipping_paise, tax_paise, total_paise } = orderViewOf(row(large));
    expect([shipping_paise, tax_paise]).toEqual(["0", "1"]);
    expect(total_paise).toBe("99999999999");
  });

  it("passes the checkout attempt's hash through, null included", () => {
    const unattempted = row({ checkout_attempt_hash: null });
    expect(orderViewOf(row()).attempt_hash).toBe(ATTEMPT_HASH);
    expect(orderViewOf(unattempted).attempt_hash).toBeNull();
  });
});

type View = PaymentResult<OrderConfirmationRow | null> | Error;
type Arranged = {
  /** The privileged client: "none" — it cannot be made; "once" — it can be made for the first read only. */
  client?: "none" | "once";
  gate?: PaymentsGate;
  throttle?: ThrottleOutcome;
  payments?: OrderPaymentsOutcome;
  hold?: PaymentResult<ProviderCheckRecord>;
};

const found = (value: OrderConfirmationRow | null): View => ({
  ok: true,
  value,
});
const refused = (refusal: PaymentRefusal) => ({ ok: false, refusal }) as const;
const DOWN = refused("unavailable");
const NOT_FOUND = { status: "not_found" };
const UNAVAILABLE = { status: "unavailable" };
const answer = (state: OrderPageState) => ({ status: "ok", state });

const CREDENTIALS = {
  keyId: "rzp_test_PLACEHOLDER0001",
  keySecret: "placeholder-key-secret",
};
const GATE_OPEN: PaymentsGate = {
  open: true,
  config: {
    context: "preview",
    projectRef: "abcdefghijklmnopqrst",
    razorpayKeyId: CREDENTIALS.keyId,
    razorpayKeySecret: CREDENTIALS.keySecret,
    razorpayWebhookSecret: "placeholder-webhook-secret",
    orderTokenSecret: "S".repeat(43),
  },
};
const ALLOWED: ThrottleOutcome = { ok: true };
const HOLD: PaymentResult<ProviderCheckRecord> = {
  ok: true,
  value: {
    held: true,
    paymentStatus: "pending",
    needsReview: true,
    paymentHold: "capture_unverified",
  },
};
const listing = (...statuses: string[]): OrderPaymentsOutcome => ({
  outcome: "found",
  payments: statuses.map((status) => ({ id: PAYMENT_ID, status })),
});

/**
 * Every double the order's server code is given: the confirmation read answers `views` in order (the last one again
 * after that), the gate is open, the request allowed, the hold recordable and the provider lists no payment unless
 * `arranged` says otherwise. `calls` is the one log of every database, gate, quota and provider call — in order,
 * with its arguments — so one comparison shows what was read, asked and written, and that nothing else was.
 */
function doubles(views: View[], arranged: Arranged = {}) {
  const calls: unknown[][] = [];
  const reports: string[] = [];
  const made = { clients: 0, reads: 0 };
  const step =
    <T>(name: string, answerOf: () => T) =>
    async (...given: unknown[]): Promise<T> => {
      calls.push([name, ...given]);
      return answerOf();
    };
  const store: PaymentStore = {
    recordEvent: step("recordEvent", () => DOWN),
    processEvent: step("processEvent", () => DOWN),
    returnState: step("returnState", () => DOWN),
    recordProviderCheck: step("hold", () => arranged.hold ?? HOLD),
    confirmationView: step("read", () => {
      const view = views[Math.min(made.reads, views.length - 1)];
      made.reads += 1;
      if (view instanceof Error) throw view;
      return view;
    }),
  };
  const deps: OrderStatusDependencies = {
    store: () => {
      made.clients += 1;
      if (arranged.client === "none") return null;
      return arranged.client === "once" && made.clients > 1 ? null : store;
    },
    gate: () => {
      calls.push(["gate"]);
      return arranged.gate ?? GATE_OPEN;
    },
    throttle: step("throttle", () => arranged.throttle ?? ALLOWED),
    fetchPayments: step("fetch", () => arranged.payments ?? listing()),
    report: (message) => {
      reports.push(message);
    },
  };
  return { calls, reports, made, deps };
}

/** The names of the calls made, in order. */
const steps = (calls: unknown[][]) => calls.map(([name]) => name).join(" ");

const MALFORMED_TOKENS: Array<[string, unknown]> = [
  ["empty", ""],
  ["too short", TOKEN.slice(0, 42)],
  ["too long", `${TOKEN}a`],
  ["an illegal character", `${TOKEN.slice(0, 42)}=`],
  ["a slash", `${TOKEN.slice(0, 42)}/`],
  ["a space", `${TOKEN.slice(0, 42)} `],
  ["a trailing newline", `${TOKEN}\n`],
  ["a number", 42],
  ["null", null],
  ["undefined", undefined],
  ["an array holding a token", [TOKEN]],
  ["an object", { token: TOKEN }],
];

describe("readOrder — the order behind a confirmation link", () => {
  const near = TOKEN_HASH.replace(/.$/, (last) => (last === "0" ? "1" : "0"));
  const OTHERS = row({ confirmation_token_hash: "d".repeat(64) });
  const NEAR = row({ confirmation_token_hash: near });

  it.each(MALFORMED_TOKENS)(
    "answers not_found for a malformed token (%s) without a store call",
    async (_label, token) => {
      const { calls, made, deps } = doubles([found(row())]);
      expect(await readOrder(token, deps)).toEqual(NOT_FOUND);
      expect([calls, made.clients]).toEqual([[], 0]);
    },
  );

  it("reads a well-formed token by its SHA-256 only: the token itself never reaches the store", async () => {
    const { calls, deps } = doubles([found(row())]);
    expect(await readOrder(TOKEN, deps)).toEqual({ status: "ok", row: row() });
    expect(calls).toEqual([["read", TOKEN_HASH]]);
    expect(TOKEN_HASH).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(calls)).not.toContain(TOKEN);
  });

  it.each<[string, View, object]>([
    ["no row", found(null), NOT_FOUND],
    ["an unavailable database", DOWN, UNAVAILABLE],
    ["a refused request", refused("invalid_request"), NOT_FOUND],
    ["any other refusal", refused("state_conflict"), UNAVAILABLE],
    ["a row stored under another link's hash", found(OTHERS), NOT_FOUND],
    ["a row whose hash differs in one digit", found(NEAR), NOT_FOUND],
  ])(
    "answers %s as its own status, after one read",
    async (_label, view, to) => {
      const { calls, deps } = doubles([view]);
      expect(await readOrder(TOKEN, deps)).toEqual(to);
      expect(calls).toEqual([["read", TOKEN_HASH]]);
    },
  );

  it("answers unavailable — never not_found — when the privileged client cannot be made", async () => {
    const { calls, deps } = doubles([found(row())], { client: "none" });
    expect(await readOrder(TOKEN, deps)).toEqual(UNAVAILABLE);
    expect(calls).toEqual([]);
  });
});

describe("orderRouteAnswer — the proxy's question", () => {
  it.each([
    "/order",
    "/order/",
    "/order/a/b",
    `/order/${TOKEN}/extra`,
    `/orders/${TOKEN}`,
    "/order/short",
    `/order/${TOKEN}a`,
    `/order/${TOKEN.slice(0, 42)}.`,
    MISSING_ORDER_REWRITE,
  ])("answers missing for %s without a store call", async (pathname) => {
    const { calls, made, deps } = doubles([found(row())]);
    expect(await orderRouteAnswer(pathname, deps)).toBe("missing");
    expect([calls, made.clients]).toEqual([[], 0]);
  });

  it.each<[string, string, View, Arranged]>([
    ["missing", "a token no order has", found(null), {}],
    ["missing", "a refused request", refused("invalid_request"), {}],
    ["render", "a known order", found(row()), {}],
    ["render", "a database that is unavailable", DOWN, {}],
    ["render", "a read that throws", new Error("connection reset"), {}],
    ["render", "no privileged client", found(null), { client: "none" }],
  ])("answers %s for %s", async (expected, _label, view, arranged) => {
    const { calls, deps } = doubles([view], arranged);
    expect(await orderRouteAnswer(ORDER_PATH, deps)).toBe(expected);
    expect(calls).toEqual(arranged.client ? [] : [["read", TOKEN_HASH]]);
  });

  it("takes a trailing slash as the same page, and a client that throws as an order it could not read", async () => {
    const { calls, deps } = doubles([found(row())]);
    expect(await orderRouteAnswer(`${ORDER_PATH}/`, deps)).toBe("render");
    expect(calls).toEqual([["read", TOKEN_HASH]]);
    const store = (): never => {
      throw new Error("no client");
    };
    expect(await orderRouteAnswer(ORDER_PATH, { store })).toBe("render");
  });

  it("rewrites a missing order to a path that is neither an order page's nor token-shaped", () => {
    const segments = MISSING_ORDER_REWRITE.split("/");
    expect(segments).toHaveLength(4);
    expect(segments.slice(0, 2)).toEqual(["", "order"]);
    expect(MISSING_ORDER_REWRITE).not.toMatch(/^\/order\/[^/]+\/?$/);
    expect(MISSING_ORDER_REWRITE).not.toMatch(ORDER_PATH_PATTERN);
    expect(segments.filter(isConfirmationToken)).toEqual([]);
  });
});

describe("orderStatus — the page's status question", () => {
  const status = (
    deps: OrderStatusDependencies,
    askProvider = true,
    token: unknown = TOKEN,
  ) => orderStatus(token, { askProvider, address: ADDRESS }, deps);
  const captured = { payments: listing("captured") };
  const asked = [
    ["read", TOKEN_HASH],
    ["gate"],
    ["throttle", "resume", ADDRESS],
    ["fetch", PROVIDER_ORDER_ID, CREDENTIALS],
  ];
  const SHUT: PaymentsGate = { open: false, reason: "production" };
  const LIMITED: ThrottleOutcome = { ok: false, reason: "rate_limited" };
  const NO_QUOTA: ThrottleOutcome = { ok: false, reason: "unavailable" };
  const NO_PROVIDER: OrderPaymentsOutcome = { outcome: "unavailable" };
  const FETCHED = "gate throttle fetch";
  const both = counts({ reported: 1, authorized: 1 });
  const firmer = counts({ reported: 1, captured: 1 });

  it.each<[string, OrderConfirmationRow, OrderPageState]>([
    ["a captured order", CAPTURED, CONFIRMED],
    ["a reported payment", REPORTED, PAYMENT],
    ["an order under review", UNDER_REVIEW, REVIEW],
    ["an unpaid order before its deadline", row(), RETRY],
    ["an expired order", EXPIRED, CLOSED],
  ])(
    "without askProvider answers %s from the row alone — no gate, quota or provider",
    async (_label, stored, state) => {
      const { calls, deps } = doubles([found(stored)], captured);
      expect(await status(deps, false)).toStrictEqual(answer(state));
      expect(calls).toEqual([["read", TOKEN_HASH]]);
    },
  );

  it.each<[string, Partial<OrderConfirmationRow>, OrderPageState]>([
    ["already captured", CAPTURED, CONFIRMED],
    ["under review", UNDER_REVIEW, REVIEW],
    ["without a reported payment", row(), RETRY],
    ["with an authorised payment as well", { payments: both }, PAYMENT],
    ["with a captured payment as well", { payments: firmer }, PAYMENT],
    ["not linked", { provider_order_state: "requested" }, PAYMENT],
    ["without a provider order id", { provider_order_id: null }, PAYMENT],
    ["without a payment attempt", { payment_attempt_id: null }, PAYMENT],
    ["failed", { payment_status: "failed" }, CLOSED],
    ["expired", { payment_status: "expired" }, CLOSED],
  ])(
    "with askProvider never asks the provider about an order %s",
    async (_label, overrides, state) => {
      const stored = row({ ...REPORTED, ...overrides });
      const { calls, deps } = doubles([found(stored)], captured);
      expect(await status(deps)).toStrictEqual(answer(state));
      expect(calls).toEqual([["read", TOKEN_HASH]]);
    },
  );

  it("asks the provider exactly once for a reported payment — after the gate and the resume quota, with the stored order id", async () => {
    const { calls, deps } = doubles([found(REPORTED), found(CAPTURED)]);
    expect(await status(deps)).toStrictEqual(answer(PAYMENT));
    expect(calls).toEqual(asked);
  });

  it.each(["captured", "authorized"] as const)(
    "records the hold for a payment the provider shows as %s and reads the state again — the provider's word confirms nothing",
    async (standing) => {
      const payments = listing("failed", standing);
      // The hold the check raised, as 0005 writes it: the flag together with the hold — a payment being confirmed.
      const hold =
        standing === "captured" ? "capture_unverified" : "authorized_only";
      const heldOrder = row({
        ...REPORTED,
        needs_review: true,
        payment_hold: hold,
      });
      const views = [found(REPORTED), found(heldOrder)];
      const { calls, deps } = doubles(views, { payments });
      const held = ["hold", PA_ID, PAYMENT_ID, standing];
      expect(await status(deps)).toStrictEqual(answer(PAYMENT));
      expect(calls).toEqual([...asked, held, ["read", TOKEN_HASH]]);
      // The answer is the second read's, not the first's: a signed capture that confirmed the order meanwhile.
      const confirmedMeanwhile = doubles([found(REPORTED), found(CAPTURED)], {
        payments,
      });
      expect(await status(confirmedMeanwhile.deps)).toStrictEqual(
        answer(CONFIRMED),
      );
    },
  );

  it.each<[string, Arranged, string]>([
    ["a closed gate", { gate: SHUT }, "gate"],
    ["a spent quota", { throttle: LIMITED }, "gate throttle"],
    ["an unreachable quota", { throttle: NO_QUOTA }, "gate throttle"],
    ["no client for the provider step", { client: "once" }, "gate"],
    ["an unavailable provider", { payments: NO_PROVIDER }, FETCHED],
    ["a payment still in flight", { payments: listing("created") }, FETCHED],
    ["an unknown payment status", { payments: listing("refunded") }, FETCHED],
    ["only failed payments", { payments: listing("failed") }, FETCHED],
    ["no payment listed", {}, FETCHED],
    ["an unwritten hold", { ...captured, hold: DOWN }, `${FETCHED} hold`],
  ])(
    "leaves the state exactly as the database has it on %s, and records nothing",
    async (_label, arranged, after) => {
      const views = [found(REPORTED), found(CAPTURED)];
      const { calls, reports, deps } = doubles(views, arranged);
      expect(await status(deps)).toStrictEqual(answer(PAYMENT));
      expect(steps(calls)).toBe(`read ${after}`);
      expect(reports.join(" ")).not.toMatch(INTERNAL);
      expect(reports.join(" ")).not.toContain(PAYMENT_ID);
    },
  );

  it("keeps the state it read first when the second read fails", async () => {
    const { calls, deps } = doubles([found(REPORTED), DOWN], captured);
    expect(await status(deps)).toStrictEqual(answer(PAYMENT));
    expect(steps(calls)).toBe("read gate throttle fetch hold read");
  });

  it.each<[string, unknown, View, object, string]>([
    ["a malformed token", "short", found(REPORTED), NOT_FOUND, ""],
    ["an unknown token", TOKEN, found(null), NOT_FOUND, "read"],
    ["an unreadable order", TOKEN, DOWN, UNAVAILABLE, "read"],
  ])(
    "passes %s through as its status alone, without a provider question",
    async (_label, token, view, expected, made) => {
      const { calls, deps } = doubles([view], captured);
      expect(await status(deps, true, token)).toStrictEqual(expected);
      expect(steps(calls)).toBe(made);
    },
  );
});

type Said = OrderPageState | "not_found" | "unavailable" | "throws";
type Schedule = Pick<OrderPollOptions, "delays" | "providerQuestions">;

/**
 * Runs the poll over scripted answers ("throws": the question fails; past the script every answer is `PAYMENT`),
 * from `PAYMENT` unless `initial` says otherwise; the page is left once `leftAfter` questions were asked.
 */
async function poll(
  script: Said[],
  options: Partial<Schedule> & {
    initial?: OrderPageState;
    leftAfter?: number;
  } = {},
) {
  const { initial = PAYMENT, leftAfter = Infinity, ...schedule } = options;
  const asked: boolean[] = [];
  const shown: OrderPageState[] = [];
  const waits: number[] = [];
  const end = await runOrderPoll({
    ...schedule,
    initial,
    ask: async (askProvider): Promise<OrderStatusAnswer> => {
      asked.push(askProvider);
      const said = script[asked.length - 1] ?? PAYMENT;
      if (said === "throws") throw new Error("offline");
      if (typeof said === "string") return { status: said };
      return { status: "ok", state: said };
    },
    onState: (state) => {
      shown.push(state);
    },
    cancelled: () => asked.length >= leftAfter,
    pause: async (milliseconds) => {
      waits.push(milliseconds);
    },
  });
  return { end, asked, shown, waits };
}

describe("runOrderPoll — the order page's bounded status poll", () => {
  it.each([CONFIRMED, RETRY, CLOSED])(
    "asks nothing and waits for nothing when the page starts settled (%o)",
    async (initial) => {
      const run = await poll([CONFIRMED], { initial });
      expect(run).toEqual({ end: "settled", asked: [], shown: [], waits: [] });
    },
  );

  it("stops at the first settled answer: a later answer that says less is never asked for or shown", async () => {
    const run = await poll([PAYMENT, REVIEW, CONFIRMED, PAYMENT]);
    expect(run.end).toBe("settled");
    expect([run.asked.length, run.shown]).toEqual([3, [REVIEW, CONFIRMED]]);
    const failed = await poll([CLOSED, CONFIRMED]);
    expect(failed.end).toBe("settled");
    expect([failed.asked.length, failed.shown]).toEqual([1, [CLOSED]]);
  });

  it("ends as gone on not_found, without another question and without a change", async () => {
    const run = await poll(["not_found", CONFIRMED]);
    expect([run.end, run.asked.length, run.shown]).toEqual(["gone", 1, []]);
  });

  it("changes nothing on a question that throws or answers unavailable, and goes on", async () => {
    const run = await poll(["throws", "unavailable", CONFIRMED]);
    expect(run.end).toBe("settled");
    expect([run.asked.length, run.shown]).toEqual([3, [CONFIRMED]]);
  });

  it("stops without another question once the page was left — before a question, and with its answer discarded", async () => {
    const before = await poll([CONFIRMED], { leftAfter: 0 });
    expect(before).toMatchObject({ end: "cancelled", asked: [], shown: [] });
    const during = await poll([CONFIRMED, CONFIRMED], { leftAfter: 1 });
    expect([during.end, during.asked.length]).toEqual(["cancelled", 1]);
    expect(during.shown).toEqual([]);
  });

  it("is exhausted after the last delay, having waited each delay once in order", async () => {
    const run = await poll([], { delays: [7, 11, 13] });
    expect(run.end).toBe("exhausted");
    expect([run.asked.length, run.shown]).toEqual([3, []]);
    expect(run.waits).toEqual([7, 11, 13]);
  });

  it("asks the provider at exactly the configured questions", async () => {
    const providerQuestions = new Set([1, 4]);
    const delays = [1, 1, 1, 1, 1, 1];
    const run = await poll([], { delays, providerQuestions });
    expect(run.asked).toEqual([false, true, false, false, true, false]);
  });

  it("by default asks 27 questions in 6 min 45 s — 5 × 3 s, 6 × 5 s, 6 × 10 s, 10 × 30 s — the provider at 6, 12, 17, 21 and 26", async () => {
    const of = (times: number, ms: number) => Array<number>(times).fill(ms);
    const schedule = [of(5, 3000), of(6, 5000), of(6, 10000), of(10, 30000)];
    expect(ORDER_POLL_DELAYS_MS).toEqual(schedule.flat());
    const configured = [...ORDER_PROVIDER_QUESTIONS].sort((a, b) => a - b);
    const run = await poll([]);
    const provider = run.asked.flatMap((flag, index) => (flag ? [index] : []));
    expect([run.end, run.asked.length]).toEqual(["exhausted", 27]);
    expect(configured).toEqual([6, 12, 17, 21, 26]);
    expect(provider).toEqual([6, 12, 17, 21, 26]);
    expect(run.waits).toEqual(schedule.flat());
    expect(run.waits.reduce((total, wait) => total + wait, 0)).toBe(405000);
  });
});

describe("the bag after a purchase", () => {
  const TIDE = "a-quiet-tide:antique-gold";
  const bag = (...rows: Array<[string, number]>) =>
    rows.map(([code, quantity]) => ({ code, quantity }));
  const bought = (...rows: Array<[string, number]>) =>
    rows.map(([variant_code, quantity]) => ({ variant_code, quantity }));
  const ITEMS = bought([LANTERN, 2], [HARBOUR, 1]);
  const EXACT = bag([HARBOUR, 1], [LANTERN, 2]);
  const CHANGED = {
    "an extra row": bag([HARBOUR, 1], [LANTERN, 2], [TIDE, 1]),
    "a missing row": bag([LANTERN, 2]),
    "another quantity": bag([HARBOUR, 1], [LANTERN, 3]),
    "another artwork in a row's place": bag([HARBOUR, 1], [TIDE, 1]),
    "an empty bag": bag(),
  };
  const holding = (rows: typeof EXACT, hydrated = true) => ({
    bag: { hydrated, rows },
  });
  const decide = (overrides: Partial<PurchasedBagFacts> = {}) =>
    purchasedBagDecision({
      state: CONFIRMED,
      storedKeyHash: ATTEMPT_HASH,
      orderAttemptHash: ATTEMPT_HASH,
      ...holding(EXACT),
      items: ITEMS,
      ...overrides,
    });

  it("clears for this browser's confirmed order whose read bag holds exactly the purchase, in any order", () => {
    expect(decide()).toBe("clear");
    expect(decide(holding([...EXACT].reverse()))).toBe("clear");
  });

  it.each(Object.entries(CHANGED))(
    "releases the key and leaves the bag alone when the order is confirmed but the bag has %s",
    (_label, rows) => {
      expect(decide(holding(rows))).toBe("release");
    },
  );

  it.each([CLOSED, REVIEW])(
    "releases the key when this browser's order is %o, whatever the bag holds",
    (state) => {
      expect(decide({ state })).toBe("release");
      expect(decide({ state, ...holding([], false) })).toBe("release");
    },
  );

  it.each<[string, Partial<PurchasedBagFacts>]>([
    ["another browser's key", { storedKeyHash: "e".repeat(64) }],
    ["no stored key", { storedKeyHash: null }],
    ["an order no checkout attempt placed", { orderAttemptHash: null }],
    ["neither hash", { storedKeyHash: null, orderAttemptHash: null }],
    ["a bag not read yet", holding(EXACT, false)],
    ["a payment still being confirmed", { state: PAYMENT }],
    ["an order that can still be paid for", { state: RETRY }],
  ])("keeps everything with %s", (_label, overrides) => {
    expect(decide(overrides)).toBe("keep");
  });

  it.each(["authorized_only", "capture_unverified"] as const)(
    "keeps the key through a %s hold, so the capture that clears it then takes exactly the purchase out of the bag",
    (payment_hold) => {
      // The stored order as 0005 leaves it: pending, flagged, the hold its own capture clears.
      const heldOrder = orderPageState({
        ...row(),
        needs_review: true,
        payment_hold,
      });
      expect(heldOrder).toEqual(PAYMENT);
      expect(decide({ state: heldOrder })).toBe("keep");
      // The signed capture confirms it: the same browser, the same key, the bag as it was bought.
      const confirmedOrder = orderPageState({
        ...row(),
        payment_status: "captured",
        payments: counts({ captured: 1 }),
      });
      expect(decide({ state: confirmedOrder })).toBe("clear");
    },
  );

  it("releases the key for a flag that is not a hold — a check a person makes", () => {
    const flagged = orderPageState({
      ...row(),
      needs_review: true,
      payment_hold: null,
    });
    expect(flagged).toEqual(REVIEW);
    expect(decide({ state: flagged })).toBe("release");
  });

  it("never clears outside the one case, across every state, key, hydration and bag", () => {
    for (const state of STATES)
      for (const storedKeyHash of [ATTEMPT_HASH, "e".repeat(64), null])
        for (const orderAttemptHash of [ATTEMPT_HASH, null])
          for (const hydrated of [true, false])
            for (const rows of [EXACT, ...Object.values(CHANGED)]) {
              const hashes = { storedKeyHash, orderAttemptHash };
              const theCase =
                state === CONFIRMED &&
                storedKeyHash === ATTEMPT_HASH &&
                orderAttemptHash === ATTEMPT_HASH &&
                hydrated &&
                rows === EXACT;
              const facts = { state, ...hashes, ...holding(rows, hydrated) };
              expect(decide(facts) === "clear").toBe(theCase);
            }
  });

  it("bagEqualsPurchase is true only for the same codes in the same quantities — never for an empty bag or duplicate purchase codes", () => {
    expect(bagEqualsPurchase(EXACT, ITEMS)).toBe(true);
    for (const rows of Object.values(CHANGED))
      expect(bagEqualsPurchase(rows, ITEMS)).toBe(false);
    expect(bagEqualsPurchase([], [])).toBe(false);
    const twice = bought([LANTERN, 2], [LANTERN, 2]);
    expect(bagEqualsPurchase(EXACT, twice)).toBe(false);
    const doubled = bag([LANTERN, 2], [LANTERN, 2]);
    expect(bagEqualsPurchase(doubled, twice)).toBe(false);
  });
});

const NOT_ORDER_PATHS = [
  "/checkout",
  "https://evil.example/order/x",
  `https://evil.example${ORDER_PATH}`,
  "/order/short",
  "//evil.example",
  `/${ORDER_PATH}`,
  `${ORDER_PATH}/`,
  `${ORDER_PATH}?next=//evil.example`,
  ` ${ORDER_PATH}`,
];

describe("the checkout page's mapping of the three S1.7 answers", () => {
  const known = (status: "confirming" | "confirmed", path: string | null) => ({
    status,
    order_number: ORDER_NUMBER,
    order_path: path,
  });
  const notice = (shown: object, block: boolean) => ({
    do: "notice",
    notice: shown,
    forget: false,
    recheckBag: false,
    block,
  });

  it.each(["confirming", "confirmed"] as const)(
    "leaves for the order's page on %s with a path of exactly that shape — a pay press and the load-time question alike",
    (status) => {
      const leave = { do: "order", path: ORDER_PATH };
      expect(submitStep(known(status, ORDER_PATH))).toEqual(leave);
      expect(resumeStep(known(status, ORDER_PATH))).toEqual(leave);
    },
  );

  it.each([null, ...NOT_ORDER_PATHS])(
    "never navigates for the path %j: a known payment says so, a confirmed order is not payable here, and no pay button is offered",
    (path) => {
      const waiting = { id: "confirming", orderNumber: ORDER_NUMBER };
      const held = { id: "held" };
      const paying = known("confirming", path);
      const done = known("confirmed", path);
      expect(submitStep(paying)).toEqual(notice(waiting, true));
      expect(resumeStep(paying)).toEqual(notice(waiting, true));
      expect(submitStep(done)).toEqual(notice(held, true));
      expect(resumeStep(done)).toEqual(notice(held, false));
    },
  );

  it("takes the pay button away on uncertain, for a pay press and for the load-time question", () => {
    const uncertain = notice({ id: "uncertain" }, true);
    expect(submitStep({ status: "uncertain" })).toEqual(uncertain);
    expect(resumeStep({ status: "uncertain" })).toEqual(uncertain);
  });
});

type Returned = CheckoutReturnResult | "throws";

/** Runs `settleReturn` over scripted answers (the last one repeats): the path, the questions asked and the waits. */
async function settle(script: Returned[], leftAfter = Infinity) {
  let asked = 0;
  const waits: number[] = [];
  const path = await settleReturn(
    async () => {
      const said = script[Math.min(asked, script.length - 1)];
      asked += 1;
      if (said === "throws") throw new Error("offline");
      return said;
    },
    () => asked >= leftAfter,
    async (milliseconds) => {
      waits.push(milliseconds);
    },
  );
  return [path, asked, waits];
}

describe("settleReturn — the verification of what Razorpay's window reported", () => {
  const verified = (order_path: string): Returned => ({
    status: "verified",
    order_path,
  });
  const VERIFIED = verified(ORDER_PATH);
  const REJECTED: Returned = { status: "rejected" };
  const UNREACHED: Returned = { status: "unavailable" };

  it("answers the order's path for a verified report, and null for a rejected or a throttled one — asked once", async () => {
    expect(await settle([VERIFIED])).toEqual([ORDER_PATH, 1, []]);
    expect(await settle([REJECTED, VERIFIED])).toEqual([null, 1, []]);
    const throttled = await settle([{ status: "throttled" }, VERIFIED]);
    expect(throttled).toEqual([null, 1, []]);
  });

  it.each<[string, Returned]>([
    ["an unavailable verification", UNREACHED],
    ["an action that throws", "throws"],
  ])(
    "asks again after %s at most twice more, two seconds apart, then answers null",
    async (_label, failure) => {
      expect([RETURN_RETRY_LIMIT, RETURN_RETRY_MS]).toEqual([2, 2000]);
      expect(await settle([failure])).toEqual([null, 3, [2000, 2000]]);
      const second = await settle([failure, VERIFIED]);
      expect(second).toEqual([ORDER_PATH, 2, [2000]]);
      expect(await settle([failure, REJECTED])).toEqual([null, 2, [2000]]);
    },
  );

  it.each(NOT_ORDER_PATHS)(
    "answers null for a verified report whose path is %j",
    async (path) => {
      expect(await settle([verified(path)])).toEqual([null, 1, []]);
    },
  );

  it("stops once the page was left: no question before, none after", async () => {
    expect(await settle([VERIFIED], 0)).toEqual([null, 0, []]);
    expect(await settle([UNREACHED, VERIFIED], 1)).toEqual([null, 1, [2000]]);
  });
});

/** Every string of a copy object; a sentence that takes the order number is written with one. */
function linesOf(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value === "function")
    return linesOf((value as (orderNumber: string) => unknown)(ORDER_NUMBER));
  if (typeof value === "object" && value !== null)
    return Object.values(value).flatMap(linesOf);
  return [];
}

describe("the order page's copy", () => {
  const { ORDER_CONFIRMED, ORDER_CONFIRMING, ORDER_FAILED, ORDER_HEAD } =
    ORDER_COPY;
  const notices = [
    CHECKOUT_NOTICES.confirming(ORDER_NUMBER),
    CHECKOUT_NOTICES.uncertain,
  ];
  const all = [...linesOf({ ...ORDER_COPY }), ...notices];
  const unconfirmed = linesOf([ORDER_CONFIRMING, ORDER_FAILED, notices]);

  it("claims no payment and no confirmation in any line of the confirming and failed states", () => {
    expect(unconfirmed.length).toBeGreaterThanOrEqual(14);
    for (const line of unconfirmed) {
      expect(line).not.toMatch(
        /\b(received|taken|successful|successfully|succeeded|completed|thank you)\b/i,
      );
      expect(line).not.toMatch(/\b(is|are|was|were) (now )?confirmed\b/i);
    }
  });

  it("says an order is confirmed in exactly one sentence: the confirmed state's status", () => {
    const confirmed = all.filter((line) => /\bis confirmed\b/i.test(line));
    expect(confirmed).toEqual([ORDER_CONFIRMED.status(ORDER_NUMBER)]);
    expect(confirmed[0]).toContain(ORDER_NUMBER);
  });

  it("tells the customer not to pay again in every confirming sentence", () => {
    const { payment, review, stillWaiting } = ORDER_CONFIRMING;
    const said = [payment.status(ORDER_NUMBER), review.status(ORDER_NUMBER)];
    for (const line of [...said, ...notices])
      expect(line).toContain("do not pay again");
    expect(stillWaiting).toContain("do not need to pay again");
  });

  it("promises nothing a later sprint makes true: no amount, email, receipt, sending or sample in any line", () => {
    for (const line of all) {
      expect(line).not.toContain("₹");
      expect(line).not.toMatch(/e-?mail|receipt|\bsent\b|\bsample\b/i);
    }
  });

  it("puts no token-like value in the head", () => {
    for (const line of [ORDER_HEAD.title, ORDER_HEAD.description]) {
      expect(line).not.toMatch(/[A-Za-z0-9_-]{20,}/);
      expect(line).not.toContain("/order");
    }
  });
});

describe("the order page's server render", () => {
  const { ORDER_CONFIRMING } = ORDER_COPY;
  const ask = async (): Promise<OrderStatusAnswer> => ({
    status: "unavailable",
  });
  const render = (stored: OrderConfirmationRow) => {
    const props = { view: orderViewOf(stored), token: TOKEN, ask };
    return renderToStaticMarkup(createElement(OrderConfirmation, props));
  };
  /** The words a reader sees: the markup without its tags. */
  const textOf = (html: string) => html.replace(/<[^>]+>/g, " ");
  const WATCHER = "data-test-watcher";
  const PAID = { ...CAPTURED, synthetic: false };
  const PAST = row({ server_time: at(0) });

  it("confirmed: the approved heading and line, the status sentence as a status, the order and its rows", () => {
    const html = render(PAID);
    const href = "/artworks/the-lantern-that-outlasted-the-gale";
    const title = "The Lantern That Outlasted the Gale";
    expect(html).toContain("<h1>A beautiful choice.</h1>");
    expect(html).toContain("<p>Made with care. Soon, part of your home.</p>");
    expect(html).toMatch(
      / role="status"[^>]*>Order AS-1001 is confirmed\.<\/p>/,
    );
    expect(html).toContain("Order: <strong>AS-1001</strong>");
    expect(html).toContain(`Date: ${orderDate("2026-11-22T18:45:00.000Z")}`);
    expect(html).toMatch(new RegExp(`<a[^>]*href="${href}"[^>]*>${title}</a>`));
    expect(html).toContain("<p>A2 Portrait · Black frame</p><p>Quantity 2</p>");
    expect(html).toContain("<strong>₹42,000</strong> <small>(₹21,000 each)");
    expect(html).toContain("<p>A2 Landscape · White frame</p><p>Quantity 1<");
    expect(html).toContain("<strong>₹19,000</strong></p>");
    expect(html.match(/each\)/g)).toHaveLength(1);
    expect(html.match(/<article /g)).toHaveLength(2);
    expect(html).toContain("data-test-bag");
    expect(html).not.toMatch(new RegExp(`${WATCHER}|<noscript>`));
  });

  it("totals: the subtotal, unknown charges as “To be confirmed” — never a zero — and their sum once both are known", () => {
    const [shipping_paise, tax_paise] = [BigInt(50000), BigInt(25000)];
    const charges = "<dt>Shipping &amp; tax</dt><dd>";
    const html = render(PAID);
    expect(html).toContain("<dt>Artwork subtotal</dt><dd>₹61,000</dd>");
    expect(html).toContain(`${charges}To be confirmed</dd>`);
    expect(html).not.toContain("₹0");
    const half = render({ ...PAID, shipping_paise });
    expect(half).toContain(`${charges}To be confirmed</dd>`);
    const known = render({ ...PAID, shipping_paise, tax_paise });
    expect(known).toContain(`${charges}₹750</dd>`);
    expect(known).not.toContain("To be confirmed");
  });

  it("names the amount “Amount paid” only on a confirmed order that is not a test order; a test order says that it is one", () => {
    const paid = render(PAID);
    expect(paid).toMatch(/<dt>Amount paid<\/dt><dd[^>]*>₹61,000<\/dd>/);
    expect(paid).not.toContain("Test total");
    expect(paid).not.toContain(ORDER_COPY.ORDER_TEST.disclosure);
    for (const stored of [CAPTURED, REPORTED, UNDER_REVIEW, row(), PAST]) {
      const test = render(stored);
      expect(test).toMatch(/<dt>Test total<\/dt><dd[^>]*>₹61,000<\/dd>/);
      // The order's own test line (NS-47) — never the checkout's, which says that no order is made.
      expect(test).toContain(ORDER_COPY.ORDER_TEST.disclosure);
      expect(test).not.toContain(CHECKOUT_TEST_MODE.disclosure);
      expect(test).not.toMatch(/no order is made/i);
      expect(test).not.toContain("Amount paid");
    }
    for (const stored of [REPORTED, UNDER_REVIEW, row(), PAST]) {
      const unpaid = render({ ...stored, synthetic: false });
      expect(unpaid).not.toMatch(/Amount paid|Test total|data-order-total/);
    }
  });

  it.each<[string, OrderConfirmationRow, "payment" | "review"]>([
    ["a payment being confirmed", REPORTED, "payment"],
    ["an order under review", UNDER_REVIEW, "review"],
    // A hold its own capture clears is a payment being confirmed — never "being checked" (0005).
    [
      "an authorised payment on hold",
      row({ needs_review: true, payment_hold: "authorized_only" }),
      "payment",
    ],
    [
      "a capture the provider shows, not yet verified",
      row({ needs_review: true, payment_hold: "capture_unverified" }),
      "payment",
    ],
  ])(
    "confirming (%s): says so, offers no payment, watches, and tells a reader without JavaScript to reload",
    (_label, stored, reason) => {
      const html = render(stored);
      const copy = ORDER_CONFIRMING[reason];
      const status = ` role="status"[^>]*>${copy.status(ORDER_NUMBER)}</p>`;
      const reload = `<p class="flow-fine">${ORDER_CONFIRMING.noscript}</p>`;
      expect(html).toContain(`<h1>${copy.heading}</h1>`);
      expect(html).toMatch(new RegExp(status));
      expect(html).toContain(WATCHER);
      expect(html).toContain(`<noscript>${reload}</noscript>`);
      expect(html).not.toMatch(/href="\/checkout"|<button|<form|<input/);
      expect(textOf(html)).not.toMatch(
        /continue to payment|pay now|try again/i,
      );
      expect(html).not.toMatch(/A beautiful choice\.|is confirmed\./);
    },
  );

  it("failed: the way back to checkout while the order can still be paid for, the shop once its time has passed", () => {
    const [retry, closed] = [render(row()), render(PAST)];
    expect(retry).toContain("<h1>This order has not been paid for.</h1>");
    expect(retry).toMatch(/ href="\/checkout"[^>]*>Return to checkout<\/a>/);
    expect(closed).toContain("<h1>The time to pay for this order has passed.");
    expect(closed).toMatch(/<a[^>]*href="\/shop"[^>]*>Explore artworks<\/a>/);
    expect(closed).not.toContain('href="/checkout"');
    for (const html of [retry, closed]) {
      expect(html).not.toMatch(new RegExp(`${WATCHER}|<noscript>`));
      expect(html).not.toMatch(/A beautiful choice\.|is confirmed\./);
    }
  });

  it("in no state shows a download, print or track control, an email address, a phone number, the token or an internal id", () => {
    for (const stored of [
      PAID,
      CAPTURED,
      REPORTED,
      UNDER_REVIEW,
      row(),
      PAST,
    ]) {
      const html = render(stored);
      expect(textOf(html)).not.toMatch(/download|print|track|pdf/i);
      expect(html).not.toMatch(/href="\/track|<button|mailto:|tel:|@|\d{10}/);
      expect(html).not.toMatch(INTERNAL);
    }
  });

  it("writes the order's date in the studio's time zone", () => {
    const midnight = orderDate("2026-11-22T18:45:00.000Z");
    expect(midnight).toMatch(/^23 Nov 2026, 12:15\s?am$/i);
    const before = orderDate("2026-11-22T18:29:59.000Z");
    expect(before).toMatch(/^22 Nov 2026, 11:59\s?pm$/i);
  });
});

describe("the order page's two late lines — live regions that are in the page from the start", () => {
  it("the watcher and the bag each render an empty polite status region on the server, filled only when their line applies", async () => {
    vi.doMock("next/navigation", async () => ({
      ...(await vi.importActual<object>("next/navigation")),
      useRouter: () => ({ refresh: () => {} }),
    }));
    const { OrderStatusWatcher } = await vi.importActual<
      typeof import("@/components/order/order-status-watcher")
    >("@/components/order/order-status-watcher");
    const { PurchasedBag } = await vi.importActual<
      typeof import("@/components/commerce/purchased-bag")
    >("@/components/commerce/purchased-bag");
    const watcher = renderToStaticMarkup(
      createElement(OrderStatusWatcher, {
        token: TOKEN,
        initial: PAYMENT,
        ask: async (): Promise<OrderStatusAnswer> => ({
          status: "unavailable",
        }),
      }),
    );
    expect(watcher).toBe(
      '<p class="flow-fine order-waiting" role="status" aria-live="polite"></p>',
    );
    const bag = renderToStaticMarkup(
      createElement(PurchasedBag, {
        state: CONFIRMED,
        attemptHash: ATTEMPT_HASH,
        items: [
          {
            variant_code: "the-lantern-that-outlasted-the-gale:black",
            quantity: 1,
          },
        ],
      }),
    );
    expect(bag).toBe(
      '<p class="flow-fine order-bag-note" role="status" aria-live="polite"></p>',
    );
    vi.doUnmock("next/navigation");
  });

  it("the order page's components link with plain anchors — full page loads, never next/link", () => {
    for (const file of [
      "src/components/order/order-confirmation.tsx",
      "src/components/order/order-status-watcher.tsx",
      "src/components/commerce/purchased-bag.tsx",
    ]) {
      const code = readFileSync(path.join(ROOT, file), "utf8");
      expect(code, file).not.toMatch(/from "next\/link"/);
    }
    // The order's rows are the checkout's read-only row, whose artwork title is a client link: the document is then
    // carried on — which is why the checkout never loads a provider's script into a document opened at an order
    // link (src/components/checkout/load-script.ts), whatever link led there.
    const row = readFileSync(
      path.join(ROOT, "src/components/checkout/checkout-row.tsx"),
      "utf8",
    );
    expect(row).toMatch(/from "next\/link"/);
  });
});
