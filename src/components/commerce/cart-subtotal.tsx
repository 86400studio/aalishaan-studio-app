"use client";

import { useBag } from "@/components/commerce/bag-provider";

import { subtotalText } from "./bag-lines";

/**
 * The cart's "Artwork subtotal" value (prototype/pages/cart/index.html:30 `[data-subtotal]`) — S1.5: the server's
 * exact subtotal of the available lines (`formatRupees` of the paise of `POST /api/bag`'s answer) for the bag's
 * current revision only; while that answer is pending, or after it failed, a pending marker — never the browser's
 * own sum, never a stale total (./bag-lines.ts `subtotalText`). Before hydration it is empty: the server cannot know
 * the bag. The cart page's rows (./cart-items.tsx) ask for the validation; this only reads it.
 */
export function CartSubtotal() {
  const { snapshot, validation } = useBag();
  return <>{subtotalText(snapshot, validation)}</>;
}
