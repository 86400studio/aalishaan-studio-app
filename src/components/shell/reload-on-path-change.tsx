"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Rendered by the global 404 only (`src/app/global-not-found.tsx`). The framework serves that page with a
 * document of its own, which has no slot for another page: a client navigation away from it — any link of the
 * shell or of the recovery — changes the address and the title but leaves the 404 drawn, because Next forces a
 * full page load only for a navigation *to* the global 404 (16.3.7: `next/dist/client/components/router-reducer/
 * ppr-navigations.js`; 16.4.2: `next/dist/client/components/render-tree.js` — the same check and TODO, re-verified
 * by S1.3b). So once the path changes,
 * the new address is loaded as a document. A reload restores the scroll position of the entry the router just
 * pushed — the 404's — so the page is scrolled to its top first, and the destination opens at its top, as a link
 * between public pages does (a destination's `#fragment` is not scrolled to). A link to another miss is a full
 * load already; a hash link keeps the path.
 */
export function ReloadOnPathChange() {
  const pathname = usePathname();
  const shown = useRef(pathname);
  useEffect(() => {
    if (pathname === shown.current) return;
    window.scrollTo({ top: 0, behavior: "instant" });
    window.location.reload();
  }, [pathname]);
  return null;
}
