import { handleSentryTest } from "@/lib/server/sentry-test";

// Temporary S0.1 diagnostic — see src/lib/server/sentry-test.ts. Removed by the S0.2 PR at the latest.
// Only POST is exported: Next.js answers every other method itself (405; OPTIONS gets its automatic 204)
// without calling the handler, so no other method can emit an event.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return handleSentryTest(request);
}
