"use client";

import Link from "next/link";
import { useId } from "react";

import { useBag } from "@/components/commerce/bag-provider";
import { BAG_STATUS, CHECKOUT_CONTROL } from "@/content/public/cart";
import { CHECKOUT_NOTICES } from "@/content/public/checkout";

import { currentAnswer, validationFailed } from "./bag-lines";
import { useCheckoutOpen } from "./checkout-availability";

/**
 * The checkout control of the cart drawer and the cart page — S1.6: guarded navigation to the checkout
 * (docs/sprint-prompts/S1.6-checkout-pending-order.md §H.3; the S1.5 file was the always-disabled button). The two
 * placements and their labels are the prototype's links — "Continue to checkout" in the drawer
 * (prototype/shared/bag.js:15) and "Continue to checkout →" on the cart page (prototype/scripts/
 * build-shop-flow.cjs:10, `#checkout-link`).
 *
 * It is a link to the checkout only when all of this holds: checkout is open on this deployment (the server's
 * answer — ./checkout-availability.tsx), the bag is hydrated and holds rows, and the answer for the bag's current
 * revision (`POST /api/bag`, ./bag-lines.ts `currentAnswer`) says every item can be bought. In every other case —
 * checkout closed, the server render and no JavaScript, the bag still being checked, a failed check, an item that is
 * not available — it is the disabled button, described by a line:
 *
 * - closed: the artwork pages' static drawer line "Checkout is not yet available." (prototype/scripts/
 *   build-products.cjs:168 — rule 7, not new wording);
 * - an item not available, or a failed check: the checkout's and the bag's own honest lines, shown;
 * - the bag being checked (and before hydration): the bag's "Checking your bag…" line, for assistive technology
 *   only — the status line beside the rows already shows it, and a line that comes and goes with every edit would
 *   move the page.
 *
 * The link is a convenience, never the protection: the checkout page checks the bag again and its server actions
 * enforce the sales gate, the fields, the rate limit, the security check and the total themselves.
 *
 * On the cart page the control is hidden while the hydrated bag is empty, as prototype/shared/commerce-r9.js:6 hides
 * `#checkout-link`; before hydration (and without JavaScript) it shows, disabled. The drawer renders it only with
 * rows. Its callers are src/components/commerce/cart-drawer-bag.tsx and src/app/(public)/cart/page.tsx.
 */

/** Where the control leads when it is a link. */
const CHECKOUT_HREF = "/checkout";

export function CheckoutControl({
  placement,
}: {
  placement: "drawer" | "cart";
}) {
  const noteId = useId();
  const open = useCheckoutOpen();
  const { snapshot, validation } = useBag();
  const answer = currentAnswer(snapshot, validation);
  const label =
    placement === "cart" ? CHECKOUT_CONTROL.cart : CHECKOUT_CONTROL.drawer;

  const ready =
    open &&
    answer !== null &&
    answer.items.length > 0 &&
    answer.items.every((item) => item.available);

  /** The line that describes the disabled button, and whether it is shown or read out only. */
  const note: { text: string; visible: boolean } = !open
    ? { text: CHECKOUT_CONTROL.unavailable, visible: true }
    : answer !== null && answer.items.some((item) => !item.available)
      ? { text: CHECKOUT_NOTICES.itemUnavailable, visible: true }
      : validationFailed(snapshot, validation)
        ? { text: BAG_STATUS.failed, visible: true }
        : { text: BAG_STATUS.pending, visible: false };

  const control = ready ? (
    <Link
      className="button button--primary"
      href={CHECKOUT_HREF}
      prefetch={false}
    >
      {label}
    </Link>
  ) : (
    <button
      type="button"
      className="button button--primary"
      disabled
      aria-describedby={noteId}
    >
      {label}
    </button>
  );

  if (placement === "drawer")
    return (
      <>
        <p>{control}</p>
        {ready ? null : (
          <p
            className={note.visible ? "pd-bag-note" : "visually-hidden"}
            id={noteId}
          >
            {note.text}
          </p>
        )}
      </>
    );
  return (
    <div
      id="checkout-link"
      hidden={snapshot.hydrated && snapshot.rows.length === 0}
    >
      {control}
      {ready ? null : (
        <p
          className={note.visible ? "flow-fine" : "visually-hidden"}
          id={noteId}
        >
          {note.text}
        </p>
      )}
    </div>
  );
}
