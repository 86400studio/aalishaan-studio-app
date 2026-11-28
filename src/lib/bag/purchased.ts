import type { BagRow } from "./rows";

/**
 * The bag after a purchase — S1.7 (docs/sprint-prompts/S1.7-razorpay-verification.md §H.3 "The bag"). Pure rules;
 * the one caller is src/components/commerce/purchased-bag.tsx, on the order's own page, and the only writer of the
 * bag stays ./store.ts.
 *
 * The bought artworks are taken out of the bag exactly once, and only when ALL of these hold:
 *   1. the order is **confirmed** — the database holds a verified captured payment for it. A browser callback, a
 *      redirect, a payment still being confirmed and an order under review never empty anything;
 *   2. **this browser placed the order**: the checkout attempt key it still holds hashes to the order's own attempt
 *      hash. A link opened on another device, later, or by someone else matches nothing;
 *   3. the bag has been read and holds **exactly** what was bought — the same variant codes, each in the same
 *      quantity, and nothing else. A bag that was edited since — one row added, removed or changed — is left alone.
 * The attempt key is then dropped, so nothing here can run for that order again: reopening an old order page cannot
 * touch a newer bag. The same drop — without touching the bag — ends the attempt when the order is confirmed but the
 * bag has changed, and when the order is over without a payment (`failed/closed`: its time to pay has passed, or it no
 * longer awaits a payment). While the order is `confirming` — a payment being confirmed, or a review being made — or
 * can still be paid for, the key is kept: the checkout page needs it to say where the order stands instead of
 * offering the same bag as a new order (the review of 2026-11-26, finding 1 — an order page's review always stands
 * beside a payment: its link is given only once a verified payment signal exists). The key still ends with the
 * attempt's honoured time, or with the tab; a later confirmation by a person clears the bag through it.
 */

/** One bought item: its variant code and its quantity. */
export type PurchasedItem = {
  readonly variant_code: string;
  readonly quantity: number;
};

/** True when the bag holds exactly the purchase: the same codes, each in the same quantity, and nothing else. */
export function bagEqualsPurchase(
  rows: readonly BagRow[],
  items: readonly PurchasedItem[],
): boolean {
  if (rows.length === 0 || rows.length !== items.length) return false;
  const bought = new Map(
    items.map((item) => [item.variant_code, item.quantity]),
  );
  if (bought.size !== items.length) return false;
  return rows.every((row) => bought.get(row.code) === row.quantity);
}

/** What the page showing an order may do about the bag and the attempt key. */
export type PurchasedBagDecision =
  /** Not this browser's order, or the order is not settled (confirming, or still payable): nothing is touched. */
  | "keep"
  /** This browser's order is over, and the bag is not (or no longer) the purchase: the key is dropped only. */
  | "release"
  /** This browser's confirmed order, and the bag is exactly the purchase: the bought rows go, then the key. */
  | "clear";

export type PurchasedBagFacts = {
  /** The order's state as the database has it. */
  readonly state:
    | { readonly state: "confirmed" }
    | { readonly state: "confirming"; readonly reason: "payment" | "review" }
    | { readonly state: "failed"; readonly reason: "retry" | "closed" };
  /** The SHA-256 of the attempt key this browser holds, or null when it holds none. */
  readonly storedKeyHash: string | null;
  /** The SHA-256 of the attempt key that placed the order, or null. */
  readonly orderAttemptHash: string | null;
  readonly bag: {
    readonly hydrated: boolean;
    readonly rows: readonly BagRow[];
  };
  readonly items: readonly PurchasedItem[];
};

export function purchasedBagDecision(
  facts: PurchasedBagFacts,
): PurchasedBagDecision {
  const { state } = facts;
  if (
    facts.storedKeyHash === null ||
    facts.orderAttemptHash === null ||
    facts.storedKeyHash !== facts.orderAttemptHash
  )
    return "keep";
  if (state.state === "confirmed") {
    // The bag must have been read: an unread bag is never taken for an empty or a matching one.
    if (!facts.bag.hydrated) return "keep";
    return bagEqualsPurchase(facts.bag.rows, facts.items) ? "clear" : "release";
  }
  if (state.state === "failed")
    return state.reason === "closed" ? "release" : "keep";
  // Confirming — a payment being confirmed or a review being made — keeps the key, whatever its reason.
  return "keep";
}
