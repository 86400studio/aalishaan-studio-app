"use client";

import Link from "next/link";
import { useEffect, type ReactNode, type RefObject } from "react";

import { CART_DRAWER } from "@/content/public/shell";

import { BagRowView } from "./bag-row";
import { BagStatus } from "./bag-status";
import { CheckoutControl } from "./checkout-control";
import { useBagLines } from "./use-bag-lines";

/**
 * The cart drawer's body — S1.5, inside src/components/shell/overlays.tsx's `CartDrawer` (and its error boundary,
 * src/components/shell/overlay-error-boundary.tsx). The order is prototype/shared/bag.js:15's: the rows
 * (`[data-bag-items]`, the non-editable commerce rows with Remove), the status line (the check, the removal
 * notice, the memory-only disclosure), the checkout control, and "Edit your bag" to the cart page.
 *
 * - An empty bag — and the bag before hydration, which is the server's and the first client render's — keeps the
 *   approved S1.3 empty state (`empty`, the prototype's static drawer markup: "Your cart is quiet.", "Explore
 *   artworks", "View cart page"), followed by the status line (empty unless a removal notice or a storage
 *   disclosure applies). The status line is always in the DOM, so a live region exists before it speaks.
 * - The bag is checked against the catalogue while the drawer is open (`useBagLines(open)`), and the removal notice
 *   is dismissed when it closes.
 * - Remove moves the focus to the drawer's Close button, as bag.js:15 does.
 */
export function CartDrawerBag({
  open,
  onClose,
  closeButton,
  empty,
}: {
  open: boolean;
  onClose: () => void;
  closeButton: RefObject<HTMLButtonElement | null>;
  /** The S1.3 empty state. */
  empty: ReactNode;
}) {
  const {
    snapshot,
    lines,
    messages,
    failed,
    remove,
    retry,
    dismissRemovedNotice,
  } = useBagLines(open);

  useEffect(() => {
    if (!open) return;
    return () => dismissRemovedNotice();
  }, [open, dismissRemovedNotice]);

  const status = (
    <BagStatus messages={messages} failed={failed} onRetry={retry} />
  );

  if (!snapshot.hydrated || snapshot.rows.length === 0)
    return (
      <>
        {empty}
        {status}
      </>
    );

  return (
    <>
      <div data-bag-items="">
        {lines.map((line) => (
          <BagRowView
            key={line.code}
            line={line}
            onNavigate={onClose}
            onRemove={(removed) => {
              remove(removed.code);
              closeButton.current?.focus();
            }}
          />
        ))}
      </div>
      {status}
      <CheckoutControl placement="drawer" />
      <p>
        <Link
          className="text-link"
          href={CART_DRAWER.editBag.href}
          prefetch={false}
          onClick={onClose}
        >
          {CART_DRAWER.editBag.label}
        </Link>
      </p>
    </>
  );
}
