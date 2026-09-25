#!/usr/bin/env node
// @ts-check
/**
 * `pnpm test:preview-proof` — the bounded deployed write/read/cleanup proof (docs/ROADMAP.md S0.2
 * acceptance; docs/ENVIRONMENT-PARITY.md §12 P1/P2 pattern). The write originates in the deployed Preview
 * (`POST /api/setup-proof`, src/lib/server/setup-proof.ts); this trusted local process only verifies it.
 *
 * Order — nothing is written before every gate passes:
 *   1. the configured target is validated syntactically and matched to a successful Preview deployment of
 *      exactly PLAYWRIGHT_CANDIDATE_SHA in this repository (GitHub Deployments API);
 *   2. the deployment is confirmed protected without the bypass (a redirect to vercel.com, or a 401
 *      challenge that does not serve the holding page), and the removed S0.1 diagnostic route is
 *      confirmed absent;
 *   3. the local TEST target is resolved and probed (both keys accepted, auth healthy, 0000_init present,
 *      anonymous read denied or empty);
 *   4. a fresh run marker is chosen and confirmed absent in TEST; the owner's read-only PROD negative
 *      control is printed (run read-only: the owner in the PROD SQL editor, or the builder through the
 *      read-only supabase-prod-readonly connection of D-40 — never a writable production connection);
 *   5. without `--apply` the run stops here (dry run). With `--apply`: create → read → independent
 *      privileged read in TEST from this process → cleanup → independent read confirms absence. The
 *      `finally` block re-checks TEST whenever a create was attempted — even when its response was lost —
 *      and removes a residual marker itself; a residual fails the proof and is reported by marker.
 * The bypass header goes only to the exact validated origin and redirects are never followed; every
 * printed line is passed through `redact()`. Exit codes: 0 pass · 1 failure · 2 configuration refused.
 */
import { randomBytes } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import {
  fetchPreviewEvidence,
  matchPreviewTarget,
  validateCandidateSha,
  validatePreviewBaseUrl,
} from "./lib/deployment.mjs";
import { loadLocalEnv, missingNames } from "./lib/env.mjs";
import { fetchExact, redact } from "./lib/http.mjs";
import {
  probeIdentity,
  probeProblems,
  resolveTestTarget,
} from "./lib/supabase-target.mjs";

const apply = process.argv.includes("--apply");
const HARNESS_NAMES = Object.freeze([
  "PLAYWRIGHT_BASE_URL",
  "PLAYWRIGHT_CANDIDATE_SHA",
  "VERCEL_AUTOMATION_BYPASS_SECRET",
  "S0_2_PROOF_TOKEN",
]);
const MIN_TOKEN_LENGTH = 32;
const HOLDING_LINE =
  "This website is being built and is not taking orders yet.";
const QUERY_TIMEOUT_MS = 8000;

class ProofFailure extends Error {
  /** @param {string} message @param {number} [code] */
  constructor(message, code = 1) {
    super(message);
    this.code = code;
  }
}

async function main() {
  loadLocalEnv();
  const missing = missingNames(HARNESS_NAMES);
  if (missing.length > 0)
    throw new ProofFailure(`not set: ${missing.join(", ")}`, 2);
  const base = validatePreviewBaseUrl(process.env.PLAYWRIGHT_BASE_URL);
  if (!base.ok) throw new ProofFailure(base.reasons.join("; "), 2);
  const candidate = validateCandidateSha(process.env.PLAYWRIGHT_CANDIDATE_SHA);
  if (!candidate.ok) throw new ProofFailure(candidate.reasons.join("; "), 2);
  const token = /** @type {string} */ (process.env.S0_2_PROOF_TOKEN);
  if (token.length < MIN_TOKEN_LENGTH)
    throw new ProofFailure(
      `S0_2_PROOF_TOKEN is shorter than ${MIN_TOKEN_LENGTH} characters`,
      2,
    );
  const bypass = /** @type {string} */ (
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET
  );
  const secrets = [
    token,
    bypass,
    process.env.SUPABASE_SECRET_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    process.env.GITHUB_TOKEN,
  ];
  /** @param {string} message */
  const log = (message) => console.log(redact(message, secrets));
  const { origin } = base;
  const { sha } = candidate;

  // 1. Deployment evidence.
  const evidence = await fetchPreviewEvidence({
    sha,
    token: process.env.GITHUB_TOKEN,
  });
  const match = matchPreviewTarget({ origin, sha, evidence });
  if (!match.ok) throw new ProofFailure(match.reasons.join("; "));
  log(
    `1. Target verified: GitHub deployment ${match.deployment.id} (environment ${match.deployment.environment}, ref ${match.deployment.ref}, created ${match.deployment.createdAt}) of ${sha} serves ${origin}.`,
  );

  // 2. Protection and the removed diagnostic.
  const bare = await fetchExact(`${origin}/`, { origin });
  const protectedByRedirect =
    [302, 303, 307].includes(bare.status) &&
    bare.locationOrigin === "https://vercel.com";
  const protectedByChallenge =
    bare.status === 401 && !bare.body.includes(HOLDING_LINE);
  if (!protectedByRedirect && !protectedByChallenge)
    throw new ProofFailure(
      `the deployment answered ${bare.status}${bare.locationOrigin ? ` → ${bare.locationOrigin}` : ""} without the bypass — expected a redirect to vercel.com or a 401 challenge that does not serve the holding page`,
    );
  log(
    `2. Protected without the bypass: GET / → ${bare.status}${bare.locationOrigin ? ` → ${bare.locationOrigin}` : " (challenge, holding page not served)"}.`,
  );
  const gone = await fetchExact(`${origin}/api/sentry-test`, {
    origin,
    bypassSecret: bypass,
    method: "POST",
  });
  if (gone.status !== 404)
    throw new ProofFailure(
      `POST /api/sentry-test answered ${gone.status}; the removed route must be absent (404)`,
    );
  log("   Removed S0.1 diagnostic: POST /api/sentry-test → 404.");

  // 3. TEST target (independent of the Preview's own configuration).
  const target = resolveTestTarget(process.env);
  if (!target.ok) throw new ProofFailure(target.reasons.join("; "), 2);
  const probe = await probeIdentity(target.target);
  const problems = probeProblems(probe);
  if (problems.length > 0) throw new ProofFailure(problems.join("; "));
  log(
    `3. TEST verified from this process: project ${target.target.ref} (PROD ref ${target.target.prodRef} differs); both keys accepted; auth healthy; baseline present; anonymous read HTTP ${probe.anonRead.status}.`,
  );
  const privileged = createClient(target.target.url, target.target.secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  /** A bounded privileged read of the marker: present, absent, or an error code. */
  async function markerState(/** @type {string} */ marker) {
    const { data, error } = await privileged
      .from("system_checks")
      .select("id,status,synthetic")
      .eq("check_key", marker)
      .limit(1)
      .abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS));
    if (error) return { state: "error", code: error.code, row: null };
    const row = (data ?? [])[0] ?? null;
    return { state: row ? "present" : "absent", code: null, row };
  }

  // 4. Marker.
  const marker = `s0-2-proof:${randomBytes(8).toString("hex")}`;
  const before = await markerState(marker);
  if (before.state === "error")
    throw new ProofFailure(
      `TEST read failed before the run (code ${before.code})`,
    );
  if (before.state === "present")
    throw new ProofFailure("marker collision; run again");
  log(`4. Run marker ${marker} — absent in TEST before the run.`);
  log(
    "   PROD negative control (read-only: the owner in the PROD SQL editor, or the builder through supabase-prod-readonly — D-40; run after step 5 creates the marker and again after cleanup):\n" +
      "     select to_regclass('public.system_checks') as table_present;\n" +
      `     select count(*) as marker_rows from public.system_checks where check_key = '${marker}';  -- only when table_present is not null`,
  );

  // Denied without the token (no I/O on the Preview side).
  const denied = await fetchExact(`${origin}/api/setup-proof`, {
    origin,
    bypassSecret: bypass,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "read", marker }),
  });
  if (denied.status !== 404)
    throw new ProofFailure(
      `POST /api/setup-proof without the token answered ${denied.status}, expected 404`,
    );
  log("   Denied without the token: POST /api/setup-proof → 404.");

  if (!apply) {
    log(
      "Dry run complete — no write performed. Re-run with --apply under the owner's scoped TEST-write authorisation.",
    );
    return;
  }

  /** @param {"create" | "read" | "cleanup"} action */
  async function post(action) {
    const response = await fetchExact(`${origin}/api/setup-proof`, {
      origin,
      bypassSecret: bypass,
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ action, marker }),
    });
    /** @type {Record<string, unknown>} */
    let json = {};
    try {
      const parsed = JSON.parse(response.body);
      if (typeof parsed === "object" && parsed !== null) json = parsed;
    } catch {
      json = {};
    }
    return { status: response.status, json };
  }

  let attempted = false;
  let cleaned = false;
  const startedAt = new Date().toISOString();
  try {
    attempted = true;
    const create = await post("create");
    if (create.status !== 200 || create.json.status !== "created")
      throw new ProofFailure(
        `create answered ${create.status} ${String(create.json.status ?? "")}`,
      );
    log(`5. Preview create → 200 created (${new Date().toISOString()}).`);

    const read = await post("read");
    if (read.status !== 200 || read.json.found !== true)
      throw new ProofFailure(
        `read answered ${read.status} found=${String(read.json.found)}`,
      );
    log("   Preview read → 200 found.");

    const landed = await markerState(marker);
    if (landed.state !== "present" || landed.row?.synthetic !== true)
      throw new ProofFailure(
        "the marker was not found in TEST by this process's privileged read",
      );
    log(
      `   Landed in TEST: privileged read from this process finds the marker (synthetic, status ${String(landed.row.status)}).`,
    );

    const cleanup = await post("cleanup");
    if (cleanup.status !== 200 || cleanup.json.deleted !== 1)
      throw new ProofFailure(
        `cleanup answered ${cleanup.status} deleted=${String(cleanup.json.deleted)}`,
      );
    cleaned = true;
    log("6. Preview cleanup → 200, deleted 1.");

    const after = await markerState(marker);
    if (after.state !== "absent")
      throw new ProofFailure(
        after.state === "present"
          ? "the marker is still present in TEST after cleanup"
          : `TEST read failed after cleanup (code ${after.code})`,
      );
    log(`   Absent in TEST after cleanup (${new Date().toISOString()}).`);
    log(
      `PROOF PASSED — candidate ${sha}, deployment ${match.deployment.id}, TEST ${target.target.ref}, marker ${marker}, started ${startedAt}. Record the owner's PROD negative-control result separately.`,
    );
  } finally {
    // Whenever a create was attempted and the happy path did not finish, re-check TEST — a lost response
    // may still have written the row — and leave nothing behind.
    if (attempted && !cleaned) {
      const residual = await markerState(marker);
      if (residual.state === "absent") {
        log(`No residual: marker ${marker} is absent in TEST.`);
      } else if (residual.state === "error") {
        log(
          `RESIDUAL UNKNOWN: TEST could not be read (code ${residual.code}) — check marker ${marker} and remove it with pnpm db:test:reset --namespace=s0-2-proof: --apply if present.`,
        );
        process.exitCode = 1;
      } else {
        let removed = false;
        try {
          const late = await post("cleanup");
          removed = late.status === 200 && late.json.deleted === 1;
          if (removed)
            log(
              `Residual removed by a late Preview cleanup (marker ${marker}).`,
            );
        } catch {
          // reported below
        }
        if (!removed) {
          const removal = await privileged
            .from("system_checks")
            .delete()
            .eq("check_key", marker)
            .eq("synthetic", true)
            .select("id")
            .abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS));
          removed = !removal.error && (removal.data ?? []).length === 1;
          log(
            removed
              ? `Residual marker ${marker} removed by this process (the Preview cleanup did not complete — the proof FAILS and the failure is recorded).`
              : `RESIDUAL: marker ${marker} could not be removed — record it and remove it with pnpm db:test:reset --namespace=s0-2-proof: --apply.`,
          );
        }
        process.exitCode = 1;
      }
    }
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    redact(`PROOF FAILED: ${message}`, [
      process.env.S0_2_PROOF_TOKEN,
      process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
      process.env.SUPABASE_SECRET_KEY,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      process.env.GITHUB_TOKEN,
    ]),
  );
  process.exitCode = error instanceof ProofFailure ? error.code : 1;
});
