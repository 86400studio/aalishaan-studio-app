import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { bagOkResponseSchema } from "../../src/lib/schemas/bag";
import {
  FRESH_CATALOGUE_CLIENT_OPTIONS,
  readPublicCatalogueFresh,
  type CatalogueReaderDependencies,
} from "../../src/lib/server/catalogue";
import { handleBagRequest, validateBag } from "../../src/lib/server/bag";
import { createBrowserSupabaseClient } from "../../src/lib/supabase/browser";
import { buildSeedPlan } from "../../scripts/testing/lib/catalogue.mjs";
import { resolveTestTarget } from "../../scripts/testing/lib/supabase-target.mjs";

vi.mock("server-only", () => ({}));

/**
 * Bag validation on the real TEST project — S1.5 (src/lib/server/bag.ts; docs/sprint-prompts/
 * S1.5-artwork-bag-cart.md §H.2 "POST /api/bag and validateBag()"). Read-only: the storefront's fresh read
 * (`readPublicCatalogueFresh` — the publishable key, session-less, identity-checked, uncached) resolves real seeded
 * variant codes to the projection's titles and exact paise, an unknown code is removed and never priced, and the
 * handler answers the same through its HTTP contract. Nothing is written: the privileged client only counts the
 * base tables before and after, to show the validation changed nothing. No status change or fixture is made here;
 * the projection-eligibility probes (Hidden, Draft, In review, Retired) stay in tests/integration/catalogue.test.ts.
 * The suite never skips: a missing seed fails with a plain message.
 */

const NO_SESSION = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};

const plan = buildSeedPlan();
const FIRST = plan.artworks[0].slug;
const LAST = plan.artworks[plan.artworks.length - 1].slug;
const UNKNOWN = "zz-no-such-artwork:white";
const TABLES = ["artworks", "variants", "artwork_images"] as const;

let privileged: SupabaseClient;

/** The fresh reader exactly as the endpoint builds it, with this process's TEST identity (a local process expects TEST). */
function testReader(): {
  deps: CatalogueReaderDependencies;
  reports: string[];
} {
  const target = resolveTestTarget(process.env);
  if (!target.ok) throw new Error(target.reasons.join("; "));
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: target.target.url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: target.target.publishableKey,
    SUPABASE_TEST_PROJECT_REF: target.target.testRef,
    SUPABASE_PROD_PROJECT_REF: target.target.prodRef,
  };
  const reports: string[] = [];
  return {
    reports,
    deps: {
      env: () => env,
      createPublicClient: () =>
        createBrowserSupabaseClient(env, FRESH_CATALOGUE_CLIENT_OPTIONS),
      report: (message) => reports.push(message),
    },
  };
}

async function exactCount(table: string): Promise<number> {
  const { count, error } = await privileged
    .from(table)
    .select("*", { count: "exact", head: true });
  expect(error, `${table}: privileged count`).toBeNull();
  expect(count, `${table}: privileged count`).not.toBeNull();
  return count ?? -1;
}

async function counts(): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const table of TABLES) result[table] = await exactCount(table);
  return result;
}

/** The seeded price of a variant, read with the privileged client (the projection's source of truth). */
async function seededPrice(variantCode: string): Promise<bigint> {
  const { data, error } = await privileged
    .from("variants")
    .select("price_paise")
    .eq("variant_code", variantCode)
    .limit(1);
  expect(error).toBeNull();
  const rows = (data ?? []) as Array<{ price_paise: number | string }>;
  expect(rows, `${variantCode}: seeded`).toHaveLength(1);
  return BigInt(rows[0].price_paise);
}

beforeAll(async () => {
  const target = resolveTestTarget(process.env);
  if (!target.ok) throw new Error(target.reasons.join("; "));
  privileged = createClient(
    target.target.url,
    target.target.secretKey,
    NO_SESSION,
  );
  // A plain GET, never a HEAD: a HEAD answer has no body, so a missing table would read as "no error".
  const present = await privileged.from("artworks").select("slug,status");
  if (present.error)
    throw new Error(
      `0001_catalogue is not applied on TEST (artworks: ${present.error.code ?? `HTTP ${present.status}`}) — apply it and run pnpm db:test:seed --apply first`,
    );
  const rows = (present.data ?? []) as Array<{ slug: string; status: string }>;
  if (rows.length !== 22)
    throw new Error(
      `artworks holds ${rows.length} rows, expected the 22 seeded — run pnpm db:test:seed --apply`,
    );
  for (const slug of [FIRST, LAST])
    if (rows.find((row) => row.slug === slug)?.status !== "Active")
      throw new Error(
        `${slug} is not Active on TEST — restore it (tests/integration/catalogue.test.ts restores its probe) before this suite`,
      );
});

describe("validateBag on TEST's projection (S1.5) — read-only", () => {
  it("the fresh read sees the 22 Active artworks, none left out", async () => {
    const { deps, reports } = testReader();
    const read = await readPublicCatalogueFresh(deps);
    expect(read.status).toBe("ok");
    if (read.status !== "ok") return;
    expect(read.rows).toHaveLength(22);
    expect(read.omitted).toBe(0);
    expect(reports).toEqual([]);
  });

  it("prices real seeded variants from the projection in exact paise, removes an unknown code, and writes nothing", async () => {
    const before = await counts();
    const { deps } = testReader();
    const items = [
      { variant_code: `${FIRST}:white`, quantity: 2 },
      { variant_code: UNKNOWN, quantity: 5 },
      { variant_code: `${LAST}:antique-gold`, quantity: 1 },
    ];
    const result = await validateBag(items, () =>
      readPublicCatalogueFresh(deps),
    );
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.removed).toEqual([
      { variant_code: UNKNOWN, reason: "not_found" },
    ]);
    expect(result.items.map((item) => item.variant_code)).toEqual([
      `${FIRST}:white`,
      `${LAST}:antique-gold`,
    ]);
    const white = await seededPrice(`${FIRST}:white`);
    const gold = await seededPrice(`${LAST}:antique-gold`);
    expect(result.items[0]).toMatchObject({
      slug: FIRST,
      finish: "white",
      finish_name: "White",
      quantity: 2,
      unit_price_paise: white,
      line_total_paise: white * BigInt(2),
    });
    expect(result.items[1]).toMatchObject({
      slug: LAST,
      finish: "antique-gold",
      unit_price_paise: gold,
      line_total_paise: gold,
    });
    const available = result.items.filter((item) => item.available);
    expect(result.subtotal_paise).toBe(
      available.reduce(
        (total, item) => total + item.line_total_paise,
        BigInt(0),
      ),
    );
    expect(result.item_count).toBe(3);
    expect(await counts()).toEqual(before);
  });

  it("answers the HTTP contract on TEST: 200, no-store, a body the browser's schema accepts — and a tampered price is refused before any read", async () => {
    const before = await counts();
    const { deps } = testReader();
    const reports: string[] = [];
    const handlerDeps = {
      read: () => readPublicCatalogueFresh(deps),
      report: (message: string) => reports.push(message),
    };
    const request = (body: unknown) =>
      new Request("https://studio.example.invalid/api/bag", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

    const ok = await handleBagRequest(
      request({ items: [{ variant_code: `${FIRST}:black`, quantity: 3 }] }),
      handlerDeps,
    );
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("no-store");
    const parsed = bagOkResponseSchema.safeParse(await ok.json());
    expect(parsed.success).toBe(true);
    if (parsed.success)
      expect(parsed.data.subtotal_paise).toBe(
        (await seededPrice(`${FIRST}:black`)) * BigInt(3),
      );

    const tampered = await handleBagRequest(
      request({
        items: [
          { variant_code: `${FIRST}:black`, quantity: 3, price_paise: 100 },
        ],
      }),
      handlerDeps,
    );
    expect(tampered.status).toBe(400);
    expect(await tampered.json()).toEqual({ status: "invalid_request" });
    expect(reports).toEqual([]);
    expect(await counts()).toEqual(before);
  });
});
