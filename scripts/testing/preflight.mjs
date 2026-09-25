#!/usr/bin/env node
// @ts-check
/**
 * `pnpm db:test:preflight` — the read-only TEST target, provenance and health preflight
 * (docs/ENVIRONMENT-PARITY.md §12 P1 provenance and P11; docs/SUPABASE-MCP-SAFETY.md is not involved).
 * Runs in the owner-authorised trusted local process: values come from the shell or `.env.local` and are
 * never printed; the report carries names, project refs (non-secret identifiers) and HTTP statuses only.
 *
 * Exit codes: 0 pass · 1 a probe failed · 2 configuration missing or refused (names in the output).
 */
import { loadLocalEnv } from "./lib/env.mjs";
import {
  probeIdentity,
  probeProblems,
  resolveTestTarget,
} from "./lib/supabase-target.mjs";

async function main() {
  const env = loadLocalEnv();
  console.log("S0.2 TEST preflight — read-only");
  console.log(
    env.loaded
      ? `Loaded ${env.names} name(s) from ${env.file} (values never shown).`
      : `${env.file} not found — using the shell environment only.`,
  );

  const target = resolveTestTarget(process.env);
  if (!target.ok) {
    console.error("Refused before any request:");
    for (const reason of target.reasons) console.error(`  - ${reason}`);
    process.exitCode = 2;
    return;
  }
  const { ref, prodRef } = target.target;
  console.log(
    `Target: TEST project ${ref} (NEXT_PUBLIC_SUPABASE_URL = SUPABASE_TEST_PROJECT_REF); PROD ref ${prodRef} differs.`,
  );

  const probe = await probeIdentity(target.target);
  const rows = [
    ["publishable key accepted by /rest/v1/", probe.publicKeyAccepted],
    ["secret key accepted by /rest/v1/", probe.secretKeyAccepted],
    ["auth health (/auth/v1/health)", probe.authHealthy],
  ];
  for (const [label, ok] of rows)
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
  console.log(
    `  ${probe.baseline === "present" ? "PASS" : "INFO"}  system_checks baseline: ${probe.baseline}${probe.baseline === "absent" ? " (0000_init not applied yet)" : ""}`,
  );
  const anon = probe.anonRead;
  const anonVerdict =
    anon.status === 200
      ? (anon.rows ?? 0) > 0
        ? "FAIL"
        : "PASS"
      : anon.status === 401 || anon.status === 403 || anon.status === 404
        ? "PASS"
        : "INFO";
  console.log(
    `  ${anonVerdict}  anonymous read of system_checks: HTTP ${anon.status}${anon.rows === null ? "" : `, ${anon.rows} row(s)`}`,
  );
  console.log(
    `  statuses: ${Object.entries(probe.statuses)
      .map(([label, status]) => `${label} ${status}`)
      .join("; ")}`,
  );

  const problems = probeProblems(probe, { requireBaseline: false });
  if (problems.length > 0) {
    console.error("Preflight FAILED:");
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log("Preflight PASSED (read-only; nothing was written).");
}

main().catch((error) => {
  console.error(
    `Preflight error: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
