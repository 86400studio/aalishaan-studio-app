import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/** The privileged client as a stand-in: each function call recorded with the abort signal it was given, if any. */
const fakeClient = vi.hoisted(() => {
  const calls: Array<{ name: string; signal: AbortSignal | null }> = [];
  const client = {
    rpc(name: string) {
      const call = { name, signal: null as AbortSignal | null };
      calls.push(call);
      const answer = Promise.resolve({ data: null, error: null });
      return Object.assign(answer, {
        abortSignal(signal: AbortSignal) {
          call.signal = signal;
          return answer;
        },
      });
    },
  };
  return { calls, client };
});
vi.mock("@/lib/server/supabase", () => ({
  createPrivilegedClient: () => ({ ok: true, client: fakeClient.client }),
}));

import type { RpcCall } from "@/lib/server/checkout/store";
import {
  ORDER_READ_TIMEOUT_MS,
  privilegedPaymentStore,
} from "@/lib/server/payments/client";
import {
  createPaymentStore,
  PAYMENT_REFUSALS,
} from "@/lib/server/payments/store";

/**
 * The atomic confirmation — S1.7. Two halves, both hermetic:
 *
 * 1. Guards of 0005_payment_finalization and its down file (docs/database-changes/S1.7-0005-payment-finalization.md):
 *    additive, one nullable column and five narrow functions in the house style (pinned empty search_path, never
 *    SECURITY DEFINER, EXECUTE for service_role only), no table privilege or policy change, no generic SQL entry
 *    point, no exception block (so a failure always rolls the whole transaction back and the ledger row stays
 *    unprocessed), every refusal a custom SQLSTATE the server maps, the fixed lock order, ONE place where an order
 *    becomes captured — with its audit row and its unit of pending work in the same function — and a down file that
 *    reverses exactly what the forward file adds and says what it loses.
 * 2. The server's adapter over those functions (src/lib/server/payments/store.ts): one call per function, every
 *    answer parsed, every refusal one enumerated reason from the SQLSTATE alone.
 *
 * What the functions DO against a real database — the single confirmation, the replays, the races, the reviews, the
 * rollback — is tests/integration/payments.test.ts.
 */

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (relative: string) =>
  readFileSync(path.join(ROOT, relative), "utf8");

const up = read("supabase/migrations/0005_payment_finalization.sql");
const down = read("supabase/rollbacks/0005_payment_finalization.down.sql");
const downLower = down.toLowerCase();

/** The SQL without its comments; lines split on LF or CRLF. */
function statementsOnly(sql: string): string {
  return sql
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n")
    .toLowerCase();
}

/** The statements without the `comment on … is '…';` texts, which describe the rules in words. */
const code = statementsOnly(up).replace(
  /comment on [^;']*? is\s+'(?:[^']|'')*';/g,
  "",
);

const FUNCTIONS = [
  "public.payment_record_event(text, text, jsonb)",
  "public.payment_process_event(uuid)",
  "public.payment_return_state(text, text)",
  "public.payment_record_provider_check(uuid, text, text)",
  "public.order_confirmation_view(text)",
] as const;

/** The body of one function: from its `create or replace` to the next one (or the end). */
function bodyOf(name: string): string {
  const start = code.indexOf(`create or replace function public.${name}`);
  expect(start, name).toBeGreaterThanOrEqual(0);
  const next = code.indexOf("create or replace function public.", start + 1);
  return code.slice(start, next === -1 ? undefined : next);
}

const record = bodyOf("payment_record_event");
const process = bodyOf("payment_process_event");
const returned = bodyOf("payment_return_state");
const providerCheck = bodyOf("payment_record_provider_check");
const view = bodyOf("order_confirmation_view");

describe("supabase/migrations/0005_payment_finalization.sql — additive", () => {
  it("adds exactly one nullable column, to orders, with its two constraints", () => {
    expect(code.match(/add column \w+/g)).toEqual(["add column payment_hold"]);
    // Nullable, no default: existing rows are untouched and no rewrite is needed.
    for (const line of code.match(/add column [^\n]+/g) ?? []) {
      expect(line).not.toContain("not null");
      expect(line).not.toContain("default");
    }
    expect(code.match(/alter table public\.\w+/g)).toEqual([
      "alter table public.orders",
    ]);
    expect(code.match(/add constraint \w+/g)).toEqual([
      "add constraint orders_payment_hold_allowed",
      "add constraint orders_payment_hold_with_review",
    ]);
    // Two holds, and a hold never stands without the review flag it raised.
    expect(code).toContain(
      "check (payment_hold is null or payment_hold in ('authorized_only', 'capture_unverified'))",
    );
    expect(code).toContain("check (payment_hold is null or needs_review)");
  });

  it("creates no table, type, view, policy, trigger or index and changes no table privilege", () => {
    for (const never of [
      "create table",
      "create type",
      "create view",
      "create policy",
      "alter policy",
      "create trigger",
      "create index",
      "create unique index",
      "disable row level security",
      " on table ",
      "grant select",
      "grant insert",
      "grant update",
      "grant delete",
      "grant all",
    ])
      expect(code, never).not.toContain(never);
  });

  it("creates exactly the five payment functions", () => {
    const created = [
      ...code.matchAll(/create or replace function (public\.\w+)\s*\(/g),
    ].map((match) => match[1]);
    expect(created).toEqual([
      "public.payment_record_event",
      "public.payment_process_event",
      "public.payment_return_state",
      "public.payment_record_provider_check",
      "public.order_confirmation_view",
    ]);
  });

  it("hardens every function: plpgsql, pinned empty search_path, never SECURITY DEFINER, EXECUTE for service_role only", () => {
    expect(code).not.toContain("security definer");
    expect(code.match(/language plpgsql/g)).toHaveLength(FUNCTIONS.length);
    expect(code.match(/set search_path = ''/g)).toHaveLength(FUNCTIONS.length);
    for (const signature of FUNCTIONS) {
      expect(code, signature).toContain(
        `revoke execute on function ${signature} from public, anon, authenticated;`,
      );
      expect(code, signature).toContain(
        `grant execute on function ${signature} to service_role;`,
      );
    }
    // No grant to anyone else, of anything.
    const grants = code.match(/grant [^;]+;/g) ?? [];
    expect(grants).toHaveLength(FUNCTIONS.length);
    for (const grant of grants) expect(grant).toMatch(/to service_role;$/);
  });

  it("offers no generic SQL entry point and catches no error — a failure rolls the whole call back", () => {
    // No dynamic SQL: nothing is assembled from an argument and executed.
    expect(code).not.toMatch(/\bexecute\s+format\b/);
    expect(code).not.toMatch(/\bexecute\s+'/);
    expect(code).not.toMatch(/\bexecute\s+\w+\s*;/);
    // No EXCEPTION block: any failure aborts the statement, so the transaction rolls back whole — the ledger row
    // stays unprocessed and the next delivery picks it up.
    expect(code).not.toMatch(/\bexception\s+when\b/);
    expect(code).not.toMatch(/\bwhen\s+others\b/);
  });

  it("is additive: no drop, delete, truncate, alter type or destructive statement, and it never inserts an order", () => {
    for (const never of [
      "drop ",
      "delete from",
      "truncate",
      "alter type",
      "alter system",
      "disable trigger",
      "cascade",
      "insert into public.orders",
      "insert into public.order_items",
      "insert into public.customers_contact",
      "insert into public.addresses",
      "insert into public.purchase_snapshots",
    ])
      expect(code, never).not.toContain(never);
    // The only tables written: the ledger, the payment rows, the order's statuses, its items' stage, the audit log
    // and the outbox.
    expect(
      [
        ...new Set(
          [...code.matchAll(/insert into (public\.\w+)/g)].map((m) => m[1]),
        ),
      ].sort(),
    ).toEqual([
      "public.audit_log",
      "public.payment_attempts",
      "public.pending_work",
      "public.provider_events",
    ]);
    expect(
      [
        ...new Set(
          [...code.matchAll(/\bupdate (public\.\w+)/g)].map((m) => m[1]),
        ),
      ].sort(),
    ).toEqual([
      "public.order_items",
      "public.orders",
      "public.payment_attempts",
      "public.provider_events",
    ]);
  });

  it("has no pipeline-incompatible statement, so the CLI applies it as one implicit transaction", () => {
    for (const never of [
      "concurrently",
      "vacuum",
      "create database",
      "begin;",
      "commit;",
    ])
      expect(code, never).not.toContain(never);
  });

  it("refuses with fixed messages under custom SQLSTATEs — exactly the codes the server maps", () => {
    const raised = new Set(
      [...code.matchAll(/errcode = '(zp\d{3})'/g)].map((match) =>
        match[1].toUpperCase(),
      ),
    );
    expect([...raised].sort()).toEqual(Object.keys(PAYMENT_REFUSALS).sort());
    // Each refusal is the fixed text "payment: <reason>" with the mapped reason — no value interpolated.
    const raises = [
      ...code.matchAll(
        /raise exception '(payment: [a-z_]+)'\s+using errcode = '(zp\d{3})'/g,
      ),
    ];
    expect(raises.length).toBeGreaterThanOrEqual(10);
    for (const match of raises)
      expect(
        PAYMENT_REFUSALS[
          match[2].toUpperCase() as keyof typeof PAYMENT_REFUSALS
        ],
      ).toBe(match[1].replace("payment: ", ""));
    const all = code.match(/raise exception[^;]*;/g) ?? [];
    expect(all).toHaveLength(raises.length);
    for (const raise of all) expect(raise).not.toContain("%");
  });
});

describe("payment_record_event — the insert-first ledger step", () => {
  it("stores only what the caller has verified, and never overwrites a stored event", () => {
    // Every row it writes is a Razorpay event marked verified: the server calls it only after the signature check.
    const inserts =
      record.match(
        /insert into public\.provider_events[\s\S]*?returning id into v_id;/g,
      ) ?? [];
    expect(inserts).toHaveLength(2);
    for (const insert of inserts) {
      expect(insert).toMatch(
        /values \('razorpay', \w+, p_event_type, true, p_payload\)/,
      );
      expect(insert).toContain("on conflict (provider, event_id) do nothing");
    }
    expect(record).not.toMatch(/\bupdate\b/);
    // The same id with other content is kept beside the first, under the id plus a digest of that content.
    expect(record).toContain(
      "v_key := p_event_id || '#' || substr(encode(sha256(convert_to(p_payload::text, 'utf8')), 'hex'), 1, 32);",
    );
    // A caller cannot name a derived id itself: the id's shape has no '#'.
    expect(record).toContain("p_event_id !~ '^[a-za-z0-9_.:-]{1,120}$'");
    // No business effect lives here.
    for (const never of [
      "public.orders",
      "public.payment_attempts",
      "public.pending_work",
      "public.audit_log",
    ])
      expect(record, never).not.toContain(never);
  });
});

describe("payment_process_event — one event, one effect, one transaction", () => {
  it("reads the event from its ledger row alone and takes no amount, id or status from the caller", () => {
    expect(process).toMatch(/payment_process_event\(p_event uuid\)/);
    expect(process).toContain(
      "v_entity := v_event.payload #> '{payload,payment,entity}';",
    );
    // Only a verified Razorpay row is ever processed.
    expect(process).toContain(
      "if not found or v_event.provider <> 'razorpay' or v_event.signature_ok is not true then",
    );
    // An already final row answers its recorded outcome: the effect is not repeated.
    expect(process).toContain(
      "if v_event.processing_status in ('processed', 'ignored') then",
    );
    expect(process).toContain("'replayed', true");
  });

  it("locks in the fixed order: the ledger row, the checkout's payment attempt, its order, the payment's own row", () => {
    const locks = [
      ...process.matchAll(/from public\.(\w+) (\w+)[^;]*?for update;/g),
    ].map((match) => `${match[1]} ${match[2]}`);
    expect(locks).toEqual([
      "provider_events pe",
      "payment_attempts pa",
      "orders o",
      "payment_attempts p",
    ]);
    // The order is found through the checkout row that holds the provider's order id — never a guess.
    expect(process).toContain("and pa.provider_order_id = v_provider_order_id");
    expect(process).toContain("and pa.provider_order_state is not null");
    // The other two writers follow the same order: the attempt, then its order.
    for (const body of [returned, providerCheck]) {
      const order = [
        ...body.matchAll(/from public\.(\w+) \w+[^;]*?for update;/g),
      ].map((match) => match[1]);
      expect(order.slice(0, 2)).toEqual(["payment_attempts", "orders"]);
    }
  });

  it("only payment.captured can confirm, and the confirmation is written in ONE place, whole", () => {
    // The three event types it acts on; everything else (order.paid included) is ignored.
    expect(process).toContain("when 'payment.captured' then 'captured'");
    expect(process).toContain("when 'payment.authorized' then 'authorized'");
    expect(process).toContain("when 'payment.failed' then 'failed'");
    expect(process).not.toContain("order.paid");
    expect(process).toContain("v_outcome := 'unsupported_event';");

    // Exactly one statement in the whole migration makes an order captured.
    expect(code.match(/payment_status = 'captured'/g)).toHaveLength(2);
    const confirm = process.slice(
      process.indexOf("if v_reason is null and v_kind = 'captured' then"),
      process.indexOf("v_outcome := 'confirmed';"),
    );
    expect(confirm.length).toBeGreaterThan(200);
    expect(confirm).toMatch(
      /update public\.orders\s+set payment_status = 'captured',\s+fulfilment_status = 'confirmed',\s+confirmed_at = now\(\),\s+needs_review = false,\s+payment_hold = null\s+where id = v_order\.id;/,
    );
    // The order, its items, the audit row and the unit of pending work — in that order, in that one branch.
    const order = [
      "update public.orders",
      "update public.order_items set stage = 1 where order_id = v_order.id and stage = 0;",
      "insert into public.audit_log",
      "'payment.captured.confirmed'",
      "insert into public.pending_work",
      "raise exception 'payment: outbox_conflict'",
    ].map((needle) => confirm.indexOf(needle));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // Nowhere else is an order confirmed, an item advanced or work queued.
    expect(code.match(/insert into public\.pending_work/g)).toHaveLength(1);
    expect(code.match(/confirmed_at = now\(\)/g)).toHaveLength(1);
    expect(code.match(/update public\.order_items/g)).toHaveLength(1);
    for (const body of [record, returned, providerCheck, view]) {
      expect(body).not.toContain("confirmed_at =");
      expect(body).not.toContain("pending_work");
      // No other function assigns an order's payment or fulfilment status (reading them in a condition is fine).
      expect(body).not.toMatch(
        /update public\.orders[^;]*\b(payment_status|fulfilment_status)\s*=/,
      );
    }
  });

  it("confirms only an order that awaits payment, for the stored amount in INR, alone, in time and under no other review", () => {
    const reasons = process.slice(
      process.indexOf("v_reason := case"),
      process.indexOf("if v_reason is null and v_kind = 'captured' then"),
    );
    const expected = [
      "when v_order.payment_status = 'captured' then 'extra_payment'",
      "when v_order.payment_status <> 'pending' or v_order.fulfilment_status <> 'pending_payment'",
      "then 'order_not_payable'",
      "when v_currency <> 'inr' then 'currency_mismatch'",
      "when v_amount <> v_order.total_paise or v_amount <> v_pa.amount_paise then 'amount_mismatch'",
      "when v_other_live then 'extra_payment'",
      "when v_kind = 'captured' and v_order.expires_at is null then 'expiry_missing'",
      "when v_kind = 'captured' and v_event.received_at > v_order.expires_at then 'late_capture'",
      "when v_kind = 'captured' and v_order.needs_review and v_order.payment_hold is null",
      "then 'order_under_review'",
    ].map((needle) => reasons.indexOf(needle));
    expect(expected.every((index) => index >= 0)).toBe(true);
    expect(expected).toEqual([...expected].sort((a, b) => a - b));
    // D-20: the deadline is judged by the event's own ledger time — the database's clock when the delivery was
    // stored — never by a provider timestamp and never extended.
    expect(code.match(/expires_at/g)?.length).toBeGreaterThan(0);
    expect(process).not.toMatch(/created_at['"\s]*\)?\s*[<>]/);
    expect(process).not.toMatch(
      /now\(\)\s*[<>]=?\s*v_order\.expires_at|v_order\.expires_at\s*[<>]=?\s*now\(\)/,
    );
    // A review no later capture clears: the flag without a hold, and its reason audited.
    expect(process).toMatch(
      /update public\.orders\s+set needs_review = true,\s+payment_hold = null\s+where id = v_order\.id;/,
    );
    expect(process).toContain("'payment.review.' || v_reason");
  });

  it("never asks whether the store is open: a payment already made is processed while intake is closed", () => {
    expect(code).not.toContain("business_rules");
    expect(code).not.toContain("sales_open");
  });

  it("moves a payment's row only forward, and writes nothing it cannot hold as it is", () => {
    expect(process).toContain(
      "(v_kind = 'captured' and v_pay.status = 'captured')",
    );
    expect(process).toContain(
      "(v_kind = 'authorized' and v_pay.status in ('authorized', 'captured'))",
    );
    expect(process).toContain(
      "(v_kind = 'failed' and v_pay.status in ('failed', 'authorized', 'captured'))",
    );
    expect(process).toContain(
      "v_storable := v_currency = 'inr' and v_amount between 1 and 100000000000;",
    );
    // A value the row cannot hold touches no row at all — an existing row is left exactly as it was, never
    // advanced under its old amount and currency (the independent check of 2026-11-23).
    expect(process).toContain("if v_storable and v_pay_found then");
    expect(process).toMatch(
      /set status = v_kind,\s+signature_verified = true,\s+amount_paise = v_amount\s+where id = v_pay\.id;/,
    );
    expect(process).not.toContain("else amount_paise end");
    // A payment id that is already on another order's row is never rebound.
    expect(process).toContain("v_reason := 'payment_conflict';");
  });

  it("counts every other known payment of the order that has not failed as live — a capture beside it is an extra payment", () => {
    const live = process.slice(
      process.indexOf("v_other_live := exists ("),
      process.indexOf("-- (e) every reason"),
    );
    expect(live).toContain("and x.order_id = v_order.id".replace("and ", ""));
    expect(live).toContain("and x.provider_order_state is null");
    expect(live).toContain("and x.status <> 'failed'");
    expect(live).toContain(
      "and x.provider_payment_id is distinct from v_payment_id",
    );
    // Not only the signed events' statuses: a verified report or the provider check's row counts too.
    expect(live).not.toContain("x.status in ('authorized', 'captured')");
  });

  it("queues one unit of work per order, with no token and no personal data, and stops whole if the key is foreign", () => {
    const outbox = process.slice(
      process.indexOf("insert into public.pending_work"),
      process.indexOf("v_outcome := 'confirmed';"),
    );
    expect(outbox).toContain("'send_confirmation'");
    expect(outbox).toContain("'send_confirmation:order:' || v_order.id::text");
    expect(outbox).toContain("jsonb_build_object('v', 1)");
    expect(outbox).toContain("on conflict (dedupe_key) do nothing;");
    expect(outbox).toContain("and w.kind = 'send_confirmation'");
    expect(outbox).toContain("and w.entity_id = v_order.id;");
    for (const never of [
      "token",
      "salt",
      "email",
      "phone",
      "customer",
      "address",
    ])
      expect(outbox, never).not.toContain(never);
  });

  it("marks the event in the same call as its effect, as its last statement", () => {
    const marks = process.lastIndexOf("update public.provider_events");
    expect(marks).toBeGreaterThan(process.indexOf("v_outcome := 'confirmed';"));
    expect(process.slice(marks)).toMatch(
      /set processing_status = v_status,\s+processed_at = now\(\),\s+processing_note = v_outcome\s+where id = v_event\.id;\s+return jsonb_build_object\('outcome', v_outcome, 'replayed', false\);/,
    );
    // The marks are written once, after every branch: no branch can call an event processed before its effect.
    expect(process.match(/update public\.provider_events/g)).toHaveLength(1);
  });

  it("audits a reference no checkout row holds against the ledger row, and flags no order for it", () => {
    const unknown = process.slice(
      process.indexOf("if v_pa.id is null then"),
      process.indexOf("select o.* into v_order from public.orders o"),
    );
    expect(unknown).toContain("'payment.review.unknown_reference'");
    expect(unknown).toContain("'provider_event'");
    expect(unknown).toContain("v_event.id::text");
    expect(unknown).not.toContain("update public.orders");
    expect(unknown).toContain("'unlinked_rows'");
  });
});

describe("payment_return_state and payment_record_provider_check — neither can confirm", () => {
  it("a verified return records a payment as reported — status created — and nothing more", () => {
    expect(returned).toMatch(
      /values \(\s*v_order_id, 'razorpay', v_pa\.provider_order_id, p_verified_payment_id, v_pa\.amount_paise, 'inr', 'created',\s*true\);/,
    );
    expect(returned).toContain("'payment.return.verified'");
    // The only update it makes is the row's own verified mark.
    expect(returned.match(/\bupdate public\.\w+/g)).toEqual([
      "update public.payment_attempts",
    ]);
    expect(returned).toContain("set signature_verified = true");
    expect(returned).not.toContain("update public.orders");
    // A payment for an order that was never linked, or held by another order, is refused.
    expect(returned).toContain("'payment: state_conflict'");
    expect(returned).toContain("'payment: payment_conflict'");
    // It hands the server the salt and the hash of the link — never a link.
    expect(returned).toContain(
      "'confirmation_token_salt', o.confirmation_token_salt",
    );
    expect(returned).toContain(
      "'confirmation_token_hash', o.confirmation_token_hash",
    );
  });

  it("an API answer only ever raises a hold on an order that awaits payment and is under no other review", () => {
    expect(providerCheck).toContain(
      "v_hold := case p_provider_status when 'captured' then 'capture_unverified' else 'authorized_only' end;",
    );
    expect(providerCheck).toMatch(
      /if v_pa\.provider_order_state = 'linked'\s+and v_order\.payment_status = 'pending'\s+and v_order\.fulfilment_status = 'pending_payment'\s+and \(not v_order\.needs_review\s+or \(v_order\.payment_hold = 'authorized_only' and v_hold = 'capture_unverified'\)\) then/,
    );
    expect(providerCheck.match(/\bupdate public\.\w+/g)).toEqual([
      "update public.orders",
    ]);
    expect(providerCheck).toMatch(
      /update public\.orders\s+set needs_review = true,\s+payment_hold = v_hold\s+where id = v_order\.id;/,
    );
    // An API answer records the payment it showed as known — status `created`, signature not verified — and
    // nothing more: never authorised, captured or paid, and no ledger row and no queue row. The capture of ANOTHER
    // payment of the order then meets this row as a live payment (an extra payment), never as clearing the hold.
    expect(providerCheck.match(/insert into public\.\w+/g)).toEqual([
      "insert into public.payment_attempts",
      "insert into public.audit_log",
    ]);
    expect(providerCheck).toMatch(
      /values \(\s+v_order\.id, 'razorpay', v_pa\.provider_order_id, p_payment_id, v_pa\.amount_paise, 'inr', 'created', false\);/,
    );
    expect(providerCheck).not.toMatch(
      /'authorized', (true|false)\)|'captured', (true|false)\)/,
    );
    // A payment id another order holds is refused before anything is written — and the whole call with it.
    expect(
      providerCheck.indexOf("raise exception 'payment: payment_conflict'"),
    ).toBeLessThan(
      providerCheck.indexOf("insert into public.payment_attempts"),
    );
    expect(
      providerCheck.indexOf("insert into public.payment_attempts"),
    ).toBeLessThan(providerCheck.indexOf("update public.orders"));
    expect(providerCheck).not.toContain("provider_events");
    expect(providerCheck).not.toContain("pending_work");
    expect(providerCheck).toContain(
      "p_provider_status not in ('captured', 'authorized')",
    );
  });
});

describe("order_confirmation_view — the one read path of /order/[token]", () => {
  it("reads by the token's hash only, writes nothing and carries no contact and no address", () => {
    expect(view).toContain("where o.confirmation_token_hash = p_token_hash;");
    expect(view).toContain("p_token_hash !~ '^[0-9a-f]{64}$'");
    for (const never of [
      "insert into",
      "update public",
      "for update",
      "customers_contact",
      "public.addresses",
      "email",
      "phone",
      "recipient",
      "line1",
      "pincode",
      "confirmation_token_salt",
      "checkout_payload_mac",
    ])
      expect(view, never).not.toContain(never);
    // The rows are the purchase snapshot's — what was bought, as it was bought.
    expect(view).toContain(
      "(select s.snapshot -> 'items' from public.purchase_snapshots s where s.order_id = o.id)",
    );
  });
});

describe("supabase/rollbacks/0005_payment_finalization.down.sql — schema recovery only", () => {
  const downCode = statementsOnly(down);

  it("is exactly the reversal of the forward file, in reverse order, and nothing more", () => {
    expect(
      downCode
        .replace(/\s+/g, " ")
        .split(";")
        .map((statement) => statement.trim())
        .filter(Boolean),
    ).toEqual([
      "drop function if exists public.order_confirmation_view(text)",
      "drop function if exists public.payment_record_provider_check(uuid, text, text)",
      "drop function if exists public.payment_return_state(text, text)",
      "drop function if exists public.payment_process_event(uuid)",
      "drop function if exists public.payment_record_event(text, text, jsonb)",
      "alter table public.orders drop constraint if exists orders_payment_hold_with_review, drop constraint if exists orders_payment_hold_allowed, drop column if exists payment_hold",
    ]);
    for (const never of [
      "cascade",
      "truncate",
      "row level security",
      "grant ",
      "drop table",
      "delete from",
    ])
      expect(downCode, never).not.toContain(never);
  });

  it("drops every object the forward file creates", () => {
    for (const signature of FUNCTIONS)
      expect(downCode).toContain(`drop function if exists ${signature}`);
    for (const column of code.match(/add column (\w+)/g) ?? [])
      expect(downCode).toContain(
        column.replace("add column", "drop column if exists"),
      );
    for (const constraint of code.match(/add constraint (\w+)/g) ?? [])
      expect(downCode).toContain(
        constraint.replace("add constraint", "drop constraint if exists"),
      );
  });

  it("says plainly what it deletes and does not restore, and names the ledger repair", () => {
    expect(downLower).toContain("down-sql reverses");
    expect(downLower).toContain("schema, never data");
    expect(downLower).toContain("the payment hold");
    expect(downLower).toContain("stays confirmed");
    expect(downLower).toContain("migration repair --status reverted 0005");
    expect(downLower).toContain("outside supabase/migrations/");
    expect(downLower).toContain("must be rolled back first");
  });
});

// --- the adapter ------------------------------------------------------------------------------------------------

describe("createPaymentStore — the database adapter", () => {
  const EVENT_ROW = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
  const PA_ID = "9b2d6c1e-5f44-4c0a-8a51-0c7f1e9d2a10";
  const HASH = "a".repeat(64);

  const RETURN_STATE = {
    order_number: "AS-1001",
    payment_status: "pending",
    fulfilment_status: "pending_payment",
    needs_review: true,
    payment_hold: "capture_unverified",
    expires_at: "2026-11-22T11:00:00+00:00",
    confirmation_token_salt: "b".repeat(64),
    confirmation_token_hash: "c".repeat(64),
    payments: { reported: 1, authorized: 0, captured: 0, failed: 2 },
    recorded: true,
    server_time: "2026-11-22T10:00:00.123456+00:00",
  };

  const VIEW = {
    order_number: "AS-1001",
    confirmation_token_hash: "c".repeat(64),
    checkout_attempt_hash: HASH,
    placed_at: "2026-11-22T09:59:00+00:00",
    confirmed_at: null,
    payment_status: "pending",
    fulfilment_status: "pending_payment",
    needs_review: false,
    payment_hold: null,
    expires_at: "2026-11-22T11:00:00+00:00",
    synthetic: true,
    currency: "INR",
    subtotal_paise: 4200000,
    shipping_paise: null,
    tax_paise: null,
    total_paise: 4200000,
    items: [
      {
        variant_code: "the-moon-between-two-peaks:black",
        finish_code: "black",
        finish_name: "Black",
        artwork_slug: "the-moon-between-two-peaks",
        artwork_title: "The Moon Between Two Peaks",
        orientation: "Portrait",
        quantity: 2,
        unit_price_paise: 2100000,
        line_total_paise: 4200000,
      },
    ],
    payments: { reported: 0, authorized: 0, captured: 0, failed: 0 },
    payment_attempt_id: PA_ID,
    provider_order_state: "linked",
    provider_order_id: "order_PLACEHOLDER001",
    server_time: "2026-11-22T10:00:00+00:00",
  };

  const answering = (data: unknown) =>
    vi.fn<RpcCall>(async () => ({ data, error: null }));
  const failing = (code: string | null) =>
    vi.fn<RpcCall>(async () => ({
      data: null,
      // A real error carries text the adapter must never read or pass on.
      error: { code, message: "customer@example.com", details: "row (…)" } as {
        code: string | null;
      },
    }));

  it("calls one function per method, with the migration's own argument names", async () => {
    const rpc = answering(null);
    const store = createPaymentStore(rpc);
    await store.recordEvent("evt_1", "payment.captured", { entity: "event" });
    await store.processEvent(EVENT_ROW);
    await store.returnState(HASH, "pay_PLACEHOLDER0001");
    await store.returnState(HASH, null);
    await store.recordProviderCheck(PA_ID, "pay_PLACEHOLDER0001", "captured");
    await store.confirmationView(HASH);
    expect(rpc.mock.calls).toEqual([
      [
        "payment_record_event",
        {
          p_event_id: "evt_1",
          p_event_type: "payment.captured",
          p_payload: { entity: "event" },
        },
      ],
      ["payment_process_event", { p_event: EVENT_ROW }],
      [
        "payment_return_state",
        { p_attempt_hash: HASH, p_verified_payment_id: "pay_PLACEHOLDER0001" },
      ],
      [
        "payment_return_state",
        { p_attempt_hash: HASH, p_verified_payment_id: null },
      ],
      [
        "payment_record_provider_check",
        {
          p_payment_attempt_id: PA_ID,
          p_payment_id: "pay_PLACEHOLDER0001",
          p_provider_status: "captured",
        },
      ],
      ["order_confirmation_view", { p_token_hash: HASH }],
    ]);
    // The argument names are the ones the SQL declares.
    for (const [, args] of rpc.mock.calls)
      for (const name of Object.keys(args)) expect(code).toContain(name);
  });

  it("parses each answer into the server's own shape — exact paise and the database's timestamps", async () => {
    expect(
      await createPaymentStore(
        answering({
          event: EVENT_ROW,
          inserted: false,
          derived: true,
          processing_status: "received",
        }),
      ).recordEvent("evt_1", "payment.captured", {}),
    ).toEqual({
      ok: true,
      value: {
        eventRowId: EVENT_ROW,
        inserted: false,
        derived: true,
        processingStatus: "received",
      },
    });

    expect(
      await createPaymentStore(
        answering({ outcome: "review:amount_mismatch", replayed: true }),
      ).processEvent(EVENT_ROW),
    ).toEqual({
      ok: true,
      value: { outcome: "review:amount_mismatch", replayed: true },
    });

    const state = await createPaymentStore(answering(RETURN_STATE)).returnState(
      HASH,
      null,
    );
    expect(state).toEqual({
      ok: true,
      value: {
        orderNumber: "AS-1001",
        paymentStatus: "pending",
        fulfilmentStatus: "pending_payment",
        needsReview: true,
        paymentHold: "capture_unverified",
        expiresAt: new Date("2026-11-22T11:00:00.000Z"),
        tokenSalt: "b".repeat(64),
        tokenHash: "c".repeat(64),
        payments: { reported: 1, authorized: 0, captured: 0, failed: 2 },
        recorded: true,
        serverTime: new Date("2026-11-22T10:00:00.123Z"),
      },
    });

    expect(
      await createPaymentStore(
        answering({
          held: true,
          payment_status: "pending",
          needs_review: true,
          payment_hold: "authorized_only",
        }),
      ).recordProviderCheck(PA_ID, "pay_PLACEHOLDER0001", "authorized"),
    ).toEqual({
      ok: true,
      value: {
        held: true,
        paymentStatus: "pending",
        needsReview: true,
        paymentHold: "authorized_only",
      },
    });

    const row = await createPaymentStore(answering(VIEW)).confirmationView(
      HASH,
    );
    expect(row.ok).toBe(true);
    if (!row.ok || row.value === null) throw new Error("no row");
    expect(row.value.total_paise).toBe(BigInt(4200000));
    expect(row.value.shipping_paise).toBeNull();
    expect(row.value.items[0].line_total_paise).toBe(BigInt(4200000));
    expect(row.value.placed_at).toEqual(new Date("2026-11-22T09:59:00.000Z"));
    expect(row.value.checkout_attempt_hash).toBe(HASH);
  });

  it("answers null where the database says there is no such attempt or order — and unavailable where it must answer", async () => {
    const store = createPaymentStore(answering(null));
    expect(await store.returnState(HASH, null)).toEqual({
      ok: true,
      value: null,
    });
    expect(await store.confirmationView(HASH)).toEqual({
      ok: true,
      value: null,
    });
    // These three functions never answer NULL: a NULL is not a guess at success.
    expect(await store.recordEvent("evt_1", "payment.captured", {})).toEqual({
      ok: false,
      refusal: "unavailable",
    });
    expect(await store.processEvent(EVENT_ROW)).toEqual({
      ok: false,
      refusal: "unavailable",
    });
    expect(
      await store.recordProviderCheck(PA_ID, "pay_PLACEHOLDER0001", "captured"),
    ).toEqual({ ok: false, refusal: "unavailable" });
  });

  it.each([
    ["ZP001", "invalid_request"],
    ["ZP010", "event_not_found"],
    ["ZP012", "state_conflict"],
    ["ZP020", "attempt_not_found"],
    ["ZP021", "payment_conflict"],
    ["ZP030", "outbox_conflict"],
    ["23505", "unavailable"],
    ["23514", "unavailable"],
    ["42501", "unavailable"],
    ["ZC011", "unavailable"],
    ["PGRST301", "unavailable"],
    [null, "unavailable"],
  ] as const)(
    "a database error %s is the one reason %s — its text is never read",
    async (sqlstate, refusal) => {
      const store = createPaymentStore(failing(sqlstate));
      const results = [
        await store.recordEvent("evt_1", "payment.captured", {}),
        await store.processEvent(EVENT_ROW),
        await store.returnState(HASH, null),
        await store.recordProviderCheck(
          PA_ID,
          "pay_PLACEHOLDER0001",
          "captured",
        ),
        await store.confirmationView(HASH),
      ];
      for (const result of results)
        expect(result).toEqual({ ok: false, refusal });
      expect(JSON.stringify(results)).not.toContain("example.com");
    },
  );

  it("a call that throws is unavailable", async () => {
    const store = createPaymentStore(
      vi.fn<RpcCall>(async () => {
        throw new Error("network");
      }),
    );
    expect(await store.processEvent(EVENT_ROW)).toEqual({
      ok: false,
      refusal: "unavailable",
    });
    expect(await store.confirmationView(HASH)).toEqual({
      ok: false,
      refusal: "unavailable",
    });
  });

  it.each<
    [
      string,
      (store: ReturnType<typeof createPaymentStore>) => Promise<unknown>,
      unknown,
    ]
  >([
    [
      "an unknown processing status",
      (store) => store.recordEvent("evt_1", "payment.captured", {}),
      {
        event: EVENT_ROW,
        inserted: true,
        derived: false,
        processing_status: "done",
      },
    ],
    [
      "an event id that is not a uuid",
      (store) => store.recordEvent("evt_1", "payment.captured", {}),
      {
        event: "1",
        inserted: true,
        derived: false,
        processing_status: "received",
      },
    ],
    [
      "an outcome that is not a code",
      (store) => store.processEvent(EVENT_ROW),
      { outcome: "Order AS-1001 confirmed for a@b.co", replayed: false },
    ],
    [
      "a missing replayed flag",
      (store) => store.processEvent(EVENT_ROW),
      { outcome: "confirmed" },
    ],
    [
      "an unknown payment hold",
      (store) => store.returnState(HASH, null),
      { ...RETURN_STATE, payment_hold: "manual" },
    ],
    [
      "a key the adapter does not know",
      (store) => store.returnState(HASH, null),
      { ...RETURN_STATE, customer_email: "a@b.co" },
    ],
    [
      "a negative payment count",
      (store) => store.returnState(HASH, null),
      {
        ...RETURN_STATE,
        payments: { reported: -1, authorized: 0, captured: 0, failed: 0 },
      },
    ],
    [
      "a fractional total",
      (store) => store.confirmationView(HASH),
      { ...VIEW, total_paise: 4200000.5 },
    ],
    [
      "an order with no items",
      (store) => store.confirmationView(HASH),
      { ...VIEW, items: [] },
    ],
    [
      "a held flag that is not a boolean",
      (store) =>
        store.recordProviderCheck(PA_ID, "pay_PLACEHOLDER0001", "captured"),
      {
        held: "yes",
        payment_status: "pending",
        needs_review: true,
        payment_hold: null,
      },
    ],
  ])(
    "an answer with %s is unavailable — never a guess",
    async (_label, call, data) => {
      expect(await call(createPaymentStore(answering(data)))).toEqual({
        ok: false,
        refusal: "unavailable",
      });
    },
  );
});

describe("privilegedPaymentStore — only the order page's read is bounded (src/lib/server/payments/client.ts)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    fakeClient.calls.length = 0;
  });

  it("gives order_confirmation_view a 5-second abort signal and every write none — a write cut off has an outcome nobody knows", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const store = privilegedPaymentStore();
    expect(store).not.toBeNull();
    if (store === null) return;
    const uuid = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
    await store.confirmationView("a".repeat(64));
    await store.recordEvent("evt_placeholder001", "payment.captured", {
      entity: "event",
    });
    await store.processEvent(uuid);
    await store.returnState("b".repeat(64), "pay_PLACEHOLDER0001");
    await store.recordProviderCheck(uuid, "pay_PLACEHOLDER0001", "captured");
    expect(
      fakeClient.calls.map((call) => [call.name, call.signal !== null]),
    ).toEqual([
      ["order_confirmation_view", true],
      ["payment_record_event", false],
      ["payment_process_event", false],
      ["payment_return_state", false],
      ["payment_record_provider_check", false],
    ]);
    expect(ORDER_READ_TIMEOUT_MS).toBe(5000);
    expect(timeout.mock.calls).toEqual([[ORDER_READ_TIMEOUT_MS]]);
  });

  it("an aborted read is 'unavailable' — the page's temporary error, never a missing order", async () => {
    const store = createPaymentStore(async () => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    });
    expect(await store.confirmationView("a".repeat(64))).toEqual({
      ok: false,
      refusal: "unavailable",
    });
    const answered = createPaymentStore(async () => ({
      data: null,
      error: { code: "" },
    }));
    expect(await answered.confirmationView("a".repeat(64))).toEqual({
      ok: false,
      refusal: "unavailable",
    });
  });
});
