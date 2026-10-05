#!/usr/bin/env node
// @ts-check
/**
 * `pnpm db:test:reset` — the D-22 TEST reset. Two bounded forms, each dry-run by default (`--apply` deletes)
 * and each after a fresh TEST preflight:
 *
 *   --namespace=fixture: | integration: [--scope=<run>]   (the S0.2 form) deletes only SYNTHETIC
 *       `system_checks` rows whose key starts with that namespace (the S0.2 `s0-2-proof:` namespace was
 *       retired by S1.1 with its route);
 *   --namespace=catalogue:   (S1.1) deletes only the catalogue rows the seed plan positively identifies —
 *       the 330 image rows by object_path, the 66 variants by variant_code, the 22 artworks by slug, the 11
 *       art styles and 3 collections by slug, the 3 finishes by code — and refuses before any request when
 *       an order item references one of the seeded variants (a referenced catalogue is never deleted) or
 *       when a row the plan names carries a status other than the seed's (a staff edit is reported, not
 *       erased). Policy versions, rule versions, orders, snapshots, ledgers and the audit log are never
 *       touched by any reset: they are append-only by design (0002_orders); synthetic rows the integration
 *       suite writes there are retained history until a human rehearses the down files on TEST.
 *
 * Never a whole-database reset, schema drop, truncate, broad delete, auth-user deletion or PROD target.
 */
import { createClient } from "@supabase/supabase-js";

import { buildSeedPlan } from "./lib/catalogue.mjs";
import { loadLocalEnv } from "./lib/env.mjs";
import {
  ALLOWED_NAMESPACES,
  FIXTURE_NAMESPACE,
  countNamespace,
  isAllowedNamespace,
  resetFixtureNamespace,
} from "./lib/fixtures.mjs";
import {
  probeIdentity,
  probeProblems,
  resolveTestTarget,
} from "./lib/supabase-target.mjs";

export const CATALOGUE_NAMESPACE = "catalogue:";
const TIMEOUT_MS = 15_000;

const apply = process.argv.includes("--apply");
const namespace =
  process.argv
    .find((arg) => arg.startsWith("--namespace="))
    ?.slice("--namespace=".length) ?? FIXTURE_NAMESPACE;
const scope =
  process.argv
    .find((arg) => arg.startsWith("--scope="))
    ?.slice("--scope=".length) ?? "";

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} client
 * @param {string} table
 * @param {string} key
 * @param {unknown[]} values
 */
async function countIn(client, table, key, values) {
  const { count, error } = await client
    .from(table)
    .select("*", { count: "exact", head: true })
    .in(key, values)
    .abortSignal(AbortSignal.timeout(TIMEOUT_MS));
  if (error) throw new Error(`${table} count: ${error.code ?? "unknown"}`);
  return count ?? 0;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} client
 * @param {string} table
 * @param {string} key
 * @param {unknown[]} values
 */
async function deleteIn(client, table, key, values) {
  let deleted = 0;
  for (let i = 0; i < values.length; i += 100) {
    const { data, error } = await client
      .from(table)
      .delete()
      .in(key, values.slice(i, i + 100))
      .select(key)
      .abortSignal(AbortSignal.timeout(TIMEOUT_MS));
    if (error) throw new Error(`${table} delete: ${error.code ?? "unknown"}`);
    deleted += (data ?? []).length;
  }
  return deleted;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} client
 */
async function resetCatalogue(client) {
  const plan = buildSeedPlan();
  const variantCodes = plan.variants.map((v) => v.variant_code);
  const referenced = await countIn(
    client,
    "order_items",
    "variant_code",
    variantCodes,
  );
  if (referenced > 0) {
    console.error(
      `Refused: ${referenced} order item(s) reference seeded variants — a referenced catalogue is never deleted (rehearse the down files on TEST instead, docs/database-changes/S1.1-0002-orders.md).`,
    );
    process.exitCode = 1;
    return;
  }
  const edited = await client
    .from("artworks")
    .select("slug,status")
    .in(
      "slug",
      plan.artworks.map((a) => a.slug),
    )
    .neq("status", "Active")
    .abortSignal(AbortSignal.timeout(TIMEOUT_MS));
  if (edited.error)
    throw new Error(`artworks read: ${edited.error.code ?? "unknown"}`);
  if ((edited.data ?? []).length > 0) {
    console.error(
      `Refused: ${(edited.data ?? []).length} seeded artwork(s) carry a status the seed did not set (a staff edit) — ${(edited.data ?? []).map((r) => `${r.slug}=${r.status}`).join(", ")}.`,
    );
    process.exitCode = 1;
    return;
  }
  const steps = [
    {
      table: "artwork_images",
      key: "object_path",
      values: plan.images.map((i) => i.object_path),
    },
    { table: "variants", key: "variant_code", values: variantCodes },
    {
      table: "artworks",
      key: "slug",
      values: plan.artworks.map((a) => a.slug),
    },
    {
      table: "art_styles",
      key: "slug",
      values: plan.art_styles.map((s) => s.slug),
    },
    {
      table: "collections",
      key: "slug",
      values: plan.collections.map((c) => c.slug),
    },
    {
      table: "frame_finishes",
      key: "code",
      values: plan.frame_finishes.map((f) => f.code),
    },
  ];
  for (const step of steps) {
    const before = await countIn(client, step.table, step.key, step.values);
    if (!apply) {
      console.log(
        `  ${step.table}: ${before} seeded row(s) would be deleted (of ${step.values.length} the plan names).`,
      );
      continue;
    }
    const deleted = await deleteIn(client, step.table, step.key, step.values);
    console.log(
      `  ${step.table}: deleted ${deleted} of ${before} seeded row(s).`,
    );
  }
  console.log(
    apply
      ? "Catalogue reset applied. Policy versions and rule versions are append-only and were not touched; bucket objects are left for the next upload to skip or overwrite."
      : "Dry run — re-run with --apply under the owner's TEST fixture authorisation.",
  );
}

async function main() {
  if (namespace !== CATALOGUE_NAMESPACE && !isAllowedNamespace(namespace)) {
    console.error(
      `Refused: "${namespace}" is not a fixture namespace (allowed: ${[...ALLOWED_NAMESPACES, CATALOGUE_NAMESPACE].join(" ")}).`,
    );
    process.exitCode = 2;
    return;
  }
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
    console.error("Preflight FAILED — nothing deleted:");
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exitCode = 1;
    return;
  }
  const client = createClient(target.target.url, target.target.secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  if (namespace === CATALOGUE_NAMESPACE) {
    console.log(
      `TEST project ${target.target.ref} verified. Catalogue reset plan (bounded to the seed plan's rows):`,
    );
    await resetCatalogue(client);
    return;
  }
  const before = await countNamespace(client, namespace, { scope });
  console.log(
    `TEST project ${target.target.ref} verified. Reset plan: delete synthetic rows with check_key like "${namespace}${scope}%" (${before.count} row(s) match now).`,
  );
  if (!apply) {
    console.log(
      "Dry run — re-run with --apply under the owner's TEST fixture authorisation.",
    );
    return;
  }
  const result = await resetFixtureNamespace(client, namespace, { scope });
  if (!result.ok) {
    console.error(
      `Reset FAILED (code ${result.code ?? "unknown"}); record any residual rows.`,
    );
    process.exitCode = 1;
    return;
  }
  const after = await countNamespace(client, namespace, { scope });
  console.log(
    `Reset applied: ${result.deleted} synthetic row(s) deleted; ${after.count} row(s) still match (non-synthetic rows are never touched).`,
  );
}

main().catch((error) => {
  console.error(
    `Reset error: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
