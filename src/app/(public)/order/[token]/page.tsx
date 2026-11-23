import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { OrderConfirmation } from "@/components/order/order-confirmation";
import { PublicPage } from "@/components/shell/public-page";
import { ORDER_HEAD } from "@/content/public/order";
import { orderViewOf } from "@/lib/schemas/order-confirmation";
import { readOrder } from "@/lib/server/order-confirmation";
import "@/styles/commerce.css";
import "@/styles/checkout.css";
import "@/styles/order.css";

import { orderStatusAction } from "./actions";

/**
 * An order's own page — S1.7 (docs/TECH-ARCHITECTURE.md §3a `/order/[token]`, D-09 as amended by D-61;
 * prototype/pages/order/demo/index.html for the layout and the confirmed copy; docs/sprint-prompts/
 * S1.7-razorpay-verification.md §H.3 "Order page"). The address is the capability: whoever holds the link sees
 * this one order — its state from the database (confirmed / confirming / failed), its rows and its totals — and
 * nothing of the customer.
 *
 * - **Rendered per request, never cached, never built ahead**: no `generateStaticParams`, no token is known at
 *   build time, and the response is `no-store` (next.config.ts adds the route's own cache and referrer headers).
 * - **Never indexed**, whatever the site's own noindex becomes at launch: the page's `robots` and its
 *   `no-referrer` policy are its own. The token appears in no metadata.
 * - **An unknown or malformed token is the designed 404** — answered by src/proxy.ts before this file is reached
 *   (a page's own `notFound()` cannot draw the designed page on the server while the global 404 is on:
 *   docs/PROJECT-STATUS.md §10 #23 (j)). The `notFound()` below is the same answer for a request that reaches
 *   the page anyway.
 * - **An order that cannot be read is not a missing order**: the page throws, and the public error boundary
 *   shows the designed "temporary interruption" page. The message carries no token.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: ORDER_HEAD.title,
  description: ORDER_HEAD.description,
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function OrderPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const read = await readOrder(token);
  if (read.status !== "ok") {
    if (read.status === "not_found") notFound();
    throw new Error("the order could not be read");
  }
  return (
    <PublicPage variant="commerce">
      <OrderConfirmation
        view={orderViewOf(read.row)}
        token={token}
        ask={orderStatusAction}
      />
    </PublicPage>
  );
}
