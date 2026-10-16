import type { NextRequest } from "next/server";

import { refreshStaffSessionCookies } from "@/lib/server/staff-session";

/**
 * The Admin proxy — S1.2 (docs/TECH-ARCHITECTURE.md §5). Runs before every `/admin` request and does one thing:
 * lets the staff session's cookies be refreshed and written back, which a Server Component cannot do itself.
 * It makes no access decision — the guard in every page and action does (`src/lib/server/staff-session.ts`) —
 * and an unauthenticated request passes straight through to the page, whose guard redirects it to the sign-in.
 * Public routes never run it.
 */
export async function proxy(request: NextRequest) {
  return refreshStaffSessionCookies(request);
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
