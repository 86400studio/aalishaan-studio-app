import type { CheckoutLaunch } from "@/lib/schemas/checkout";
import {
  HMAC_SHA256_HEX_PATTERN,
  RAZORPAY_PAYMENT_ID_PATTERN,
} from "@/lib/schemas/payments";

import type { CheckoutPrefill } from "./attempt-key";
import { loadScriptOnce } from "./load-script";
import type { RazorpayCheckoutOptions } from "./provider-globals";

/**
 * Razorpay Checkout.js for the checkout page — S1.6 (docs/sprint-prompts/S1.6-checkout-pending-order.md §H.3
 * "Provider step"). The script is loaded once, by an open checkout page only, and the payment window is opened only
 * with a `launch` the server answered: its public key id, its provider order id, its stored amount and currency and
 * the order number — never an amount, a key or an order id the browser made up.
 *
 * The three callbacks the window can make — a reported payment, a failed payment, the window closed — are told to
 * the page as events. Nothing in the browser may treat a callback as proof.
 *
 * **S1.7 — the report.** When Razorpay reports a completed payment it hands the page a payment id and a signature.
 * The page passes exactly those two on (`PaymentReport`) so the SERVER can verify them against the provider order
 * id it stored (docs/sprint-prompts/S1.7-razorpay-verification.md §H.3 "Verification"). The order id Razorpay
 * hands back with them is dropped here: the server uses its own, never the browser's. A report that does not have
 * the expected shape is passed on as `null` — the payment was reported, and nothing can be verified from it.
 */

export const RAZORPAY_CHECKOUT_SRC =
  "https://checkout.razorpay.com/v1/checkout.js";

/** The name the payment window shows: the studio's. */
export const PAYMENT_WINDOW_NAME = "Aalishaan Studio";

/** What Razorpay's window handed the page for a payment it reported complete — for the server to verify. */
export type PaymentReport = {
  readonly paymentId: string;
  readonly signature: string;
};

export type PaymentWindowEvents = {
  /**
   * Razorpay told the browser the payment completed — unverified (NS-05) until the server has checked the report.
   * `report` is null when the answer did not carry a payment id and a signature of the expected shape.
   */
  onReported: (report: PaymentReport | null) => void;
  /** Razorpay told the browser a payment failed; its own window offers the retry. */
  onFailed: () => void;
  /** The window was closed. */
  onDismissed: () => void;
};

/** The payment id and signature of Razorpay's answer, or null. The order id it carries is never read. */
export function paymentReportOf(response: unknown): PaymentReport | null {
  if (typeof response !== "object" || response === null) return null;
  const { razorpay_payment_id: paymentId, razorpay_signature: signature } =
    response as { razorpay_payment_id?: unknown; razorpay_signature?: unknown };
  return typeof paymentId === "string" &&
    RAZORPAY_PAYMENT_ID_PATTERN.test(paymentId) &&
    typeof signature === "string" &&
    HMAC_SHA256_HEX_PATTERN.test(signature)
    ? { paymentId, signature }
    : null;
}

/** Resolves once Checkout.js has loaded and defined its constructor; rejects when it could not. */
export async function loadRazorpayCheckout(): Promise<void> {
  await loadScriptOnce(RAZORPAY_CHECKOUT_SRC);
  if (typeof window.Razorpay !== "function")
    throw new Error("Checkout.js did not define its constructor");
}

/** The options the window is opened with: the server's launch, the typed prefill (or none) and the callbacks. */
export function paymentWindowOptions(
  launch: CheckoutLaunch,
  prefill: CheckoutPrefill | null,
  events: PaymentWindowEvents,
): RazorpayCheckoutOptions {
  return {
    key: launch.key_id,
    order_id: launch.provider_order_id,
    amount: Number(launch.amount_paise),
    currency: launch.currency,
    name: PAYMENT_WINDOW_NAME,
    description: launch.order_number,
    ...(prefill === null
      ? {}
      : {
          prefill: {
            name: prefill.name,
            email: prefill.email,
            contact: prefill.contact,
            method: prefill.method,
          },
        }),
    handler: (response) => events.onReported(paymentReportOf(response)),
    modal: { ondismiss: () => events.onDismissed() },
  };
}

/** Opens the payment window for the launch. False when Checkout.js is not on the page or refuses to open. */
export function openPaymentWindow(
  launch: CheckoutLaunch,
  prefill: CheckoutPrefill | null,
  events: PaymentWindowEvents,
): boolean {
  const Razorpay = typeof window === "undefined" ? undefined : window.Razorpay;
  if (typeof Razorpay !== "function") return false;
  try {
    const checkout = new Razorpay(
      paymentWindowOptions(launch, prefill, events),
    );
    checkout.on("payment.failed", () => events.onFailed());
    checkout.open();
    return true;
  } catch {
    return false;
  }
}
