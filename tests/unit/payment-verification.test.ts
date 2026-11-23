import { createHash, createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  checkoutReturnSchema,
  isOrderPath,
  orderPathOf,
  webhookEnvelopeSchema,
} from "@/lib/schemas/payments";
import {
  ATTEMPT_HONOURED_MS,
  verifyCheckoutReturn,
  type FlowDependencies,
} from "@/lib/server/checkout/flow";
import {
  providerGate,
  salesGate,
  type SalesGateEnv,
} from "@/lib/server/checkout/gate";
import type {
  AttemptState,
  CheckoutStore,
  StoreResult,
} from "@/lib/server/checkout/store";
import { attemptHash } from "@/lib/server/checkout/tokens";
import {
  paymentsGate,
  type PaymentsConfig,
  type PaymentsGate,
} from "@/lib/server/payments/config";
import {
  verifyCheckoutSignature,
  verifyWebhookSignature,
} from "@/lib/server/payments/signature";
import type {
  PaymentResult,
  PaymentStore,
  ReturnState,
} from "@/lib/server/payments/store";
import {
  EVENT_ID_HEADER,
  handleRazorpayWebhook,
  ledgerEventId,
  SIGNATURE_HEADER,
  WEBHOOK_MAX_BODY_BYTES,
  type WebhookDependencies,
} from "@/lib/server/payments/webhook";

/**
 * Verification — S1.7 (docs/sprint-prompts/S1.7-razorpay-verification.md §H.3). Everything here is hermetic: the
 * database and the provider are doubles (the database's real behaviour is tests/integration/payments.test.ts). What
 * is proven is ORDER and RESTRAINT:
 *   - Razorpay's two signatures are two secrets over two messages, compared in constant time over equal lengths —
 *     the webhook's over the body's exact bytes, Checkout's over the order id THE SERVER stored;
 *   - the webhook stores nothing before the signature has verified, stores the delivery before it has any effect,
 *     and acknowledges only a durable outcome — a forged delivery can therefore never hold a genuine event's id,
 *     and a delivery that was not processed is never answered "ok";
 *   - the verified return confirms nothing: it records a report and answers the order's own page, for the caller's
 *     own attempt only; a wrong, foreign or malformed report is one answer, with nothing written;
 *   - payments are processed whether or not new orders are being taken.
 * Placeholder values only: nothing here is a real key.
 */

const WEBHOOK_SECRET = "placeholder-webhook-secret";
const KEY_SECRET = "placeholder-key-secret";
const ORDER_TOKEN_SECRET = "S".repeat(43);
const ORDER_ID = "order_PLACEHOLDER001";
const PAYMENT_ID = "pay_PLACEHOLDER0001";
const EVENT_ID = "evt_PLACEHOLDER0001";
const EVENT_ROW = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const PA_ID = "9b2d6c1e-5f44-4c0a-8a51-0c7f1e9d2a10";
const KEY = "k".repeat(43);
const NOW = new Date("2026-11-22T10:00:00.000Z");

const hmacHex = (secret: string, message: string | Uint8Array) =>
  createHmac("sha256", secret).update(message).digest("hex");
const sha256Hex = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");

const CONFIG: PaymentsConfig = {
  context: "preview",
  projectRef: "abcdefghijklmnopqrst",
  razorpayKeyId: "rzp_test_PLACEHOLDER0001",
  razorpayKeySecret: KEY_SECRET,
  razorpayWebhookSecret: WEBHOOK_SECRET,
  orderTokenSecret: ORDER_TOKEN_SECRET,
};
const OPEN_GATE: PaymentsGate = { open: true, config: CONFIG };

const ok = <T>(value: T): PaymentResult<T> => ({ ok: true, value });
const refused = <T>(
  refusal: Exclude<PaymentResult<T>, { ok: true }>["refusal"],
): PaymentResult<T> => ({ ok: false, refusal });

function paymentStore() {
  return {
    recordEvent: vi.fn<PaymentStore["recordEvent"]>(async () =>
      ok({
        eventRowId: EVENT_ROW,
        inserted: true,
        derived: false,
        processingStatus: "received" as const,
      }),
    ),
    processEvent: vi.fn<PaymentStore["processEvent"]>(async () =>
      ok({ outcome: "confirmed", replayed: false }),
    ),
    returnState: vi.fn<PaymentStore["returnState"]>(async () => ok(null)),
    recordProviderCheck: vi.fn<PaymentStore["recordProviderCheck"]>(async () =>
      refused("unavailable"),
    ),
    confirmationView: vi.fn<PaymentStore["confirmationView"]>(async () =>
      ok(null),
    ),
  };
}

// --- the two signatures ---------------------------------------------------------------------------------------

describe("verifyWebhookSignature — the webhook secret over the body's exact bytes", () => {
  const body = new TextEncoder().encode(
    '{"entity":"event","event":"payment.captured","payload":{}}',
  );
  const good = hmacHex(WEBHOOK_SECRET, body);

  it("verifies the HMAC-SHA-256 of exactly the bytes that arrived", () => {
    expect(verifyWebhookSignature(body, good, WEBHOOK_SECRET)).toBe(true);
  });

  it.each([
    ["a missing signature", null],
    ["an undefined signature", undefined],
    ["an empty signature", ""],
    ["a signature one character short", good.slice(1)],
    ["a signature one character long", `${good}0`],
    ["an upper-case signature", good.toUpperCase()],
    ["a signature that is not hex", "z".repeat(64)],
    ["the signature of other bytes", hmacHex(WEBHOOK_SECRET, "other")],
    ["a signature made with the API key secret", hmacHex(KEY_SECRET, body)],
    ["a signature with surrounding space", ` ${good}`],
  ])("refuses %s", (_label, signature) => {
    expect(verifyWebhookSignature(body, signature, WEBHOOK_SECRET)).toBe(false);
  });

  it("refuses a body that changed by one byte, and the same JSON written another way", () => {
    const altered = Uint8Array.from(body);
    altered[altered.length - 2] ^= 1;
    expect(verifyWebhookSignature(altered, good, WEBHOOK_SECRET)).toBe(false);
    // The same value re-serialised is other bytes: nothing parsed is ever re-encoded to be verified.
    const respaced = new TextEncoder().encode(
      JSON.stringify(JSON.parse(new TextDecoder().decode(body)), null, 1),
    );
    expect(verifyWebhookSignature(respaced, good, WEBHOOK_SECRET)).toBe(false);
  });

  it("verifies nothing with another secret or with none", () => {
    expect(verifyWebhookSignature(body, good, "another-webhook-secret")).toBe(
      false,
    );
    expect(verifyWebhookSignature(body, hmacHex("", body), "")).toBe(false);
  });
});

describe("verifyCheckoutSignature — the API key secret over the STORED order id and the payment id", () => {
  const good = hmacHex(KEY_SECRET, `${ORDER_ID}|${PAYMENT_ID}`);

  it("verifies Razorpay's formula: HMAC-SHA-256 of `<order id>|<payment id>` as lower-case hex", () => {
    expect(
      verifyCheckoutSignature(ORDER_ID, PAYMENT_ID, good, KEY_SECRET),
    ).toBe(true);
  });

  it.each([
    [
      "a signature for another order (an order id the browser chose)",
      ORDER_ID,
      PAYMENT_ID,
      hmacHex(KEY_SECRET, `order_ANOTHERORDER01|${PAYMENT_ID}`),
    ],
    [
      "a signature for another payment",
      ORDER_ID,
      PAYMENT_ID,
      hmacHex(KEY_SECRET, `${ORDER_ID}|pay_ANOTHERPAYMENT1`),
    ],
    [
      "a signature made with the webhook secret",
      ORDER_ID,
      PAYMENT_ID,
      hmacHex(WEBHOOK_SECRET, `${ORDER_ID}|${PAYMENT_ID}`),
    ],
    [
      "the two ids the other way round",
      ORDER_ID,
      PAYMENT_ID,
      hmacHex(KEY_SECRET, `${PAYMENT_ID}|${ORDER_ID}`),
    ],
    ["an upper-case signature", ORDER_ID, PAYMENT_ID, good.toUpperCase()],
    ["a truncated signature", ORDER_ID, PAYMENT_ID, good.slice(0, 63)],
    ["no signature", ORDER_ID, PAYMENT_ID, null],
    [
      "a stored order id of another shape",
      "pay_NOTANORDER001",
      PAYMENT_ID,
      good,
    ],
    ["a payment id of another shape", ORDER_ID, "order_NOTAPAYMENT1", good],
    ["a payment id that carries the separator", ORDER_ID, "pay_A|B", good],
  ])("refuses %s", (_label, orderId, paymentId, signature) => {
    expect(
      verifyCheckoutSignature(orderId, paymentId, signature, KEY_SECRET),
    ).toBe(false);
  });

  it("verifies nothing without the secret", () => {
    expect(
      verifyCheckoutSignature(
        ORDER_ID,
        PAYMENT_ID,
        hmacHex("", `${ORDER_ID}|${PAYMENT_ID}`),
        "",
      ),
    ).toBe(false);
  });
});

// --- the payment gate ---------------------------------------------------------------------------------------------

describe("paymentsGate — where payments are processed, whatever the sales gate says", () => {
  const TEST_REF = "abcdefghijklmnopqrst";
  const PROD_REF = "tsrqponmlkjihgfedcba";
  const ENV: SalesGateEnv = {
    VERCEL_ENV: "preview",
    NEXT_PUBLIC_SUPABASE_URL: `https://${TEST_REF}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_placeholder",
    SUPABASE_SECRET_KEY: "sb_secret_placeholder",
    SUPABASE_TEST_PROJECT_REF: TEST_REF,
    SUPABASE_PROD_PROJECT_REF: PROD_REF,
    NEXT_PUBLIC_RAZORPAY_KEY_ID: "rzp_test_PLACEHOLDER0001",
    RAZORPAY_KEY_SECRET: KEY_SECRET,
    RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET,
    ORDER_TOKEN_SECRET,
  };

  it("is open with the provider values alone — no sales mode, no Turnstile, no Upstash", () => {
    const gate = paymentsGate(ENV);
    expect(gate).toEqual({
      open: true,
      config: {
        context: "preview",
        projectRef: TEST_REF,
        razorpayKeyId: "rzp_test_PLACEHOLDER0001",
        razorpayKeySecret: KEY_SECRET,
        razorpayWebhookSecret: WEBHOOK_SECRET,
        orderTokenSecret: ORDER_TOKEN_SECRET,
      },
    });
    // The same deployment takes no NEW order: the sales gate is closed, the payment gate is not.
    expect(salesGate(ENV)).toEqual({ open: false, reason: "mode_off" });
    for (const mode of ["off", "live", "nonsense", ""])
      expect(paymentsGate({ ...ENV, SALES_MODE: mode }).open).toBe(true);
  });

  it.each([
    ["Production", { VERCEL_ENV: "production" }, "production"],
    [
      "Production pointed at PROD, consistently",
      {
        VERCEL_ENV: "production",
        NEXT_PUBLIC_SUPABASE_URL: `https://${PROD_REF}.supabase.co`,
      },
      "production",
    ],
    [
      "a Preview pointed at the PROD project",
      { NEXT_PUBLIC_SUPABASE_URL: `https://${PROD_REF}.supabase.co` },
      "identity",
    ],
    [
      "a missing database secret",
      { SUPABASE_SECRET_KEY: undefined },
      "identity",
    ],
    [
      "a Live key id — a Preview never processes a live account's events",
      { NEXT_PUBLIC_RAZORPAY_KEY_ID: "rzp_live_PLACEHOLDER0001" },
      "razorpay_key",
    ],
    [
      "a missing key secret",
      { RAZORPAY_KEY_SECRET: undefined },
      "razorpay_secret",
    ],
    [
      "a missing webhook secret",
      { RAZORPAY_WEBHOOK_SECRET: undefined },
      "razorpay_webhook_secret",
    ],
    [
      "a webhook secret of fifteen characters",
      { RAZORPAY_WEBHOOK_SECRET: "x".repeat(15) },
      "razorpay_webhook_secret",
    ],
    [
      "a missing order-link secret",
      { ORDER_TOKEN_SECRET: undefined },
      "token_secret",
    ],
  ] as const)("is closed for %s", (_label, change, reason) => {
    expect(paymentsGate({ ...ENV, ...change })).toEqual({
      open: false,
      reason,
    });
    expect(providerGate({ ...ENV, ...change })).toEqual({
      open: false,
      reason,
    });
  });
});

// --- the wire contracts ---------------------------------------------------------------------------------------------

describe("the payment wire contracts (src/lib/schemas/payments.ts)", () => {
  const RETURN = {
    attempt_key: KEY,
    razorpay_payment_id: PAYMENT_ID,
    razorpay_signature: "a".repeat(64),
  };

  it("a verified-return report is exactly the attempt key, the payment id and the signature", () => {
    expect(checkoutReturnSchema.safeParse(RETURN).success).toBe(true);
  });

  it.each([
    [
      "an order id from the browser",
      { ...RETURN, razorpay_order_id: ORDER_ID },
    ],
    ["an order number", { ...RETURN, order_number: "AS-1001" }],
    ["an amount", { ...RETURN, amount: 100 }],
    ["a status", { ...RETURN, status: "captured" }],
    ["no attempt key", { ...RETURN, attempt_key: undefined }],
    ["a short attempt key", { ...RETURN, attempt_key: "short" }],
    [
      "an order id as the payment id",
      { ...RETURN, razorpay_payment_id: ORDER_ID },
    ],
    [
      "an upper-case signature",
      { ...RETURN, razorpay_signature: "A".repeat(64) },
    ],
    ["a short signature", { ...RETURN, razorpay_signature: "a".repeat(63) }],
    ["a number as the payment id", { ...RETURN, razorpay_payment_id: 5 }],
  ])("refuses %s — never ignores it", (_label, input) => {
    expect(checkoutReturnSchema.safeParse(input).success).toBe(false);
  });

  it("an order's path is `/order/<43 base64url characters>` and nothing else", () => {
    const token = "A".repeat(43);
    expect(orderPathOf(token)).toBe(`/order/${token}`);
    expect(isOrderPath(`/order/${token}`)).toBe(true);
    expect(() => orderPathOf("short")).toThrow(RangeError);
    for (const path of [
      "/order",
      "/order/",
      `/order/${token}/`,
      `/order/${token}?x=1`,
      `/order/${token}#x`,
      `/order/${"A".repeat(42)}`,
      `/order/${"A".repeat(44)}`,
      `/order/${"A".repeat(42)}+`,
      `/orders/${token}`,
      `//evil.example/order/${token}`,
      `https://evil.example/order/${token}`,
      `/checkout`,
      "",
      null,
      undefined,
      5,
    ])
      expect(isOrderPath(path), String(path)).toBe(false);
  });

  it("a delivery is an event with a type and a payload; what else it carries is kept, not required", () => {
    expect(
      webhookEnvelopeSchema.safeParse({
        entity: "event",
        event: "payment.captured",
        payload: { payment: { entity: {} } },
        account_id: "acc_PLACEHOLDER",
        contains: ["payment"],
        created_at: 1,
      }).success,
    ).toBe(true);
    for (const bad of [
      { event: "payment.captured", payload: {} },
      { entity: "payment", event: "payment.captured", payload: {} },
      { entity: "event", payload: {} },
      { entity: "event", event: "Payment Captured", payload: {} },
      { entity: "event", event: "payment.captured" },
      { entity: "event", event: "payment.captured", payload: [] },
      { entity: "event", event: "payment.captured", payload: "x" },
    ])
      expect(webhookEnvelopeSchema.safeParse(bad).success).toBe(false);
  });
});

// --- the webhook ------------------------------------------------------------------------------------------------

describe("POST /api/webhooks/razorpay — signature first, the ledger next, the effect last", () => {
  const EVENT = {
    entity: "event",
    account_id: "acc_PLACEHOLDER",
    event: "payment.captured",
    contains: ["payment"],
    payload: {
      payment: {
        entity: {
          id: PAYMENT_ID,
          entity: "payment",
          amount: 4200000,
          currency: "INR",
          status: "captured",
          order_id: ORDER_ID,
          captured: true,
        },
      },
    },
    created_at: 1700000000,
  };
  // Deliberately not the compact form: the bytes that are signed are the bytes that arrived.
  const BODY = JSON.stringify(EVENT, null, 2);

  let store: ReturnType<typeof paymentStore>;
  let gate: ReturnType<typeof vi.fn<() => PaymentsGate>>;
  let storeFactory: ReturnType<typeof vi.fn<() => PaymentStore | null>>;
  let report: ReturnType<typeof vi.fn<(message: string) => void>>;
  let deps: WebhookDependencies;

  beforeEach(() => {
    store = paymentStore();
    gate = vi.fn<() => PaymentsGate>(() => OPEN_GATE);
    storeFactory = vi.fn<() => PaymentStore | null>(() => store);
    report = vi.fn<(message: string) => void>();
    deps = { gate, store: storeFactory, report };
  });

  function delivery(
    body: string | Uint8Array<ArrayBuffer> = BODY,
    options: {
      signature?: string | null;
      eventId?: string | null;
      method?: string;
      headers?: Record<string, string>;
    } = {},
  ): Request {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...options.headers,
    };
    const signature =
      options.signature === undefined
        ? hmacHex(WEBHOOK_SECRET, body)
        : options.signature;
    if (signature !== null) headers[SIGNATURE_HEADER] = signature;
    const eventId = options.eventId === undefined ? EVENT_ID : options.eventId;
    if (eventId !== null) headers[EVENT_ID_HEADER] = eventId;
    const method = options.method ?? "POST";
    return new Request(
      // The Preview's webhook address carries Vercel's bypass in its query; the handler never reads the query.
      "https://preview.example.test/api/webhooks/razorpay?x-vercel-protection-bypass=placeholder",
      method === "GET" || method === "HEAD"
        ? { method, headers }
        : { method, headers, body },
    );
  }

  const send = (request: Request) => handleRazorpayWebhook(request, deps);
  const nothingStored = () => {
    expect(store.recordEvent).not.toHaveBeenCalled();
    expect(store.processEvent).not.toHaveBeenCalled();
  };

  it("a genuine delivery is stored as it arrived, then processed, then acknowledged", async () => {
    const response = await send(delivery());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(response.headers.get("cache-control")).toBe("no-store");

    expect(store.recordEvent).toHaveBeenCalledTimes(1);
    expect(store.recordEvent).toHaveBeenCalledWith(
      EVENT_ID,
      "payment.captured",
      EVENT,
    );
    expect(store.processEvent).toHaveBeenCalledTimes(1);
    expect(store.processEvent).toHaveBeenCalledWith(EVENT_ROW);
    // The ledger first, its effect after.
    expect(store.recordEvent.mock.invocationCallOrder[0]).toBeLessThan(
      store.processEvent.mock.invocationCallOrder[0],
    );
    // Nothing else of the adapter is the webhook's to call.
    expect(store.returnState).not.toHaveBeenCalled();
    expect(store.recordProviderCheck).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
  });

  it.each(["GET", "PUT", "PATCH", "DELETE", "OPTIONS"])(
    "%s is refused before anything is looked at",
    async (method) => {
      const response = await send(delivery(BODY, { method }));
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("POST");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toEqual({ status: "method_not_allowed" });
      expect(gate).not.toHaveBeenCalled();
      expect(storeFactory).not.toHaveBeenCalled();
    },
  );

  it.each([
    "production",
    "identity",
    "razorpay_key",
    "razorpay_secret",
    "razorpay_webhook_secret",
    "token_secret",
  ] as const)(
    "a closed payment gate (%s) is unavailable — a genuine delivery is not acknowledged and nothing is stored",
    async (reason) => {
      gate.mockReturnValue({ open: false, reason });
      const response = await send(delivery());
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ status: "unavailable" });
      expect(storeFactory).not.toHaveBeenCalled();
      expect(report).toHaveBeenCalledWith(`[webhook] closed (${reason})`);
    },
  );

  it.each([
    ["no signature", null],
    ["an empty signature", ""],
    ["a signature that is not 64 hex characters", "abc123"],
    ["an upper-case signature", hmacHex(WEBHOOK_SECRET, BODY).toUpperCase()],
    ["a signature for other bytes", hmacHex(WEBHOOK_SECRET, "other")],
    ["a signature made with the API key secret", hmacHex(KEY_SECRET, BODY)],
    [
      "a signature made with another webhook secret",
      hmacHex("x".repeat(32), BODY),
    ],
  ])(
    "%s is refused with nothing stored — no ledger row, so the event's id stays free",
    async (_label, signature) => {
      const response = await send(delivery(BODY, { signature }));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ status: "invalid_signature" });
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(storeFactory).not.toHaveBeenCalled();
      nothingStored();
    },
  );

  it("a body altered after it was signed is refused with nothing stored", async () => {
    const signature = hmacHex(WEBHOOK_SECRET, BODY);
    const altered = BODY.replace("4200000", "4200001");
    expect(altered).not.toBe(BODY);
    const response = await send(delivery(altered, { signature }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ status: "invalid_signature" });
    nothingStored();
  });

  it("a forged delivery cannot poison a genuine one: the same event id is stored and processed when it really arrives", async () => {
    const forged = await send(
      delivery(BODY.replace("4200000", "1"), {
        signature: "0".repeat(64),
      }),
    );
    expect(forged.status).toBe(400);
    nothingStored();
    const genuine = await send(delivery());
    expect(genuine.status).toBe(200);
    expect(store.recordEvent).toHaveBeenCalledTimes(1);
    expect(store.recordEvent.mock.calls[0][0]).toBe(EVENT_ID);
    expect(store.processEvent).toHaveBeenCalledTimes(1);
  });

  it("a body that declares more than the limit is refused unread; one that is longer than the limit is refused too", async () => {
    const declared = await send(
      delivery(BODY, {
        headers: { "content-length": String(WEBHOOK_MAX_BODY_BYTES + 1) },
      }),
    );
    expect(declared.status).toBe(413);
    expect(await declared.json()).toEqual({ status: "too_large" });
    const huge = "x".repeat(WEBHOOK_MAX_BODY_BYTES + 1);
    const actual = await send(delivery(huge));
    expect(actual.status).toBe(413);
    const malformedLength = await send(
      delivery(BODY, { headers: { "content-length": "many" } }),
    );
    expect(malformedLength.status).toBe(413);
    expect(storeFactory).not.toHaveBeenCalled();
    nothingStored();
    expect(WEBHOOK_MAX_BODY_BYTES).toBe(256 * 1024);
  });

  it.each([
    ["not JSON", "not json"],
    ["a JSON array", "[]"],
    ["a JSON string", '"payment.captured"'],
    ["no event type", JSON.stringify({ entity: "event", payload: {} })],
    [
      "not an event object",
      JSON.stringify({
        entity: "payment",
        event: "payment.captured",
        payload: {},
      }),
    ],
    [
      "a payload that is not an object",
      JSON.stringify({
        entity: "event",
        event: "payment.captured",
        payload: [],
      }),
    ],
    [
      "an event type of another shape",
      JSON.stringify({ entity: "event", event: "DROP TABLE", payload: {} }),
    ],
  ])(
    "a verified delivery that is %s is refused and still not stored",
    async (_label, body) => {
      const response = await send(delivery(body));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ status: "invalid_payload" });
      expect(storeFactory).not.toHaveBeenCalled();
      nothingStored();
      expect(report).toHaveBeenCalledWith(
        "[webhook] verified delivery is not an event",
      );
    },
  );

  it("bytes that are not UTF-8 are not an event, even when signed", async () => {
    const bytes = Uint8Array.from([0x7b, 0xff, 0xfe, 0x7d]);
    const response = await send(delivery(bytes));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ status: "invalid_payload" });
    nothingStored();
  });

  it("the ledger id is the provider's event id; without a usable one it is a digest of the verified bytes", async () => {
    const bytes = new TextEncoder().encode(BODY);
    expect(ledgerEventId("evt_PLACEHOLDER0001", bytes)).toBe(
      "evt_PLACEHOLDER0001",
    );
    const digest = `sha256:${sha256Hex(bytes)}`;
    for (const header of [
      null,
      "",
      "has a space",
      "evt#derived",
      "x".repeat(121),
      "évènement",
    ])
      expect(ledgerEventId(header, bytes), String(header)).toBe(digest);
    // The same bytes are the same event again; other bytes are another.
    expect(ledgerEventId(null, new TextEncoder().encode(`${BODY} `))).not.toBe(
      digest,
    );

    await send(delivery(BODY, { eventId: null }));
    expect(store.recordEvent.mock.calls[0][0]).toBe(digest);
  });

  it.each(["processed", "ignored"] as const)(
    "the same event again, already %s in the ledger, is acknowledged without a second effect",
    async (processingStatus) => {
      store.recordEvent.mockResolvedValue(
        ok({
          eventRowId: EVENT_ROW,
          inserted: false,
          derived: false,
          processingStatus,
        }),
      );
      for (let delivered = 0; delivered < 3; delivered += 1) {
        const response = await send(delivery());
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ status: "ok" });
      }
      expect(store.recordEvent).toHaveBeenCalledTimes(3);
      expect(store.processEvent).not.toHaveBeenCalled();
    },
  );

  it.each(["received", "failed"] as const)(
    "an event left %s by an earlier delivery (a crash after the ledger insert) is processed now — a ledger hit is not success",
    async (processingStatus) => {
      store.recordEvent.mockResolvedValue(
        ok({
          eventRowId: EVENT_ROW,
          inserted: false,
          derived: false,
          processingStatus,
        }),
      );
      const response = await send(delivery());
      expect(response.status).toBe(200);
      expect(store.processEvent).toHaveBeenCalledTimes(1);
      expect(store.processEvent).toHaveBeenCalledWith(EVENT_ROW);
    },
  );

  it.each([
    ["the ledger step cannot be reached", "record", "unavailable"],
    ["the effect cannot be reached", "process", "unavailable"],
    ["the outbox key is held by something else", "process", "outbox_conflict"],
    ["the ledger row is gone", "process", "event_not_found"],
    ["the state is in conflict", "process", "state_conflict"],
  ] as const)(
    "when %s the delivery is NOT acknowledged, so the provider sends it again",
    async (_label, step, refusal) => {
      if (step === "record")
        store.recordEvent.mockResolvedValue(refused(refusal));
      else store.processEvent.mockResolvedValue(refused(refusal));
      const response = await send(delivery());
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ status: "unavailable" });
      expect(response.headers.get("cache-control")).toBe("no-store");
      if (step === "record") expect(store.processEvent).not.toHaveBeenCalled();
      expect(report).toHaveBeenCalledWith(
        step === "record"
          ? `[webhook] ledger refused (${refusal})`
          : `[webhook] processing refused (${refusal})`,
      );
    },
  );

  it("a ledger step that refuses the delivery's shape answers invalid_payload", async () => {
    store.recordEvent.mockResolvedValue(refused("invalid_request"));
    const response = await send(delivery());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ status: "invalid_payload" });
    expect(store.processEvent).not.toHaveBeenCalled();
  });

  it("an unavailable privileged client is unavailable, with nothing stored", async () => {
    storeFactory.mockReturnValue(null);
    const response = await send(delivery());
    expect(response.status).toBe(503);
    expect(report).toHaveBeenCalledWith(
      "[webhook] privileged client unavailable",
    );
  });

  it.each([
    "confirmed",
    "duplicate_capture",
    "stale_authorized",
    "recorded:failed",
    "hold:authorized_only",
    "review:amount_mismatch",
    "review:unknown_reference",
    "unsupported_event",
    "malformed_payment",
  ])(
    "every durable outcome (%s) is acknowledged the same way — the answer says nothing of what the event did",
    async (outcome) => {
      store.processEvent.mockResolvedValue(ok({ outcome, replayed: false }));
      const response = await send(delivery());
      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toBe('{"status":"ok"}');
      // A review is the one outcome the log is told about — by its code alone.
      if (outcome.startsWith("review:"))
        expect(report).toHaveBeenCalledWith(`[webhook] ${outcome}`);
      else expect(report).not.toHaveBeenCalled();
    },
  );

  it("an event id already held by other content is stored beside it and processed; the log gets a code", async () => {
    store.recordEvent.mockResolvedValue(
      ok({
        eventRowId: EVENT_ROW,
        inserted: true,
        derived: true,
        processingStatus: "received",
      }),
    );
    const response = await send(delivery());
    expect(response.status).toBe(200);
    expect(store.processEvent).toHaveBeenCalledWith(EVENT_ROW);
    expect(report).toHaveBeenCalledWith(
      "[webhook] event id already held by other content",
    );
  });

  it("no answer and no log line carries an id, an amount, a signature, the body or the query", async () => {
    const answers: string[] = [];
    const scenarios: Array<() => void> = [
      () => {},
      () => store.processEvent.mockResolvedValue(refused("outbox_conflict")),
      () => store.recordEvent.mockResolvedValue(refused("unavailable")),
      () =>
        store.processEvent.mockResolvedValue(
          ok({ outcome: "review:extra_payment", replayed: false }),
        ),
      () => gate.mockReturnValue({ open: false, reason: "identity" }),
    ];
    for (const arrange of scenarios) {
      store = paymentStore();
      storeFactory.mockReturnValue(store);
      gate.mockReturnValue(OPEN_GATE);
      arrange();
      answers.push(await (await send(delivery())).text());
    }
    answers.push(
      await (await send(delivery(BODY, { signature: "0".repeat(64) }))).text(),
    );
    const said = [...answers, ...report.mock.calls.map(([line]) => line)].join(
      "\n",
    );
    for (const never of [
      EVENT_ID,
      PAYMENT_ID,
      ORDER_ID,
      EVENT_ROW,
      "4200000",
      WEBHOOK_SECRET,
      hmacHex(WEBHOOK_SECRET, BODY),
      "x-vercel-protection-bypass",
      "placeholder\n",
      "acc_PLACEHOLDER",
    ])
      expect(said).not.toContain(never);
  });
});

// --- the verified return -------------------------------------------------------------------------------------------

describe("verifyCheckoutReturn — what Razorpay's window reported, verified for the caller's own attempt", () => {
  const TOKEN = "t".repeat(43);
  const TOKEN_HASH = sha256Hex(TOKEN);
  const SALT = "a".repeat(64);
  const SIGNATURE = hmacHex(KEY_SECRET, `${ORDER_ID}|${PAYMENT_ID}`);
  const REPORT = {
    attempt_key: KEY,
    razorpay_payment_id: PAYMENT_ID,
    razorpay_signature: SIGNATURE,
  };
  const CONTEXT = { address: "203.0.113.7" };

  const LINKED: AttemptState = {
    orderNumber: "AS-1001",
    paymentAttemptId: PA_ID,
    amountPaise: BigInt(4200000),
    currency: "INR",
    providerOrderState: "linked",
    providerOrderId: ORDER_ID,
    providerCreateRequestedAt: NOW,
    expiresAt: new Date(NOW.getTime() + 60 * 60 * 1000),
    paymentStatus: "pending",
    needsReview: false,
    placedAt: new Date(NOW.getTime() - 60 * 1000),
    serverTime: NOW,
  };

  const returned = (overrides: Partial<ReturnState> = {}): ReturnState => ({
    orderNumber: "AS-1001",
    paymentStatus: "pending",
    fulfilmentStatus: "pending_payment",
    needsReview: false,
    paymentHold: null,
    expiresAt: LINKED.expiresAt,
    tokenSalt: SALT,
    tokenHash: TOKEN_HASH,
    payments: { reported: 1, authorized: 0, captured: 0, failed: 0 },
    recorded: true,
    serverTime: NOW,
    ...overrides,
  });

  const storeOk = <T>(value: T): StoreResult<T> => ({ ok: true, value });

  let payments: ReturnType<typeof paymentStore>;
  let checkout: {
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
  let salesGateDouble: ReturnType<typeof vi.fn<FlowDependencies["gate"]>>;
  let paymentsGateDouble: ReturnType<typeof vi.fn<() => PaymentsGate>>;
  let throttle: ReturnType<typeof vi.fn<FlowDependencies["throttle"]>>;
  let storeFactory: ReturnType<typeof vi.fn<() => CheckoutStore | null>>;
  let paymentsFactory: ReturnType<typeof vi.fn<() => PaymentStore | null>>;
  let deriveToken: ReturnType<typeof vi.fn<FlowDependencies["deriveToken"]>>;
  let createOrder: ReturnType<typeof vi.fn<FlowDependencies["createOrder"]>>;
  let findOrders: ReturnType<typeof vi.fn<FlowDependencies["findOrders"]>>;
  let fetchPayments: ReturnType<
    typeof vi.fn<FlowDependencies["fetchPayments"]>
  >;
  let verifyChallenge: ReturnType<
    typeof vi.fn<FlowDependencies["verifyChallenge"]>
  >;
  let report: ReturnType<typeof vi.fn<(message: string) => void>>;
  let deps: FlowDependencies;

  beforeEach(() => {
    payments = paymentStore();
    payments.returnState.mockResolvedValue(ok(returned()));
    const refuse = async () => ({ ok: false, refusal: "unavailable" }) as const;
    checkout = {
      createPendingOrder: vi.fn<CheckoutStore["createPendingOrder"]>(refuse),
      attemptState: vi.fn<CheckoutStore["attemptState"]>(async () =>
        storeOk(LINKED),
      ),
      claimProviderCreate: vi.fn<CheckoutStore["claimProviderCreate"]>(refuse),
      linkProviderOrder: vi.fn<CheckoutStore["linkProviderOrder"]>(refuse),
      closeProviderCreate: vi.fn<CheckoutStore["closeProviderCreate"]>(refuse),
    };
    // The sales gate is CLOSED throughout: the verified return must not depend on it.
    salesGateDouble = vi.fn<FlowDependencies["gate"]>(() => ({
      open: false,
      reason: "mode_off",
    }));
    paymentsGateDouble = vi.fn<() => PaymentsGate>(() => OPEN_GATE);
    throttle = vi.fn<FlowDependencies["throttle"]>(async () => ({ ok: true }));
    storeFactory = vi.fn<() => CheckoutStore | null>(() => checkout);
    paymentsFactory = vi.fn<() => PaymentStore | null>(() => payments);
    deriveToken = vi.fn<FlowDependencies["deriveToken"]>(() => TOKEN);
    createOrder = vi.fn<FlowDependencies["createOrder"]>(async () => ({
      outcome: "refused",
      reason: "bad_request",
    }));
    findOrders = vi.fn<FlowDependencies["findOrders"]>(async () => ({
      outcome: "unavailable",
    }));
    fetchPayments = vi.fn<FlowDependencies["fetchPayments"]>(async () => ({
      outcome: "unavailable",
    }));
    verifyChallenge = vi.fn<FlowDependencies["verifyChallenge"]>(async () => ({
      ok: true,
    }));
    report = vi.fn<(message: string) => void>();
    deps = {
      gate: salesGateDouble,
      throttle,
      verifyChallenge,
      store: storeFactory,
      createOrder,
      findOrders,
      issueToken: () => ({ salt: SALT, hash: TOKEN_HASH }),
      paymentsGate: paymentsGateDouble,
      payments: paymentsFactory,
      fetchPayments,
      deriveToken,
      report,
    };
  });

  const verify = (input: unknown = REPORT) =>
    verifyCheckoutReturn(input, CONTEXT, deps);

  /** Nothing that could confirm, pay, queue or start anything was touched. */
  function confirmedNothing() {
    expect(payments.recordEvent).not.toHaveBeenCalled();
    expect(payments.processEvent).not.toHaveBeenCalled();
    expect(payments.recordProviderCheck).not.toHaveBeenCalled();
    expect(checkout.createPendingOrder).not.toHaveBeenCalled();
    expect(checkout.claimProviderCreate).not.toHaveBeenCalled();
    expect(checkout.linkProviderOrder).not.toHaveBeenCalled();
    expect(checkout.closeProviderCreate).not.toHaveBeenCalled();
    expect(createOrder).not.toHaveBeenCalled();
    expect(findOrders).not.toHaveBeenCalled();
    expect(fetchPayments).not.toHaveBeenCalled();
    expect(verifyChallenge).not.toHaveBeenCalled();
  }

  it("a genuine report for the caller's own order answers that order's page — and confirms nothing", async () => {
    expect(await verify()).toEqual({
      status: "verified",
      order_path: `/order/${TOKEN}`,
    });
    // The order of work: the payment gate, the quota, the attempt by its key's hash, then the one record.
    expect(paymentsGateDouble).toHaveBeenCalledTimes(1);
    expect(throttle).toHaveBeenCalledWith("resume", "203.0.113.7");
    expect(checkout.attemptState).toHaveBeenCalledWith(attemptHash(KEY));
    expect(payments.returnState).toHaveBeenCalledTimes(1);
    expect(payments.returnState).toHaveBeenCalledWith(
      attemptHash(KEY),
      PAYMENT_ID,
    );
    // The link is derived from the order's stored salt with the server's secret — never taken from the browser.
    expect(deriveToken).toHaveBeenCalledWith(ORDER_TOKEN_SECRET, SALT);
    confirmedNothing();
    expect(report).not.toHaveBeenCalled();
  });

  it("does not ask the sales gate: a payment already made is verified while new orders are closed", async () => {
    expect((await verify()).status).toBe("verified");
    expect(salesGateDouble).not.toHaveBeenCalled();
  });

  it("answers the same page when the webhook was faster — what the page shows is the database's, not this answer's", async () => {
    payments.returnState.mockResolvedValue(
      ok(
        returned({
          paymentStatus: "captured",
          fulfilmentStatus: "confirmed",
          payments: { reported: 0, authorized: 0, captured: 1, failed: 0 },
          recorded: false,
        }),
      ),
    );
    const result = await verify();
    expect(result).toEqual({
      status: "verified",
      order_path: `/order/${TOKEN}`,
    });
    expect(JSON.stringify(result)).not.toMatch(/captured|confirmed|paid/);
    confirmedNothing();
  });

  it("a closed payment gate is unavailable before anything is read", async () => {
    paymentsGateDouble.mockReturnValue({ open: false, reason: "production" });
    expect(await verify()).toEqual({ status: "unavailable" });
    expect(throttle).not.toHaveBeenCalled();
    expect(storeFactory).not.toHaveBeenCalled();
    expect(paymentsFactory).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledWith("[return] closed (production)");
  });

  it.each([
    [
      "an order id from the browser",
      { ...REPORT, razorpay_order_id: ORDER_ID },
    ],
    ["an order number", { ...REPORT, order_number: "AS-1001" }],
    [
      "no attempt key",
      { razorpay_payment_id: PAYMENT_ID, razorpay_signature: SIGNATURE },
    ],
    ["a malformed payment id", { ...REPORT, razorpay_payment_id: "pay_!" }],
    ["a malformed signature", { ...REPORT, razorpay_signature: "sig" }],
    ["nothing at all", null],
    ["a string", "pay_PLACEHOLDER0001"],
  ])(
    "%s is rejected before anything is counted, read or written",
    async (_label, input) => {
      expect(await verify(input)).toEqual({ status: "rejected" });
      expect(throttle).not.toHaveBeenCalled();
      expect(storeFactory).not.toHaveBeenCalled();
      expect(payments.returnState).not.toHaveBeenCalled();
      confirmedNothing();
    },
  );

  it.each([
    [{ ok: false, reason: "rate_limited" } as const, "throttled"],
    [{ ok: false, reason: "unavailable" } as const, "unavailable"],
  ])("a quota answer %j is %s with nothing read", async (outcome, status) => {
    throttle.mockResolvedValue(outcome);
    expect(await verify()).toEqual({ status });
    expect(storeFactory).not.toHaveBeenCalled();
    expect(payments.returnState).not.toHaveBeenCalled();
  });

  it("an unavailable privileged client is unavailable, with a sanitised code", async () => {
    storeFactory.mockReturnValue(null);
    expect(await verify()).toEqual({ status: "unavailable" });
    paymentsFactory.mockReturnValue(null);
    storeFactory.mockReturnValue(checkout);
    expect(await verify()).toEqual({ status: "unavailable" });
    expect(report).toHaveBeenCalledWith(
      "[return] privileged client unavailable",
    );
    expect(payments.returnState).not.toHaveBeenCalled();
  });

  it.each<[string, AttemptState | null]>([
    ["no such attempt", null],
    [
      "an attempt older than the server honours",
      {
        ...LINKED,
        placedAt: new Date(NOW.getTime() - ATTEMPT_HONOURED_MS - 1),
      },
    ],
    [
      "an attempt that never reached the provider",
      { ...LINKED, providerOrderState: "intent", providerOrderId: null },
    ],
    [
      "an attempt whose provider order is unknown",
      { ...LINKED, providerOrderState: "unknown", providerOrderId: null },
    ],
    [
      "an attempt whose provider create failed",
      { ...LINKED, providerOrderState: "failed", providerOrderId: null },
    ],
  ])("%s is rejected — nothing is recorded", async (_label, state) => {
    checkout.attemptState.mockResolvedValue(storeOk(state));
    expect(await verify()).toEqual({ status: "rejected" });
    expect(payments.returnState).not.toHaveBeenCalled();
    confirmedNothing();
  });

  it.each([
    [
      "a signature for another order's id — a FOREIGN attempt's genuine report",
      hmacHex(KEY_SECRET, `order_ANOTHERORDER01|${PAYMENT_ID}`),
    ],
    [
      "a signature for another payment — a tampered payment id",
      hmacHex(KEY_SECRET, `${ORDER_ID}|pay_ANOTHERPAYMENT1`),
    ],
    [
      "a signature made with the webhook secret",
      hmacHex(WEBHOOK_SECRET, `${ORDER_ID}|${PAYMENT_ID}`),
    ],
    ["a made-up signature", "0".repeat(64)],
  ])(
    "%s is rejected, with nothing recorded and no order's page answered",
    async (_label, signature) => {
      const result = await verify({ ...REPORT, razorpay_signature: signature });
      expect(result).toEqual({ status: "rejected" });
      expect(payments.returnState).not.toHaveBeenCalled();
      expect(deriveToken).not.toHaveBeenCalled();
      expect(report).toHaveBeenCalledWith("[return] signature refused");
      confirmedNothing();
    },
  );

  it("the signature is checked against the order id the SERVER stored for the attempt", async () => {
    // The caller's attempt is linked to another provider order: the same genuine-looking report no longer verifies.
    checkout.attemptState.mockResolvedValue(
      storeOk({ ...LINKED, providerOrderId: "order_ANOTHERORDER01" }),
    );
    expect(await verify()).toEqual({ status: "rejected" });
    expect(payments.returnState).not.toHaveBeenCalled();
  });

  it.each([
    ["payment_conflict", "rejected"],
    ["state_conflict", "rejected"],
    ["invalid_request", "rejected"],
    ["unavailable", "unavailable"],
  ] as const)(
    "a record the database refuses (%s) is %s, with a sanitised code",
    async (refusal, status) => {
      payments.returnState.mockResolvedValue(refused(refusal));
      expect(await verify()).toEqual({ status });
      expect(report).toHaveBeenCalledWith(`[return] not recorded (${refusal})`);
    },
  );

  it("an attempt that vanished between the two reads is rejected", async () => {
    payments.returnState.mockResolvedValue(ok(null));
    expect(await verify()).toEqual({ status: "rejected" });
  });

  it.each([
    [
      "the derived link is not the one the order was issued with (another order-link secret)",
      returned({ tokenHash: sha256Hex("another-token") }),
    ],
    ["the order has no salt", returned({ tokenSalt: null })],
    ["the order has no token hash", returned({ tokenHash: null })],
  ])("gives no link when %s — never a dead one", async (_label, state) => {
    payments.returnState.mockResolvedValue(ok(state));
    expect(await verify()).toEqual({ status: "unavailable" });
    expect(report).toHaveBeenCalledWith("[return] order link unavailable");
  });

  it("gives no link when the derivation itself fails", async () => {
    deriveToken.mockImplementation(() => {
      throw new RangeError("not a token salt");
    });
    expect(await verify()).toEqual({ status: "unavailable" });
  });

  it("an attempt read the database refuses is unavailable", async () => {
    checkout.attemptState.mockResolvedValue({
      ok: false,
      refusal: "unavailable",
    });
    expect(await verify()).toEqual({ status: "unavailable" });
    expect(report).toHaveBeenCalledWith(
      "[return] attempt read refused (unavailable)",
    );
    expect(payments.returnState).not.toHaveBeenCalled();
  });

  it("no answer and no log line carries the key, a secret, the salt, a hash, an id or the signature", async () => {
    const results: unknown[] = [await verify()];
    results.push(
      await verify({ ...REPORT, razorpay_signature: "0".repeat(64) }),
    );
    payments.returnState.mockResolvedValue(refused("payment_conflict"));
    results.push(await verify());
    paymentsGateDouble.mockReturnValue({ open: false, reason: "identity" });
    results.push(await verify());
    const said = [
      JSON.stringify(results),
      ...report.mock.calls.map(([line]) => line),
    ].join("\n");
    for (const never of [
      KEY,
      attemptHash(KEY),
      KEY_SECRET,
      WEBHOOK_SECRET,
      ORDER_TOKEN_SECRET,
      SALT,
      TOKEN_HASH,
      SIGNATURE,
      PAYMENT_ID,
      ORDER_ID,
      PA_ID,
      "AS-1001",
    ])
      expect(said).not.toContain(never);
    // The one thing a verified answer carries is the order's own page.
    expect(Object.keys(results[0] as object).sort()).toEqual([
      "order_path",
      "status",
    ]);
  });
});

describe("the route module — src/app/api/webhooks/razorpay/route.ts, with its default wiring", () => {
  // The provider half of a Preview's configuration, and NO sales mode: the store takes no new order here, and a
  // payment already made must still be processed (D-68; the sprint record → H.3 "Payment gate"). Placeholders only.
  const TEST_REF = "abcdefghijklmnopqrst";
  const PROVIDER_ENV = {
    VERCEL_ENV: "preview",
    NEXT_PUBLIC_SUPABASE_URL: `https://${TEST_REF}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_placeholder",
    SUPABASE_SECRET_KEY: "sb_secret_placeholder",
    SUPABASE_TEST_PROJECT_REF: TEST_REF,
    SUPABASE_PROD_PROJECT_REF: "tsrqponmlkjihgfedcba",
    NEXT_PUBLIC_RAZORPAY_KEY_ID: "rzp_test_PLACEHOLDER0001",
    RAZORPAY_KEY_SECRET: KEY_SECRET,
    RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET,
    ORDER_TOKEN_SECRET,
  } as const;
  const UNSET = [
    "SALES_MODE",
    "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
    "TURNSTILE_SECRET_KEY",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
  ];
  const stubProvider = (overrides: Record<string, string | undefined> = {}) => {
    for (const [name, value] of Object.entries({
      ...PROVIDER_ENV,
      ...overrides,
    }))
      vi.stubEnv(name, value);
    for (const name of UNSET) vi.stubEnv(name, undefined);
  };
  const forged = () =>
    new Request("https://preview.example.test/api/webhooks/razorpay", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [SIGNATURE_HEADER]: "0".repeat(64),
      },
      body: JSON.stringify({
        entity: "event",
        event: "payment.captured",
        payload: {},
      }),
    });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("exports its method handlers, dynamic and on the Node runtime — every method reaches the one handler", async () => {
    const route = await import("@/app/api/webhooks/razorpay/route");
    expect(Object.keys(route).sort()).toEqual([
      "DELETE",
      "GET",
      "OPTIONS",
      "PATCH",
      "POST",
      "PUT",
      "dynamic",
      "runtime",
    ]);
    expect(route.runtime).toBe("nodejs");
    expect(route.dynamic).toBe("force-dynamic");
  });

  it("with intake closed (no sales mode) the real route still opens its payment gate: a signature that is not Razorpay's is refused by the handler itself, before anything is stored", async () => {
    stubProvider();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const route = await import("@/app/api/webhooks/razorpay/route");
    const response = await route.POST(forged());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ status: "invalid_signature" });
    // The gate did not close it: no "closed" line was reported.
    expect(errors.mock.calls.flat().join(" ")).not.toContain("closed");
  });

  it("on Production, and without the webhook secret, the real route is closed before the signature is read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const route = await import("@/app/api/webhooks/razorpay/route");
    for (const overrides of [
      { VERCEL_ENV: "production" },
      { RAZORPAY_WEBHOOK_SECRET: undefined },
    ]) {
      stubProvider(overrides);
      const response = await route.POST(forged());
      expect(response.status, JSON.stringify(overrides)).toBe(503);
      expect(await response.json()).toEqual({ status: "unavailable" });
    }
    stubProvider();
    const get = await route.GET(
      new Request("https://preview.example.test/api/webhooks/razorpay"),
    );
    expect(get.status).toBe(405);
    expect(get.headers.get("allow")).toBe("POST");
  });
});
