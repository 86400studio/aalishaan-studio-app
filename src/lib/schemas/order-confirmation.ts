import { z } from "zod";

import { finishCodeSchema, variantCodeSchema } from "@/lib/schemas/catalogue";
import {
  nullablePaiseSchema,
  paiseSchema,
  positivePaiseSchema,
} from "@/lib/schemas/money";
import {
  fulfilmentStatusSchema,
  orderNumberSchema,
  paymentStatusSchema,
  quantitySchema,
} from "@/lib/schemas/orders";

/**
 * The order confirmation page's data — S1.7 (docs/sprint-prompts/S1.7-razorpay-verification.md §H.3 "Order page").
 * Pure and browser-safe: the shapes the database answers with (0005_payment_finalization `order_confirmation_view`),
 * the one rule that turns a stored order into the page's state, and the little the page itself is given.
 *
 * **The state is derived from persisted facts only** — never from a redirect, a browser callback or a query string:
 *
 * | The order as stored                                                              | The page            |
 * |----------------------------------------------------------------------------------|---------------------|
 * | `payment_status = captured`                                                      | `confirmed`         |
 * | under review (`needs_review`), whatever else                                     | `confirming/review` |
 * | pending, with a payment reported, authorised or captured                         | `confirming/payment`|
 * | pending, no such payment, no deadline                                            | `confirming/review` |
 * | pending, no such payment, before its deadline                                    | `failed/retry`      |
 * | pending, no such payment, at or after its deadline; or `failed` / `expired`      | `failed/closed`     |
 *
 * `confirmed` is the only state that says the order is confirmed, and only a verified captured payment makes it.
 * `confirming` never invites a payment: a payment is known and not yet confirmed, or the order is being checked.
 * `failed/retry` is the recoverable state: no live payment is known and the order's deadline (the database's own,
 * judged against the database's own clock) has not passed.
 */

export const PAYMENT_HOLDS = ["authorized_only", "capture_unverified"] as const;
export const paymentHoldSchema = z.enum(PAYMENT_HOLDS);
export type PaymentHold = z.infer<typeof paymentHoldSchema>;

const timestamp = z.string().transform((value, ctx) => {
  const time = Date.parse(value);
  if (Number.isNaN(time)) {
    ctx.addIssue({ code: "custom", message: "not a timestamp" });
    return z.NEVER;
  }
  return new Date(time);
});

const count = z.number().int().min(0).max(100000);

/** How many of an order's payments stand in each state (the payment's own rows; never the checkout row). */
export const paymentCountsSchema = z.strictObject({
  /** Reported by a signature-verified Checkout return and not yet moved by any event. */
  reported: count,
  authorized: count,
  captured: count,
  failed: count,
});
export type PaymentCounts = z.infer<typeof paymentCountsSchema>;

/** One item as the purchase snapshot holds it (0004_checkout: written once, never changed). */
export const snapshotItemSchema = z.strictObject({
  variant_code: variantCodeSchema,
  finish_code: finishCodeSchema,
  finish_name: z.string().min(1).max(60),
  artwork_slug: z.string().min(1).max(120),
  artwork_title: z.string().min(1).max(160),
  orientation: z.enum(["Portrait", "Landscape"]),
  quantity: quantitySchema,
  unit_price_paise: positivePaiseSchema,
  line_total_paise: positivePaiseSchema,
});

/** The answer of `order_confirmation_view` — for the server only: it carries the attempt's internal references. */
export const orderConfirmationRowSchema = z.strictObject({
  order_number: orderNumberSchema,
  confirmation_token_hash: z.string().regex(/^[0-9a-f]{64}$/),
  /** The SHA-256 of the checkout attempt key that placed the order; null on an order no checkout created. */
  checkout_attempt_hash: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable(),
  placed_at: timestamp,
  confirmed_at: timestamp.nullable(),
  payment_status: paymentStatusSchema,
  fulfilment_status: fulfilmentStatusSchema,
  needs_review: z.boolean(),
  payment_hold: paymentHoldSchema.nullable(),
  expires_at: timestamp.nullable(),
  synthetic: z.boolean(),
  currency: z.literal("INR"),
  subtotal_paise: paiseSchema,
  shipping_paise: nullablePaiseSchema,
  tax_paise: nullablePaiseSchema,
  total_paise: paiseSchema,
  items: z.array(snapshotItemSchema).min(1).max(66),
  payments: paymentCountsSchema,
  payment_attempt_id: z.uuid().nullable(),
  provider_order_state: z
    .enum(["intent", "requested", "linked", "failed", "unknown"])
    .nullable(),
  provider_order_id: z.string().min(1).max(120).nullable(),
  server_time: timestamp,
});
export type OrderConfirmationRow = z.infer<typeof orderConfirmationRowSchema>;

export const ORDER_PAGE_STATES = ["confirmed", "confirming", "failed"] as const;
export type OrderPageStateName = (typeof ORDER_PAGE_STATES)[number];

export type OrderPageState =
  | { readonly state: "confirmed" }
  /** `payment`: a payment is known and not yet confirmed. `review`: the order is being checked. */
  | { readonly state: "confirming"; readonly reason: "payment" | "review" }
  /** `retry`: recoverable — the order can still be paid for. `closed`: its time to pay has passed. */
  | { readonly state: "failed"; readonly reason: "retry" | "closed" };

/** The facts the state rule reads — a subset of the row, so it is testable without one. */
export type OrderStateFacts = {
  payment_status: z.infer<typeof paymentStatusSchema>;
  needs_review: boolean;
  /** Why the flag stands when the payment's own capture may clear it (0005); null beside every other review. */
  payment_hold: PaymentHold | null;
  expires_at: Date | null;
  server_time: Date;
  payments: PaymentCounts;
};

/** The page's state for an order as stored. Pure: the table above, row by row. */
export function orderPageState(order: OrderStateFacts): OrderPageState {
  if (order.payment_status === "captured") return { state: "confirmed" };
  // A hold is a payment known and not yet confirmed — its own signed capture clears it (0005). Any other flag is a
  // check a person makes.
  if (order.needs_review)
    return order.payment_hold !== null && order.payment_status === "pending"
      ? { state: "confirming", reason: "payment" }
      : { state: "confirming", reason: "review" };
  if (order.payment_status !== "pending")
    return { state: "failed", reason: "closed" };
  const { reported, authorized, captured } = order.payments;
  if (reported + authorized + captured > 0)
    return { state: "confirming", reason: "payment" };
  if (order.expires_at === null)
    return { state: "confirming", reason: "review" };
  return order.server_time.getTime() < order.expires_at.getTime()
    ? { state: "failed", reason: "retry" }
    : { state: "failed", reason: "closed" };
}

/** How far a state is along: a later answer never replaces an earlier one that ranks higher. */
const STATE_RANK: Readonly<Record<OrderPageStateName, number>> = {
  failed: 0,
  confirming: 1,
  confirmed: 2,
};

/**
 * The state a page keeps when a status answer arrives: `confirmed` is final — a late or out-of-order answer never
 * takes it back — and otherwise the answer stands (a payment may fail after it was reported, and a failed order
 * may later show a payment).
 */
export function mergeOrderPageState(
  shown: OrderPageState,
  answer: OrderPageState,
): OrderPageState {
  return STATE_RANK[shown.state] === STATE_RANK.confirmed ? shown : answer;
}

/** True when the page should keep asking: only `confirming` can still change by itself. */
export function isSettledOrderState(state: OrderPageState): boolean {
  return state.state !== "confirming";
}

/** One row of the order as the page shows it. Money as decimal strings of integer paise. */
export type OrderViewItem = {
  readonly variant_code: string;
  readonly artwork_slug: string;
  readonly artwork_title: string;
  readonly finish_code: string;
  readonly finish_name: string;
  readonly orientation: "Portrait" | "Landscape";
  readonly quantity: number;
  readonly unit_price_paise: string;
  readonly line_total_paise: string;
};

/** Everything the order page is given — no contact, no address, no token, no internal id. */
export type OrderView = {
  readonly order_number: string;
  readonly status: OrderPageState;
  /**
   * The SHA-256 of the checkout attempt key that placed the order, or null. Only the browser tab that holds that
   * key can match it: that is how the page knows the bag it sees is the one this order was bought from.
   */
  readonly attempt_hash: string | null;
  /** ISO timestamp of the order. */
  readonly placed_at: string;
  /** True for an order made under a synthetic rule (the Preview's test checkout). */
  readonly synthetic: boolean;
  readonly items: readonly OrderViewItem[];
  readonly subtotal_paise: string;
  /** Null while the owner has not supplied the charge (never zero as a guess). */
  readonly shipping_paise: string | null;
  readonly tax_paise: string | null;
  readonly total_paise: string;
};

/** What the status question answers: the state and nothing else. */
export type OrderStatusAnswer =
  | { readonly status: "ok"; readonly state: OrderPageState }
  | { readonly status: "not_found" | "unavailable" };

/** The customer's projection of a row. */
export function orderViewOf(row: OrderConfirmationRow): OrderView {
  const paise = (value: bigint) => value.toString(10);
  return {
    order_number: row.order_number,
    status: orderPageState(row),
    attempt_hash: row.checkout_attempt_hash,
    placed_at: row.placed_at.toISOString(),
    synthetic: row.synthetic,
    items: row.items.map((item) => ({
      variant_code: item.variant_code,
      artwork_slug: item.artwork_slug,
      artwork_title: item.artwork_title,
      finish_code: item.finish_code,
      finish_name: item.finish_name,
      orientation: item.orientation,
      quantity: item.quantity,
      unit_price_paise: paise(item.unit_price_paise),
      line_total_paise: paise(item.line_total_paise),
    })),
    subtotal_paise: paise(row.subtotal_paise),
    shipping_paise:
      row.shipping_paise === null ? null : paise(row.shipping_paise),
    tax_paise: row.tax_paise === null ? null : paise(row.tax_paise),
    total_paise: paise(row.total_paise),
  };
}
