import "server-only";

import type {
  OrderPaymentsOutcome,
  RazorpayCredentials,
  RazorpayPayment,
} from "../razorpay";
import type { ObservedPayment, PaymentStore } from "./store";

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
 *   - `unavailable`— the provider could not be asked, or its answer could not be trusted in full (a payment listed
 *                    twice with different facts included). Not known is never "no payment": nothing may be started.
 *
 * **Every live payment counts** (the review of 2026-11-26, findings 3 and 4). A captured or authorised standing hands
 * the database EVERY distinct captured or authorised payment of the listing, each with the amount and currency the
 * provider observed — never one id picked from the list. The database judges them against the stored intent under
 * the order's lock (0006 `payment_record_provider_check`): exactly one, for the stored amount in INR, is the hold;
 * more than one, or other money, is a review no capture clears. This module compares nothing itself.
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

/** A payment the provider lists as captured or authorised: money that moved, or is held for its capture. */
export type LivePayment = RazorpayPayment & ObservedPayment;

function isLive(payment: RazorpayPayment): payment is LivePayment {
  return payment.status === "captured" || payment.status === "authorized";
}

function sameFacts(a: RazorpayPayment, b: RazorpayPayment): boolean {
  return (
    a.status === b.status &&
    a.amountPaise === b.amountPaise &&
    a.currency === b.currency
  );
}

/**
 * Pure: every distinct live payment of a listing, strongest first (the captured ones, then the authorised ones, each
 * in the listing's order) — or null when the listing contradicts itself about one: a live payment's id listed again
 * with another status, amount or currency. The same payment listed twice with the same facts is one payment.
 */
export function livePaymentsOf(
  payments: readonly RazorpayPayment[],
): LivePayment[] | null {
  const byId = new Map<string, RazorpayPayment>();
  for (const payment of payments) {
    const seen = byId.get(payment.id);
    if (seen === undefined) byId.set(payment.id, payment);
    else if ((isLive(seen) || isLive(payment)) && !sameFacts(seen, payment))
      return null;
  }
  const live = [...byId.values()].filter(isLive);
  return [
    ...live.filter((payment) => payment.status === "captured"),
    ...live.filter((payment) => payment.status === "authorized"),
  ];
}

/** A listing's standing and the live payments behind it (none unless the standing is captured or authorised). */
function assess(outcome: OrderPaymentsOutcome): {
  standing: ProviderStanding;
  live: readonly LivePayment[];
} {
  if (outcome.outcome !== "found")
    return { standing: { standing: "unavailable" }, live: [] };
  const live = livePaymentsOf(outcome.payments);
  if (live === null) return { standing: { standing: "unavailable" }, live: [] };
  const [strongest] = live;
  if (strongest !== undefined)
    return {
      standing:
        strongest.status === "captured"
          ? { standing: "captured", paymentId: strongest.id }
          : { standing: "authorized", paymentId: strongest.id },
      live,
    };
  return {
    standing: outcome.payments.every((payment) => payment.status === "failed")
      ? { standing: "clear" }
      : { standing: "in_flight" },
    live,
  };
}

/** Pure: the standing of a listing. `paymentId` is the strongest live payment's: the first captured, else authorised. */
export function standingOf(outcome: OrderPaymentsOutcome): ProviderStanding {
  return assess(outcome).standing;
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
 * Asks the provider about one order and — for a captured or an authorised standing — records what it showed: every
 * live payment with its observed money, in one call, under the order's lock. That record is the durable result of
 * the question (D-68): the order is flagged for the studio — a hold the signed captured event clears, or a review a
 * person resolves. A record that could not be written changes the standing to `unavailable`: a payment that is known
 * and not recorded is never treated as settled.
 */
export async function checkProviderPayments(
  order: { paymentAttemptId: string; providerOrderId: string },
  credentials: RazorpayCredentials,
  deps: ProviderCheckDependencies,
): Promise<ProviderStanding> {
  const { standing, live } = assess(
    await deps.fetchPayments(order.providerOrderId, credentials),
  );
  if (live.length === 0) return standing;
  const recorded = await deps.store.recordProviderCheck(
    order.paymentAttemptId,
    live.map(({ id, status, amountPaise, currency }) => ({
      id,
      status,
      amountPaise,
      currency,
    })),
  );
  if (!recorded.ok) {
    deps.report(`[payments] provider check not recorded (${recorded.refusal})`);
    return { standing: "unavailable" };
  }
  return standing;
}
