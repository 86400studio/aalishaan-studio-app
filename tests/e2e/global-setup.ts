import {
  fetchPreviewEvidence,
  matchPreviewTarget,
} from "../../scripts/testing/lib/deployment.mjs";

import { resolveTargetFromEnv } from "./harness/target";

/**
 * Before any browser or credential: in preview mode the configured origin and candidate SHA must match a
 * successful Preview deployment of this repository (GitHub Deployments API, written by Vercel's Git
 * integration; the optional read-only GITHUB_TOKEN only raises the rate limit). A mismatch throws and no
 * test runs. Local mode only announces itself.
 */
export default async function globalSetup(): Promise<void> {
  const target = resolveTargetFromEnv(process.env);
  if (target.mode === "local" || target.candidateSha === null) {
    console.log(
      `[harness] local mode against ${target.origin} — not Preview evidence`,
    );
    return;
  }
  const evidence = await fetchPreviewEvidence({
    sha: target.candidateSha,
    token: process.env.GITHUB_TOKEN,
  });
  const match = matchPreviewTarget({
    origin: target.origin,
    sha: target.candidateSha,
    evidence,
  });
  if (!match.ok)
    throw new Error(`Preview target not verified: ${match.reasons.join("; ")}`);
  console.log(
    `[harness] Preview verified: GitHub deployment ${match.deployment.id} (environment ${match.deployment.environment}, ref ${match.deployment.ref}, created ${match.deployment.createdAt}) of ${target.candidateSha} serves ${target.origin}`,
  );
}
