import type { ReactNode } from "react";

import { BagProvider } from "@/components/commerce/bag-provider";
import { CheckoutAvailabilityProvider } from "@/components/commerce/checkout-availability";
import { SKIP_LINK } from "@/content/public/shell";
import { checkoutPageConfig } from "@/lib/server/checkout/gate";

import { OverlayProvider } from "./overlays";

/**
 * The public shell's markup — S1.3: the `.site` wrapper every storefront rule is scoped to, carrying the font
 * families as CSS variables (docs/DESIGN.md §2 "Fonts"), the skip link first in the DOM (§6), then the page,
 * then the overlays. The fonts come from the caller: `PublicSite` (the route group's layout, preloaded) or the
 * global 404 (`src/app/global-not-found.tsx` — plain declarations in `src/styles/not-found.css`, never preloaded).
 * S1.5: the bag (src/components/commerce/bag-provider.tsx) wraps the overlays, so the pages, the cart drawer, the
 * header badge and the global 404 share the one bag and its one validation.
 * S1.6: whether checkout is open on this deployment — one boolean, decided here on the server from configuration
 * alone (src/lib/server/checkout/gate.ts; no network, no secret leaves the server) — is handed to the checkout
 * control of the drawer and the cart (src/components/commerce/checkout-availability.tsx). A gate that cannot be read
 * is closed.
 */
function checkoutOpen(): boolean {
  try {
    return checkoutPageConfig().open;
  } catch {
    return false;
  }
}

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
      <CheckoutAvailabilityProvider open={checkoutOpen()}>
        <BagProvider>
          <OverlayProvider>{children}</OverlayProvider>
        </BagProvider>
      </CheckoutAvailabilityProvider>
    </div>
  );
}
