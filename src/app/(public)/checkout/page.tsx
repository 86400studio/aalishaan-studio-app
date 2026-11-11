import type { Metadata } from "next";

import { Checkout } from "@/components/checkout/checkout-form";
import { PublicPage } from "@/components/shell/public-page";
import { CHECKOUT_HEAD, CHECKOUT_PAGE } from "@/content/public/checkout";
import {
  checkoutPageConfig,
  type CheckoutPageConfig,
} from "@/lib/server/checkout/gate";
import "@/styles/commerce.css";
import "@/styles/checkout.css";

/**
 * Checkout — S1.6 (docs/TECH-ARCHITECTURE.md §3a `/checkout`; prototype/pages/checkout/index.html:30–40;
 * docs/sprint-prompts/S1.6-checkout-pending-order.md §H.3). A static page: it reads no catalogue and does no I/O —
 * the sales gate's page projection (src/lib/server/checkout/gate.ts `checkoutPageConfig`) reads configuration only,
 * and hands the page one boolean and, when open, the public Turnstile site key. A gate that cannot be read is
 * closed. The body is client state from the shell's one bag (src/components/checkout/checkout-form.tsx).
 *
 * The page's answer is a convenience: both server actions (./actions.ts) check the gate themselves before anything
 * else, so a page rendered open on a deployment that has since closed can start nothing.
 *
 * Not ported: everything the prototype simulated — its sample-details button and design-preview line, the
 * PIN-to-city lookup, the delivery line, the E10 intake slot (D-32j), the sample-order label, the browser-side order
 * preview — and its no-JavaScript wording; the payment-policy line (NS-15) is not approved. Without JavaScript the
 * bag cannot be read and nothing can be sent, so — as the frozen page does (its `<noscript>` style) and as
 * docs/DESIGN.md's no-JS fallbacks ask ("checkout/track forms hidden behind a readable message") — the form is
 * hidden and the no-JavaScript line is what the page says; the pay button is rendered disabled as well.
 */
export const metadata: Metadata = {
  title: CHECKOUT_HEAD.title,
  description: CHECKOUT_HEAD.description,
};

// prototype/pages/checkout/index.html's `<noscript>` style, for the one element this page has of its list (the
// stepped checkout and the sample button are not ported).
const NO_SCRIPT_CSS = "#checkout-form{display:none}";

function pageConfig(): CheckoutPageConfig {
  try {
    return checkoutPageConfig();
  } catch {
    return { open: false };
  }
}

export default function CheckoutPage() {
  const config = pageConfig();
  const { noscript } = CHECKOUT_PAGE;
  return (
    <PublicPage variant="commerce">
      {config.open ? (
        <Checkout open turnstileSiteKey={config.turnstileSiteKey} />
      ) : (
        <Checkout open={false} />
      )}
      <noscript>
        <style>{NO_SCRIPT_CSS}</style>
        <p>
          {noscript.before}
          {/* a plain link: without JavaScript there is no client navigation */}
          <a href={noscript.link.href}>{noscript.link.label}</a>
          {noscript.after}
        </p>
      </noscript>
    </PublicPage>
  );
}
