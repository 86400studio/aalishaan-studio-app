import { handleHealth } from "@/lib/server/health";

// GET /api/health — status only, read-only, never cached (docs/TECH-ARCHITECTURE.md §3c; S0.2). Only GET is
// exported: Next.js derives HEAD from it and answers every other method itself (405) without calling the
// handler, so nothing but a read can ever run here.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request): Promise<Response> {
  return handleHealth(request);
}
