import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { PUBLIC_CATALOGUE_COLUMNS } from "@/lib/schemas/catalogue";

/**
 * Regression guards over the S1.1 migrations as written (hermetic — the SQL text; the TEST proofs are the
 * integration suites): every table locked down with narrow explicit grants, no anonymous grant except
 * SELECT on the projection, hardened functions, the append-only guards, the gapless counter (not a
 * sequence), the projection's exact column allow-list, and down files that reverse exactly.
 */

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (relative: string) =>
  readFileSync(path.join(ROOT, relative), "utf8");

const up1 = read("supabase/migrations/0001_catalogue.sql");
const up2 = read("supabase/migrations/0002_orders.sql");
const down1 = read("supabase/rollbacks/0001_catalogue.down.sql");
const down2 = read("supabase/rollbacks/0002_orders.down.sql");
const lower1 = up1.toLowerCase();
const lower2 = up2.toLowerCase();
/** The SQL without its `--` comment lines — the negative assertions below look at code, not prose. */
const code = (sql: string) =>
  statements(sql)
    .filter((s) => !/^comment on /i.test(s))
    .join(";\n")
    .toLowerCase();
const code1 = code(up1);
const code2 = code(up2);

const CATALOGUE_TABLES = [
  "collections",
  "art_styles",
  "frame_finishes",
  "artworks",
  "artwork_images",
  "variants",
];
const ORDER_TABLES = [
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
];
const APPEND_ONLY = [
  "business_rules",
  "policy_versions",
  "addresses",
  "purchase_snapshots",
  "work_history",
  "audit_log",
];
const ORDER_FUNCTIONS = [
  "refuse_change",
  "next_order_number",
  "assign_order_number",
  "guard_order_update",
  "protect_provider_event",
];

/** Statements split on `;` outside single-quoted strings and `$$` bodies, comment lines removed. */
function statements(sql: string): string[] {
  const text = sql
    .split("\n")
    .filter((line) => line.trim() !== "" && !line.trim().startsWith("--"))
    .join("\n");
  const out: string[] = [];
  let current = "";
  let inQuote = false;
  let inDollar = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (!inQuote && text.startsWith("$$", i)) {
      inDollar = !inDollar;
      current += "$$";
      i += 1;
      continue;
    }
    if (!inDollar && ch === "'") inQuote = !inQuote;
    if (ch === ";" && !inQuote && !inDollar) {
      if (current.trim()) out.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

function grantsTo(sql: string, role: string): string[] {
  return statements(sql).filter(
    (s) =>
      /^grant /i.test(s) &&
      new RegExp(`\\bto\\b[^;]*\\b${role}\\b`, "i").test(s),
  );
}

function uniqueGrantsTo(sql: string, roles: string[]): string[] {
  return [...new Set(roles.flatMap((role) => grantsTo(sql, role)))];
}

describe("0001_catalogue — tables, default deny and narrow grants", () => {
  it("creates exactly the six catalogue tables, the status type and the projection view", () => {
    expect(
      lower1
        .match(/create table public\.\w+/g)
        ?.map((m) => m.replace("create table public.", ""))
        .sort(),
    ).toEqual([...CATALOGUE_TABLES].sort());
    expect(lower1).toContain(
      "create type public.artwork_status as enum ('draft', 'in review', 'active', 'hidden', 'retired')",
    );
    expect(lower1.match(/create view/g)).toHaveLength(1);
    expect(lower1).toContain(
      "create view public.public_catalogue with (security_barrier = true)",
    );
  });

  it("locks every table down through the baseline helper and revokes service_role before the explicit grants", () => {
    for (const table of CATALOGUE_TABLES) {
      expect(lower1, table).toContain(
        `select public.lock_down_table('public.${table}');`,
      );
      expect(lower1, table).toContain(
        `revoke all privileges on table public.${table}`,
      );
      expect(lower1, table).toMatch(
        new RegExp(
          `grant select, insert, update, delete on table public\\.${table}\\s+to service_role;`,
        ),
      );
    }
    expect(code1).not.toContain("create policy");
    expect(code1).not.toContain("force row level security");
    expect(code1).not.toContain("security definer");
  });

  it("grants anon and authenticated nothing but SELECT on the projection", () => {
    expect(uniqueGrantsTo(up1, ["anon", "authenticated", "public"])).toEqual([
      "grant select on table public.public_catalogue to anon, authenticated, service_role",
    ]);
    expect(lower1).toContain(
      "revoke all privileges on table public.public_catalogue from public, anon, authenticated, service_role;",
    );
    expect(code1).not.toMatch(/grant [^;]*(truncate|references|trigger)/);
  });

  it("hardens the trigger function: pinned empty search_path, EXECUTE for the server only", () => {
    expect(lower1.match(/create or replace function/g)).toHaveLength(1);
    expect(lower1.match(/set search_path = ''/g)).toHaveLength(1);
    expect(lower1).toContain(
      "revoke execute on function public.enforce_variant_code() from public, anon, authenticated;",
    );
    expect(lower1).toContain(
      "grant execute on function public.enforce_variant_code() to service_role;",
    );
  });

  it("is additive and pipeline-safe", () => {
    for (const forbidden of [
      "drop ",
      "truncate",
      "delete from",
      "alter system",
      "disable row level security",
      "create extension",
      "create schema",
      "create role",
      "alter role",
      "pg_net",
      "cron.",
      "create sequence",
      "nextval",
    ])
      expect(code1, forbidden).not.toContain(forbidden);
    expect(code1).not.toMatch(
      /concurrently|^\s*vacuum|^\s*cluster|^\s*reindex/m,
    );
  });

  it("stores money as bounded positive bigint paise in INR and pins the finish and facet vocabularies", () => {
    expect(lower1).toContain("price_paise  bigint      not null");
    expect(lower1).toContain(
      "check (price_paise > 0 and price_paise <= 100000000000)",
    );
    expect(lower1).toContain("check (currency = 'inr')");
    expect(lower1).toContain(
      "check (code in ('white', 'black', 'antique-gold'))",
    );
    expect(lower1).toContain(
      "check (orientation in ('portrait', 'landscape'))",
    );
    expect(lower1).toContain(
      "rooms <@ array['living room', 'bedroom', 'dining room', 'study & office']::text[]",
    );
    expect(lower1).toContain(
      "variant_code ~ '^[a-z0-9]+(-[a-z0-9]+)*:(white|black|antique-gold)$'",
    );
    expect(code1).not.toMatch(
      /\b(numeric|decimal|real|double precision|float|money)\b/,
    );
  });

  it("projects exactly the allow-listed columns over Active rows and never `select *`", () => {
    const view = up1.slice(
      up1.indexOf("create view public.public_catalogue"),
      up1.indexOf("comment on view public.public_catalogue"),
    );
    expect(view).not.toMatch(/select \*/i);
    expect(view).toContain("where a.status = 'Active'");
    const selectList = view.slice(
      view.indexOf("select\n") + 7,
      view.indexOf("\nfrom public.artworks a"),
    );
    const columns: string[] = [];
    let depth = 0;
    let current = "";
    for (const ch of selectList) {
      if (ch === "(") depth += 1;
      if (ch === ")") depth -= 1;
      if (ch === "," && depth === 0) {
        columns.push(current);
        current = "";
      } else current += ch;
    }
    if (current.trim()) columns.push(current);
    const names = columns.map((c) => {
      const trimmed = c.trim();
      const alias = /\bas\s+(\w+)\s*$/i.exec(trimmed);
      if (alias) return alias[1];
      const plain = /^(?:\w+\.)?(\w+)\s*$/.exec(trimmed);
      return plain ? plain[1] : trimmed;
    });
    expect(names).toEqual([...PUBLIC_CATALOGUE_COLUMNS]);
    for (const privateColumn of [
      "id",
      "status",
      "source_row",
      "created_at",
      "updated_at",
      "collection_id",
      "art_style_id",
    ])
      expect(names, privateColumn).not.toContain(privateColumn);
  });

  it("defines the public bucket as public, WebP-only, 5 MiB, with no storage.objects policy", () => {
    expect(lower1).toContain(
      "insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)",
    );
    expect(lower1).toContain(
      "values ('catalogue-public', 'catalogue-public', true, 5242880, array['image/webp'])",
    );
    expect(code1).not.toContain("storage.objects");
  });
});

describe("0002_orders — tables, append-only guards, numbering and narrow grants", () => {
  it("creates exactly the fourteen order tables and the role enum", () => {
    expect(
      lower2
        .match(/create table public\.\w+/g)
        ?.map((m) => m.replace("create table public.", ""))
        .sort(),
    ).toEqual([...ORDER_TABLES].sort());
    expect(lower2).toContain(
      "create type public.staff_role as enum ('owner_admin', 'operations', 'support')",
    );
  });

  it("locks every table down, revokes service_role and re-grants only what each write rule needs", () => {
    for (const table of ORDER_TABLES) {
      expect(lower2, table).toContain(
        `select public.lock_down_table('public.${table}');`,
      );
      expect(lower2, table).toContain(
        `revoke all privileges on table public.${table}`,
      );
    }
    for (const table of APPEND_ONLY)
      expect(lower2, table).toMatch(
        new RegExp(
          `grant select, insert\\s+on table public\\.${table}\\s+to service_role;`,
        ),
      );
    expect(lower2).toMatch(
      /grant select, update\s+on table public\.order_number_counter\s+to service_role;/,
    );
    expect(lower2).toMatch(
      /grant select, insert, update\s+on table public\.orders\s+to service_role;/,
    );
    expect(lower2).toMatch(
      /grant select, insert, update\s+on table public\.provider_events\s+to service_role;/,
    );
    expect(uniqueGrantsTo(up2, ["anon", "authenticated", "public"])).toEqual(
      [],
    );
    expect(code2).not.toMatch(/grant [^;]*(truncate|references|trigger)/);
    expect(code2).not.toContain("create policy");
    expect(code2).not.toContain("force row level security");
    expect(code2).not.toContain("security definer");
  });

  it("makes the snapshots, versions, history, audit log and addresses append-only by trigger and protects the ledger", () => {
    for (const table of APPEND_ONLY)
      expect(lower2, table).toMatch(
        new RegExp(
          `before update or delete on public\\.${table} for each row execute function public\\.refuse_change\\(\\);`,
        ),
      );
    expect(lower2).toContain(
      "before update or delete on public.provider_events for each row execute function public.protect_provider_event();",
    );
    expect(lower2).toContain("using errcode = '42501'");
    expect(lower2).toContain(
      "constraint provider_events_provider_event_key unique (provider, event_id)",
    );
    expect(lower2).toContain(
      "constraint pending_work_dedupe_key_key unique (dedupe_key)",
    );
  });

  it("numbers orders from a locked counter row inside the inserting transaction, never a sequence", () => {
    expect(lower2).toContain(
      "insert into public.order_number_counter (id, next_value) values (true, 1001);",
    );
    expect(lower2).toContain("set next_value = next_value + 1");
    expect(lower2).toContain("returning next_value - 1 into issued");
    expect(lower2).toContain("return 'as-' || issued::text;");
    expect(lower2).toContain(
      "before insert on public.orders for each row execute function public.assign_order_number();",
    );
    expect(lower2).toContain(
      "raise exception 'orders.order_number is assigned by the database, never by the caller'",
    );
    expect(lower2).toContain("new.version := old.version + 1;");
    for (const forbidden of [
      "create sequence",
      "nextval",
      "generated by default as identity",
      "generated always as identity",
      "serial",
    ])
      expect(code2, forbidden).not.toContain(forbidden);
    expect(lower2).toContain("check (next_value >= 1001)");
    expect(lower2).toContain("order_number ~ '^as-[0-9]{4,12}$'");
  });

  it("hardens the five functions and grants EXECUTE to the server only", () => {
    expect(lower2.match(/create or replace function/g)).toHaveLength(
      ORDER_FUNCTIONS.length,
    );
    expect(lower2.match(/set search_path = ''/g)).toHaveLength(
      ORDER_FUNCTIONS.length,
    );
    for (const fn of ORDER_FUNCTIONS) {
      expect(lower2, fn).toContain(
        `revoke execute on function public.${fn}() from public, anon, authenticated;`,
      );
      expect(lower2, fn).toContain(
        `grant execute on function public.${fn}() to service_role;`,
      );
    }
  });

  it("keeps money exact: bigint paise, INR, the total as the exact sum, unknown charges nullable", () => {
    expect(lower2).toContain(
      "constraint orders_total_is_sum check (total_paise = subtotal_paise + coalesce(shipping_paise, 0) + coalesce(tax_paise, 0))",
    );
    expect(lower2).toContain("shipping_paise          bigint,");
    expect(lower2).toContain("tax_paise               bigint,");
    expect(lower2).toContain(
      "line_total_paise bigint      generated always as (unit_price_paise * quantity) stored",
    );
    expect(lower2).toContain("check (quantity between 1 and 99)");
    expect(lower2).toContain("check (stage between 0 and 10)");
    expect(code2).not.toMatch(
      /\b(numeric|decimal|real|double precision|float|money)\b/,
    );
  });

  it("bounds every paise column at 100,000,000,000 — the rule's shipping charge and the generated line total included", () => {
    expect(lower2).toContain(
      "constraint business_rules_shipping_paise_bounded check (shipping_paise is null or (shipping_paise >= 0 and shipping_paise <= 100000000000))",
    );
    expect(lower2).toContain(
      "constraint order_items_line_total_paise_bounded check (unit_price_paise * quantity <= 100000000000)",
    );
    // The rule's shipping charge, the four order amounts, the unit price, the line total and the attempt amount.
    expect(code2.match(/<= 100000000000/g)).toHaveLength(8);
    // Every `…_paise bigint` column of both files is one of the bounded ones.
    const columns = [
      ...`${code1}\n${code2}`.matchAll(/^\s*(\w+_paise)\s+bigint/gm),
    ]
      .map((m) => m[1])
      .sort();
    expect(columns).toEqual([
      "amount_paise",
      "line_total_paise",
      "price_paise",
      "shipping_paise",
      "shipping_paise",
      "subtotal_paise",
      "tax_paise",
      "total_paise",
      "unit_price_paise",
    ]);
  });

  it("settles D-09: the token hash column, never a raw token", () => {
    expect(lower2).toContain(
      "confirmation_token_hash is null or confirmation_token_hash ~ '^[0-9a-f]{64}$'",
    );
    expect(lower2).toContain(
      "constraint orders_confirmation_token_hash_key unique (confirmation_token_hash)",
    );
    expect(lower2).not.toMatch(/confirmation_token\s+text/);
  });

  it("is additive except the counter's singleton row and pipeline-safe", () => {
    for (const forbidden of [
      "drop ",
      "truncate",
      "delete from",
      "alter system",
      "disable row level security",
      "create extension",
      "create schema",
      "create role",
      "alter role",
      "pg_net",
      "cron.",
    ])
      expect(code2, forbidden).not.toContain(forbidden);
    expect(code2.match(/^insert into /gm)).toHaveLength(1);
    expect(code2).not.toMatch(
      /concurrently|^\s*vacuum|^\s*cluster|^\s*reindex/m,
    );
  });
});

describe("the down files — schema recovery only, in reverse order", () => {
  it("0001 drops the view first, then triggers, the function, the tables in dependency order and the type — and leaves Storage alone", () => {
    const s = statements(down1).map((x) => x.toLowerCase());
    expect(s[0]).toBe("drop view if exists public.public_catalogue");
    const tables = s
      .filter((x) => x.startsWith("drop table"))
      .map((x) => x.replace("drop table if exists public.", ""));
    expect(tables).toEqual([
      "variants",
      "artwork_images",
      "artworks",
      "art_styles",
      "collections",
      "frame_finishes",
    ]);
    expect(s).toContain(
      "drop function if exists public.enforce_variant_code()",
    );
    expect(s[s.length - 1]).toBe("drop type if exists public.artwork_status");
    // Supabase Storage refuses a SQL DELETE on its tables, and one would orphan the files: the bucket and its
    // objects are removed through the Storage API only, never by this file.
    expect(s.filter((x) => x.includes("storage."))).toEqual([]);
    expect(s.filter((x) => !x.startsWith("drop "))).toEqual([]);
    expect(down1).toMatch(/DELETES every row/);
    expect(down1).toMatch(/cannot restore/);
  });

  it("0002 drops exactly its own fourteen tables, five functions and the enum, children before parents, and nothing of 0001", () => {
    const s = statements(down2).map((x) => x.toLowerCase());
    const tables = s
      .filter((x) => x.startsWith("drop table"))
      .map((x) => x.replace("drop table if exists public.", ""));
    expect([...tables].sort()).toEqual([...ORDER_TABLES].sort());
    expect(tables.indexOf("order_items")).toBeLessThan(
      tables.indexOf("orders"),
    );
    expect(tables.indexOf("purchase_snapshots")).toBeLessThan(
      tables.indexOf("orders"),
    );
    expect(tables.indexOf("orders")).toBeLessThan(tables.indexOf("addresses"));
    expect(tables.indexOf("addresses")).toBeLessThan(
      tables.indexOf("customers_contact"),
    );
    expect(tables.indexOf("work_history")).toBeLessThan(
      tables.indexOf("pending_work"),
    );
    expect(tables.indexOf("orders")).toBeLessThan(
      tables.indexOf("business_rules"),
    );
    const functions = s
      .filter((x) => x.startsWith("drop function"))
      .map((x) =>
        x.replace("drop function if exists public.", "").replace("()", ""),
      );
    expect([...functions].sort()).toEqual([...ORDER_FUNCTIONS].sort());
    expect(s).toContain("drop type if exists public.staff_role");
    for (const table of CATALOGUE_TABLES)
      expect(down2, table).not.toContain(`public.${table}`);
    expect(down2).toMatch(/DELETES every order/);
    expect(down2).toMatch(/cannot restore/);
  });
});
