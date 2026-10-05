import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  PUBLIC_CATALOGUE_COLUMNS,
  publicCatalogueSchema,
} from "../../src/lib/schemas/catalogue";
import { buildSeedPlan } from "../../scripts/testing/lib/catalogue.mjs";
import { resolveTestTarget } from "../../scripts/testing/lib/supabase-target.mjs";

/**
 * 0001_catalogue on the real TEST project, after the apply and `pnpm db:test:seed --apply`
 * (docs/database-changes/S1.1-0001-catalogue.md → Verification 5; ENVIRONMENT-PARITY.md §12 P8b):
 * the public projection exposes exactly the allow-listed columns over the 22 Active artworks and parses
 * with the Zod mirror at exact paise; the base tables and every write are denied to the publishable key
 * with privileged post-checks that nothing changed; a Hidden artwork leaves the projection and returns.
 * The suite never skips: a missing table or seed fails with a plain message.
 */

const NO_SESSION = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};

let privileged: SupabaseClient;
let anon: SupabaseClient;
const plan = buildSeedPlan();
const PROBE_SLUG = plan.artworks[plan.artworks.length - 1].slug;

async function privilegedArtwork(slug: string) {
  const { data, error } = await privileged
    .from("artworks")
    .select("id,slug,status,title,published_at")
    .eq("slug", slug)
    .limit(1);
  expect(error).toBeNull();
  return (
    (
      data as Array<{
        id: string;
        slug: string;
        status: string;
        title: string;
        published_at: string;
      }> | null
    )?.[0] ?? null
  );
}

function denied(
  result: { error: { code?: string } | null; status: number; data: unknown },
  label: string,
) {
  if (result.error) {
    expect([401, 403], `${label}: HTTP status`).toContain(result.status);
    expect(result.error.code, `${label}: Postgres code`).toBe("42501");
  } else {
    // Zero affected rows is the only other acceptable shape; the privileged post-check is the assertion.
    expect(result.data ?? [], `${label}: no row returned`).toEqual([]);
  }
}

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
  const present = await privileged
    .from("artworks")
    .select("id", { count: "exact", head: true });
  if (present.error)
    throw new Error(
      `0001_catalogue is not applied on TEST (artworks: ${present.error.code}) — apply it and run pnpm db:test:seed --apply first`,
    );
  if ((present.count ?? 0) !== 22)
    throw new Error(
      `artworks holds ${present.count ?? 0} rows, expected the 22 seeded — run pnpm db:test:seed --apply`,
    );
});

afterAll(async () => {
  // Restore the probe artwork whatever happened mid-test.
  const restore = await privileged
    .from("artworks")
    .update({ status: "Active" })
    .eq("slug", PROBE_SLUG)
    .select("slug");
  expect(restore.error).toBeNull();
});

describe("public_catalogue through the publishable key", () => {
  it("returns exactly the 22 Active artworks with exactly the allow-listed columns, parsing at exact paise", async () => {
    const { data, error, status } = await anon
      .from("public_catalogue")
      .select("*")
      .order("slug");
    expect(error).toBeNull();
    expect(status).toBe(200);
    const rows = data as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(22);
    for (const row of rows)
      expect(Object.keys(row).sort()).toEqual(
        [...PUBLIC_CATALOGUE_COLUMNS].sort(),
      );
    const parsed = publicCatalogueSchema.parse(rows);
    expect(parsed.map((r) => r.slug).sort()).toEqual(
      plan.artworks.map((a) => a.slug).sort(),
    );
    for (const r of parsed) {
      expect(r.variants.map((v) => v.finish)).toEqual([
        "white",
        "black",
        "antique-gold",
      ]);
      expect(r.variants.map((v) => v.price_paise)).toEqual([
        BigInt(1900000),
        BigInt(2100000),
        BigInt(2300000),
      ]);
      expect(r.images).toHaveLength(15);
      expect(r.lead_time).toBeNull();
      const planned = plan.artworks.find((a) => a.slug === r.slug);
      expect(r.seo_title).toBe(planned?.seo_title);
      expect(r.description).toBe(planned?.description);
    }
  });

  it("leaks nothing private: no id, status, source row or timestamps other than published_at — and a column request for one is refused", async () => {
    for (const column of [
      "id",
      "status",
      "source_row",
      "created_at",
      "updated_at",
      "collection_id",
    ]) {
      const { error } = await anon
        .from("public_catalogue")
        .select(column)
        .limit(1);
      expect(error, column).not.toBeNull();
    }
  });

  it("is read-only for the publishable key: inserting into the view is refused", async () => {
    const insert = await anon
      .from("public_catalogue")
      .insert({ slug: "zz-probe" });
    expect(insert.error).not.toBeNull();
    expect(await privilegedArtwork("zz-probe")).toBeNull();
  });
});

describe("the base tables are private", () => {
  it.each([
    "collections",
    "art_styles",
    "frame_finishes",
    "artworks",
    "artwork_images",
    "variants",
  ])("anonymous SELECT on %s is denied", async (table) => {
    const result = await anon.from(table).select("*").limit(1);
    denied(result, `select ${table}`);
  });

  it("anonymous insert, update and delete on artworks change nothing (privileged post-checks)", async () => {
    const before = await privilegedArtwork(PROBE_SLUG);
    expect(before).not.toBeNull();
    const insert = await anon
      .from("artworks")
      .insert({ slug: "zz-anon-probe", title: "x" })
      .select("slug");
    denied(insert, "insert artworks");
    expect(await privilegedArtwork("zz-anon-probe")).toBeNull();
    const update = await anon
      .from("artworks")
      .update({ title: "tampered" })
      .eq("slug", PROBE_SLUG)
      .select("slug");
    denied(update, "update artworks");
    expect((await privilegedArtwork(PROBE_SLUG))?.title).toBe(before?.title);
    const remove = await anon
      .from("artworks")
      .delete()
      .eq("slug", PROBE_SLUG)
      .select("slug");
    denied(remove, "delete artworks");
    expect(await privilegedArtwork(PROBE_SLUG)).not.toBeNull();
    const price = await anon
      .from("variants")
      .update({ price_paise: 1 })
      .eq("variant_code", `${PROBE_SLUG}:white`)
      .select("variant_code");
    denied(price, "update variants");
    const check = await privileged
      .from("variants")
      .select("price_paise")
      .eq("variant_code", `${PROBE_SLUG}:white`)
      .single();
    expect(check.error).toBeNull();
    expect(
      Number((check.data as { price_paise: number | string }).price_paise),
    ).toBe(1900000);
  });
});

describe("status drives the projection", () => {
  it("a Hidden artwork disappears from public_catalogue and returns when Active again", async () => {
    const hide = await privileged
      .from("artworks")
      .update({ status: "Hidden" })
      .eq("slug", PROBE_SLUG)
      .select("slug,status");
    expect(hide.error).toBeNull();
    expect(hide.data).toHaveLength(1);
    const hidden = await anon.from("public_catalogue").select("slug");
    expect(hidden.error).toBeNull();
    expect(
      (hidden.data as Array<{ slug: string }>).map((r) => r.slug),
    ).not.toContain(PROBE_SLUG);
    expect(hidden.data).toHaveLength(21);
    const restore = await privileged
      .from("artworks")
      .update({ status: "Active" })
      .eq("slug", PROBE_SLUG)
      .select("slug");
    expect(restore.error).toBeNull();
    const back = await anon
      .from("public_catalogue")
      .select("slug")
      .eq("slug", PROBE_SLUG);
    expect(back.error).toBeNull();
    expect(back.data).toHaveLength(1);
  });

  it("the variant-code contract is enforced by the database for the privileged role too", async () => {
    const artwork = await privilegedArtwork(PROBE_SLUG);
    const wrong = await privileged.from("variants").insert({
      artwork_id: artwork?.id,
      finish_code: "white",
      variant_code: "not-the-slug:white",
      price_paise: 1900000,
    });
    expect(wrong.error?.code).toBe("23514");
    const negative = await privileged
      .from("variants")
      .update({ price_paise: -1 })
      .eq("variant_code", `${PROBE_SLUG}:black`)
      .select("variant_code");
    expect(negative.error?.code).toBe("23514");
  });
});
