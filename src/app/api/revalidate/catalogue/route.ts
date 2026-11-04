import { handleCatalogueRevalidation } from "@/lib/server/catalogue-revalidation";

// POST /api/revalidate/catalogue — the catalogue's revalidation hook (docs/TECH-ARCHITECTURE.md §3c; S1.4): an exact
// bearer secret, then `{ "target": "catalogue" }`, then the browse pages expire. Only POST is exported: Next.js
// answers every other method itself (405) without calling the handler, and never caches or prerenders this route.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return handleCatalogueRevalidation(request);
}
