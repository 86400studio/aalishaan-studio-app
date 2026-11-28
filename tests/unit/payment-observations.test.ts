import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * 0009_payment_observations — S1.7, after the independent review's round 4 (findings 1 and 2; docs/database-changes/
 * S1.7-0009-payment-observations.md). Hermetic guards of the forward file and its down file, in the style of the
 * 0006–0008 guards: the house style and the grants; payment_record_provider_check is 0007's but for two hunks (a
 * processed signed failure in the ledger read for every listed payment; the observation over a standing hold kept
 * once), payment_process_event is 0008's but for its two failure rules (a payment a verified return reported), and
 * payment_return_state is 0008's but for the per-payment record of a verified return and the contradiction with a
 * recorded signed failure; a down file that restores the three predecessors word for word and nothing more.
 *
 * What the functions DO against a real database is tests/integration/payments.test.ts → "0009 — …" (run on TEST after
 * the owner-approved apply).
 */

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (relative: string) =>
  readFileSync(path.join(ROOT, relative), "utf8").replace(/\r\n/g, "\n");

const up = read("supabase/migrations/0009_payment_observations.sql");
const down = read("supabase/rollbacks/0009_payment_observations.down.sql");
const m8 = read("supabase/migrations/0008_payment_discrepancies.sql");
const m7 = read("supabase/migrations/0007_payment_review.sql");

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

/** `text` with `from` (which must occur exactly once) replaced by `to`. */
function undo(text: string, from: string, to: string): string {
  expect(text.split(from), from.slice(0, 80)).toHaveLength(2);
  return text.replace(from, () => to);
}

/** The tables a function locks, in order: `from public.<table> <alias> … for update;`. */
const locksOf = (text: string) =>
  [
    ...statementsOnly(text).matchAll(
      /from public\.(\w+) (\w+)[^;]*?for update;/g,
    ),
  ].map((match) => `${match[1]} ${match[2]}`);

const CHECK_HEAD =
  "create or replace function public.payment_record_provider_check(";
const PROCESS_HEAD = "create or replace function public.payment_process_event(";
const RETURN_HEAD = "create or replace function public.payment_return_state(";
const CHECK_GRANT =
  "grant execute on function public.payment_record_provider_check(uuid, jsonb) to service_role;";
const PROCESS_GRANT =
  "grant execute on function public.payment_process_event(uuid) to service_role;";
const RETURN_GRANT =
  "grant execute on function public.payment_return_state(text, text) to service_role;";
const SIGNATURES = [
  "public.payment_record_provider_check(uuid, jsonb)",
  "public.payment_process_event(uuid)",
  "public.payment_return_state(text, text)",
] as const;

/** The ledger read 0009 adds, as both functions write it: a processed signed failure of the payment, this checkout's. */
const ledgerRead = (paymentId: string) =>
  new RegExp(
    `select 1 from public\\.provider_events e\\s+where e\\.provider = 'razorpay' and e\\.event_type = 'payment\\.failed'\\s+and e\\.signature_ok and e\\.processing_status = 'processed'\\s+and e\\.payload #>> '\\{payload,payment,entity,id\\}' = ${paymentId}\\s+and e\\.payload #>> '\\{payload,payment,entity,order_id\\}' = v_pa\\.provider_order_id`,
  );

const check9 = functionText(up, CHECK_HEAD);
const check7 = functionText(m7, CHECK_HEAD);
const process9 = functionText(up, PROCESS_HEAD);
const process8 = functionText(m8, PROCESS_HEAD);
const return9 = functionText(up, RETURN_HEAD);
const return8 = functionText(m8, RETURN_HEAD);

describe("supabase/migrations/0009_payment_observations.sql — the house style", () => {
  it("re-creates exactly three functions, with their predecessors' signatures: the provider check, the processor and the verified return", () => {
    expect(
      [...code.matchAll(/create or replace function (public\.\w+)\s*\(/g)].map(
        (match) => match[1],
      ),
    ).toEqual([
      "public.payment_record_provider_check",
      "public.payment_process_event",
      "public.payment_return_state",
    ]);
    expect(up).toContain(
      "create or replace function public.payment_record_provider_check(\n  p_payment_attempt_id uuid,\n  p_payments           jsonb)\nreturns jsonb",
    );
    expect(up).toContain(
      "create or replace function public.payment_process_event(p_event uuid)\nreturns jsonb",
    );
    expect(up).toContain(
      "create or replace function public.payment_return_state(\n  p_attempt_hash        text,\n  p_verified_payment_id text)\nreturns jsonb",
    );
  });

  it("hardens all three: plpgsql, pinned empty search_path, never SECURITY DEFINER, EXECUTE for service_role only", () => {
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

  it("changes no table, column, index, policy, trigger or row outside the three function bodies, and opens no transaction", () => {
    const statements = outsideBodies(up)
      .split(";")
      .map((s) => s.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    expect(statements).toEqual([
      "create or replace function public.payment_record_provider_check( p_payment_attempt_id uuid, p_payments jsonb) returns jsonb language plpgsql set search_path = '' as $fn$ … $fn$",
      "revoke execute on function public.payment_record_provider_check(uuid, jsonb) from public, anon, authenticated",
      "grant execute on function public.payment_record_provider_check(uuid, jsonb) to service_role",
      "create or replace function public.payment_process_event(p_event uuid) returns jsonb language plpgsql set search_path = '' as $fn$ … $fn$",
      "revoke execute on function public.payment_process_event(uuid) from public, anon, authenticated",
      "grant execute on function public.payment_process_event(uuid) to service_role",
      "create or replace function public.payment_return_state( p_attempt_hash text, p_verified_payment_id text) returns jsonb language plpgsql set search_path = '' as $fn$ … $fn$",
      "revoke execute on function public.payment_return_state(text, text) from public, anon, authenticated",
      "grant execute on function public.payment_return_state(text, text) to service_role",
    ]);
    // The three comments state 0009's rule and end with the security trailer.
    const comments = up.match(/comment on [^;']*? is\s+'(?:[^']|'')*';/g) ?? [];
    expect(comments).toHaveLength(3);
    for (const comment of comments) {
      expect(comment).toContain("0009");
      expect(comment).toContain(
        "EXECUTE for service_role only; pinned empty search_path; not SECURITY DEFINER.",
      );
    }
  });

  it("never reads the sales gate: a confirmation never depends on business_rules", () => {
    expect(code).not.toContain("business_rules");
  });
});

describe("0009 — payment_record_provider_check: 0007's body except two hunks (round 4, finding 1)", () => {
  const LEDGER_9 = [
    "      if v_reason is null and v_holdable and exists (",
    "        -- 0009: a processed signed failure of this payment in the ledger, for this checkout's provider order — stale",
    "        -- beside a signed authorisation, one that authorisation moved the row past, or one whose money no payment row",
    "        -- could hold (so none was written) — contradicts what the provider shows, as a failed row does, for an order",
    "        -- that could be held: the review the signed failure meets when this check is recorded first",
    "        -- (payment_process_event, the failure rule), whichever of the two took the order's lock first (the",
    "        -- independent review's round 4, finding 1, from the other side).",
    "        select 1 from public.provider_events e",
    "         where e.provider = 'razorpay' and e.event_type = 'payment.failed'",
    "           and e.signature_ok and e.processing_status = 'processed'",
    "           and e.payload #>> '{payload,payment,entity,id}' = v_id",
    "           and e.payload #>> '{payload,payment,entity,order_id}' = v_pa.provider_order_id",
    "      ) then",
    "        v_reason := 'payment_state_conflict';",
    "      end if;",
    "",
  ].join("\n");
  const OBSERVED_START =
    "\n    elsif v_reason is null and v_holdable and v_order.payment_hold is not null and not exists (";
  const OBSERVED_END = "        'provider_check',\n        v_ref);";
  const observedFrom = check9.indexOf(OBSERVED_START);
  const observedTo =
    check9.indexOf(OBSERVED_END, observedFrom) + OBSERVED_END.length;
  const observed = check9.slice(observedFrom, observedTo);

  it("is 0007's body word for word except the two hunks", () => {
    expect(observedFrom).toBeGreaterThan(0);
    expect(observedTo).toBeGreaterThan(observedFrom);
    const restored = undo(
      check9.slice(0, observedFrom) + check9.slice(observedTo),
      LEDGER_9,
      "",
    );
    expect(restored).toBe(check7);
  });

  it("reads the ledger's signed failure of every listed payment — found or not, this checkout's — only for an order that could be held and while nothing else calls for a review, as a plain read, and makes it the review a failed row is", () => {
    const at = check9.indexOf(LEDGER_9);
    // Inside the loop over the listed payments, after the found and insert branches, before the payment is kept.
    expect(at).toBeGreaterThan(check9.indexOf("    for v_item in"));
    expect(at).toBeGreaterThan(check9.indexOf("        v_new := true;"));
    expect(at).toBeLessThan(check9.indexOf("      v_seen := v_seen ||"));
    expect(at).toBeLessThan(check9.indexOf("    end loop;"));
    const ledger = statementsOnly(LEDGER_9);
    expect(ledger).toMatch(ledgerRead("v_id"));
    expect(ledger).toMatch(/^\s*if v_reason is null and v_holdable and exists/);
    expect(ledger).not.toContain("for update");
    expect(ledger).not.toMatch(/\bupdate\b|\binsert\b|\bdelete\b/);
    expect(ledger).toContain("v_reason := 'payment_state_conflict';");
  });

  it("keeps the observation over a standing hold once: one audit row naming the standing hold and the payment — no hold raised, nothing of the order moved", () => {
    // After the branch that raises or upgrades a hold, before the review branch.
    expect(observedFrom).toBeGreaterThan(
      check9.indexOf("      v_held := true;"),
    );
    expect(observedTo).toBeLessThan(
      check9.indexOf("    elsif v_reason is not null and not exists ("),
    );
    const branch = statementsOnly(observed);
    // Only when nothing calls for a review and the order is held: v_holdable with a hold standing.
    expect(branch).toMatch(
      /elsif v_reason is null and v_holdable and v_order\.payment_hold is not null and not exists \(\s+select 1 from public\.audit_log a\s+where a\.entity_type = 'order' and a\.entity_id = v_order\.id::text\s+and a\.action in \('payment\.hold\.authorized_only', 'payment\.hold\.capture_unverified'\)\s+and a\.reason = 'provider_check' and a\.external_ref = v_ref\s+\) then/,
    );
    expect(
      [...branch.matchAll(/insert into public\.(\w+)/g)].map((m) => m[1]),
    ).toEqual(["audit_log"]);
    expect(branch).not.toMatch(/\bupdate\b|\bdelete\b/);
    expect(branch).not.toContain("v_held");
    expect(branch).toContain("'payment.hold.' || v_order.payment_hold,");
    expect(branch).toContain(
      "jsonb_build_object('needs_review', v_order.needs_review, 'payment_hold', v_order.payment_hold),",
    );
    expect(branch).toContain("'payment', (v_seen -> 0) - 'id'),");
    expect(branch).toContain("'provider_check',\n        v_ref);");
  });

  it("keeps 0007's lock order: the checkout row, the order, the payments", () => {
    expect(locksOf(check9)).toEqual([
      "payment_attempts pa",
      "orders o",
      "payment_attempts p",
    ]);
    expect(locksOf(check9)).toEqual(locksOf(check7));
  });
});

describe("0009 — payment_process_event: 0008's body except its two failure rules (round 4, findings 1 and 2)", () => {
  const STALE_8 = [
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
  ].join("\n");
  const STALE_9 = [
    "        elsif v_kind = 'failed' and ((v_order.payment_hold is not null and exists (",
    "          -- 0008: a signed failure of the payment a standing provider-check hold names contradicts that live API",
    "          -- observation whatever the payment's row says by now — a signed authorisation in between included (the",
    "          -- independent review's round 3, finding 2): a review no later capture clears, step (g). The row keeps its",
    "          -- stronger signed status; without such a hold the failure is stale, as before. 0009: the provider check keeps",
    "          -- this record for the payment it observed over a hold a signed authorisation raised too, so which of the two",
    "          -- took the order's lock first no longer decides it (the independent review's round 4, finding 1).",
    "          select 1 from public.audit_log a",
    "           where a.entity_type = 'order' and a.entity_id = v_order.id::text",
    "             and a.action in ('payment.hold.authorized_only', 'payment.hold.capture_unverified')",
    "             and a.reason = 'provider_check' and a.external_ref = v_payment_id",
    "        )) or (v_order.payment_status = 'pending' and v_order.fulfilment_status = 'pending_payment'",
    "               and (not v_order.needs_review or v_order.payment_hold is not null) and exists (",
    "          -- 0009: so does a signed failure of a payment that a verified Checkout return reported, for an order that",
    "          -- could be held — the report and the failure contradict each other (the independent review's round 4,",
    "          -- finding 2's family: payment_return_state meets the same contradiction when the failure comes first).",
    "          select 1 from public.audit_log r",
    "           where r.entity_type = 'order' and r.entity_id = v_order.id::text",
    "             and r.action = 'payment.return.verified' and r.external_ref = v_payment_id",
    "        ))) then",
    "          v_reason := 'payment_state_conflict';",
  ].join("\n");
  const FORWARD_8 = [
    "          -- A signed failure contradicting a live API observation needs a human decision.",
    "          if v_order.payment_hold is not null and exists (",
    "            select 1 from public.audit_log a",
    "             where a.entity_type = 'order' and a.entity_id = v_order.id::text",
    "               and a.action in ('payment.hold.authorized_only', 'payment.hold.capture_unverified')",
    "               and a.reason = 'provider_check' and a.external_ref = v_payment_id",
    "          ) then",
  ].join("\n");
  const FORWARD_9 = [
    "          -- A signed failure contradicting a live API observation needs a human decision — and, since 0009, one that",
    "          -- contradicts a verified Checkout return of the same payment, for an order that could be held.",
    "          if (v_order.payment_hold is not null and exists (",
    "            select 1 from public.audit_log a",
    "             where a.entity_type = 'order' and a.entity_id = v_order.id::text",
    "               and a.action in ('payment.hold.authorized_only', 'payment.hold.capture_unverified')",
    "               and a.reason = 'provider_check' and a.external_ref = v_payment_id",
    "          )) or (v_order.payment_status = 'pending' and v_order.fulfilment_status = 'pending_payment'",
    "                 and (not v_order.needs_review or v_order.payment_hold is not null) and exists (",
    "            select 1 from public.audit_log r",
    "             where r.entity_type = 'order' and r.entity_id = v_order.id::text",
    "               and r.action = 'payment.return.verified' and r.external_ref = v_payment_id",
    "          )) then",
  ].join("\n");

  it("is 0008's body word for word except the two failure rules", () => {
    let restored = undo(process9, STALE_9, STALE_8);
    restored = undo(restored, FORWARD_9, FORWARD_8);
    expect(restored).toBe(process8);
  });

  it("makes a failure of a payment that a verified return reported the conflict in both branches, only for a failure event and only for an order that could be held — never another reason, never a write of its own", () => {
    for (const rule of [STALE_9, FORWARD_9]) {
      const sql = statementsOnly(rule);
      expect(sql).toMatch(
        /or \(v_order\.payment_status = 'pending' and v_order\.fulfilment_status = 'pending_payment'\s+and \(not v_order\.needs_review or v_order\.payment_hold is not null\) and exists \(\s+select 1 from public\.audit_log r\s+where r\.entity_type = 'order' and r\.entity_id = v_order\.id::text\s+and r\.action = 'payment\.return\.verified' and r\.external_ref = v_payment_id\s+\)\)/,
      );
      expect(sql).not.toMatch(/\bupdate\b|\binsert\b|\bdelete\b/);
    }
    // The stale branch is the repeated-or-older one; the forward rule sits in the failed branch after the row moved.
    expect(STALE_9.startsWith("        elsif v_kind = 'failed' and")).toBe(
      true,
    );
    expect(process9.indexOf(FORWARD_9)).toBeGreaterThan(
      process9.indexOf("        if v_kind = 'failed' then"),
    );
    // The provider-check half of each rule is 0008's, unchanged: it reads the record 0009's check now keeps.
    expect(
      process9.match(
        /and a\.reason = 'provider_check' and a\.external_ref = v_payment_id/g,
      ),
    ).toHaveLength(2);
    // Another live payment is 0008's (0007's) count, unchanged.
    expect(process9).not.toMatch(
      /payment\.return\.verified' and \w\.external_ref <> v_payment_id/,
    );
  });

  it("keeps 0008's lock order: the ledger row, the checkout row, the order, the payment", () => {
    expect(locksOf(process9)).toEqual([
      "provider_events pe",
      "payment_attempts pa",
      "orders o",
      "payment_attempts p",
    ]);
  });
});

describe("0009 — payment_return_state: 0008's body except the per-payment record of a verified return and its contradiction with a recorded failure (round 4, finding 2)", () => {
  const DECLARE_8 = "  v_reason   text;\nbegin";
  const DECLARE_9 = "  v_reason   text;\n  v_status   text;\nbegin";
  const FOUND_8 = [
    "      if not v_pay.signature_verified then",
    "        update public.payment_attempts set signature_verified = true where id = v_pay.id;",
    "        v_recorded := true;",
    "      end if;",
  ].join("\n");
  const FOUND_9 = [
    "      if not v_pay.signature_verified then",
    "        update public.payment_attempts set signature_verified = true where id = v_pay.id;",
    "      end if;",
    "      -- 0009: a verified return is recorded once per payment by its own evidence — the payment.return.verified row",
    "      -- below — never by the row's signature_verified, which a signed event sets as well: a payment whose signed",
    "      -- failure was recorded first is still reported here, and judged below (the independent review's round 4,",
    "      -- finding 2). The row keeps its status.",
    "      v_recorded := not exists (",
    "        select 1 from public.audit_log a",
    "         where a.entity_type = 'order' and a.entity_id = v_order_id::text",
    "           and a.action = 'payment.return.verified' and a.external_ref = p_verified_payment_id);",
    "      v_status := v_pay.status;",
  ].join("\n");
  const INSERTED_8 = "      v_recorded := true;\n    end if;";
  const INSERTED_9 =
    "      v_recorded := true;\n      v_status := 'created';\n    end if;";
  const CONFLICT_9 = [
    "        -- 0009: for an order that could be held, a payment whose signed failure was recorded — its row failed, or a",
    "        -- processed signed failure of it in the ledger for this checkout's provider order (one a signed authorisation",
    "        -- moved the row past, or whose money no row could hold) — and that a verified return now reports: the report",
    "        -- and the failure contradict each other (payment_process_event meets the same contradiction when the return",
    "        -- comes first; the independent review's round 4, finding 2's family). The payment keeps its status.",
    "        when (not v_order.needs_review or v_order.payment_hold is not null)",
    "             and (v_status = 'failed' or exists (",
    "               select 1 from public.provider_events e",
    "                where e.provider = 'razorpay' and e.event_type = 'payment.failed'",
    "                  and e.signature_ok and e.processing_status = 'processed'",
    "                  and e.payload #>> '{payload,payment,entity,id}' = p_verified_payment_id",
    "                  and e.payload #>> '{payload,payment,entity,order_id}' = v_pa.provider_order_id",
    "             ))",
    "          then 'payment_state_conflict'",
    "",
  ].join("\n");

  it("is 0008's body word for word except the declaration, the record step, the contradiction and the status its audit rows carry", () => {
    expect(
      return9.match(/jsonb_build_object\('status', v_status\)/g),
    ).toHaveLength(2);
    let restored = undo(return9, DECLARE_9, DECLARE_8);
    restored = undo(restored, FOUND_9, FOUND_8);
    restored = undo(restored, INSERTED_9, INSERTED_8);
    restored = undo(restored, CONFLICT_9, "");
    restored = restored.replaceAll(
      "jsonb_build_object('status', v_status)",
      "jsonb_build_object('status', 'created')",
    );
    expect(restored).toBe(return8);
  });

  it("records a verified return once per payment by its own audit row — never by signature_verified — and leaves the payment's status as it is", () => {
    const body = statementsOnly(return9);
    expect(body.match(/v_recorded := true;/g)).toHaveLength(1); // the new row only
    expect(body).toMatch(
      /v_recorded := not exists \(\s+select 1 from public\.audit_log a\s+where a\.entity_type = 'order' and a\.entity_id = v_order_id::text\s+and a\.action = 'payment\.return\.verified' and a\.external_ref = p_verified_payment_id\);/,
    );
    // The only write to an existing payment row is still the verified bit.
    expect(
      [
        ...body.matchAll(
          /update public\.payment_attempts\s+set ([^;]*?) where/g,
        ),
      ].map((m) => m[1].trim()),
    ).toEqual(["signature_verified = true"]);
    // The review step is 0008's, inside `if v_recorded then`, after the return's own audit row.
    const recordedAt = return9.indexOf("    if v_recorded then");
    expect(recordedAt).toBeGreaterThan(return9.indexOf(FOUND_9));
    expect(return9.indexOf("'payment.return.verified',")).toBeGreaterThan(
      recordedAt,
    );
    expect(return9.indexOf("'payment.review.' || v_reason")).toBeGreaterThan(
      return9.indexOf("'payment.return.verified',"),
    );
  });

  it("makes a recorded signed failure of the reported payment the conflict, last of the reasons, only for an order that could be held — the ledger read this checkout's and a plain read", () => {
    const at = return9.indexOf(CONFLICT_9);
    expect(at).toBeGreaterThan(return9.indexOf("then 'order_not_payable'"));
    expect(return9.indexOf("      end;", at)).toBe(at + CONFLICT_9.length);
    const sql = statementsOnly(CONFLICT_9);
    expect(sql).toMatch(
      /when \(not v_order\.needs_review or v_order\.payment_hold is not null\)\s+and \(v_status = 'failed' or exists \(/,
    );
    expect(sql).toMatch(ledgerRead("p_verified_payment_id"));
    expect(sql).not.toContain("for update");
  });

  it("keeps 0008's lock order: the checkout row, the order, the payment", () => {
    expect(locksOf(return9)).toEqual([
      "payment_attempts pa",
      "orders o",
      "payment_attempts p",
    ]);
  });
});

describe("supabase/rollbacks/0009_payment_observations.down.sql — schema recovery only", () => {
  it("restores 0007's provider check and 0008's processor and verified return word for word — definition, comment, revoke and grant — and nothing more", () => {
    const body = down.slice(down.indexOf(CHECK_HEAD)).trim();
    expect(body).toBe(
      [
        definition(m7, "payment_record_provider_check", CHECK_GRANT),
        definition(m8, "payment_process_event", PROCESS_GRANT),
        definition(m8, "payment_return_state", RETURN_GRANT),
      ].join("\n\n"),
    );
  });

  it("says plainly what it restores and deletes, and names the ledger repair", () => {
    const header = down.slice(0, down.indexOf(CHECK_HEAD));
    expect(
      header.split("\n").filter((line) => line && !line.startsWith("--")),
    ).toEqual([]);
    const prose = header.replace(/\n-- ?/g, " ").toLowerCase();
    expect(prose).toContain("outside supabase/migrations/");
    expect(prose).toContain("schema, never data");
    expect(prose).toContain("deletes nothing");
    expect(prose).toContain("migration repair --status reverted 0009");
    expect(prose).toContain("round 4, findings 1 and 2");
  });
});
