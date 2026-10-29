import { WISHLIST_KEY_PREFIX } from "@/content/public/strings";

/**
 * Saved artworks, read for the Saved view (`?saved=1`) — S1.4. The hearts write them (src/components/home/
 * wishlist-heart.tsx: the prototype's browser-local key `aalishaan-wishlist-<slug>` holding "true" or "false", then a
 * `wishlistchange` event; another tab's change arrives as `storage`). Nothing leaves the browser and no customer
 * account exists (D-PRE-03). Only the slugs a page shows are read, so a key left behind by an artwork that is no
 * longer public is ignored and can never make it render. A browser that refuses storage is reported as such,
 * never read as "nothing saved".
 */

export type SavedArtworks =
  { ok: true; saved: ReadonlySet<string> } | { ok: false };

export function savedArtworkKey(slug: string): string {
  return `${WISHLIST_KEY_PREFIX}${slug}`;
}

/** Which of the given slugs are saved; `ok: false` when there is no storage or reading it throws. */
export function readSavedArtworks(
  storage: Pick<Storage, "getItem"> | null,
  slugs: readonly string[],
): SavedArtworks {
  if (storage === null) return { ok: false };
  const saved = new Set<string>();
  try {
    for (const slug of slugs)
      if (storage.getItem(savedArtworkKey(slug)) === "true") saved.add(slug);
  } catch {
    return { ok: false };
  }
  return { ok: true, saved };
}

/** `window.localStorage`, or null where there is no window or the property itself throws (storage blocked). */
export function browserLocalStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
