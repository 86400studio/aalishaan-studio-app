import { handleSetupProof } from "@/lib/server/setup-proof";

// The Preview-only S0.2 proof harness — see src/lib/server/setup-proof.ts. Removed, with S0_2_PROOF_TOKEN
// revoked, by S1.1 before product data exists. Only POST is exported: Next.js answers every other method
// itself (405; OPTIONS gets its automatic 204) without calling the handler.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return handleSetupProof(request);
}
