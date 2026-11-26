import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { PAYMENT_REFUSALS } from "@/lib/server/payments/store";
import { WEBHOOK_MAX_BODY_BYTES } from "@/lib/server/payments/webhook";
import { RAZORPAY_PAYMENTS_PAGE } from "@/lib/server/razorpay";

/**
 * 0006_payment_evidence — S1.7, after the independent review's round 1 (findings 3, 4, 6 and 7; docs/database-changes/
 * S1.7-0006-payment-evidence.md). Hermetic guards of the forward file and its down file, in the style of the 0005
 * guards (tests/unit/payment-finalization.test.ts): the house style, the grants, the one new column and its bound,
 * the immutable ledger, the verified bytes on both ledger inserts, the provider check over every live payment and
 * its money, the one changed branch of payment_process_event — and a down file that restores 0005's (and 0002's)
 * definitions word for word.
 *
 * What the functions DO against a real database is tests/integration/payments.test.ts (run on TEST after the
 * owner-approved apply).
 */

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (relative: string) =>
  readFileSync(path.join(ROOT, relative), "utf8").replace(/\r\n/g, "\n");

const up = read("supabase/migrations/0006_payment_evidence.sql");
const down = read("supabase/rollbacks/0006_payment_evidence.down.sql");
const m5 = read("supabase/migrations/0005_payment_finalization.sql");
const m2 = read("supabase/migrations/0002_orders.sql");

/** The SQL without its comments, lower-cased. */
function statementsOnly(sql: string): string {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n")
    .toLowerCase();
}
/** The statements without the `comment on … is '…';` texts, which describe the rules in words. */
const withoutComments = (sql: string) =>
  statementsOnly(sql).replace(/comment on [^;']*? is\s+'(?:[^']|'')*';/g, "");

const code = withoutComments(up);
const downCode = withoutComments(down);

/** The body of one function in `sql`: from its `create or replace` to the next one (or the end). */
function bodyOf(sql: string, name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}`);
  expect(start, name).toBeGreaterThanOrEqual(0);
  const next = sql.indexOf("create or replace function public.", start + 1);
  return sql.slice(start, next === -1 ? undefined : next);
}

/** One definition as written: from `create or replace function public.<name>(` to its grant line, inclusive. */
function definition(sql: string, name: string, grant: string): string {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  expect(start, name).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf(grant, start);
  expect(end, grant).toBeGreaterThan(start);
  return sql.slice(start, end + grant.length);
}

/** A function's text as written, up to the close of its body. */
function functionText(sql: string, head: string): string {
  const start = sql.indexOf(head);
  expect(start, head).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf("\n$fn$;\n", start);
  expect(end, head).toBeGreaterThan(start);
  return sql.slice(start, end);
}

const protect = bodyOf(code, "protect_provider_event");
const record = bodyOf(code, "payment_record_event");
const process = bodyOf(code, "payment_process_event");
const check = bodyOf(code, "payment_record_provider_check");

const SIGNATURES = [
  "public.protect_provider_event()",
  "public.payment_record_event(text, text, jsonb, bytea)",
  "public.payment_process_event(uuid)",
  "public.payment_record_provider_check(uuid, jsonb)",
] as const;

describe("supabase/migrations/0006_payment_evidence.sql — the house style", () => {
  it("re-creates exactly four functions, in order: the ledger's guard, the ledger step, the processor and the provider check", () => {
    expect(
      [...code.matchAll(/create or replace function (public\.\w+)\s*\(/g)].map(
        (match) => match[1],
      ),
    ).toEqual([
      "public.protect_provider_event",
      "public.payment_record_event",
      "public.payment_process_event",
      "public.payment_record_provider_check",
    ]);
  });

  it("hardens every function: plpgsql, pinned empty search_path, never SECURITY DEFINER, EXECUTE for service_role only", () => {
    expect(code).not.toContain("security definer");
    expect(code.match(/language plpgsql/g)).toHaveLength(SIGNATURES.length);
    expect(code.match(/set search_path = ''/g)).toHaveLength(SIGNATURES.length);
    for (const signature of SIGNATURES) {
      expect(code, signature).toContain(
        `revoke execute on function ${signature} from public, anon, authenticated;`,
      );
      expect(code, signature).toContain(
        `grant execute on function ${signature} to service_role;`,
      );
    }
    const grants = code.match(/grant [^;]+;/g) ?? [];
    expect(grants).toHaveLength(SIGNATURES.length);
    for (const grant of grants) expect(grant).toMatch(/to service_role;$/);
  });

  it("offers no generic SQL entry point and catches no error", () => {
    expect(code).not.toMatch(/\bexecute\s+format\b/);
    expect(code).not.toMatch(/\bexecute\s+'/);
    expect(code).not.toMatch(/\bexecute\s+\w+\s*;/);
    expect(code).not.toMatch(/\bexception\s+when\b/);
    expect(code).not.toMatch(/\bwhen\s+others\b/);
  });

  it("adds one nullable bytea column to provider_events, bounded like the webhook — and changes no table privilege, policy, index or trigger", () => {
    expect(code.match(/alter table public\.\w+/g)).toEqual([
      "alter table public.provider_events",
    ]);
    // Nullable, no default: the rows stored before 0006 keep NULL, and no rewrite is needed.
    expect(code.match(/add column [^\n]+/g)).toEqual([
      "add column raw_body bytea,",
    ]);
    expect(code.match(/add constraint \w+/g)).toEqual([
      "add constraint provider_events_raw_body_length",
    ]);
    expect(code).toContain(
      `check (raw_body is null or octet_length(raw_body) between 2 and ${WEBHOOK_MAX_BODY_BYTES})`,
    );
    expect(WEBHOOK_MAX_BODY_BYTES).toBe(262144);
    for (const never of [
      "create table",
      "create type",
      "create view",
      "create policy",
      "alter policy",
      "create trigger",
      "drop trigger",
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

  it("drops exactly the two signatures it replaces — never a table, a column or with cascade — and writes no row", () => {
    expect(code.match(/\bdrop [^;]+;/g)).toEqual([
      "drop function public.payment_record_event(text, text, jsonb);",
      "drop function public.payment_record_provider_check(uuid, text, text);",
    ]);
    for (const never of [
      "cascade",
      "truncate",
      "delete from",
      "alter type",
      "alter system",
      "disable trigger",
      "insert into public.orders",
      "begin;",
      "commit;",
      "concurrently",
    ])
      expect(code, never).not.toContain(never);
    // Each replaced signature is dropped right before its successor is made.
    for (const [dropped, made] of [
      [
        "drop function public.payment_record_event(text, text, jsonb);",
        "create or replace function public.payment_record_event(",
      ],
      [
        "drop function public.payment_record_provider_check(uuid, text, text);",
        "create or replace function public.payment_record_provider_check(",
      ],
    ]) {
      expect(code.indexOf(dropped)).toBeGreaterThan(0);
      expect(code.indexOf(dropped)).toBeLessThan(code.indexOf(made));
    }
  });

  it("refuses with 0005's fixed messages under the SQLSTATEs the server maps — no new code, no value interpolated", () => {
    const raises = [
      ...code.matchAll(
        /raise exception '(payment: [a-z_]+)'\s+using errcode = '(zp\d{3})'/g,
      ),
    ];
    expect(raises.length).toBeGreaterThanOrEqual(8);
    for (const match of raises)
      expect(
        PAYMENT_REFUSALS[
          match[2].toUpperCase() as keyof typeof PAYMENT_REFUSALS
        ],
      ).toBe(match[1].replace("payment: ", ""));
    // Besides them, only the ledger guard's two refusals of 0002 (42501).
    const all = code.match(/raise exception[^;]*;/g) ?? [];
    expect(all).toHaveLength(raises.length + 2);
    expect(code.match(/errcode = '42501'/g)).toHaveLength(2);
    for (const raise of all) expect(raise).not.toContain("%");
  });

  it("confirms nothing new: only payment_process_event makes an order captured, queues work or moves an item", () => {
    expect(code.match(/payment_status = 'captured'/g)).toHaveLength(2);
    expect(code.match(/insert into public\.pending_work/g)).toHaveLength(1);
    expect(code.match(/confirmed_at = now\(\)/g)).toHaveLength(1);
    expect(code.match(/update public\.order_items/g)).toHaveLength(1);
    for (const body of [protect, record, check]) {
      expect(body).not.toContain("confirmed_at =");
      expect(body).not.toContain("pending_work");
      expect(body).not.toMatch(
        /update public\.orders[^;]*\b(payment_status|fulfilment_status)\s*=/,
      );
    }
    expect(code).not.toContain("business_rules");
  });
});

describe("0006 — the ledger keeps the verified bytes (finding 7)", () => {
  it("adds raw_body to the ledger fields the trigger keeps immutable, with every field 0002 kept", () => {
    const guarded = [
      ...protect.matchAll(/new\.(\w+) is distinct from old\.\1/g),
    ].map((match) => match[1]);
    expect(guarded).toEqual([
      "id",
      "provider",
      "event_id",
      "event_type",
      "signature_ok",
      "payload",
      "raw_body",
      "received_at",
    ]);
    // DELETE stays refused, and the processing marks stay free to change.
    expect(protect).toContain("if tg_op = 'delete' then");
    for (const mark of ["processing_status", "processed_at", "processing_note"])
      expect(protect).not.toContain(`new.${mark}`);
    // The trigger itself is 0002's and is not touched: the function is re-created in place.
    expect(code).not.toContain("provider_events_protect");
  });

  it("writes the verified bytes on BOTH ledger inserts, and refuses a delivery without them or with more than the webhook accepts", () => {
    expect(record).toMatch(
      /payment_record_event\(\s*p_event_id\s+text,\s*p_event_type text,\s*p_payload\s+jsonb,\s*p_raw_body\s+bytea\)/,
    );
    const inserts =
      record.match(
        /insert into public\.provider_events[\s\S]*?returning id into v_id;/g,
      ) ?? [];
    expect(inserts).toHaveLength(2);
    for (const insert of inserts) {
      expect(insert).toContain(
        "(provider, event_id, event_type, signature_ok, payload, raw_body)",
      );
      expect(insert).toMatch(
        /values \('razorpay', \w+, p_event_type, true, p_payload, p_raw_body\)/,
      );
      expect(insert).toContain("on conflict (provider, event_id) do nothing");
    }
    expect(record).toContain(
      `or coalesce(octet_length(p_raw_body) not between 2 and ${WEBHOOK_MAX_BODY_BYTES}, true) then`,
    );
    // Identity is 0005's: the parse decides "the same event again"; the bytes never overwrite a stored row.
    expect(record).toContain(
      "if v_row.payload is distinct from p_payload or v_row.event_type is distinct from p_event_type then",
    );
    expect(record).toContain(
      "v_key := p_event_id || '#' || substr(encode(sha256(convert_to(p_payload::text, 'utf8')), 'hex'), 1, 32);",
    );
    expect(record).not.toMatch(/\bupdate\b/);
    for (const never of [
      "public.orders",
      "public.payment_attempts",
      "public.pending_work",
      "public.audit_log",
    ])
      expect(record, never).not.toContain(never);
  });
});

describe("0006 — payment_process_event: a repeated event's money is judged (finding 6)", () => {
  const head = "create or replace function public.payment_process_event(";
  const lines6 = functionText(up, head).split("\n");
  const lines5 = functionText(m5, head).split("\n");
  let first = 0;
  while (lines5[first] === lines6[first]) first += 1;
  let last = 0;
  while (lines5[lines5.length - 1 - last] === lines6[lines6.length - 1 - last])
    last += 1;
  const was = lines5.slice(first, lines5.length - last).join("\n");
  const now = lines6.slice(first, lines6.length - last).join("\n");

  it("is 0005's body word for word except one branch: the repeated or older event of a payment", () => {
    expect(first).toBeGreaterThan(100);
    expect(last).toBeGreaterThan(150);
    expect(was).toBe(
      [
        "        -- A repeated or older event of a payment whose row is already there or further: no effect, no regression.",
        "        v_outcome := case when v_kind = 'captured' then 'duplicate_capture' else 'stale_' || v_kind end;",
      ].join("\n"),
    );
    // The branch is the one the status test opens.
    expect(lines6[first - 1]).toBe(
      "                 or (v_kind = 'failed' and v_pay.status in ('failed', 'authorized', 'captured'))) then",
    );
  });

  it("calls an authorised or captured event the same payment again only when it states the row's money; otherwise the review of step (g)", () => {
    const branch = statementsOnly(now);
    expect(branch).toMatch(
      /if v_kind <> 'failed' and v_currency is distinct from v_pay\.currency then\s+v_reason := 'currency_mismatch';\s+elsif v_kind <> 'failed' and v_amount is distinct from v_pay\.amount_paise then\s+v_reason := 'amount_mismatch';\s+else\s+v_outcome := case when v_kind = 'captured' then 'duplicate_capture' else 'stale_' \|\| v_kind end;\s+end if;/,
    );
    // The payment's row never moves back: this branch writes nothing itself — the review is step (g)'s.
    expect(branch).not.toMatch(/\bupdate\b|\binsert\b/);
    expect(process).toContain("if v_reason is not null then");
    expect(process).toMatch(
      /update public\.orders\s+set needs_review = true,\s+payment_hold = null\s+where id = v_order\.id;/,
    );
  });

  it("keeps 0005's lock order", () => {
    const locks = [
      ...process.matchAll(/from public\.(\w+) (\w+)[^;]*?for update;/g),
    ].map((match) => `${match[1]} ${match[2]}`);
    expect(locks).toEqual([
      "provider_events pe",
      "payment_attempts pa",
      "orders o",
      "payment_attempts p",
    ]);
  });
});

describe("0006 — payment_record_provider_check: every live payment, and its money (findings 3 and 4)", () => {
  it("takes the attempt and a list of payments — and validates every value before anything is read", () => {
    expect(check).toMatch(
      /payment_record_provider_check\(\s*p_payment_attempt_id uuid,\s*p_payments\s+jsonb\)/,
    );
    expect(check).toContain(
      "or jsonb_typeof(p_payments) is distinct from 'array' then",
    );
    // At most what one page of the provider's listing can hold: the read refuses a full page.
    expect(check).toContain(
      `if jsonb_array_length(p_payments) not between 1 and ${RAZORPAY_PAYMENTS_PAGE - 1} then`,
    );
    for (const rule of [
      "if jsonb_typeof(v_item) is distinct from 'object' then",
      "if (select count(*) from jsonb_object_keys(v_item)) <> 4",
      "or not (v_item ?& array['id', 'status', 'amount_paise', 'currency'])",
      "or jsonb_typeof(v_item -> 'amount_paise') is distinct from 'string'",
      "or coalesce((v_item ->> 'id') !~ '^pay_[a-za-z0-9]{6,60}$', true)",
      "or coalesce((v_item ->> 'status') not in ('captured', 'authorized'), true)",
      "or coalesce((v_item ->> 'amount_paise') !~ '^[1-9][0-9]{0,14}$', true)",
      "or coalesce((v_item ->> 'currency') !~ '^[a-z]{3}$', true)",
      "or (v_item ->> 'id') = any (v_ids) then",
    ])
      expect(check, rule).toContain(rule);
    expect(check.indexOf("for v_item in select e.value")).toBeLessThan(
      check.indexOf("from public.payment_attempts pa"),
    );
  });

  it("locks the checkout row, then its order, then each payment's row — the order of every payment writer", () => {
    const locks = [
      ...check.matchAll(/from public\.(\w+) (\w+)[^;]*?for update;/g),
    ].map((match) => `${match[1]} ${match[2]}`);
    expect(locks).toEqual([
      "payment_attempts pa",
      "orders o",
      "payment_attempts p",
    ]);
    expect(check).toContain("order by e.value ->> 'id'");
  });

  it("judges the observed money as the event path does, and counts every live payment: currency, amount, then more than one", () => {
    const reasons = check.slice(check.indexOf("v_reason := case"));
    const order = [
      "when v_currency_off then 'currency_mismatch'",
      "when v_amount_off then 'amount_mismatch'",
      "when cardinality(v_ids) > 1 then 'extra_payment'",
    ].map((needle) => reasons.indexOf(needle));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(check).toContain("bool_or((e.value ->> 'currency') <> 'inr')");
    expect(check).toMatch(
      /bool_or\(\(e\.value ->> 'amount_paise'\)::bigint <> v_order\.total_paise\s+or \(e\.value ->> 'amount_paise'\)::bigint <> v_pa\.amount_paise\)/,
    );
    expect(check).toContain(
      "v_hold := case when v_captured then 'capture_unverified' else 'authorized_only' end;",
    );
  });

  it("touches only an order that awaits payment, never a review that is not a hold; a review replaces a hold", () => {
    expect(check).toMatch(
      /if v_pa\.provider_order_state = 'linked'\s+and v_order\.payment_status = 'pending'\s+and v_order\.fulfilment_status = 'pending_payment'\s+and \(not v_order\.needs_review\s+or \(v_reason is null and v_order\.payment_hold = 'authorized_only' and v_hold = 'capture_unverified'\)\s+or \(v_reason is not null and v_order\.payment_hold is not null\)\) then/,
    );
    expect(check.match(/\bupdate public\.\w+/g)).toEqual([
      "update public.orders",
      "update public.orders",
    ]);
    expect(check).toMatch(
      /update public\.orders\s+set needs_review = true,\s+payment_hold = v_hold\s+where id = v_order\.id;/,
    );
    expect(check).toMatch(
      /update public\.orders\s+set needs_review = true,\s+payment_hold = null\s+where id = v_order\.id;/,
    );
  });

  it("records each payment shown as known — created, unverified, the observed amount where the row can hold it — never as paid", () => {
    expect(check.match(/insert into public\.\w+/g)).toEqual([
      "insert into public.payment_attempts",
      "insert into public.audit_log",
      "insert into public.audit_log",
    ]);
    expect(check).toMatch(
      /elsif v_currency = 'inr' and v_amount between 1 and 100000000000 then\s+insert into public\.payment_attempts/,
    );
    expect(check).toMatch(
      /values \(\s+v_order\.id, 'razorpay', v_pa\.provider_order_id, v_id, v_amount, 'inr', 'created', false\);/,
    );
    expect(check).not.toMatch(
      /'authorized', (true|false)\)|'captured', (true|false)\)/,
    );
    // A payment id another order holds is refused before anything of the call is kept.
    expect(check.indexOf("raise exception 'payment: payment_conflict'")).toBe(
      check.lastIndexOf("raise exception 'payment: payment_conflict'"),
    );
    expect(
      check.indexOf("raise exception 'payment: payment_conflict'"),
    ).toBeLessThan(check.indexOf("insert into public.payment_attempts"));
    expect(check).not.toContain("provider_events");
    expect(check).not.toContain("pending_work");
  });

  it("audits the hold with the observed money, and the review with every payment as observed — reason provider_check", () => {
    expect(check).toMatch(
      /'payment\.hold\.' \|\| v_hold,[\s\S]*?'payment', \(v_seen -> 0\) - 'id'\),\s+'provider_check',\s+v_ref\);/,
    );
    expect(check).toMatch(
      /'payment\.review\.' \|\| v_reason,[\s\S]*?'payment_hold', null,\s+'payments', v_seen\),\s+'provider_check',\s+v_ref\);/,
    );
    expect(check).toContain(
      "'id', v_id,\n        'status', v_item ->> 'status',\n        'amount_paise', v_amount,\n        'currency', v_currency",
    );
    // The audit row names the strongest payment shown.
    expect(check).toContain(
      "order by (e.value ->> 'status') = 'captured' desc, e.value ->> 'id'",
    );
  });

  it("answers in 0005's shape", () => {
    expect(check).toMatch(
      /jsonb_build_object\(\s+'held', v_held,\s+'payment_status', o\.payment_status,\s+'needs_review', o\.needs_review,\s+'payment_hold', o\.payment_hold\)/,
    );
  });
});

describe("supabase/rollbacks/0006_payment_evidence.down.sql — schema recovery only", () => {
  const providerCheck5 = definition(
    m5,
    "payment_record_provider_check",
    "grant execute on function public.payment_record_provider_check(uuid, text, text) to service_role;",
  );
  const process5 = definition(
    m5,
    "payment_process_event",
    "grant execute on function public.payment_process_event(uuid) to service_role;",
  );
  const record5 = definition(
    m5,
    "payment_record_event",
    "grant execute on function public.payment_record_event(text, text, jsonb) to service_role;",
  );
  const protect2 = definition(
    m2,
    "protect_provider_event",
    "grant execute on function public.protect_provider_event() to service_role;",
  );

  it("restores 0005's three functions and 0002's ledger guard word for word — definition, comment, revoke and grant", () => {
    for (const [name, text] of [
      ["payment_record_provider_check", providerCheck5],
      ["payment_process_event", process5],
      ["payment_record_event", record5],
      ["protect_provider_event", protect2],
    ] as const)
      expect(down, name).toContain(text);
  });

  it("is the reversal of the forward file, in reverse order, and nothing more", () => {
    const at = (needle: string) => {
      const index = down.indexOf(needle);
      expect(index, needle).toBeGreaterThan(0);
      return index;
    };
    const order = [
      at(
        "drop function if exists public.payment_record_provider_check(uuid, jsonb);",
      ),
      at(providerCheck5),
      at(process5),
      at(
        "drop function if exists public.payment_record_event(text, text, jsonb, bytea);",
      ),
      at(record5),
      at(protect2),
      at(
        "alter table public.provider_events\n  drop constraint if exists provider_events_raw_body_length,\n  drop column if exists raw_body;",
      ),
    ];
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // Nothing else is created or dropped.
    expect(downCode.match(/\bdrop [^;]+;/g)).toEqual([
      "drop function if exists public.payment_record_provider_check(uuid, jsonb);",
      "drop function if exists public.payment_record_event(text, text, jsonb, bytea);",
      "drop constraint if exists provider_events_raw_body_length,\n  drop column if exists raw_body;",
    ]);
    expect(
      [
        ...downCode.matchAll(/create or replace function (public\.\w+)\s*\(/g),
      ].map((match) => match[1]),
    ).toEqual([
      "public.payment_record_provider_check",
      "public.payment_process_event",
      "public.payment_record_event",
      "public.protect_provider_event",
    ]);
    for (const never of [
      "cascade",
      "truncate",
      "delete from",
      "drop table",
      "row level security",
      "raw_body is distinct",
      "p_raw_body",
      "p_payments",
    ])
      expect(downCode, never).not.toContain(never);
    const grants = downCode.match(/grant [^;]+;/g) ?? [];
    expect(grants).toHaveLength(4);
    for (const grant of grants) expect(grant).toMatch(/to service_role;$/);
  });

  it("says plainly what it deletes and does not restore, and names the ledger repair", () => {
    // The header's prose, one line.
    const prose = down
      .slice(0, down.indexOf("\ndrop function"))
      .replace(/\n-- ?/g, " ")
      .toLowerCase();
    expect(prose).toContain(
      "deletes, for every delivery ledgered since 0006, the exact bytes the webhook verified",
    );
    expect(prose).toContain("schema, never data");
    expect(prose).toContain("must be rolled back first");
    expect(prose).toContain("migration repair --status reverted 0006");
    expect(prose).toContain("outside supabase/migrations/");
  });
});
