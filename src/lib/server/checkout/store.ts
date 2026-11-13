import "server-only";

import { z } from "zod";

import { paiseToJson } from "@/lib/money";
import type { BagRequestItem } from "@/lib/schemas/bag";
import type { NormalisedCheckoutFields } from "@/lib/schemas/checkout";
import { positivePaiseSchema } from "@/lib/schemas/money";
import { orderNumberSchema, paymentStatusSchema } from "@/lib/schemas/orders";

/**
 * The checkout's database adapter — S1.6 (supabase/migrations/0004_checkout.sql; docs/database-changes/
 * S1.6-0004-checkout.md). Five calls, one per function of the migration, each one PostgREST request and therefore
 * one transaction. Nothing else in the checkout touches a table: no `.from(…)`, no separate inserts.
 *
 * - Every answer is parsed (the state schema below) before it is used; an answer that does not parse is
 *   `unavailable`, never a guess.
 * - Every refusal is one enumerated reason, mapped from the function's custom SQLSTATE (class ZC). The message,
 *   detail and hint of a database error are never read, logged or returned.
 * - The client is handed in (the privileged, secret-key client of src/lib/server/supabase.ts, created per call by
 *   the flow); this module imports no SDK.
 */

export const PROVIDER_ORDER_STATES = [
  "intent",
  "requested",
  "linked",
  "failed",
  "unknown",
] as const;
export type ProviderOrderState = (typeof PROVIDER_ORDER_STATES)[number];

const timestamp = z.string().transform((value, ctx) => {
  const time = Date.parse(value);
  if (Number.isNaN(time)) {
    ctx.addIssue({ code: "custom", message: "not a timestamp" });
    return z.NEVER;
  }
  return new Date(time);
});

const stateSchema = z.object({
  order_number: orderNumberSchema,
  payment_attempt_id: z.uuid(),
  amount_paise: positivePaiseSchema,
  currency: z.literal("INR"),
  provider_order_state: z.enum(PROVIDER_ORDER_STATES),
  provider_order_id: z.string().min(1).max(120).nullable(),
  provider_create_requested_at: timestamp.nullable(),
  expires_at: timestamp.nullable(),
  payment_status: paymentStatusSchema,
  needs_review: z.boolean(),
  placed_at: timestamp,
  server_time: timestamp,
});

export type AttemptState = {
  orderNumber: string;
  paymentAttemptId: string;
  amountPaise: bigint;
  currency: "INR";
  providerOrderState: ProviderOrderState;
  providerOrderId: string | null;
  providerCreateRequestedAt: Date | null;
  expiresAt: Date | null;
  paymentStatus: z.infer<typeof paymentStatusSchema>;
  needsReview: boolean;
  placedAt: Date;
  /** The database's clock when it answered: every age and deadline is judged against it, never the server's. */
  serverTime: Date;
};

function toState(row: z.infer<typeof stateSchema>): AttemptState {
  return {
    orderNumber: row.order_number,
    paymentAttemptId: row.payment_attempt_id,
    amountPaise: row.amount_paise,
    currency: row.currency,
    providerOrderState: row.provider_order_state,
    providerOrderId: row.provider_order_id,
    providerCreateRequestedAt: row.provider_create_requested_at,
    expiresAt: row.expires_at,
    paymentStatus: row.payment_status,
    needsReview: row.needs_review,
    placedAt: row.placed_at,
    serverTime: row.server_time,
  };
}

/** The refusals of 0004_checkout by SQLSTATE; anything else is `unavailable`. */
export const STORE_REFUSALS = {
  ZC001: "invalid_request",
  ZC002: "attempt_payload_changed",
  ZC003: "sales_closed",
  ZC004: "rule_not_supported",
  ZC005: "item_unavailable",
  ZC006: "total_changed",
  ZC007: "policies_missing",
  ZC008: "amount_out_of_range",
  ZC010: "attempt_not_found",
  ZC011: "state_conflict",
  ZC012: "attempt_too_old",
  ZC013: "provider_time_out_of_range",
} as const;

export type StoreRefusal =
  (typeof STORE_REFUSALS)[keyof typeof STORE_REFUSALS] | "unavailable";

export type StoreResult<T> =
  { ok: true; value: T } | { ok: false; refusal: StoreRefusal };

/** The one capability this module needs from the privileged client. */
export type RpcCall = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { code?: string | null } | null }>;

export type PendingOrderRequest = {
  attemptHash: string;
  payloadMac: string;
  tokenHash: string;
  tokenSalt: string;
  /** The total the page showed — a precondition the database can only refuse on. */
  expectedTotalPaise: bigint;
  fields: NormalisedCheckoutFields;
  items: readonly BagRequestItem[];
};

export type CheckoutStore = {
  createPendingOrder: (
    request: PendingOrderRequest,
  ) => Promise<StoreResult<AttemptState & { replayed: boolean }>>;
  attemptState: (
    attemptHash: string,
  ) => Promise<StoreResult<AttemptState | null>>;
  claimProviderCreate: (
    paymentAttemptId: string,
  ) => Promise<StoreResult<AttemptState & { claimed: boolean }>>;
  linkProviderOrder: (
    paymentAttemptId: string,
    providerOrderId: string,
    providerCreatedAt: Date,
  ) => Promise<StoreResult<AttemptState & { linked: boolean }>>;
  closeProviderCreate: (
    paymentAttemptId: string,
    outcome: "failed" | "unknown",
    reason: string,
    needsReview: boolean,
  ) => Promise<StoreResult<AttemptState & { closed: boolean }>>;
};

function refusalOf(
  code: string | null | undefined,
  uniqueViolation: StoreRefusal = "unavailable",
): StoreRefusal {
  if (typeof code === "string") {
    if (Object.hasOwn(STORE_REFUSALS, code))
      return STORE_REFUSALS[code as keyof typeof STORE_REFUSALS];
    if (code === "23505") return uniqueViolation;
  }
  return "unavailable";
}

/** The JSON body `checkout_create_pending_order` validates key by key. */
export function pendingOrderRequestBody(
  request: PendingOrderRequest,
): Record<string, unknown> {
  const { fields } = request;
  return {
    attempt_hash: request.attemptHash,
    payload_mac: request.payloadMac,
    token_hash: request.tokenHash,
    token_salt: request.tokenSalt,
    expected_total_paise: paiseToJson(request.expectedTotalPaise),
    contact: { name: fields.name, email: fields.email, phone: fields.phone },
    address: {
      line1: fields.line1,
      line2: fields.line2,
      city: fields.city,
      state: fields.state,
      pincode: fields.pincode,
    },
    items: request.items.map((item) => ({
      variant_code: item.variant_code,
      quantity: item.quantity,
    })),
  };
}

export function createCheckoutStore(rpc: RpcCall): CheckoutStore {
  async function call<Flag extends string>(
    name: string,
    args: Record<string, unknown>,
    flag: Flag,
    uniqueViolation: StoreRefusal = "unavailable",
  ): Promise<StoreResult<AttemptState & Record<Flag, boolean>>> {
    let answer: Awaited<ReturnType<RpcCall>>;
    try {
      answer = await rpc(name, args);
    } catch {
      return { ok: false, refusal: "unavailable" };
    }
    if (answer.error)
      return {
        ok: false,
        refusal: refusalOf(answer.error.code, uniqueViolation),
      };
    const parsed = stateSchema.safeParse(answer.data);
    if (!parsed.success) return { ok: false, refusal: "unavailable" };
    const flagValue = (answer.data as Record<string, unknown>)[flag];
    if (typeof flagValue !== "boolean")
      return { ok: false, refusal: "unavailable" };
    return {
      ok: true,
      value: {
        ...toState(parsed.data),
        [flag]: flagValue,
      } as AttemptState & Record<Flag, boolean>,
    };
  }

  return {
    createPendingOrder: (request) =>
      call(
        "checkout_create_pending_order",
        { p_request: pendingOrderRequestBody(request) },
        "replayed",
      ),
    async attemptState(attemptHash) {
      let answer: Awaited<ReturnType<RpcCall>>;
      try {
        answer = await rpc("checkout_attempt_state", {
          p_attempt_hash: attemptHash,
        });
      } catch {
        return { ok: false, refusal: "unavailable" };
      }
      if (answer.error)
        return { ok: false, refusal: refusalOf(answer.error.code) };
      if (answer.data === null) return { ok: true, value: null };
      const parsed = stateSchema.safeParse(answer.data);
      if (!parsed.success) return { ok: false, refusal: "unavailable" };
      return { ok: true, value: toState(parsed.data) };
    },
    claimProviderCreate: (paymentAttemptId) =>
      call(
        "checkout_claim_provider_create",
        { p_payment_attempt_id: paymentAttemptId },
        "claimed",
      ),
    linkProviderOrder: (paymentAttemptId, providerOrderId, providerCreatedAt) =>
      call(
        "checkout_link_provider_order",
        {
          p_payment_attempt_id: paymentAttemptId,
          p_provider_order_id: providerOrderId,
          p_provider_created_at: providerCreatedAt.toISOString(),
        },
        "linked",
        // Another checkout row already holds this provider order id: a conflict, never an overwrite.
        "state_conflict",
      ),
    closeProviderCreate: (paymentAttemptId, outcome, reason, needsReview) =>
      call(
        "checkout_close_provider_create",
        {
          p_payment_attempt_id: paymentAttemptId,
          p_outcome: outcome,
          p_reason: reason,
          p_needs_review: needsReview,
        },
        "closed",
      ),
  };
}
