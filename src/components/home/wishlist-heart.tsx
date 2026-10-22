"use client";

import { useEffect, useState } from "react";

import { useOverlays } from "@/components/shell/overlays";
import { WISHLIST, WISHLIST_KEY_PREFIX } from "@/content/public/strings";

/**
 * The art card's heart (prototype/index.html, the inline script at lines 956–976): a browser-local wishlist
 * under the prototype's own key `aalishaan-wishlist-<slug>` — the one storage S1.4's Saved artworks view
 * reads. Toggling writes the key, announces through the shared toast and raises `wishlistchange`; a
 * `storage` event from another tab refreshes the heart. A browser that refuses storage keeps the heart
 * unpressed and says so. Rendered unpressed on the server; the saved state is read after hydration.
 */
export function WishlistHeart({
  slug,
  title,
}: {
  slug: string;
  title: string;
}) {
  const { toast } = useOverlays();
  const key = `${WISHLIST_KEY_PREFIX}${slug}`;
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const refresh = () => {
      try {
        setSaved(localStorage.getItem(key) === "true");
      } catch {
        setSaved(false);
      }
    };
    refresh();
    window.addEventListener("wishlistchange", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("wishlistchange", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [key]);

  const toggle = () => {
    const next = !saved;
    try {
      localStorage.setItem(key, String(next));
    } catch {
      setSaved(false);
      toast(WISHLIST.unavailable);
      return;
    }
    setSaved(next);
    window.dispatchEvent(new Event("wishlistchange"));
    toast(next ? WISHLIST.saved : WISHLIST.removed);
  };

  return (
    <button
      className="wishlist"
      type="button"
      aria-label={saved ? WISHLIST.remove(title) : WISHLIST.save(title)}
      aria-pressed={saved}
      onClick={toggle}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z" />
      </svg>
    </button>
  );
}
