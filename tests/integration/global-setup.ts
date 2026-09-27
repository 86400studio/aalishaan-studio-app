import {
  probeIdentity,
  probeProblems,
  resolveTestTarget,
} from "../../scripts/testing/lib/supabase-target.mjs";

/**
 * P11 and P1 provenance before each integration run: both keys accepted by the TEST project's API, Auth
 * healthy (a paused Free project fails here, not inside a test), the 0000_init baseline present and the
 * anonymous read denied or empty. Any problem throws with names only and no test runs.
 */
export default async function setup(): Promise<void> {
  const target = resolveTestTarget(process.env);
  if (!target.ok) throw new Error(target.reasons.join("; "));
  const probe = await probeIdentity(target.target);
  const problems = probeProblems(probe);
  if (problems.length > 0)
    throw new Error(`TEST preflight failed: ${problems.join("; ")}`);
  console.log(
    `[integration] TEST project ${target.target.ref} verified (PROD ref ${target.target.prodRef} differs; keys accepted; auth healthy; baseline present; anonymous read HTTP ${probe.anonRead.status}).`,
  );
}
