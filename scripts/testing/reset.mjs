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
 *       when a row the plan names carries a status other than the seed's (a changed status is reported, not
 *       erased). Policy versions, rule versions, orders, snapshots, ledgers and the audit log are never
 *       touched by any reset: they are append-only by design (0002_orders); synthetic rows the integration
 *       suite writes there are retained history until a human rehearses the down files on TEST. This form
 *       always covers every catalogue row the seed plan names, so `--scope` is refused with it: a scope
 *       that narrowed nothing would read as a narrower reset than the one that runs.
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
/** Keys per request: the 330 object paths in one `in` filter make a 21,756-character URL, over the platform's 16 KB limit. */
const KEY_CHUNK = 100;

/**
 * `--name=value` or `--name value`; a bare `--name` yields "" so it is refused, never read as the default.
 * @param {string} name
 * @returns {string | undefined}
 */
function option(name) {
  const joined = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (joined !== undefined) return joined.slice(name.length + 3);
  const at = process.argv.indexOf(`--${name}`);
  if (at < 0) return undefined;
  const next = process.argv[at + 1];
  return next === undefined || next.startsWith("--") ? "" : next;
}

const apply = process.argv.includes("--apply");
const namespace = option("namespace") ?? FIXTURE_NAMESPACE;
const scopeOption = option("scope");
const scope = scopeOption ?? "";

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
 * @param {string} key
 * @param {unknown[]} values
 */
async function countIn(client, table, key, values) {
  let total = 0;
  for (let i = 0; i < values.length; i += KEY_CHUNK) {
    const { count, error, status } = await client
      .from(table)
      .select("*", { count: "exact", head: true })
      .in(key, values.slice(i, i + KEY_CHUNK))
      .abortSignal(AbortSignal.timeout(TIMEOUT_MS));
    // A count that did not come back is a failure, never zero (a HEAD carries no error body).
    if (error || count === null)
      throw new Error(`${table} count: ${describe(error, status)}`);
    total += count;
  }
  return total;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} client
 * @param {string} table
 * @param {string} key
 * @param {unknown[]} values
 */
async function deleteIn(client, table, key, values) {
  let deleted = 0;
  for (let i = 0; i < values.length; i += KEY_CHUNK) {
    const { data, error, status } = await client
      .from(table)
      .delete()
      .in(key, values.slice(i, i + KEY_CHUNK))
      .select(key)
      .abortSignal(AbortSignal.timeout(TIMEOUT_MS));
    if (error) throw new Error(`${table} delete: ${describe(error, status)}`);
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
    throw new Error(`artworks read: ${describe(edited.error, edited.status)}`);
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
  // Before the bare-scope check: with the catalogue form a scope is refused whether or not it has a value.
  if (namespace === CATALOGUE_NAMESPACE && scopeOption !== undefined) {
    console.error(
      "Refused: --scope does not apply to --namespace=catalogue: — that form always covers every catalogue row the seed plan names.",
    );
    process.exitCode = 2;
    return;
  }
  if (scopeOption === "") {
    console.error(
      "Refused: --scope needs a value (--scope=<run> or --scope <run>); without one the whole namespace would match.",
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
  // A count that could not be read is a failure, never "0 rows" (nothing has been deleted yet).
  if (!before.ok)
    throw new Error(`system_checks count: ${before.code || "request failed"}`);
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
  if (!after.ok) {
    console.error(
      `Reset applied: ${result.deleted} synthetic row(s) deleted, but the count after the reset could not be read (${after.code || "request failed"}) — check for residual rows.`,
    );
    process.exitCode = 1;
    return;
  }
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
