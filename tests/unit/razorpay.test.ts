import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createRazorpayOrder,
  findRazorpayOrdersByReceipt,
  RAZORPAY_ORDERS_URL,
} from "@/lib/server/razorpay";

/**
 * Razorpay Orders — S1.6 (src/lib/server/razorpay.ts): fixed endpoints, Basic credentials, no customer detail in
 * the request, and every answer sorted into created / refused / unknown — where anything that does not prove a
 * refusal is unknown, so the caller never calls create twice. Placeholder values only: no real key or order id.
 */

const CREDENTIALS = {
  keyId: "rzp_test_PLACEHOLDER0001",
  keySecret: "placeholder-key-secret",
};

const INPUT = {
  amountPaise: BigInt(4200000),
  receipt: "pa_3f2504e04f8941d39a0c0305e82c3301",
  orderNumber: "AS-1001",
};

const ORDER = {
  id: "order_PLACEHOLDER001",
  entity: "order",
  amount: 4200000,
  amount_paid: 0,
  amount_due: 4200000,
  currency: "INR",
  receipt: INPUT.receipt,
  status: "created",
  attempts: 0,
  notes: { order_number: "AS-1001" },
  created_at: 1_794_000_000,
};

const answering = (body: unknown, status = 200) =>
  vi.fn<typeof fetch>(async () => Response.json(body, { status }));

describe("createRazorpayOrder", () => {
  it("posts amount, INR, the receipt and the order number to the fixed URL — and nothing about the customer", async () => {
    const fetcher = answering(ORDER);
    const outcome = await createRazorpayOrder(INPUT, CREDENTIALS, fetcher);
    expect(outcome).toEqual({
      outcome: "created",
      order: {
        id: "order_PLACEHOLDER001",
        amountPaise: BigInt(4200000),
        currency: "INR",
        receipt: INPUT.receipt,
        status: "created",
        createdAt: new Date(1_794_000_000_000),
      },
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(RAZORPAY_ORDERS_URL);
    expect(url).toBe("https://api.razorpay.com/v1/orders");
    expect(init?.method).toBe("POST");
    expect(init?.redirect).toBe("error");
    expect(JSON.parse(String(init?.body))).toEqual({
      amount: 4200000,
      currency: "INR",
      receipt: INPUT.receipt,
      notes: { order_number: "AS-1001" },
    });
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe(
      `Basic ${Buffer.from("rzp_test_PLACEHOLDER0001:placeholder-key-secret").toString("base64")}`,
    );
  });

  it("refuses an amount below Razorpay's minimum without a network call", async () => {
    const fetcher = answering(ORDER);
    expect(
      await createRazorpayOrder(
        { ...INPUT, amountPaise: BigInt(99) },
        CREDENTIALS,
        fetcher,
      ),
    ).toEqual({ outcome: "refused", reason: "bad_request" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    [
      400,
      {
        error: {
          code: "BAD_REQUEST_ERROR",
          description: "The amount must be atleast INR 1.00",
        },
      },
      "bad_request",
    ],
    [
      401,
      {
        error: {
          code: "BAD_REQUEST_ERROR",
          description: "Authentication failed",
        },
      },
      "unauthorised",
    ],
    [403, {}, "unauthorised"],
    [404, {}, "client_error"],
    [422, {}, "client_error"],
  ] as const)("sorts a %i into refused (%s)", async (status, body, reason) => {
    expect(
      await createRazorpayOrder(INPUT, CREDENTIALS, answering(body, status)),
    ).toEqual({ outcome: "refused", reason });
  });

  it.each([
    [
      "a duplicate receipt",
      { error: { description: "Receipt already exists" } },
    ],
    ["a duplicate request", { error: { description: "Duplicate request" } }],
    [
      "an operation in progress",
      { error: { description: "Another operation is in progress" } },
    ],
  ])(
    "treats a 400 that speaks of %s as unknown — an order may exist",
    async (_label, body) => {
      expect(
        await createRazorpayOrder(INPUT, CREDENTIALS, answering(body, 400)),
      ).toEqual({ outcome: "unknown", reason: "duplicate_or_in_progress" });
    },
  );

  it.each([
    [
      "a network error",
      vi.fn<typeof fetch>(async () => {
        throw new TypeError("fetch failed");
      }),
      "network",
    ],
    [
      "a timeout",
      vi.fn<typeof fetch>(async () => {
        throw new DOMException("timed out", "TimeoutError");
      }),
      "timeout",
    ],
    [
      "an abort",
      vi.fn<typeof fetch>(async () => {
        throw new DOMException("aborted", "AbortError");
      }),
      "timeout",
    ],
    ["a 500", answering({}, 500), "server_error"],
    [
      "a 502 with HTML",
      vi.fn<typeof fetch>(async () => new Response("<html>", { status: 502 })),
      "server_error",
    ],
    ["a 429", answering({}, 429), "rate_limited"],
    [
      "a 200 that is not JSON",
      vi.fn<typeof fetch>(async () => new Response("ok", { status: 200 })),
      "malformed",
    ],
    [
      "a 200 without an id",
      answering({ ...ORDER, id: undefined }),
      "malformed",
    ],
    [
      "a 200 with a foreign id shape",
      answering({ ...ORDER, id: "pay_PLACEHOLDER001" }),
      "malformed",
    ],
    [
      "a 200 of another entity",
      answering({ ...ORDER, entity: "payment" }),
      "malformed",
    ],
    [
      "a 200 with a fractional amount",
      answering({ ...ORDER, amount: 42.5 }),
      "malformed",
    ],
    [
      "a 200 with a string amount",
      answering({ ...ORDER, amount: "4200000" }),
      "malformed",
    ],
    [
      "a 200 without created_at",
      answering({ ...ORDER, created_at: undefined }),
      "malformed",
    ],
  ] as const)(
    "sorts %s into unknown (%s) — never a refusal, never a second call",
    async (_label, fetcher, reason) => {
      expect(await createRazorpayOrder(INPUT, CREDENTIALS, fetcher)).toEqual({
        outcome: "unknown",
        reason,
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it("returns nothing of an upstream body or the credentials in any outcome", async () => {
    const outcomes = await Promise.all([
      createRazorpayOrder(
        INPUT,
        CREDENTIALS,
        answering({ error: { description: "secret detail 123" } }, 400),
      ),
      createRazorpayOrder(
        INPUT,
        CREDENTIALS,
        answering({ error: { description: "secret detail 123" } }, 500),
      ),
      createRazorpayOrder(
        INPUT,
        CREDENTIALS,
        answering({ error: { description: "secret detail 123" } }, 401),
      ),
    ]);
    const text = JSON.stringify(outcomes);
    expect(text).not.toContain("secret detail");
    expect(text).not.toContain(CREDENTIALS.keySecret);
    expect(text).not.toContain(CREDENTIALS.keyId);
  });
});

describe("findRazorpayOrdersByReceipt", () => {
  it("reads the fixed URL by receipt, bounded, with the same credentials", async () => {
    const fetcher = answering({
      entity: "collection",
      count: 1,
      items: [ORDER],
    });
    const outcome = await findRazorpayOrdersByReceipt(
      INPUT.receipt,
      CREDENTIALS,
      fetcher,
    );
    expect(outcome.outcome).toBe("found");
    if (outcome.outcome === "found") {
      expect(outcome.orders).toHaveLength(1);
      expect(outcome.orders[0].id).toBe("order_PLACEHOLDER001");
    }
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(
      `https://api.razorpay.com/v1/orders?receipt=${INPUT.receipt}&count=10`,
    );
    expect(init?.method).toBe("GET");
  });

  it("answers an empty collection as found with no orders", async () => {
    expect(
      await findRazorpayOrdersByReceipt(
        INPUT.receipt,
        CREDENTIALS,
        answering({ entity: "collection", count: 0, items: [] }),
      ),
    ).toEqual({ outcome: "found", orders: [] });
  });

  it.each([
    [
      "a network error",
      vi.fn<typeof fetch>(async () => {
        throw new TypeError("fetch failed");
      }),
    ],
    ["a 500", answering({}, 500)],
    ["a 401", answering({}, 401)],
    ["a body that is not a collection", answering(ORDER)],
    [
      "one entry that does not parse",
      answering({ entity: "collection", items: [ORDER, { id: "x" }] }),
    ],
    [
      "a body that is not JSON",
      vi.fn<typeof fetch>(async () => new Response("<html>", { status: 200 })),
    ],
  ])("is unavailable on %s — never a partial list", async (_label, fetcher) => {
    expect(
      await findRazorpayOrdersByReceipt(INPUT.receipt, CREDENTIALS, fetcher),
    ).toEqual({ outcome: "unavailable" });
  });
});
