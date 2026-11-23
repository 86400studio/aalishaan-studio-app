import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { CheckoutActionResult } from "@/lib/schemas/checkout";
import type { PaymentHold } from "@/lib/schemas/order-confirmation";
import {
  resumeCheckout,
  submitCheckout,
  type FlowDependencies,
} from "@/lib/server/checkout/flow";
import type { CheckoutConfig, SalesGate } from "@/lib/server/checkout/gate";
import type { AttemptState, CheckoutStore } from "@/lib/server/checkout/store";
import {
  attemptHash,
  deriveConfirmationToken,
  providerReceipt,
} from "@/lib/server/checkout/tokens";
import type { PaymentsGate } from "@/lib/server/payments/config";
import {
  checkProviderPayments,
  standingOf,
} from "@/lib/server/payments/reconcile";
import type {
  PaymentRefusal,
  PaymentResult,
  PaymentStore,
  ProviderCheckRecord,
  ReturnState,
} from "@/lib/server/payments/store";
import {
  fetchRazorpayOrderPayments,
  RAZORPAY_READ_TIMEOUT_MS,
  RAZORPAY_TIMEOUT_MS,
  type OrderPaymentsOutcome,
  type RazorpayPayment,
} from "@/lib/server/razorpay";

/**
 * What the provider holds for an order, and what the checkout does with the answer — S1.7 (src/lib/server/razorpay.ts
 * `fetchRazorpayOrderPayments`, src/lib/server/payments/reconcile.ts, the "relaunch" and "notPayable" halves of
 * src/lib/server/checkout/flow.ts). Every network and database call is a double. What is proven here:
 *   - the read is one GET to the fixed endpoint of OUR stored order id, and an id of any other shape makes no request;
 *   - an answer that cannot be had or trusted IN FULL is "not known" — never "no payment", never a partial list;
 *   - a payment window opens again only when the provider lists nothing or only failed payments. A captured or an
 *     authorised payment is recorded as a hold and answered `confirming`; a payment in flight or no usable answer is
 *     `uncertain`. Neither ever carries launch data, and neither confirms an order;
 *   - the provider is not asked when there is nothing to ask (a brand-new link, an expired or a held order);
 *   - the order's link leaves the server only when a verified payment stands on record AND the token derived now is
 *     the one the order was issued with;
 *   - no answer and no log line carries a secret, the attempt key, the token salt or hash, or an upstream body.
 * Placeholder values only.
 */

const CONFIG: CheckoutConfig = {
  context: "preview",
  projectRef: "abcdefghijklmnopqrst",
  razorpayKeyId: "rzp_test_PLACEHOLDER0001",
  razorpayKeySecret: "placeholder-key-secret",
  orderTokenSecret: "S".repeat(43),
  turnstileSiteKey: "1x00000000000000000000AA",
  turnstileSecret: "placeholder-turnstile-secret",
  turnstileHostnames: ["deploy-1.vercel.app"],
};
const CREDENTIALS = {
  keyId: CONFIG.razorpayKeyId,
  keySecret: CONFIG.razorpayKeySecret,
};
const BASIC = Buffer.from(
  "rzp_test_PLACEHOLDER0001:placeholder-key-secret",
).toString("base64");

const PA_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const ORDER_ID = "order_PLACEHOLDER001";
const OTHER_ORDER = "order_PLACEHOLDER002";
const NOW = new Date("2026-11-11T10:00:00.000Z");
const KEY = "k".repeat(43);
const CONTEXT = { address: "203.0.113.7" };

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");
/** The order's link: the token the double derives, and the salt and hash the order was issued with. */
const TOKEN = "t".repeat(43);
const TOKEN_HASH = sha256(TOKEN);
const SALT = "a".repeat(64);
const ORDER_PATH = `/order/${TOKEN}`;
const UPSTREAM = "upstream detail 123";
const CUSTOMER = {
  email: "asha.rao@example.com",
  contact: "+919876543210",
  vpa: "asha@exampleupi",
};

/** Payments as the read answers them. */
const paid = (id: string, status: string): RazorpayPayment => ({ id, status });
const CAP = paid("pay_PLACEHOLDERcap1", "captured");
const AUT = paid("pay_PLACEHOLDERaut1", "authorized");
const FAI = paid("pay_PLACEHOLDERfai1", "failed");
const CRE = paid("pay_PLACEHOLDERcre1", "created");
const found = (...payments: RazorpayPayment[]): OrderPaymentsOutcome => ({
  outcome: "found",
  payments,
});
const UNAVAILABLE: OrderPaymentsOutcome = { outcome: "unavailable" };

function state(overrides: Partial<AttemptState> = {}): AttemptState {
  return {
    orderNumber: "AS-1001",
    paymentAttemptId: PA_ID,
    amountPaise: BigInt(4200000),
    currency: "INR",
    providerOrderState: "intent",
    providerOrderId: null,
    providerCreateRequestedAt: null,
    expiresAt: null,
    paymentStatus: "pending",
    needsReview: false,
    placedAt: new Date(NOW.getTime() - 1000),
    serverTime: NOW,
    ...overrides,
  };
}
const EXPIRES_AT = new Date(NOW.getTime() + 60 * 60 * 1000);
const LINKED = state({
  providerOrderState: "linked",
  providerOrderId: ORDER_ID,
  providerCreateRequestedAt: NOW,
  expiresAt: EXPIRES_AT,
});

/** The launch data of S1.6, unchanged: the same provider order, the same amount, the same deadline. */
const LAUNCH: CheckoutActionResult = {
  status: "launch",
  launch: {
    key_id: "rzp_test_PLACEHOLDER0001",
    provider_order_id: ORDER_ID,
    amount_paise: "4200000",
    currency: "INR",
    order_number: "AS-1001",
    expires_at: EXPIRES_AT.toISOString(),
    expires_in_ms: 60 * 60 * 1000,
  },
};
const HELD: CheckoutActionResult = { status: "held" };
const UNCERTAIN: CheckoutActionResult = { status: "uncertain" };
const answerOf =
  (status: "confirming" | "confirmed") =>
  (order_path: string | null): CheckoutActionResult => ({
    status,
    order_number: "AS-1001",
    order_path,
  });
const confirming = answerOf("confirming");
const confirmed = answerOf("confirmed");

type Counts = Partial<ReturnState["payments"]>;
const counts = (some: Counts = {}): ReturnState["payments"] => ({
  reported: 0,
  authorized: 0,
  captured: 0,
  failed: 0,
  ...some,
});

/** The order as `payment_return_state` answers it: pending, no hold, no payment on record, its link issued. */
function orderRead(overrides: Partial<ReturnState> = {}): ReturnState {
  return {
    orderNumber: "AS-1001",
    paymentStatus: "pending",
    fulfilmentStatus: "pending_payment",
    needsReview: false,
    paymentHold: null,
    expiresAt: EXPIRES_AT,
    tokenSalt: SALT,
    tokenHash: TOKEN_HASH,
    payments: counts(),
    recorded: false,
    serverTime: NOW,
    ...overrides,
  };
}
/** Under review, with a hold or none, and the payments on record. */
const review = (hold: PaymentHold | null, some: Counts = {}) =>
  orderRead({ needsReview: true, paymentHold: hold, payments: counts(some) });
const EXPIRED_ORDER = orderRead({ paymentStatus: "expired" });
const CONFIRMED_ORDER = orderRead({
  paymentStatus: "captured",
  fulfilmentStatus: "confirmed",
  payments: counts({ captured: 1 }),
});

const ok = <T>(value: T) => ({ ok: true as const, value });
/** What `payment_record_provider_check` answers when it raised the hold. */
const holdRecord = (hold: PaymentHold): PaymentResult<ProviderCheckRecord> =>
  ok({
    held: true,
    paymentStatus: "pending",
    needsReview: true,
    paymentHold: hold,
  });
/** The hold could not be written. */
const HOLD_REFUSED = {
  ok: false as const,
  refusal: "payment_conflict" as const,
};
const refuse = async () => ({
  ok: false as const,
  refusal: "unavailable" as const,
});

/**
 * The doubles of tests/unit/checkout.test.ts, in the same shape: an open gate, an allowed and verified request, a
 * fresh order that links at once. Here an attempt read by its key is LINKED, the provider lists no payment and the
 * payments adapter knows nothing.
 */
function doubles() {
  const payments = {
    recordEvent: vi.fn<PaymentStore["recordEvent"]>(refuse),
    processEvent: vi.fn<PaymentStore["processEvent"]>(refuse),
    returnState: vi.fn<PaymentStore["returnState"]>(async () => ok(null)),
    recordProviderCheck: vi.fn<PaymentStore["recordProviderCheck"]>(refuse),
    confirmationView: vi.fn<PaymentStore["confirmationView"]>(async () =>
      ok(null),
    ),
  };
  const requested = state({
    providerOrderState: "requested",
    providerCreateRequestedAt: NOW,
  });
  const store = {
    createPendingOrder: vi.fn<CheckoutStore["createPendingOrder"]>(async () =>
      ok({ ...state(), replayed: false }),
    ),
    attemptState: vi.fn<CheckoutStore["attemptState"]>(async () => ok(LINKED)),
    claimProviderCreate: vi.fn<CheckoutStore["claimProviderCreate"]>(async () =>
      ok({ ...requested, claimed: true }),
    ),
    linkProviderOrder: vi.fn<CheckoutStore["linkProviderOrder"]>(async () =>
      ok({ ...LINKED, linked: true }),
    ),
    closeProviderCreate: vi.fn<CheckoutStore["closeProviderCreate"]>(
      async (_id, outcome) =>
        ok({ ...state({ providerOrderState: outcome }), closed: true }),
    ),
  };
  const d = {
    gate: vi.fn<() => SalesGate>(() => ({ open: true, config: CONFIG })),
    throttle: vi.fn<FlowDependencies["throttle"]>(async () => ({ ok: true })),
    verifyChallenge: vi.fn<FlowDependencies["verifyChallenge"]>(async () => ({
      ok: true,
    })),
    createOrder: vi.fn<FlowDependencies["createOrder"]>(async () => ({
      outcome: "created",
      order: {
        id: ORDER_ID,
        amountPaise: BigInt(4200000),
        currency: "INR",
        receipt: providerReceipt(PA_ID),
        status: "created",
        createdAt: NOW,
      },
    })),
    findOrders: vi.fn<FlowDependencies["findOrders"]>(async () => ({
      outcome: "found",
      orders: [],
    })),
    issueToken: vi.fn<FlowDependencies["issueToken"]>(() => ({
      salt: SALT,
      hash: TOKEN_HASH,
    })),
    report: vi.fn<(message: string) => void>(),
    paymentsGate: vi.fn<() => PaymentsGate>(() => ({
      open: true,
      config: {
        context: "preview",
        projectRef: CONFIG.projectRef,
        razorpayKeyId: CONFIG.razorpayKeyId,
        razorpayKeySecret: CONFIG.razorpayKeySecret,
        razorpayWebhookSecret: "placeholder-webhook-secret",
        orderTokenSecret: CONFIG.orderTokenSecret,
      },
    })),
    fetchPayments: vi.fn<FlowDependencies["fetchPayments"]>(async () =>
      found(),
    ),
    deriveToken: vi.fn<FlowDependencies["deriveToken"]>(() => TOKEN),
    payments,
    paymentsFactory: vi.fn<() => PaymentStore | null>(() => payments),
    store,
    storeFactory: vi.fn<() => CheckoutStore | null>(() => store),
  };
  const deps: FlowDependencies = {
    gate: d.gate,
    throttle: d.throttle,
    verifyChallenge: d.verifyChallenge,
    store: d.storeFactory,
    createOrder: d.createOrder,
    findOrders: d.findOrders,
    issueToken: d.issueToken,
    paymentsGate: d.paymentsGate,
    payments: d.paymentsFactory,
    fetchPayments: d.fetchPayments,
    deriveToken: d.deriveToken,
    report: d.report,
  };
  return { ...d, deps };
}

const SUBMISSION = {
  attempt_key: KEY,
  items: [{ variant_code: "the-moon-between-two-peaks:black", quantity: 2 }],
  shown_total_paise: "4200000",
  fields: {
    name: "Asha Rao",
    email: "Asha.Rao@example.com",
    phone: "+91 98765 43210",
    pin: "400001",
    address: "12, Marine Drive",
    address2: "",
    city: "Mumbai",
    state: "Maharashtra",
  },
  payment_method: "upi",
  turnstile_token: "token-from-the-widget",
};

/** A payment as Razorpay lists it — with the customer's details, which the read must drop. */
const listed = (payment: RazorpayPayment, extra: object = {}) => ({
  ...payment,
  entity: "payment",
  amount: 4200000,
  currency: "INR",
  order_id: ORDER_ID,
  method: "upi",
  ...CUSTOMER,
  ...extra,
});
const many = (size: number) =>
  Array.from({ length: size }, (_, index) =>
    listed(paid(`pay_PLACEHOLDER${String(index).padStart(4, "0")}`, "failed")),
  );
const answering = (body: unknown, status = 200) =>
  vi.fn<typeof fetch>(async () => Response.json(body, { status }));
/** A collection of payments; `count` is the items carried unless a row says otherwise. */
const page = (items: unknown[], count: unknown = items.length, status = 200) =>
  answering({ entity: "collection", count, items }, status);
const upstreamError = (status: number) =>
  answering({ error: { description: UPSTREAM } }, status);
const throwing = (error: unknown) =>
  vi.fn<typeof fetch>(async () => {
    throw error;
  });
const timedOut = () => throwing(new DOMException("timed out", "TimeoutError"));

describe("fetchRazorpayOrderPayments — the read", () => {
  it("makes one GET to the stored order's payments: Basic credentials, no body, no cache, no redirect, a bounded wait", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    try {
      const fetcher = page([]);
      expect(
        await fetchRazorpayOrderPayments(ORDER_ID, CREDENTIALS, fetcher),
      ).toStrictEqual({ outcome: "found", payments: [] });
      expect(fetcher).toHaveBeenCalledTimes(1);
      const [url, init] = fetcher.mock.calls[0];
      expect(url).toBe(
        "https://api.razorpay.com/v1/orders/order_PLACEHOLDER001/payments?count=100",
      );
      expect(init?.method).toBe("GET");
      expect(init?.body).toBeUndefined();
      expect(init?.cache).toBe("no-store");
      expect(init?.redirect).toBe("error");
      expect([...new Headers(init?.headers).entries()]).toEqual([
        ["authorization", `Basic ${BASIC}`],
      ]);
      // The signal handed to fetch is the timeout this call made — shorter than the create call's: a customer waits.
      expect(timeout.mock.calls).toEqual([[RAZORPAY_READ_TIMEOUT_MS]]);
      expect(init?.signal).toBe(timeout.mock.results[0].value);
      expect(RAZORPAY_READ_TIMEOUT_MS).toBeGreaterThan(0);
      expect(RAZORPAY_READ_TIMEOUT_MS).toBeLessThan(RAZORPAY_TIMEOUT_MS);
    } finally {
      timeout.mockRestore();
    }
  });

  it.each([
    ["a path that climbs out of the order", "order_x/../../payments"],
    ["a payment id", "pay_PLACEHOLDER001"],
    ["an empty id", ""],
    ["an id with a slash", `${ORDER_ID}/refunds`],
    ["an id with a query", `${ORDER_ID}?count=1`],
    ["an id with a fragment", `${ORDER_ID}#x`],
    ["an id that is too short", "order_abc"],
    ["an id in another case", "ORDER_PLACEHOLDER001"],
    ["an id with a leading space", ` ${ORDER_ID}`],
    ["an id with a trailing line break", `${ORDER_ID}\n`],
  ])("makes NO request for %s and answers unavailable", async (_label, id) => {
    const fetcher = page([]);
    expect(
      await fetchRazorpayOrderPayments(id, CREDENTIALS, fetcher),
    ).toStrictEqual(UNAVAILABLE);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("answers the order's payments as id and status only — nothing of the customer, nothing of the credentials", async () => {
    const outcome = await fetchRazorpayOrderPayments(
      ORDER_ID,
      CREDENTIALS,
      page([listed(FAI), listed(CAP)]),
    );
    expect(outcome).toStrictEqual(found(FAI, CAP));
    const text = JSON.stringify(outcome);
    for (const hidden of [
      ...Object.values(CUSTOMER),
      "upi",
      "4200000",
      CREDENTIALS.keyId,
      CREDENTIALS.keySecret,
      BASIC,
    ])
      expect(text).not.toContain(hidden);
  });

  it("trusts a listing one short of the page: 99 payments are found, all of them", async () => {
    const outcome = await fetchRazorpayOrderPayments(
      ORDER_ID,
      CREDENTIALS,
      page(many(99)),
    );
    expect(outcome.outcome).toBe("found");
    if (outcome.outcome === "found") expect(outcome.payments).toHaveLength(99);
  });

  it.each([
    ["a thrown fetch", throwing(new TypeError("fetch failed"))],
    ["a timeout", timedOut()],
    ["an abort", throwing(new DOMException("aborted", "AbortError"))],
    ["a 401", upstreamError(401)],
    ["a 404", upstreamError(404)],
    ["a 429", upstreamError(429)],
    ["a 500", upstreamError(500)],
    ["a 201 that carries a listing", page([], 0, 201)],
    [
      "a body that is not JSON",
      vi.fn<typeof fetch>(async () => new Response("<html>", { status: 200 })),
    ],
    ["a body that is not a collection", answering(listed(CAP))],
    ["a bare list", answering([listed(FAI)])],
    ["a count above the items carried", page([listed(FAI)], 2)],
    ["a count below the items carried", page([listed(FAI)], 0)],
    ["a count that is not a number", page([], "0")],
    ["no count", answering({ entity: "collection", items: [] })],
    ["exactly 100 items — the page is full", page(many(100))],
    ["more items than a page", page(many(101))],
    [
      "one item with a foreign id shape",
      page([listed(FAI), listed(CAP, { id: OTHER_ORDER })]),
    ],
    [
      "one item without a status",
      page([listed(FAI), listed(CAP, { status: undefined })]),
    ],
    ["one item with an empty status", page([listed(CAP, { status: "" })])],
    [
      "one item that is not a payment",
      page([listed(CAP, { entity: "order" })]),
    ],
    [
      "one item that belongs to another order",
      page([listed(FAI), listed(CAP, { order_id: OTHER_ORDER })]),
    ],
    ["one item without an order", page([listed(FAI, { order_id: undefined })])],
  ])(
    "is unavailable on %s — one request, never a partial list, nothing of the upstream body",
    async (_label, fetcher) => {
      expect(
        await fetchRazorpayOrderPayments(ORDER_ID, CREDENTIALS, fetcher),
      ).toStrictEqual(UNAVAILABLE);
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
});

describe("standingOf — one standing per listing, strongest first", () => {
  // The statuses as listed, the standing, and which listed payment's id is reported (none below authorised).
  it.each([
    ["failed authorized created refunded captured", "captured", 4],
    ["captured failed", "captured", 0],
    ["created failed authorized", "authorized", 2],
    ["authorized refunded", "authorized", 0],
    ["created", "in_flight", null],
    ["failed created", "in_flight", null],
    ["refunded", "in_flight", null],
    ["failed refunded", "in_flight", null],
    ["failed some_status_of_tomorrow", "in_flight", null],
    ["CAPTURED", "in_flight", null],
    ["", "clear", null],
    ["failed failed", "clear", null],
  ] as const)(
    "a listing of [%s] stands as %s",
    (statuses, standing, holder) => {
      const payments = statuses
        .split(" ")
        .filter(Boolean)
        .map((status, index) => paid(`pay_PLACEHOLDER000${index}`, status));
      expect(standingOf(found(...payments))).toStrictEqual(
        holder === null
          ? { standing }
          : { standing, paymentId: payments[holder].id },
      );
    },
  );

  it("an answer that could not be had is unavailable — never clear", () => {
    expect(standingOf(UNAVAILABLE)).toStrictEqual({ standing: "unavailable" });
  });
});

describe("checkProviderPayments — the question and its durable result", () => {
  const ORDER = { paymentAttemptId: PA_ID, providerOrderId: ORDER_ID };

  function harness(outcome: OrderPaymentsOutcome) {
    const { payments: store, report } = doubles();
    const fetchPayments = vi.fn<FlowDependencies["fetchPayments"]>(
      async () => outcome,
    );
    return { store, report, fetchPayments };
  }

  it.each([
    ["captured", CAP, "capture_unverified"],
    ["authorized", AUT, "authorized_only"],
  ] as const)(
    "asks once with the stored order id and the credentials, and records the hold of a payment that is %s",
    async (standing, payment, hold) => {
      const h = harness(found(FAI, CRE, payment));
      h.store.recordProviderCheck.mockResolvedValue(holdRecord(hold));
      expect(await checkProviderPayments(ORDER, CREDENTIALS, h)).toStrictEqual({
        standing,
        paymentId: payment.id,
      });
      expect(h.fetchPayments.mock.calls).toEqual([[ORDER_ID, CREDENTIALS]]);
      expect(h.store.recordProviderCheck.mock.calls).toEqual([
        [PA_ID, payment.id, standing],
      ]);
      expect(h.report).not.toHaveBeenCalled();
    },
  );

  it.each([
    "unavailable",
    "attempt_not_found",
    "payment_conflict",
    "state_conflict",
    "invalid_request",
  ] satisfies PaymentRefusal[])(
    "a hold that could not be written (%s) is not known: unavailable, with one sanitised report",
    async (refusal) => {
      const h = harness(found(CAP));
      h.store.recordProviderCheck.mockResolvedValue({ ok: false, refusal });
      expect(await checkProviderPayments(ORDER, CREDENTIALS, h)).toStrictEqual({
        standing: "unavailable",
      });
      expect(h.store.recordProviderCheck).toHaveBeenCalledTimes(1);
      expect(h.report).toHaveBeenCalledTimes(1);
      const [message] = h.report.mock.calls[0];
      expect(message).toContain(refusal);
      for (const id of [PA_ID, ORDER_ID, CAP.id, ...Object.values(CREDENTIALS)])
        expect(message).not.toContain(id);
    },
  );

  it.each([
    ["no payment", found(), "clear"],
    ["failed payments only", found(FAI), "clear"],
    ["a payment in flight", found(FAI, CRE), "in_flight"],
    ["no usable answer", UNAVAILABLE, "unavailable"],
  ] as const)("records nothing for %s", async (_label, outcome, standing) => {
    const h = harness(outcome);
    expect(await checkProviderPayments(ORDER, CREDENTIALS, h)).toStrictEqual({
      standing,
    });
    expect(h.fetchPayments).toHaveBeenCalledTimes(1);
    expect(h.store.recordProviderCheck).not.toHaveBeenCalled();
    expect(h.report).not.toHaveBeenCalled();
  });
});

let d: ReturnType<typeof doubles>;
beforeEach(() => {
  d = doubles();
});

const resume = () => resumeCheckout({ attempt_key: KEY }, CONTEXT, d.deps);
const submit = () => submitCheckout(SUBMISSION, CONTEXT, d.deps);
const providerLists = (...payments: RazorpayPayment[]) =>
  d.fetchPayments.mockResolvedValue(found(...payments));
/** The provider half answered by the REAL read over a doubled fetch. */
const providerAnswers = (fetcher: typeof fetch) =>
  d.fetchPayments.mockImplementation((id, credentials) =>
    fetchRazorpayOrderPayments(id, credentials, fetcher),
  );
const orderReads = (answer: PaymentResult<ReturnState | null>) =>
  d.payments.returnState.mockResolvedValue(answer);
/** The attempt as its key finds it — in step with what the order's detail says. */
const attemptIs = (order: ReturnState) =>
  d.store.attemptState.mockResolvedValue(
    ok({
      ...LINKED,
      paymentStatus: order.paymentStatus,
      needsReview: order.needsReview,
    }),
  );

/** The hold is written, and the order then reads as under review on it (with the payments on record). */
function holdIsRecorded(hold: PaymentHold, some: Counts = {}) {
  d.payments.recordProviderCheck.mockResolvedValue(holdRecord(hold));
  orderReads(ok(review(hold, some)));
}
/** A captured payment is listed and its hold is refused. */
function holdIsRefused() {
  providerLists(CAP);
  d.payments.recordProviderCheck.mockResolvedValue(HOLD_REFUSED);
}

/** No provider order was created, looked up, claimed, linked or closed: the retry rule starts nothing. */
function expectNothingStarted() {
  expect(d.createOrder).not.toHaveBeenCalled();
  expect(d.findOrders).not.toHaveBeenCalled();
  expect(d.store.claimProviderCreate).not.toHaveBeenCalled();
  expect(d.store.linkProviderOrder).not.toHaveBeenCalled();
  expect(d.store.closeProviderCreate).not.toHaveBeenCalled();
}

function expectProviderNotAsked() {
  expect(d.fetchPayments).not.toHaveBeenCalled();
  expect(d.payments.recordProviderCheck).not.toHaveBeenCalled();
}

/** Not a launch, and nothing a payment window could be opened with. */
function expectNoLaunch(result: CheckoutActionResult) {
  expect(result).not.toHaveProperty("launch");
  const text = JSON.stringify(result);
  for (const launchValue of [ORDER_ID, CONFIG.razorpayKeyId, "4200000"])
    expect(text).not.toContain(launchValue);
  expectNothingStarted();
}

describe("the retry rule — a linked, pending, unexpired order", () => {
  it.each([
    ["no payment", []],
    ["only failed payments", [FAI, paid("pay_PLACEHOLDERfai2", "failed")]],
  ])(
    "opens the window again when the provider lists %s: the same launch data, nothing recorded",
    async (_label, payments) => {
      providerLists(...payments);
      orderReads(ok(orderRead()));
      expect(await resume()).toStrictEqual(LAUNCH);
      expect(d.fetchPayments.mock.calls).toEqual([[ORDER_ID, CREDENTIALS]]);
      expect(d.payments.recordProviderCheck).not.toHaveBeenCalled();
      // The one read that follows a clear answer: is a verified report of a payment on record for the order?
      expect(d.payments.returnState.mock.calls).toEqual([
        [attemptHash(KEY), null],
      ]);
      expectNothingStarted();
    },
  );

  it.each<[string, number]>([
    ["no payment", 0],
    ["a payment past its deadline", -60 * 1000],
  ])(
    "a payment reported by a verified return is never offered again, though the provider lists %s: confirming, with its link",
    async (_label, remaining) => {
      d.store.attemptState.mockResolvedValue(
        ok({ ...LINKED, expiresAt: new Date(NOW.getTime() + remaining) }),
      );
      providerLists();
      orderReads(ok(orderRead({ payments: counts({ reported: 1 }) })));
      const result = await resume();
      expect(result).toStrictEqual(confirming(ORDER_PATH));
      expect(d.payments.recordProviderCheck).not.toHaveBeenCalled();
      expectNoLaunch(result);
    },
  );

  it("a clear answer is judged by the order's read made after the provider's — its deadline and its time, never the attempt read's before both", async () => {
    providerLists(FAI);
    // The provider read took a while: the database's own clock has moved on by 20 seconds.
    const later = new Date(NOW.getTime() + 20 * 1000);
    orderReads(ok(orderRead({ serverTime: later })));
    const result = await resume();
    expect(result).toStrictEqual({
      status: "launch",
      launch: { ...LAUNCH.launch, expires_in_ms: 60 * 60 * 1000 - 20 * 1000 },
    });
    // The deadline passed while the provider was asked: "expired", never a launch.
    d.fetchPayments.mockClear();
    orderReads(
      ok(orderRead({ serverTime: new Date(EXPIRES_AT.getTime() + 1) })),
    );
    expect(await resume()).toStrictEqual({ status: "expired" });
  });

  it.each<[string, ReturnState, CheckoutActionResult]>([
    ["confirmed meanwhile", CONFIRMED_ORDER, confirmed(ORDER_PATH)],
    ["put on a hold meanwhile", review("capture_unverified"), confirming(null)],
    ["flagged meanwhile", review(null), HELD],
    ["with no deadline", orderRead({ expiresAt: null }), HELD],
  ])(
    "a clear provider answer for an order %s is what the order now is — never a launch",
    async (_label, order, expected) => {
      providerLists();
      orderReads(ok(order));
      const result = await resume();
      expect(result).toStrictEqual(expected);
      expectNoLaunch(result);
    },
  );

  it.each<[string, PaymentResult<ReturnState | null>]>([
    ["refused", { ok: false, refusal: "unavailable" }],
    ["empty", ok(null)],
  ])(
    "a clear provider answer whose order then reads %s is uncertain — no launch on an order that cannot be read",
    async (_label, answer) => {
      providerLists(FAI);
      orderReads(answer);
      const result = await resume();
      expect(result).toStrictEqual(UNCERTAIN);
      expectNoLaunch(result);
    },
  );

  it.each([
    ["captured", CAP, "capture_unverified"],
    ["authorized", AUT, "authorized_only"],
  ] as const)(
    "a payment that is %s at the provider is no launch: the hold is recorded, the order is read, the answer is confirming without a link",
    async (status, payment, hold) => {
      providerLists(FAI, payment);
      holdIsRecorded(hold);
      const result = await resume();
      // No verified signature stands on record (the provider's listing is not one): the link stays on the server.
      expect(result).toStrictEqual(confirming(null));
      expect(d.payments.recordProviderCheck.mock.calls).toEqual([
        [PA_ID, payment.id, status],
      ]);
      // The read carries no payment id: the provider's listing is never recorded as a verified return.
      expect(d.payments.returnState.mock.calls).toEqual([
        [attemptHash(KEY), null],
      ]);
      const order = [
        d.fetchPayments,
        d.payments.recordProviderCheck,
        d.payments.returnState,
      ].map((mock) => mock.mock.invocationCallOrder[0]);
      expect(order).toEqual([...order].sort((a, b) => a - b));
      expect(d.deriveToken).not.toHaveBeenCalled();
      expectNoLaunch(result);
    },
  );

  it.each<[string, Counts, string | null]>([
    ["reported by a verified return", { reported: 1 }, ORDER_PATH],
    ["authorised by a signed event", { authorized: 1 }, ORDER_PATH],
    ["captured by a signed event", { captured: 1 }, ORDER_PATH],
    ["failed, and no other", { failed: 1 }, null],
  ])(
    "gives the order's link with confirming only when a verified payment stands on record (%s)",
    async (_label, some, orderPath) => {
      providerLists(CAP);
      holdIsRecorded("capture_unverified", some);
      const result = await resume();
      expect(result).toStrictEqual(confirming(orderPath));
      expect(d.deriveToken.mock.calls).toEqual(
        orderPath === null ? [] : [[CONFIG.orderTokenSecret, SALT]],
      );
      expectNoLaunch(result);
    },
  );

  it.each<[string, () => unknown]>([
    ['a payment still "created"', () => providerLists(CRE)],
    ["a failed payment beside one in flight", () => providerLists(FAI, CRE)],
    ["a refunded payment", () => providerLists(paid(CAP.id, "refunded"))],
    ["a provider timeout", () => providerAnswers(timedOut())],
    ["a provider 503", () => providerAnswers(upstreamError(503))],
    ["a listing that fills the page", () => providerAnswers(page(many(100)))],
    [
      "a listing that names another order's payment",
      () => providerAnswers(page([listed(FAI, { order_id: OTHER_ORDER })])),
    ],
  ])(
    "answers uncertain on %s: no launch, nothing recorded, nothing read",
    async (_label, arrange) => {
      arrange();
      const result = await resume();
      expect(result).toStrictEqual(UNCERTAIN);
      expect(d.fetchPayments).toHaveBeenCalledTimes(1);
      expect(d.payments.recordProviderCheck).not.toHaveBeenCalled();
      expect(d.payments.returnState).not.toHaveBeenCalled();
      expectNoLaunch(result);
    },
  );

  it("answers uncertain when a captured payment is known and its hold could not be written — the order is not read as settled", async () => {
    holdIsRefused();
    const result = await resume();
    expect(result).toStrictEqual(UNCERTAIN);
    expect(d.payments.returnState).not.toHaveBeenCalled();
    expect(d.report).toHaveBeenCalledTimes(1);
    expectNoLaunch(result);
  });

  it.each<[string, PaymentResult<ReturnState | null>, CheckoutActionResult]>([
    ["refused", { ok: false, refusal: "unavailable" }, UNCERTAIN],
    ["empty", ok(null), UNCERTAIN],
    [
      "of an order confirmed meanwhile",
      ok(CONFIRMED_ORDER),
      confirmed(ORDER_PATH),
    ],
    ["of an order expired meanwhile", ok(EXPIRED_ORDER), HELD],
  ])(
    "after a recorded hold, a read that is %s is still no launch",
    async (_label, answer, expected) => {
      providerLists(CAP);
      holdIsRecorded("capture_unverified");
      orderReads(answer);
      const result = await resume();
      expect(result).toStrictEqual(expected);
      expect(d.payments.recordProviderCheck).toHaveBeenCalledTimes(1);
      expectNoLaunch(result);
    },
  );

  it("is unavailable, with a sanitised report, when the payments adapter cannot be made — the provider is not asked", async () => {
    d.paymentsFactory.mockReturnValue(null);
    const result = await resume();
    expect(result).toStrictEqual({ status: "unavailable" });
    expectProviderNotAsked();
    expect(d.report.mock.calls).toEqual([
      ["[checkout] privileged client unavailable"],
    ]);
    expectNoLaunch(result);
  });

  it.each<[string, PaymentResult<ReturnState | null> | "no adapter"]>([
    ["refused", { ok: false, refusal: "unavailable" }],
    ["empty", ok(null)],
    ["impossible (no payments adapter)", "no adapter"],
  ])(
    "a pending, flagged order whose detail cannot be read is uncertain — it may be on a hold; one no longer pending is held (%s)",
    async (_label, answer) => {
      const arrange = () => {
        if (answer === "no adapter") d.paymentsFactory.mockReturnValue(null);
        else orderReads(answer);
      };
      // Pending and flagged: a hold — a payment known and being confirmed — cannot be ruled out.
      attemptIs(review("capture_unverified"));
      arrange();
      const pending = await resume();
      expect(pending).toStrictEqual(UNCERTAIN);
      expectProviderNotAsked();
      expectNoLaunch(pending);
      // No longer pending: nothing can be paid for there, whatever the detail says.
      attemptIs(orderRead({ paymentStatus: "captured" }));
      arrange();
      expect(await resume()).toStrictEqual(HELD);
    },
  );

  it("answers two resumes alike while a payment is captured and unverified: both confirming, neither a launch, each asked anew", async () => {
    providerLists(CAP);
    holdIsRecorded("capture_unverified");
    const results = await Promise.all([resume(), resume()]);
    expect(results).toStrictEqual([confirming(null), confirming(null)]);
    results.forEach(expectNoLaunch);
    // No standing is kept in memory: each request asks the provider and records the same hold.
    expect(d.fetchPayments).toHaveBeenCalledTimes(2);
    expect(d.payments.recordProviderCheck.mock.calls).toEqual([
      [PA_ID, CAP.id, "captured"],
      [PA_ID, CAP.id, "captured"],
    ]);
  });

  it("asks the provider when the same submission is sent again for an order that is already linked", async () => {
    d.store.createPendingOrder.mockResolvedValue(
      ok({ ...LINKED, replayed: true }),
    );
    providerLists(AUT);
    holdIsRecorded("authorized_only");
    const result = await submit();
    expect(result).toStrictEqual(confirming(null));
    expect(d.fetchPayments.mock.calls).toEqual([[ORDER_ID, CREDENTIALS]]);
    expect(d.payments.recordProviderCheck.mock.calls).toEqual([
      [PA_ID, AUT.id, "authorized"],
    ]);
    expectNoLaunch(result);
  });
});

describe("the retry rule — when the provider is not asked", () => {
  it("launches a brand-new order straight after its link: no payment can exist for it yet", async () => {
    expect(await submit()).toStrictEqual(LAUNCH);
    expect(d.store.linkProviderOrder).toHaveBeenCalledTimes(1);
    expectProviderNotAsked();
    expect(d.paymentsFactory).not.toHaveBeenCalled();
  });

  it.each([
    ["at its deadline", 0],
    ["past its deadline", -60 * 1000],
  ])(
    "answers expired for an order %s only after the provider has said that no payment for it is live",
    async (_label, remaining) => {
      d.store.attemptState.mockResolvedValue(
        ok({ ...LINKED, expiresAt: new Date(NOW.getTime() + remaining) }),
      );
      providerLists(FAI);
      orderReads(ok(orderRead()));
      expect(await resume()).toStrictEqual({ status: "expired" });
      expect(d.fetchPayments.mock.calls).toEqual([[ORDER_ID, CREDENTIALS]]);
      expect(d.payments.recordProviderCheck).not.toHaveBeenCalled();
      expectNothingStarted();
    },
  );

  it.each([
    ["captured", CAP, "capture_unverified"],
    ["authorized", AUT, "authorized_only"],
  ] as const)(
    "past its deadline, a payment %s at the provider is held and said to be confirming — never 'the time has passed'",
    async (status, payment, hold) => {
      d.store.attemptState.mockResolvedValue(
        ok({ ...LINKED, expiresAt: new Date(NOW.getTime() - 60 * 1000) }),
      );
      providerLists(payment);
      holdIsRecorded(hold);
      const result = await resume();
      expect(result).toStrictEqual(confirming(null));
      expect(d.payments.recordProviderCheck.mock.calls).toEqual([
        [PA_ID, payment.id, status],
      ]);
      expectNoLaunch(result);
    },
  );

  it.each<[string, () => unknown]>([
    ['a payment still "created"', () => providerLists(CRE)],
    ["a provider timeout", () => providerAnswers(timedOut())],
  ])(
    "past its deadline, %s is uncertain — never 'the time has passed', and the attempt is kept",
    async (_label, arrange) => {
      d.store.attemptState.mockResolvedValue(
        ok({ ...LINKED, expiresAt: new Date(NOW.getTime() - 60 * 1000) }),
      );
      arrange();
      const result = await resume();
      expect(result).toStrictEqual(UNCERTAIN);
      expect(d.payments.recordProviderCheck).not.toHaveBeenCalled();
      expectNoLaunch(result);
    },
  );

  it.each<[string, ReturnState, CheckoutActionResult]>([
    ["a confirmed order", CONFIRMED_ORDER, confirmed(ORDER_PATH)],
    ["an order on a hold", review("capture_unverified"), confirming(null)],
    [
      "an order on a hold with that payment on record",
      review("authorized_only", { authorized: 1 }),
      confirming(ORDER_PATH),
    ],
    ["an order under review without a hold", review(null), HELD],
    ["a failed order", orderRead({ paymentStatus: "failed" }), HELD],
    ["an expired order", EXPIRED_ORDER, HELD],
    [
      "a failed order that still carries a hold",
      { ...review("capture_unverified"), paymentStatus: "failed" },
      HELD,
    ],
  ])(
    "%s says what it is — the order is read once, the provider is not asked",
    async (_label, order, expected) => {
      attemptIs(order);
      orderReads(ok(order));
      const result = await resume();
      expect(result).toStrictEqual(expected);
      expect(d.payments.returnState.mock.calls).toEqual([
        [attemptHash(KEY), null],
      ]);
      expectProviderNotAsked();
      expectNoLaunch(result);
    },
  );

  it.each<[string, () => unknown]>([
    ["cannot be made", () => d.paymentsFactory.mockReturnValue(null)],
    ["refuses", () => d.payments.returnState.mockImplementation(refuse)],
    ["knows no such attempt", () => orderReads(ok(null))],
  ])(
    "answers held for an order that is not payable when the payments adapter %s",
    async (_label, arrange) => {
      attemptIs(CONFIRMED_ORDER);
      arrange();
      const result = await resume();
      expect(result).toStrictEqual(HELD);
      expectProviderNotAsked();
      expectNoLaunch(result);
    },
  );

  it("answers confirmed, not a second order, when the same submission is sent again after the order was confirmed", async () => {
    d.store.createPendingOrder.mockResolvedValue(
      ok({ ...LINKED, paymentStatus: "captured", replayed: true }),
    );
    orderReads(ok(CONFIRMED_ORDER));
    const result = await submit();
    expect(result).toStrictEqual(confirmed(ORDER_PATH));
    expectProviderNotAsked();
    expectNoLaunch(result);
  });
});

describe("the order's link — only the token the order was issued with", () => {
  async function confirmedWith(overrides: Partial<ReturnState>) {
    attemptIs(CONFIRMED_ORDER);
    orderReads(ok({ ...CONFIRMED_ORDER, ...overrides }));
    return resume();
  }

  it("gives the link when the token derived with this deployment's secret hashes to the stored hash", async () => {
    d.deriveToken.mockImplementation(deriveConfirmationToken);
    const token = deriveConfirmationToken(CONFIG.orderTokenSecret, SALT);
    expect(await confirmedWith({ tokenHash: sha256(token) })).toStrictEqual(
      confirmed(`/order/${token}`),
    );
    expect(d.deriveToken.mock.calls).toEqual([[CONFIG.orderTokenSecret, SALT]]);
  });

  it("gives no link — and no dead one — when the order was issued under another order-link secret", async () => {
    d.deriveToken.mockImplementation(deriveConfirmationToken);
    const issuedElsewhere = deriveConfirmationToken("E".repeat(43), SALT);
    const result = await confirmedWith({ tokenHash: sha256(issuedElsewhere) });
    expect(result).toStrictEqual(confirmed(null));
    expect(JSON.stringify(result)).not.toContain(issuedElsewhere);
  });

  it.each([
    ["the salt is missing", { tokenSalt: null }],
    ["the hash is missing", { tokenHash: null }],
  ])("gives no link, and derives nothing, when %s", async (_label, missing) => {
    expect(await confirmedWith(missing)).toStrictEqual(confirmed(null));
    expect(d.deriveToken).not.toHaveBeenCalled();
  });

  it("gives no link when the token cannot be derived — the order is still answered, and nothing is logged", async () => {
    d.deriveToken.mockImplementation(() => {
      throw new RangeError("not a token salt");
    });
    expect(await confirmedWith({})).toStrictEqual(confirmed(null));
    expect(d.report).not.toHaveBeenCalled();
  });
});

describe("what leaves the server", () => {
  it("carries no secret, attempt key, token salt or hash, customer detail or upstream body in any answer or report", async () => {
    const scenarios: Array<[CheckoutActionResult["status"], () => unknown]> = [
      // A captured payment, its hold recorded, a verified payment on record: the one answer that carries the link.
      [
        "confirming",
        () => {
          providerLists(CAP);
          holdIsRecorded("capture_unverified", { reported: 1 });
        },
      ],
      // A captured payment whose hold was refused: one report.
      ["uncertain", holdIsRefused],
      // The real read: an upstream error body, then a listing that carries the customer's details.
      ["uncertain", () => providerAnswers(upstreamError(500))],
      ["uncertain", () => providerAnswers(page([listed(CRE)]))],
      // No payments adapter: one report.
      ["unavailable", () => d.paymentsFactory.mockReturnValue(null)],
      [
        "confirmed",
        () => {
          attemptIs(CONFIRMED_ORDER);
          orderReads(ok(CONFIRMED_ORDER));
        },
      ],
    ];
    const answers: CheckoutActionResult[] = [];
    const reports: string[] = [];
    for (const [, arrange] of scenarios) {
      d = doubles();
      arrange();
      answers.push(await resume());
      reports.push(...d.report.mock.calls.map(([message]) => message));
    }
    expect(answers.map((answer) => answer.status)).toEqual(
      scenarios.map(([status]) => status),
    );
    expect(reports).toHaveLength(2);

    const neverAnywhere = [
      CONFIG.razorpayKeySecret,
      CONFIG.orderTokenSecret,
      CONFIG.turnstileSecret,
      "placeholder-webhook-secret",
      BASIC,
      KEY,
      attemptHash(KEY),
      SALT,
      TOKEN_HASH,
      UPSTREAM,
      ...Object.values(CUSTOMER),
      PA_ID,
      CAP.id,
      CRE.id,
    ];
    const answered = JSON.stringify(answers);
    expect(answered).toContain(ORDER_PATH);
    for (const hidden of neverAnywhere) expect(answered).not.toContain(hidden);
    // A log line is an enumerated code: beyond the above, no order link, provider order id, key id or order number.
    const logged = JSON.stringify(reports);
    for (const hidden of [
      ...neverAnywhere,
      TOKEN,
      ORDER_ID,
      CONFIG.razorpayKeyId,
      "AS-1001",
    ])
      expect(logged).not.toContain(hidden);
  });
});
