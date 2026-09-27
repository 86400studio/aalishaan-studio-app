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
  anonReadDenied,
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
    [
      "publishable key accepted (auth health with the publishable key)",
      probe.publicKeyAccepted,
    ],
    [
      "secret key accepted (REST root, a secret-only endpoint)",
      probe.secretKeyAccepted,
    ],
    ["auth health (/auth/v1/health with the secret key)", probe.authHealthy],
  ];
  for (const [label, ok] of rows)
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
  // "absent" is the one legitimate pre-apply state; "unknown" fails whatever the caller requires.
  const baselineVerdict =
    probe.baseline === "present"
      ? "PASS"
      : probe.baseline === "absent"
        ? "INFO"
        : "FAIL";
  console.log(
    `  ${baselineVerdict}  system_checks baseline: ${probe.baseline}${probe.baseline === "absent" ? " (0000_init not applied yet)" : probe.baseline === "present" ? ` (${probe.baselineRows ?? 0} row(s) visible to the secret key)` : ` (HTTP ${probe.baselineStatus})`}`,
  );
  const anon = probe.anonRead;
  // Denial must be positively established (401/403; a 404 only before the apply; an empty 200 only with a
  // row the secret key can see); anything else is a FAIL, never an INFO (Codex round 1, finding 1).
  const anonVerdict = anonReadDenied(probe) ? "PASS" : "FAIL";
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
