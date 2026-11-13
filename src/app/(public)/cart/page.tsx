import type { Metadata } from "next";
import Link from "next/link";

import { CartItems } from "@/components/commerce/cart-items";
import { CartSubtotal } from "@/components/commerce/cart-subtotal";
import { CheckoutControl } from "@/components/commerce/checkout-control";
import { DeliveryCheck } from "@/components/commerce/delivery-check";
import { PublicPage } from "@/components/shell/public-page";
import { CART_HEAD, CART_PAGE } from "@/content/public/cart";
import "@/styles/commerce.css";

/**
 * Your bag — S1.5 (docs/TECH-ARCHITECTURE.md §3a `/cart`; prototype/pages/cart/index.html:30 from
 * build-shop-flow.cjs:7–10; docs/sprint-prompts/S1.5-artwork-bag-cart.md §H.2). A static page in the prototype's DOM
 * order: the heading; the artworks (the editable rows, the empty state and the status line — client state from the
 * one bag, src/lib/bag/, validated by `POST /api/bag`); the summary (the server's subtotal for the current bag, the
 * pending delivery charge and its approved fine print, the PIN form, the checkout control — since S1.6 a guarded
 * link to the checkout where checkout is open and the bag's check allows it, the disabled button otherwise
 * (src/components/commerce/checkout-control.tsx) —, the guest line and the help line). The page reads no catalogue
 * and is not among the revalidation hook's paths.
 *
 * Not ported: the prototype's "Add a sample artwork" button and its status line, the E10 intake slot and resume
 * states (D-32j, S2.21), the browser's rupee subtotal and the simulated delivery estimate (NS-08). Without
 * JavaScript the bag cannot be read: the rows stay empty, the PIN form and the checkout control are disabled, and
 * the no-JavaScript line says so (the prototype's `<noscript>` style hid only controls this page does not have).
 */
export const metadata: Metadata = {
  title: CART_HEAD.title,
  description: CART_HEAD.description,
};

export default function CartPage() {
  const { summary } = CART_PAGE;
  return (
    <PublicPage variant="commerce">
      <h1 className="checkout-heading">{CART_PAGE.heading}</h1>
      <div className="flow-layout">
        <section>
          <div className="flow-section-title">
            <h2>{CART_PAGE.items.heading}</h2>
            <Link
              className="text-link"
              href={CART_PAGE.items.explore.href}
              prefetch={false}
            >
              {CART_PAGE.items.explore.label}
            </Link>
          </div>
          <CartItems />
        </section>
        <aside className="flow-panel flow-summary">
          <span className="eyebrow">{summary.eyebrow}</span>
          <h2>{summary.heading}</h2>
          <dl className="flow-totals">
            <div>
              <dt>{summary.subtotal}</dt>
              <dd data-subtotal="">
                <CartSubtotal />
              </dd>
            </div>
            <div>
              <dt>{summary.delivery}</dt>
              <dd>{summary.deliveryValue}</dd>
            </div>
          </dl>
          <p className="flow-fine">{summary.fine}</p>
          <DeliveryCheck variant="cart" />
          <CheckoutControl placement="cart" />
          <p className="flow-fine">{summary.guest}</p>
          <p className="flow-help">
            {summary.helpBefore}
            <Link href={summary.help.href} prefetch={false}>
              {summary.help.label}
            </Link>
          </p>
        </aside>
      </div>
      <noscript>
        <p>
          {CART_PAGE.noscript.before}
          {/* a plain link: without JavaScript there is no client navigation */}
          <a href={CART_PAGE.noscript.link.href}>
            {CART_PAGE.noscript.link.label}
          </a>
          {CART_PAGE.noscript.after}
        </p>
      </noscript>
    </PublicPage>
  );
}
