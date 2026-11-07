"use client";

import { useId } from "react";

import { useBag } from "@/components/commerce/bag-provider";
import { CHECKOUT_CONTROL } from "@/content/public/cart";

/**
 * The checkout control of the cart drawer and the cart page — S1.5's honest disabled state (docs/sprint-prompts/
 * S1.5-artwork-bag-cart.md §H.2 "Checkout handoff"). No checkout exists before S1.6, so this is a disabled button,
 * never a link: the checkout route does not exist yet and would be the global 404, and nothing here pretends an order can be placed. The labels are
 * the prototype's own links — "Continue to checkout" in the drawer (prototype/shared/bag.js:15) and "Continue to
 * checkout →" on the cart page (prototype/scripts/build-shop-flow.cjs:10, `#checkout-link`) — and the button is
 * described by the artwork pages' static drawer line "Checkout is not yet available."
 * (prototype/scripts/build-products.cjs:168 — rule 7, not new wording), shown beside it.
 *
 * On the cart page the control is hidden while the hydrated bag is empty, as prototype/shared/commerce-r9.js:6 hides
 * `#checkout-link`; before hydration (and without JavaScript) it shows, disabled. The drawer renders it only with rows.
 *
 * **S1.6 replaces exactly this file** with guarded navigation to its checkout: the same two placements and labels,
 * the same bag (src/lib/bag/, via src/components/commerce/bag-provider.tsx) and the same validation
 * (`POST /api/bag`) — and S1.6 proves the cart → checkout Back / Forward round-trip (H.1 #4). Its callers are
 * src/components/commerce/cart-drawer-bag.tsx and src/app/(public)/cart/page.tsx.
 */
export function CheckoutControl({
  placement,
}: {
  placement: "drawer" | "cart";
}) {
  const noteId = useId();
  const { snapshot } = useBag();
  const button = (
    <button
      type="button"
      className="button button--primary"
      disabled
      aria-describedby={noteId}
    >
      {placement === "cart" ? CHECKOUT_CONTROL.cart : CHECKOUT_CONTROL.drawer}
    </button>
  );
  if (placement === "drawer")
    return (
      <>
        <p>{button}</p>
        <p className="pd-bag-note" id={noteId}>
          {CHECKOUT_CONTROL.unavailable}
        </p>
      </>
    );
  return (
    <div
      id="checkout-link"
      hidden={snapshot.hydrated && snapshot.rows.length === 0}
    >
      {button}
      <p className="flow-fine" id={noteId}>
        {CHECKOUT_CONTROL.unavailable}
      </p>
    </div>
  );
}
