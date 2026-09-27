#!/usr/bin/env node
// @ts-check
/**
 * `pnpm db:test:seed` — the D-22 TEST seed skeleton: one idempotent synthetic row `fixture:baseline` in
 * `system_checks`, and nothing else (no product table exists before S1.1). Dry run by default; `--apply`
 * performs the write under the owner's scoped TEST fixture authorisation. Before any I/O the TEST target
 * and both keys are re-verified (a fresh preflight, never a stale stamp); PROD, an unknown target, missing
 * credentials or mismatched refs are refused with names only.
 */
import { createClient } from "@supabase/supabase-js";

import { loadLocalEnv } from "./lib/env.mjs";
import { BASELINE_FIXTURE, seedBaselineFixture } from "./lib/fixtures.mjs";
import {
  probeIdentity,
  probeProblems,
  resolveTestTarget,
} from "./lib/supabase-target.mjs";

const apply = process.argv.includes("--apply");

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
  console.log(
    `Seed plan: upsert one synthetic row check_key=${BASELINE_FIXTURE.check_key} (status ${BASELINE_FIXTURE.status}).`,
  );
  if (!apply) {
    console.log(
      "Dry run — re-run with --apply under the owner's TEST fixture authorisation.",
    );
    return;
  }
  const client = createClient(target.target.url, target.target.secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const result = await seedBaselineFixture(client);
  if (!result.ok) {
    console.error(`Seed FAILED (code ${result.code ?? "unknown"}).`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `Seed applied: ${result.count} row present for ${BASELINE_FIXTURE.check_key}.`,
  );
}

main().catch((error) => {
  console.error(
    `Seed error: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
