import { handleBagRequest } from "@/lib/server/bag";

// POST /api/bag — the bag's one read-only validation endpoint (docs/sprint-prompts/S1.5-artwork-bag-cart.md §H.2;
// src/lib/server/bag.ts): `{ "items": [{ "variant_code", "quantity" }] }` in, the projection's titles, availability
// and exact paise out, nothing written. The other methods are exported only to reach the handler's own 405 (JSON,
// `Allow: POST`, `Cache-Control: no-store`) instead of the framework's; never cached or prerendered.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return handleBagRequest(request);
}

export function GET(request: Request): Promise<Response> {
  return handleBagRequest(request);
}

export function PUT(request: Request): Promise<Response> {
  return handleBagRequest(request);
}

export function PATCH(request: Request): Promise<Response> {
  return handleBagRequest(request);
}

export function DELETE(request: Request): Promise<Response> {
  return handleBagRequest(request);
}

export function OPTIONS(request: Request): Promise<Response> {
  return handleBagRequest(request);
}
