import "server-only";

import type {
  OrderPaymentsOutcome,
  RazorpayCredentials,
  RazorpayPayment,
} from "../razorpay";
import type { PaymentStore } from "./store";

/**
 * What the provider holds for an order, asked before another payment may be started and while an order page waits —
 * S1.7 (docs/sprint-prompts/S1.7-razorpay-verification.md §H.3 "Uncertainty"; D-68).
 *
 * The answer of `GET /v1/orders/<stored order id>/payments` is sorted into one standing, strongest first:
 *
 *   - `captured`   — a captured payment exists. The order is NOT confirmed by this: only the signed captured event
 *                    confirms (D-68). The order is flagged with the `capture_unverified` hold, which that event clears.
 *   - `authorized` — a payment is authorised and not captured. Flagged with the `authorized_only` hold.
 *   - `in_flight`  — a payment is neither finished nor failed (`created`: Razorpay has the customer's details and
 *                    no answer yet — its documentation marks such a payment failed after ten minutes without one),
 *                    or carries a status this code does not know (`refunded` included: nothing here is the
 *                    place to judge a refund). Nothing is flagged; nothing may be started.
 *   - `clear`      — the provider lists no payment, or every listed payment has failed. Only then may the SAME
 *                    provider order be continued: Razorpay permits no further payment once an order is paid, and no
 *                    payment is pending that could still settle.
 *   - `unavailable`— the provider could not be asked, or its answer could not be trusted in full. Not known is
 *                    never "no payment": nothing may be started.
 *
 * `clear` is the only standing that lets a payment window open again. No standing confirms, fails or expires an
 * order, and none is kept in memory: every question is asked again.
 */

export type ProviderStanding =
  | { readonly standing: "captured"; readonly paymentId: string }
  | { readonly standing: "authorized"; readonly paymentId: string }
  | { readonly standing: "in_flight" }
  | { readonly standing: "clear" }
  | { readonly standing: "unavailable" };

/** Pure: the standing of a listing. */
export function standingOf(outcome: OrderPaymentsOutcome): ProviderStanding {
  if (outcome.outcome !== "found") return { standing: "unavailable" };
  const of = (status: string): RazorpayPayment | undefined =>
    outcome.payments.find((payment) => payment.status === status);
  const captured = of("captured");
  if (captured) return { standing: "captured", paymentId: captured.id };
  const authorized = of("authorized");
  if (authorized) return { standing: "authorized", paymentId: authorized.id };
  return outcome.payments.every((payment) => payment.status === "failed")
    ? { standing: "clear" }
    : { standing: "in_flight" };
}

export type ProviderCheckDependencies = {
  fetchPayments: (
    providerOrderId: string,
    credentials: RazorpayCredentials,
  ) => Promise<OrderPaymentsOutcome>;
  store: PaymentStore;
  /** Where a sanitised reason code goes. */
  report: (message: string) => void;
};

/**
 * Asks the provider about one order and — for a captured or an authorised payment — records the hold. The hold is
 * the durable result of the question (D-68): the order is flagged for the studio, and the signed captured event
 * clears it. A hold that could not be written changes the standing to `unavailable`: a payment that is known and
 * not recorded is never treated as settled.
 */
export async function checkProviderPayments(
  order: { paymentAttemptId: string; providerOrderId: string },
  credentials: RazorpayCredentials,
  deps: ProviderCheckDependencies,
): Promise<ProviderStanding> {
  const standing = standingOf(
    await deps.fetchPayments(order.providerOrderId, credentials),
  );
  if (standing.standing !== "captured" && standing.standing !== "authorized")
    return standing;
  const recorded = await deps.store.recordProviderCheck(
    order.paymentAttemptId,
    standing.paymentId,
    standing.standing,
  );
  if (!recorded.ok) {
    deps.report(`[payments] provider check not recorded (${recorded.refusal})`);
    return { standing: "unavailable" };
  }
  return standing;
}
