import "server-only";

import { createHash } from "node:crypto";

import {
  HMAC_SHA256_HEX_PATTERN,
  PROVIDER_EVENT_ID_PATTERN,
  webhookEnvelopeSchema,
} from "@/lib/schemas/payments";

import { privilegedPaymentStore } from "./client";
import { paymentsGate, type PaymentsGate } from "./config";
import { verifyWebhookSignature } from "./signature";
import type { PaymentStore } from "./store";

/**
 * `POST /api/webhooks/razorpay` — S1.7 (docs/TECH-ARCHITECTURE.md §3c; docs/sprint-prompts/
 * S1.7-razorpay-verification.md §H.3 "Webhook"). Razorpay's deliveries are the only thing that can confirm an
 * order. The caller is authenticated by its signature and by nothing else: no session, no Turnstile, no rate
 * limit (a public write protected by a shared secret, with an idempotent effect — docs/THREAT-MODEL.md), and
 * Deployment Protection is not the guard.
 *
 * Fail-closed order — nothing is stored before step 5 has passed:
 *   1. only `POST` (another method: `405`, nothing read);
 *   2. the payment gate (src/lib/server/payments/config.ts) — closed: `503`, nothing read;
 *   3. `X-Razorpay-Signature` must be 64 lower-case hex characters — else `400`, the body unread;
 *   4. the body, read bounded (256 KiB) as raw bytes — longer: `413`;
 *   5. the signature, verified over exactly those bytes with the webhook secret — else `400`. A missing, malformed
 *      or forged signature therefore writes NOTHING: no ledger row, so a forged delivery can never hold the id of
 *      the genuine one (0002: `signature_ok` is immutable, the id is unique, no row can be deleted);
 *   6. the same bytes parsed as an event (an `event` type and a `payload`) — else `400`, still nothing stored;
 *   7. **the ledger first** (`payment_record_event`): the delivery as it arrived, under the provider's event id
 *      (`x-razorpay-event-id`; a digest of the body where the header is absent or malformed);
 *   8. **then its effect** (`payment_process_event`): one database transaction that reads the ledger row alone and
 *      marks it in the same transaction.
 *
 * What is answered: `200 {"status":"ok"}` only for a durable outcome — the event was processed now, or the ledger
 * shows it already processed or ignored. Anything that did not reach a durable outcome is `503
 * {"status":"unavailable"}`, so Razorpay delivers it again (and "Replay events" can — it replays only what was not
 * acknowledged): a ledger row left `received` is picked up by that next delivery. No answer says what the event
 * did, and none carries an id, an amount, a body or an upstream message. Every answer is `Cache-Control: no-store`.
 *
 * Logs receive enumerated codes only — never the body, the query string, an id or a signature.
 */

/** The largest delivery accepted. Razorpay's payment events are a few kilobytes. */
export const WEBHOOK_MAX_BODY_BYTES = 256 * 1024;
export const SIGNATURE_HEADER = "x-razorpay-signature";
export const EVENT_ID_HEADER = "x-razorpay-event-id";

export type WebhookDependencies = {
  gate: () => PaymentsGate;
  /** The database adapter over the privileged client, or null when that client cannot be made. */
  store: () => PaymentStore | null;
  /** Where a sanitised reason code goes. */
  report: (message: string) => void;
};

function defaultDependencies(): WebhookDependencies {
  return {
    gate: () => paymentsGate(),
    store: () => privilegedPaymentStore(),
    report: (message) => console.error(message),
  };
}

function answer(
  status: number,
  body: Record<string, string>,
  headers?: HeadersInit,
): Response {
  const response = Response.json(body, { status, headers });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

const OK = () => answer(200, { status: "ok" });
const UNAVAILABLE = () => answer(503, { status: "unavailable" });
const INVALID_SIGNATURE = () => answer(400, { status: "invalid_signature" });
const INVALID_PAYLOAD = () => answer(400, { status: "invalid_payload" });

/** Reads at most `maxBytes`; null when the body is longer or a declared length is invalid or too large. */
async function readBoundedBytes(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array | null> {
  const declared = request.headers.get("content-length");
  if (
    declared !== null &&
    (!/^\d+$/.test(declared) || Number(declared) > maxBytes)
  )
    return null;
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * The verified bytes as a JSON object, or null. Decoded strictly: bytes that are not UTF-8 are not an event, and
 * nothing is re-serialised — the object stored is the one these bytes parse to.
 */
function parseVerifiedBody(bytes: Uint8Array): Record<string, unknown> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
  } catch {
    return null;
  }
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null;
}

/**
 * The ledger id of a delivery: the provider's own (`x-razorpay-event-id`, the same on every retry and replay of an
 * event), or — where that header is absent or not of the expected shape — a digest of the verified bytes, so the
 * same bytes are the same event again. The header is not covered by the signature: the database keeps a delivery
 * whose id is already held by other content beside it, never over it (0005 `payment_record_event`).
 */
export function ledgerEventId(header: string | null, body: Uint8Array): string {
  if (header !== null && PROVIDER_EVENT_ID_PATTERN.test(header)) return header;
  return `sha256:${createHash("sha256").update(body).digest("hex")}`;
}

export async function handleRazorpayWebhook(
  request: Request,
  deps: WebhookDependencies = defaultDependencies(),
): Promise<Response> {
  if (request.method !== "POST")
    return answer(405, { status: "method_not_allowed" }, { Allow: "POST" });

  const gate = deps.gate();
  if (!gate.open) {
    deps.report(`[webhook] closed (${gate.reason})`);
    return UNAVAILABLE();
  }

  const signature = request.headers.get(SIGNATURE_HEADER);
  if (signature === null || !HMAC_SHA256_HEX_PATTERN.test(signature))
    return INVALID_SIGNATURE();

  let body: Uint8Array | null;
  try {
    body = await readBoundedBytes(request, WEBHOOK_MAX_BODY_BYTES);
  } catch {
    return UNAVAILABLE();
  }
  if (body === null) return answer(413, { status: "too_large" });

  if (
    !verifyWebhookSignature(body, signature, gate.config.razorpayWebhookSecret)
  )
    return INVALID_SIGNATURE();

  // From here the delivery is Razorpay's. It is still only stored if it is an event.
  const parsed = parseVerifiedBody(body);
  const envelope =
    parsed === null ? null : webhookEnvelopeSchema.safeParse(parsed);
  if (parsed === null || envelope === null || !envelope.success) {
    deps.report("[webhook] verified delivery is not an event");
    return INVALID_PAYLOAD();
  }

  const store = deps.store();
  if (!store) {
    deps.report("[webhook] privileged client unavailable");
    return UNAVAILABLE();
  }

  const recorded = await store.recordEvent(
    ledgerEventId(request.headers.get(EVENT_ID_HEADER), body),
    envelope.data.event,
    parsed,
  );
  if (!recorded.ok) {
    deps.report(`[webhook] ledger refused (${recorded.refusal})`);
    return recorded.refusal === "invalid_request"
      ? INVALID_PAYLOAD()
      : UNAVAILABLE();
  }
  if (recorded.value.derived)
    deps.report("[webhook] event id already held by other content");

  // The ledger already shows a final mark: this is the same event again, and its effect is not repeated.
  if (
    recorded.value.processingStatus === "processed" ||
    recorded.value.processingStatus === "ignored"
  )
    return OK();

  const processed = await store.processEvent(recorded.value.eventRowId);
  if (!processed.ok) {
    // The ledger row stays unprocessed and this delivery is NOT acknowledged: Razorpay sends it again.
    deps.report(`[webhook] processing refused (${processed.refusal})`);
    return UNAVAILABLE();
  }
  if (processed.value.outcome.startsWith("review:"))
    deps.report(`[webhook] ${processed.value.outcome}`);
  return OK();
}
