import {
  validateCandidateSha,
  validateLocalBaseUrl,
  validatePreviewBaseUrl,
} from "../../../scripts/testing/lib/deployment.mjs";

/**
 * The Playwright target — S0.2 (docs/ENVIRONMENT-PARITY.md §10). `PLAYWRIGHT_BASE_URL` has no fallback:
 * an absent or malformed value fails configuration before any browser starts. Two declared modes:
 *
 * - `preview` (default): an immutable Vercel Preview deployment URL, the full candidate SHA
 *   (`PLAYWRIGHT_CANDIDATE_SHA`) and the sanctioned bypass secret (`VERCEL_AUTOMATION_BYPASS_SECRET`);
 *   global setup then matches origin and SHA against the GitHub deployment record before any request.
 * - `local` (`PLAYWRIGHT_TARGET_MODE=local`): a loopback origin for local browser QA. It is never Preview
 *   evidence and refuses to run while a Preview secret is set in the shell.
 */

export type TargetMode = "preview" | "local";

export type ResolvedTarget = {
  mode: TargetMode;
  origin: string;
  candidateSha: string | null;
  bypassSecret: string | null;
};

/** Both projects must run; the reporter fails the run when either produced no test. */
export const REQUIRED_PROJECTS = ["desktop", "mobile-390"] as const;

type EnvLike = Record<string, string | undefined>;

function present(value: string | undefined): value is string {
  return typeof value === "string" && value.trim() !== "";
}

export function resolveTargetFromEnv(
  env: EnvLike = process.env,
): ResolvedTarget {
  const mode = env.PLAYWRIGHT_TARGET_MODE ?? "preview";
  if (mode !== "preview" && mode !== "local")
    throw new Error(
      'PLAYWRIGHT_TARGET_MODE must be "preview" (default) or "local"',
    );

  if (mode === "local") {
    if (
      present(env.VERCEL_AUTOMATION_BYPASS_SECRET) ||
      present(env.S0_2_PROOF_TOKEN)
    )
      throw new Error(
        "local mode refuses to run while VERCEL_AUTOMATION_BYPASS_SECRET or S0_2_PROOF_TOKEN is set — unset them; local browser QA never uses Preview secrets",
      );
    const local = validateLocalBaseUrl(env.PLAYWRIGHT_BASE_URL);
    if (!local.ok) throw new Error(local.reasons.join("; "));
    return {
      mode,
      origin: local.origin,
      candidateSha: null,
      bypassSecret: null,
    };
  }

  const base = validatePreviewBaseUrl(env.PLAYWRIGHT_BASE_URL);
  if (!base.ok) throw new Error(base.reasons.join("; "));
  const sha = validateCandidateSha(env.PLAYWRIGHT_CANDIDATE_SHA);
  if (!sha.ok) throw new Error(sha.reasons.join("; "));
  if (!present(env.VERCEL_AUTOMATION_BYPASS_SECRET))
    throw new Error(
      "VERCEL_AUTOMATION_BYPASS_SECRET is not set — the Preview is protected (All Deployments) and the harness never runs without the sanctioned bypass",
    );
  return {
    mode,
    origin: base.origin,
    candidateSha: sha.sha,
    bypassSecret: env.VERCEL_AUTOMATION_BYPASS_SECRET,
  };
}
