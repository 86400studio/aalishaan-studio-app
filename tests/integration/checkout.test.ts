import { createHash, randomBytes } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { resolveTestTarget } from "../../scripts/testing/lib/supabase-target.mjs";

import {
  createCheckoutStore,
  type AttemptState,
  type PendingOrderRequest,
  type RpcCall,
} from "@/lib/server/checkout/store";

/**
 * 0004_checkout on the real TEST project (docs/database-changes/S1.6-0004-checkout.md → Verification;
 * ENVIRONMENT-PARITY.md §12): the five functions denied to the publishable key with privileged post-checks; one
 * allowed purchase committing every row, the snapshot and the policy references; the same attempt again returning
 * the same order without taking a number; other details under the same key refused; REAL concurrent submissions of
 * one attempt producing one order and of several attempts producing contiguous numbers; a failure in the middle of
 * the transaction leaving no row and consuming no number; two guests with the same email and phone staying two
 * customers; a changed price, an unavailable variant and a wrong total refused before any write; the provider
 * step's single claim under real concurrency, the link that sets the deadline once, the close with its audit row,
 * and the two guard triggers. The server's own adapter (src/lib/server/checkout/store.ts) makes the calls, so its
 * parsing is proven against the database's real answers.
 *
 * The suite needs the effective business rule to be OPEN and SYNTHETIC — the S1.6 test rule on TEST (the TEST plan
 * inserts it once; business_rules is append-only). While the rule is still CLOSED the suite proves the closed case
 * instead — a valid request refused with nothing written — and says so; the open cases are then reported as
 * skipped, never passed. The change record's TEST plan runs the file in both states, in that order.
 *
 * Rows this file writes are synthetic (`synthetic = true`, an `@example.test` address, a `9…` test number) and are
 * retained history by design: orders and the rows beneath them are append-only or non-deletable, and every created
 * order consumes its number (the change record's "Fixture lifecycle"). One test changes one variant's price and
 * availability for a moment and restores both in a `finally`, with a read-back.
 */

const NO_SESSION = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};
const runId = randomBytes(6).toString("hex");

const target = resolveTestTarget(process.env);
if (!target.ok) throw new Error(target.reasons.join("; "));
const privileged = createClient(
  target.target.url,
  target.target.secretKey,
  NO_SESSION,
);
const anon = createClient(
  target.target.url,
  target.target.publishableKey,
  NO_SESSION,
);

const rpc: RpcCall = async (name, args) => {
  const { data, error } = await privileged.rpc(name, args);
  return { data, error: error ? { code: error.code } : null };
};
const store = createCheckoutStore(rpc);

// The effective rule, exactly as the function selects it.
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

const probe = await privileged.rpc("checkout_attempt_state", {
  p_attempt_hash: "0".repeat(64),
});
if (probe.error)
  throw new Error(
    `0004_checkout is not applied on TEST (checkout_attempt_state: ${probe.error.code}) — apply it first (docs/database-changes/S1.6-0004-checkout.md)`,
  );

// Two purchasable variants of two artworks, with the prices the database holds now.
const catalogue = await privileged
  .from("variants")
  .select("id,variant_code,price_paise,availability,artworks!inner(status)")
  .eq("availability", "made_to_order")
  .eq("artworks.status", "Active")
  .like("variant_code", "%:antique-gold")
  .order("variant_code", { ascending: false })
  .limit(2);
if (catalogue.error || (catalogue.data ?? []).length < 2)
  throw new Error(
    `the TEST catalogue has no two purchasable variants (${catalogue.error?.code ?? "too few"}) — run pnpm db:test:seed --apply first`,
  );
const [FIRST, SECOND] = (
  catalogue.data as Array<{
    id: string;
    variant_code: string;
    price_paise: number;
  }>
).map((row) => ({
  id: row.id,
  code: row.variant_code,
  price: BigInt(row.price_paise),
}));

console.log(
  `[integration] checkout: effective rule v${rule.version} is ${OPEN ? "OPEN and synthetic — the open cases run" : "CLOSED — only the closed case and the access cases run; the open cases are skipped"}.`,
);

const hex = () => randomBytes(32).toString("hex");
const sha = (value: string) => createHash("sha256").update(value).digest("hex");

let sequence = 0;
function request(
  overrides: Partial<PendingOrderRequest> = {},
): PendingOrderRequest {
  sequence += 1;
  const shipping =
    rule.shipping_paise === null ? BigInt(0) : BigInt(rule.shipping_paise);
  return {
    attemptHash: hex(),
    payloadMac: hex(),
    tokenHash: hex(),
    tokenSalt: hex(),
    expectedTotalPaise: FIRST.price * BigInt(2) + SECOND.price + shipping,
    fields: {
      name: `Checkout Test ${runId}`,
      email: `checkout-${runId}-${sequence}@example.test`,
      phone: "9000000000",
      pincode: "400001",
      line1: `${sequence} Test Lane`,
      line2: null,
      city: "Mumbai",
      state: "Maharashtra",
    },
    items: [
      { variant_code: FIRST.code, quantity: 2 },
      { variant_code: SECOND.code, quantity: 1 },
    ],
    ...overrides,
  };
}

async function created(overrides: Partial<PendingOrderRequest> = {}) {
  const input = request(overrides);
  const result = await store.createPendingOrder(input);
  if (!result.ok) throw new Error(`create refused: ${result.refusal}`);
  return { input, state: result.value };
}

async function counter(): Promise<number> {
  const { data, error } = await privileged
    .from("order_number_counter")
    .select("next_value")
    .single();
  expect(error).toBeNull();
  return Number((data as { next_value: number }).next_value);
}

async function exactCount(table: string): Promise<number> {
  const { count, error } = await privileged
    .from(table)
    .select("*", { count: "exact", head: true });
  expect(error, `${table}: privileged count`).toBeNull();
  return count ?? -1;
}

const WRITTEN_TABLES = [
  "customers_contact",
  "addresses",
  "orders",
  "order_items",
  "purchase_snapshots",
  "payment_attempts",
] as const;

async function counts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const table of WRITTEN_TABLES) out[table] = await exactCount(table);
  out.counter = await counter();
  return out;
}

async function orderOf(attemptHash: string) {
  const { data, error } = await privileged
    .from("orders")
    .select(
      "id,order_number,customer_id,shipping_address_id,payment_status,fulfilment_status,subtotal_paise,shipping_paise,tax_paise,total_paise,business_rules_version,confirmation_token_hash,confirmation_token_salt,checkout_attempt_hash,checkout_payload_mac,expires_at,needs_review,synthetic",
    )
    .eq("checkout_attempt_hash", attemptHash)
    .maybeSingle();
  expect(error).toBeNull();
  return data as Record<string, unknown> | null;
}

const numberOf = (state: AttemptState) =>
  Number(state.orderNumber.replace(/^AS-/, ""));

let providerSequence = 0;
const providerOrderId = () =>
  `order_IT${runId}${String((providerSequence += 1)).padStart(4, "0")}`;

describe("0004_checkout — access: the publishable key reaches none of the five functions", () => {
  const CALLS: Array<[string, Record<string, unknown>]> = [
    ["checkout_attempt_state", { p_attempt_hash: "0".repeat(64) }],
    ["checkout_create_pending_order", { p_request: {} }],
    [
      "checkout_claim_provider_create",
      { p_payment_attempt_id: "00000000-0000-0000-0000-000000000000" },
    ],
    [
      "checkout_link_provider_order",
      {
        p_payment_attempt_id: "00000000-0000-0000-0000-000000000000",
        p_provider_order_id: "order_PLACEHOLDER001",
        p_provider_created_at: new Date().toISOString(),
      },
    ],
    [
      "checkout_close_provider_create",
      {
        p_payment_attempt_id: "00000000-0000-0000-0000-000000000000",
        p_outcome: "failed",
        p_reason: "probe",
        p_needs_review: false,
      },
    ],
  ];

  it.each(CALLS)(
    "%s is denied (42501) and writes nothing",
    async (name, args) => {
      const before = await counts();
      const result = await anon.rpc(name, args);
      expect(result.error?.code, name).toBe("42501");
      expect([401, 403], name).toContain(result.status);
      expect(await counts()).toEqual(before);
    },
  );

  it("a full, valid request from the publishable key is denied the same way — the denial is the grant, not the body", async () => {
    const before = await counts();
    const body = {
      attempt_hash: hex(),
      payload_mac: hex(),
      token_hash: hex(),
      token_salt: hex(),
      expected_total_paise: String(FIRST.price),
      contact: {
        name: "Anon Probe",
        email: `anon-${runId}@example.test`,
        phone: "9000000000",
      },
      address: {
        line1: "1 Test Lane",
        line2: null,
        city: "Mumbai",
        state: "Maharashtra",
        pincode: "400001",
      },
      items: [{ variant_code: FIRST.code, quantity: 1 }],
    };
    const result = await anon.rpc("checkout_create_pending_order", {
      p_request: body,
    });
    expect(result.error?.code).toBe("42501");
    expect(await counts()).toEqual(before);
    const contact = await privileged
      .from("customers_contact")
      .select("id")
      .eq("email", `anon-${runId}@example.test`);
    expect(contact.data).toEqual([]);
  });

  it("the read path answers null for an unknown attempt and refuses a malformed hash", async () => {
    expect(await store.attemptState(hex())).toEqual({ ok: true, value: null });
    expect(await store.attemptState("not-a-hash")).toEqual({
      ok: false,
      refusal: "invalid_request",
    });
  });
});

describe.skipIf(OPEN)(
  "0004_checkout — while the effective rule is CLOSED",
  () => {
    it("a valid request is refused as sales_closed with nothing written and no number taken", async () => {
      const before = await counts();
      const input = request();
      expect(await store.createPendingOrder(input)).toEqual({
        ok: false,
        refusal: "sales_closed",
      });
      expect(await counts()).toEqual(before);
      expect(await orderOf(input.attemptHash)).toBeNull();
    });
  },
);

describe.skipIf(!OPEN)("0004_checkout — the atomic write", () => {
  it("one allowed purchase commits the contact, the address, the order, its items, the snapshot and the payment attempt", async () => {
    const before = await counts();
    const { input, state } = await created();
    expect(state.replayed).toBe(false);
    expect(state.orderNumber).toMatch(/^AS-\d{4,12}$/);
    expect(numberOf(state)).toBe(before.counter);
    expect(state.providerOrderState).toBe("intent");
    expect(state.providerOrderId).toBeNull();
    expect(state.expiresAt).toBeNull();
    expect(state.paymentStatus).toBe("pending");
    expect(state.amountPaise).toBe(input.expectedTotalPaise);

    const after = await counts();
    expect(after).toEqual({
      customers_contact: before.customers_contact + 1,
      addresses: before.addresses + 1,
      orders: before.orders + 1,
      order_items: before.order_items + 2,
      purchase_snapshots: before.purchase_snapshots + 1,
      payment_attempts: before.payment_attempts + 1,
      counter: before.counter + 1,
    });

    const order = (await orderOf(input.attemptHash))!;
    expect(order).toMatchObject({
      order_number: state.orderNumber,
      payment_status: "pending",
      fulfilment_status: "pending_payment",
      subtotal_paise: Number(FIRST.price * BigInt(2) + SECOND.price),
      shipping_paise: rule.shipping_paise,
      tax_paise: null,
      total_paise: Number(input.expectedTotalPaise),
      business_rules_version: rule.version,
      confirmation_token_hash: input.tokenHash,
      confirmation_token_salt: input.tokenSalt,
      checkout_attempt_hash: input.attemptHash,
      checkout_payload_mac: input.payloadMac,
      expires_at: null,
      needs_review: false,
      synthetic: true,
    });

    const contact = await privileged
      .from("customers_contact")
      .select("email,phone,name,synthetic")
      .eq("id", order.customer_id as string)
      .single();
    expect(contact.data).toEqual({
      email: input.fields.email,
      phone: "9000000000",
      name: input.fields.name,
      synthetic: true,
    });
    const address = await privileged
      .from("addresses")
      .select(
        "customer_id,recipient_name,line1,line2,city,state,pincode,country,phone",
      )
      .eq("id", order.shipping_address_id as string)
      .single();
    expect(address.data).toEqual({
      customer_id: order.customer_id,
      recipient_name: input.fields.name,
      line1: input.fields.line1,
      line2: null,
      city: "Mumbai",
      state: "Maharashtra",
      pincode: "400001",
      country: "IN",
      phone: "9000000000",
    });

    const items = await privileged
      .from("order_items")
      .select(
        "variant_id,variant_code,finish_code,quantity,unit_price_paise,line_total_paise,stage",
      )
      .eq("order_id", order.id as string)
      .order("variant_code", { ascending: true });
    expect(items.error).toBeNull();
    expect(
      [...(items.data ?? [])].sort((a, b) =>
        String(a.variant_code).localeCompare(String(b.variant_code)),
      ),
    ).toEqual(
      [
        {
          variant_id: FIRST.id,
          variant_code: FIRST.code,
          finish_code: "antique-gold",
          quantity: 2,
          unit_price_paise: Number(FIRST.price),
          line_total_paise: Number(FIRST.price * BigInt(2)),
          stage: 0,
        },
        {
          variant_id: SECOND.id,
          variant_code: SECOND.code,
          finish_code: "antique-gold",
          quantity: 1,
          unit_price_paise: Number(SECOND.price),
          line_total_paise: Number(SECOND.price),
          stage: 0,
        },
      ].sort((a, b) => a.variant_code.localeCompare(b.variant_code)),
    );

    const snapshot = await privileged
      .from("purchase_snapshots")
      .select("snapshot,policy_version_ids,business_rules_version")
      .eq("order_id", order.id as string)
      .single();
    expect(snapshot.error).toBeNull();
    const snap = snapshot.data!.snapshot as Record<string, unknown>;
    expect(snapshot.data!.business_rules_version).toBe(rule.version);
    expect(snapshot.data!.policy_version_ids).toHaveLength(7);
    expect(snap).toMatchObject({
      v: 1,
      order_number: state.orderNumber,
      currency: "INR",
      synthetic: true,
      totals: {
        subtotal_paise: Number(FIRST.price * BigInt(2) + SECOND.price),
        shipping_paise: rule.shipping_paise,
        tax_paise: null,
        total_paise: Number(input.expectedTotalPaise),
      },
      address: {
        recipient_name: input.fields.name,
        line1: input.fields.line1,
        line2: null,
        city: "Mumbai",
        state: "Maharashtra",
        pincode: "400001",
        country: "IN",
      },
      rule: {
        version: rule.version,
        synthetic: true,
        pending_order_expiry_minutes: rule.pending_order_expiry_minutes,
      },
    });
    expect((snap.items as unknown[]).length).toBe(2);
    expect(
      (snap.policies as Array<{ policy_key: string }>).map((p) => p.policy_key),
    ).toEqual([
      "cancellation",
      "cookies",
      "privacy",
      "refunds",
      "returns",
      "shipping",
      "terms",
    ]);
    // The snapshot never carries the email address or the phone number.
    const text = JSON.stringify(snap);
    expect(text).not.toContain(input.fields.email);
    expect(text).not.toContain("9000000000");

    const attempt = await privileged
      .from("payment_attempts")
      .select(
        "provider,amount_paise,currency,status,signature_verified,provider_order_state,provider_order_id,provider_payment_id,provider_create_requested_at,provider_order_created_at",
      )
      .eq("order_id", order.id as string);
    expect(attempt.data).toEqual([
      {
        provider: "razorpay",
        amount_paise: Number(input.expectedTotalPaise),
        currency: "INR",
        status: "created",
        signature_verified: false,
        provider_order_state: "intent",
        provider_order_id: null,
        provider_payment_id: null,
        provider_create_requested_at: null,
        provider_order_created_at: null,
      },
    ]);
  });

  it("the same attempt again returns the same order and takes no number; the read path agrees", async () => {
    const { input, state } = await created();
    const before = await counts();
    // New token values on the retry are discarded: the stored hash and salt never rotate.
    const again = await store.createPendingOrder({
      ...input,
      tokenHash: hex(),
      tokenSalt: hex(),
    });
    expect(again.ok && again.value.replayed).toBe(true);
    expect(again.ok && again.value.orderNumber).toBe(state.orderNumber);
    expect(again.ok && again.value.paymentAttemptId).toBe(
      state.paymentAttemptId,
    );
    expect(await counts()).toEqual(before);
    const order = (await orderOf(input.attemptHash))!;
    expect(order.confirmation_token_hash).toBe(input.tokenHash);
    expect(order.confirmation_token_salt).toBe(input.tokenSalt);
    const read = await store.attemptState(input.attemptHash);
    expect(read.ok && read.value?.orderNumber).toBe(state.orderNumber);
  });

  it("the same attempt key with other details is refused and nothing is written", async () => {
    const { input } = await created();
    const before = await counts();
    expect(
      await store.createPendingOrder({ ...input, payloadMac: hex() }),
    ).toEqual({ ok: false, refusal: "attempt_payload_changed" });
    expect(await counts()).toEqual(before);
  });

  it("REAL concurrent submissions of one attempt create exactly one order", async () => {
    const before = await counts();
    const input = request();
    const results = await Promise.all(
      Array.from({ length: 6 }, () => store.createPendingOrder(input)),
    );
    const states = results.map((result) => {
      if (!result.ok) throw new Error(`refused: ${result.refusal}`);
      return result.value;
    });
    expect(new Set(states.map((s) => s.orderNumber)).size).toBe(1);
    expect(new Set(states.map((s) => s.paymentAttemptId)).size).toBe(1);
    expect(states.filter((s) => !s.replayed)).toHaveLength(1);
    const after = await counts();
    expect(after.orders).toBe(before.orders + 1);
    expect(after.customers_contact).toBe(before.customers_contact + 1);
    expect(after.payment_attempts).toBe(before.payment_attempts + 1);
    expect(after.counter).toBe(before.counter + 1);
  });

  it("REAL concurrent submissions of several attempts take distinct, contiguous numbers", async () => {
    const before = await counter();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => store.createPendingOrder(request())),
    );
    const numbers = results
      .map((result) => {
        if (!result.ok) throw new Error(`refused: ${result.refusal}`);
        return numberOf(result.value);
      })
      .sort((a, b) => a - b);
    expect(numbers).toEqual([0, 1, 2, 3, 4].map((offset) => before + offset));
    expect(await counter()).toBe(before + 5);
  });

  it("a failure in the middle of the transaction leaves no row and consumes no number", async () => {
    const { input: first } = await created();
    const before = await counts();
    // The contact and the address are inserted before the order; the order insert then fails on the unique
    // token hash. Nothing of the transaction may remain.
    const failing = request({ tokenHash: first.tokenHash });
    expect(await store.createPendingOrder(failing)).toEqual({
      ok: false,
      refusal: "unavailable",
    });
    expect(await counts()).toEqual(before);
    expect(await orderOf(failing.attemptHash)).toBeNull();
    const contact = await privileged
      .from("customers_contact")
      .select("id")
      .eq("email", failing.fields.email);
    expect(contact.data).toEqual([]);
    const address = await privileged
      .from("addresses")
      .select("id")
      .eq("line1", failing.fields.line1)
      .eq("recipient_name", failing.fields.name);
    expect(address.data).toEqual([]);
    // The next good order takes exactly the number the failed one would have had.
    const { state } = await created();
    expect(numberOf(state)).toBe(before.counter);
  });

  it("two guests with the same email and phone stay two customers, two addresses and two orders", async () => {
    const shared = request().fields;
    const a = await created({ fields: shared });
    const b = await created({ fields: shared });
    const first = (await orderOf(a.input.attemptHash))!;
    const second = (await orderOf(b.input.attemptHash))!;
    expect(first.order_number).not.toBe(second.order_number);
    expect(first.customer_id).not.toBe(second.customer_id);
    expect(first.shipping_address_id).not.toBe(second.shipping_address_id);
    const contacts = await privileged
      .from("customers_contact")
      .select("id")
      .eq("email", shared.email);
    expect(contacts.data).toHaveLength(2);
    // One guest's key reaches only that guest's order.
    const read = await store.attemptState(a.input.attemptHash);
    expect(read.ok && read.value?.orderNumber).toBe(a.state.orderNumber);
  });

  it.each<[string, () => Partial<PendingOrderRequest>, string]>([
    [
      "a total lower than the recomputed one",
      () => ({ expectedTotalPaise: BigInt(100) }),
      "total_changed",
    ],
    [
      "a total one paisa off",
      () => ({ expectedTotalPaise: request().expectedTotalPaise + BigInt(1) }),
      "total_changed",
    ],
    [
      "a variant code the catalogue does not hold",
      () => ({
        items: [
          { variant_code: `no-such-artwork-${runId}:white`, quantity: 1 },
        ],
        expectedTotalPaise: BigInt(1900000),
      }),
      "item_unavailable",
    ],
    [
      "a quantity of 100",
      () => ({ items: [{ variant_code: FIRST.code, quantity: 100 }] }),
      "invalid_request",
    ],
    [
      "a repeated variant",
      () => ({
        items: [
          { variant_code: FIRST.code, quantity: 1 },
          { variant_code: FIRST.code, quantity: 1 },
        ],
      }),
      "invalid_request",
    ],
    [
      "an upper-case email",
      () => ({ fields: { ...request().fields, email: "Upper@Example.test" } }),
      "invalid_request",
    ],
    [
      "a phone that is not an Indian mobile number",
      () => ({ fields: { ...request().fields, phone: "1234567890" } }),
      "invalid_request",
    ],
    [
      "a PIN code starting with 0",
      () => ({ fields: { ...request().fields, pincode: "012345" } }),
      "invalid_request",
    ],
    [
      "an over-long name",
      () => ({ fields: { ...request().fields, name: "n".repeat(121) } }),
      "invalid_request",
    ],
    [
      "an empty address line",
      () => ({ fields: { ...request().fields, line1: "" } }),
      "invalid_request",
    ],
    ["a malformed token hash", () => ({ tokenHash: "xyz" }), "invalid_request"],
  ])("refuses %s before any write (%s)", async (_label, change, refusal) => {
    const before = await counts();
    const input = request(change());
    expect(await store.createPendingOrder(input)).toEqual({
      ok: false,
      refusal,
    });
    expect(await counts()).toEqual(before);
  });

  it("a refusal carries a fixed message and never echoes what the customer typed", async () => {
    const marker = `leak-marker-${runId}`;
    const body = {
      attempt_hash: hex(),
      payload_mac: hex(),
      token_hash: hex(),
      token_salt: hex(),
      expected_total_paise: String(FIRST.price),
      contact: {
        name: marker,
        email: `${marker}@example.test`,
        phone: "1234567890",
      },
      address: {
        line1: marker,
        line2: null,
        city: marker,
        state: marker,
        pincode: "400001",
      },
      items: [{ variant_code: FIRST.code, quantity: 1 }],
    };
    const result = await privileged.rpc("checkout_create_pending_order", {
      p_request: body,
    });
    expect(result.error?.code).toBe("ZC001");
    expect(result.error?.message).toBe("checkout: invalid_request");
    expect(JSON.stringify(result.error)).not.toContain(marker);
    // Unknown keys are refused, never ignored.
    const extra = await privileged.rpc("checkout_create_pending_order", {
      p_request: {
        ...body,
        contact: { ...body.contact, phone: "9000000000" },
        synthetic: false,
      },
    });
    expect(extra.error?.code).toBe("ZC001");
  });

  it("a price changed or a variant made unavailable since the page was shown is refused — then restored", async () => {
    const original = await privileged
      .from("variants")
      .select("price_paise,availability")
      .eq("id", SECOND.id)
      .single();
    expect(original.error).toBeNull();
    const before = await counts();
    try {
      const raised = await privileged
        .from("variants")
        .update({ price_paise: Number(SECOND.price) + 100 })
        .eq("id", SECOND.id);
      expect(raised.error).toBeNull();
      // The page showed the old price: the recomputed total differs.
      expect(await store.createPendingOrder(request())).toEqual({
        ok: false,
        refusal: "total_changed",
      });
      const paused = await privileged
        .from("variants")
        .update({
          price_paise: Number(SECOND.price),
          availability: "unavailable",
        })
        .eq("id", SECOND.id);
      expect(paused.error).toBeNull();
      expect(await store.createPendingOrder(request())).toEqual({
        ok: false,
        refusal: "item_unavailable",
      });
    } finally {
      const restored = await privileged
        .from("variants")
        .update(original.data!)
        .eq("id", SECOND.id);
      expect(restored.error).toBeNull();
    }
    const readBack = await privileged
      .from("variants")
      .select("price_paise,availability")
      .eq("id", SECOND.id)
      .single();
    expect(readBack.data).toEqual(original.data);
    expect(await counts()).toEqual(before);
    // And the same request is accepted again.
    expect((await created()).state.replayed).toBe(false);
  });
});

describe.skipIf(!OPEN)("0004_checkout — the provider step", () => {
  it("REAL concurrent claims: exactly one request wins the provider call", async () => {
    const { state } = await created();
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        store.claimProviderCreate(state.paymentAttemptId),
      ),
    );
    const claims = results.map((result) => {
      if (!result.ok) throw new Error(`refused: ${result.refusal}`);
      return result.value;
    });
    expect(claims.filter((c) => c.claimed)).toHaveLength(1);
    for (const claim of claims) {
      expect(claim.providerOrderState).toBe("requested");
      expect(claim.providerCreateRequestedAt).not.toBeNull();
    }
    const later = await store.claimProviderCreate(state.paymentAttemptId);
    expect(later.ok && later.value.claimed).toBe(false);
  });

  it("the link stores the provider id and sets the deadline once: the provider's time plus the rule's minutes", async () => {
    const { input, state } = await created();
    await store.claimProviderCreate(state.paymentAttemptId);
    const providerId = providerOrderId();
    const createdAt = new Date(Date.now() - 2000);
    createdAt.setMilliseconds(0);
    const linked = await store.linkProviderOrder(
      state.paymentAttemptId,
      providerId,
      createdAt,
    );
    if (!linked.ok) throw new Error(`link refused: ${linked.refusal}`);
    expect(linked.value.linked).toBe(true);
    expect(linked.value.providerOrderState).toBe("linked");
    expect(linked.value.providerOrderId).toBe(providerId);
    const deadline =
      createdAt.getTime() + rule.pending_order_expiry_minutes * 60 * 1000;
    expect(linked.value.expiresAt?.getTime()).toBe(deadline);

    // The same id again changes nothing — and never extends the deadline, even with a later time.
    const again = await store.linkProviderOrder(
      state.paymentAttemptId,
      providerId,
      new Date(),
    );
    expect(again.ok && again.value.linked).toBe(false);
    expect(again.ok && again.value.expiresAt?.getTime()).toBe(deadline);
    // Another id for the same attempt is a conflict, never an overwrite.
    expect(
      await store.linkProviderOrder(
        state.paymentAttemptId,
        providerOrderId(),
        new Date(),
      ),
    ).toEqual({ ok: false, refusal: "state_conflict" });
    // A linked attempt is never closed.
    expect(
      await store.closeProviderCreate(
        state.paymentAttemptId,
        "failed",
        "probe_reason",
        false,
      ),
    ).toEqual({ ok: false, refusal: "state_conflict" });
    // The same provider order cannot be linked to another attempt.
    const other = await created();
    await store.claimProviderCreate(other.state.paymentAttemptId);
    expect(
      await store.linkProviderOrder(
        other.state.paymentAttemptId,
        providerId,
        new Date(),
      ),
    ).toEqual({ ok: false, refusal: "state_conflict" });
    const read = await store.attemptState(input.attemptHash);
    expect(read.ok && read.value?.expiresAt?.getTime()).toBe(deadline);
    // A replayed submission returns the same deadline too.
    const replay = await store.createPendingOrder(input);
    expect(replay.ok && replay.value.expiresAt?.getTime()).toBe(deadline);
  });

  it("an intent cannot be linked or closed before the claim, and an implausible provider time is refused", async () => {
    const { state } = await created();
    expect(
      await store.linkProviderOrder(
        state.paymentAttemptId,
        providerOrderId(),
        new Date(),
      ),
    ).toEqual({ ok: false, refusal: "state_conflict" });
    expect(
      await store.closeProviderCreate(
        state.paymentAttemptId,
        "unknown",
        "probe_reason",
        false,
      ),
    ).toEqual({ ok: false, refusal: "state_conflict" });
    await store.claimProviderCreate(state.paymentAttemptId);
    for (const time of [
      new Date(Date.now() - 24 * 60 * 60 * 1000),
      new Date(Date.now() + 24 * 60 * 60 * 1000),
    ])
      expect(
        await store.linkProviderOrder(
          state.paymentAttemptId,
          providerOrderId(),
          time,
        ),
      ).toEqual({ ok: false, refusal: "provider_time_out_of_range" });
    expect(
      await store.linkProviderOrder(
        state.paymentAttemptId,
        "not-an-order-id",
        new Date(),
      ),
    ).toEqual({ ok: false, refusal: "invalid_request" });
    const read = await privileged
      .from("payment_attempts")
      .select("provider_order_state,provider_order_id")
      .eq("id", state.paymentAttemptId)
      .single();
    expect(read.data).toEqual({
      provider_order_state: "requested",
      provider_order_id: null,
    });
  });

  it("closing as unknown holds the attempt with an audit row; it can still be linked by recovery, or closed failed", async () => {
    const a = await created();
    await store.claimProviderCreate(a.state.paymentAttemptId);
    const closed = await store.closeProviderCreate(
      a.state.paymentAttemptId,
      "unknown",
      "provider_timeout",
      false,
    );
    expect(closed.ok && closed.value.closed).toBe(true);
    expect(closed.ok && closed.value.providerOrderState).toBe("unknown");
    expect(closed.ok && closed.value.needsReview).toBe(false);
    // The same outcome again changes nothing and writes no second audit row.
    const repeat = await store.closeProviderCreate(
      a.state.paymentAttemptId,
      "unknown",
      "provider_timeout",
      false,
    );
    expect(repeat.ok && repeat.value.closed).toBe(false);
    const audit = await privileged
      .from("audit_log")
      .select("actor_type,action,entity_type,previous,next,reason")
      .eq("entity_type", "payment_attempt")
      .eq("entity_id", a.state.paymentAttemptId);
    expect(audit.data).toEqual([
      {
        actor_type: "system",
        action: "checkout.provider_create.unknown",
        entity_type: "payment_attempt",
        previous: { provider_order_state: "requested" },
        next: { provider_order_state: "unknown", needs_review: false },
        reason: "provider_timeout",
      },
    ]);
    // A claim never re-opens an unknown attempt.
    const claim = await store.claimProviderCreate(a.state.paymentAttemptId);
    expect(claim.ok && claim.value.claimed).toBe(false);
    // Recovery: unknown → linked.
    const recovered = await store.linkProviderOrder(
      a.state.paymentAttemptId,
      providerOrderId(),
      new Date(),
    );
    expect(recovered.ok && recovered.value.providerOrderState).toBe("linked");

    const b = await created();
    await store.claimProviderCreate(b.state.paymentAttemptId);
    const flagged = await store.closeProviderCreate(
      b.state.paymentAttemptId,
      "unknown",
      "provider_mismatch",
      true,
    );
    expect(flagged.ok && flagged.value.needsReview).toBe(true);
    const failed = await store.closeProviderCreate(
      b.state.paymentAttemptId,
      "failed",
      "provider_bad_request",
      false,
    );
    expect(failed.ok && failed.value.providerOrderState).toBe("failed");
    // Failed is final: no link, no claim, and the order is still pending — nothing here marks a payment failed.
    expect(
      await store.linkProviderOrder(
        b.state.paymentAttemptId,
        providerOrderId(),
        new Date(),
      ),
    ).toEqual({ ok: false, refusal: "state_conflict" });
    expect(failed.ok && failed.value.paymentStatus).toBe("pending");
  });

  it("refuses an unknown payment attempt id and malformed close arguments", async () => {
    const missing = "00000000-0000-4000-8000-000000000000";
    expect(await store.claimProviderCreate(missing)).toEqual({
      ok: false,
      refusal: "attempt_not_found",
    });
    const { state } = await created();
    await store.claimProviderCreate(state.paymentAttemptId);
    for (const [outcome, reason] of [
      ["linked", "probe_reason"],
      ["unknown", "Has Spaces"],
      ["unknown", ""],
    ] as const) {
      const result = await privileged.rpc("checkout_close_provider_create", {
        p_payment_attempt_id: state.paymentAttemptId,
        p_outcome: outcome,
        p_reason: reason,
        p_needs_review: false,
      });
      expect(result.error?.code).toBe("ZC001");
    }
  });
});

describe.skipIf(!OPEN)(
  "0004_checkout — the guard triggers bind the server role too",
  () => {
    it("an order's attempt binding, token hash, salt and set deadline never change", async () => {
      const { input, state } = await created();
      await store.claimProviderCreate(state.paymentAttemptId);
      await store.linkProviderOrder(
        state.paymentAttemptId,
        providerOrderId(),
        new Date(),
      );
      const order = (await orderOf(input.attemptHash))!;
      for (const change of [
        { checkout_attempt_hash: hex() },
        { checkout_attempt_hash: null, checkout_payload_mac: null },
        { checkout_payload_mac: hex() },
        { confirmation_token_hash: hex() },
        { confirmation_token_salt: hex() },
        {
          expires_at: new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000,
          ).toISOString(),
        },
        { expires_at: null },
      ]) {
        const result = await privileged
          .from("orders")
          .update(change)
          .eq("id", order.id as string)
          .select("id");
        expect(result.error?.code, JSON.stringify(Object.keys(change))).toBe(
          "23514",
        );
      }
      expect(await orderOf(input.attemptHash)).toEqual(order);
      // Other columns still change (S1.7 and the Admin will): the guard is narrow.
      const review = await privileged
        .from("orders")
        .update({ needs_review: true })
        .eq("id", order.id as string)
        .select("needs_review");
      expect(review.error).toBeNull();
    });

    it("a checkout payment attempt keeps its order, amount and provider id, and its state never moves backwards", async () => {
      const { state } = await created();
      await store.claimProviderCreate(state.paymentAttemptId);
      await store.linkProviderOrder(
        state.paymentAttemptId,
        providerOrderId(),
        new Date(),
      );
      const before = await privileged
        .from("payment_attempts")
        .select("*")
        .eq("id", state.paymentAttemptId)
        .single();
      for (const change of [
        { provider_order_state: "intent" },
        { provider_order_state: "requested" },
        { provider_order_state: "unknown" },
        { provider_order_state: "failed" },
        { provider_order_state: null },
        { amount_paise: 100 },
        { provider_order_id: providerOrderId() },
        { provider_order_created_at: new Date(0).toISOString() },
        { provider_create_requested_at: new Date(0).toISOString() },
      ]) {
        const result = await privileged
          .from("payment_attempts")
          .update(change)
          .eq("id", state.paymentAttemptId)
          .select("id");
        expect(result.error?.code, JSON.stringify(change)).toBe("23514");
      }
      const after = await privileged
        .from("payment_attempts")
        .select("*")
        .eq("id", state.paymentAttemptId)
        .single();
      expect(after.data).toEqual(before.data);
      // The payment's own fields stay writable for S1.7.
      const marked = await privileged
        .from("payment_attempts")
        .update({ status: "created" })
        .eq("id", state.paymentAttemptId)
        .select("id");
      expect(marked.error).toBeNull();
    });

    it("a second checkout row for one order is refused, and a non-checkout row never becomes one", async () => {
      const { input, state } = await created();
      const order = (await orderOf(input.attemptHash))!;
      const second = await privileged
        .from("payment_attempts")
        .insert({
          order_id: order.id,
          amount_paise: Number(state.amountPaise),
          provider_order_state: "intent",
        })
        .select("id");
      expect(second.error?.code).toBe("23505");
      // A per-payment row (S1.7's kind) is still allowed beside it …
      const plain = await privileged
        .from("payment_attempts")
        .insert({ order_id: order.id, amount_paise: Number(state.amountPaise) })
        .select("id")
        .single();
      expect(plain.error).toBeNull();
      // … and cannot be turned into a checkout row.
      const promoted = await privileged
        .from("payment_attempts")
        .update({ provider_order_state: "intent" })
        .eq("id", (plain.data as { id: string }).id)
        .select("id");
      expect(promoted.error?.code).toBe("23514");
      // The read path still finds exactly the checkout row.
      const read = await store.attemptState(input.attemptHash);
      expect(read.ok && read.value?.paymentAttemptId).toBe(
        state.paymentAttemptId,
      );
    });
  },
);

describe.skipIf(!OPEN)("0004_checkout — what the read path may show", () => {
  it("returns the launch facts and nothing personal", async () => {
    const { input } = await created();
    const raw = await privileged.rpc("checkout_attempt_state", {
      p_attempt_hash: input.attemptHash,
    });
    expect(raw.error).toBeNull();
    expect(Object.keys(raw.data as object).sort()).toEqual([
      "amount_paise",
      "currency",
      "expires_at",
      "needs_review",
      "order_number",
      "payment_attempt_id",
      "payment_status",
      "placed_at",
      "provider_create_requested_at",
      "provider_order_id",
      "provider_order_state",
      "server_time",
    ]);
    const text = JSON.stringify(raw.data);
    for (const never of [
      input.fields.email,
      input.fields.name,
      "9000000000",
      input.tokenHash,
      input.tokenSalt,
      input.payloadMac,
      sha(input.attemptHash),
    ])
      expect(text).not.toContain(never);
  });
});
