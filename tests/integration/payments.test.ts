import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("server-only", () => ({}));

import { buildSeedPlan } from "../../scripts/testing/lib/catalogue.mjs";
import { readStaffFixtures } from "../../scripts/testing/lib/staff.mjs";
import { resolveTestTarget } from "../../scripts/testing/lib/supabase-target.mjs";

import { orderPageState } from "@/lib/schemas/order-confirmation";
import {
  createCheckoutStore,
  type PendingOrderRequest,
  type RpcCall,
} from "@/lib/server/checkout/store";
import {
  byteaHex,
  createPaymentStore,
  type ObservedPayment,
  type RecordedEvent,
} from "@/lib/server/payments/store";

/**
 * 0005_payment_finalization on the real TEST project (docs/database-changes/S1.7-0005-payment-finalization.md →
 * Verification): the five functions denied to the publishable key AND to a signed-in staff member (role
 * authenticated) by their own EXECUTE grant, with privileged post-checks; one matching `payment.captured` committing
 * the order, its items' stage, the payment's row, one audit row and one unit of pending work together; the same
 * event processed and recorded again changing nothing; REAL concurrent deliveries — of one event, of several events
 * of one capture, of two payments for one order — confirming exactly once; events out of order never moving a
 * payment backwards; every mismatch (amount, currency, an extra payment, a payment id held elsewhere, an order no
 * longer awaiting payment, a capture after the deadline) flagged and audited, never confirmed; unknown references
 * audited against the ledger row with no order guessed; a failure forced in the middle of the confirmation leaving
 * nothing of it; the same event id with other content kept beside the first; the verified Checkout return and the
 * provider check recording, holding and never confirming; the order view answering by the token's hash with no
 * contact and no address. The server's own adapters (src/lib/server/payments/store.ts over the same client as
 * src/lib/server/checkout/store.ts) make the calls, so their parsing is proven against the database's real answers.
 *
 * Since 0006_payment_evidence (the independent review's round 1; docs/database-changes/S1.7-0006-payment-evidence.md)
 * the suite needs 0006 applied as well, and also proves: the ledger keeps the verified bytes exactly and immutably
 * (finding 7); the provider check over every live payment and its money — two live payments, or money that is not the
 * stored intent, are a review no capture clears, with the observed values kept (findings 3 and 4); a signed event
 * that contradicts a payment's recorded money is a review, and a later matching capture never confirms (finding 6);
 * the two replaced signatures are gone and the new ones denied to anon and authenticated.
 *
 * Since 0007_payment_review (the independent review's round 2; docs/database-changes/S1.7-0007-payment-review.md)
 * the suite needs 0007 applied as well — its functions keep 0006's signatures, so no write-free probe tells them
 * apart, and against a 0006 database the 0007 cases fail as plain mismatches — and also proves: a signed failure and
 * a live observation of the same payment are a review no capture clears, in either order and for either listing
 * status (finding 1); the provider check keeps what it saw for every linked attempt — a confirmed order (another
 * payment or other money is a review that keeps the confirmation and its one task), an order under another review,
 * an order no longer awaiting its payment, and after a webhook that committed first — once per distinct observation
 * (finding 2); and the AS-1566 shape — a verified return, the check's hold, then that payment's own capture stored
 * after the deadline — is the late-capture review with no task, its timely twin one confirmation and one task.
 *
 * Orders are made through 0004's own functions, so the suite needs the effective business rule to be OPEN and
 * SYNTHETIC (the S1.6 test rule on TEST). While the rule is CLOSED only the access cases and the migration-text case
 * run and the rest are reported as skipped, never passed. The deadline cases (D-20) need what no function makes
 * without waiting out the rule's window — an order whose deadline has passed, passes within the test, or is missing.
 * business_rules is append-only and shared by every suite and by the Preview, so no rule is written here: such a
 * fixture is made by ONE privileged write to that synthetic order's own row (`newOrder` says which), read back
 * before it is used. Everything else about the order is what 0004's functions wrote.
 *
 * Rows this file writes are synthetic (`synthetic = true`, an `@example.test` address, a `9…` test number, the name
 * "Payments Test <run id>") and are retained history by design: orders and the rows beneath them are append-only or
 * non-deletable, and every key carries the run id, so a second run never meets the first. Each run leaves behind:
 * its orders, each with its consumed AS-#### number, contact, address, items and snapshot — some confirmed, some
 * still pending, some flagged for review; their payment_attempts rows (the checkout row, the payments' own rows and
 * one non-checkout "legacy" row); its provider_events rows (`evt_it_<run id>_…`, the derived `…#<digest>` row
 * included); its audit_log rows (`payment.*`); and one pending_work row per confirmed order. A confirmed order
 * queues one `send_confirmation` task: after each test this file marks the tasks of that test's own orders `done`
 * (by their dedupe key `send_confirmation:order:<order id>`), and `afterAll` reads back that none is left queued —
 * so the S1.8 worker never claims a synthetic order's task. The one foreign pending_work row the atomicity case
 * inserts is deleted by that case. The access cases sign the support fixture in once (a password session, ended
 * afterwards). The before/after counts assume nothing else writes payments on TEST while the suite runs: the
 * Preview's checkout must not be used during `pnpm test`, and the Razorpay Test Mode webhook is switched off for the
 * run — a retry of an earlier delivery would otherwise land in a count and fail it falsely.
 */

const NO_SESSION = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};
const runId = randomBytes(6).toString("hex");
const ZERO_HASH = "0".repeat(64);
const NIL_UUID = "00000000-0000-0000-0000-000000000000";

const target = resolveTestTarget(process.env);
if (!target.ok) throw new Error(target.reasons.join("; "));
const TARGET = target.target;
const privileged = createClient(TARGET.url, TARGET.secretKey, NO_SESSION);
const anon = createClient(TARGET.url, TARGET.publishableKey, NO_SESSION);

const rpc: RpcCall = async (name, args) => {
  const { data, error } = await privileged.rpc(name, args);
  return { data, error: error ? { code: error.code } : null };
};
const checkout = createCheckoutStore(rpc);
const payments = createPaymentStore(rpc);

// The effective rule, exactly as 0004's functions select it.
const ruleRead = await privileged
  .from("business_rules")
  .select(
    "version,sales_open,synthetic,pending_order_expiry_minutes,shipping_paise",
  )
  .lte("effective_from", new Date().toISOString())
  .order("effective_from", { ascending: false })
  .order("version", { ascending: false })
  .limit(1)
  .maybeSingle();
if (ruleRead.error || !ruleRead.data)
  throw new Error(
    `no effective business rule on TEST (${ruleRead.error?.code ?? "no row"}) — run pnpm db:test:seed --apply first`,
  );
const rule = ruleRead.data as {
  version: number;
  sales_open: boolean;
  synthetic: boolean;
  pending_order_expiry_minutes: number;
  shipping_paise: number | null;
};
const OPEN = rule.sales_open && rule.synthetic;
/** How far ahead a "soon" deadline is written: long enough to store a capture in time, short enough to wait out. */
const SOON_SECONDS = 12;

const probe = await privileged.rpc("payment_return_state", {
  p_attempt_hash: ZERO_HASH,
  p_verified_payment_id: null,
});
if (probe.error)
  throw new Error(
    `0005_payment_finalization is not applied on TEST (payment_return_state: ${probe.error.code}) — apply it first (docs/database-changes/S1.7-0005-payment-finalization.md)`,
  );
// 0006's provider check refuses an empty list itself (ZP001); without 0006 PostgREST finds no such signature.
const probe6 = await privileged.rpc("payment_record_provider_check", {
  p_payment_attempt_id: NIL_UUID,
  p_payments: [],
});
if (probe6.error?.code !== "ZP001")
  throw new Error(
    `0006_payment_evidence is not applied on TEST (payment_record_provider_check: ${probe6.error?.code ?? "no refusal"}) — apply it first (docs/database-changes/S1.7-0006-payment-evidence.md)`,
  );

// One purchasable variant of the first seeded artwork — the one the checkout suite never changes.
const plan = buildSeedPlan();
const seededCode = `${plan.artworks[0].slug}:antique-gold`;
const seeded = plan.variants.find((v) => v.variant_code === seededCode);
if (!seeded) throw new Error(`${seededCode} is not in the seed plan`);
const catalogue = await privileged
  .from("variants")
  .select("price_paise,availability,artworks!inner(status)")
  .eq("variant_code", seededCode)
  .maybeSingle();
const onTest = catalogue.data as unknown as {
  price_paise: number | string;
  availability: string;
  artworks: { status: string };
} | null;
if (
  catalogue.error ||
  !onTest ||
  BigInt(onTest.price_paise) !== BigInt(seeded.price_paise) ||
  onTest.availability !== (seeded.availability as string) ||
  onTest.artworks.status !== "Active"
)
  throw new Error(
    `${seededCode} on TEST is missing or differs from the seed (${catalogue.error?.code ?? "its price, its availability or its artwork's status"}) — restore it with pnpm db:test:seed --apply before running this suite`,
  );
const VARIANT = { code: seededCode, price: BigInt(seeded.price_paise) };
const SHIPPING =
  rule.shipping_paise === null ? BigInt(0) : BigInt(rule.shipping_paise);

console.log(
  `[integration] payments: effective rule v${rule.version} is ${OPEN ? "OPEN and synthetic — the payment cases run" : "CLOSED — only the access cases and the migration-text case run; the payment cases are skipped"}.`,
);

const open = describe.skipIf(!OPEN);
const CAPTURED = "payment.captured";
const AUTHORIZED = "payment.authorized";
const FAILED = "payment.failed";
const hex = () => randomBytes(32).toString("hex");
let sequence = 0;
const next = () => String((sequence += 1)).padStart(4, "0");
const paymentId = () => `pay_IT${runId}${next()}`;
const eventIdOf = () => `evt_it_${runId}_${next()}`;
const dedupeKey = (orderId: string) => `send_confirmation:order:${orderId}`;
const ok = <T>(value: T) => ({ ok: true, value });
const refused = (refusal: string) => ({ ok: false, refusal });

type Row = Record<string, unknown>;

/** A privileged read of the rows that match: what is asserted is what the tables hold, not only an answer. */
async function select<T = Row>(
  table: string,
  columns: string,
  match: Row,
  action?: string,
): Promise<T[]> {
  let query = privileged.from(table).select(columns).match(match);
  // Only the audit log is read by action (a LIKE pattern), in the order it was written.
  if (action) query = query.like("action", action).order("created_at");
  const { data, error } = await query;
  expect(error, `${table}: privileged read`).toBeNull();
  return (data ?? []) as unknown as T[];
}

type Order = {
  id: string;
  number: string;
  paId: string;
  providerOrderId: string;
  attemptHash: string;
  tokenHash: string;
  tokenSalt: string;
  total: bigint;
  fields: PendingOrderRequest["fields"];
};

/** The orders of the running test (their confirmation tasks are closed after it) and of the whole run. */
const fresh: string[] = [];
const everyOrder: string[] = [];

type Deadline = "past" | "soon" | "none";

/**
 * A pending checkout order made through 0004's own functions. `link: false` leaves the attempt without its provider
 * order. `deadline` places the order's deadline where no function puts it without waiting out the rule's window —
 * by one privileged write to this synthetic order's own row, measured on the DATABASE's clock (never this machine's):
 *   "past" — orders.expires_at is written as one minute before that clock, before the link: 0004's guard lets a
 *            deadline be set once, and the link leaves a deadline that is already set as it is;
 *   "soon" — the same, SOON_SECONDS after that clock: a capture can be stored in time, and the deadline then passes
 *            within the test;
 *   "none" — the attempt's row is moved requested → linked directly, with the provider order id and creation time the
 *            link would write, so the order is linked and has no deadline: a state the link function never leaves,
 *            which the finalizer must still refuse.
 */
async function newOrder(
  options: { link?: boolean; quantity?: number; deadline?: Deadline } = {},
): Promise<Order> {
  const { link = true, quantity = 1, deadline } = options;
  const n = next();
  const input: PendingOrderRequest = {
    attemptHash: hex(),
    payloadMac: hex(),
    tokenHash: hex(),
    tokenSalt: hex(),
    expectedTotalPaise: VARIANT.price * BigInt(quantity) + SHIPPING,
    fields: {
      name: `Payments Test ${runId}`,
      email: `payments-${runId}-${n}@example.test`,
      phone: "9000000000",
      pincode: "400001",
      line1: `${n} Payments Lane`,
      line2: null,
      city: "Mumbai",
      state: "Maharashtra",
    },
    items: [{ variant_code: VARIANT.code, quantity }],
  };
  const created = await checkout.createPendingOrder(input);
  if (!created.ok) throw new Error(`create refused: ${created.refusal}`);
  const paId = created.value.paymentAttemptId;
  const providerOrderId = `order_IT${runId}${n}`;
  const [{ id }] = await select<{ id: string }>("orders", "id", {
    checkout_attempt_hash: input.attemptHash,
  });
  fresh.push(id);
  everyOrder.push(id);
  if (link) {
    const claim = await checkout.claimProviderCreate(paId);
    if (!claim.ok) throw new Error(`claim refused: ${claim.refusal}`);
    const at = claim.value.serverTime.getTime();
    if (deadline === "none") {
      const direct = await privileged
        .from("payment_attempts")
        .update({
          provider_order_state: "linked",
          provider_order_id: providerOrderId,
          provider_order_created_at: new Date(at).toISOString(),
        })
        .match({ id: paId, provider_order_state: "requested" })
        .select("id");
      if (direct.error || direct.data.length !== 1)
        throw new Error(
          `the fixture's direct link was refused (${direct.error?.code ?? "no row"})`,
        );
    } else {
      if (deadline) {
        const offset = deadline === "past" ? -60_000 : SOON_SECONDS * 1000;
        const written = await privileged
          .from("orders")
          .update({ expires_at: new Date(at + offset).toISOString() })
          .eq("id", id)
          .is("expires_at", null)
          .select("id");
        if (written.error || written.data.length !== 1)
          throw new Error(
            `the fixture's deadline was refused (${written.error?.code ?? "no row"})`,
          );
      }
      const linked = await checkout.linkProviderOrder(
        paId,
        providerOrderId,
        new Date(at),
      );
      if (!linked.ok) throw new Error(`link refused: ${linked.refusal}`);
    }
    // Read back, on the database's clock, that the order is linked and its deadline is where the case needs it.
    const state = await payments.returnState(input.attemptHash, null);
    if (!state.ok || state.value === null)
      throw new Error("the fixture order could not be read back");
    const { expiresAt, serverTime } = state.value;
    const [attempt] = await select<{ provider_order_state: string }>(
      "payment_attempts",
      "provider_order_state",
      { id: paId },
    );
    const placed =
      deadline === "none"
        ? expiresAt === null
        : expiresAt !== null &&
          (deadline === "past") === expiresAt.getTime() < serverTime.getTime();
    if (attempt?.provider_order_state !== "linked" || !placed)
      throw new Error("the fixture order's deadline is not where it must be");
  }
  return {
    id,
    number: created.value.orderNumber,
    paId,
    providerOrderId,
    attemptHash: input.attemptHash,
    tokenHash: input.tokenHash,
    tokenSalt: input.tokenSalt,
    total: input.expectedTotalPaise,
    fields: input.fields,
  };
}

type PaymentFields = {
  id: string;
  orderId: string | null;
  amount: bigint;
  currency?: string;
  /** Raw changes to the payment entity, applied last — the malformed cases. */
  entity?: Row;
};

/** A delivery shaped like Razorpay's: the event, and the payment entity under payload.payment.entity. */
function eventPayload(type: string, fields: PaymentFields): Row {
  const kind = type.replace("payment.", "");
  const at = Math.floor(Date.now() / 1000);
  const entity = {
    id: fields.id,
    entity: "payment",
    amount: Number(fields.amount),
    currency: fields.currency ?? "INR",
    status: kind,
    order_id: fields.orderId,
    captured: kind === "captured",
    method: "upi",
    created_at: at,
    ...fields.entity,
  };
  return {
    entity: "event",
    account_id: "acc_ITPLACEHOLDER01",
    event: type,
    contains: ["payment"],
    payload: { payment: { entity } },
    created_at: at,
  };
}

/** A payment for an order: a new payment id, the order's provider order id and its exact total. */
const pay = (order: Order, overrides: Partial<PaymentFields> = {}) => ({
  id: paymentId(),
  orderId: order.providerOrderId,
  amount: order.total,
  ...overrides,
});

/** One live payment as the provider listed it: the order's own total in INR unless said otherwise. */
const live = (
  o: Order,
  id: string,
  status: ObservedPayment["status"],
  money: { amount?: bigint; currency?: string } = {},
): ObservedPayment => ({
  id,
  status,
  amountPaise: money.amount ?? o.total,
  currency: money.currency ?? "INR",
});

type Delivery = {
  eventId: string;
  /** The ledger row's id. */
  row: string;
  recorded: RecordedEvent;
  outcome: string;
  replayed: boolean;
  payload: Row;
  /** The bytes the delivery arrived as (0006: kept in the ledger exactly). */
  raw: Uint8Array;
};

/** The bytes of a payload as a sender writes it compactly. */
const bytesOf = (payload: Row) =>
  new TextEncoder().encode(JSON.stringify(payload));

/**
 * Records, then processes, one verified delivery — the two calls the webhook makes, through the server's adapter.
 * `raw` is the delivery's bytes (by default the payload written compactly); the payload is their parse.
 */
async function deliverPayload(
  type: string,
  payload: Row,
  eventId = eventIdOf(),
  raw: Uint8Array = bytesOf(payload),
): Promise<Delivery> {
  const recorded = await payments.recordEvent(eventId, type, payload, raw);
  if (!recorded.ok) throw new Error(`record refused: ${recorded.refusal}`);
  const row = recorded.value.eventRowId;
  const processed = await payments.processEvent(row);
  if (!processed.ok) throw new Error(`process refused: ${processed.refusal}`);
  return {
    eventId,
    row,
    recorded: recorded.value,
    ...processed.value,
    payload,
    raw,
  };
}
const deliver = (type: string, fields: PaymentFields, eventId?: string) =>
  deliverPayload(type, eventPayload(type, fields), eventId);
const outcomeOf = async (type: string, fields: PaymentFields) =>
  (await deliver(type, fields)).outcome;

type OrderState = {
  payment_status: string;
  fulfilment_status: string;
  needs_review: boolean;
  payment_hold: string | null;
  confirmed_at: string | null;
  expires_at: string | null;
  version: number;
};
const orderRow = async (id: string) =>
  (
    await select<OrderState>(
      "orders",
      "payment_status,fulfilment_status,needs_review,payment_hold,confirmed_at,expires_at,version",
      { id },
    )
  )[0];
/** Where an order stands: payment status, fulfilment status, the review flag, its hold, and whether it is confirmed. */
const standing = async (id: string) => {
  const o = await orderRow(id);
  return [
    o.payment_status,
    o.fulfilment_status,
    o.needs_review,
    o.payment_hold,
    o.confirmed_at !== null,
  ];
};
const held = (hold: string | null) => [
  "pending",
  "pending_payment",
  true,
  hold,
  false,
];
const PAYABLE = ["pending", "pending_payment", false, null, false];
const FLAGGED = held(null);
const CONFIRMED = ["captured", "confirmed", false, null, true];

const stages = async (orderId: string) =>
  (
    await select<{ stage: number }>("order_items", "stage", {
      order_id: orderId,
    })
  ).map((item) => item.stage);

type Audit = Row & { action: string };
const AUDIT_COLUMNS =
  "actor_type,action,entity_type,entity_id,previous,next,reason,external_ref";
/** An order's payment audit rows, oldest first. */
const audits = (orderId: string, action = "payment.%") =>
  select<Audit>(
    "audit_log",
    AUDIT_COLUMNS,
    { entity_type: "order", entity_id: orderId },
    action,
  );
const actions = async (orderId: string, action?: string) =>
  (await audits(orderId, action)).map((row) => row.action);
const auditsOfPayment = (paymentRef: string) =>
  select<Audit>("audit_log", AUDIT_COLUMNS, { external_ref: paymentRef });

/** Every unit of pending work that names the order, whatever its kind. */
const outbox = (orderId: string) =>
  select(
    "pending_work",
    "kind,entity_type,entity_id,dedupe_key,payload,status",
    {
      entity_type: "order",
      entity_id: orderId,
    },
  );

/** The payment's own row, by the provider's payment id; null when there is none. */
const payRow = async (id: string) =>
  (
    await select(
      "payment_attempts",
      "order_id,provider_order_id,amount_paise,currency,status,signature_verified,provider_order_state",
      { provider_payment_id: id },
    )
  )[0] ?? null;
/** How many payment_attempts rows an order has: its checkout row plus its payments' rows. */
const paymentRowCount = async (orderId: string) =>
  (await select("payment_attempts", "id", { order_id: orderId })).length;

type EventRow = Row & {
  event_id: string;
  received_at: string;
  processed_at: string | null;
};
const eventRow = async (rowId: string) =>
  (
    await select<EventRow>(
      "provider_events",
      "provider,event_id,event_type,signature_ok,payload,received_at,processing_status,processing_note,processed_at",
      { id: rowId },
    )
  )[0];
/** A ledger row's verified bytes as PostgREST answers a bytea (`\x` and hex), or null. */
const rawBodyOf = async (rowId: string) =>
  (
    await select<{ raw_body: string | null }>("provider_events", "raw_body", {
      id: rowId,
    })
  )[0]?.raw_body ?? null;

const COUNTED = [
  "provider_events",
  "audit_log",
  "pending_work",
  "payment_attempts",
] as const;
async function counts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const table of COUNTED) {
    const { count, error } = await privileged
      .from(table)
      .select("*", { count: "exact", head: true });
    expect(error, `${table}: privileged count`).toBeNull();
    out[table] = count ?? -1;
  }
  return out;
}

/** Rows of `table` that match and belong to an order of THIS run — read in chunks, so no request is over-long. */
async function ofThisRun(table: string, key: string, match: Row) {
  const found: Row[] = [];
  for (let i = 0; i < everyOrder.length; i += 40) {
    const { data, error } = await privileged
      .from(table)
      .select(key)
      .match(match)
      .in(key, everyOrder.slice(i, i + 40));
    expect(error, table).toBeNull();
    found.push(...((data ?? []) as unknown as Row[]));
  }
  return found;
}

type Before = { order: OrderState; stages: number[]; outbox: Row[] };
const snapshot = async (order: Order): Promise<Before> => ({
  order: await orderRow(order.id),
  stages: await stages(order.id),
  outbox: await outbox(order.id),
});

/**
 * What every review leaves: the outcome code, the order flagged without a hold and otherwise as it was (never
 * confirmed, never brought back), exactly one audit row of that reason naming the payment and the ledger row, the
 * outbox and the items' stages untouched, and the event marked processed with that outcome.
 */
async function expectReview(
  order: Order,
  reason: string,
  before: Before,
  delivered: Delivery,
  paymentRef: string,
) {
  expect([delivered.outcome, delivered.replayed]).toEqual([
    `review:${reason}`,
    false,
  ]);
  expect(await orderRow(order.id)).toMatchObject({
    payment_status: before.order.payment_status,
    fulfilment_status: before.order.fulfilment_status,
    confirmed_at: before.order.confirmed_at,
    needs_review: true,
    payment_hold: null,
  });
  expect(await audits(order.id, `payment.review.${reason}`)).toMatchObject([
    {
      actor_type: "system",
      action: `payment.review.${reason}`,
      reason,
      external_ref: paymentRef,
      next: { needs_review: true, payment_hold: null, event: delivered.row },
    },
  ]);
  expect(await outbox(order.id)).toEqual(before.outbox);
  expect(await stages(order.id)).toEqual(before.stages);
  expect(await eventRow(delivered.row)).toMatchObject({
    processing_status: "processed",
    processing_note: `review:${reason}`,
  });
}

/** Waits, by the DATABASE's clock, until the order's deadline has passed. */
async function untilPastDeadline(order: Order) {
  for (let tries = 0; tries < 40; tries += 1) {
    const state = await payments.returnState(order.attemptHash, null);
    if (!state.ok || !state.value?.expiresAt)
      throw new Error("the order's deadline could not be read");
    const left =
      state.value.expiresAt.getTime() - state.value.serverTime.getTime();
    if (left < 0) return;
    await new Promise((resolve) => setTimeout(resolve, left + 250));
  }
  throw new Error("the order's deadline did not pass");
}

/** Delivers a matching capture and requires the confirmation. */
async function confirm(order: Order, fields = pay(order)) {
  const delivered = await deliver(CAPTURED, fields);
  expect(delivered.outcome).toBe("confirmed");
  return delivered;
}

// A confirmed order queues one send_confirmation task. The S1.8 worker must never claim a synthetic order's task:
// after each test the tasks of that test's own orders are marked done, by their dedupe keys.
afterEach(async () => {
  const closed = await Promise.all(
    fresh.splice(0).map((orderId) =>
      privileged
        .from("pending_work")
        .update({ status: "done" })
        .match({ dedupe_key: dedupeKey(orderId), status: "queued" }),
    ),
  );
  expect(closed.filter((result) => result.error)).toEqual([]);
});

// Read back for the whole run: no task of a synthetic order is left for a worker.
afterAll(async () => {
  for (const status of ["queued", "claimed"])
    expect(
      await ofThisRun("pending_work", "entity_id", { status }),
      status,
    ).toEqual([]);
});

const DENIED_EVENT = `evt_it_${runId}_denied`;
/** The five functions as the server calls them since 0006 — the ledger step with its bytes, the check with a list. */
const CALLS: Array<[string, Row]> = [
  [
    "payment_record_event",
    {
      p_event_id: DENIED_EVENT,
      p_event_type: CAPTURED,
      p_payload: { entity: "event" },
      p_raw_body: byteaHex(bytesOf({ entity: "event" })),
    },
  ],
  ["payment_process_event", { p_event: NIL_UUID }],
  [
    "payment_return_state",
    { p_attempt_hash: ZERO_HASH, p_verified_payment_id: null },
  ],
  [
    "payment_record_provider_check",
    {
      p_payment_attempt_id: NIL_UUID,
      p_payments: [
        {
          id: "pay_PLACEHOLDER001",
          status: "captured",
          amount_paise: "100",
          currency: "INR",
        },
      ],
    },
  ],
  ["order_confirmation_view", { p_token_hash: ZERO_HASH }],
];

/**
 * The refusal is the FUNCTION's own grant: Postgres names the function. A table's denial carries the same code
 * (42501), so the code alone would also pass with EXECUTE still granted — the tables refuse anon and authenticated
 * too.
 */
function deniedAtTheFunction(
  result: {
    error: { code?: string; message?: string } | null;
    status: number;
    data: unknown;
  },
  name: string,
  statuses: number[],
) {
  expect(result.error?.code, name).toBe("42501");
  expect(result.error?.message ?? "", name).toContain(
    `permission denied for function ${name}`,
  );
  expect(statuses, name).toContain(result.status);
  expect(result.data, name).toBeNull();
}

describe("0005_payment_finalization — access: the publishable key reaches none of the five functions", () => {
  it.each(CALLS)(
    "%s is denied (42501) and writes nothing",
    async (name, args) => {
      const before = await counts();
      deniedAtTheFunction(await anon.rpc(name, args), name, [401, 403]);
      expect(await counts()).toEqual(before);
    },
  );

  it("the denied ledger call stored no event under its id", async () => {
    expect(
      await select("provider_events", "id", { event_id: DENIED_EVENT }),
    ).toEqual([]);
  });
});

describe("0005_payment_finalization — access: a signed-in staff member (role authenticated) reaches none of them either", () => {
  let session: SupabaseClient;

  beforeAll(async () => {
    const fixtures = readStaffFixtures(process.env);
    if (!fixtures.ok)
      throw new Error(
        `the TEST staff fixtures are not configured: ${fixtures.reasons.join("; ")} — set the names in the trusted local process and run pnpm db:test:staff-users --apply`,
      );
    const support = fixtures.fixtures.find((f) => f.role === "support");
    if (!support) throw new Error("no support fixture");
    session = createClient(TARGET.url, TARGET.publishableKey, NO_SESSION);
    const signedIn = await session.auth.signInWithPassword({
      email: support.email,
      password: support.password,
    });
    if (signedIn.error)
      throw new Error(
        `the support fixture could not sign in (${signedIn.error.code ?? signedIn.error.status}) — run pnpm db:test:staff-users --apply, and check that the user is not revoked`,
      );
  });

  // The suite leaves no session behind on TEST.
  afterAll(async () => {
    await session?.auth.signOut({ scope: "local" });
  });

  it.each(CALLS)(
    "%s is denied to the authenticated role by its own grant and writes nothing",
    async (name, args) => {
      const before = await counts();
      deniedAtTheFunction(await session.rpc(name, args), name, [403]);
      expect(await counts()).toEqual(before);
    },
  );
});

describe("0005_payment_finalization — a confirmation never depends on the sales gate", () => {
  // An order created while intake was open must still confirm when its capture arrives after intake has closed.
  // TEST's rule cannot be closed for one test (business_rules is append-only and shared by every suite and by the
  // Preview), so the case is proven here by reading: the function that confirms does not read business_rules at
  // all. The server's own half — the webhook processes payments whatever SALES_MODE says — is
  // tests/unit/payment-verification.test.ts ("paymentsGate").
  it("payment_process_event's body never names business_rules — as 0005 wrote it, and as 0006 and 0007 re-create it", () => {
    for (const file of [
      "../../supabase/migrations/0005_payment_finalization.sql",
      "../../supabase/migrations/0006_payment_evidence.sql",
      "../../supabase/migrations/0007_payment_review.sql",
    ]) {
      const sql = readFileSync(
        fileURLToPath(new URL(file, import.meta.url)),
        "utf8",
      );
      const head = "create or replace function public.payment_process_event";
      const start = sql.indexOf(head);
      expect(start, file).toBeGreaterThan(-1);
      const end = sql.indexOf(
        "create or replace function",
        start + head.length,
      );
      expect(end, file).toBeGreaterThan(start);
      const body = sql.slice(start, end);
      // The slice is the function that confirms, and nothing in it reads the rule.
      expect(body, file).toContain("'payment.captured.confirmed'");
      expect(body, file).toContain("'send_confirmation'");
      expect(body, file).not.toContain("business_rules");
    }
  });
});

open("0005 — a captured payment confirms its order exactly once", () => {
  it("a matching payment.captured commits the order, its items' stage, the payment's row, one audit row and one outbox row", async () => {
    const o = await newOrder({ quantity: 2 });
    const before = await orderRow(o.id);
    expect(await standing(o.id)).toEqual(PAYABLE);
    const fields = pay(o);
    const d = await deliver(CAPTURED, fields);
    expect(d.recorded).toEqual({
      eventRowId: d.row,
      inserted: true,
      derived: false,
      processingStatus: "received",
    });
    expect([d.outcome, d.replayed]).toEqual(["confirmed", false]);

    expect(await standing(o.id)).toEqual(CONFIRMED);
    const order = await orderRow(o.id);
    expect(order.expires_at).toBe(before.expires_at);
    expect(order.version).toBeGreaterThan(before.version);
    expect(await stages(o.id)).toEqual([1]);
    expect(await payRow(fields.id)).toEqual({
      order_id: o.id,
      provider_order_id: o.providerOrderId,
      amount_paise: Number(o.total),
      currency: "INR",
      status: "captured",
      signature_verified: true,
      provider_order_state: null,
    });

    // Exactly these values — statuses, the amount, the ledger row: nothing a customer typed.
    const status = { needs_review: false, payment_hold: null };
    const payment = { status: "captured", amount_paise: Number(o.total) };
    const audit = await audits(o.id);
    expect(audit).toEqual([
      {
        actor_type: "system",
        action: "payment.captured.confirmed",
        entity_type: "order",
        entity_id: o.id,
        previous: {
          payment_status: "pending",
          fulfilment_status: "pending_payment",
          ...status,
        },
        next: {
          payment_status: "captured",
          fulfilment_status: "confirmed",
          ...status,
          payment: { ...payment, currency: "INR" },
          event: d.row,
        },
        reason: "captured_event",
        external_ref: fields.id,
      },
    ]);
    const { email, phone, name, line1 } = o.fields;
    for (const personal of [email, phone, name, line1])
      expect(JSON.stringify(audit)).not.toContain(personal);

    // One unit of pending work, by the order's key; its payload carries no token and no contact.
    expect(await outbox(o.id)).toEqual([
      {
        kind: "send_confirmation",
        entity_type: "order",
        entity_id: o.id,
        dedupe_key: dedupeKey(o.id),
        payload: { v: 1 },
        status: "queued",
      },
    ]);
    const event = await eventRow(d.row);
    expect(event).toMatchObject({
      provider: "razorpay",
      event_id: d.eventId,
      event_type: CAPTURED,
      signature_ok: true,
      payload: d.payload,
      processing_status: "processed",
      processing_note: "confirmed",
    });
    expect(event.processed_at).not.toBeNull();
  });

  it("the same event processed three more times, and recorded three more times, changes nothing", async () => {
    const o = await newOrder();
    const d = await confirm(o);
    const before = { order: await orderRow(o.id), counts: await counts() };
    const again = {
      eventRowId: d.row,
      inserted: false,
      derived: false,
      processingStatus: "processed",
    };
    for (let replay = 0; replay < 3; replay += 1) {
      expect(await payments.processEvent(d.row)).toEqual(
        ok({ outcome: "confirmed", replayed: true }),
      );
      expect(
        await payments.recordEvent(d.eventId, CAPTURED, d.payload, d.raw),
      ).toEqual(ok(again));
    }
    // No new ledger, audit, outbox or payment row, and the order's version did not move.
    expect(await counts()).toEqual(before.counts);
    expect(await orderRow(o.id)).toEqual(before.order);
    expect(await actions(o.id)).toEqual(["payment.captured.confirmed"]);
    expect(await outbox(o.id)).toHaveLength(1);
  });

  it("the publishable key cannot process a real recorded capture or read a real order: nothing moves — the server role then confirms it", async () => {
    const o = await newOrder();
    const payload = eventPayload(CAPTURED, pay(o));
    const recorded = await payments.recordEvent(
      eventIdOf(),
      CAPTURED,
      payload,
      bytesOf(payload),
    );
    if (!recorded.ok) throw new Error(`record refused: ${recorded.refusal}`);
    const row = recorded.value.eventRowId;
    const before = { order: await orderRow(o.id), counts: await counts() };

    const processed = await anon.rpc("payment_process_event", { p_event: row });
    deniedAtTheFunction(processed, "payment_process_event", [401, 403]);
    const view = await anon.rpc("order_confirmation_view", {
      p_token_hash: o.tokenHash,
    });
    deniedAtTheFunction(view, "order_confirmation_view", [401, 403]);
    expect(await counts()).toEqual(before.counts);
    expect(await orderRow(o.id)).toEqual(before.order);
    expect(await eventRow(row)).toMatchObject({
      processing_status: "received",
      processed_at: null,
    });

    expect(await payments.processEvent(row)).toEqual(
      ok({ outcome: "confirmed", replayed: false }),
    );
    expect(await standing(o.id)).toEqual(CONFIRMED);
  });
});

open("0005 — REAL concurrency", () => {
  it("eight simultaneous deliveries of ONE event confirm once: one ledger row, one audit row, one outbox row", async () => {
    const o = await newOrder();
    const eventId = eventIdOf();
    const fields = pay(o);
    const payload = eventPayload(CAPTURED, fields);
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        deliverPayload(CAPTURED, payload, eventId),
      ),
    );
    expect(new Set(results.map((r) => r.row)).size).toBe(1);
    expect(results.filter((r) => r.recorded.inserted)).toHaveLength(1);
    expect(results.filter((r) => r.recorded.derived)).toEqual([]);
    expect(results.map((r) => r.outcome)).toEqual(Array(8).fill("confirmed"));
    expect(results.filter((r) => !r.replayed)).toHaveLength(1);

    expect(
      await select("provider_events", "id", { event_id: eventId }),
    ).toHaveLength(1);
    expect(await standing(o.id)).toEqual(CONFIRMED);
    expect(await actions(o.id)).toEqual(["payment.captured.confirmed"]);
    expect(await outbox(o.id)).toHaveLength(1);
    expect(await paymentRowCount(o.id)).toBe(2);
    expect(await payRow(fields.id)).toMatchObject({ status: "captured" });
  });

  it("six DIFFERENT events of the same capture, at once: one confirmation, the others duplicate_capture", async () => {
    const o = await newOrder();
    const fields = pay(o);
    const results = await Promise.all(
      Array.from({ length: 6 }, () => deliver(CAPTURED, fields)),
    );
    expect(new Set(results.map((r) => r.row)).size).toBe(6);
    expect(results.map((r) => r.outcome).sort()).toEqual([
      "confirmed",
      ...Array(5).fill("duplicate_capture"),
    ]);
    expect(await standing(o.id)).toEqual(CONFIRMED);
    expect(await actions(o.id)).toEqual(["payment.captured.confirmed"]);
    expect(await outbox(o.id)).toHaveLength(1);
    expect(await paymentRowCount(o.id)).toBe(2);
    expect(await stages(o.id)).toEqual([1]);
  });

  it("two different payments captured at once for one order: exactly one confirms, the other is an extra payment", async () => {
    const o = await newOrder();
    const [first, second] = [pay(o), pay(o)];
    const results = await Promise.all([
      deliver(CAPTURED, first),
      deliver(CAPTURED, second),
    ]);
    // Which one won is the database's choice; that exactly one did is the rule.
    expect(results.map((r) => r.outcome).sort()).toEqual([
      "confirmed",
      "review:extra_payment",
    ]);
    // Confirmed once, and flagged for the second payment.
    const flaggedConfirmed = ["captured", "confirmed", true, null, true];
    expect(await standing(o.id)).toEqual(flaggedConfirmed);
    expect((await actions(o.id)).sort()).toEqual([
      "payment.captured.confirmed",
      "payment.review.extra_payment",
    ]);
    expect(await outbox(o.id)).toHaveLength(1);
    // Both payments are on record as captured: the extra one is evidence, never a second confirmation.
    expect(await payRow(first.id)).toMatchObject({ status: "captured" });
    expect(await payRow(second.id)).toMatchObject({ status: "captured" });
  });
});

open("0005 — out of order: a payment's row only moves forward", () => {
  it("authorised, then captured: the hold is raised, and its own capture confirms and clears it", async () => {
    const o = await newOrder();
    const fields = pay(o);
    expect(await outcomeOf(AUTHORIZED, fields)).toBe("hold:authorized_only");
    expect(await standing(o.id)).toEqual(held("authorized_only"));
    expect(await payRow(fields.id)).toMatchObject({
      status: "authorized",
      signature_verified: true,
    });
    expect(await outbox(o.id)).toEqual([]);
    expect(await stages(o.id)).toEqual([0]);

    await confirm(o, fields);
    expect(await standing(o.id)).toEqual(CONFIRMED);
    expect(await payRow(fields.id)).toMatchObject({ status: "captured" });
    expect(await actions(o.id)).toEqual([
      "payment.hold.authorized_only",
      "payment.captured.confirmed",
    ]);
    expect(await outbox(o.id)).toHaveLength(1);
  });

  it("captured, then authorised, then failed: both late events are stale and nothing changes", async () => {
    const o = await newOrder();
    const fields = pay(o);
    await confirm(o, fields);
    const before = { order: await orderRow(o.id), counts: await counts() };
    expect(await outcomeOf(AUTHORIZED, fields)).toBe("stale_authorized");
    expect(await outcomeOf(FAILED, fields)).toBe("stale_failed");
    expect(await orderRow(o.id)).toEqual(before.order);
    expect(await payRow(fields.id)).toMatchObject({ status: "captured" });
    expect(await stages(o.id)).toEqual([1]);
    // Only the two late events' own ledger rows are new.
    expect(await counts()).toEqual({
      ...before.counts,
      provider_events: before.counts.provider_events + 2,
    });
  });

  it("failed, then captured: the failure leaves the order payable, and the capture confirms it", async () => {
    const o = await newOrder();
    const fields = pay(o);
    const before = await orderRow(o.id);
    expect(await outcomeOf(FAILED, fields)).toBe("recorded:failed");
    expect(await orderRow(o.id)).toEqual(before);
    expect(await payRow(fields.id)).toMatchObject({ status: "failed" });
    expect(await audits(o.id)).toEqual([]);
    expect(await outbox(o.id)).toEqual([]);

    await confirm(o, fields);
    expect(await standing(o.id)).toEqual(CONFIRMED);
    expect(await payRow(fields.id)).toMatchObject({ status: "captured" });
    expect(await outbox(o.id)).toHaveLength(1);
  });
});

open("0005 — reviews, never confirmations", () => {
  /** Puts the order into a state it is never brought back from. */
  const set = (change: Row) => async (o: Order) => {
    const changed = privileged.from("orders").update(change).eq("id", o.id);
    expect((await changed).error).toBeNull();
    return {};
  };
  const secondAuthorisation = async (o: Order) => {
    expect(await outcomeOf(AUTHORIZED, pay(o))).toBe("hold:authorized_only");
    return {};
  };
  type Prepare = (o: Order) => Promise<Partial<PaymentFields>>;
  const paid = "a capture for an order whose payment status is";

  it.each<[string, string, string, Prepare]>([
    [
      "a capture of the wrong amount",
      "amount_mismatch",
      CAPTURED,
      async (o) => ({ amount: o.total - BigInt(100) }),
    ],
    [
      "a capture in another currency",
      "currency_mismatch",
      CAPTURED,
      async () => ({ currency: "USD" }),
    ],
    [
      "an authorisation of the wrong amount",
      "amount_mismatch",
      AUTHORIZED,
      async (o) => ({ amount: o.total + BigInt(500) }),
    ],
    [
      "a second authorised payment",
      "extra_payment",
      AUTHORIZED,
      secondAuthorisation,
    ],
    [
      `${paid} expired`,
      "order_not_payable",
      CAPTURED,
      set({ payment_status: "expired" }),
    ],
    [
      `${paid} failed`,
      "order_not_payable",
      CAPTURED,
      set({ payment_status: "failed" }),
    ],
    [
      "a capture for an order that was cancelled",
      "order_not_payable",
      CAPTURED,
      set({ fulfilment_status: "cancelled" }),
    ],
  ])(
    "%s is flagged (%s), audited once and never confirmed",
    async (_label, reason, type, prepare) => {
      const o = await newOrder();
      const fields = pay(o, await prepare(o));
      const before = await snapshot(o);
      expect([before.outbox, before.stages]).toEqual([[], [0]]);
      const d = await deliver(type, fields);
      await expectReview(o, reason, before, d, fields.id);
      // Never brought back, never confirmed: no confirmation row of any kind exists.
      expect(await audits(o.id, "payment.captured.%")).toEqual([]);
    },
  );

  it("a wrong amount is kept on the payment's row, a wrong currency writes no row, and a later valid capture bypasses neither", async () => {
    const short = await newOrder();
    const underpaid = pay(short, { amount: short.total - BigInt(100) });
    await deliver(CAPTURED, underpaid);
    expect(await payRow(underpaid.id)).toMatchObject({
      status: "captured",
      amount_paise: Number(underpaid.amount),
    });
    expect(await outcomeOf(CAPTURED, pay(short))).toBe("review:extra_payment");

    const foreign = await newOrder();
    const inDollars = pay(foreign, { currency: "USD" });
    await deliver(CAPTURED, inDollars);
    expect(await payRow(inDollars.id)).toBeNull();
    expect(await outcomeOf(CAPTURED, pay(foreign))).toBe(
      "review:order_under_review",
    );

    for (const o of [short, foreign]) {
      expect(await standing(o.id)).toEqual(FLAGGED);
      expect(await outbox(o.id)).toEqual([]);
      expect(await stages(o.id)).toEqual([0]);
    }
  });

  it("an event a payment's existing row cannot hold leaves that row exactly as it was — never advanced under its old amount and currency", async () => {
    const o = await newOrder();
    const id = paymentId();
    // The verified return recorded the payment as reported, with the order's amount in INR.
    expect((await payments.returnState(o.attemptHash, id)).ok).toBe(true);
    const reported = await payRow(id);
    expect(reported).toMatchObject({ status: "created", currency: "INR" });
    const before = await snapshot(o);
    const d = await deliver(CAPTURED, pay(o, { id, currency: "USD" }));
    await expectReview(o, "currency_mismatch", before, d, id);
    expect(await payRow(id)).toEqual(reported);
    const tooMuch = pay(o, { id, amount: BigInt("100000000001") });
    expect(await outcomeOf(CAPTURED, tooMuch)).toBe("review:amount_mismatch");
    expect(await payRow(id)).toEqual(reported);
    expect(await outbox(o.id)).toEqual([]);
  });

  it("a payment reported by a verified return is live: the capture of another payment beside it is an extra payment, never the confirmation", async () => {
    const o = await newOrder();
    const reportedId = paymentId();
    expect((await payments.returnState(o.attemptHash, reportedId)).ok).toBe(
      true,
    );
    const before = await snapshot(o);
    const other = pay(o);
    const d = await deliver(CAPTURED, other);
    await expectReview(o, "extra_payment", before, d, other.id);
    expect(await standing(o.id)).toEqual(FLAGGED);
    expect(await outbox(o.id)).toEqual([]);
  });

  it("an extra payment on a confirmed order flags it; the order stays confirmed with its one outbox row", async () => {
    const o = await newOrder();
    await confirm(o);
    const before = await snapshot(o);
    expect(before.outbox).toHaveLength(1);
    expect(before.stages).toEqual([1]);
    const extra = pay(o);
    const d = await deliver(CAPTURED, extra);
    await expectReview(o, "extra_payment", before, d, extra.id);
    expect(await payRow(extra.id)).toMatchObject({ status: "captured" });
    expect(await audits(o.id, "payment.captured.%")).toHaveLength(1);
  });

  it("a payment id that sits on another order's row is never rebound: the event's order is flagged, the row stays where it was", async () => {
    const owner = await newOrder();
    const o = await newOrder();
    const taken = pay(owner);
    await deliver(AUTHORIZED, taken);
    const before = await snapshot(o);
    const d = await deliver(CAPTURED, pay(o, { id: taken.id }));
    await expectReview(o, "payment_conflict", before, d, taken.id);
    expect(await payRow(taken.id)).toMatchObject({
      order_id: owner.id,
      provider_order_id: owner.providerOrderId,
      status: "authorized",
    });
    expect(await paymentRowCount(o.id)).toBe(1);
    expect(await audits(owner.id, "payment.review.%")).toEqual([]);
  });

  it("with two authorised payments, the capture of either stays a review", async () => {
    const o = await newOrder();
    const first = pay(o);
    await deliver(AUTHORIZED, first);
    await deliver(AUTHORIZED, pay(o));
    expect(await outcomeOf(CAPTURED, first)).toBe("review:extra_payment");
    expect(await standing(o.id)).toEqual(FLAGGED);
    expect(await outbox(o.id)).toEqual([]);
    expect(await stages(o.id)).toEqual([0]);
  });
});

open("0005 — unknown references", () => {
  const flaggedOfThisRun = async () =>
    (await ofThisRun("orders", "id", { needs_review: true })).length;
  const unknownOrderId = () => `order_IT${runId}UNK${next()}`;

  it("a capture for a provider order no checkout row holds is audited against its ledger row; no order is flagged or guessed", async () => {
    // A payable order of the very same amount stands by: nothing is matched by amount or time.
    const bystander = await newOrder();
    const before = await snapshot(bystander);
    const flagged = await flaggedOfThisRun();
    const orderId = unknownOrderId();
    const fields = { id: paymentId(), orderId, amount: bystander.total };
    const d = await deliver(CAPTURED, fields);
    expect(d.outcome).toBe("review:unknown_reference");
    const payment = { status: "captured", amount_paise: Number(fields.amount) };
    expect(await auditsOfPayment(fields.id)).toEqual([
      {
        actor_type: "system",
        action: "payment.review.unknown_reference",
        entity_type: "provider_event",
        entity_id: d.row,
        previous: null,
        next: {
          payment: { ...payment, currency: "INR" },
          provider_order_id: orderId,
          unlinked_rows: 0,
        },
        reason: "unknown_reference",
        external_ref: fields.id,
      },
    ]);
    expect(await flaggedOfThisRun()).toBe(flagged);
    expect(await snapshot(bystander)).toEqual(before);
    expect(await payRow(fields.id)).toBeNull();
    expect(await eventRow(d.row)).toMatchObject({
      processing_status: "processed",
      processing_note: "review:unknown_reference",
    });
  });

  it("a failed event for an unknown order is ignored: its ledger row is the only thing written", async () => {
    const before = await counts();
    const orderId = unknownOrderId();
    const fields = { id: paymentId(), orderId, amount: VARIANT.price };
    const d = await deliver(FAILED, fields);
    expect(d.outcome).toBe("unknown_reference");
    expect(await eventRow(d.row)).toMatchObject({
      processing_status: "ignored",
      processing_note: "unknown_reference",
    });
    expect(await counts()).toEqual({
      ...before,
      provider_events: before.provider_events + 1,
    });
  });

  it("an ambiguous legacy row never matches, and neither does an attempt that was never linked", async () => {
    const o = await newOrder({ link: false });
    // A non-checkout row that carries a provider order id: not a checkout's own row, so never the match.
    const orderId = `order_IT${runId}LEG${next()}`;
    const legacy = await privileged.from("payment_attempts").insert({
      order_id: o.id,
      provider: "razorpay",
      provider_order_id: orderId,
      amount_paise: Number(o.total),
      currency: "INR",
      status: "created",
    });
    expect(legacy.error).toBeNull();
    const before = await snapshot(o);

    const fields = { id: paymentId(), orderId, amount: o.total };
    const d = await deliver(CAPTURED, fields);
    expect(d.outcome).toBe("review:unknown_reference");
    expect(await auditsOfPayment(fields.id)).toMatchObject([
      {
        action: "payment.review.unknown_reference",
        entity_type: "provider_event",
        entity_id: d.row,
        next: { provider_order_id: orderId, unlinked_rows: 1 },
      },
    ]);

    // The id the attempt would have been linked with: it never was, so no checkout row holds it.
    const never = pay(o);
    expect(await outcomeOf(CAPTURED, never)).toBe("review:unknown_reference");
    expect(await auditsOfPayment(never.id)).toMatchObject([
      { entity_type: "provider_event", next: { unlinked_rows: 0 } },
    ]);

    expect(await snapshot(o)).toEqual(before);
    expect(await standing(o.id)).toEqual(PAYABLE);
    expect(await audits(o.id)).toEqual([]);
    expect(await payRow(fields.id)).toBeNull();
    expect(await payRow(never.id)).toBeNull();
  });
});

open("0005 — the deadline (D-20)", () => {
  const time = (value: string | null) => Date.parse(value as string);

  it("a capture stored within the order's deadline confirms", async () => {
    const o = await newOrder();
    const { expires_at } = await orderRow(o.id);
    expect(expires_at).not.toBeNull();
    const d = await confirm(o);
    // The event's ledger time — the database's clock when it was stored — does not pass the deadline.
    const { received_at } = await eventRow(d.row);
    expect(time(received_at)).toBeLessThanOrEqual(time(expires_at));
    expect(await standing(o.id)).toEqual(CONFIRMED);
  });

  it("a capture stored after the deadline is review-only: recorded as captured, the order never confirmed", async () => {
    const o = await newOrder({ deadline: "past" });
    const before = await snapshot(o);
    expect([before.outbox, before.stages]).toEqual([[], [0]]);
    const fields = pay(o);
    const d = await deliver(CAPTURED, fields);
    const { received_at } = await eventRow(d.row);
    expect(time(received_at)).toBeGreaterThan(time(before.order.expires_at));
    await expectReview(o, "late_capture", before, d, fields.id);
    expect(await payRow(fields.id)).toMatchObject({ status: "captured" });
    // Another event of that capture is a duplicate, never a second chance.
    expect(await outcomeOf(CAPTURED, fields)).toBe("duplicate_capture");
    expect(await standing(o.id)).toEqual(FLAGGED);
    expect(await outbox(o.id)).toEqual([]);
  });

  it("an authorisation after the deadline is held; its capture is late, and the hold becomes a review", async () => {
    const o = await newOrder({ deadline: "past" });
    const fields = pay(o);
    expect(await outcomeOf(AUTHORIZED, fields)).toBe("hold:authorized_only");
    const before = await snapshot(o);
    expect(before.order.payment_hold).toBe("authorized_only");
    const d = await deliver(CAPTURED, fields);
    await expectReview(o, "late_capture", before, d, fields.id);
    expect(await standing(o.id)).toEqual(FLAGGED);
    // What the checkout reads for this order (the review of 2026-11-26, finding 1): pending, flagged, no hold — and a
    // captured payment on record, so the checkout answers "being confirmed", never "held" beside a usable form.
    const read = await payments.returnState(o.attemptHash, null);
    expect(read.ok && read.value).toMatchObject({
      paymentStatus: "pending",
      needsReview: true,
      paymentHold: null,
      payments: { reported: 0, authorized: 0, captured: 1, failed: 0 },
    });
  });

  it("a linked order with no deadline is never payable without limit: its capture is a review", async () => {
    const o = await newOrder({ deadline: "none" });
    const before = await snapshot(o);
    expect(before.order.expires_at).toBeNull();
    expect([before.outbox, before.stages]).toEqual([[], [0]]);
    const fields = pay(o);
    const d = await deliver(CAPTURED, fields);
    await expectReview(o, "expiry_missing", before, d, fields.id);
    expect(await payRow(fields.id)).toMatchObject({ status: "captured" });
    expect(await standing(o.id)).toEqual(FLAGGED);
    expect(await outbox(o.id)).toEqual([]);
  });

  it(
    "an order confirmed in time stays confirmed when another event of its capture is stored after the deadline",
    { timeout: 90_000 },
    async () => {
      const o = await newOrder({ deadline: "soon" });
      const fields = pay(o);
      const first = await confirm(o, fields);
      const before = await snapshot(o);
      const deadline = time(before.order.expires_at);
      expect(time((await eventRow(first.row)).received_at)).toBeLessThanOrEqual(
        deadline,
      );
      expect(await standing(o.id)).toEqual(CONFIRMED);

      await untilPastDeadline(o);

      // Another event of the same capture (its own event id), stored after the deadline: a duplicate, no review.
      const again = await deliver(CAPTURED, fields);
      expect(time((await eventRow(again.row)).received_at)).toBeGreaterThan(
        deadline,
      );
      expect([again.outcome, again.replayed]).toEqual([
        "duplicate_capture",
        false,
      ]);
      // And an older event of it, later still, is stale. Nothing of the order moved: not its version either.
      expect(await outcomeOf(AUTHORIZED, fields)).toBe("stale_authorized");
      expect(await snapshot(o)).toEqual(before);
      expect(await actions(o.id)).toEqual(["payment.captured.confirmed"]);
    },
  );
});

open("0005 — atomicity, by a real forced failure", () => {
  it("a foreign row under the order's outbox key stops the confirmation whole; once it is gone, the same event confirms", async () => {
    const o = await newOrder();
    const key = dedupeKey(o.id);
    const blocker = await privileged.from("pending_work").insert({
      kind: "other_work",
      entity_type: "order",
      entity_id: o.id,
      dedupe_key: key,
      payload: {},
      status: "done",
    });
    expect(blocker.error).toBeNull();
    const remove = () =>
      privileged
        .from("pending_work")
        .delete()
        .match({ dedupe_key: key, kind: "other_work" })
        .select("id");
    try {
      const before = await snapshot(o);
      expect(before.outbox).toMatchObject([{ kind: "other_work" }]);
      const fields = pay(o);
      const payload = eventPayload(CAPTURED, fields);
      const recorded = await payments.recordEvent(
        eventIdOf(),
        CAPTURED,
        payload,
        bytesOf(payload),
      );
      if (!recorded.ok) throw new Error(`record refused: ${recorded.refusal}`);
      const row = recorded.value.eventRowId;

      // The order, its items, the payment's row and the audit row are written BEFORE the outbox step fails.
      expect(await payments.processEvent(row)).toEqual(
        refused("outbox_conflict"),
      );
      // Nothing of the confirmation is there: the order with the same version, the items' stage and the outbox as
      // they were, no payment row, no audit row, and the event still unprocessed.
      expect(await snapshot(o)).toEqual(before);
      expect(await standing(o.id)).toEqual(PAYABLE);
      expect(before.stages).toEqual([0]);
      expect(await payRow(fields.id)).toBeNull();
      expect(await paymentRowCount(o.id)).toBe(1);
      expect(await audits(o.id)).toEqual([]);
      expect(await eventRow(row)).toMatchObject({
        processing_status: "received",
        processing_note: null,
        processed_at: null,
      });

      const removed = await remove();
      expect(removed.error).toBeNull();
      expect(removed.data).toHaveLength(1);
      expect(await payments.processEvent(row)).toEqual(
        ok({ outcome: "confirmed", replayed: false }),
      );
      expect(await standing(o.id)).toEqual(CONFIRMED);
      expect(await stages(o.id)).toEqual([1]);
      expect(await payRow(fields.id)).toMatchObject({ status: "captured" });
      expect(await outbox(o.id)).toMatchObject([
        { kind: "send_confirmation", dedupe_key: key },
      ]);
    } finally {
      // A no-op when the case removed it; it is never left behind when the case fails early.
      await remove();
    }
  });
});

open("0005 — event identity", () => {
  it("the same event id with other content is stored beside the first under <id>#<digest>, and both are processed", async () => {
    const a = await newOrder();
    const b = await newOrder();
    const eventId = eventIdOf();
    const first = await deliver(CAPTURED, pay(a), eventId);
    const second = await deliver(CAPTURED, pay(b), eventId);
    expect(first.recorded).toMatchObject({ inserted: true, derived: false });
    expect(second.recorded).toMatchObject({ inserted: true, derived: true });
    expect(second.row).not.toBe(first.row);
    expect([first.outcome, second.outcome]).toEqual(["confirmed", "confirmed"]);

    // The first row is untouched; the second sits beside it, named after its own content.
    expect(await eventRow(first.row)).toMatchObject({
      event_id: eventId,
      payload: first.payload,
      processing_status: "processed",
    });
    const beside = await eventRow(second.row);
    expect(beside.event_id).toMatch(new RegExp(`^${eventId}#[0-9a-f]{32}$`));
    expect(beside).toMatchObject({
      signature_ok: true,
      payload: second.payload,
      processing_status: "processed",
      processing_note: "confirmed",
    });
    expect(await standing(a.id)).toEqual(CONFIRMED);
    expect(await standing(b.id)).toEqual(CONFIRMED);

    // The conflicting delivery again is that same derived row: nothing new is stored.
    const again = {
      eventRowId: second.row,
      inserted: false,
      derived: true,
      processingStatus: "processed",
    };
    expect(
      await payments.recordEvent(eventId, CAPTURED, second.payload, second.raw),
    ).toEqual(ok(again));
  });
});

open("0005 — unsupported and malformed events", () => {
  it("order.paid is not authority, and a payment.captured without an id, with a string amount or with status authorised is malformed: the order is untouched", async () => {
    const o = await newOrder();
    const before = await snapshot(o);
    const ignored = (note: string) => ({
      processing_status: "ignored",
      processing_note: note,
    });

    const paid = await deliverPayload("order.paid", {
      ...eventPayload(CAPTURED, pay(o)),
      event: "order.paid",
    });
    expect([paid.outcome, paid.replayed]).toEqual(["unsupported_event", false]);
    expect(await eventRow(paid.row)).toMatchObject({
      event_type: "order.paid",
      ...ignored("unsupported_event"),
    });

    for (const [label, entity] of [
      ["no payment id", { id: undefined }],
      ["a string amount", { amount: String(o.total) }],
      ["status authorised", { status: "authorized", captured: false }],
    ] as const) {
      const d = await deliver(CAPTURED, pay(o, { entity }));
      expect(d.outcome, label).toBe("malformed_payment");
      expect(await eventRow(d.row), label).toMatchObject(
        ignored("malformed_payment"),
      );
    }

    expect(await snapshot(o)).toEqual(before);
    expect(await standing(o.id)).toEqual(PAYABLE);
    expect(await audits(o.id)).toEqual([]);
    expect(await paymentRowCount(o.id)).toBe(1);
  });
});

open("0005 — payment_return_state: the verified Checkout return", () => {
  const NONE = { reported: 0, authorized: 0, captured: 0, failed: 0 };

  it("answers null for an unknown attempt, with or without a payment id, and refuses a malformed hash", async () => {
    expect(await payments.returnState(hex(), null)).toEqual(ok(null));
    expect(await payments.returnState(hex(), paymentId())).toEqual(ok(null));
    expect(await payments.returnState("not-a-hash", null)).toEqual(
      refused("invalid_request"),
    );
  });

  it("a verified return records the payment as reported — once, with one audit row — and confirms nothing; its capture then confirms", async () => {
    const o = await newOrder();
    const idle = await payments.returnState(o.attemptHash, null);
    // The link material is the order's own: the hash and the salt it was created with.
    expect(idle.ok && idle.value).toMatchObject({
      orderNumber: o.number,
      paymentStatus: "pending",
      fulfilmentStatus: "pending_payment",
      needsReview: false,
      paymentHold: null,
      tokenHash: o.tokenHash,
      tokenSalt: o.tokenSalt,
      payments: NONE,
      recorded: false,
    });

    const before = await snapshot(o);
    const id = paymentId();
    const returned = await payments.returnState(o.attemptHash, id);
    expect(returned.ok && returned.value).toMatchObject({
      paymentStatus: "pending",
      tokenHash: o.tokenHash,
      payments: { ...NONE, reported: 1 },
      recorded: true,
    });
    expect(await payRow(id)).toEqual({
      order_id: o.id,
      provider_order_id: o.providerOrderId,
      amount_paise: Number(o.total),
      currency: "INR",
      status: "created",
      signature_verified: true,
      provider_order_state: null,
    });
    // The order — its version included — its items and the outbox are exactly as they were: nothing is confirmed.
    expect(await snapshot(o)).toEqual(before);
    expect(await standing(o.id)).toEqual(PAYABLE);
    expect([before.outbox, before.stages]).toEqual([[], [0]]);
    expect(await audits(o.id)).toEqual([
      {
        actor_type: "system",
        action: "payment.return.verified",
        entity_type: "order",
        entity_id: o.id,
        previous: null,
        next: { payment_status: "pending", payment: { status: "created" } },
        reason: "checkout_signature",
        external_ref: id,
      },
    ]);

    const again = await payments.returnState(o.attemptHash, id);
    expect(again.ok && again.value).toMatchObject({
      payments: { ...NONE, reported: 1 },
      recorded: false,
    });
    expect(await audits(o.id)).toHaveLength(1);
    expect(await paymentRowCount(o.id)).toBe(2);

    await confirm(o, pay(o, { id }));
    expect(await payRow(id)).toMatchObject({
      status: "captured",
      signature_verified: true,
    });
    const after = await payments.returnState(o.attemptHash, null);
    expect(after.ok && after.value).toMatchObject({
      paymentStatus: "captured",
      fulfilmentStatus: "confirmed",
      needsReview: false,
      payments: { ...NONE, captured: 1 },
    });
  });

  it("a payment id held by another order is refused and writes nothing; an attempt that was never linked is refused too", async () => {
    const owner = await newOrder();
    const o = await newOrder();
    const unlinked = await newOrder({ link: false });
    const id = paymentId();
    const recorded = await payments.returnState(owner.attemptHash, id);
    expect(recorded.ok && recorded.value?.recorded).toBe(true);

    const before = { counts: await counts(), order: await snapshot(o) };
    expect(await payments.returnState(o.attemptHash, id)).toEqual(
      refused("payment_conflict"),
    );
    const other = paymentId();
    expect(await payments.returnState(unlinked.attemptHash, other)).toEqual(
      refused("state_conflict"),
    );
    expect(await counts()).toEqual(before.counts);
    expect(await snapshot(o)).toEqual(before.order);
    expect(await audits(o.id)).toEqual([]);
    expect(await paymentRowCount(o.id)).toBe(1);
    expect(await payRow(id)).toMatchObject({ order_id: owner.id });
    expect(await payRow(other)).toBeNull();
    expect(await audits(unlinked.id)).toEqual([]);
    // Without a payment id the unlinked attempt's state is still readable: nothing is asked to be recorded.
    const state = await payments.returnState(unlinked.attemptHash, null);
    expect(state.ok && state.value).toMatchObject({
      orderNumber: unlinked.number,
      expiresAt: null,
      recorded: false,
    });
  });
});

open("0005 — payment_record_provider_check: a hold, no more", () => {
  type Answer = "captured" | "authorized";
  /** What the adapter answers: whether a hold was raised now, the payment status, the review flag and the hold. */
  const check = async (o: Order, id: string, status: Answer) => {
    const result = await payments.recordProviderCheck(o.paId, [
      live(o, id, status),
    ]);
    if (!result.ok) throw new Error(`check refused: ${result.refusal}`);
    const { paymentStatus, needsReview, paymentHold } = result.value;
    return [result.value.held, paymentStatus, needsReview, paymentHold];
  };

  it("a captured answer raises the capture_unverified hold with one audit row and records that payment as known; the signed event then confirms and clears it", async () => {
    const o = await newOrder();
    const id = paymentId();
    const hold = "capture_unverified";
    const first = await check(o, id, "captured");
    expect(first).toEqual([true, "pending", true, hold]);
    expect(await standing(o.id)).toEqual(held(hold));
    // The audit row carries the money the provider observed (0006).
    const payment = {
      status: "captured",
      amount_paise: Number(o.total),
      currency: "INR",
    };
    expect(await audits(o.id)).toEqual([
      {
        actor_type: "system",
        action: "payment.hold.capture_unverified",
        entity_type: "order",
        entity_id: o.id,
        previous: { needs_review: false, payment_hold: null },
        next: { needs_review: true, payment_hold: hold, payment },
        reason: "provider_check",
        external_ref: id,
      },
    ]);
    // An API answer records the payment it showed as known — never authorised, captured or paid — and is not a
    // confirmation: no queue row, no stage moved.
    expect(await payRow(id)).toEqual({
      order_id: o.id,
      provider_order_id: o.providerOrderId,
      amount_paise: Number(o.total),
      currency: "INR",
      status: "created",
      signature_verified: false,
      provider_order_state: null,
    });
    expect(await paymentRowCount(o.id)).toBe(2);
    expect(await outbox(o.id)).toEqual([]);
    expect(await stages(o.id)).toEqual([0]);

    // The same answer again changes nothing.
    const second = await check(o, id, "captured");
    expect(second).toEqual([false, "pending", true, hold]);
    expect(await audits(o.id)).toHaveLength(1);
    expect(await paymentRowCount(o.id)).toBe(2);

    await confirm(o, pay(o, { id }));
    expect(await standing(o.id)).toEqual(CONFIRMED);
    expect(await outbox(o.id)).toHaveLength(1);

    // A confirmed order is never held.
    const before = await counts();
    const third = await check(o, id, "captured");
    expect(third).toEqual([false, "captured", false, null]);
    expect(await counts()).toEqual(before);
  });

  it("an authorised answer holds as authorized_only; a captured answer replaces it; an authorised answer never replaces captured", async () => {
    const o = await newOrder();
    const id = paymentId();
    const answer = async (status: Answer) => {
      const [raised, , , hold] = await check(o, id, status);
      return [raised, hold];
    };
    expect(await answer("authorized")).toEqual([true, "authorized_only"]);
    expect(await answer("captured")).toEqual([true, "capture_unverified"]);
    expect(await answer("authorized")).toEqual([false, "capture_unverified"]);
    expect(await standing(o.id)).toEqual(held("capture_unverified"));
    expect(await actions(o.id)).toEqual([
      "payment.hold.authorized_only",
      "payment.hold.capture_unverified",
    ]);
    // The one payment the answers named, recorded once, never moved by an answer.
    expect(await paymentRowCount(o.id)).toBe(2);
    expect(await payRow(id)).toMatchObject({ status: "created" });
    expect(await outbox(o.id)).toEqual([]);
  });

  it("a hold raised for one payment is never cleared by the capture of another: that capture is an extra payment, and the hold's own capture then meets an order under review", async () => {
    const o = await newOrder();
    const shown = paymentId();
    expect(await check(o, shown, "captured")).toEqual([
      true,
      "pending",
      true,
      "capture_unverified",
    ]);
    const before = await snapshot(o);
    const other = pay(o);
    const d = await deliver(CAPTURED, other);
    await expectReview(o, "extra_payment", before, d, other.id);
    expect(await payRow(other.id)).toMatchObject({ status: "captured" });
    expect(await standing(o.id)).toEqual(FLAGGED);
    // The payment the provider showed arrives later: the order is under review — still no confirmation.
    expect(await outcomeOf(CAPTURED, pay(o, { id: shown }))).toBe(
      "review:extra_payment",
    );
    expect(await standing(o.id)).toEqual(FLAGGED);
    expect(await outbox(o.id)).toEqual([]);
  });

  it("a payment id another order holds is refused, and nothing of the call is kept — no hold, no row, no audit", async () => {
    const holder = await newOrder();
    const taken = pay(holder);
    await confirm(holder, taken);
    const o = await newOrder();
    const before = { counts: await counts(), order: await orderRow(o.id) };
    expect(
      await payments.recordProviderCheck(o.paId, [
        live(o, taken.id, "captured"),
      ]),
    ).toEqual(refused("payment_conflict"));
    expect(await counts()).toEqual(before.counts);
    expect(await orderRow(o.id)).toEqual(before.order);
    expect(await payRow(taken.id)).toMatchObject({ order_id: holder.id });
  });

  it("an order under another review is never held — since 0007 a payment not on record is kept beside the review — and an unknown attempt id is refused, writing nothing", async () => {
    const o = await newOrder();
    const wrong = pay(o, { amount: o.total - BigInt(1) });
    expect(await outcomeOf(CAPTURED, wrong)).toBe("review:amount_mismatch");
    const before = { counts: await counts(), order: await orderRow(o.id) };
    const c = paymentId();
    const answer = await check(o, c, "captured");
    expect(answer).toEqual([false, "pending", true, null]);
    // 0007 (the independent review's round 2, finding 2): the observation is kept — the payment's known row and one
    // audit row beside the review (the wrong-amount payment stands for the order: an extra payment) — and the order
    // is left exactly as it is.
    expect(await counts()).toEqual({
      ...before.counts,
      payment_attempts: before.counts.payment_attempts + 1,
      audit_log: before.counts.audit_log + 1,
    });
    expect(await orderRow(o.id)).toEqual(before.order);
    expect(await actions(o.id, "payment.review.%")).toEqual([
      "payment.review.amount_mismatch",
      "payment.review.extra_payment",
    ]);
    const after = await counts();
    expect(
      await payments.recordProviderCheck(randomUUID(), [
        live(o, paymentId(), "captured"),
      ]),
    ).toEqual(refused("attempt_not_found"));
    // The same observation again writes nothing.
    expect(await check(o, c, "captured")).toEqual([
      false,
      "pending",
      true,
      null,
    ]);
    expect(await counts()).toEqual(after);
    expect(await orderRow(o.id)).toEqual(before.order);
  });
});

open("0005 — order_confirmation_view: the read path of /order/[token]", () => {
  it("answers by the token's hash only, with the documented keys, exact paise, the snapshot's items — and no contact or address", async () => {
    const o = await newOrder({ quantity: 3 });
    const subtotal = VARIANT.price * BigInt(3);
    const raw = await privileged.rpc("order_confirmation_view", {
      p_token_hash: o.tokenHash,
    });
    expect(raw.error).toBeNull();
    const view = raw.data as Row;
    // The documented keys: the opaque ones (two hashes, one id, the timestamps) and the plain ones.
    const opaque =
      "checkout_attempt_hash confirmation_token_hash expires_at payment_attempt_id placed_at server_time";
    const plain =
      "confirmed_at currency fulfilment_status items needs_review order_number payment_hold payment_status payments provider_order_id provider_order_state shipping_paise subtotal_paise synthetic tax_paise total_paise";
    expect(Object.keys(view).sort()).toEqual(
      `${opaque} ${plain}`.split(" ").sort(),
    );
    expect(view).toMatchObject({
      order_number: o.number,
      confirmation_token_hash: o.tokenHash,
      checkout_attempt_hash: o.attemptHash,
      payment_status: "pending",
      fulfilment_status: "pending_payment",
      confirmed_at: null,
      needs_review: false,
      payment_hold: null,
      synthetic: true,
      currency: "INR",
      subtotal_paise: Number(subtotal),
      shipping_paise: rule.shipping_paise,
      tax_paise: null,
      total_paise: Number(o.total),
      payments: { reported: 0, authorized: 0, captured: 0, failed: 0 },
      payment_attempt_id: o.paId,
      provider_order_state: "linked",
      provider_order_id: o.providerOrderId,
    });

    // Nothing of the contact or the address. The six-digit PIN code is looked for in the plain values only: in a
    // hash, an id or a timestamp six digits in a row can occur by chance.
    const { email, phone, name, line1, pincode } = o.fields;
    for (const personal of [email, phone, name, line1])
      expect(JSON.stringify(view)).not.toContain(personal);
    const plainValues = plain.split(" ").map((key) => view[key]);
    expect(JSON.stringify(plainValues)).not.toContain(pincode);

    // The server's adapter parses the real answer: dates, exact paise as bigint, the items as the snapshot holds them.
    const parsed = await payments.confirmationView(o.tokenHash);
    if (!parsed.ok || !parsed.value)
      throw new Error("the view of a real order did not parse");
    expect(parsed.value).toMatchObject({
      total_paise: o.total,
      subtotal_paise: subtotal,
      shipping_paise: rule.shipping_paise === null ? null : SHIPPING,
      tax_paise: null,
    });
    expect(parsed.value.placed_at).toBeInstanceOf(Date);
    expect(parsed.value.expires_at).toBeInstanceOf(Date);
    expect(parsed.value.items).toMatchObject([
      {
        variant_code: VARIANT.code,
        finish_code: "antique-gold",
        artwork_slug: plan.artworks[0].slug,
        quantity: 3,
        unit_price_paise: VARIANT.price,
        line_total_paise: subtotal,
      },
    ]);

    // An unknown hash is null — the attempt's hash is not the token's — and a malformed one is refused.
    expect(await payments.confirmationView(hex())).toEqual(ok(null));
    expect(await payments.confirmationView(o.attemptHash)).toEqual(ok(null));
    expect(await payments.confirmationView("zz")).toEqual(
      refused("invalid_request"),
    );

    // After its capture the same link shows the confirmed order.
    await confirm(o);
    const confirmed = await payments.confirmationView(o.tokenHash);
    expect(confirmed.ok && confirmed.value).toMatchObject({
      payment_status: "captured",
      fulfilment_status: "confirmed",
      payments: { reported: 0, authorized: 0, captured: 1, failed: 0 },
    });
    expect(confirmed.ok && confirmed.value?.confirmed_at).toBeInstanceOf(Date);
  });
});

// --- 0006_payment_evidence (the independent review's round 1) ----------------------------------------------------

describe("0006_payment_evidence — the replaced signatures are gone", () => {
  it("the three-argument ledger step and provider check answer no function — to the server role too — and write nothing", async () => {
    const before = await counts();
    const ledger = await privileged.rpc("payment_record_event", {
      p_event_id: eventIdOf(),
      p_event_type: CAPTURED,
      p_payload: { entity: "event" },
    });
    expect(ledger.error?.code).toBe("PGRST202");
    const check = await privileged.rpc("payment_record_provider_check", {
      p_payment_attempt_id: NIL_UUID,
      p_payment_id: "pay_PLACEHOLDER001",
      p_provider_status: "captured",
    });
    expect(check.error?.code).toBe("PGRST202");
    expect(await counts()).toEqual(before);
  });
});

open(
  "0006 — the ledger keeps the verified bytes, exactly and for good (finding 7)",
  () => {
    it("stores the delivery's bytes byte for byte beside their parse — spacing, escapes and a 20-digit integer included — and processes it as before", async () => {
      const o = await newOrder();
      const payload = eventPayload(CAPTURED, pay(o));
      // Bytes no re-serialisation reproduces: spaces and a line break, escapes, the sender's key order and an integer
      // beyond 2^53 that a parse rounds.
      const text = `{ "entity" : "event",\n  "account_id":"acc_ITPLACEHOLDER01", "event": "${CAPTURED}", "note":"\\u20b9 a\\/b", "big": 12345678901234567890,\n  "contains": ["payment"], "payload": ${JSON.stringify(payload.payload)}, "created_at": ${String(payload.created_at)} }`;
      const raw = new TextEncoder().encode(text);
      const d = await deliverPayload(
        CAPTURED,
        JSON.parse(text) as Row,
        eventIdOf(),
        raw,
      );
      expect([d.outcome, d.replayed]).toEqual(["confirmed", false]);
      expect(await standing(o.id)).toEqual(CONFIRMED);
      // The bytes, exactly; PostgREST answers a bytea as `\x` and lower-case hex.
      expect(await rawBodyOf(d.row)).toBe(byteaHex(raw));
      // The parse is the processing copy: it keeps neither the spacing nor the 20 digits.
      const event = await eventRow(d.row);
      expect(event.payload).toMatchObject({ event: CAPTURED, note: "₹ a/b" });
      expect(JSON.stringify(event.payload)).not.toContain(
        "12345678901234567890",
      );
    });

    it("keeps them immutable: changing or clearing raw_body is refused with the row unchanged; the same event in other bytes keeps the first bytes; other content keeps its own", async () => {
      const o = await newOrder();
      const d = await confirm(o);
      const stored = await rawBodyOf(d.row);
      expect(stored).toBe(byteaHex(d.raw));
      for (const change of [byteaHex(bytesOf({ entity: "forged" })), null]) {
        const update = await privileged
          .from("provider_events")
          .update({ raw_body: change })
          .eq("id", d.row)
          .select("id");
        // The server role holds UPDATE here, so the change reaches the trigger: its own message, not a grant's.
        expect(update.error?.code).toBe("42501");
        expect(update.error?.message ?? "").toContain(
          "ledger fields are immutable",
        );
        expect(await rawBodyOf(d.row)).toBe(stored);
      }
      // The same id, type and content in other bytes is the same event again: the first delivery's bytes stay.
      const respaced = new TextEncoder().encode(
        `${JSON.stringify(d.payload, null, 2)}\n`,
      );
      expect(
        await payments.recordEvent(d.eventId, CAPTURED, d.payload, respaced),
      ).toEqual(
        ok({
          eventRowId: d.row,
          inserted: false,
          derived: false,
          processingStatus: "processed",
        }),
      );
      expect(await rawBodyOf(d.row)).toBe(stored);
      // The same id with other content is stored beside it, with its own bytes.
      const b = await newOrder();
      const beside = await deliver(CAPTURED, pay(b), d.eventId);
      expect(beside.recorded).toMatchObject({ inserted: true, derived: true });
      expect(await rawBodyOf(beside.row)).toBe(byteaHex(beside.raw));
    });

    it("refuses a delivery without its bytes, with too few to be one or with more than the webhook accepts, and stores nothing", async () => {
      const before = await counts();
      for (const [label, raw] of [
        ["no bytes", null],
        ["an empty body", "\\x"],
        ["one byte", "\\x7b"],
        // One byte over 0006's bound — 262144, the webhook's own limit.
        ["262145 bytes", byteaHex(new Uint8Array(262_145).fill(0x20))],
      ] as const) {
        const result = await privileged.rpc("payment_record_event", {
          p_event_id: eventIdOf(),
          p_event_type: CAPTURED,
          p_payload: { entity: "event" },
          p_raw_body: raw,
        });
        expect(result.error?.code, label).toBe("ZP001");
      }
      expect(await counts()).toEqual(before);
    });
  },
);

open(
  "0006 — a signed event that contradicts a payment's recorded money is a review (finding 6)",
  () => {
    it("a matching authorisation, then a signed one for other money, then the matching capture: flagged and audited, never confirmed", async () => {
      const o = await newOrder();
      const fields = pay(o);
      expect(await outcomeOf(AUTHORIZED, fields)).toBe("hold:authorized_only");
      const before = await snapshot(o);
      const recorded = await payRow(fields.id);
      const more = o.total + BigInt(100);
      const contradicting = await deliver(AUTHORIZED, {
        ...fields,
        amount: more,
      });
      await expectReview(
        o,
        "amount_mismatch",
        before,
        contradicting,
        fields.id,
      );
      // The payment's row is left exactly as the first event wrote it; the audit row keeps what the event said.
      expect(await payRow(fields.id)).toEqual(recorded);
      expect(
        (await audits(o.id, "payment.review.amount_mismatch"))[0].next,
      ).toMatchObject({
        payment: {
          status: "authorized",
          amount_paise: Number(more),
          currency: "INR",
        },
      });
      // The matching capture meets an order under a review that is not a hold: still no confirmation.
      expect(await outcomeOf(CAPTURED, fields)).toBe(
        "review:order_under_review",
      );
      expect(await standing(o.id)).toEqual(FLAGGED);
      expect(await outbox(o.id)).toEqual([]);
      expect(await stages(o.id)).toEqual([0]);
      expect(await audits(o.id, "payment.captured.%")).toEqual([]);
      expect(await payRow(fields.id)).toMatchObject({ status: "captured" });
    });

    it("another currency on a repeated authorisation is currency_mismatch, with the row unchanged; the reverse order of arrival is never confirmed either", async () => {
      const o = await newOrder();
      const fields = pay(o);
      await deliver(AUTHORIZED, fields);
      const before = await snapshot(o);
      const recorded = await payRow(fields.id);
      const usd = await deliver(AUTHORIZED, { ...fields, currency: "USD" });
      await expectReview(o, "currency_mismatch", before, usd, fields.id);
      expect(await payRow(fields.id)).toEqual(recorded);
      expect(await outcomeOf(CAPTURED, fields)).toBe(
        "review:order_under_review",
      );

      const r = await newOrder();
      const right = pay(r);
      expect(
        await outcomeOf(AUTHORIZED, {
          ...right,
          amount: r.total + BigInt(500),
        }),
      ).toBe("review:amount_mismatch");
      expect(await outcomeOf(AUTHORIZED, right)).toBe("review:amount_mismatch");
      expect(await outcomeOf(CAPTURED, right)).toBe(
        "review:order_under_review",
      );
      expect(await standing(r.id)).toEqual(FLAGGED);
      expect(await outbox(r.id)).toEqual([]);
    });

    it("a confirmed order meeting a capture of its payment for other money stays confirmed, is flagged, and keeps its one outbox row", async () => {
      const o = await newOrder();
      const fields = pay(o);
      await confirm(o, fields);
      const before = await snapshot(o);
      const recorded = await payRow(fields.id);
      const less = await deliver(CAPTURED, {
        ...fields,
        amount: o.total - BigInt(1),
      });
      await expectReview(o, "amount_mismatch", before, less, fields.id);
      expect(await standing(o.id)).toEqual([
        "captured",
        "confirmed",
        true,
        null,
        true,
      ]);
      expect(await outbox(o.id)).toHaveLength(1);
      expect(await payRow(fields.id)).toEqual(recorded);
    });

    it("a failed event's money is judged on neither path: it stays stale and changes nothing; same-money repeats stay silent", async () => {
      const o = await newOrder();
      const fields = pay(o);
      await deliver(AUTHORIZED, fields);
      const before = await snapshot(o);
      expect(
        await outcomeOf(FAILED, { ...fields, amount: o.total + BigInt(7) }),
      ).toBe("stale_failed");
      expect(await snapshot(o)).toEqual(before);

      const c = await newOrder();
      const paid = pay(c);
      await confirm(c, paid);
      const audited = await actions(c.id);
      expect(await outcomeOf(CAPTURED, paid)).toBe("duplicate_capture");
      expect(await outcomeOf(AUTHORIZED, paid)).toBe("stale_authorized");
      expect(await outcomeOf(FAILED, paid)).toBe("stale_failed");
      expect(await actions(c.id)).toEqual(audited);
    });
  },
);

open(
  "0006 — the provider check sees every live payment and its money (findings 3 and 4)",
  () => {
    const checked = async (o: Order, shown: ObservedPayment[]) => {
      const result = await payments.recordProviderCheck(o.paId, shown);
      if (!result.ok) throw new Error(`check refused: ${result.refusal}`);
      return result.value;
    };
    /** A review no capture clears: the flag without a hold, no hold raised now. */
    const REVIEWED = {
      held: false,
      paymentStatus: "pending",
      needsReview: true,
      paymentHold: null,
    };
    /** A payment the provider showed, recorded as known: created, never verified, the observed amount. */
    const known = (o: Order, amount: bigint) => ({
      order_id: o.id,
      provider_order_id: o.providerOrderId,
      amount_paise: Number(amount),
      currency: "INR",
      status: "created",
      signature_verified: false,
      provider_order_state: null,
    });

    it("two live payments are a review no capture clears: both recorded as known, one audit row with both as observed — and every signed event of either stays a review", async () => {
      const o = await newOrder();
      const [a, b] = [paymentId(), paymentId()];
      expect(
        await checked(o, [live(o, a, "captured"), live(o, b, "authorized")]),
      ).toEqual(REVIEWED);
      expect(await standing(o.id)).toEqual(FLAGGED);
      expect(await audits(o.id)).toEqual([
        {
          actor_type: "system",
          action: "payment.review.extra_payment",
          entity_type: "order",
          entity_id: o.id,
          previous: {
            payment_status: "pending",
            needs_review: false,
            payment_hold: null,
          },
          next: {
            payment_status: "pending",
            needs_review: true,
            payment_hold: null,
            payments: [
              {
                id: a,
                status: "captured",
                amount_paise: Number(o.total),
                currency: "INR",
              },
              {
                id: b,
                status: "authorized",
                amount_paise: Number(o.total),
                currency: "INR",
              },
            ],
          },
          reason: "provider_check",
          external_ref: a,
        },
      ]);
      for (const id of [a, b])
        expect(await payRow(id)).toEqual(known(o, o.total));
      expect(await outbox(o.id)).toEqual([]);
      // The same answer again changes nothing.
      const before = await counts();
      expect(
        await checked(o, [live(o, a, "captured"), live(o, b, "authorized")]),
      ).toEqual(REVIEWED);
      expect(await counts()).toEqual(before);
      // The signed events, all in time: none confirms, none queues work.
      expect(await outcomeOf(CAPTURED, pay(o, { id: a }))).toBe(
        "review:extra_payment",
      );
      expect(await outcomeOf(AUTHORIZED, pay(o, { id: b }))).toBe(
        "review:extra_payment",
      );
      expect(await outcomeOf(CAPTURED, pay(o, { id: b }))).toBe(
        "review:extra_payment",
      );
      expect(await standing(o.id)).toEqual(FLAGGED);
      expect(await outbox(o.id)).toEqual([]);
      expect(await stages(o.id)).toEqual([0]);
    });

    it("over a hold raised for one of them, the review replaces the hold — and the hold's own capture no longer confirms", async () => {
      const o = await newOrder();
      const [a, b] = [paymentId(), paymentId()];
      expect(await checked(o, [live(o, a, "captured")])).toEqual({
        held: true,
        paymentStatus: "pending",
        needsReview: true,
        paymentHold: "capture_unverified",
      });
      expect(
        await checked(o, [live(o, a, "captured"), live(o, b, "authorized")]),
      ).toEqual(REVIEWED);
      expect(await actions(o.id)).toEqual([
        "payment.hold.capture_unverified",
        "payment.review.extra_payment",
      ]);
      expect((await audits(o.id, "payment.review.%"))[0].previous).toEqual({
        payment_status: "pending",
        needs_review: true,
        payment_hold: "capture_unverified",
      });
      expect(await paymentRowCount(o.id)).toBe(3);
      expect(await outcomeOf(CAPTURED, pay(o, { id: a }))).toBe(
        "review:extra_payment",
      );
      expect(await standing(o.id)).toEqual(FLAGGED);
      expect(await outbox(o.id)).toEqual([]);
    });

    it("a payment id another order holds is refused, and nothing of the call is kept — not even the row of a payment listed before it", async () => {
      const holder = await newOrder();
      // Made before the held id, so it sorts first: its row would be written before the conflict is found.
      const listedFirst = paymentId();
      const taken = pay(holder);
      await deliver(AUTHORIZED, taken);
      const o = await newOrder();
      const before = { counts: await counts(), order: await orderRow(o.id) };
      expect(
        await payments.recordProviderCheck(o.paId, [
          live(o, listedFirst, "captured"),
          live(o, taken.id, "authorized"),
        ]),
      ).toEqual(refused("payment_conflict"));
      expect(await counts()).toEqual(before.counts);
      expect(await orderRow(o.id)).toEqual(before.order);
      expect(await payRow(listedFirst)).toBeNull();
      expect(await payRow(taken.id)).toMatchObject({ order_id: holder.id });
    });

    it("one authorised payment for one paisa less is amount_mismatch: the observed money kept on its row and in its audit row — and a later matching capture is still a review", async () => {
      const o = await newOrder();
      const id = paymentId();
      const short = o.total - BigInt(1);
      expect(
        await checked(o, [live(o, id, "authorized", { amount: short })]),
      ).toEqual(REVIEWED);
      expect(await audits(o.id)).toMatchObject([
        {
          action: "payment.review.amount_mismatch",
          reason: "provider_check",
          external_ref: id,
          next: {
            payments: [
              {
                id,
                status: "authorized",
                amount_paise: Number(short),
                currency: "INR",
              },
            ],
          },
        },
      ]);
      expect(await payRow(id)).toEqual(known(o, short));
      expect(await outcomeOf(CAPTURED, pay(o, { id }))).toBe(
        "review:order_under_review",
      );
      expect(await standing(o.id)).toEqual(FLAGGED);
      expect(await outbox(o.id)).toEqual([]);
      expect(await stages(o.id)).toEqual([0]);
    });

    it("a payment a verified return recorded keeps its row's amount when the check observes one paisa less for it: a review, and its audit row is the evidence", async () => {
      const o = await newOrder();
      const id = paymentId();
      const returned = await payments.returnState(o.attemptHash, id);
      expect(returned.ok && returned.value?.recorded).toBe(true);
      const recorded = await payRow(id);
      expect(recorded).toMatchObject({
        amount_paise: Number(o.total),
        status: "created",
        signature_verified: true,
      });
      const short = o.total - BigInt(1);
      expect(
        await checked(o, [live(o, id, "authorized", { amount: short })]),
      ).toEqual(REVIEWED);
      expect(await standing(o.id)).toEqual(FLAGGED);
      // The row the verified return wrote is left exactly as it was; the observed amount is in the audit row only.
      expect(await payRow(id)).toEqual(recorded);
      expect(await audits(o.id, "payment.review.%")).toMatchObject([
        {
          action: "payment.review.amount_mismatch",
          reason: "provider_check",
          external_ref: id,
          next: {
            payments: [
              {
                id,
                status: "authorized",
                amount_paise: Number(short),
                currency: "INR",
              },
            ],
          },
        },
      ]);
      expect(await paymentRowCount(o.id)).toBe(2);
      expect(await outbox(o.id)).toEqual([]);
    });

    it("a captured payment in another currency is currency_mismatch: no payment row — its audit row keeps the currency", async () => {
      const o = await newOrder();
      const id = paymentId();
      expect(
        await checked(o, [live(o, id, "captured", { currency: "USD" })]),
      ).toEqual(REVIEWED);
      expect(await audits(o.id)).toMatchObject([
        {
          action: "payment.review.currency_mismatch",
          next: {
            payments: [
              {
                id,
                status: "captured",
                amount_paise: Number(o.total),
                currency: "USD",
              },
            ],
          },
        },
      ]);
      expect(await payRow(id)).toBeNull();
      expect(await paymentRowCount(o.id)).toBe(1);
    });

    it("one matching payment is still 0005's hold, its audit row now carrying the observed money; a mismatch over that hold replaces it", async () => {
      const o = await newOrder();
      const first = paymentId();
      expect(await checked(o, [live(o, first, "authorized")])).toEqual({
        held: true,
        paymentStatus: "pending",
        needsReview: true,
        paymentHold: "authorized_only",
      });
      expect(await audits(o.id)).toMatchObject([
        {
          action: "payment.hold.authorized_only",
          reason: "provider_check",
          external_ref: first,
          next: {
            needs_review: true,
            payment_hold: "authorized_only",
            payment: {
              status: "authorized",
              amount_paise: Number(o.total),
              currency: "INR",
            },
          },
        },
      ]);
      expect(
        await checked(o, [
          live(o, first, "authorized"),
          live(o, paymentId(), "authorized", { amount: o.total + BigInt(1) }),
        ]),
      ).toEqual(REVIEWED);
      // The money's reason comes before the count's.
      expect(await actions(o.id)).toEqual([
        "payment.hold.authorized_only",
        "payment.review.amount_mismatch",
      ]);
    });

    it("refuses an answer of the wrong shape before anything is read — and writes nothing", async () => {
      const o = await newOrder();
      const good = {
        id: paymentId(),
        status: "captured",
        amount_paise: String(o.total),
        currency: "INR",
      };
      const shapes: Array<[string, unknown]> = [
        ["no payment", []],
        ["an object, not a list", good],
        ["a fifth key", [{ ...good, method: "upi" }]],
        ["a failed payment", [{ ...good, status: "failed" }]],
        ["an amount as a number", [{ ...good, amount_paise: Number(o.total) }]],
        ["a zero amount", [{ ...good, amount_paise: "0" }]],
        ["a lower-case currency", [{ ...good, currency: "inr" }]],
        ["the same id twice", [good, { ...good, status: "authorized" }]],
      ];
      const before = await counts();
      for (const [label, list] of shapes) {
        const result = await privileged.rpc("payment_record_provider_check", {
          p_payment_attempt_id: o.paId,
          p_payments: list,
        });
        expect(result.error?.code, label).toBe("ZP001");
      }
      expect(await counts()).toEqual(before);
      expect(await standing(o.id)).toEqual(PAYABLE);
    });
  },
);

open(
  "0007 — evidence the provider check and the finalizer never discard (the independent review's round 2, findings 1 and 2)",
  () => {
    const checked = async (o: Order, shown: ObservedPayment[]) => {
      const result = await payments.recordProviderCheck(o.paId, shown);
      if (!result.ok) throw new Error(`check refused: ${result.refusal}`);
      return result.value;
    };
    /** A review no capture clears: the flag without a hold, no hold raised now. */
    const REVIEWED = {
      held: false,
      paymentStatus: "pending",
      needsReview: true,
      paymentHold: null,
    };
    /** A confirmed order the check flagged: still captured, the flag set, no hold. */
    const FLAGGED_CONFIRMED = { ...REVIEWED, paymentStatus: "captured" };
    /** A payment the provider showed, recorded as known: created, never verified, the observed amount. */
    const known = (o: Order, amount: bigint) => ({
      order_id: o.id,
      provider_order_id: o.providerOrderId,
      amount_paise: Number(amount),
      currency: "INR",
      status: "created",
      signature_verified: false,
      provider_order_state: null,
    });
    /** One payment as an audit row's `payments` keeps it. */
    const seen = (id: string, status: string, amount: bigint) => ({
      id,
      status,
      amount_paise: Number(amount),
      currency: "INR",
    });

    it.each([
      ["captured", "failure-first"],
      ["captured", "listing-first"],
      ["authorized", "failure-first"],
      ["authorized", "listing-first"],
    ] as const)(
      "a signed failure and a live (%s) observation of the same payment are a review no capture clears — %s",
      async (status, sequence) => {
        const o = await newOrder();
        const a = pay(o);
        const listing = [live(o, a.id, status)];
        if (sequence === "failure-first") {
          expect(await outcomeOf(FAILED, a)).toBe("recorded:failed");
          expect(await checked(o, listing)).toEqual(REVIEWED);
          expect(
            await audits(o.id, "payment.review.payment_state_conflict"),
          ).toMatchObject([
            {
              reason: "provider_check",
              external_ref: a.id,
              next: { payments: [seen(a.id, status, o.total)] },
            },
          ]);
        } else {
          expect(await checked(o, listing)).toEqual({
            held: true,
            paymentStatus: "pending",
            needsReview: true,
            paymentHold:
              status === "captured" ? "capture_unverified" : "authorized_only",
          });
          expect(await outcomeOf(FAILED, a)).toBe(
            "review:payment_state_conflict",
          );
          expect(
            await audits(o.id, "payment.review.payment_state_conflict"),
          ).toMatchObject([
            { reason: "payment_state_conflict", external_ref: a.id },
          ]);
        }
        expect(await standing(o.id)).toEqual(FLAGGED);
        expect(await payRow(a.id)).toMatchObject({
          status: "failed",
          signature_verified: true,
        });
        // Listed again: at most the API's own record of the conflict once, then nothing.
        await checked(o, listing);
        const before = await counts();
        expect(await checked(o, listing)).toEqual(REVIEWED);
        expect(await counts()).toEqual(before);
        // Another payment's timely capture never clears it.
        expect(await outcomeOf(CAPTURED, pay(o))).toBe(
          "review:order_under_review",
        );
        expect(await standing(o.id)).toEqual(FLAGGED);
        expect(await stages(o.id)).toEqual([0]);
        expect(await outbox(o.id)).toEqual([]);
      },
    );

    it("another payment's failure beside a provider-check hold is only recorded — and the hold's own capture still confirms, once", async () => {
      const o = await newOrder();
      const a = pay(o);
      expect((await checked(o, [live(o, a.id, "captured")])).paymentHold).toBe(
        "capture_unverified",
      );
      expect(await outcomeOf(FAILED, pay(o))).toBe("recorded:failed");
      expect(await standing(o.id)).toEqual(held("capture_unverified"));
      await confirm(o, a);
      expect(await standing(o.id)).toEqual(CONFIRMED);
      expect(await stages(o.id)).toEqual([1]);
      expect(await outbox(o.id)).toHaveLength(1);
    });

    it("records an extra observed payment after confirmation once and preserves fulfilment", async () => {
      const o = await newOrder();
      const a = pay(o);
      const b = paymentId();
      await confirm(o, a);
      const listing = [live(o, a.id, "captured"), live(o, b, "authorized")];
      expect(await checked(o, listing)).toEqual(FLAGGED_CONFIRMED);
      const after = await orderRow(o.id);
      expect(after).toMatchObject({
        payment_status: "captured",
        fulfilment_status: "confirmed",
        needs_review: true,
      });
      expect(await payRow(a.id)).toMatchObject({
        status: "captured",
        signature_verified: true,
      });
      expect(await payRow(b)).toEqual(known(o, o.total));
      expect(await checked(o, [...listing].reverse())).toEqual(
        FLAGGED_CONFIRMED,
      );
      expect(await orderRow(o.id)).toEqual(after);
      const entries = await audits(o.id, "payment.review.extra_payment");
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        reason: "provider_check",
        previous: {
          payment_status: "captured",
          needs_review: false,
          payment_hold: null,
        },
        next: {
          payment_status: "captured",
          needs_review: true,
          payment_hold: null,
          payments: [
            seen(a.id, "captured", o.total),
            seen(b, "authorized", o.total),
          ],
        },
      });
      expect(await stages(o.id)).toEqual([1]);
      expect(await outbox(o.id)).toHaveLength(1);
    });

    it("a confirmed order meets one other payment as an extra payment: recorded once, the confirmation and its one task kept — and that payment's signed capture never confirms again", async () => {
      const o = await newOrder();
      const a = pay(o);
      const b = paymentId();
      await confirm(o, a);
      expect(await checked(o, [live(o, b, "authorized")])).toEqual(
        FLAGGED_CONFIRMED,
      );
      expect(await audits(o.id, "payment.review.%")).toMatchObject([
        {
          action: "payment.review.extra_payment",
          reason: "provider_check",
          external_ref: b,
          next: { payments: [seen(b, "authorized", o.total)] },
        },
      ]);
      expect(await payRow(b)).toEqual(known(o, o.total));
      expect(await standing(o.id)).toEqual([
        "captured",
        "confirmed",
        true,
        null,
        true,
      ]);
      expect(await stages(o.id)).toEqual([1]);
      expect(await outbox(o.id)).toHaveLength(1);
      const before = await counts();
      expect(await checked(o, [live(o, b, "authorized")])).toEqual(
        FLAGGED_CONFIRMED,
      );
      expect(await counts()).toEqual(before);
      expect(await outcomeOf(CAPTURED, pay(o, { id: b }))).toBe(
        "review:extra_payment",
      );
      expect(await outbox(o.id)).toHaveLength(1);
    });

    it("a confirmed order meets its own payment with other money as a review: the payment's signed row and the one task kept", async () => {
      const o = await newOrder();
      const a = pay(o);
      await confirm(o, a);
      const row = await payRow(a.id);
      const other = [
        live(o, a.id, "captured", { amount: o.total - BigInt(1) }),
      ];
      expect(await checked(o, other)).toEqual(FLAGGED_CONFIRMED);
      expect(await audits(o.id, "payment.review.%")).toMatchObject([
        {
          action: "payment.review.amount_mismatch",
          reason: "provider_check",
          external_ref: a.id,
          next: { payments: [seen(a.id, "captured", o.total - BigInt(1))] },
        },
      ]);
      expect(await payRow(a.id)).toEqual(row);
      expect(await stages(o.id)).toEqual([1]);
      expect(await outbox(o.id)).toHaveLength(1);
      const before = await counts();
      await checked(o, other);
      expect(await counts()).toEqual(before);
    });

    it("a payment reported by a verified return, then a listing of another payment alone, is a review — never a hold", async () => {
      const o = await newOrder();
      const x = paymentId();
      expect((await payments.returnState(o.attemptHash, x)).ok).toBe(true);
      const y = paymentId();
      expect(await checked(o, [live(o, y, "captured")])).toEqual(REVIEWED);
      expect(await actions(o.id)).toEqual([
        "payment.return.verified",
        "payment.review.extra_payment",
      ]);
      expect(await payRow(y)).toEqual(known(o, o.total));
      expect(await outbox(o.id)).toEqual([]);
    });

    it("an order under another review keeps that review, and what the check saw is recorded beside it — once", async () => {
      const o = await newOrder();
      expect(
        await outcomeOf(CAPTURED, pay(o, { amount: o.total - BigInt(1) })),
      ).toBe("review:amount_mismatch");
      const before = await snapshot(o);
      const [c, d] = [paymentId(), paymentId()];
      const listing = [live(o, d, "authorized"), live(o, c, "captured")];
      expect(await checked(o, listing)).toEqual(REVIEWED);
      expect(await orderRow(o.id)).toEqual(before.order);
      for (const id of [c, d])
        expect(await payRow(id)).toEqual(known(o, o.total));
      expect(await audits(o.id, "payment.review.extra_payment")).toMatchObject([
        {
          reason: "provider_check",
          external_ref: c,
          next: {
            payments: [
              seen(c, "captured", o.total),
              seen(d, "authorized", o.total),
            ],
          },
        },
      ]);
      expect(await stages(o.id)).toEqual(before.stages);
      expect(await outbox(o.id)).toEqual(before.outbox);
      const again = await counts();
      expect(await checked(o, [...listing].reverse())).toEqual(REVIEWED);
      expect(await counts()).toEqual(again);
    });

    it("a payment not on record for an order under a review with no payment row is audited beside it (order_under_review) — once", async () => {
      // A capture in another currency: the review, and no payment row (the row cannot hold that money).
      const o = await newOrder();
      const usd = pay(o, { currency: "USD" });
      expect(await outcomeOf(CAPTURED, usd)).toBe("review:currency_mismatch");
      expect(await payRow(usd.id)).toBeNull();
      const before = await snapshot(o);
      const c = paymentId();
      expect(await checked(o, [live(o, c, "captured")])).toEqual(REVIEWED);
      expect(await orderRow(o.id)).toEqual(before.order);
      expect(await payRow(c)).toEqual(known(o, o.total));
      expect(
        await audits(o.id, "payment.review.order_under_review"),
      ).toMatchObject([
        {
          reason: "provider_check",
          external_ref: c,
          next: { payments: [seen(c, "captured", o.total)] },
        },
      ]);
      const again = await counts();
      await checked(o, [live(o, c, "captured")]);
      expect(await counts()).toEqual(again);
    });

    it("an order no longer awaiting its payment is never held: a live payment for it is a review (order_not_payable), recorded once", async () => {
      const o = await newOrder();
      const cut = await privileged
        .from("orders")
        .update({ fulfilment_status: "cancelled" })
        .eq("id", o.id);
      expect(cut.error).toBeNull();
      const c = paymentId();
      expect(await checked(o, [live(o, c, "captured")])).toEqual(REVIEWED);
      expect(await orderRow(o.id)).toMatchObject({
        payment_status: "pending",
        fulfilment_status: "cancelled",
        needs_review: true,
        payment_hold: null,
        confirmed_at: null,
      });
      expect(await payRow(c)).toEqual(known(o, o.total));
      expect(await audits(o.id, "payment.review.%")).toMatchObject([
        {
          action: "payment.review.order_not_payable",
          reason: "provider_check",
          external_ref: c,
          next: { payments: [seen(c, "captured", o.total)] },
        },
      ]);
      expect(await outbox(o.id)).toEqual([]);
      const again = await counts();
      await checked(o, [live(o, c, "captured")]);
      expect(await counts()).toEqual(again);
    });

    it("a webhook that committed a review first — a capture stored after the deadline — never makes the check discard another payment it saw", async () => {
      const o = await newOrder({ deadline: "past" });
      const a = pay(o);
      expect(await outcomeOf(CAPTURED, a)).toBe("review:late_capture");
      const b = paymentId();
      const listing = [live(o, a.id, "captured"), live(o, b, "authorized")];
      expect(await checked(o, listing)).toEqual(REVIEWED);
      expect(await payRow(b)).toEqual(known(o, o.total));
      expect(await audits(o.id, "payment.review.extra_payment")).toMatchObject([
        {
          reason: "provider_check",
          next: {
            payments: [
              seen(a.id, "captured", o.total),
              seen(b, "authorized", o.total),
            ],
          },
        },
      ]);
      expect(await standing(o.id)).toEqual(FLAGGED);
      expect(await stages(o.id)).toEqual([0]);
      expect(await outbox(o.id)).toEqual([]);
      const again = await counts();
      await checked(o, [...listing].reverse());
      expect(await counts()).toEqual(again);
    });

    it.each([
      [
        "stored after the deadline: the late-capture review, no confirmation, no task",
        "past",
      ],
      ["stored in time: one confirmation, one task", "ahead"],
    ] as const)(
      "the AS-1566 shape — a verified return, the provider check's hold for that payment, then its own signed capture %s",
      async (_label, when) => {
        const o = await newOrder(when === "past" ? { deadline: "past" } : {});
        const p = pay(o);
        expect((await payments.returnState(o.attemptHash, p.id)).ok).toBe(true);
        expect(await checked(o, [live(o, p.id, "captured")])).toEqual({
          held: true,
          paymentStatus: "pending",
          needsReview: true,
          paymentHold: "capture_unverified",
        });
        if (when === "past") {
          expect(await outcomeOf(CAPTURED, p)).toBe("review:late_capture");
          expect(await standing(o.id)).toEqual(FLAGGED);
          expect(await stages(o.id)).toEqual([0]);
          expect(await outbox(o.id)).toEqual([]);
        } else {
          await confirm(o, p);
          expect(await standing(o.id)).toEqual(CONFIRMED);
          expect(await stages(o.id)).toEqual([1]);
          expect(await outbox(o.id)).toHaveLength(1);
        }
      },
    );
  },
);

open(
  "0006 — what the customer-facing rules read from a cancelled order (finding 5)",
  () => {
    it("an order cancelled before it was paid for, its deadline ahead, reads as failed/closed — never the retry that offers checkout again", async () => {
      const o = await newOrder();
      const cut = await privileged
        .from("orders")
        .update({ fulfilment_status: "cancelled" })
        .eq("id", o.id);
      expect(cut.error).toBeNull();
      const view = await payments.confirmationView(o.tokenHash);
      if (!view.ok || view.value === null)
        throw new Error("the order's view could not be read");
      expect(view.value).toMatchObject({
        payment_status: "pending",
        fulfilment_status: "cancelled",
        needs_review: false,
      });
      expect(view.value.expires_at).not.toBeNull();
      expect(view.value.server_time.getTime()).toBeLessThan(
        view.value.expires_at?.getTime() ?? 0,
      );
      expect(orderPageState(view.value)).toEqual({
        state: "failed",
        reason: "closed",
      });
      const read = await payments.returnState(o.attemptHash, null);
      expect(read.ok && read.value).toMatchObject({
        paymentStatus: "pending",
        fulfilmentStatus: "cancelled",
        needsReview: false,
      });
    });
  },
);
