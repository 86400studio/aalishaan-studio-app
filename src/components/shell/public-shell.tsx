import type { ReactNode } from "react";

import { SKIP_LINK } from "@/content/public/shell";

import { OverlayProvider } from "./overlays";

/**
 * The public shell's markup — S1.3: the `.site` wrapper every storefront rule is scoped to, carrying the font
 * families as CSS variables (docs/DESIGN.md §2 "Fonts"), the skip link first in the DOM (§6), then the page,
 * then the overlays. The fonts come from the caller: `PublicSite` (the route group's layout, preloaded) or the
 * global 404 (`src/app/global-not-found.tsx` — plain declarations in `src/styles/not-found.css`, never preloaded).
 */
export function PublicShell({
  fontVariables,
  children,
}: {
  fontVariables: string;
  children: ReactNode;
}) {
  return (
    <div className={`site ${fontVariables}`}>
      <a className="skip-link" href="#main">
        {SKIP_LINK}
      </a>
      <OverlayProvider>{children}</OverlayProvider>
    </div>
  );
}
