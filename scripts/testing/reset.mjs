#!/usr/bin/env node
// @ts-check
/**
 * `pnpm db:test:reset` — the D-22 TEST reset skeleton. It deletes only SYNTHETIC `system_checks` rows whose
 * key starts with one allowed fixture namespace (default `fixture:`; `--namespace=integration:` or
 * `--namespace=s0-2-proof:` clears residuals of an interrupted run; `--scope=<run>` narrows further).
 * Never a whole-database reset, schema drop, truncate, broad delete, auth-user deletion or customer seed.
 * Dry run by default; `--apply` performs the delete after a fresh TEST preflight.
 */
import { createClient } from "@supabase/supabase-js";

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

const apply = process.argv.includes("--apply");
const namespace =
  process.argv
    .find((arg) => arg.startsWith("--namespace="))
    ?.slice("--namespace=".length) ?? FIXTURE_NAMESPACE;
const scope =
  process.argv
    .find((arg) => arg.startsWith("--scope="))
    ?.slice("--scope=".length) ?? "";

async function main() {
  if (!isAllowedNamespace(namespace)) {
    console.error(
      `Refused: "${namespace}" is not an S0.2 fixture namespace (allowed: ${ALLOWED_NAMESPACES.join(" ")}).`,
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
