import { handleRazorpayWebhook } from "@/lib/server/payments/webhook";

// POST /api/webhooks/razorpay — Razorpay's webhook (S1.7; docs/TECH-ARCHITECTURE.md §3c; src/lib/server/payments/
// webhook.ts): the signature verified over the raw body, the delivery stored in the ledger first, then its one
// effect in one database transaction. Authenticated by the signature alone — no session. The other methods are
// exported only to reach the handler's own 405 (JSON, `Allow: POST`, `Cache-Control: no-store`) instead of the
// framework's; never cached or prerendered.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return handleRazorpayWebhook(request);
}

export function GET(request: Request): Promise<Response> {
  return handleRazorpayWebhook(request);
}

export function PUT(request: Request): Promise<Response> {
  return handleRazorpayWebhook(request);
}

export function PATCH(request: Request): Promise<Response> {
  return handleRazorpayWebhook(request);
}

export function DELETE(request: Request): Promise<Response> {
  return handleRazorpayWebhook(request);
}

export function OPTIONS(request: Request): Promise<Response> {
  return handleRazorpayWebhook(request);
}
