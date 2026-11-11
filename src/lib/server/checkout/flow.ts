import "server-only";

import { paiseToJson, parsePaise } from "@/lib/money";
import {
  canonicalCheckoutPayload,
  checkoutResumeSchema,
  checkoutSubmissionSchema,
  normaliseCheckoutFields,
  type CheckoutActionResult,
} from "@/lib/schemas/checkout";

import {
  consumeCheckoutAttempt,
  type CheckoutThrottleKind,
} from "../checkout-throttle";
import type { ThrottleOutcome } from "../login-throttle";
import {
  createRazorpayOrder,
  findRazorpayOrdersByReceipt,
  type CreateOrderInput,
  type CreateOrderOutcome,
  type FindOrdersOutcome,
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
 *   - `linked` → launch data, only while the order is pending, not under review and not past its deadline. The
 *     deadline is never extended: a resume returns the same order with the same `expires_at`.
 *   - `failed` → `start_failed`: the customer starts again as a new order under a new attempt key.
 * No step here marks anything paid, failed-as-payment or confirmed: that is S1.7's, after its signature check.
 *
 * The confirmation token is issued with the order (salt and hash, D-61) and is not returned to anyone here.
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
    report: (message) => console.error(message),
  };
}

type Step = {
  config: CheckoutConfig;
  store: CheckoutStore;
  deps: FlowDependencies;
};

const UNAVAILABLE: CheckoutActionResult = { status: "unavailable" };

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

/** Every state except `intent` — the half of `advance` that can never start a provider create. */
async function settle(
  state: AttemptState,
  step: Step,
): Promise<CheckoutActionResult> {
  if (state.paymentStatus !== "pending" || state.needsReview)
    return { status: "held" };
  switch (state.providerOrderState) {
    case "linked":
      return launchOf(state, step);
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
    return Promise.resolve({ status: "held" });
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
  const created = await store.createPendingOrder({
    attemptHash: attemptHash(submission.attempt_key),
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
  return advance(created.value, { config, store, deps });
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
  const found = await store.attemptState(attemptHash(parsed.data.attempt_key));
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
  return advance(state, { config, store, deps });
}
