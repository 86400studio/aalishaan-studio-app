import type { CheckoutLaunch } from "@/lib/schemas/checkout";

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
 * the page as bare events. The payment id and the signature Razorpay passes to its `handler` are not received at all
 * (the handler takes no argument): S1.7 verifies payments on the server, and nothing in the browser may treat a
 * callback as proof.
 */

export const RAZORPAY_CHECKOUT_SRC =
  "https://checkout.razorpay.com/v1/checkout.js";

/** The name the payment window shows: the studio's. */
export const PAYMENT_WINDOW_NAME = "Aalishaan Studio";

export type PaymentWindowEvents = {
  /** Razorpay told the browser the payment completed — unverified (NS-05). */
  onReported: () => void;
  /** Razorpay told the browser a payment failed; its own window offers the retry. */
  onFailed: () => void;
  /** The window was closed. */
  onDismissed: () => void;
};

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
    handler: () => events.onReported(),
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
