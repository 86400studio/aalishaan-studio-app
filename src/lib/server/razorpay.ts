import "server-only";

import { z } from "zod";

import { parsePaise } from "@/lib/money";

/**
 * Razorpay Orders — S1.6 (docs/TECH-ARCHITECTURE.md §5; docs/sprint-prompts/S1.6-checkout-pending-order.md §H.3
 * "Provider step"). Two calls to fixed official endpoints with `fetch` and HTTP Basic credentials — no SDK, no URL
 * from any input:
 *
 *   - `createRazorpayOrder` — `POST /v1/orders` with the stored amount (integer paise), `INR`, the receipt
 *     (`pa_<payment attempt id>`) and one note, the order number. No customer detail is sent.
 *   - `findRazorpayOrdersByReceipt` — `GET /v1/orders?receipt=…`, the bounded recovery read.
 *
 * The create call has no idempotency key and the receipt is not one (a repeated receipt is refused, not replayed),
 * so the caller makes it exactly once per attempt and this module sorts every answer into three kinds:
 *   - `created` — a 2xx whose body parses as an order;
 *   - `refused` — a definite refusal (400, 401/403, another 4xx): no order exists;
 *   - `unknown` — everything that does not prove either: a timeout, a network error, a 5xx, a 429, a 2xx that does
 *     not parse, or a 400 that speaks of a duplicate or an operation in progress. The caller holds such an attempt
 *     and never calls create for it again.
 * Whether a `created` order matches the stored intent (amount, currency, receipt) is the caller's check.
 *
 * Nothing of an upstream body, status text or header is logged or returned beyond the enumerated reason, and the
 * credentials never appear in an error. The key secret reaches this module as an argument (read by the sales gate,
 * src/lib/server/checkout/gate.ts).
 */

export const RAZORPAY_ORDERS_URL = "https://api.razorpay.com/v1/orders";
export const RAZORPAY_TIMEOUT_MS = 10000;
/** The smallest amount Razorpay accepts for INR: ₹1.00. */
export const RAZORPAY_MIN_AMOUNT_PAISE = BigInt(100);

export type RazorpayCredentials = { keyId: string; keySecret: string };

export type RazorpayOrder = {
  id: string;
  amountPaise: bigint;
  currency: string;
  receipt: string | null;
  status: string;
  /** Razorpay's own creation time (its `created_at`, epoch seconds) — the D-20 basis of the deadline. */
  createdAt: Date;
};

export type CreateOrderOutcome =
  | { outcome: "created"; order: RazorpayOrder }
  | {
      outcome: "refused";
      reason: "bad_request" | "unauthorised" | "client_error";
    }
  | {
      outcome: "unknown";
      reason:
        | "timeout"
        | "network"
        | "server_error"
        | "rate_limited"
        | "malformed"
        | "duplicate_or_in_progress";
    };

export type FindOrdersOutcome =
  { outcome: "found"; orders: RazorpayOrder[] } | { outcome: "unavailable" };

export const RAZORPAY_ORDER_ID_PATTERN = /^order_[A-Za-z0-9]{6,60}$/;

const orderSchema = z
  .object({
    id: z.string().regex(RAZORPAY_ORDER_ID_PATTERN),
    entity: z.literal("order"),
    amount: z.number().int().positive(),
    currency: z.string().min(3).max(3),
    receipt: z.string().max(40).nullable().optional(),
    status: z.string().min(1).max(40),
    created_at: z.number().int().positive(),
  })
  .transform((order, ctx): RazorpayOrder => {
    const amount = parsePaise(order.amount);
    if (!amount.ok) {
      ctx.addIssue({ code: "custom", message: "not exact paise" });
      return z.NEVER;
    }
    return {
      id: order.id,
      amountPaise: amount.paise,
      currency: order.currency,
      receipt: order.receipt ?? null,
      status: order.status,
      createdAt: new Date(order.created_at * 1000),
    };
  });

const collectionSchema = z.object({
  entity: z.literal("collection"),
  items: z.array(z.unknown()).max(100),
});

function authorization({ keyId, keySecret }: RazorpayCredentials): string {
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`, "utf8").toString("base64")}`;
}

function isTimeout(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

/** True when a 400's own description speaks of a duplicate or an operation in progress — not a clean refusal. */
function speaksOfDuplicate(body: unknown): boolean {
  if (typeof body !== "object" || body === null) return false;
  const error = (body as { error?: unknown }).error;
  if (typeof error !== "object" || error === null) return false;
  const description = (error as { description?: unknown }).description;
  return (
    typeof description === "string" &&
    /duplicate|already|in progress|in-progress/i.test(description)
  );
}

export type CreateOrderInput = {
  amountPaise: bigint;
  receipt: string;
  orderNumber: string;
};

export async function createRazorpayOrder(
  input: CreateOrderInput,
  credentials: RazorpayCredentials,
  fetcher: typeof fetch = globalThis.fetch,
): Promise<CreateOrderOutcome> {
  if (
    input.amountPaise < RAZORPAY_MIN_AMOUNT_PAISE ||
    input.amountPaise > BigInt(Number.MAX_SAFE_INTEGER)
  )
    return { outcome: "refused", reason: "bad_request" };
  let response: Response;
  try {
    response = await fetcher(RAZORPAY_ORDERS_URL, {
      method: "POST",
      headers: {
        Authorization: authorization(credentials),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: Number(input.amountPaise),
        currency: "INR",
        receipt: input.receipt,
        notes: { order_number: input.orderNumber },
      }),
      signal: AbortSignal.timeout(RAZORPAY_TIMEOUT_MS),
      cache: "no-store",
      redirect: "error",
    });
  } catch (error) {
    return {
      outcome: "unknown",
      reason: isTimeout(error) ? "timeout" : "network",
    };
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (response.status >= 200 && response.status < 300) {
    const parsed = orderSchema.safeParse(body);
    return parsed.success
      ? { outcome: "created", order: parsed.data }
      : { outcome: "unknown", reason: "malformed" };
  }
  if (response.status >= 500)
    return { outcome: "unknown", reason: "server_error" };
  if (response.status === 429)
    return { outcome: "unknown", reason: "rate_limited" };
  if (response.status === 401 || response.status === 403)
    return { outcome: "refused", reason: "unauthorised" };
  if (response.status === 400)
    return speaksOfDuplicate(body)
      ? { outcome: "unknown", reason: "duplicate_or_in_progress" }
      : { outcome: "refused", reason: "bad_request" };
  if (response.status >= 400)
    return { outcome: "refused", reason: "client_error" };
  // A 1xx or 3xx is no answer at all.
  return { outcome: "unknown", reason: "malformed" };
}

/** The orders Razorpay holds under one receipt. Any failure — or one entry that does not parse — is `unavailable`. */
export async function findRazorpayOrdersByReceipt(
  receipt: string,
  credentials: RazorpayCredentials,
  fetcher: typeof fetch = globalThis.fetch,
): Promise<FindOrdersOutcome> {
  const url = new URL(RAZORPAY_ORDERS_URL);
  url.searchParams.set("receipt", receipt);
  url.searchParams.set("count", "10");
  let response: Response;
  try {
    response = await fetcher(url.toString(), {
      method: "GET",
      headers: { Authorization: authorization(credentials) },
      signal: AbortSignal.timeout(RAZORPAY_TIMEOUT_MS),
      cache: "no-store",
      redirect: "error",
    });
  } catch {
    return { outcome: "unavailable" };
  }
  if (response.status !== 200) return { outcome: "unavailable" };
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { outcome: "unavailable" };
  }
  const collection = collectionSchema.safeParse(body);
  if (!collection.success) return { outcome: "unavailable" };
  const orders: RazorpayOrder[] = [];
  for (const item of collection.data.items) {
    const parsed = orderSchema.safeParse(item);
    if (!parsed.success) return { outcome: "unavailable" };
    orders.push(parsed.data);
  }
  return { outcome: "found", orders };
}
