import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { CheckoutActionResult } from "@/lib/schemas/checkout";
import {
  ATTEMPT_HONOURED_MS,
  resumeCheckout,
  STALE_REQUEST_MS,
  submitCheckout,
  type FlowDependencies,
} from "@/lib/server/checkout/flow";
import type { CheckoutConfig, SalesGate } from "@/lib/server/checkout/gate";
import {
  createCheckoutStore,
  pendingOrderRequestBody,
  type AttemptState,
  type CheckoutStore,
  type PendingOrderRequest,
  type ProviderOrderState,
  type StoreRefusal,
  type StoreResult,
} from "@/lib/server/checkout/store";
import { attemptHash, providerReceipt } from "@/lib/server/checkout/tokens";
import type {
  CreateOrderOutcome,
  FindOrdersOutcome,
  RazorpayOrder,
} from "@/lib/server/razorpay";

/**
 * The checkout flow with every dependency a double — S1.6 (src/lib/server/checkout/flow.ts; the database's real
 * behaviour is tests/integration/checkout.test.ts). What is proven here is ORDER and RESTRAINT:
 *   - a closed gate, a malformed body, a refused field, a rate limit, a failed challenge or an unavailable control
 *     each stop the flow before the next step — with zero writes and zero provider calls;
 *   - the provider create happens only after the write, only for the request that won the claim, and exactly once
 *     per attempt whatever the answer was;
 *   - launch data leaves the server only for a linked, pending, unexpired order that is not under review;
 *   - an answer never carries a token, a secret, a customer detail or an upstream body.
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

const PA_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const RECEIPT = providerReceipt(PA_ID);
const NOW = new Date("2026-11-11T10:00:00.000Z");
const KEY = "k".repeat(43);

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

const LINKED = state({
  providerOrderState: "linked",
  providerOrderId: "order_PLACEHOLDER001",
  providerCreateRequestedAt: NOW,
  expiresAt: new Date(NOW.getTime() + 60 * 60 * 1000),
});

const PROVIDER_ORDER: RazorpayOrder = {
  id: "order_PLACEHOLDER001",
  amountPaise: BigInt(4200000),
  currency: "INR",
  receipt: RECEIPT,
  status: "created",
  createdAt: NOW,
};

const ok = <T>(value: T): StoreResult<T> => ({ ok: true, value });
const refused = <T>(refusal: StoreRefusal): StoreResult<T> => ({
  ok: false,
  refusal,
});

type Doubles = {
  gate: ReturnType<typeof vi.fn<() => SalesGate>>;
  throttle: ReturnType<typeof vi.fn<FlowDependencies["throttle"]>>;
  verifyChallenge: ReturnType<
    typeof vi.fn<FlowDependencies["verifyChallenge"]>
  >;
  createOrder: ReturnType<typeof vi.fn<FlowDependencies["createOrder"]>>;
  findOrders: ReturnType<typeof vi.fn<FlowDependencies["findOrders"]>>;
  issueToken: ReturnType<typeof vi.fn<FlowDependencies["issueToken"]>>;
  report: ReturnType<typeof vi.fn<(message: string) => void>>;
  store: {
    createPendingOrder: ReturnType<
      typeof vi.fn<CheckoutStore["createPendingOrder"]>
    >;
    attemptState: ReturnType<typeof vi.fn<CheckoutStore["attemptState"]>>;
    claimProviderCreate: ReturnType<
      typeof vi.fn<CheckoutStore["claimProviderCreate"]>
    >;
    linkProviderOrder: ReturnType<
      typeof vi.fn<CheckoutStore["linkProviderOrder"]>
    >;
    closeProviderCreate: ReturnType<
      typeof vi.fn<CheckoutStore["closeProviderCreate"]>
    >;
  };
  storeFactory: ReturnType<typeof vi.fn<() => CheckoutStore | null>>;
  deps: FlowDependencies;
};

/** The happy path by default: an open gate, an allowed and verified request, a fresh order that links at once. */
function doubles(): Doubles {
  const store = {
    createPendingOrder: vi.fn<CheckoutStore["createPendingOrder"]>(async () =>
      ok({ ...state(), replayed: false }),
    ),
    attemptState: vi.fn<CheckoutStore["attemptState"]>(async () => ok(state())),
    claimProviderCreate: vi.fn<CheckoutStore["claimProviderCreate"]>(async () =>
      ok({
        ...state({
          providerOrderState: "requested",
          providerCreateRequestedAt: NOW,
        }),
        claimed: true,
      }),
    ),
    linkProviderOrder: vi.fn<CheckoutStore["linkProviderOrder"]>(async () =>
      ok({ ...LINKED, linked: true }),
    ),
    closeProviderCreate: vi.fn<CheckoutStore["closeProviderCreate"]>(
      async (_id, outcome) =>
        ok({
          ...state({
            providerOrderState: outcome,
            providerCreateRequestedAt: NOW,
          }),
          closed: true,
        }),
    ),
  };
  const d = {
    gate: vi.fn<() => SalesGate>(() => ({ open: true, config: CONFIG })),
    throttle: vi.fn<FlowDependencies["throttle"]>(async () => ({ ok: true })),
    verifyChallenge: vi.fn<FlowDependencies["verifyChallenge"]>(async () => ({
      ok: true,
    })),
    createOrder: vi.fn<FlowDependencies["createOrder"]>(
      async (): Promise<CreateOrderOutcome> => ({
        outcome: "created",
        order: PROVIDER_ORDER,
      }),
    ),
    findOrders: vi.fn<FlowDependencies["findOrders"]>(
      async (): Promise<FindOrdersOutcome> => ({
        outcome: "found",
        orders: [],
      }),
    ),
    issueToken: vi.fn<FlowDependencies["issueToken"]>(() => ({
      salt: "a".repeat(64),
      hash: "b".repeat(64),
    })),
    report: vi.fn<(message: string) => void>(),
    store,
    storeFactory: vi.fn<() => CheckoutStore | null>(() => store),
  };
  return {
    ...d,
    deps: {
      gate: d.gate,
      throttle: d.throttle,
      verifyChallenge: d.verifyChallenge,
      store: d.storeFactory,
      createOrder: d.createOrder,
      findOrders: d.findOrders,
      issueToken: d.issueToken,
      report: d.report,
    },
  };
}

const FIELDS = {
  name: "Asha Rao",
  email: "Asha.Rao@example.com",
  phone: "+91 98765 43210",
  pin: "400001",
  address: "12, Marine Drive",
  address2: "",
  city: "Mumbai",
  state: "Maharashtra",
};

const SUBMISSION = {
  attempt_key: KEY,
  items: [{ variant_code: "the-moon-between-two-peaks:black", quantity: 2 }],
  shown_total_paise: "4200000",
  fields: FIELDS,
  payment_method: "upi",
  turnstile_token: "token-from-the-widget",
};

const CONTEXT = { address: "203.0.113.7" };

const LAUNCH: CheckoutActionResult = {
  status: "launch",
  launch: {
    key_id: "rzp_test_PLACEHOLDER0001",
    provider_order_id: "order_PLACEHOLDER001",
    amount_paise: "4200000",
    currency: "INR",
    order_number: "AS-1001",
    expires_at: LINKED.expiresAt!.toISOString(),
  },
};

function expectNothingWritten(d: Doubles) {
  expect(d.store.createPendingOrder).not.toHaveBeenCalled();
  expect(d.store.claimProviderCreate).not.toHaveBeenCalled();
  expect(d.store.linkProviderOrder).not.toHaveBeenCalled();
  expect(d.store.closeProviderCreate).not.toHaveBeenCalled();
  expect(d.createOrder).not.toHaveBeenCalled();
  expect(d.findOrders).not.toHaveBeenCalled();
}

let d: Doubles;
beforeEach(() => {
  d = doubles();
});

describe("submitCheckout — the allowed path", () => {
  it("writes the pending order, then claims, creates the provider order once, links it and only then returns launch data", async () => {
    expect(await submitCheckout(SUBMISSION, CONTEXT, d.deps)).toEqual(LAUNCH);

    const order = [
      d.gate,
      d.throttle,
      d.verifyChallenge,
      d.store.createPendingOrder,
      d.store.claimProviderCreate,
      d.createOrder,
      d.store.linkProviderOrder,
    ].map((mock) => mock.mock.invocationCallOrder[0]);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    for (const mock of [
      d.store.createPendingOrder,
      d.store.claimProviderCreate,
      d.createOrder,
      d.store.linkProviderOrder,
    ])
      expect(mock).toHaveBeenCalledTimes(1);

    expect(d.throttle).toHaveBeenCalledWith("submit", "203.0.113.7");
    expect(d.verifyChallenge).toHaveBeenCalledWith({
      token: "token-from-the-widget",
      secret: CONFIG.turnstileSecret,
      remoteIp: "203.0.113.7",
      expectedHostnames: CONFIG.turnstileHostnames,
      production: false,
    });

    // The write receives hashes and normalised values — never the attempt key or a browser amount as authority.
    const request = d.store.createPendingOrder.mock.calls[0][0];
    expect(request.attemptHash).toBe(attemptHash(KEY));
    expect(request.payloadMac).toMatch(/^[0-9a-f]{64}$/);
    expect(request.tokenSalt).toBe("a".repeat(64));
    expect(request.tokenHash).toBe("b".repeat(64));
    expect(request.expectedTotalPaise).toBe(BigInt(4200000));
    expect(request.fields).toEqual({
      name: "Asha Rao",
      email: "asha.rao@example.com",
      phone: "9876543210",
      pincode: "400001",
      line1: "12, Marine Drive",
      line2: null,
      city: "Mumbai",
      state: "Maharashtra",
    });
    expect(
      JSON.stringify(request, (_k, v) => (typeof v === "bigint" ? `${v}` : v)),
    ).not.toContain(KEY);

    // The provider is sent the STORED amount, the receipt and the order number — nothing about the customer.
    expect(d.createOrder).toHaveBeenCalledWith(
      {
        amountPaise: BigInt(4200000),
        receipt: RECEIPT,
        orderNumber: "AS-1001",
      },
      { keyId: CONFIG.razorpayKeyId, keySecret: CONFIG.razorpayKeySecret },
    );
    expect(d.store.linkProviderOrder).toHaveBeenCalledWith(
      PA_ID,
      "order_PLACEHOLDER001",
      NOW,
    );
  });

  it("returns nothing but the launch data: no token, no secret, no customer detail", async () => {
    const result = await submitCheckout(SUBMISSION, CONTEXT, d.deps);
    const text = JSON.stringify(result);
    for (const never of [
      CONFIG.razorpayKeySecret,
      CONFIG.orderTokenSecret,
      CONFIG.turnstileSecret,
      "a".repeat(64),
      "b".repeat(64),
      KEY,
      PA_ID,
      "asha",
      "9876543210",
      "Marine",
    ])
      expect(text.toLowerCase()).not.toContain(never.toLowerCase());
    expect(
      Object.keys((result as typeof LAUNCH & { launch: object }).launch).sort(),
    ).toEqual([
      "amount_paise",
      "currency",
      "expires_at",
      "key_id",
      "order_number",
      "provider_order_id",
    ]);
  });

  it("a repeated submission of a linked attempt returns the same order and makes no provider call", async () => {
    d.store.createPendingOrder.mockResolvedValue(
      ok({ ...LINKED, replayed: true }),
    );
    expect(await submitCheckout(SUBMISSION, CONTEXT, d.deps)).toEqual(LAUNCH);
    expect(d.store.claimProviderCreate).not.toHaveBeenCalled();
    expect(d.createOrder).not.toHaveBeenCalled();
    expect(d.findOrders).not.toHaveBeenCalled();
    expect(d.store.linkProviderOrder).not.toHaveBeenCalled();
  });
});

describe("submitCheckout — every gate stops the flow with zero writes and zero provider calls", () => {
  it.each([
    "mode_off",
    "mode_live_not_open",
    "mode_invalid",
    "production",
    "identity",
    "razorpay_key",
    "razorpay_secret",
    "token_secret",
    "turnstile",
    "throttle",
  ] as const)(
    "a closed gate (%s) answers closed before any abuse control, database or provider is touched",
    async (reason) => {
      d.gate.mockReturnValue({ open: false, reason });
      expect(await submitCheckout(SUBMISSION, CONTEXT, d.deps)).toEqual({
        status: "closed",
      });
      expect(d.throttle).not.toHaveBeenCalled();
      expect(d.verifyChallenge).not.toHaveBeenCalled();
      expect(d.storeFactory).not.toHaveBeenCalled();
      expectNothingWritten(d);
      // The reason is not the browser's to know.
      expect(
        JSON.stringify(await submitCheckout(SUBMISSION, CONTEXT, d.deps)),
      ).not.toContain(reason);
    },
  );

  it("a closed gate answers closed even for a forged body that claims an open store", async () => {
    d.gate.mockReturnValue({ open: false, reason: "production" });
    expect(
      await submitCheckout(
        { ...SUBMISSION, sales_open: true, synthetic: true, mode: "test" },
        CONTEXT,
        d.deps,
      ),
    ).toEqual({ status: "closed" });
    expectNothingWritten(d);
  });

  it.each([
    ["not an object", "nope"],
    ["null", null],
    [
      "a client price",
      { ...SUBMISSION, items: [{ ...SUBMISSION.items[0], price_paise: 1 }] },
    ],
    [
      "a provider order id",
      { ...SUBMISSION, provider_order_id: "order_PLACEHOLDER001" },
    ],
    ["an empty bag", { ...SUBMISSION, items: [] }],
    ["a malformed key", { ...SUBMISSION, attempt_key: "short" }],
  ])(
    "a malformed submission (%s) is invalid before the rate limit is even counted",
    async (_label, input) => {
      expect(await submitCheckout(input, CONTEXT, d.deps)).toEqual({
        status: "invalid",
        fields: {},
      });
      expect(d.throttle).not.toHaveBeenCalled();
      expect(d.verifyChallenge).not.toHaveBeenCalled();
      expectNothingWritten(d);
    },
  );

  it("refused fields come back by name, and nothing else runs", async () => {
    expect(
      await submitCheckout(
        {
          ...SUBMISSION,
          fields: { ...FIELDS, email: "nope", pin: "012345", city: "" },
        },
        CONTEXT,
        d.deps,
      ),
    ).toEqual({
      status: "invalid",
      fields: { email: "invalid", pin: "invalid", city: "required" },
    });
    expect(d.throttle).not.toHaveBeenCalled();
    expectNothingWritten(d);
  });

  it.each([
    [{ ok: false, reason: "rate_limited" } as const, "throttled"],
    [{ ok: false, reason: "unavailable" } as const, "unavailable"],
  ])(
    "a rate limit answer %j is %s — before Turnstile is asked",
    async (outcome, status) => {
      d.throttle.mockResolvedValue(outcome);
      expect(await submitCheckout(SUBMISSION, CONTEXT, d.deps)).toEqual({
        status,
      });
      expect(d.verifyChallenge).not.toHaveBeenCalled();
      expect(d.storeFactory).not.toHaveBeenCalled();
      expectNothingWritten(d);
    },
  );

  it.each([
    [{ ok: false, reason: "failed" } as const, "challenge_failed"],
    [{ ok: false, reason: "unavailable" } as const, "unavailable"],
  ])(
    "a Turnstile answer %j is %s — before the database is touched",
    async (outcome, status) => {
      d.verifyChallenge.mockResolvedValue(outcome);
      expect(await submitCheckout(SUBMISSION, CONTEXT, d.deps)).toEqual({
        status,
      });
      expect(d.storeFactory).not.toHaveBeenCalled();
      expectNothingWritten(d);
    },
  );

  it("an unavailable privileged client is unavailable, with a sanitised code only", async () => {
    d.storeFactory.mockReturnValue(null);
    expect(await submitCheckout(SUBMISSION, CONTEXT, d.deps)).toEqual({
      status: "unavailable",
    });
    expectNothingWritten(d);
    expect(d.report.mock.calls).toEqual([
      ["[checkout] privileged client unavailable"],
    ]);
  });

  it.each([
    ["sales_closed", { status: "closed" }],
    ["item_unavailable", { status: "bag_changed" }],
    ["total_changed", { status: "bag_changed" }],
    ["invalid_request", { status: "invalid", fields: {} }],
    ["attempt_payload_changed", { status: "invalid", fields: {} }],
    ["rule_not_supported", { status: "unavailable" }],
    ["policies_missing", { status: "unavailable" }],
    ["amount_out_of_range", { status: "unavailable" }],
    ["unavailable", { status: "unavailable" }],
  ] as const)(
    "a database refusal (%s) maps to %j and no provider is called",
    async (refusal, expected) => {
      d.store.createPendingOrder.mockResolvedValue(refused(refusal));
      expect(await submitCheckout(SUBMISSION, CONTEXT, d.deps)).toEqual(
        expected,
      );
      expect(d.store.claimProviderCreate).not.toHaveBeenCalled();
      expect(d.createOrder).not.toHaveBeenCalled();
      expect(d.findOrders).not.toHaveBeenCalled();
    },
  );
});

describe("the provider step — exactly one create per attempt, and uncertainty is held", () => {
  it("a lost claim never creates: the request that did not win judges the state the winner left", async () => {
    d.store.claimProviderCreate.mockResolvedValue(
      ok({
        ...state({
          providerOrderState: "requested",
          providerCreateRequestedAt: NOW,
        }),
        claimed: false,
      }),
    );
    expect(await submitCheckout(SUBMISSION, CONTEXT, d.deps)).toEqual({
      status: "in_progress",
    });
    expect(d.createOrder).not.toHaveBeenCalled();
    expect(d.store.linkProviderOrder).not.toHaveBeenCalled();
  });

  it.each([
    ["sales_closed", "closed"],
    ["attempt_too_old", "expired"],
    ["state_conflict", "held"],
    ["unavailable", "unavailable"],
    ["attempt_not_found", "unavailable"],
  ] as const)(
    "a refused claim (%s) is %s and no provider order is created",
    async (refusal, status) => {
      d.store.claimProviderCreate.mockResolvedValue(refused(refusal));
      expect(await submitCheckout(SUBMISSION, CONTEXT, d.deps)).toEqual({
        status,
      });
      expect(d.createOrder).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["bad_request", false],
    ["client_error", false],
    ["unauthorised", true],
  ] as const)(
    "a definite refusal (%s) is closed failed (review: %s) — the customer starts again as a new order",
    async (reason, review) => {
      d.createOrder.mockResolvedValue({ outcome: "refused", reason });
      expect(await submitCheckout(SUBMISSION, CONTEXT, d.deps)).toEqual({
        status: "start_failed",
      });
      expect(d.createOrder).toHaveBeenCalledTimes(1);
      expect(d.store.closeProviderCreate.mock.calls).toEqual([
        [PA_ID, "failed", `provider_${reason}`, review],
      ]);
      expect(d.store.linkProviderOrder).not.toHaveBeenCalled();
    },
  );

  it.each([
    "timeout",
    "network",
    "server_error",
    "rate_limited",
    "malformed",
    "duplicate_or_in_progress",
  ] as const)(
    "an uncertain answer (%s) is closed unknown and held: no second create, no launch, no failure claim",
    async (reason) => {
      d.createOrder.mockResolvedValue({ outcome: "unknown", reason });
      expect(await submitCheckout(SUBMISSION, CONTEXT, d.deps)).toEqual({
        status: "start_unknown",
      });
      expect(d.createOrder).toHaveBeenCalledTimes(1);
      expect(d.store.closeProviderCreate.mock.calls).toEqual([
        [PA_ID, "unknown", `provider_${reason}`, false],
      ]);
      expect(d.store.linkProviderOrder).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["another amount", { amountPaise: BigInt(4200001) }],
    ["another currency", { currency: "USD" }],
    ["another receipt", { receipt: "pa_other" }],
    ["no receipt", { receipt: null }],
  ])(
    "a provider order with %s is never linked: held unknown, under review",
    async (_label, change) => {
      d.createOrder.mockResolvedValue({
        outcome: "created",
        order: { ...PROVIDER_ORDER, ...change },
      });
      expect(await submitCheckout(SUBMISSION, CONTEXT, d.deps)).toEqual({
        status: "start_unknown",
      });
      expect(d.store.linkProviderOrder).not.toHaveBeenCalled();
      expect(d.store.closeProviderCreate.mock.calls).toEqual([
        [PA_ID, "unknown", "provider_mismatch", true],
      ]);
    },
  );

  it("an accepted create whose link cannot be stored leaves the claim in place — no launch, no second create", async () => {
    d.store.linkProviderOrder.mockResolvedValue(refused("unavailable"));
    expect(await submitCheckout(SUBMISSION, CONTEXT, d.deps)).toEqual({
      status: "start_unknown",
    });
    // The row stays `requested`: a later resume closes it as unknown and recovers the order by receipt.
    expect(d.store.closeProviderCreate).not.toHaveBeenCalled();
    expect(d.createOrder).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["state_conflict", "link_conflict"],
    ["provider_time_out_of_range", "provider_time_out_of_range"],
  ] as const)(
    "a link refused as %s is held unknown under review",
    async (refusal, reason) => {
      d.store.linkProviderOrder.mockResolvedValue(refused(refusal));
      expect(await submitCheckout(SUBMISSION, CONTEXT, d.deps)).toEqual({
        status: "start_unknown",
      });
      expect(d.store.closeProviderCreate.mock.calls).toEqual([
        [PA_ID, "unknown", reason, true],
      ]);
    },
  );

  it("a link that lands on an order past its deadline answers expired, not launch", async () => {
    d.store.linkProviderOrder.mockResolvedValue(
      ok({ ...LINKED, expiresAt: new Date(NOW.getTime() - 1), linked: true }),
    );
    expect(await submitCheckout(SUBMISSION, CONTEXT, d.deps)).toEqual({
      status: "expired",
    });
  });
});

describe("resumeCheckout — by the attempt key alone", () => {
  const resume = (input: unknown = { attempt_key: KEY }) =>
    resumeCheckout(input, CONTEXT, d.deps);

  it("needs no Turnstile and writes no business row: one read by the key's hash", async () => {
    d.store.attemptState.mockResolvedValue(ok(LINKED));
    expect(await resume()).toEqual(LAUNCH);
    expect(d.throttle).toHaveBeenCalledWith("resume", "203.0.113.7");
    expect(d.verifyChallenge).not.toHaveBeenCalled();
    expect(d.store.attemptState).toHaveBeenCalledWith(attemptHash(KEY));
    expect(d.store.createPendingOrder).not.toHaveBeenCalled();
    expect(d.createOrder).not.toHaveBeenCalled();
  });

  it("returns the same deadline every time — a resume never extends it", async () => {
    d.store.attemptState.mockResolvedValue(ok(LINKED));
    const first = await resume();
    const second = await resume();
    expect(first).toEqual(second);
    expect(d.store.linkProviderOrder).not.toHaveBeenCalled();
  });

  it("a closed gate answers closed with no read", async () => {
    d.gate.mockReturnValue({ open: false, reason: "mode_off" });
    expect(await resume()).toEqual({ status: "closed" });
    expect(d.throttle).not.toHaveBeenCalled();
    expect(d.storeFactory).not.toHaveBeenCalled();
  });

  it.each([
    ["no key", {}],
    ["a malformed key", { attempt_key: "short" }],
    ["an email instead of a key", { email: "a@b.co" }],
    [
      "an order number beside the key",
      { attempt_key: KEY, order_number: "AS-1001" },
    ],
  ])(
    "%s is not_found before anything is counted or read — no lookup by any other handle exists",
    async (_label, input) => {
      expect(await resume(input)).toEqual({ status: "not_found" });
      expect(d.throttle).not.toHaveBeenCalled();
      expect(d.storeFactory).not.toHaveBeenCalled();
    },
  );

  it("an unknown key is not_found, and so is one older than the server honours", async () => {
    d.store.attemptState.mockResolvedValue(ok(null));
    expect(await resume()).toEqual({ status: "not_found" });
    d.store.attemptState.mockResolvedValue(
      ok({
        ...LINKED,
        placedAt: new Date(NOW.getTime() - ATTEMPT_HONOURED_MS - 1),
      }),
    );
    expect(await resume()).toEqual({ status: "not_found" });
  });

  it.each([
    [{ ok: false, reason: "rate_limited" } as const, "throttled"],
    [{ ok: false, reason: "unavailable" } as const, "unavailable"],
  ])("a rate limit answer %j is %s with no read", async (outcome, status) => {
    d.throttle.mockResolvedValue(outcome);
    expect(await resume()).toEqual({ status });
    expect(d.storeFactory).not.toHaveBeenCalled();
  });

  it.each<[string, Partial<AttemptState>, CheckoutActionResult["status"]]>([
    ["under review", { needsReview: true }, "held"],
    ["captured", { paymentStatus: "captured" }, "held"],
    ["failed", { paymentStatus: "failed" }, "held"],
    ["expired by status", { paymentStatus: "expired" }, "held"],
    ["past its deadline", { expiresAt: new Date(NOW.getTime()) }, "expired"],
  ])(
    "a linked order that is %s gives no launch data",
    async (_label, change, status) => {
      d.store.attemptState.mockResolvedValue(ok({ ...LINKED, ...change }));
      const result = await resume();
      expect(result).toEqual({ status });
      expect(JSON.stringify(result)).not.toContain("order_PLACEHOLDER001");
    },
  );

  it("a failed attempt answers start_failed and calls nothing", async () => {
    d.store.attemptState.mockResolvedValue(
      ok(state({ providerOrderState: "failed" })),
    );
    expect(await resume()).toEqual({ status: "start_failed" });
    expect(d.createOrder).not.toHaveBeenCalled();
    expect(d.findOrders).not.toHaveBeenCalled();
  });

  it("an intent left by a request that died before the claim is started here — once", async () => {
    d.store.attemptState.mockResolvedValue(ok(state()));
    expect(await resume()).toEqual(LAUNCH);
    expect(d.store.claimProviderCreate).toHaveBeenCalledTimes(1);
    expect(d.createOrder).toHaveBeenCalledTimes(1);
  });

  it("a young requested claim is in_progress: nothing is closed, created or read", async () => {
    d.store.attemptState.mockResolvedValue(
      ok(
        state({
          providerOrderState: "requested",
          providerCreateRequestedAt: new Date(
            NOW.getTime() - STALE_REQUEST_MS + 1,
          ),
        }),
      ),
    );
    expect(await resume()).toEqual({ status: "in_progress" });
    expect(d.store.closeProviderCreate).not.toHaveBeenCalled();
    expect(d.createOrder).not.toHaveBeenCalled();
    expect(d.findOrders).not.toHaveBeenCalled();
  });

  it("a stale requested claim is closed unknown and recovered by receipt — never created again", async () => {
    d.store.attemptState.mockResolvedValue(
      ok(
        state({
          providerOrderState: "requested",
          providerCreateRequestedAt: new Date(NOW.getTime() - STALE_REQUEST_MS),
        }),
      ),
    );
    d.findOrders.mockResolvedValue({
      outcome: "found",
      orders: [PROVIDER_ORDER],
    });
    expect(await resume()).toEqual(LAUNCH);
    expect(d.store.closeProviderCreate.mock.calls).toEqual([
      [PA_ID, "unknown", "stale_request", false],
    ]);
    expect(d.findOrders).toHaveBeenCalledWith(RECEIPT, {
      keyId: CONFIG.razorpayKeyId,
      keySecret: CONFIG.razorpayKeySecret,
    });
    expect(d.createOrder).not.toHaveBeenCalled();
    expect(d.store.linkProviderOrder).toHaveBeenCalledWith(
      PA_ID,
      "order_PLACEHOLDER001",
      NOW,
    );
  });

  it("a stale claim that another request finished meanwhile is in_progress, not a second close", async () => {
    d.store.attemptState.mockResolvedValue(
      ok(
        state({
          providerOrderState: "requested",
          providerCreateRequestedAt: new Date(0),
        }),
      ),
    );
    d.store.closeProviderCreate.mockResolvedValue(refused("state_conflict"));
    expect(await resume()).toEqual({ status: "in_progress" });
    expect(d.findOrders).not.toHaveBeenCalled();
  });

  const unknown = state({
    providerOrderState: "unknown",
    providerCreateRequestedAt: NOW,
  });

  it("an unknown attempt links on exactly one exact match by receipt, with the provider's original creation time", async () => {
    d.store.attemptState.mockResolvedValue(ok(unknown));
    const created = new Date(NOW.getTime() - 5000);
    d.findOrders.mockResolvedValue({
      outcome: "found",
      orders: [{ ...PROVIDER_ORDER, createdAt: created }],
    });
    expect(await resume()).toEqual(LAUNCH);
    expect(d.store.linkProviderOrder).toHaveBeenCalledWith(
      PA_ID,
      "order_PLACEHOLDER001",
      created,
    );
    expect(d.createOrder).not.toHaveBeenCalled();
  });

  it.each<[string, FindOrdersOutcome]>([
    ["the read fails", { outcome: "unavailable" }],
    ["no order is found", { outcome: "found", orders: [] }],
    [
      "two orders are found",
      {
        outcome: "found",
        orders: [
          PROVIDER_ORDER,
          { ...PROVIDER_ORDER, id: "order_PLACEHOLDER002" },
        ],
      },
    ],
    [
      "the one order has another amount",
      {
        outcome: "found",
        orders: [{ ...PROVIDER_ORDER, amountPaise: BigInt(1) }],
      },
    ],
    [
      "the one order has another receipt",
      {
        outcome: "found",
        orders: [{ ...PROVIDER_ORDER, receipt: "pa_other" }],
      },
    ],
  ])(
    "an unknown attempt stays held when %s — no link, no create",
    async (_label, found) => {
      d.store.attemptState.mockResolvedValue(ok(unknown));
      d.findOrders.mockResolvedValue(found);
      expect(await resume()).toEqual({ status: "start_unknown" });
      expect(d.findOrders).toHaveBeenCalledTimes(1);
      expect(d.store.linkProviderOrder).not.toHaveBeenCalled();
      expect(d.createOrder).not.toHaveBeenCalled();
      expect(d.store.closeProviderCreate).not.toHaveBeenCalled();
    },
  );

  it("an unavailable read is unavailable, with a sanitised code", async () => {
    d.store.attemptState.mockResolvedValue(refused("unavailable"));
    expect(await resume()).toEqual({ status: "unavailable" });
    expect(d.report.mock.calls).toEqual([
      ["[checkout] attempt read refused (unavailable)"],
    ]);
  });
});

describe("what the log receives", () => {
  it("only enumerated codes — never a field, a key, a token, an id or a secret", async () => {
    const scenarios: Array<(x: Doubles) => void> = [
      (x) =>
        x.createOrder.mockResolvedValue({
          outcome: "refused",
          reason: "unauthorised",
        }),
      (x) =>
        x.createOrder.mockResolvedValue({
          outcome: "unknown",
          reason: "timeout",
        }),
      (x) =>
        x.createOrder.mockResolvedValue({
          outcome: "created",
          order: { ...PROVIDER_ORDER, receipt: "pa_other" },
        }),
      (x) =>
        x.store.linkProviderOrder.mockResolvedValue(refused("state_conflict")),
      (x) =>
        x.store.createPendingOrder.mockResolvedValue(
          refused("policies_missing"),
        ),
      (x) =>
        x.store.claimProviderCreate.mockResolvedValue(refused("unavailable")),
    ];
    for (const arrange of scenarios) {
      const x = doubles();
      arrange(x);
      await submitCheckout(SUBMISSION, CONTEXT, x.deps);
      expect(x.report).toHaveBeenCalled();
      for (const [message] of x.report.mock.calls) {
        expect(message).toMatch(/^\[checkout\] [a-z ]+(\([a-z_]+\))?$/);
        for (const never of [
          KEY,
          PA_ID,
          "AS-1001",
          "asha",
          "9876543210",
          "order_",
          CONFIG.razorpayKeySecret,
        ])
          expect(message.toLowerCase()).not.toContain(never.toLowerCase());
      }
    }
  });
});

describe("createCheckoutStore — the database adapter", () => {
  const ROW = {
    order_number: "AS-1001",
    payment_attempt_id: PA_ID,
    amount_paise: 4200000,
    currency: "INR",
    provider_order_state: "intent" satisfies ProviderOrderState,
    provider_order_id: null,
    provider_create_requested_at: null,
    expires_at: null,
    payment_status: "pending",
    needs_review: false,
    placed_at: "2026-11-11T09:59:59.123456+00:00",
    server_time: "2026-11-11T10:00:00.654321+00:00",
  };

  const REQUEST: PendingOrderRequest = {
    attemptHash: "c".repeat(64),
    payloadMac: "d".repeat(64),
    tokenHash: "b".repeat(64),
    tokenSalt: "a".repeat(64),
    expectedTotalPaise: BigInt(4200000),
    fields: {
      name: "Asha Rao",
      email: "asha.rao@example.com",
      phone: "9876543210",
      pincode: "400001",
      line1: "12, Marine Drive",
      line2: null,
      city: "Mumbai",
      state: "Maharashtra",
    },
    items: [{ variant_code: "the-moon-between-two-peaks:black", quantity: 2 }],
  };

  it("sends exactly the eight keys the function validates, the total as a decimal string", () => {
    expect(pendingOrderRequestBody(REQUEST)).toEqual({
      attempt_hash: "c".repeat(64),
      payload_mac: "d".repeat(64),
      token_hash: "b".repeat(64),
      token_salt: "a".repeat(64),
      expected_total_paise: "4200000",
      contact: {
        name: "Asha Rao",
        email: "asha.rao@example.com",
        phone: "9876543210",
      },
      address: {
        line1: "12, Marine Drive",
        line2: null,
        city: "Mumbai",
        state: "Maharashtra",
        pincode: "400001",
      },
      items: [
        { variant_code: "the-moon-between-two-peaks:black", quantity: 2 },
      ],
    });
  });

  it("calls one function per method and parses the state, exact paise and the database's timestamps", async () => {
    const rpc = vi.fn(async () => ({
      data: { ...ROW, replayed: false },
      error: null,
    }));
    const store = createCheckoutStore(rpc);
    const result = await store.createPendingOrder(REQUEST);
    expect(rpc).toHaveBeenCalledWith("checkout_create_pending_order", {
      p_request: pendingOrderRequestBody(REQUEST),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.amountPaise).toBe(BigInt(4200000));
      expect(result.value.replayed).toBe(false);
      expect(result.value.serverTime.toISOString()).toBe(
        "2026-11-11T10:00:00.654Z",
      );
      expect(result.value.providerOrderState).toBe("intent");
    }

    const names: string[] = [];
    const recording = createCheckoutStore(async (name) => {
      names.push(name);
      return { data: null, error: { code: "ZC010" } };
    });
    await recording.attemptState("c".repeat(64));
    await recording.claimProviderCreate(PA_ID);
    await recording.linkProviderOrder(PA_ID, "order_PLACEHOLDER001", NOW);
    await recording.closeProviderCreate(
      PA_ID,
      "unknown",
      "provider_timeout",
      false,
    );
    expect(names).toEqual([
      "checkout_attempt_state",
      "checkout_claim_provider_create",
      "checkout_link_provider_order",
      "checkout_close_provider_create",
    ]);
  });

  it.each([
    ["ZC001", "invalid_request"],
    ["ZC002", "attempt_payload_changed"],
    ["ZC003", "sales_closed"],
    ["ZC004", "rule_not_supported"],
    ["ZC005", "item_unavailable"],
    ["ZC006", "total_changed"],
    ["ZC007", "policies_missing"],
    ["ZC008", "amount_out_of_range"],
    ["ZC010", "attempt_not_found"],
    ["ZC011", "state_conflict"],
    ["ZC012", "attempt_too_old"],
    ["ZC013", "provider_time_out_of_range"],
    ["23505", "unavailable"],
    ["23514", "unavailable"],
    ["42501", "unavailable"],
    ["PGRST202", "unavailable"],
    [undefined, "unavailable"],
    [null, "unavailable"],
    ["toString", "unavailable"],
  ] as const)(
    "maps SQLSTATE %s to %s and reads nothing else of the error",
    async (code, refusal) => {
      const store = createCheckoutStore(async () => ({
        data: null,
        error: {
          code,
          message: "Failing row contains (asha.rao@example.com, 9876543210)",
          details: "private detail",
        } as { code?: string | null },
      }));
      const result = await store.createPendingOrder(REQUEST);
      expect(result).toEqual({ ok: false, refusal });
      expect(JSON.stringify(result)).not.toContain("asha");
    },
  );

  it("a unique violation while linking is a conflict; anywhere else it is unavailable", async () => {
    const store = createCheckoutStore(async () => ({
      data: null,
      error: { code: "23505" },
    }));
    expect(
      await store.linkProviderOrder(PA_ID, "order_PLACEHOLDER001", NOW),
    ).toEqual({ ok: false, refusal: "state_conflict" });
    expect(await store.claimProviderCreate(PA_ID)).toEqual({
      ok: false,
      refusal: "unavailable",
    });
  });

  it.each([
    [
      "a thrown error",
      async () => {
        throw new Error("network");
      },
    ],
    ["a missing flag", async () => ({ data: ROW, error: null })],
    [
      "a non-boolean flag",
      async () => ({ data: { ...ROW, replayed: "no" }, error: null }),
    ],
    [
      "an unknown state",
      async () => ({
        data: { ...ROW, provider_order_state: "paid", replayed: false },
        error: null,
      }),
    ],
    [
      "a fractional amount",
      async () => ({
        data: { ...ROW, amount_paise: 1.5, replayed: false },
        error: null,
      }),
    ],
    [
      "a zero amount",
      async () => ({
        data: { ...ROW, amount_paise: 0, replayed: false },
        error: null,
      }),
    ],
    [
      "another currency",
      async () => ({
        data: { ...ROW, currency: "USD", replayed: false },
        error: null,
      }),
    ],
    [
      "a malformed timestamp",
      async () => ({
        data: { ...ROW, server_time: "yesterday", replayed: false },
        error: null,
      }),
    ],
    [
      "a malformed order number",
      async () => ({
        data: { ...ROW, order_number: "1001", replayed: false },
        error: null,
      }),
    ],
    ["null", async () => ({ data: null, error: null })],
    ["a string", async () => ({ data: "ok", error: null })],
  ])(
    "an answer that does not parse (%s) is unavailable, never a guess",
    async (_label, rpc) => {
      const store = createCheckoutStore(
        rpc as Parameters<typeof createCheckoutStore>[0],
      );
      expect(await store.createPendingOrder(REQUEST)).toEqual({
        ok: false,
        refusal: "unavailable",
      });
    },
  );

  it("attemptState answers null for no attempt and unavailable for a body that does not parse", async () => {
    expect(
      await createCheckoutStore(async () => ({
        data: null,
        error: null,
      })).attemptState("c".repeat(64)),
    ).toEqual({ ok: true, value: null });
    expect(
      await createCheckoutStore(async () => ({
        data: { order_number: "x" },
        error: null,
      })).attemptState("c".repeat(64)),
    ).toEqual({ ok: false, refusal: "unavailable" });
  });
});
