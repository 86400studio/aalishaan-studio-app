import { z } from "zod";

import { attemptKeySchema } from "@/lib/schemas/checkout";

/**
 * The payment wire contracts — S1.7 (docs/sprint-prompts/S1.7-razorpay-verification.md §H.3). Pure and
 * browser-safe: shapes only — no secret, no signature check and no I/O lives here.
 *
 * - **The verified return** is what the checkout page sends after Razorpay's window reports a payment: the attempt
 *   key (the only handle on the order — D-62), the payment id and the signature Checkout handed to the page. A strict
 *   object: an order id, an order number, an amount or a status from the browser is refused, never ignored — the
 *   server verifies the signature against the provider order id IT stored for that attempt.
 * - **The webhook envelope** is the least a verified Razorpay delivery must be to enter the ledger: an event object
 *   with a type and a payload. The ledger keeps the delivery's verified bytes exactly (0006 `raw_body`) and their
 *   parse as the processing copy; what its payment says is read from the ledger row by the database
 *   (`payment_process_event`), not here.
 */

/** A Razorpay payment id as Checkout and the webhooks give it. */
export const RAZORPAY_PAYMENT_ID_PATTERN = /^pay_[A-Za-z0-9]{6,60}$/;
/** Lower-case hex of an HMAC-SHA-256: Checkout's return signature and the webhook's `X-Razorpay-Signature`. */
export const HMAC_SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;
/** A provider event type as the ledger stores it (`payment.captured`, `order.paid`, …). */
export const PROVIDER_EVENT_TYPE_PATTERN = /^[a-z][a-z0-9_.]{1,118}$/;
/** An event id as the `x-razorpay-event-id` header carries it; anything else is replaced by a digest of the body. */
export const PROVIDER_EVENT_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,120}$/;

export const checkoutReturnSchema = z.strictObject({
  attempt_key: attemptKeySchema,
  razorpay_payment_id: z.string().regex(RAZORPAY_PAYMENT_ID_PATTERN),
  razorpay_signature: z.string().regex(HMAC_SHA256_HEX_PATTERN),
});
export type CheckoutReturn = z.infer<typeof checkoutReturnSchema>;

/** The envelope of a Razorpay webhook delivery. Other keys (account, contents, time) are kept, not required. */
export const webhookEnvelopeSchema = z.looseObject({
  entity: z.literal("event"),
  event: z.string().regex(PROVIDER_EVENT_TYPE_PATTERN),
  payload: z.record(z.string(), z.unknown()),
});

/**
 * The path of an order's confirmation page for a token — the one internal route a verified return may send the
 * browser to. The token is 32 bytes as unpadded base64url (43 characters, src/lib/server/checkout/tokens.ts).
 */
export const CONFIRMATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const ORDER_PATH_PATTERN = /^\/order\/[A-Za-z0-9_-]{43}$/;

export function orderPathOf(token: string): string {
  if (!CONFIRMATION_TOKEN_PATTERN.test(token))
    throw new RangeError("not a confirmation token");
  return `/order/${token}`;
}

/** True for exactly `/order/<token>` — what the checkout page checks before it navigates. */
export function isOrderPath(value: unknown): value is string {
  return typeof value === "string" && ORDER_PATH_PATTERN.test(value);
}
