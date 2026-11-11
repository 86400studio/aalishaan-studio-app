import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { STORE_REFUSALS } from "@/lib/server/checkout/store";

/**
 * Hermetic guards of 0004_checkout and its down file (docs/database-changes/S1.6-0004-checkout.md): additive, five
 * narrow functions in the house style (pinned empty search_path, never SECURITY DEFINER, EXECUTE for service_role
 * only), no table privilege or policy change, no generic SQL entry point, no exception block (so a failure always
 * rolls the whole transaction back), every refusal a custom SQLSTATE the server maps, a plain order INSERT, and a
 * down file that reverses exactly what the forward file adds and says what it loses. What the functions do against
 * a real database is tests/integration/checkout.test.ts.
 */

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (relative: string) =>
  readFileSync(path.join(ROOT, relative), "utf8");

const up = read("supabase/migrations/0004_checkout.sql");
const down = read("supabase/rollbacks/0004_checkout.down.sql");
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
  "public.guard_order_checkout_fields()",
  "public.guard_checkout_payment_attempt()",
  "public.checkout_attempt_state(text)",
  "public.checkout_create_pending_order(jsonb)",
  "public.checkout_claim_provider_create(uuid)",
  "public.checkout_link_provider_order(uuid, text, timestamptz)",
  "public.checkout_close_provider_create(uuid, text, text, boolean)",
] as const;

describe("supabase/migrations/0004_checkout.sql — additive", () => {
  it("adds exactly three nullable columns to orders and three to payment_attempts", () => {
    expect(code.match(/add column \w+/g)).toEqual([
      "add column checkout_attempt_hash",
      "add column checkout_payload_mac",
      "add column confirmation_token_salt",
      "add column provider_order_state",
      "add column provider_create_requested_at",
      "add column provider_order_created_at",
    ]);
    // Nullable, no default: existing rows are untouched and no rewrite is needed.
    for (const line of code.match(/add column [^\n]+/g) ?? []) {
      expect(line).not.toContain("not null");
      expect(line).not.toContain("default");
    }
    expect(code.match(/alter table public\.\w+/g)).toEqual([
      "alter table public.orders",
      "alter table public.payment_attempts",
    ]);
  });

  it("creates no table, type, view or policy and changes no table privilege", () => {
    for (const never of [
      "create table",
      "create type",
      "create view",
      "create policy",
      "alter policy",
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

  it("creates exactly the two guard functions and the five checkout functions", () => {
    const created = [
      ...code.matchAll(/create or replace function (public\.\w+)\s*\(/g),
    ].map((match) => match[1]);
    expect(created).toEqual([
      "public.guard_order_checkout_fields",
      "public.guard_checkout_payment_attempt",
      "public.checkout_attempt_state",
      "public.checkout_create_pending_order",
      "public.checkout_claim_provider_create",
      "public.checkout_link_provider_order",
      "public.checkout_close_provider_create",
    ]);
    expect(code.match(/create trigger \w+/g)).toEqual([
      "create trigger orders_guard_checkout_fields",
      "create trigger payment_attempts_guard_checkout",
    ]);
    expect(code.match(/create unique index \w+/g)).toEqual([
      "create unique index payment_attempts_checkout_order_key",
      "create unique index payment_attempts_checkout_provider_order_key",
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

  it("offers no generic SQL entry point and catches no error", () => {
    // No dynamic SQL: nothing is assembled from an argument and executed.
    expect(code).not.toMatch(/\bexecute\s+format\b/);
    expect(code).not.toMatch(/\bexecute\s+'/);
    expect(code).not.toMatch(/\bexecute\s+\w+\s*;/);
    // No EXCEPTION block: any failure aborts the statement, so the transaction rolls back whole.
    expect(code).not.toMatch(/\bexception\s+when\b/);
    expect(code).not.toMatch(/\bwhen\s+others\b/);
  });

  it("writes orders with a plain INSERT — never an upsert that would take a number for an absorbed row", () => {
    expect(code).not.toContain("on conflict");
    expect(code.match(/insert into public\.orders\b/g)).toHaveLength(1);
    // The order's number comes from the 0002 trigger: the insert names no order_number column.
    const insert = code.slice(code.indexOf("insert into public.orders"));
    expect(insert.slice(0, insert.indexOf("values"))).not.toContain(
      "order_number",
    );
  });

  it("inserts the six kinds of row in one function, items last, and nothing into any other table", () => {
    const body = code.slice(
      code.indexOf(
        "create or replace function public.checkout_create_pending_order",
      ),
      code.indexOf(
        "create or replace function public.checkout_claim_provider_create",
      ),
    );
    expect(
      [...body.matchAll(/insert into (public\.\w+)/g)].map((m) => m[1]),
    ).toEqual([
      "public.customers_contact",
      "public.addresses",
      "public.orders",
      "public.purchase_snapshots",
      "public.payment_attempts",
      "public.order_items",
    ]);
    // Every refusal precedes the first write: after the first INSERT nothing raises a checkout refusal.
    const afterFirstInsert = body.slice(
      body.indexOf("insert into public.customers_contact"),
    );
    expect(afterFirstInsert).not.toContain("raise exception");
    // The catalogue rows are locked before they are priced.
    expect(body.indexOf("for share of v, a")).toBeGreaterThan(0);
    expect(body.indexOf("for share of v, a")).toBeLessThan(
      body.indexOf("sum(v.price_paise * i.quantity)"),
    );
    // The snapshot never carries the email address or the phone number.
    const snapshot = body.slice(
      body.indexOf("insert into public.purchase_snapshots"),
      body.indexOf("insert into public.payment_attempts"),
    );
    expect(snapshot).not.toContain("v_email");
    expect(snapshot).not.toContain("v_phone");
  });

  it("refuses with fixed messages under custom SQLSTATEs — exactly the codes the server maps", () => {
    const raised = new Set(
      [...code.matchAll(/errcode = '(zc\d{3})'/g)].map((match) =>
        match[1].toUpperCase(),
      ),
    );
    expect([...raised].sort()).toEqual(Object.keys(STORE_REFUSALS).sort());
    // Each checkout refusal is the fixed text "checkout: <reason>" with the mapped reason — no value interpolated.
    for (const match of code.matchAll(
      /raise exception '(checkout: [a-z_]+)'\s+using errcode = '(zc\d{3})'/g,
    )) {
      const reason = match[1].replace("checkout: ", "");
      expect(
        STORE_REFUSALS[match[2].toUpperCase() as keyof typeof STORE_REFUSALS],
      ).toBe(reason);
    }
    const checkoutRaises =
      code.match(/raise exception 'checkout:[^']*'[^;]*;/g) ?? [];
    expect(checkoutRaises.length).toBeGreaterThan(20);
    for (const raise of checkoutRaises) expect(raise).not.toContain("%");
  });

  it("opens only on an effective, open rule that is marked synthetic, and never guesses a charge", () => {
    expect(code).toContain("where br.effective_from <= now()");
    expect(code).toContain("order by br.effective_from desc, br.version desc");
    expect(code).toContain("if not found or not v_rule.sales_open then");
    expect(code).toContain("if not v_rule.synthetic");
    // Unknown shipping stays NULL in the order; tax is written as NULL (no rate exists before S3.1).
    expect(code).toContain("v_shipping := v_rule.shipping_paise;");
    expect(code).toContain(
      "v_customer_id, v_address_id, v_subtotal, v_shipping, null, v_total",
    );
    expect(code).toContain("v_total := v_subtotal + coalesce(v_shipping, 0);");
  });

  it("is additive: no drop, delete, truncate, alter type or destructive statement", () => {
    for (const never of [
      "drop ",
      "delete from",
      "truncate",
      "alter type",
      "alter system",
      "disable trigger",
      "cascade",
    ])
      expect(code, never).not.toContain(never);
    // The only UPDATEs are the three state changes of the provider step.
    expect(
      [...code.matchAll(/\bupdate (public\.\w+)/g)].map((m) => m[1]).sort(),
    ).toEqual([
      "public.orders",
      "public.orders",
      "public.payment_attempts",
      "public.payment_attempts",
      "public.payment_attempts",
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
});

describe("supabase/rollbacks/0004_checkout.down.sql — schema recovery only", () => {
  const downCode = statementsOnly(down);

  it("is exactly the reversal of the forward file, in reverse order, and nothing more", () => {
    expect(
      downCode
        .replace(/\s+/g, " ")
        .split(";")
        .map((statement) => statement.trim())
        .filter(Boolean),
    ).toEqual([
      "drop function if exists public.checkout_close_provider_create(uuid, text, text, boolean)",
      "drop function if exists public.checkout_link_provider_order(uuid, text, timestamptz)",
      "drop function if exists public.checkout_claim_provider_create(uuid)",
      "drop function if exists public.checkout_create_pending_order(jsonb)",
      "drop function if exists public.checkout_attempt_state(text)",
      "drop trigger if exists payment_attempts_guard_checkout on public.payment_attempts",
      "drop function if exists public.guard_checkout_payment_attempt()",
      "drop index if exists public.payment_attempts_checkout_provider_order_key",
      "drop index if exists public.payment_attempts_checkout_order_key",
      "alter table public.payment_attempts drop constraint if exists payment_attempts_linked_is_complete, drop constraint if exists payment_attempts_intent_is_untouched, drop constraint if exists payment_attempts_provider_order_state_allowed, drop column if exists provider_order_created_at, drop column if exists provider_create_requested_at, drop column if exists provider_order_state",
      "drop trigger if exists orders_guard_checkout_fields on public.orders",
      "drop function if exists public.guard_order_checkout_fields()",
      "alter table public.orders drop constraint if exists orders_confirmation_token_salt_with_hash, drop constraint if exists orders_confirmation_token_salt_shape, drop constraint if exists orders_checkout_attempt_complete, drop constraint if exists orders_checkout_payload_mac_shape, drop constraint if exists orders_checkout_attempt_hash_shape, drop constraint if exists orders_checkout_attempt_hash_key, drop column if exists confirmation_token_salt, drop column if exists checkout_payload_mac, drop column if exists checkout_attempt_hash",
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
    expect(downLower).toContain("down-sql reverses schema, never");
    expect(downLower).toContain("the attempt binding");
    expect(downLower).toContain("the confirmation");
    expect(downLower).toContain("migration repair --status reverted 0004");
    expect(downLower).toContain("outside supabase/migrations/");
  });
});
