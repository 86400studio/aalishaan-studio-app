"use client";

import { useState } from "react";

import { CLEAR_CONTROL } from "@/content/public/policies";
import { CLEAR_PREVIEW, WISHLIST_KEY_PREFIX } from "@/content/public/strings";

/**
 * The Cookies page's clear control (prototype/pages/policies/cookies/index.html with
 * prototype/shared/pending.js, ported — never imported). At S1.3 the storefront writes only the wishlist
 * keys; the prototype's other keys (its bag, delivery check, order preview and frame keys) are cleared as well, as
 * pending.js clears them — defensively, nothing writes them. S1.5 and S1.6 choose their own storage and update
 * this control (and the Cookies copy at S3.1). The E10 waiting-list key is not among them (D-32j). Raises
 * `wishlistchange` so open hearts refresh.
 */
const LOCAL_KEYS = ["aalishaanProductBag", "aalishaanDeliveryCheck"];
const SESSION_KEYS = ["aalishaanOrderPreview"];
const SESSION_PREFIX = "aalishaan-frame-";

export function ClearPreviewControl() {
  const [status, setStatus] = useState("");
  const clear = () => {
    try {
      for (const key of Object.keys(localStorage))
        if (LOCAL_KEYS.includes(key) || key.startsWith(WISHLIST_KEY_PREFIX))
          localStorage.removeItem(key);
      for (const key of Object.keys(sessionStorage))
        if (SESSION_KEYS.includes(key) || key.startsWith(SESSION_PREFIX))
          sessionStorage.removeItem(key);
      window.dispatchEvent(new Event("wishlistchange"));
      setStatus(CLEAR_PREVIEW.cleared);
    } catch {
      setStatus(CLEAR_PREVIEW.unavailable);
    }
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
