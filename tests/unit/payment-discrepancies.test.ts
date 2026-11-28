import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * 0008_payment_discrepancies — S1.7, after the independent review's round 3 (findings 2 and 3; docs/database-changes/
 * S1.7-0008-payment-discrepancies.md). Hermetic guards of the forward file and its down file, in the style of the 0006
 * and 0007 guards: the house style and the grants; payment_process_event is 0007's but for one hunk (a stale signed
 * failure meets a standing provider-check hold) and payment_return_state is 0005's but for two (a payment newly
 * reported after confirmation, or for an order no longer awaiting its payment, is a review); a down file that restores
 * both predecessors word for word and nothing more.
 *
 * What the functions DO against a real database is tests/integration/payments.test.ts → "0008 — …" (run on TEST after
 * the owner-approved apply).
 */

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (relative: string) =>
  readFileSync(path.join(ROOT, relative), "utf8").replace(/\r\n/g, "\n");

const up = read("supabase/migrations/0008_payment_discrepancies.sql");
const down = read("supabase/rollbacks/0008_payment_discrepancies.down.sql");
const m7 = read("supabase/migrations/0007_payment_review.sql");
const m5 = read("supabase/migrations/0005_payment_finalization.sql");

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
const RETURN_HEAD = "create or replace function public.payment_return_state(";
const PROCESS_GRANT =
  "grant execute on function public.payment_process_event(uuid) to service_role;";
const RETURN_GRANT =
  "grant execute on function public.payment_return_state(text, text) to service_role;";
const SIGNATURES = [
  "public.payment_process_event(uuid)",
  "public.payment_return_state(text, text)",
] as const;

const process8 = functionText(up, PROCESS_HEAD);
const process7 = functionText(m7, PROCESS_HEAD);
const return8 = functionText(up, RETURN_HEAD);
const return5 = functionText(m5, RETURN_HEAD);

describe("supabase/migrations/0008_payment_discrepancies.sql — the house style", () => {
  it("re-creates exactly two functions, with their predecessors' signatures: the processor and the verified return", () => {
    expect(
      [...code.matchAll(/create or replace function (public\.\w+)\s*\(/g)].map(
        (match) => match[1],
      ),
    ).toEqual(["public.payment_process_event", "public.payment_return_state"]);
    expect(up).toContain(
      "create or replace function public.payment_process_event(p_event uuid)\nreturns jsonb",
    );
    expect(up).toContain(
      "create or replace function public.payment_return_state(\n  p_attempt_hash        text,\n  p_verified_payment_id text)\nreturns jsonb",
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
    const statements = outsideBodies(up)
      .split(";")
      .map((s) => s.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    expect(statements).toEqual([
      "create or replace function public.payment_process_event(p_event uuid) returns jsonb language plpgsql set search_path = '' as $fn$ … $fn$",
      "revoke execute on function public.payment_process_event(uuid) from public, anon, authenticated",
      "grant execute on function public.payment_process_event(uuid) to service_role",
      "create or replace function public.payment_return_state( p_attempt_hash text, p_verified_payment_id text) returns jsonb language plpgsql set search_path = '' as $fn$ … $fn$",
      "revoke execute on function public.payment_return_state(text, text) from public, anon, authenticated",
      "grant execute on function public.payment_return_state(text, text) to service_role",
    ]);
    // Both comments state 0008's rule and end with the security trailer.
    const comments = up.match(/comment on [^;']*? is\s+'(?:[^']|'')*';/g) ?? [];
    expect(comments).toHaveLength(2);
    for (const comment of comments) {
      expect(comment).toContain("0008");
      expect(comment).toContain(
        "EXECUTE for service_role only; pinned empty search_path; not SECURITY DEFINER.",
      );
    }
  });

  it("never reads the sales gate: a confirmation never depends on business_rules", () => {
    expect(code).not.toContain("business_rules");
  });
});

describe("0008 — payment_process_event: 0007's body except one hunk (round 3, finding 2)", () => {
  const STALE_7 = [
    "        elsif v_kind <> 'failed' and v_amount is distinct from v_pay.amount_paise then",
    "          v_reason := 'amount_mismatch';",
    "        else",
    "          v_outcome := case when v_kind = 'captured' then 'duplicate_capture' else 'stale_' || v_kind end;",
    "        end if;",
  ].join("\n");
  const STALE_8 = [
    "        elsif v_kind <> 'failed' and v_amount is distinct from v_pay.amount_paise then",
    "          v_reason := 'amount_mismatch';",
    "        elsif v_kind = 'failed' and v_order.payment_hold is not null and exists (",
    "          -- 0008: a signed failure of the payment a standing provider-check hold names contradicts that live API",
    "          -- observation whatever the payment's row says by now — a signed authorisation in between included (the",
    "          -- independent review's round 3, finding 2): a review no later capture clears, step (g). The row keeps its",
    "          -- stronger signed status; without such a hold the failure is stale, as before.",
    "          select 1 from public.audit_log a",
    "           where a.entity_type = 'order' and a.entity_id = v_order.id::text",
    "             and a.action in ('payment.hold.authorized_only', 'payment.hold.capture_unverified')",
    "             and a.reason = 'provider_check' and a.external_ref = v_payment_id",
    "        ) then",
    "          v_reason := 'payment_state_conflict';",
    "        else",
    "          v_outcome := case when v_kind = 'captured' then 'duplicate_capture' else 'stale_' || v_kind end;",
    "        end if;",
  ].join("\n");

  it("is 0007's body word for word except the stale branch", () => {
    expect(process7.split(STALE_7)).toHaveLength(2);
    expect(process8.split(STALE_8)).toHaveLength(2);
    expect(process8.replace(STALE_8, STALE_7)).toBe(process7);
  });

  it("names the conflict only for a failed event, only while a hold stands, only for the payment a provider-check hold named", () => {
    // The branch is the stale one: the payment's row is already failed, authorised or captured.
    const at = process8.indexOf(STALE_8);
    expect(
      process8.lastIndexOf(
        "or (v_kind = 'failed' and v_pay.status in ('failed', 'authorized', 'captured'))) then",
        at,
      ),
    ).toBeGreaterThan(0);
    // The review is step (g)'s: it flags the order and clears the hold, and the payment's row is never written there.
    const branch = statementsOnly(STALE_8);
    expect(branch).not.toMatch(/\bupdate\b|\binsert\b/);
    expect(statementsOnly(process8)).toMatch(
      /if v_reason is not null then\s+if not v_order\.needs_review or v_order\.payment_hold is not null then\s+update public\.orders\s+set needs_review = true,\s+payment_hold = null\s+where id = v_order\.id;/,
    );
  });

  it("keeps 0007's lock order: the ledger row, the checkout row, the order, the payment", () => {
    const locks = [
      ...statementsOnly(process8).matchAll(
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

describe("0008 — payment_return_state: 0005's body except two hunks (round 3, finding 3)", () => {
  const DECLARE_5 = "  v_recorded boolean := false;\nbegin";
  const DECLARE_8 = "  v_recorded boolean := false;\n  v_reason   text;\nbegin";
  const reviewStart =
    "\n\n      -- 0008: a payment newly reported for an order that no longer awaits its payment";
  const reviewEnd = "          p_verified_payment_id);\n      end if;\n";

  it("is 0005's body word for word except the declaration and the review step after the return audit", () => {
    expect(return5.split(DECLARE_5)).toHaveLength(2);
    expect(return8.split(DECLARE_8)).toHaveLength(2);
    const from = return8.indexOf(reviewStart);
    expect(from).toBeGreaterThan(0);
    const to = return8.indexOf(reviewEnd, from) + reviewEnd.length;
    expect(to).toBeGreaterThan(from);
    const without = return8.slice(0, from) + "\n" + return8.slice(to);
    expect(without.replace(DECLARE_8, DECLARE_5)).toBe(return5);
  });

  const review = statementsOnly(
    return8.slice(
      return8.indexOf(reviewStart),
      return8.indexOf(reviewEnd, return8.indexOf(reviewStart)) +
        reviewEnd.length,
    ),
  );

  it("reviews only a payment newly recorded by this return: on a confirmed order one other than the confirming payment, or any payment for an order no longer awaiting it", () => {
    // Inside `if v_recorded then` — the first time this payment's verified return is recorded — after its audit row.
    const recordedAt = return8.indexOf("    if v_recorded then");
    expect(recordedAt).toBeGreaterThan(0);
    expect(return8.indexOf(reviewStart)).toBeGreaterThan(recordedAt);
    expect(return8.indexOf(reviewStart)).toBeGreaterThan(
      return8.indexOf("'payment.return.verified',"),
    );
    expect(review).toMatch(
      /v_reason := case\s+when v_order\.payment_status = 'captured' then\s+case when not exists \(\s+select 1 from public\.audit_log a\s+where a\.entity_type = 'order' and a\.entity_id = v_order_id::text\s+and a\.action = 'payment\.captured\.confirmed' and a\.external_ref = p_verified_payment_id\s+\) then 'extra_payment' end\s+when v_order\.payment_status <> 'pending' or v_order\.fulfilment_status <> 'pending_payment'\s+then 'order_not_payable'\s+end;/,
    );
  });

  it("flags the order and audits it once, and moves nothing else: no payment status, fulfilment, confirmation, item or pending work", () => {
    const updates = [
      ...review.matchAll(
        /update public\.(\w+)\s+set ([\s\S]*?)\s+where ([^;]*);/g,
      ),
    ].map((match) => [
      match[1],
      match[2].replace(/\s+/g, " "),
      match[3].replace(/\s+/g, " "),
    ]);
    expect(updates).toEqual([
      [
        "orders",
        "needs_review = true, payment_hold = null",
        "id = v_order_id and (not needs_review or payment_hold is not null)",
      ],
    ]);
    expect(
      [...review.matchAll(/insert into public\.(\w+)/g)].map((m) => m[1]),
    ).toEqual(["audit_log"]);
    expect(review).toContain("'payment.review.' || v_reason");
    expect(review).toContain(
      "'checkout_signature',\n          p_verified_payment_id);",
    );
    // (The statuses are only compared — the one UPDATE above sets the flag and the hold, nothing else.)
    for (const never of [
      "pending_work",
      "order_items",
      "confirmed_at",
      "delete from",
    ])
      expect(review, never).not.toContain(never);
  });

  it("keeps 0005's lock order: the checkout row, the order, the payment", () => {
    const locks = [
      ...statementsOnly(return8).matchAll(
        /from public\.(\w+) (\w+)[^;]*?for update;/g,
      ),
    ].map((match) => `${match[1]} ${match[2]}`);
    expect(locks).toEqual([
      "payment_attempts pa",
      "orders o",
      "payment_attempts p",
    ]);
  });
});

describe("supabase/rollbacks/0008_payment_discrepancies.down.sql — schema recovery only", () => {
  const process7Definition = definition(
    m7,
    "payment_process_event",
    PROCESS_GRANT,
  );
  const return5Definition = definition(
    m5,
    "payment_return_state",
    RETURN_GRANT,
  );

  it("restores 0007's processor and 0005's verified return word for word — definition, comment, revoke and grant — and nothing more", () => {
    const body = down.slice(down.indexOf(PROCESS_HEAD)).trim();
    expect(body).toBe(`${process7Definition}\n\n${return5Definition}`);
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
    expect(prose).toContain("migration repair --status reverted 0008");
    expect(prose).toContain("round 3, findings 2 and 3");
  });
});
