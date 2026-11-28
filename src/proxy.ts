import { NextResponse, type NextRequest } from "next/server";

import {
  MISSING_ORDER_REWRITE,
  orderRouteAnswer,
} from "@/lib/server/order-confirmation";
import { refreshStaffSessionCookies } from "@/lib/server/staff-session";

/**
 * The proxy — two jobs on two path families, and nothing anywhere else.
 *
 * **`/admin` — S1.2 (docs/TECH-ARCHITECTURE.md §5).** Lets the staff session's cookies be refreshed and written
 * back, which a Server Component cannot do itself. It makes no access decision — the guard in every page and action
 * does (`src/lib/server/staff-session.ts`) — and an unauthenticated request passes straight through to the page,
 * whose guard redirects it to the sign-in.
 *
 * **`/order` — S1.7 (docs/sprint-prompts/S1.7-razorpay-verification.md §H.3 "The designed 404";
 * docs/PROJECT-STATUS.md §10 #23 (j)).** An order page's address carries a private token, so its pages cannot be
 * listed at build time the way the catalogue's are, and while the global 404 is on a page's own `notFound()` is not
 * drawn on the server. So the question "is there such an order?" is asked here, before the page: a path that is not
 * an order page's, a token of another shape, or a token no order has is rewritten to a path that matches no route —
 * the framework then answers the designed 404 (src/app/global-not-found.tsx) in the server's HTML with a 404 status,
 * and the address in the browser stays as it was typed. A request for an order that exists — or that could not be
 * read — goes on to the page, which reads the order itself: this file hands the page nothing.
 * The token is hashed and looked up by that hash (src/lib/server/order-confirmation.ts); it is never logged.
 *
 * Every other route never runs this file.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/order" || pathname.startsWith("/order/")) {
    return (await orderRouteAnswer(pathname)) === "render"
      ? NextResponse.next()
      : NextResponse.rewrite(new URL(MISSING_ORDER_REWRITE, request.url));
  }
  return refreshStaffSessionCookies(request);
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/order", "/order/:path*"],
};
