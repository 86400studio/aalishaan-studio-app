"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Rendered by the global 404 only (`src/app/global-not-found.tsx`). The framework serves that page with a
 * document of its own, which has no slot for another page: a client navigation away from it — any link of the
 * shell or of the recovery — changes the address and the title but leaves the 404 drawn, because Next forces a
 * full page load only for a navigation *to* the global 404 (16.3.7: `next/dist/client/components/router-reducer/
 * ppr-navigations.js`; 16.4.2: `next/dist/client/components/render-tree.js` — the same check and TODO, re-verified
 * by S1.3b). So once the path changes, the new address is loaded as a document. A link to another miss is a full
 * load already; a hash link keeps the path.
 *
 * S1.5 (docs/PROJECT-STATUS.md §10 #26 (c)): the destination opens where a link between public pages opens it — at
 * its `#fragment` when it has one (the drawers' "Saved artworks" is `/shop?saved=1#artworks`), at its top
 * otherwise. A reload cannot do that: it restores the scroll position the browser kept for the history entry
 * (the router's pushed entry, drawn as the 404) instead of scrolling to the fragment. And the address cannot simply
 * be assigned again: by now the router has pushed the destination, so the document's address *is* the
 * destination, and assigning a URL that differs from it only by its fragment is a same-document fragment
 * navigation — nothing loads. So the pushed entry's address is first set back to the 404's own (`replaceState`,
 * the router's state kept), and the destination then replaces that entry as a new document load
 * (`location.replace`): a new load restores no scroll position, scrolls to the fragment if there is one, and the
 * history keeps one entry for the destination, as with the reload. (`history.scrollRestoration = "manual"` before
 * a reload would also reach the fragment, but that mode is kept by the entry and copied to every entry the
 * destination pushes later, so Back / Forward would stop restoring scroll for the rest of the visit.)
 *
 * When the 404's address is unknown, or equals the destination but for the fragment (neither happens: the path
 * changed), the reload of S1.3 stays the fallback, scrolled to the top first.
 */
export function ReloadOnPathChange() {
  const pathname = usePathname();
  const shown = useRef(pathname);
  const origin = useRef<string | null>(null);

  useEffect(() => {
    origin.current = window.location.href;
  }, []);

  useEffect(() => {
    if (pathname === shown.current) return;
    const destination = window.location.href;
    if (loadPlan(origin.current, destination) === "replace") {
      window.history.replaceState(window.history.state, "", origin.current);
      window.location.replace(destination);
      return;
    }
    window.scrollTo({ top: 0, behavior: "instant" });
    window.location.reload();
  }, [pathname]);
  return null;
}

/**
 * How the destination is loaded: `replace` (the 404's address restored, then the destination loaded anew) when the
 * 404's address is known and differs from the destination by more than the fragment; otherwise `reload`.
 */
export function loadPlan(
  origin: string | null,
  destination: string,
): "replace" | "reload" {
  if (origin === null) return "reload";
  const withoutFragment = (href: string) => href.split("#")[0];
  return withoutFragment(origin) === withoutFragment(destination)
    ? "reload"
    : "replace";
}
