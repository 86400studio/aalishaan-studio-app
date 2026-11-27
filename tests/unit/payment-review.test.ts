import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * 0007_payment_review — S1.7, after the independent review's round 2 (findings 1 and 2; docs/database-changes/
 * S1.7-0007-payment-review.md). Hermetic guards of the forward file and its down file, in the style of the 0006
 * guards (tests/unit/payment-evidence.test.ts): the house style and the grants, the two changed hunks of
 * payment_process_event (and nothing else of it), the provider check that records every linked attempt's
 * observation but holds only an order that awaits its payment — and a down file that restores 0006's two
 * definitions word for word and nothing more.
 *
 * What the functions DO against a real database is tests/integration/payments.test.ts → "0007 — …" (run on TEST
 * after the owner-approved apply).
 */

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (relative: string) =>
  readFileSync(path.join(ROOT, relative), "utf8").replace(/\r\n/g, "\n");

const up = read("supabase/migrations/0007_payment_review.sql");
const down = read("supabase/rollbacks/0007_payment_review.down.sql");
const m6 = read("supabase/migrations/0006_payment_evidence.sql");

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
/** The statements outside every function body (`as $fn$ … $fn$;`). */
const outsideBodies = (sql: string) =>
  withoutComments(sql).replace(/as \$fn\$[\s\S]*?\$fn\$;/g, "as $fn$ … $fn$;");

const code = withoutComments(up);

/** One definition as written: from `create or replace function public.<name>(` to its grant line, inclusive. */
function definition(sql: string, name: string, grant: string): string {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  expect(start, name).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf(grant, start);
  expect(end, grant).toBeGreaterThan(start);
  return sql.slice(start, end + grant.length);
}

/** A function's text as written, from its head to the close of its body. */
function functionText(sql: string, head: string): string {
  const start = sql.indexOf(head);
  expect(start, head).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf("\n$fn$;\n", start);
  expect(end, head).toBeGreaterThan(start);
  return sql.slice(start, end);
}

const PROCESS_HEAD = "create or replace function public.payment_process_event(";
const CHECK_HEAD =
  "create or replace function public.payment_record_provider_check(";
const PROCESS_GRANT =
  "grant execute on function public.payment_process_event(uuid) to service_role;";
const CHECK_GRANT =
  "grant execute on function public.payment_record_provider_check(uuid, jsonb) to service_role;";
const SIGNATURES = [
  "public.payment_process_event(uuid)",
  "public.payment_record_provider_check(uuid, jsonb)",
] as const;

const process7 = functionText(up, PROCESS_HEAD);
const process6 = functionText(m6, PROCESS_HEAD);
const check7 = functionText(up, CHECK_HEAD);
const check6 = functionText(m6, CHECK_HEAD);
const checkCode = statementsOnly(check7);

describe("supabase/migrations/0007_payment_review.sql — the house style", () => {
  it("re-creates exactly two functions, with 0006's signatures: the processor and the provider check", () => {
    expect(
      [...code.matchAll(/create or replace function (public\.\w+)\s*\(/g)].map(
        (match) => match[1],
      ),
    ).toEqual([
      "public.payment_process_event",
      "public.payment_record_provider_check",
    ]);
    expect(up).toContain(
      "create or replace function public.payment_process_event(p_event uuid)\nreturns jsonb",
    );
    expect(up).toContain(
      "create or replace function public.payment_record_provider_check(\n  p_payment_attempt_id uuid,\n  p_payments           jsonb)\nreturns jsonb",
    );
  });

  it("hardens both: plpgsql, pinned empty search_path, never SECURITY DEFINER, EXECUTE for service_role only", () => {
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

  it("changes no table, column, index, policy, trigger or row outside the two function bodies, and opens no transaction", () => {
    // Outside the bodies: the two definitions, their comments (stripped here), and their revoke/grant pairs only.
    const statements = outsideBodies(up)
      .split(";")
      .map((s) => s.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    expect(statements).toEqual([
      "create or replace function public.payment_process_event(p_event uuid) returns jsonb language plpgsql set search_path = '' as $fn$ … $fn$",
      "revoke execute on function public.payment_process_event(uuid) from public, anon, authenticated",
      "grant execute on function public.payment_process_event(uuid) to service_role",
      "create or replace function public.payment_record_provider_check( p_payment_attempt_id uuid, p_payments jsonb) returns jsonb language plpgsql set search_path = '' as $fn$ … $fn$",
      "revoke execute on function public.payment_record_provider_check(uuid, jsonb) from public, anon, authenticated",
      "grant execute on function public.payment_record_provider_check(uuid, jsonb) to service_role",
    ]);
    // Both comments are rewritten for 0007's rules (never left describing 0006).
    expect(up).toContain(
      "comment on function public.payment_process_event(uuid) is",
    );
    expect(up).toContain(
      "comment on function public.payment_record_provider_check(uuid, jsonb) is",
    );
    expect(up).toMatch(/payment_state_conflict — 0007\)/);
    expect(up).toMatch(/0007 records every linked attempt''s observation/);
    for (const comment of up.match(
      /comment on [^;']*? is\s+'(?:[^']|'')*';/g,
    ) ?? [])
      expect(comment).toContain(
        "EXECUTE for service_role only; pinned empty search_path; not SECURITY DEFINER.",
      );
  });

  it("never reads the sales gate: a confirmation never depends on business_rules", () => {
    expect(code).not.toContain("business_rules");
  });
});

describe("0007 — payment_process_event: 0006's body except two hunks (round 2, finding 1)", () => {
  // The signed failure of the payment a standing provider-check hold names is a review, not a recorded failure.
  const FAILED_6 = [
    "        if v_kind = 'failed' then",
    "          -- A failed payment leaves the order as it is: recoverable while its deadline stands.",
    "          v_outcome := 'recorded:failed';",
    "        else",
  ].join("\n");
  const FAILED_7 = [
    "        if v_kind = 'failed' then",
    "          -- A signed failure contradicting a live API observation needs a human decision.",
    "          if v_order.payment_hold is not null and exists (",
    "            select 1 from public.audit_log a",
    "             where a.entity_type = 'order' and a.entity_id = v_order.id::text",
    "               and a.action in ('payment.hold.authorized_only', 'payment.hold.capture_unverified')",
    "               and a.reason = 'provider_check' and a.external_ref = v_payment_id",
    "          ) then",
    "            v_reason := 'payment_state_conflict';",
    "          else",
    "            v_outcome := 'recorded:failed';",
    "          end if;",
    "        else",
  ].join("\n");
  // While a hold stands, a provider-check hold naming ANOTHER payment is another live payment.
  const OTHER_6 =
    "               and x.provider_payment_id is distinct from v_payment_id);";
  const OTHER_7 = [
    "               and x.provider_payment_id is distinct from v_payment_id)",
    "            or (v_order.payment_hold is not null and exists (",
    "              -- A hold created before 0007 can name a payment whose row already says failed.",
    "              select 1 from public.audit_log a",
    "               where a.entity_type = 'order' and a.entity_id = v_order.id::text",
    "                 and a.action in ('payment.hold.authorized_only', 'payment.hold.capture_unverified')",
    "                 and a.reason = 'provider_check' and a.external_ref <> v_payment_id));",
  ].join("\n");

  it("is 0006's body word for word except the two hunks", () => {
    expect(process6.split(FAILED_6)).toHaveLength(2);
    expect(process6.split(OTHER_6)).toHaveLength(2);
    expect(process7.split(FAILED_7)).toHaveLength(2);
    expect(process7.split(OTHER_7)).toHaveLength(2);
    expect(process7.replace(FAILED_7, FAILED_6).replace(OTHER_7, OTHER_6)).toBe(
      process6,
    );
  });

  it("keeps 0006's lock order: the ledger row, the checkout row, the order, the payment", () => {
    const locks = [
      ...statementsOnly(process7).matchAll(
        /from public\.(\w+) (\w+)[^;]*?for update;/g,
      ),
    ].map((match) => `${match[1]} ${match[2]}`);
    expect(locks).toEqual([
      "provider_events pe",
      "payment_attempts pa",
      "orders o",
      "payment_attempts p",
    ]);
  });
});

describe("0007 — payment_record_provider_check: every linked attempt's observation is kept (round 2, finding 2)", () => {
  /** The text between two markers of a function, as written. */
  const between = (text: string, from: string, to: string) => {
    const start = text.indexOf(from);
    const end = text.indexOf(to, start + from.length);
    expect(start, from).toBeGreaterThan(0);
    expect(end, to).toBeGreaterThan(start);
    return text.slice(start, end);
  };

  it("validates, locks and judges the money exactly as 0006 does — steps (a) to (c) word for word", () => {
    expect(between(check7, "  -- (a) every value's shape", "  -- (d)")).toBe(
      between(check6, "  -- (a) every value's shape", "  -- (d)"),
    );
    // The same refusals and nothing new.
    expect([...new Set(check7.match(/ZP\d{3}/g))].sort()).toEqual([
      "ZP001",
      "ZP020",
      "ZP021",
    ]);
  });

  it("locks the checkout row, then its order, then each payment's row — the order of every payment writer", () => {
    const locks = [
      ...checkCode.matchAll(/from public\.(\w+) (\w+)[^;]*?for update;/g),
    ].map((match) => `${match[1]} ${match[2]}`);
    expect(locks).toEqual([
      "payment_attempts pa",
      "orders o",
      "payment_attempts p",
    ]);
  });

  it("records for every linked attempt, but holds only an order that awaits its payment under no review other than a hold", () => {
    expect(checkCode).toContain("if v_pa.provider_order_state = 'linked' then");
    expect(checkCode).toMatch(
      /v_holdable := v_order\.payment_status = 'pending'\s+and v_order\.fulfilment_status = 'pending_payment'\s+and \(not v_order\.needs_review or v_order\.payment_hold is not null\);/,
    );
    expect(checkCode).toMatch(
      /if v_reason is null and v_holdable\s+and \(not v_order\.needs_review or \(v_order\.payment_hold = 'authorized_only' and v_hold = 'capture_unverified'\)\) then/,
    );
    // The hold is written only in that branch.
    expect(checkCode.match(/payment_hold = v_hold/g)).toHaveLength(1);
  });

  it("names a reason for every observation it cannot hold: extra, other money, a failed row, an order not awaiting payment, a payment beside a review", () => {
    expect(checkCode).toMatch(
      /v_reason := case\s+when v_currency_off then 'currency_mismatch'\s+when v_amount_off then 'amount_mismatch'\s+when cardinality\(v_ids\) > 1 then 'extra_payment'\s+end;/,
    );
    // A confirmed order: only its own confirmed payment is an exact repeat.
    expect(checkCode).toMatch(
      /if v_reason is null and v_order\.payment_status = 'captured' and not exists \(\s+select 1 from public\.audit_log a\s+where a\.entity_type = 'order' and a\.entity_id = v_order\.id::text\s+and a\.action = 'payment\.captured\.confirmed' and a\.external_ref = v_ids\[1\]\s+\) then\s+v_reason := 'extra_payment';/,
    );
    // Otherwise one payment beside another live payment, counted as the event path counts one (payment_process_event's
    // step (e)): another known payment whose row has not failed — a row without a payment id included — or, while a
    // hold stands, a payment another provider-check hold of the order named. Never a hold its own capture cannot clear.
    expect(checkCode).toMatch(
      /elsif v_reason is null and v_order\.payment_status <> 'captured' and \(exists \(\s+select 1 from public\.payment_attempts p\s+where p\.order_id = v_order\.id and p\.provider_order_state is null\s+and p\.status <> 'failed' and p\.provider_payment_id is distinct from v_ids\[1\]\s+\) or \(v_order\.payment_hold is not null and exists \(\s+select 1 from public\.audit_log a\s+where a\.entity_type = 'order' and a\.entity_id = v_order\.id::text\s+and a\.action in \('payment\.hold\.authorized_only', 'payment\.hold\.capture_unverified'\)\s+and a\.reason = 'provider_check' and a\.external_ref <> v_ids\[1\]\)\)\) then\s+v_reason := 'extra_payment';/,
    );
    // The two functions count another live payment by the same two clauses.
    const eventClauses = statementsOnly(process7);
    expect(eventClauses).toContain(
      "and x.provider_payment_id is distinct from v_payment_id)",
    );
    expect(eventClauses).toMatch(
      /or \(v_order\.payment_hold is not null and exists \(\s+select 1 from public\.audit_log a\s+where a\.entity_type = 'order' and a\.entity_id = v_order\.id::text\s+and a\.action in \('payment\.hold\.authorized_only', 'payment\.hold\.capture_unverified'\)\s+and a\.reason = 'provider_check' and a\.external_ref <> v_payment_id\)\);/,
    );
    expect(checkCode).toMatch(
      /if v_pay\.status = 'failed' then\s+v_reason := coalesce\(v_reason, 'payment_state_conflict'\);/,
    );
    expect(checkCode).toMatch(
      /if v_reason is null and v_order\.payment_status <> 'captured' and not v_holdable then\s+v_reason := case\s+when v_order\.payment_status <> 'pending' or v_order\.fulfilment_status <> 'pending_payment'\s+then 'order_not_payable'\s+when v_new then 'order_under_review'\s+end;/,
    );
    // v_new is set only where a row is inserted.
    expect(checkCode.match(/v_new := true;/g)).toHaveLength(1);
    expect(checkCode).toMatch(
      /values \(\s+v_order\.id, 'razorpay', v_pa\.provider_order_id, v_id, v_amount, 'inr', 'created', false\);\s+v_new := true;/,
    );
  });

  it("audits a review once per distinct observation, and a review never clears another review", () => {
    expect(checkCode).toMatch(
      /elsif v_reason is not null and not exists \(\s+select 1 from public\.audit_log a\s+where a\.entity_type = 'order' and a\.entity_id = v_order\.id::text\s+and a\.reason = 'provider_check' and a\.action = 'payment\.review\.' \|\| v_reason\s+and a\.next -> 'payments' = v_seen\s+\) then/,
    );
    expect(checkCode).toMatch(
      /update public\.orders\s+set needs_review = true,\s+payment_hold = null\s+where id = v_order\.id and \(not needs_review or payment_hold is not null\);/,
    );
    // v_seen is built in id order, so a listing in any order is the same observation.
    expect(checkCode).toMatch(
      /for v_item in\s+select e\.value from jsonb_array_elements\(p_payments\) as e\(value\) order by e\.value ->> 'id'\s+loop/,
    );
  });

  it("never confirms, never moves fulfilment, items or pending work: it writes only the order's flag and hold, known payment rows and audit rows", () => {
    const updates = [
      ...checkCode.matchAll(/update public\.(\w+)\s+set ([\s\S]*?)\s+where/g),
    ].map((match) => [match[1], match[2].replace(/\s+/g, " ")]);
    expect(updates).toEqual([
      ["orders", "needs_review = true, payment_hold = v_hold"],
      ["orders", "needs_review = true, payment_hold = null"],
    ]);
    expect(
      [...checkCode.matchAll(/insert into public\.(\w+)/g)].map((m) => m[1]),
    ).toEqual(["payment_attempts", "audit_log", "audit_log"]);
    for (const never of [
      "pending_work",
      "order_items",
      "confirmed_at",
      "delete from",
      "signature_verified = true",
    ])
      expect(checkCode, never).not.toContain(never);
    // A known payment is never paid: created, unverified.
    expect(checkCode).not.toMatch(/'created', true\)/);
  });

  it("answers in 0006's shape", () => {
    const answer = (text: string) => text.slice(text.lastIndexOf("  return ("));
    expect(answer(check7)).toBe(answer(check6));
  });
});

describe("supabase/rollbacks/0007_payment_review.down.sql — schema recovery only", () => {
  const process6Definition = definition(
    m6,
    "payment_process_event",
    PROCESS_GRANT,
  );
  const check6Definition = definition(
    m6,
    "payment_record_provider_check",
    CHECK_GRANT,
  );

  it("restores 0006's two functions word for word — definition, comment, revoke and grant — and nothing more", () => {
    expect(down).toContain(process6Definition);
    expect(down).toContain(check6Definition);
    // Everything after the header is exactly those two definitions, in 0006's order.
    const body = down.slice(down.indexOf(PROCESS_HEAD)).trim();
    expect(body).toBe(`${process6Definition}\n\n${check6Definition}`);
  });

  it("says plainly what it restores and deletes, and names the ledger repair", () => {
    const header = down.slice(0, down.indexOf(PROCESS_HEAD));
    expect(
      header.split("\n").filter((line) => line && !line.startsWith("--")),
    ).toEqual([]);
    const prose = header.replace(/\n-- ?/g, " ").toLowerCase();
    expect(prose).toContain("outside supabase/migrations/");
    expect(prose).toContain("schema, never data");
    expect(prose).toContain("deletes nothing");
    expect(prose).toContain("migration repair --status reverted 0007");
    expect(prose).toContain("round 2, findings 1 and 2, reopen");
  });
});
