import "server-only";

import { z } from "zod";

import { paiseToJson } from "@/lib/money";
import {
  orderConfirmationRowSchema,
  paymentCountsSchema,
  paymentHoldSchema,
  type OrderConfirmationRow,
  type PaymentCounts,
  type PaymentHold,
} from "@/lib/schemas/order-confirmation";
import {
  fulfilmentStatusSchema,
  orderNumberSchema,
  paymentStatusSchema,
} from "@/lib/schemas/orders";

import type { RpcCall } from "../checkout/store";

/**
 * The payments' database adapter — S1.7 (supabase/migrations/0005_payment_finalization.sql and
 * 0006_payment_evidence.sql; docs/database-changes/S1.7-0005-payment-finalization.md and
 * S1.7-0006-payment-evidence.md). Five calls, one per payment function, each one PostgREST request and therefore one
 * transaction. Nothing else in the payment code touches a table: no `.from(…)`, no separate writes — the
 * confirmation of an order is `payment_process_event` and nothing beside it.
 *
 * - The ledger step is given the verified delivery's exact bytes beside its parse (0006): the bytes are the
 *   evidence, the parse is what the database processes.
 * - The provider check is given every live payment the provider listed for the order, each with the amount and the
 *   currency the provider observed (0006): the database judges them against the stored intent under its locks.
 * - Every answer is parsed before it is used; an answer that does not parse is `unavailable`, never a guess.
 * - Every refusal is one enumerated reason, mapped from the function's custom SQLSTATE (class ZP). The message,
 *   detail and hint of a database error are never read, logged or returned.
 * - The client is handed in (the privileged, secret-key client of src/lib/server/supabase.ts, created per call);
 *   this module imports no SDK.
 */

/** The refusals of 0005_payment_finalization (0006 adds none) by SQLSTATE; anything else is `unavailable`. */
export const PAYMENT_REFUSALS = {
  ZP001: "invalid_request",
  ZP010: "event_not_found",
  ZP012: "state_conflict",
  ZP020: "attempt_not_found",
  ZP021: "payment_conflict",
  ZP030: "outbox_conflict",
} as const;

export type PaymentRefusal =
  (typeof PAYMENT_REFUSALS)[keyof typeof PAYMENT_REFUSALS] | "unavailable";

export type PaymentResult<T> =
  { ok: true; value: T } | { ok: false; refusal: PaymentRefusal };

const timestamp = z.string().transform((value, ctx) => {
  const time = Date.parse(value);
  if (Number.isNaN(time)) {
    ctx.addIssue({ code: "custom", message: "not a timestamp" });
    return z.NEVER;
  }
  return new Date(time);
});

export const PROCESSING_STATUSES = [
  "received",
  "processed",
  "ignored",
  "failed",
] as const;
export type ProcessingStatus = (typeof PROCESSING_STATUSES)[number];

const recordedEventSchema = z.strictObject({
  event: z.uuid(),
  inserted: z.boolean(),
  derived: z.boolean(),
  processing_status: z.enum(PROCESSING_STATUSES),
});

export type RecordedEvent = {
  /** The ledger row's id — the only handle `processEvent` takes. */
  eventRowId: string;
  /** False when the ledger already held this delivery. */
  inserted: boolean;
  /** True when the event id was already held by other content and this delivery was stored beside it. */
  derived: boolean;
  processingStatus: ProcessingStatus;
};

/** What `payment_process_event` recorded for an event: a short code, e.g. `confirmed` or `review:amount_mismatch`. */
const processedEventSchema = z.strictObject({
  outcome: z.string().regex(/^[a-z_]+(:[a-z_]+)?$/),
  replayed: z.boolean(),
});
export type ProcessedEvent = z.infer<typeof processedEventSchema>;

const returnStateSchema = z.strictObject({
  order_number: orderNumberSchema,
  payment_status: paymentStatusSchema,
  fulfilment_status: fulfilmentStatusSchema,
  needs_review: z.boolean(),
  payment_hold: paymentHoldSchema.nullable(),
  expires_at: timestamp.nullable(),
  confirmation_token_salt: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable(),
  confirmation_token_hash: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable(),
  payments: paymentCountsSchema,
  recorded: z.boolean(),
  server_time: timestamp,
});

export type ReturnState = {
  orderNumber: string;
  paymentStatus: z.infer<typeof paymentStatusSchema>;
  fulfilmentStatus: z.infer<typeof fulfilmentStatusSchema>;
  needsReview: boolean;
  paymentHold: PaymentHold | null;
  expiresAt: Date | null;
  /** The salt and the hash of the order's confirmation link (D-61). The link itself is never stored. */
  tokenSalt: string | null;
  tokenHash: string | null;
  payments: PaymentCounts;
  /** True when this call recorded the verified payment as reported. */
  recorded: boolean;
  serverTime: Date;
};

const providerCheckSchema = z.strictObject({
  held: z.boolean(),
  payment_status: paymentStatusSchema,
  needs_review: z.boolean(),
  payment_hold: paymentHoldSchema.nullable(),
});

export type ProviderCheckRecord = {
  /** True when this call raised (or strengthened) the hold — false when it raised a review, or wrote nothing. */
  held: boolean;
  paymentStatus: z.infer<typeof paymentStatusSchema>;
  needsReview: boolean;
  paymentHold: PaymentHold | null;
};

/** A live payment as the provider listed it — captured or authorised — with the money the provider observed. */
export type ObservedPayment = {
  readonly id: string;
  readonly status: "captured" | "authorized";
  readonly amountPaise: bigint;
  readonly currency: string;
};

/** Bytes as bytea's hex input (`\x…`), the form PostgREST hands a `bytea` argument to Postgres. */
export function byteaHex(bytes: Uint8Array): string {
  return `\\x${Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("hex")}`;
}

export type PaymentStore = {
  /**
   * The insert-first ledger step. Call it only for a delivery whose signature has verified: `rawBody` is exactly the
   * bytes that were verified, `payload` their parse.
   */
  recordEvent: (
    eventId: string,
    eventType: string,
    payload: Record<string, unknown>,
    rawBody: Uint8Array,
  ) => Promise<PaymentResult<RecordedEvent>>;
  /** One event's one business effect, from its ledger row alone. */
  processEvent: (eventRowId: string) => Promise<PaymentResult<ProcessedEvent>>;
  /**
   * Where an attempt's order stands. With a payment id — only after its Checkout signature has verified — the
   * payment is first recorded as reported.
   */
  returnState: (
    attemptHash: string,
    verifiedPaymentId: string | null,
  ) => Promise<PaymentResult<ReturnState | null>>;
  /**
   * What the provider's API shows for an order: EVERY live payment it listed (one or more, distinct ids), each with
   * its observed amount and currency. Exactly one, matching the stored intent: the hold. More than one, or money that
   * is not the stored intent: a review no capture clears. Never a confirmation.
   */
  recordProviderCheck: (
    paymentAttemptId: string,
    payments: readonly ObservedPayment[],
  ) => Promise<PaymentResult<ProviderCheckRecord>>;
  /** The order behind a confirmation link, by the SHA-256 of the presented token. */
  confirmationView: (
    tokenHash: string,
  ) => Promise<PaymentResult<OrderConfirmationRow | null>>;
};

function refusalOf(code: string | null | undefined): PaymentRefusal {
  return typeof code === "string" && Object.hasOwn(PAYMENT_REFUSALS, code)
    ? PAYMENT_REFUSALS[code as keyof typeof PAYMENT_REFUSALS]
    : "unavailable";
}

export function createPaymentStore(rpc: RpcCall): PaymentStore {
  /** One call; `null` data is passed through as `null` when the function may answer it. */
  async function call<Schema extends z.ZodType, Out>(
    name: string,
    args: Record<string, unknown>,
    schema: Schema,
    map: (row: z.infer<Schema>) => Out,
  ): Promise<PaymentResult<Out | null>> {
    let answer: Awaited<ReturnType<RpcCall>>;
    try {
      answer = await rpc(name, args);
    } catch {
      return { ok: false, refusal: "unavailable" };
    }
    if (answer.error)
      return { ok: false, refusal: refusalOf(answer.error.code) };
    if (answer.data === null || answer.data === undefined)
      return { ok: true, value: null };
    const parsed = schema.safeParse(answer.data);
    if (!parsed.success) return { ok: false, refusal: "unavailable" };
    return { ok: true, value: map(parsed.data) };
  }

  /** A call whose function never answers NULL: a NULL answer is `unavailable`. */
  async function required<Schema extends z.ZodType, Out>(
    name: string,
    args: Record<string, unknown>,
    schema: Schema,
    map: (row: z.infer<Schema>) => Out,
  ): Promise<PaymentResult<Out>> {
    const result = await call(name, args, schema, map);
    if (!result.ok) return result;
    return result.value === null
      ? { ok: false, refusal: "unavailable" }
      : { ok: true, value: result.value };
  }

  return {
    recordEvent: (eventId, eventType, payload, rawBody) =>
      required(
        "payment_record_event",
        {
          p_event_id: eventId,
          p_event_type: eventType,
          p_payload: payload,
          p_raw_body: byteaHex(rawBody),
        },
        recordedEventSchema,
        (row) => ({
          eventRowId: row.event,
          inserted: row.inserted,
          derived: row.derived,
          processingStatus: row.processing_status,
        }),
      ),
    processEvent: (eventRowId) =>
      required(
        "payment_process_event",
        { p_event: eventRowId },
        processedEventSchema,
        (row) => row,
      ),
    returnState: (attemptHash, verifiedPaymentId) =>
      call(
        "payment_return_state",
        {
          p_attempt_hash: attemptHash,
          p_verified_payment_id: verifiedPaymentId,
        },
        returnStateSchema,
        (row): ReturnState => ({
          orderNumber: row.order_number,
          paymentStatus: row.payment_status,
          fulfilmentStatus: row.fulfilment_status,
          needsReview: row.needs_review,
          paymentHold: row.payment_hold,
          expiresAt: row.expires_at,
          tokenSalt: row.confirmation_token_salt,
          tokenHash: row.confirmation_token_hash,
          payments: row.payments,
          recorded: row.recorded,
          serverTime: row.server_time,
        }),
      ),
    recordProviderCheck: (paymentAttemptId, payments) =>
      required(
        "payment_record_provider_check",
        {
          p_payment_attempt_id: paymentAttemptId,
          // Exact paise as decimal strings, never a Number (src/lib/money.ts); the database validates every value.
          p_payments: payments.map((payment) => ({
            id: payment.id,
            status: payment.status,
            amount_paise: paiseToJson(payment.amountPaise),
            currency: payment.currency,
          })),
        },
        providerCheckSchema,
        (row): ProviderCheckRecord => ({
          held: row.held,
          paymentStatus: row.payment_status,
          needsReview: row.needs_review,
          paymentHold: row.payment_hold,
        }),
      ),
    confirmationView: (tokenHash) =>
      call(
        "order_confirmation_view",
        { p_token_hash: tokenHash },
        orderConfirmationRowSchema,
        (row) => row,
      ),
  };
}
