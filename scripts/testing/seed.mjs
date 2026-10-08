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
 * object_path, policy_key, rule version), so a second run preserves ids; a missing row is inserted; an
 * identical row is left alone; a row that differs from the plan is REPORTED and skipped — a staff edit on
 * TEST is never overwritten blindly. A policy is matched on its key and its version is compared, so this
 * tool manages one version per policy: a second version (the owner's real terms at S3.1) would be reported
 * as a difference, never inserted, and needs its own change here. `--overwrite` applies the plan over differing catalogue rows, except a
 * variant that an order item references (reported, kept). Policy versions and business rules are
 * append-only: a differing version is reported and never rewritten (a change is a new version).
 *
 * Dry run by default (the plan and the differences are printed, nothing written); `--apply` writes. PROD,
 * an unknown target, missing credentials or mismatched refs are refused before any request, with names only.
 */
import { createClient } from "@supabase/supabase-js";

import { buildSeedPlan, canonicalJson, sameInstant } from "./lib/catalogue.mjs";
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
/** Keys per read: the 330 object paths in one `in` filter make a 21,756-character URL, over the platform's 16 KB limit. */
const READ_CHUNK = 100;

/**
 * A refused request by its Postgres / PostgREST code; without one, by its HTTP status. A HEAD count that comes
 * back with no error and no count is named for what it is — the client reports a missing table's empty 404 as
 * a success — and a request that never got an answer is not given a status it does not have.
 * @param {{ code?: string } | null} error
 * @param {number} status
 */
function describe(error, status) {
  if (error?.code) return error.code;
  if (!error) return "no count returned (is the table there?)";
  return status > 0
    ? `HTTP ${status}`
    : "no response (network error or timeout)";
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} client
 * @param {string} table
 */
async function tablePresent(client, table) {
  // A plain GET for at most one row, never a HEAD: a HEAD answer has no body, and the client reports the
  // empty 404 of a missing table as success.
  const { error, status } = await client
    .from(table)
    .select("*")
    .limit(1)
    .abortSignal(AbortSignal.timeout(TIMEOUT_MS));
  if (!error) return true;
  // PostgREST answers PGRST205 / 42P01 when the relation does not exist.
  if (error.code === "PGRST205" || error.code === "42P01") return false;
  throw new Error(`${table}: ${describe(error, status)}`);
}

/**
 * The rows whose key is one of `values`, read READ_CHUNK keys at a time.
 * @param {import("@supabase/supabase-js").SupabaseClient} client
 * @param {string} table
 * @param {string} key
 * @param {unknown[]} values
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
async function readIn(client, table, key, values) {
  /** @type {Array<Record<string, unknown>>} */
  const rows = [];
  for (let i = 0; i < values.length; i += READ_CHUNK) {
    const { data, error, status } = await client
      .from(table)
      .select("*")
      .in(key, values.slice(i, i + READ_CHUNK))
      .abortSignal(AbortSignal.timeout(TIMEOUT_MS));
    if (error) throw new Error(`${table} read: ${describe(error, status)}`);
    rows.push(.../** @type {Array<Record<string, unknown>>} */ (data ?? []));
  }
  return rows;
}

/**
 * Upsert-by-natural-key with the compare-before-write rule. Values are compared as canonical JSON (the
 * database returns jsonb with its own key order) and the `instants` columns as points in time (it returns a
 * timestamptz with a +00:00 offset for the plan's "…Z"), so a row that has not changed reads "unchanged".
 * @param {import("@supabase/supabase-js").SupabaseClient} client
 * @param {{ table: string, key: string, rows: Array<Record<string, unknown>>, compare: string[], instants?: string[], immutable?: boolean, referenced?: (row: Record<string, unknown>) => Promise<boolean> }} spec
 * @returns {Promise<{ inserted: number, unchanged: number, differs: string[], updated: number, kept: string[] }>}
 */
async function reconcile(client, spec) {
  const keys = spec.rows.map((r) => r[spec.key]);
  const existing = new Map(
    (await readIn(client, spec.table, spec.key, keys)).map((r) => [
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
    const same = spec.compare.every((column) =>
      spec.instants?.includes(column)
        ? sameInstant(current[column], row[column])
        : canonicalJson(current[column]) === canonicalJson(row[column]),
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
      throw new Error(
        `${spec.table} insert: ${describe(ins.error, ins.status)}`,
      );
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
      throw new Error(
        `${spec.table} update: ${describe(upd.error, upd.status)}`,
      );
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
  return new Map(
    (await readIn(client, table, key, values)).map((r) => [
      String(r[key]),
      String(r.id),
    ]),
  );
}

/** @param {string} label @param {{ inserted: number, unchanged: number, differs: string[], updated: number, kept: string[] }} r @param {boolean} [immutable] */
function report(label, r, immutable = false) {
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
      `    differing keys: ${r.differs.slice(0, 10).join(", ")}${r.differs.length > 10 ? ", …" : ""}${immutable ? " (append-only — never rewritten; a change is a new version)" : overwrite ? "" : " (kept — re-run with --overwrite to apply the plan over them)"}`,
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
        const { count, error, status } = await client
          .from("order_items")
          .select("id", { count: "exact", head: true })
          .eq("variant_code", row.variant_code)
          .abortSignal(AbortSignal.timeout(TIMEOUT_MS));
        // A count that did not come back is a failure, never "no reference" (a HEAD carries no error body).
        if (error || count === null)
          throw new Error(`order_items read: ${describe(error, status)}`);
        return count > 0;
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
      instants: ["effective_from"],
      immutable: true,
    }),
    true,
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
      instants: ["effective_from"],
      immutable: true,
    }),
    true,
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
