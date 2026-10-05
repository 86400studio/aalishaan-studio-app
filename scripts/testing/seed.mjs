#!/usr/bin/env node
// @ts-check
/**
 * `pnpm db:test:seed` — the TEST seed (D-22; extended by S1.1 from the S0.2 skeleton).
 *
 * What it writes, under the owner's scoped TEST fixture authorisation and only after a fresh preflight
 * (target, both keys, auth health, the 0000_init baseline, the 0001/0002 tables present): the one synthetic
 * `system_checks` row `fixture:baseline`, and the deterministic S1.1 catalogue plan built from the approved
 * prototype sources by ./lib/catalogue.mjs — 3 collections, 11 art styles, 3 frame finishes, 22 Active
 * artworks, 330 enumerated image rows, 66 variants at exact paise, the 7 pending-terms policy versions and
 * the initial business-rules version (closed, prelaunch, synthetic, 60-minute expiry).
 *
 * Idempotent and conservative: rows are matched on their natural keys (slug, code, variant_code,
 * object_path, (policy_key, version), version), so a second run preserves ids; a missing row is inserted; an
 * identical row is left alone; a row that differs from the plan is REPORTED and skipped — a staff edit on
 * TEST is never overwritten blindly. `--overwrite` applies the plan over differing catalogue rows, except a
 * variant that an order item references (reported, kept). Policy versions and business rules are
 * append-only: a differing version is reported and never rewritten (a change is a new version).
 *
 * Dry run by default (the plan and the differences are printed, nothing written); `--apply` writes. PROD,
 * an unknown target, missing credentials or mismatched refs are refused before any request, with names only.
 */
import { createClient } from "@supabase/supabase-js";

import { buildSeedPlan } from "./lib/catalogue.mjs";
import { loadLocalEnv } from "./lib/env.mjs";
import { BASELINE_FIXTURE, seedBaselineFixture } from "./lib/fixtures.mjs";
import {
  probeIdentity,
  probeProblems,
  resolveTestTarget,
} from "./lib/supabase-target.mjs";

const apply = process.argv.includes("--apply");
const overwrite = process.argv.includes("--overwrite");
const TIMEOUT_MS = 15_000;

/** @param {unknown} value */
function stable(value) {
  return JSON.stringify(value, (_, v) =>
    typeof v === "bigint" ? v.toString(10) : v,
  );
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} client
 * @param {string} table
 */
async function tablePresent(client, table) {
  const { error } = await client
    .from(table)
    .select("*", { count: "exact", head: true })
    .abortSignal(AbortSignal.timeout(TIMEOUT_MS));
  if (!error) return true;
  // PostgREST answers PGRST205 / 42P01 when the relation does not exist.
  if (error.code === "PGRST205" || error.code === "42P01") return false;
  throw new Error(`${table}: ${error.code ?? "unknown error"}`);
}

/**
 * Upsert-by-natural-key with the compare-before-write rule.
 * @param {import("@supabase/supabase-js").SupabaseClient} client
 * @param {{ table: string, key: string, rows: Array<Record<string, unknown>>, compare: string[], immutable?: boolean, referenced?: (row: Record<string, unknown>) => Promise<boolean> }} spec
 * @returns {Promise<{ inserted: number, unchanged: number, differs: string[], updated: number, kept: string[] }>}
 */
async function reconcile(client, spec) {
  const keys = spec.rows.map((r) => r[spec.key]);
  const { data, error } = await client
    .from(spec.table)
    .select("*")
    .in(spec.key, keys)
    .abortSignal(AbortSignal.timeout(TIMEOUT_MS));
  if (error) throw new Error(`${spec.table} read: ${error.code ?? "unknown"}`);
  const existing = new Map(
    /** @type {Array<Record<string, unknown>>} */ (data ?? []).map((r) => [
      String(r[spec.key]),
      r,
    ]),
  );
  /** @type {{ inserted: number, unchanged: number, differs: string[], updated: number, kept: string[] }} */
  const result = {
    inserted: 0,
    unchanged: 0,
    differs: [],
    updated: 0,
    kept: [],
  };
  /** @type {Array<Record<string, unknown>>} */
  const toInsert = [];
  /** @type {Array<Record<string, unknown>>} */
  const toUpdate = [];
  for (const row of spec.rows) {
    const current = existing.get(String(row[spec.key]));
    if (!current) {
      toInsert.push(row);
      continue;
    }
    const same = spec.compare.every(
      (column) => stable(current[column]) === stable(row[column]),
    );
    if (same) {
      result.unchanged += 1;
      continue;
    }
    result.differs.push(String(row[spec.key]));
    if (overwrite && !spec.immutable) {
      if (spec.referenced && (await spec.referenced(row))) {
        result.kept.push(String(row[spec.key]));
        continue;
      }
      toUpdate.push(row);
    }
  }
  if (!apply) {
    result.inserted = toInsert.length;
    return result;
  }
  for (let i = 0; i < toInsert.length; i += 100) {
    const chunk = toInsert.slice(i, i + 100);
    const ins = await client
      .from(spec.table)
      .insert(chunk)
      .select(spec.key)
      .abortSignal(AbortSignal.timeout(TIMEOUT_MS));
    if (ins.error)
      throw new Error(`${spec.table} insert: ${ins.error.code ?? "unknown"}`);
    result.inserted += (ins.data ?? []).length;
  }
  for (const row of toUpdate) {
    const patch = Object.fromEntries(
      spec.compare.map((column) => [column, row[column]]),
    );
    const upd = await client
      .from(spec.table)
      .update(patch)
      .eq(spec.key, row[spec.key])
      .select(spec.key)
      .abortSignal(AbortSignal.timeout(TIMEOUT_MS));
    if (upd.error)
      throw new Error(`${spec.table} update: ${upd.error.code ?? "unknown"}`);
    result.updated += (upd.data ?? []).length;
  }
  return result;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} client
 * @param {string} table
 * @param {string} key
 * @param {unknown[]} values
 * @returns {Promise<Map<string, string>>} natural key → id
 */
async function idsByKey(client, table, key, values) {
  const { data, error } = await client
    .from(table)
    .select("*")
    .in(key, values)
    .abortSignal(AbortSignal.timeout(TIMEOUT_MS));
  if (error) throw new Error(`${table} ids: ${error.code ?? "unknown"}`);
  return new Map(
    /** @type {Array<Record<string, string>>} */ (data ?? []).map((r) => [
      r[key],
      r.id,
    ]),
  );
}

/** @param {string} label @param {{ inserted: number, unchanged: number, differs: string[], updated: number, kept: string[] }} r */
function report(label, r) {
  const parts = [
    `${apply ? "inserted" : "would insert"} ${r.inserted}`,
    `unchanged ${r.unchanged}`,
  ];
  if (r.differs.length) parts.push(`differ ${r.differs.length}`);
  if (r.updated) parts.push(`overwritten ${r.updated}`);
  if (r.kept.length) parts.push(`kept (referenced) ${r.kept.length}`);
  console.log(`  ${label}: ${parts.join(" · ")}`);
  if (r.differs.length)
    console.log(
      `    differing keys: ${r.differs.slice(0, 10).join(", ")}${r.differs.length > 10 ? ", …" : ""}${overwrite ? "" : " (kept — re-run with --overwrite to apply the plan over them)"}`,
    );
}

async function main() {
  loadLocalEnv();
  const target = resolveTestTarget(process.env);
  if (!target.ok) {
    console.error("Refused before any request:");
    for (const reason of target.reasons) console.error(`  - ${reason}`);
    process.exitCode = 2;
    return;
  }
  const probe = await probeIdentity(target.target);
  const problems = probeProblems(probe);
  if (problems.length > 0) {
    console.error("Preflight FAILED — nothing written:");
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `TEST project ${target.target.ref} verified (keys accepted, auth healthy, baseline present).`,
  );
  const client = createClient(target.target.url, target.target.secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  for (const table of [
    "collections",
    "artworks",
    "variants",
    "policy_versions",
    "business_rules",
  ]) {
    if (!(await tablePresent(client, table))) {
      console.error(
        `Refused: public.${table} is absent — apply 0001_catalogue and 0002_orders to TEST first (docs/database-changes/S1.1-0001-catalogue.md, S1.1-0002-orders.md).`,
      );
      process.exitCode = 1;
      return;
    }
  }

  const plan = buildSeedPlan();
  console.log(
    `Seed plan (fingerprint ${plan.fingerprint.slice(0, 16)}): ${plan.collections.length} collections, ${plan.art_styles.length} art styles, ${plan.frame_finishes.length} finishes, ${plan.artworks.length} artworks, ${plan.images.length} image rows, ${plan.variants.length} variants, ${plan.policy_versions.length} policy versions, business_rules version ${plan.business_rules.version}; plus system_checks ${BASELINE_FIXTURE.check_key}.`,
  );
  console.log(
    apply
      ? `Applying${overwrite ? " with --overwrite" : ""}…`
      : "Dry run — comparing the plan with TEST, writing nothing.",
  );

  // 1. finishes, collections, styles
  report(
    "frame_finishes",
    await reconcile(client, {
      table: "frame_finishes",
      key: "code",
      rows: plan.frame_finishes,
      compare: ["name", "sort_order"],
    }),
  );
  report(
    "collections",
    await reconcile(client, {
      table: "collections",
      key: "slug",
      rows: plan.collections,
      compare: ["name", "intro", "sort_order"],
    }),
  );
  const collectionIds = apply
    ? await idsByKey(
        client,
        "collections",
        "slug",
        plan.collections.map((c) => c.slug),
      )
    : new Map();
  report(
    "art_styles",
    await reconcile(client, {
      table: "art_styles",
      key: "slug",
      rows: plan.art_styles.map(({ collection_slug, ...s }) => ({
        ...s,
        collection_id: collectionIds.get(collection_slug) ?? null,
      })),
      compare: ["name", "full_name", "intro", "sort_order"],
    }),
  );
  const styleIds = apply
    ? await idsByKey(
        client,
        "art_styles",
        "slug",
        plan.art_styles.map((s) => s.slug),
      )
    : new Map();

  // 2. artworks (status and published_at are seed-managed on insert only: a later staff change is a difference, never overwritten without --overwrite)
  const now = new Date().toISOString();
  const artworkCompare = [
    "title",
    "full_title",
    "hook",
    "description",
    "orientation",
    "rooms",
    "moods",
    "palettes",
    "palette_hues",
    "suggested_frame",
    "featured",
    "lead_time",
    "seo_title",
    "seo_description",
    "default_alt",
    "image_alt_text",
    "status",
    "source_row",
  ];
  report(
    "artworks",
    await reconcile(client, {
      table: "artworks",
      key: "slug",
      rows: plan.artworks.map(({ collection_slug, style_slug, ...a }) => ({
        ...a,
        collection_id: collectionIds.get(collection_slug) ?? null,
        art_style_id: styleIds.get(style_slug) ?? null,
        published_at: now,
      })),
      compare: artworkCompare,
    }),
  );
  const artworkIds = apply
    ? await idsByKey(
        client,
        "artworks",
        "slug",
        plan.artworks.map((a) => a.slug),
      )
    : new Map();

  // 3. images and variants
  report(
    "artwork_images",
    await reconcile(client, {
      table: "artwork_images",
      key: "object_path",
      rows: plan.images.map((i) => ({
        artwork_id: artworkIds.get(i.slug) ?? null,
        slot: i.slot,
        size_label: i.size,
        object_path: i.object_path,
        source_path: i.source_path,
        source_sha256: i.sha256,
        sort_order: 0,
      })),
      compare: ["slot", "size_label", "source_path", "source_sha256"],
    }),
  );
  report(
    "variants",
    await reconcile(client, {
      table: "variants",
      key: "variant_code",
      rows: plan.variants.map((v) => ({
        artwork_id: artworkIds.get(v.slug) ?? null,
        finish_code: v.finish_code,
        variant_code: v.variant_code,
        price_paise: Number(v.price_paise),
        currency: v.currency,
        availability: v.availability,
        lead_time: v.lead_time,
      })),
      compare: [
        "finish_code",
        "price_paise",
        "currency",
        "availability",
        "lead_time",
      ],
      referenced: async (row) => {
        const { count, error } = await client
          .from("order_items")
          .select("id", { count: "exact", head: true })
          .eq("variant_code", row.variant_code)
          .abortSignal(AbortSignal.timeout(TIMEOUT_MS));
        if (error)
          throw new Error(`order_items read: ${error.code ?? "unknown"}`);
        return (count ?? 0) > 0;
      },
    }),
  );

  // 4. policy versions and the initial business rules (append-only — never rewritten)
  report(
    "policy_versions",
    await reconcile(client, {
      table: "policy_versions",
      key: "policy_key",
      rows: plan.policy_versions,
      compare: [
        "version",
        "title",
        "intro",
        "body",
        "terms_status",
        "source",
        "effective_from",
      ],
      immutable: true,
    }),
  );
  report(
    "business_rules",
    await reconcile(client, {
      table: "business_rules",
      key: "version",
      rows: [{ ...plan.business_rules }],
      compare: [
        "effective_from",
        "approver_name",
        "approver_staff_id",
        "synthetic",
        "sales_open",
        "sales_open_reason",
        "pending_order_expiry_minutes",
        "shipping_paise",
        "tax_treatment",
        "note",
      ],
      immutable: true,
    }),
  );

  // 5. the S0.2 skeleton row (unchanged behaviour)
  if (apply) {
    const baseline = await seedBaselineFixture(client);
    if (!baseline.ok) {
      console.error(
        `system_checks seed FAILED (code ${baseline.code ?? "unknown"}).`,
      );
      process.exitCode = 1;
      return;
    }
    console.log(
      `  system_checks: ${baseline.count} row present for ${BASELINE_FIXTURE.check_key}.`,
    );
  } else {
    console.log(`  system_checks: would upsert ${BASELINE_FIXTURE.check_key}.`);
    console.log(
      "Dry run complete — re-run with --apply under the owner's TEST fixture authorisation.",
    );
  }
}

main().catch((error) => {
  console.error(
    `Seed error: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
