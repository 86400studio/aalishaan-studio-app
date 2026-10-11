import { randomBytes } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import { resolveTestTarget } from "../../scripts/testing/lib/supabase-target.mjs";

/**
 * 0002_orders on the real TEST project, after the apply and the seed (docs/database-changes/S1.1-0002-orders.md
 * → Verification 4; ENVIRONMENT-PARITY.md §12 P8b): every table denied to the publishable key with privileged
 * post-checks; the order number assigned by the database and refused from the caller; REAL concurrent inserts
 * producing distinct contiguous numbers; a forced abort consuming no number; the version bumped by the
 * database; the privileged role refused every UPDATE and DELETE on the append-only tables; duplicate ledger
 * and outbox keys refused; the ledger's fields immutable while its processing marks change.
 *
 * Two layers refuse a change to an append-only table, and this file can reach only the first: the server
 * role holds no UPDATE or DELETE privilege there, so Postgres answers "permission denied" (42501) before a
 * row trigger can fire. The assertions name that message. The trigger layer — refuse_change(), which also
 * binds the table owner — is proven once on TEST by the owner-role probe in the 0002 change record
 * (Verification); the one trigger this file does reach is the provider-event ledger guard.
 *
 * Rows this file writes are synthetic (`synthetic = true`, an `@example.test` address) and are retained
 * history by design: orders and the rows beneath them are append-only or non-deletable (the change record's
 * "Fixture lifecycle"); the rollback rehearsal on TEST is the only path that clears them.
 */

const NO_SESSION = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};
const runId = randomBytes(6).toString("hex");

let privileged: SupabaseClient;
let anon: SupabaseClient;
let customerId: string;
let addressId: string;
let variantId: string;

type OrderRow = {
  id: string;
  order_number: string;
  version: number;
  placed_at: string;
};

function orderInput(overrides: Record<string, unknown> = {}) {
  return {
    customer_id: customerId,
    shipping_address_id: addressId,
    subtotal_paise: 1900000,
    shipping_paise: null,
    tax_paise: null,
    total_paise: 1900000,
    business_rules_version: 1,
    synthetic: true,
    ...overrides,
  };
}

async function insertOrder(overrides: Record<string, unknown> = {}) {
  return privileged
    .from("orders")
    .insert(orderInput(overrides))
    .select("id,order_number,version,placed_at")
    .single();
}

function numberOf(order: OrderRow): number {
  return Number(order.order_number.replace(/^AS-/, ""));
}

/**
 * Denial is at the grant level: the publishable key's role holds no privilege on any order table, so every
 * statement is refused with 42501 before a row is looked at. An empty 200 is not accepted — it is also what
 * a readable but empty table answers, and nine of these tables are empty on a first run.
 */
function denied(
  result: { error: { code?: string } | null; status: number; data: unknown },
  label: string,
) {
  expect(result.error?.code, `${label}: Postgres code`).toBe("42501");
  expect([401, 403], `${label}: HTTP status`).toContain(result.status);
}

/** The privileged role refused because it does not hold the privilege at all — not by a trigger. */
function refusedByGrant(
  result: { error: { code?: string; message?: string } | null },
  table: string,
  label: string,
) {
  expect(result.error?.code, label).toBe("42501");
  expect(result.error?.message ?? "", label).toContain(
    `permission denied for table ${table}`,
  );
}

async function exactCount(table: string): Promise<number> {
  const { count, error } = await privileged
    .from(table)
    .select("*", { count: "exact", head: true });
  expect(error, `${table}: privileged count`).toBeNull();
  expect(count, `${table}: privileged count`).not.toBeNull();
  return count ?? -1;
}

/**
 * One syntactically valid write per table, and a filter value that matches no row: the privilege check refuses
 * the statement whatever it would match, and a probe that got through would still change nothing.
 */
const WRITE_PROBES: Array<{
  table: string;
  row: Record<string, unknown>;
  key: string;
  absent: string | number;
}> = [
  {
    table: "staff_profiles",
    row: { display_name: "zz anon probe" },
    key: "display_name",
    absent: "zz-no-such-row",
  },
  {
    table: "business_rules",
    row: { note: "zz anon probe" },
    key: "version",
    absent: 2147483647,
  },
  {
    table: "policy_versions",
    row: { title: "zz anon probe" },
    key: "policy_key",
    absent: "zz-no-such-row",
  },
  {
    table: "customers_contact",
    row: { name: "zz anon probe" },
    key: "name",
    absent: "zz-no-such-row",
  },
  {
    table: "addresses",
    row: { city: "zz anon probe" },
    key: "city",
    absent: "zz-no-such-row",
  },
  {
    table: "order_number_counter",
    row: { next_value: 999999 },
    key: "next_value",
    absent: -1,
  },
  {
    table: "orders",
    row: { needs_review: true },
    key: "order_number",
    absent: "AS-0000",
  },
  {
    table: "order_items",
    row: { quantity: 1 },
    key: "variant_code",
    absent: "zz-no-such-row:white",
  },
  {
    table: "purchase_snapshots",
    row: { snapshot: {} },
    key: "business_rules_version",
    absent: 2147483647,
  },
  {
    table: "payment_attempts",
    row: { status: "created" },
    key: "provider_order_id",
    absent: "zz-no-such-row",
  },
  {
    table: "provider_events",
    row: { event_id: "zz-anon-probe" },
    key: "event_id",
    absent: "zz-no-such-row",
  },
  {
    table: "pending_work",
    row: { dedupe_key: "zz-anon-probe" },
    key: "dedupe_key",
    absent: "zz-no-such-row",
  },
  {
    table: "work_history",
    row: { detail: "zz anon probe" },
    key: "detail",
    absent: "zz-no-such-row",
  },
  {
    table: "audit_log",
    row: { action: "zz.anon.probe" },
    key: "action",
    absent: "zz-no-such-row",
  },
];

beforeAll(async () => {
  const target = resolveTestTarget(process.env);
  if (!target.ok) throw new Error(target.reasons.join("; "));
  privileged = createClient(
    target.target.url,
    target.target.secretKey,
    NO_SESSION,
  );
  anon = createClient(
    target.target.url,
    target.target.publishableKey,
    NO_SESSION,
  );

  const rules = await privileged
    .from("business_rules")
    .select("version,sales_open,synthetic")
    .eq("version", 1)
    .maybeSingle();
  if (rules.error)
    throw new Error(
      `0002_orders is not applied on TEST (business_rules: ${rules.error.code}) — apply it and run pnpm db:test:seed --apply first`,
    );
  if (!rules.data)
    throw new Error(
      "business_rules version 1 is missing — run pnpm db:test:seed --apply first",
    );
  expect(rules.data).toMatchObject({ sales_open: false, synthetic: true });

  const contact = await privileged
    .from("customers_contact")
    .insert({
      email: `integration-${runId}@example.test`,
      phone: null,
      name: "Integration run",
      synthetic: true,
    })
    .select("id")
    .single();
  expect(contact.error).toBeNull();
  customerId = (contact.data as { id: string }).id;
  const address = await privileged
    .from("addresses")
    .insert({
      customer_id: customerId,
      recipient_name: "Integration run",
      line1: "Sample address",
      line2: null,
      city: "Mumbai",
      state: "Maharashtra",
      pincode: "400001",
      country: "IN",
      phone: null,
    })
    .select("id")
    .single();
  expect(address.error).toBeNull();
  addressId = (address.data as { id: string }).id;
  const variant = await privileged
    .from("variants")
    .select("id")
    .eq("variant_code", "the-bridge-of-blue-stone:white")
    .single();
  if (variant.error)
    throw new Error(
      "the seeded variant the-bridge-of-blue-stone:white is missing — run pnpm db:test:seed --apply first",
    );
  variantId = (variant.data as { id: string }).id;
});

describe("every order table is private to the publishable key", () => {
  it.each([
    "staff_profiles",
    "business_rules",
    "policy_versions",
    "customers_contact",
    "addresses",
    "order_number_counter",
    "orders",
    "order_items",
    "purchase_snapshots",
    "payment_attempts",
    "provider_events",
    "pending_work",
    "work_history",
    "audit_log",
  ])("anonymous SELECT on %s is denied", async (table) => {
    denied(await anon.from(table).select("*").limit(1), `select ${table}`);
  });

  it.each(WRITE_PROBES)(
    "anonymous insert, update and delete on $table are denied and its row count is unchanged",
    async ({ table, row, key, absent }) => {
      const before = await exactCount(table);
      denied(await anon.from(table).insert(row).select("*"), `insert ${table}`);
      denied(
        await anon.from(table).update(row).eq(key, absent).select("*"),
        `update ${table}`,
      );
      denied(
        await anon.from(table).delete().eq(key, absent).select("*"),
        `delete ${table}`,
      );
      expect(await exactCount(table)).toBe(before);
    },
  );

  it("anonymous inserts change nothing and no anonymous path allocates a number", async () => {
    const contact = await anon
      .from("customers_contact")
      .insert({ email: `anon-${runId}@example.test`, synthetic: true })
      .select("id");
    denied(contact, "insert customers_contact");
    const check = await privileged
      .from("customers_contact")
      .select("id")
      .eq("email", `anon-${runId}@example.test`);
    expect(check.error).toBeNull();
    expect(check.data).toEqual([]);
    const counterBefore = await privileged
      .from("order_number_counter")
      .select("next_value")
      .single();
    expect(counterBefore.error).toBeNull();
    const order = await anon
      .from("orders")
      .insert(orderInput())
      .select("order_number");
    denied(order, "insert orders");
    const rpc = await anon.rpc("next_order_number");
    expect(rpc.error).not.toBeNull();
    const counterAfter = await privileged
      .from("order_number_counter")
      .select("next_value")
      .single();
    expect(counterAfter.data).toEqual(counterBefore.data);
  });
});

describe("gapless numbering from the locked counter", () => {
  it("the database assigns AS-#### and refuses a caller-supplied number", async () => {
    const first = await insertOrder();
    expect(first.error).toBeNull();
    const order = first.data as OrderRow;
    expect(order.order_number).toMatch(/^AS-\d{4,}$/);
    expect(numberOf(order)).toBeGreaterThanOrEqual(1001);
    expect(order.version).toBe(1);
    const supplied = await insertOrder({ order_number: "AS-9999" });
    expect(supplied.error?.code).toBe("23514");
  });

  it("eight real concurrent inserts receive eight distinct contiguous numbers", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () => insertOrder()),
    );
    for (const r of results) expect(r.error).toBeNull();
    const numbers = results
      .map((r) => numberOf(r.data as OrderRow))
      .sort((a, b) => a - b);
    expect(new Set(numbers).size).toBe(8);
    expect(numbers[7] - numbers[0]).toBe(7);
  });

  it("an aborted insert consumes no number: the next success continues the run", async () => {
    const before = await insertOrder();
    expect(before.error).toBeNull();
    // The trigger takes a number first; the row then fails orders_total_is_sum, so the whole statement rolls back.
    const aborted = await insertOrder({ total_paise: 1900001 });
    expect(aborted.error?.code).toBe("23514");
    const negative = await insertOrder({ subtotal_paise: -5, total_paise: -5 });
    expect(negative.error?.code).toBe("23514");
    const after = await insertOrder();
    expect(after.error).toBeNull();
    expect(numberOf(after.data as OrderRow)).toBe(
      numberOf(before.data as OrderRow) + 1,
    );
  });

  it("the number and placed_at are immutable and version is bumped by the database on update", async () => {
    const created = await insertOrder();
    expect(created.error).toBeNull();
    const order = created.data as OrderRow;
    const rename = await privileged
      .from("orders")
      .update({ order_number: "AS-1000" })
      .eq("id", order.id)
      .select("id");
    expect(rename.error?.code).toBe("23514");
    const bump = await privileged
      .from("orders")
      .update({ needs_review: true })
      .eq("id", order.id)
      .select("version,order_number,placed_at")
      .single();
    expect(bump.error).toBeNull();
    expect(bump.data).toMatchObject({
      version: 2,
      order_number: order.order_number,
      placed_at: order.placed_at,
    });
    const again = await privileged
      .from("orders")
      .update({ needs_review: false, version: 99 })
      .eq("id", order.id)
      .select("version")
      .single();
    expect((again.data as { version: number }).version).toBe(3);
  });
});

describe("items, snapshots and money", () => {
  it("stores the purchased variant with exact paise and a generated line total; refuses a quantity above 99", async () => {
    const created = await insertOrder({
      subtotal_paise: 3800000,
      total_paise: 3800000,
    });
    expect(created.error).toBeNull();
    const orderId = (created.data as OrderRow).id;
    const item = await privileged
      .from("order_items")
      .insert({
        order_id: orderId,
        variant_id: variantId,
        variant_code: "the-bridge-of-blue-stone:white",
        finish_code: "white",
        quantity: 2,
        unit_price_paise: 1900000,
      })
      .select("line_total_paise,stage")
      .single();
    expect(item.error).toBeNull();
    expect(
      Number(
        (item.data as { line_total_paise: number | string }).line_total_paise,
      ),
    ).toBe(3800000);
    expect((item.data as { stage: number }).stage).toBe(0);
    const tooMany = await privileged.from("order_items").insert({
      order_id: orderId,
      variant_id: variantId,
      variant_code: "the-bridge-of-blue-stone:white",
      finish_code: "white",
      quantity: 100,
      unit_price_paise: 1900000,
    });
    // The check constraint, not the (order, variant) unique key: a check is evaluated before the index.
    expect(tooMany.error?.code).toBe("23514");
    const snapshot = await privileged
      .from("purchase_snapshots")
      .insert({
        order_id: orderId,
        snapshot: {
          items: [
            {
              variant_code: "the-bridge-of-blue-stone:white",
              quantity: 2,
              unit_price_paise: "1900000",
            },
          ],
        },
        policy_version_ids: [],
        business_rules_version: 1,
      })
      .select("id")
      .single();
    expect(snapshot.error).toBeNull();
    const snapshotId = (snapshot.data as { id: string }).id;
    const tamper = await privileged
      .from("purchase_snapshots")
      .update({ snapshot: { items: [] } })
      .eq("id", snapshotId)
      .select("id");
    refusedByGrant(tamper, "purchase_snapshots", "snapshot update");
    const erase = await privileged
      .from("purchase_snapshots")
      .delete()
      .eq("id", snapshotId)
      .select("id");
    refusedByGrant(erase, "purchase_snapshots", "snapshot delete");
    const still = await privileged
      .from("purchase_snapshots")
      .select("snapshot")
      .eq("id", snapshotId)
      .single();
    expect(
      (still.data as { snapshot: { items: unknown[] } }).snapshot.items,
    ).toHaveLength(1);
  });
});

describe("append-only ledgers and the outbox", () => {
  it("the audit log, addresses, policy and rule versions refuse UPDATE and DELETE for the privileged role, which holds neither privilege there", async () => {
    const audit = await privileged
      .from("audit_log")
      .insert({
        actor_type: "system",
        actor_id: null,
        action: "integration.probe",
        entity_type: "test",
        entity_id: runId,
        previous: null,
        next: { ok: true },
        reason: "integration suite",
        external_ref: null,
      })
      .select("id")
      .single();
    expect(audit.error).toBeNull();
    const auditId = (audit.data as { id: string }).id;
    refusedByGrant(
      await privileged
        .from("audit_log")
        .update({ reason: "x" })
        .eq("id", auditId)
        .select("id"),
      "audit_log",
      "audit update",
    );
    refusedByGrant(
      await privileged
        .from("audit_log")
        .delete()
        .eq("id", auditId)
        .select("id"),
      "audit_log",
      "audit delete",
    );
    refusedByGrant(
      await privileged
        .from("addresses")
        .update({ line1: "moved" })
        .eq("id", addressId)
        .select("id"),
      "addresses",
      "address update",
    );
    refusedByGrant(
      await privileged
        .from("addresses")
        .delete()
        .eq("id", addressId)
        .select("id"),
      "addresses",
      "address delete",
    );
    refusedByGrant(
      await privileged
        .from("business_rules")
        .update({ sales_open: true, sales_open_reason: null })
        .eq("version", 1)
        .select("version"),
      "business_rules",
      "rule update",
    );
    refusedByGrant(
      await privileged
        .from("business_rules")
        .delete()
        .eq("version", 1)
        .select("version"),
      "business_rules",
      "rule delete",
    );
    refusedByGrant(
      await privileged
        .from("policy_versions")
        .update({ terms_status: "effective" })
        .eq("policy_key", "terms")
        .select("id"),
      "policy_versions",
      "policy update",
    );
    refusedByGrant(
      await privileged
        .from("policy_versions")
        .delete()
        .eq("policy_key", "terms")
        .select("id"),
      "policy_versions",
      "policy delete",
    );
    const rules = await privileged
      .from("business_rules")
      .select("sales_open")
      .eq("version", 1)
      .single();
    expect((rules.data as { sales_open: boolean }).sales_open).toBe(false);
  });

  it("a provider event is unique per (provider, event_id); its ledger fields are immutable while its processing marks change; it cannot be deleted", async () => {
    const eventId = `evt_integration_${runId}`;
    const first = await privileged
      .from("provider_events")
      .insert({
        provider: "razorpay",
        event_id: eventId,
        event_type: "payment.captured",
        signature_ok: true,
        payload: { probe: runId },
      })
      .select("id")
      .single();
    expect(first.error).toBeNull();
    const id = (first.data as { id: string }).id;
    const duplicate = await privileged.from("provider_events").insert({
      provider: "razorpay",
      event_id: eventId,
      event_type: "payment.captured",
      signature_ok: true,
      payload: { probe: "again" },
    });
    expect(duplicate.error?.code).toBe("23505");
    // The server role holds UPDATE here, so these two reach the trigger: its own message, not "permission denied".
    for (const change of [
      { payload: { tampered: true } },
      { signature_ok: false },
    ]) {
      const tampered = await privileged
        .from("provider_events")
        .update(change)
        .eq("id", id)
        .select("id");
      expect(tampered.error?.code).toBe("42501");
      expect(tampered.error?.message ?? "").toContain(
        "ledger fields are immutable",
      );
    }
    const mark = await privileged
      .from("provider_events")
      .update({
        processing_status: "processed",
        processed_at: new Date().toISOString(),
        processing_note: "integration",
      })
      .eq("id", id)
      .select("processing_status")
      .single();
    expect(mark.error).toBeNull();
    expect((mark.data as { processing_status: string }).processing_status).toBe(
      "processed",
    );
    refusedByGrant(
      await privileged
        .from("provider_events")
        .delete()
        .eq("id", id)
        .select("id"),
      "provider_events",
      "event delete",
    );
    const kept = await privileged
      .from("provider_events")
      .select("signature_ok,payload")
      .eq("id", id)
      .single();
    expect(kept.error).toBeNull();
    expect(kept.data).toEqual({
      signature_ok: true,
      payload: { probe: runId },
    });
  });

  it("the outbox deduplicates on dedupe_key and its history is append-only", async () => {
    const key = `integration:${runId}:confirmation`;
    const work = await privileged
      .from("pending_work")
      .insert({
        kind: "send_confirmation",
        entity_type: "order",
        entity_id: null,
        dedupe_key: key,
        payload: { run: runId },
        // Finished from the start: the unit is retained with its history (below), and a queued one would be
        // claimed by the S1.8 worker on TEST with no order behind it.
        status: "done",
      })
      .select("id")
      .single();
    expect(work.error).toBeNull();
    const workId = (work.data as { id: string }).id;
    const duplicate = await privileged.from("pending_work").insert({
      kind: "send_confirmation",
      entity_type: "order",
      entity_id: null,
      dedupe_key: key,
      payload: {},
    });
    expect(duplicate.error?.code).toBe("23505");
    const history = await privileged
      .from("work_history")
      .insert({
        pending_work_id: workId,
        attempt: 1,
        outcome: "retry",
        detail: "integration",
      })
      .select("id")
      .single();
    expect(history.error).toBeNull();
    const historyId = (history.data as { id: string }).id;
    refusedByGrant(
      await privileged
        .from("work_history")
        .update({ detail: "rewritten" })
        .eq("id", historyId)
        .select("id"),
      "work_history",
      "history update",
    );
    refusedByGrant(
      await privileged
        .from("work_history")
        .delete()
        .eq("id", historyId)
        .select("id"),
      "work_history",
      "history delete",
    );
    // A unit of work that has history cannot be removed either: its history row references it and history is
    // never deleted. Both rows are retained synthetic history (the 0002 record → "Fixture lifecycle").
    // 23503 on Postgres 17; Postgres 18 reports an ON DELETE RESTRICT refusal as 23001.
    const removed = await privileged
      .from("pending_work")
      .delete()
      .eq("id", workId)
      .select("id");
    expect(removed.error?.code).toMatch(/^23(503|001)$/);
  });
});
