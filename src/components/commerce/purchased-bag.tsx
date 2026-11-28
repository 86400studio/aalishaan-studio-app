"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { attemptKeys } from "@/components/checkout/attempt-key";
import { ORDER_BAG } from "@/content/public/order";
import { bagStore } from "@/lib/bag";
import { purchasedBagDecision, type PurchasedItem } from "@/lib/bag/purchased";
import type { OrderPageState } from "@/lib/schemas/order-confirmation";

/**
 * The bag after a purchase — S1.7 (src/lib/bag/purchased.ts states the rule; docs/sprint-prompts/
 * S1.7-razorpay-verification.md §H.3 "The bag"). On the order's own page, in the browser that placed the order:
 * once the database holds a verified captured payment for it, and only if the bag still holds exactly what was
 * bought, the bought rows are taken out through the bag's one writer — once. The checkout attempt key this browser
 * holds is what proves it placed the order; it is dropped afterwards, so the same order can never touch the bag
 * again. The key is read and dropped through its own module (src/components/checkout/attempt-key.ts); nothing new is
 * stored anywhere.
 *
 * A payment still being confirmed changes nothing; neither does a link opened in another browser, nor a bag that
 * was edited since.
 */

async function sha256Hex(text: string): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(text),
    );
    return [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

export function PurchasedBag({
  state,
  attemptHash,
  items,
}: {
  state: OrderPageState;
  /** The SHA-256 of the attempt key that placed the order, or null. */
  attemptHash: string | null;
  items: readonly PurchasedItem[];
}) {
  const bag = useSyncExternalStore(
    bagStore.subscribe,
    bagStore.getSnapshot,
    bagStore.getServerSnapshot,
  );
  const [cleared, setCleared] = useState(false);
  const done = useRef(false);

  useEffect(() => {
    if (done.current || attemptHash === null || !bag.hydrated) return;
    const key = attemptKeys.storedKey();
    if (key === null) return;
    let left = false;
    void sha256Hex(key).then((storedKeyHash) => {
      if (left || done.current) return;
      // The bag is read again at the moment of the decision: it may have changed while the key was hashed.
      const now = bagStore.getSnapshot();
      const decision = purchasedBagDecision({
        state,
        storedKeyHash,
        orderAttemptHash: attemptHash,
        bag: now,
        items,
      });
      if (decision === "keep") return;
      done.current = true;
      if (decision === "clear") {
        bagStore.removeCodes(items.map((item) => item.variant_code));
        setCleared(true);
      }
      attemptKeys.dropStored(key);
    });
    return () => {
      left = true;
    };
  }, [attemptHash, bag.hydrated, items, state]);

  // A live region that is in the page from the start, so that the line is announced when it appears.
  return (
    <p className="flow-fine order-bag-note" role="status" aria-live="polite">
      {cleared ? ORDER_BAG.cleared : null}
    </p>
  );
}
