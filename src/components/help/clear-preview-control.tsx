"use client";

import { useState } from "react";

import { ATTEMPT_STORAGE_KEY } from "@/components/checkout/storage-key";
import { formMemory } from "@/components/checkout/form-memory";
import { CLEAR_CONTROL } from "@/content/public/policies";
import { CLEAR_PREVIEW, WISHLIST_KEY_PREFIX } from "@/content/public/strings";
import { bagStore, clearDeliveryPin, clearFinishSelections } from "@/lib/bag";

/**
 * The Cookies page's clear control (prototype/pages/policies/cookies/index.html with prototype/shared/pending.js:11,
 * ported — never imported).
 *
 * - S1.5: the bag, the delivery PIN and the finishes chosen on artwork pages are cleared through the bag's one API
 *   (src/lib/bag/) — never by removing their keys here: `bagStore.clear()` empties the bag in memory and in storage,
 *   which notifies every consumer (the header badge, the drawer, the cart page — and `bagchange` on the window) and,
 *   the bag being empty, aborts a validation request in flight, so a late answer cannot bring a row back;
 *   `clearDeliveryPin()` forgets the PIN and tells the page's PIN forms (`deliverycheck`); `clearFinishSelections()`
 *   forgets every artwork's chosen finish. The memory side clears even when storage refuses.
 * - The wishlist keys (`aalishaan-wishlist-*`) are removed here as at S1.3, and `wishlistchange` is still raised so
 *   open hearts and the Saved view refresh; the prototype's order-preview key is cleared defensively (nothing writes
 *   it; S3.1 updates the Cookies copy). Every other key — the Admin's, the E10 waiting list's (D-32j), anything
 *   unrelated — is left alone.
 * - S1.6: the checkout's one stored value — the random attempt key in `sessionStorage`
 *   (src/components/checkout/storage-key.ts; no personal data) — is removed with the session keys, so a reload no
 *   longer asks about that attempt; and what was typed into the checkout form, which lives in memory only
 *   (src/components/checkout/form-memory.ts), is forgotten. An order that is already waiting for its payment in this
 *   page session keeps holding the checkout: clearing stored selections is not what ends an order.
 * - The status is the prototype's "cleared" line only when every part was removed from storage; otherwise its
 *   "Storage is unavailable" line — including a bag kept in memory because storage refused it, whose stored copy
 *   this page could not remove.
 */
const SESSION_KEYS = ["aalishaanOrderPreview", ATTEMPT_STORAGE_KEY];

export function ClearPreviewControl() {
  const [status, setStatus] = useState("");
  const clear = () => {
    bagStore.clear();
    const bagCleared = bagStore.getSnapshot().persistence === "local";
    const pinCleared = clearDeliveryPin();
    const finishesCleared = clearFinishSelections();
    formMemory.clear();
    let othersCleared = false;
    try {
      for (const key of Object.keys(localStorage))
        if (key.startsWith(WISHLIST_KEY_PREFIX)) localStorage.removeItem(key);
      for (const key of Object.keys(sessionStorage))
        if (SESSION_KEYS.includes(key)) sessionStorage.removeItem(key);
      othersCleared = true;
    } catch {
      othersCleared = false;
    }
    window.dispatchEvent(new Event("wishlistchange"));
    setStatus(
      bagCleared && pinCleared && finishesCleared && othersCleared
        ? CLEAR_PREVIEW.cleared
        : CLEAR_PREVIEW.unavailable,
    );
  };
  return (
    <>
      <button
        className="button button--secondary"
        id="clear-preview"
        type="button"
        onClick={clear}
      >
        {CLEAR_CONTROL.label}
      </button>
      <p id="clear-status" role="status">
        {status}
      </p>
    </>
  );
}
