import "server-only";

import { paiseToJson, parsePaise } from "@/lib/money";
import {
  canonicalCheckoutPayload,
  checkoutResumeSchema,
  checkoutSubmissionSchema,
  normaliseCheckoutFields,
  type CheckoutActionResult,
  type CheckoutReturnResult,
} from "@/lib/schemas/checkout";
import { checkoutReturnSchema, orderPathOf } from "@/lib/schemas/payments";

import {
  consumeCheckoutAttempt,
  type CheckoutThrottleKind,
} from "../checkout-throttle";
import type { ThrottleOutcome } from "../login-throttle";
import { privilegedPaymentStore } from "../payments/client";
import { paymentsGate, type PaymentsGate } from "../payments/config";
import { checkProviderPayments, standingOf } from "../payments/reconcile";
import { verifyCheckoutSignature } from "../payments/signature";
import type { PaymentStore, ReturnState } from "../payments/store";
import {
  createRazorpayOrder,
  fetchRazorpayOrderPayments,
  findRazorpayOrdersByReceipt,
  type CreateOrderInput,
  type CreateOrderOutcome,
  type FindOrdersOutcome,
  type OrderPaymentsOutcome,
  type RazorpayCredentials,
  type RazorpayOrder,
} from "../razorpay";
import { createPrivilegedClient } from "../supabase";
import {
  verifyTurnstile,
  type TurnstileOutcome,
  type TurnstileRequest,
} from "../turnstile";
import { salesGate, type CheckoutConfig, type SalesGate } from "./gate";
import {
  createCheckoutStore,
  type AttemptState,
  type CheckoutStore,
  type StoreRefusal,
} from "./store";
import {
  attemptHash,
  confirmationTokenHash,
  deriveConfirmationToken,
  issueConfirmationToken,
  payloadMac,
  providerReceipt,
  type IssuedConfirmation,
} from "./tokens";

/**
 * The checkout flow — S1.6 (docs/sprint-prompts/S1.6-checkout-pending-order.md §H.3). The two server actions
 * (src/app/(public)/checkout/actions.ts) end here, and every gate is enforced here whatever the page showed.
 *
 * A submission, in order — each step stops the flow, and nothing after a refusal runs:
 *   1. the sales gate (configuration only, no network) — closed: zero writes, zero provider or control calls;
 *   2. the strict parse and the one normalisation (src/lib/schemas/checkout.ts);
 *   3. the rate limit (its own namespace; fails closed);
 *   4. Turnstile, verified on the server (fails closed);
 *   5. the atomic write — `checkout_create_pending_order`: one transaction, or the same attempt again;
 *   6. the provider step, only after that transaction has committed.
 * A resume carries the attempt key alone: the gate, its own rate limit, one read by the key's hash, then the same
 * provider step. It needs no Turnstile and writes no business row.
 *
 * The provider step (`advance`) — Postgres cannot roll back a Razorpay call, so the state is durable first:
 *   - `intent` → the single claim (compare-and-set in the database). Only the request that wins it calls
 *     `POST /v1/orders`, once. A matching answer is linked (provider id, provider creation time and the expiry in
 *     one transaction); a definite refusal is closed `failed`; anything else is closed `unknown`.
 *   - `requested` → another request holds the claim. Young: `in_progress` (the page asks again). Stale (the
 *     process died): closed `unknown`, then the recovery read.
 *   - `unknown` → never created again. One bounded read by receipt; exactly one exact match is linked, anything
 *     else stays held.
 *   - `linked` → launch data, only while the order is pending, not under review and not past its deadline (and, on a
 *     launch after the first, while its fulfilment still awaits the payment — S1.7). The deadline is never extended:
 *     a resume returns the same order with the same `expires_at`.
 *   - `failed` → `start_failed`: the customer starts again as a new order under a new attempt key.
 * No step here marks anything paid, failed-as-payment or confirmed: only a verified captured event does (the
 * webhook — src/lib/server/payments/webhook.ts).
 *
 * **S1.7 — before a payment window opens AGAIN** (docs/sprint-prompts/S1.7-razorpay-verification.md §H.3
 * "Uncertainty"). The launch that directly follows the link of a brand-new provider order needs no question: no
 * payment can exist for it. Every other launch of a linked order — a reload, a second press, a return to the page —
 * first asks Razorpay what it holds for that order (`relaunch`):
 *   - nothing, or only failed payments → the launch (the same provider order is continued) — while the order still
 *     awaits its payment (pending, its fulfilment `pending_payment`, under no review);
 *   - a captured or an authorised payment → no launch. Every live payment listed is recorded with its money: the
 *     order is flagged with a hold the signed captured event clears (D-68) — or, for more than one live payment or
 *     money that is not the stored intent, a review a person resolves (0006) — and the answer is `confirming`;
 *   - a payment still in flight, or no usable answer → no launch: `uncertain`. Not known is never "not paid".
 * An order that is not payable from here says what it is: `confirmed` (a verified captured payment), `confirming`
 * (a hold stands, a review beside a payment on record, or a review with none on record while Razorpay — asked again,
 * read-only — lists a live payment for it), `uncertain` when that question has no usable answer, otherwise `held`.
 *
 * **S1.7 — the verified return** (`verifyCheckoutReturn`). Razorpay's window hands the page a payment id and a
 * signature. The server verifies that signature against the provider order id IT stored for the attempt the caller
 * proves with the attempt key — never an order id from the browser — and records the payment as *reported*. That
 * changes nothing about the order: it answers the order's page, which shows what the database holds. It stands on
 * the payment gate (src/lib/server/payments/config.ts), not on the sales gate: a payment already made is verified
 * whether or not new orders are being taken.
 *
 * The confirmation token is issued with the order (salt and hash, D-61). It leaves the server only as the path of
 * the order's page, and only once a verified signature stands on record for the order: the verified return, or a
 * signed event that recorded a payment. It is derived again each time — never stored, never logged.
 * Logs receive enumerated codes only — never a field, a key, a token, an id or an upstream body.
 */

/** A `requested` claim older than this is a dead request: closed as unknown, never called again. */
export const STALE_REQUEST_MS = 60 * 1000;
/** How long the server honours an attempt key, from the order's `placed_at`. */
export const ATTEMPT_HONOURED_MS = 24 * 60 * 60 * 1000;

export type FlowContext = {
  /** The client address Vercel vouches for; empty when absent. */
  address: string;
};

export type FlowDependencies = {
  gate: () => SalesGate;
  throttle: (
    kind: CheckoutThrottleKind,
    address: string,
  ) => Promise<ThrottleOutcome>;
  verifyChallenge: (request: TurnstileRequest) => Promise<TurnstileOutcome>;
  /** The database adapter over the privileged client, or null when that client cannot be made. */
  store: () => CheckoutStore | null;
  createOrder: (
    input: CreateOrderInput,
    credentials: RazorpayCredentials,
  ) => Promise<CreateOrderOutcome>;
  findOrders: (
    receipt: string,
    credentials: RazorpayCredentials,
  ) => Promise<FindOrdersOutcome>;
  issueToken: (secret: string) => IssuedConfirmation;
  /** S1.7: the deployment's provider half — the verified return stands on it, never on the sales gate. */
  paymentsGate: () => PaymentsGate;
  /** S1.7: the payments' database adapter, or null when the privileged client cannot be made. */
  payments: () => PaymentStore | null;
  /** S1.7: what the provider holds for one of our orders — asked before a payment window may open again. */
  fetchPayments: (
    providerOrderId: string,
    credentials: RazorpayCredentials,
  ) => Promise<OrderPaymentsOutcome>;
  /** S1.7: the order's confirmation token from its stored salt (D-61). */
  deriveToken: (secret: string, saltHex: string) => string;
  /** Where a sanitised reason code goes. */
  report: (message: string) => void;
};

export function defaultFlowDependencies(): FlowDependencies {
  return {
    gate: () => salesGate(),
    throttle: (kind, address) => consumeCheckoutAttempt(kind, address),
    verifyChallenge: (request) => verifyTurnstile(request),
    store() {
      const privileged = createPrivilegedClient();
      if (!privileged.ok) return null;
      const { client } = privileged;
      return createCheckoutStore(async (name, args) => {
        const { data, error } = await client.rpc(name, args);
        return { data, error: error ? { code: error.code } : null };
      });
    },
    createOrder: (input, credentials) =>
      createRazorpayOrder(input, credentials),
    findOrders: (receipt, credentials) =>
      findRazorpayOrdersByReceipt(receipt, credentials),
    issueToken: (secret) => issueConfirmationToken(secret),
    paymentsGate: () => paymentsGate(),
    payments: () => privilegedPaymentStore(),
    fetchPayments: (providerOrderId, credentials) =>
      fetchRazorpayOrderPayments(providerOrderId, credentials),
    deriveToken: (secret, saltHex) => deriveConfirmationToken(secret, saltHex),
    report: (message) => console.error(message),
  };
}

type Step = {
  config: CheckoutConfig;
  store: CheckoutStore;
  deps: FlowDependencies;
  /** The SHA-256 of the attempt key the caller presented: the only handle on the order. */
  attemptHash: string;
};

const UNAVAILABLE: CheckoutActionResult = { status: "unavailable" };

/**
 * The path of the order's page — or null. Given only once a verified signature stands on record for the order (it
 * is confirmed, or one of its payments was reported by a verified return or recorded by a signed event), and only
 * when the token derived now is the one the order was issued with (the stored hash): a deployment whose order-link
 * secret is not the issuing one gives no link rather than a dead one.
 */
function orderPathFor(
  order: ReturnState,
  orderTokenSecret: string,
  deps: Pick<FlowDependencies, "deriveToken">,
): string | null {
  const { reported, authorized, captured } = order.payments;
  const verified =
    order.paymentStatus === "captured" || reported + authorized + captured > 0;
  if (!verified || order.tokenSalt === null || order.tokenHash === null)
    return null;
  try {
    const token = deps.deriveToken(orderTokenSecret, order.tokenSalt);
    return confirmationTokenHash(token) === order.tokenHash
      ? orderPathOf(token)
      : null;
  } catch {
    return null;
  }
}

/**
 * What an order that is not payable from here is — or null when it is neither confirmed nor a payment being checked.
 * Under review, an order is `confirming` while a hold stands (a payment its signed capture clears) and whenever a
 * payment stands on record for it — reported by a verified return, authorised or captured by a signed event: a
 * review beside money is a payment being checked, never "held" beside a usable form (the review of 2026-11-26,
 * finding 1 — a capture stored after the deadline, an extra payment, a mismatch). A review with no payment on
 * record is null here: the caller decides (`notPayable` first asks the provider again, read-only).
 */
function standingOfOrder(
  order: ReturnState,
  step: Step,
): CheckoutActionResult | null {
  if (order.paymentStatus === "captured")
    return {
      status: "confirmed",
      order_number: order.orderNumber,
      order_path: orderPathFor(order, step.config.orderTokenSecret, step.deps),
    };
  const { reported, authorized, captured } = order.payments;
  if (
    order.needsReview &&
    ((order.paymentStatus === "pending" && order.paymentHold !== null) ||
      reported + authorized + captured > 0)
  )
    return {
      status: "confirming",
      order_number: order.orderNumber,
      order_path: orderPathFor(order, step.config.orderTokenSecret, step.deps),
    };
  return null;
}

/**
 * An order that is no longer pending, or is under review: `confirmed`, `confirming` (a hold a signed capture
 * clears, or a review beside a payment on record), otherwise `held`. Never a launch. When its detail cannot be read,
 * a pending order may be on a hold — a payment known and being confirmed — so it is `uncertain` (no new payment from
 * the page); an order no longer pending is `held`.
 *
 * A pending order under a review without a hold, with no payment on record (none reported, authorised or captured —
 * a failed one is no money) and its attempt linked to a provider order, may still have money at the provider: the
 * provider check's own review (0006 — more than one live payment, or money that is not the stored intent) records
 * those payments as known, never as verified, and nothing here counts them. So Razorpay is asked again — read-only:
 * the listing's standing alone, nothing recorded (0006's provider check would write nothing for such an order
 * either: it never touches a review that is not a hold). A captured or an authorised payment is `confirming` (the
 * order's link only under `orderPathFor`'s evidence rule); a payment in flight, or no usable answer, is
 * `uncertain`; no live payment is `held` (the re-review of round 1's fixes, 2026-11-26: never "held" beside a
 * usable form while the provider lists a payment for the order).
 */
async function notPayable(
  state: AttemptState,
  step: Step,
): Promise<CheckoutActionResult> {
  const unread: CheckoutActionResult =
    state.paymentStatus === "pending"
      ? { status: "uncertain" }
      : { status: "held" };
  const payments = step.deps.payments();
  if (!payments) return unread;
  const found = await payments.returnState(step.attemptHash, null);
  if (!found.ok || found.value === null) return unread;
  const order = found.value;
  const standing = standingOfOrder(order, step);
  if (standing !== null) return standing;
  const { reported, authorized, captured } = order.payments;
  if (
    order.paymentStatus !== "pending" ||
    !order.needsReview ||
    order.paymentHold !== null ||
    reported + authorized + captured > 0 ||
    state.providerOrderState !== "linked" ||
    state.providerOrderId === null
  )
    return { status: "held" };
  const listing = standingOf(
    await step.deps.fetchPayments(
      state.providerOrderId,
      credentialsOf(step.config),
    ),
  );
  switch (listing.standing) {
    case "captured":
    case "authorized":
      return {
        status: "confirming",
        order_number: order.orderNumber,
        order_path: orderPathFor(
          order,
          step.config.orderTokenSecret,
          step.deps,
        ),
      };
    case "in_flight":
    case "unavailable":
      return { status: "uncertain" };
    case "clear":
      return { status: "held" };
  }
}

function credentialsOf(config: CheckoutConfig): RazorpayCredentials {
  return { keyId: config.razorpayKeyId, keySecret: config.razorpayKeySecret };
}

/** Launch data for a linked order — or why it is not payable from here. */
function launchOf(state: AttemptState, step: Step): CheckoutActionResult {
  if (state.paymentStatus !== "pending" || state.needsReview)
    return { status: "held" };
  if (state.providerOrderId === null || state.expiresAt === null)
    return { status: "held" };
  if (state.expiresAt.getTime() <= state.serverTime.getTime())
    return { status: "expired" };
  return {
    status: "launch",
    launch: {
      key_id: step.config.razorpayKeyId,
      provider_order_id: state.providerOrderId,
      amount_paise: paiseToJson(state.amountPaise),
      currency: "INR",
      order_number: state.orderNumber,
      expires_at: state.expiresAt.toISOString(),
      // Both instants are the database's: the remaining time does not depend on this server's or the device's clock.
      expires_in_ms: state.expiresAt.getTime() - state.serverTime.getTime(),
    },
  };
}

function matchesIntent(
  order: RazorpayOrder,
  state: AttemptState,
  receipt: string,
): boolean {
  return (
    order.amountPaise === state.amountPaise &&
    order.currency === "INR" &&
    order.receipt === receipt
  );
}

/** Links a provider order that matches the stored intent; a link that cannot be made leaves the attempt held. */
async function link(
  state: AttemptState,
  order: RazorpayOrder,
  step: Step,
): Promise<CheckoutActionResult> {
  const linked = await step.store.linkProviderOrder(
    state.paymentAttemptId,
    order.id,
    order.createdAt,
  );
  if (linked.ok) return launchOf(linked.value, step);
  step.deps.report(`[checkout] link refused (${linked.refusal})`);
  // The database could not be reached: the row stays `requested`; a later resume closes it as unknown and
  // recovers it by receipt. Any other refusal is a conflict or an implausible provider answer: held for review.
  if (linked.refusal !== "unavailable")
    await step.store.closeProviderCreate(
      state.paymentAttemptId,
      "unknown",
      linked.refusal === "provider_time_out_of_range"
        ? "provider_time_out_of_range"
        : "link_conflict",
      true,
    );
  return { status: "start_unknown" };
}

/** `unknown`: one bounded read by receipt. Exactly one exact match links; none or several stay held. */
async function recover(
  state: AttemptState,
  step: Step,
): Promise<CheckoutActionResult> {
  const receipt = providerReceipt(state.paymentAttemptId);
  const found = await step.deps.findOrders(receipt, credentialsOf(step.config));
  if (found.outcome !== "found") return { status: "start_unknown" };
  const exact = found.orders.filter((order) =>
    matchesIntent(order, state, receipt),
  );
  if (found.orders.length !== 1 || exact.length !== 1) {
    if (found.orders.length > 0)
      step.deps.report("[checkout] recovery read ambiguous");
    return { status: "start_unknown" };
  }
  return link(state, exact[0], step);
}

/** `intent`: the single claim, then — for the request that won it — the one provider call. */
async function start(
  state: AttemptState,
  step: Step,
): Promise<CheckoutActionResult> {
  const claim = await step.store.claimProviderCreate(state.paymentAttemptId);
  if (!claim.ok) {
    if (claim.refusal === "sales_closed") return { status: "closed" };
    if (claim.refusal === "attempt_too_old") return { status: "expired" };
    if (claim.refusal === "state_conflict") return { status: "held" };
    step.deps.report(`[checkout] claim refused (${claim.refusal})`);
    return UNAVAILABLE;
  }
  if (!claim.value.claimed) {
    // Another request won the claim. Never start here: judge the state it left.
    return claim.value.providerOrderState === "intent"
      ? UNAVAILABLE
      : settle(claim.value, step);
  }

  const receipt = providerReceipt(state.paymentAttemptId);
  const outcome = await step.deps.createOrder(
    {
      amountPaise: state.amountPaise,
      receipt,
      orderNumber: state.orderNumber,
    },
    credentialsOf(step.config),
  );
  if (outcome.outcome === "created") {
    if (matchesIntent(outcome.order, state, receipt))
      return link(state, outcome.order, step);
    step.deps.report("[checkout] provider order does not match the intent");
    await step.store.closeProviderCreate(
      state.paymentAttemptId,
      "unknown",
      "provider_mismatch",
      true,
    );
    return { status: "start_unknown" };
  }
  if (outcome.outcome === "refused") {
    step.deps.report(`[checkout] provider refused (${outcome.reason})`);
    await step.store.closeProviderCreate(
      state.paymentAttemptId,
      "failed",
      `provider_${outcome.reason}`,
      // A credentials refusal is a configuration fault someone must look at.
      outcome.reason === "unauthorised",
    );
    return { status: "start_failed" };
  }
  step.deps.report(`[checkout] provider outcome unknown (${outcome.reason})`);
  await step.store.closeProviderCreate(
    state.paymentAttemptId,
    "unknown",
    `provider_${outcome.reason}`,
    false,
  );
  return { status: "start_unknown" };
}

/**
 * S1.7 — a linked order whose payment window may have been open before: launch data only after Razorpay has said
 * that no payment for it is captured, authorised or still in flight, and only while no payment reported by a
 * verified Checkout return stands on record for it. Past its deadline the same question is asked first — a payment
 * may have been taken before the deadline passed, or be on its way — and only a clear answer is `expired`. The
 * provider is asked once, with a bounded wait; an answer that cannot be had or trusted is `uncertain`: never a
 * launch, and never "the time has passed".
 */
async function relaunch(
  state: AttemptState,
  step: Step,
): Promise<CheckoutActionResult> {
  const launch = launchOf(state, step);
  // Not payable here for another reason (held): nothing to ask the provider.
  if (
    (launch.status !== "launch" && launch.status !== "expired") ||
    state.providerOrderId === null
  )
    return launch;
  const payments = step.deps.payments();
  if (!payments) {
    step.deps.report("[checkout] privileged client unavailable");
    return UNAVAILABLE;
  }
  const standing = await checkProviderPayments(
    {
      paymentAttemptId: state.paymentAttemptId,
      providerOrderId: state.providerOrderId,
    },
    credentialsOf(step.config),
    {
      fetchPayments: step.deps.fetchPayments,
      store: payments,
      report: step.deps.report,
    },
  );
  switch (standing.standing) {
    case "clear": {
      // Razorpay knows of no live payment. A payment this database holds as reported by a verified Checkout return
      // is not forgotten for that: until its own event settles it, the order is being confirmed — never offered
      // again, never "expired".
      const found = await payments.returnState(step.attemptHash, null);
      if (!found.ok || found.value === null) return { status: "uncertain" };
      const order = found.value;
      if (order.payments.reported > 0)
        return {
          status: "confirming",
          order_number: order.orderNumber,
          order_path: orderPathFor(
            order,
            step.config.orderTokenSecret,
            step.deps,
          ),
        };
      // The answer is judged by this read — the database's own, made after the provider's — never by the attempt
      // read before both: the order may have been confirmed or held meanwhile, and its deadline may have passed.
      // An order whose fulfilment no longer awaits its payment (cancelled, on hold) is not payable from here whatever
      // its payment status says — the finalizer would only flag the payment (0005: order_not_payable) — and it is
      // never "expired" either (the review of 2026-11-26, finding 5).
      const standing = standingOfOrder(order, step);
      if (standing !== null) return standing;
      if (
        order.paymentStatus !== "pending" ||
        order.fulfilmentStatus !== "pending_payment" ||
        order.needsReview ||
        order.expiresAt === null
      )
        return { status: "held" };
      if (order.expiresAt.getTime() <= order.serverTime.getTime())
        return { status: "expired" };
      if (launch.status !== "launch") return launch;
      return {
        status: "launch",
        launch: {
          ...launch.launch,
          expires_at: order.expiresAt.toISOString(),
          expires_in_ms: order.expiresAt.getTime() - order.serverTime.getTime(),
        },
      };
    }
    case "captured":
    case "authorized": {
      // What the provider showed is recorded — a hold, or a review (more than one live payment, or money that is not
      // the stored intent: 0006), or nothing beside a review that already stood: say what the order is now — never a
      // launch. Razorpay has just listed a live payment for it, so an order still pending is being confirmed even
      // where no verified signature stands on record yet (a review the provider check raised): never "held" beside a
      // usable form.
      const found = await payments.returnState(step.attemptHash, null);
      if (!found.ok || found.value === null) return { status: "uncertain" };
      const order = found.value;
      return (
        standingOfOrder(order, step) ??
        (order.paymentStatus === "pending"
          ? {
              status: "confirming",
              order_number: order.orderNumber,
              order_path: orderPathFor(
                order,
                step.config.orderTokenSecret,
                step.deps,
              ),
            }
          : { status: "held" })
      );
    }
    case "in_flight":
    case "unavailable":
      return { status: "uncertain" };
  }
}

/** Every state except `intent` — the half of `advance` that can never start a provider create. */
async function settle(
  state: AttemptState,
  step: Step,
): Promise<CheckoutActionResult> {
  if (state.paymentStatus !== "pending" || state.needsReview)
    return notPayable(state, step);
  switch (state.providerOrderState) {
    case "linked":
      return relaunch(state, step);
    case "failed":
      return { status: "start_failed" };
    case "unknown":
      return recover(state, step);
    case "requested": {
      const requestedAt = state.providerCreateRequestedAt;
      if (
        requestedAt !== null &&
        state.serverTime.getTime() - requestedAt.getTime() < STALE_REQUEST_MS
      )
        return { status: "in_progress" };
      const closed = await step.store.closeProviderCreate(
        state.paymentAttemptId,
        "unknown",
        "stale_request",
        false,
      );
      if (!closed.ok)
        // The other request finished meanwhile (a conflict) or the database is away: ask again shortly.
        return closed.refusal === "state_conflict"
          ? { status: "in_progress" }
          : UNAVAILABLE;
      return closed.value.providerOrderState === "unknown"
        ? recover(closed.value, step)
        : settle(closed.value, step);
    }
    case "intent":
      // Reached only if a caller passes an intent here; never start from this half.
      return UNAVAILABLE;
  }
}

function advance(
  state: AttemptState,
  step: Step,
): Promise<CheckoutActionResult> {
  if (state.paymentStatus !== "pending" || state.needsReview)
    return notPayable(state, step);
  return state.providerOrderState === "intent"
    ? start(state, step)
    : settle(state, step);
}

function createRefusal(
  refusal: StoreRefusal,
  report: (message: string) => void,
): CheckoutActionResult {
  switch (refusal) {
    case "sales_closed":
      return { status: "closed" };
    case "item_unavailable":
    case "total_changed":
      return { status: "bag_changed" };
    case "invalid_request":
    case "attempt_payload_changed":
      return { status: "invalid", fields: {} };
    default:
      report(`[checkout] pending order refused (${refusal})`);
      return UNAVAILABLE;
  }
}

function throttled(outcome: ThrottleOutcome): CheckoutActionResult | null {
  if (outcome.ok) return null;
  return outcome.reason === "rate_limited"
    ? { status: "throttled" }
    : UNAVAILABLE;
}

/** A new submission, or the same one again (the same key and the same details). */
export async function submitCheckout(
  input: unknown,
  context: FlowContext,
  deps: FlowDependencies = defaultFlowDependencies(),
): Promise<CheckoutActionResult> {
  const gate = deps.gate();
  if (!gate.open) return { status: "closed" };
  const { config } = gate;

  const parsed = checkoutSubmissionSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid", fields: {} };
  const submission = parsed.data;
  const fields = normaliseCheckoutFields(submission.fields);
  if (!fields.ok) return { status: "invalid", fields: fields.errors };
  const shownTotal = parsePaise(submission.shown_total_paise);
  if (!shownTotal.ok) return { status: "invalid", fields: {} };

  const limited = throttled(await deps.throttle("submit", context.address));
  if (limited) return limited;

  const challenge = await deps.verifyChallenge({
    token: submission.turnstile_token,
    secret: config.turnstileSecret,
    remoteIp: context.address,
    expectedHostnames: config.turnstileHostnames,
    // The gate never opens in Production; stated here so the verifier's own rule does not depend on that.
    production: false,
  });
  if (!challenge.ok)
    return challenge.reason === "failed"
      ? { status: "challenge_failed" }
      : UNAVAILABLE;

  const store = deps.store();
  if (!store) {
    deps.report("[checkout] privileged client unavailable");
    return UNAVAILABLE;
  }
  const token = deps.issueToken(config.orderTokenSecret);
  const hash = attemptHash(submission.attempt_key);
  const created = await store.createPendingOrder({
    attemptHash: hash,
    payloadMac: payloadMac(
      submission.attempt_key,
      canonicalCheckoutPayload(submission.items, fields.fields),
    ),
    tokenHash: token.hash,
    tokenSalt: token.salt,
    expectedTotalPaise: shownTotal.paise,
    fields: fields.fields,
    items: submission.items,
  });
  if (!created.ok) return createRefusal(created.refusal, deps.report);
  return advance(created.value, { config, store, deps, attemptHash: hash });
}

/** Where an attempt stands, by its key alone. Creates no business row. */
export async function resumeCheckout(
  input: unknown,
  context: FlowContext,
  deps: FlowDependencies = defaultFlowDependencies(),
): Promise<CheckoutActionResult> {
  const gate = deps.gate();
  if (!gate.open) return { status: "closed" };
  const { config } = gate;

  const parsed = checkoutResumeSchema.safeParse(input);
  if (!parsed.success) return { status: "not_found" };

  const limited = throttled(await deps.throttle("resume", context.address));
  if (limited) return limited;

  const store = deps.store();
  if (!store) {
    deps.report("[checkout] privileged client unavailable");
    return UNAVAILABLE;
  }
  const hash = attemptHash(parsed.data.attempt_key);
  const found = await store.attemptState(hash);
  if (!found.ok) {
    deps.report(`[checkout] attempt read refused (${found.refusal})`);
    return UNAVAILABLE;
  }
  const state = found.value;
  if (state === null) return { status: "not_found" };
  if (
    state.serverTime.getTime() - state.placedAt.getTime() >
    ATTEMPT_HONOURED_MS
  )
    return { status: "not_found" };
  return advance(state, { config, store, deps, attemptHash: hash });
}

const RETURN_REJECTED: CheckoutReturnResult = { status: "rejected" };
const RETURN_UNAVAILABLE: CheckoutReturnResult = { status: "unavailable" };

/**
 * S1.7 — the report Razorpay's window made to the page, verified. In order, each step stopping the flow:
 *   1. the payment gate (configuration only) — NOT the sales gate: a payment already made is verified whether or
 *      not new orders are being taken;
 *   2. the strict parse: the attempt key, a payment id and a signature — nothing else is accepted, and no order id,
 *      order number, amount or status from the browser exists to be trusted;
 *   3. the rate limit (the resume quota; fails closed);
 *   4. the attempt, read by the key's hash: it must exist, be honoured still, and be linked to a provider order;
 *   5. the signature, verified with the API key secret over `<the STORED provider order id>|<payment id>`;
 *   6. the payment recorded as reported (`payment_return_state`) — never as authorised, captured or paid;
 *   7. the order's page.
 * A wrong signature, a foreign payment id, a malformed report and an unknown attempt are one answer: `rejected`.
 * Nothing here confirms an order, queues a message or says a payment was received.
 */
export async function verifyCheckoutReturn(
  input: unknown,
  context: FlowContext,
  deps: FlowDependencies = defaultFlowDependencies(),
): Promise<CheckoutReturnResult> {
  const gate = deps.paymentsGate();
  if (!gate.open) {
    deps.report(`[return] closed (${gate.reason})`);
    return RETURN_UNAVAILABLE;
  }
  const { config } = gate;

  const parsed = checkoutReturnSchema.safeParse(input);
  if (!parsed.success) return RETURN_REJECTED;

  const limited = await deps.throttle("resume", context.address);
  if (!limited.ok)
    return limited.reason === "rate_limited"
      ? { status: "throttled" }
      : RETURN_UNAVAILABLE;

  const store = deps.store();
  const payments = deps.payments();
  if (!store || !payments) {
    deps.report("[return] privileged client unavailable");
    return RETURN_UNAVAILABLE;
  }

  const hash = attemptHash(parsed.data.attempt_key);
  const found = await store.attemptState(hash);
  if (!found.ok) {
    deps.report(`[return] attempt read refused (${found.refusal})`);
    return RETURN_UNAVAILABLE;
  }
  const state = found.value;
  if (
    state === null ||
    state.serverTime.getTime() - state.placedAt.getTime() >
      ATTEMPT_HONOURED_MS ||
    state.providerOrderState !== "linked" ||
    state.providerOrderId === null
  )
    return RETURN_REJECTED;

  if (
    !verifyCheckoutSignature(
      state.providerOrderId,
      parsed.data.razorpay_payment_id,
      parsed.data.razorpay_signature,
      config.razorpayKeySecret,
    )
  ) {
    deps.report("[return] signature refused");
    return RETURN_REJECTED;
  }

  const recorded = await payments.returnState(
    hash,
    parsed.data.razorpay_payment_id,
  );
  if (!recorded.ok) {
    deps.report(`[return] not recorded (${recorded.refusal})`);
    return recorded.refusal === "unavailable"
      ? RETURN_UNAVAILABLE
      : RETURN_REJECTED;
  }
  if (recorded.value === null) return RETURN_REJECTED;

  const path = orderPathFor(recorded.value, config.orderTokenSecret, deps);
  if (path === null) {
    deps.report("[return] order link unavailable");
    return RETURN_UNAVAILABLE;
  }
  return { status: "verified", order_path: path };
}
