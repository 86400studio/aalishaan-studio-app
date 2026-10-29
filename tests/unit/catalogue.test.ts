import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  ART_CARD,
  ART_STYLES_PAGE,
  BROWSE_DETAIL,
  BROWSE_HERO_IMAGES,
  CATALOGUE_STATES,
  COLLECTION_ROUTES,
  COLLECTIONS_PAGE,
  LISTING,
  SAVED_VIEW,
  SHOP_PAGE,
  STYLE_ROUTES,
} from "@/content/public/browse";
import { FEATURED, FINISHES } from "@/content/public/home";
import { SELECT_KEYS } from "@/lib/catalogue/filters";
import { formatRupees } from "@/lib/money";
import {
  FINISH_NAMES,
  PUBLIC_CATALOGUE_COLUMNS,
  type FinishCode,
} from "@/lib/schemas/catalogue";

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

/**
 * Copy parity — S1.4 (CLAUDE.md "Approved content and design"; docs/APPROVED-INPUTS.md §2): the browse copy of
 * src/content/public/browse.ts, read back at test time from the 17 frozen pages prototype/scripts/build-browse.cjs
 * generated — Shop All, the Collections and Art Styles hubs and their 3 + 11 detail pages — and from the runtime
 * literals of prototype/shared/browse.js; the pages decoded and their white space collapsed as the browser renders
 * them (the approach of public-content.test.ts, restated here: a test file imports no other). A destination is
 * compared through the prototype's route map (`prototype/site-manifest.json` aliases), an image through the
 * site-image manifest (scripts/testing/site-images.json). The honest states the prototype has no copy for
 * (NS-26–NS-29) are held to the register's rules. Hermetic: files only.
 */
describe("S1.4 browse copy — Shop All, the two hubs and the fourteen detail pages", () => {
  const ENTITIES: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    nbsp: String.fromCharCode(160),
  };
  type Page = { file: string; html: string; head: string; main: string };
  const loaded = new Map<string, Page>();
  /**
   * A frozen page by its prototype path, read once: entities decoded, ordinary white space collapsed (a no-break
   * space stays one). The generated markup has no white space inside an attribute, so attributes read as written.
   */
  function browsePage(file: string): Page {
    const cached = loaded.get(file);
    if (cached) return cached;
    const html = read(`prototype/${file}`)
      .replace(/&#(\d+);/g, (_, code: string) =>
        String.fromCodePoint(Number(code)),
      )
      .replace(/&([a-z]+);/g, (match, name: string) => ENTITIES[name] ?? match)
      .replace(/[ \t\n\r\f]+/g, " ");
    const page = {
      file,
      html,
      head: html.slice(0, html.indexOf("</head>")),
      main: html.slice(
        html.indexOf('<main id="main">'),
        html.indexOf("</main>"),
      ),
    };
    loaded.set(file, page);
    return page;
  }
  /** The capture groups of the pattern's first match, which must exist. */
  function groups(html: string, pattern: RegExp, what: string): string[] {
    const match = pattern.exec(html);
    expect(match, `expected the prototype to carry ${what}`).not.toBeNull();
    return match!.slice(1);
  }
  /** A prototype href, relative to its page, as the prototype path it opens (a hash kept). */
  const resolveFrom = (page: Page, href: string) =>
    path.posix.join(path.posix.dirname(page.file), href);

  /** The prototype's route map: each app route to the frozen page it serves. */
  const ROUTE_MAP = (
    JSON.parse(read("prototype/site-manifest.json")) as {
      aliases: Record<string, string>;
    }
  ).aliases;
  /**
   * The prototype page an app href stands for (a hash kept). The route must be the canonical one — the first the
   * manifest lists for its page; the later ones are the 301 aliases (TECH-ARCHITECTURE §3d).
   */
  function prototypeHref(appHref: string): string {
    const [, route, rest] = /^([^?#]*)(.*)$/.exec(appHref)!;
    const file = ROUTE_MAP[route];
    expect(file, `the manifest maps ${route}`).toBeDefined();
    const canonical = Object.entries(ROUTE_MAP).find(([, f]) => f === file)![0];
    expect(route, `${route} is the canonical route of ${file}`).toBe(canonical);
    return `${file}${rest}`;
  }
  const collectionPage = (slug: string) =>
    browsePage(prototypeHref(`/collections/${slug}`));
  const stylePage = (slug: string) =>
    browsePage(prototypeHref(`/art-styles/${slug}`));
  /** Shop All and the fourteen detail pages: the pages with the listing. */
  const listingPages = () => [
    browsePage(prototypeHref("/shop")),
    ...COLLECTION_ROUTES.map(({ slug }) => collectionPage(slug)),
    ...STYLE_ROUTES.map(({ slug }) => stylePage(slug)),
  ];
  /** The listing's cards (build-browse.cjs:61): each artwork's slug and its card's markup. */
  const cardsOf = (page: Page) =>
    [
      ...page.main.matchAll(
        /<article class="art-card" data-product="([a-z0-9-]+)">([\s\S]*?)<\/article>/g,
      ),
    ].map((m) => ({ slug: m[1]!, html: m[2]! }));
  /** A hub's cards in order (build-browse.cjs:80, :81): the link and its name, the image and its alt, the heading, the action. */
  function hubCards(page: Page, kind: "collection-card" | "browse-story") {
    const body =
      kind === "collection-card"
        ? "collection-card__body"
        : "browse-story__copy";
    const card = new RegExp(
      `<article class="${kind}"><a class="${kind}__image" href="([^"]*)" aria-label="([^"]*)"><img src="([^"]*)" srcset="([^"]*)"[^>]* alt="([^"]*)"[^>]*></a><div class="${body}"><h2>([^<]*)</h2><p>[^<]*</p><a class="button button--primary" href="([^"]*)">([^<]*) <span aria-hidden="true">→</span></a></div></article>`,
      "g",
    );
    return [...page.main.matchAll(card)].map((m) => ({
      href: resolveFrom(page, m[1]!),
      open: m[2]!,
      image: resolveFrom(page, m[3]!),
      srcSet: m[4]!.split(", ").map((candidate) => {
        const [url, width] = candidate.split(" ");
        return { file: resolveFrom(page, url!), width: width! };
      }),
      alt: m[5]!,
      name: m[6]!,
      actionHref: resolveFrom(page, m[7]!),
      action: m[8]!,
    }));
  }
  /** The site images the manifest delivers from a prototype file, by key and size. */
  const SITE_IMAGES = (
    JSON.parse(read("scripts/testing/site-images.json")) as {
      entries: { name: string; size: string; source_path: string }[];
    }
  ).entries;
  const deliveredFrom = (source: string) =>
    SITE_IMAGES.filter((entry) => entry.source_path === source).map(
      ({ name, size }) => ({ name, size }),
    );
  const TITLE = /<title>([^<]*)<\/title>/;
  const META_DESCRIPTION = /<meta [^>]*name="description"/;

  it.each([
    { route: "/shop", copy: SHOP_PAGE },
    { route: "/collections", copy: COLLECTIONS_PAGE },
    { route: "/art-styles", copy: ART_STYLES_PAGE },
  ])(
    "$route — the head title and the hero's eyebrow, heading and intro are the page's; it has no meta description",
    ({ route, copy }) => {
      const page = browsePage(prototypeHref(route));
      const [title] = groups(page.head, TITLE, `${page.file}: a title`);
      const [eyebrow, heading, intro] = groups(
        page.main,
        /^<main id="main"><section class="browse-hero browse-hero--r9"[^>]*><div class="container browse-hero__inner"><div><span class="eyebrow">([^<]*)<\/span><h1>([^<]*)<\/h1><p>([^<]*)<\/p><\/div><\/div><\/section>/,
        `${page.file}: the hero`,
      );
      expect({ title, eyebrow, heading, intro }).toEqual({
        title: copy.head.title,
        ...copy.hero,
      });
      expect(copy.head.description).toBe("");
      expect(page.head).not.toMatch(META_DESCRIPTION);
    },
  );

  it("the detail routes are §3a's, in its order; each name is its page's heading and title stem, with the page's back link", () => {
    const architecture = read("docs/TECH-ARCHITECTURE.md").split("\n");
    /** The slugs §3a's row for the route pattern lists, in its order. */
    const slugsOf = (pattern: string) => {
      const row = architecture.find((line) =>
        line.startsWith("| `" + pattern + "` |"),
      );
      expect(row, `§3a has a ${pattern} row`).toBeDefined();
      return [...row!.split(" | ")[1]!.matchAll(/`([a-z0-9-]+)`/g)].map(
        (m) => m[1],
      );
    };
    expect(COLLECTION_ROUTES.map(({ slug }) => slug)).toEqual(
      slugsOf("/collections/[slug]"),
    );
    expect(STYLE_ROUTES.map(({ slug }) => slug)).toEqual(
      slugsOf("/art-styles/[slug]"),
    );
    expect([COLLECTION_ROUTES.length, STYLE_ROUTES.length]).toEqual([3, 11]);

    const families: ReadonlyArray<{
      folder: string;
      routes: readonly { slug: string; name: string }[];
      page: (slug: string) => Page;
      back: { label: string; href: string };
    }> = [
      {
        folder: "pages/collections",
        routes: COLLECTION_ROUTES,
        page: collectionPage,
        back: BROWSE_DETAIL.collectionsBack,
      },
      {
        folder: "pages/art-styles",
        routes: STYLE_ROUTES,
        page: stylePage,
        back: BROWSE_DETAIL.stylesBack,
      },
    ];
    for (const family of families) {
      // The prototype has exactly these detail pages.
      expect(
        readdirSync(path.join(ROOT, "prototype", family.folder), {
          withFileTypes: true,
        })
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name)
          .sort(),
      ).toEqual(family.routes.map(({ slug }) => slug).sort());
      for (const route of family.routes) {
        const page = family.page(route.slug);
        const [title] = groups(page.head, TITLE, `${page.file}: a title`);
        // The arrow is the link's decoration only: aria-hidden, before the label.
        const [backHref, backLabel, heading] = groups(
          page.main,
          /<a class="back-link" href="([^"]*)"><span aria-hidden="true">←<\/span> ([^<]*)<\/a>(?:<div class="browse-detail-text">)?<h1>([^<]*)<\/h1>/,
          `${page.file}: the back link and the heading`,
        );
        expect(
          {
            title,
            stem: title.replace(/ \| Aalishaan Studio$/, ""),
            heading,
            back: { label: backLabel, href: resolveFrom(page, backHref) },
          },
          page.file,
        ).toEqual({
          title: BROWSE_DETAIL.title(route.name),
          stem: route.name,
          heading: route.name,
          back: {
            label: family.back.label,
            href: prototypeHref(family.back.href),
          },
        });
        expect(page.head).not.toMatch(META_DESCRIPTION);
      }
    }
  });

  it("the hubs' cards: the section names, and each card's link name, alt, heading and action are the hubs'", () => {
    const collections = browsePage(prototypeHref("/collections"));
    const styles = browsePage(prototypeHref("/art-styles"));
    expect(
      groups(
        collections.main,
        /<section class="container collection-grid" aria-label="([^"]*)">/,
        "the collection grid",
      ),
    ).toEqual([COLLECTIONS_PAGE.sectionLabel]);
    expect(
      groups(
        styles.main,
        /<section class="container browse-stories" aria-label="([^"]*)">/,
        "the style stories",
      ),
    ).toEqual([ART_STYLES_PAGE.sectionLabel]);
    // Card by card, in the routes' order (the images are the next test's). The link names are the build's, article
    // and all: "Open the " + "The Age of Sail" + " collection" is the approved wording.
    expect(hubCards(collections, "collection-card")).toMatchObject(
      COLLECTION_ROUTES.map(({ slug, name }) => ({
        href: prototypeHref(`/collections/${slug}`),
        open: COLLECTIONS_PAGE.open(name),
        alt: COLLECTIONS_PAGE.coverAlt(name),
        name,
        actionHref: prototypeHref(`/collections/${slug}`),
        action: COLLECTIONS_PAGE.action,
      })),
    );
    expect(hubCards(styles, "browse-story")).toMatchObject(
      STYLE_ROUTES.map(({ slug, name }) => ({
        href: prototypeHref(`/art-styles/${slug}`),
        open: ART_STYLES_PAGE.open(name),
        alt: name,
        name,
        actionHref: prototypeHref(`/art-styles/${slug}`),
        action: ART_STYLES_PAGE.action,
      })),
    );
  });

  it("the covers: a collection's site image is its page's cover file; a style's picture is the hub's close-up of one of its artworks", () => {
    const collections = hubCards(
      browsePage(prototypeHref("/collections")),
      "collection-card",
    );
    for (const [i, route] of COLLECTION_ROUTES.entries()) {
      const card = collections[i]!;
      const files = [card.image, ...card.srcSet.map(({ file }) => file)];
      for (const file of files)
        expect(file).toMatch(
          new RegExp(
            `^assets/web-artworks/${route.slug}-cover-[0-9a-f]+-(480|1200)[.]webp$`,
          ),
        );
      expect(card.srcSet.map(({ width }) => width)).toEqual(["480w", "1200w"]);
      expect(files.map(deliveredFrom), route.slug).toEqual([
        [{ name: route.cover, size: "1200" }],
        [{ name: route.cover, size: "480" }],
        [{ name: route.cover, size: "1200" }],
      ]);
      // The collection page's hero shows the same cover, with the same alt.
      const page = collectionPage(route.slug);
      const [src, srcSet, alt] = groups(
        page.main,
        /<img src="([^"]*)" srcset="([^"]*)"[^>]* alt="([^"]*)" width="700" height="700" fetchpriority="high">/,
        `${page.file}: the cover`,
      );
      expect({
        files: [src, ...srcSet.split(", ").map((c) => c.split(" ")[0]!)].map(
          (href) => resolveFrom(page, href),
        ),
        alt,
      }).toEqual({ files, alt: COLLECTIONS_PAGE.coverAlt(route.name) });
    }

    const styles = hubCards(
      browsePage(prototypeHref("/art-styles")),
      "browse-story",
    );
    for (const [i, route] of STYLE_ROUTES.entries()) {
      const [artwork, finish] = groups(
        styles[i]!.image,
        /^assets\/web-artworks\/(.+)-close-(white|black|antique-gold)-[0-9a-f]+-1200\.webp$/,
        `the ${route.slug} picture`,
      );
      expect({ artwork, finish }, route.slug).toEqual(route.cover);
      // One of the style's own artworks, in the frame its card shows (the style's suggested frame).
      const card = cardsOf(stylePage(route.slug)).find(
        ({ slug }) => slug === artwork,
      );
      expect(card, `${route.slug} shows ${artwork}`).toBeDefined();
      expect(card!.html).toContain(`/${artwork}-frame-${finish}-`);
    }
  });

  it("the supplied-image heroes: Shop All's and each hub's own picture, and the Art Styles picture on every style page", () => {
    /** The head <style>'s background URLs (build-browse.cjs:55), as prototype paths. */
    const heroFiles = (page: Page) =>
      [...page.head.matchAll(/url\('([^']*)'\)/g)].map((m) =>
        resolveFrom(page, m[1]!),
      );
    const cases: ReadonlyArray<readonly [Page, string]> = [
      [browsePage(prototypeHref("/shop")), BROWSE_HERO_IMAGES.shop],
      [
        browsePage(prototypeHref("/collections")),
        BROWSE_HERO_IMAGES.collections,
      ],
      [browsePage(prototypeHref("/art-styles")), BROWSE_HERO_IMAGES.styles],
      ...STYLE_ROUTES.map(
        ({ slug }) => [stylePage(slug), BROWSE_HERO_IMAGES.styles] as const,
      ),
    ];
    for (const [page, key] of cases) {
      const files = heroFiles(page);
      expect(
        files.map((file) => path.posix.basename(file)),
        page.file,
      ).toEqual([`${key}-1600.webp`, `${key}-600.webp`]);
      expect(files.map(deliveredFrom), page.file).toEqual([
        [{ name: key, size: "1600" }],
        [{ name: key, size: "600" }],
      ]);
    }
    // A collection page has no picture band: its hero is the cover beside the copy.
    for (const { slug } of COLLECTION_ROUTES)
      expect(heroFiles(collectionPage(slug)), slug).toEqual([]);
  });

  it("the listing's static copy is Shop All's, and every detail page carries the same (build-browse.cjs:70)", () => {
    /** The listing's copy as a page carries it. */
    const listingCopy = (page: Page) => {
      const at = page.main.indexOf(
        '<section class="container catalogue" id="artworks">',
      );
      expect(at, `${page.file} has the listing`).toBeGreaterThan(-1);
      const html = page.main.slice(at);
      const what = (part: string) => `${page.file}: ${part}`;
      const [label, count] = groups(
        html,
        /<span data-catalogue-label>([^<]*)<\/span> <span id="artwork-count" role="status" aria-live="polite">([^<]*)<\/span>/,
        what("the heading"),
      );
      const [noteHref, noteLink, noteText] = groups(
        html,
        /<p class="saved-view-note" data-saved-note hidden><a href="([^"]*)">([^<]*)<\/a>([^<]*)<\/p>/,
        what("the saved view's note"),
      );
      const [summary, summaryMark] = groups(
        html,
        /<summary>([^<]*) <span aria-hidden="true">([^<]*)<\/span><\/summary>/,
        what("the filters' summary"),
      );
      const [searchLabel, placeholder] = groups(
        html,
        /<label class="search-field">([^<]*)<input type="search" name="q" placeholder="([^"]*)"/,
        what("the search field"),
      );
      const [clear] = groups(
        html,
        /<button type="reset" class="filter-clear">([^<]*)<\/button>/,
        what("the reset button"),
      );
      const [chips] = groups(
        html,
        /<div class="active-filters" aria-label="([^"]*)"><\/div>/,
        what("the active filters"),
      );
      const [emptyHeading, emptyBody, emptyAction] = groups(
        html,
        /<div class="empty-results" hidden><h3>([^<]*)<\/h3><p>([^<]*)<\/p><button class="button button--secondary" data-reset-filters>([^<]*)<\/button><\/div>/,
        what("the empty state"),
      );
      return {
        label,
        count,
        savedNote: {
          link: noteLink,
          href: resolveFrom(page, noteHref),
          text: noteText,
        },
        summary,
        summaryMark,
        search: { label: searchLabel, placeholder },
        selects: [
          ...html.matchAll(
            /<label>([^<]*)<select name="([^"]*)"><option value="">([^<]*)<\/option>/g,
          ),
        ].map((m) => ({ key: m[2], label: m[1], all: m[3] })),
        clear,
        chips,
        empty: { heading: emptyHeading, body: emptyBody, action: emptyAction },
      };
    };
    const expected = (cards: number) => ({
      label: LISTING.label,
      count: LISTING.count(cards),
      // Always Shop All's whole list, even from a detail page.
      savedNote: {
        ...LISTING.savedNote,
        href: prototypeHref(LISTING.savedNote.href),
      },
      summary: LISTING.filters.summary,
      summaryMark: LISTING.filters.summaryMark,
      search: LISTING.filters.search,
      selects: Object.entries(LISTING.filters.selects).map(
        ([key, { label, all }]) => ({ key, label, all }),
      ),
      clear: LISTING.filters.clear,
      chips: LISTING.chips.label,
      empty: {
        heading: LISTING.empty.heading,
        body: LISTING.empty.body,
        action: LISTING.empty.action,
      },
    });
    const pages = listingPages();
    expect(pages).toHaveLength(15);
    for (const page of pages)
      expect(listingCopy(page), page.file).toEqual(
        expected(cardsOf(page).length),
      );
    expect(LISTING.savedNote.href).toMatch(/^\/shop#artworks$/);
    expect(LISTING.filters.summaryMark).toBe(String.fromCharCode(0xff0b));
    expect(Object.keys(LISTING.filters.selects)).toEqual([...SELECT_KEYS]);
  });

  it("the listing's runtime strings are prototype/shared/browse.js's own literals (rule 7)", () => {
    const js = read("prototype/shared/browse.js");
    const [one, many] = groups(
      js,
      /#artwork-count'\)\.textContent=`\$\{count\} artwork\$\{count===1\?'([^']*)':'([^']*)'\}`/,
      "the count",
    );
    for (const n of [0, 1, 2, 22])
      expect(LISTING.count(n)).toBe(`${n} artwork${n === 1 ? one : many}`);
    expect([LISTING.count(1), LISTING.count(0), LISTING.count(22)]).toEqual([
      "1 artwork",
      "0 artworks",
      "22 artworks",
    ]);
    const [savedLabel, label] = groups(
      js,
      /\[data-catalogue-label\]'\)\.textContent=savedOnly\?'([^']*)':'([^']*)'/,
      "the heading's label",
    );
    const [savedHeading, heading] = groups(
      js,
      /querySelector\('h3'\)\.textContent=savedOnly\?'([^']*)':'([^']*)'/,
      "the empty state's heading",
    );
    const [savedBody, body] = groups(
      js,
      /querySelector\('p'\)\.textContent=savedOnly\?'([^']*)':'([^']*)'/,
      "the empty state's line",
    );
    expect({
      savedLabel,
      label,
      savedHeading,
      heading,
      savedBody,
      body,
    }).toEqual({
      savedLabel: LISTING.savedLabel,
      label: LISTING.label,
      savedHeading: LISTING.empty.savedHeading,
      heading: LISTING.empty.heading,
      savedBody: LISTING.empty.savedBody,
      body: LISTING.empty.body,
    });
    // A chip: the value, then the multiplication sign; its name says which filter it removes.
    const [after] = groups(js, /b\.textContent=v\+'([^']*)'/, "the chip");
    const [before, end] = groups(
      js,
      /b\.setAttribute\('aria-label','([^']*)'\+v\+'([^']*)'\)/,
      "the chip's name",
    );
    for (const value of ["Bedroom", "Study & Office"]) {
      expect(LISTING.chips.text(value)).toBe(`${value}${after}`);
      expect(LISTING.chips.remove(value)).toBe(`${before}${value}${end}`);
    }
    expect(LISTING.chips.text("Bedroom")).toBe(
      `Bedroom ${String.fromCharCode(0xd7)}`,
    );
  });

  it("every card's words, link name, alt and price line are ART_CARD's (build-browse.cjs:61) — and its words are Home's", () => {
    expect({ label: ART_CARD.label, view: ART_CARD.view }).toEqual({
      label: FEATURED.label,
      view: FEATURED.view,
    });
    // The 22 artworks: on Shop All, then each once on its collection's page and once on its style's (two each, §3a).
    const shop = cardsOf(browsePage(prototypeHref("/shop"))).map(
      ({ slug }) => slug,
    );
    expect(new Set(shop).size).toBe(22);
    expect(shop).toHaveLength(22);
    expect(
      COLLECTION_ROUTES.flatMap(({ slug }) =>
        cardsOf(collectionPage(slug)).map((card) => card.slug),
      ).sort(),
    ).toEqual([...shop].sort());
    expect(
      STYLE_ROUTES.map(({ slug }) => cardsOf(stylePage(slug)).length),
    ).toEqual(STYLE_ROUTES.map(() => 2));
    expect(
      STYLE_ROUTES.flatMap(({ slug }) =>
        cardsOf(stylePage(slug)).map((card) => card.slug),
      ).sort(),
    ).toEqual([...shop].sort());

    let cards = 0;
    for (const page of listingPages())
      for (const card of cardsOf(page)) {
        const what = (part: string) => `${page.file} ${card.slug}: ${part}`;
        const [viewLabel, src, alt] = groups(
          card.html,
          /<a class="art-card__main" href="[^"]*" aria-label="([^"]*)"><img src="([^"]*)"[^>]* alt="([^"]*)"/,
          what("the image link"),
        );
        const [label] = groups(
          card.html,
          /<p class="art-card__label">([^<]*)<\/p>/,
          what("the label"),
        );
        const [title] = groups(
          card.html,
          /<h3><a href="[^"]*">([^<]*)<\/a><\/h3>/,
          what("the title"),
        );
        const [frame, amount] = groups(
          card.html,
          /<p class="art-card__price"><span>([^<]*)<\/span>([^<]*)<\/p>/,
          what("the price"),
        );
        const [view] = groups(
          card.html,
          /<a class="art-card__view" href="[^"]*">([^<]*) <span aria-hidden="true">→<\/span><\/a>/,
          what("the view link"),
        );
        // The card shows the artwork in its suggested frame; the image's file name says which.
        const finish = groups(
          path.posix.basename(src),
          new RegExp(
            `^${card.slug}-frame-(white|black|antique-gold)-[0-9a-f]+-1200[.]webp$`,
          ),
          what("the frame image"),
        )[0] as FinishCode;
        expect(
          { label, view, viewLabel, alt, frame, amount },
          what("the card"),
        ).toEqual({
          label: ART_CARD.label,
          view: ART_CARD.view,
          viewLabel: ART_CARD.viewLabel(title),
          alt: ART_CARD.alt(title, finish),
          frame: ART_CARD.frame(FINISH_NAMES[finish]),
          amount: formatRupees(BigInt(FINISHES[finish].pricePaise)),
        });
        cards += 1;
      }
    expect(cards).toBe(66);
  });

  it("NS-26–NS-29 — the honest states the prototype has no copy for are plain strings with no prototype demo wording", () => {
    // New strings (D-24 technical states, proposed at S1.4): their wording and approval are tracked in
    // docs/content/new-strings.md.
    const strings = [
      CATALOGUE_STATES.unavailable.heading, // NS-26
      CATALOGUE_STATES.unavailable.body,
      CATALOGUE_STATES.empty.heading, // NS-27
      CATALOGUE_STATES.empty.body,
      SAVED_VIEW.unavailable.heading, // NS-28
      SAVED_VIEW.unavailable.body,
      CATALOGUE_STATES.notAvailable, // NS-29
    ];
    const prototype = [
      ...listingPages(),
      browsePage(prototypeHref("/collections")),
      browsePage(prototypeHref("/art-styles")),
    ]
      .map((page) => page.html)
      .concat(read("prototype/shared/browse.js"))
      .join("\n");
    for (const line of strings) {
      expect(typeof line).toBe("string");
      expect(line.length, line).toBeGreaterThan(0);
      expect(line.trim(), line).toBe(line);
      // Plain text: no markup, entity, placeholder or template.
      expect(line).not.toMatch(/[<>{}$`]|&[#a-z0-9]+;/i);
      expect(line).not.toMatch(/sample|preview|demo/i);
      // Not ported copy: none of the browse pages, nor their script, says it.
      expect(prototype).not.toContain(line);
    }
  });
});
