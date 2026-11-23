/**
 * Loads a provider script once per page — S1.6. The checkout's two provider scripts (Cloudflare Turnstile and
 * Razorpay Checkout.js) are requested only by an open checkout page (./turnstile-widget.tsx, ./razorpay.ts): no
 * other page, and no closed checkout, asks for either. Every caller of one address shares one `<script>` and one
 * promise. A failed load removes its element and forgets the promise, so a later ask tries again; nothing is retried
 * on its own.
 */

const loads = new Map<string, Promise<void>>();

/** S1.7 — an address on this site whose path is an order's private page: what the order link (D-09) looks like. */
export function isOrderLinkAddress(address: string): boolean {
  try {
    return new URL(address).pathname.startsWith("/order/");
  } catch {
    return false;
  }
}

/**
 * S1.7 — true when this document was opened at an order's private address. The order page's own links are full page
 * loads; the shell's are client navigations, so a customer can reach the checkout from an order page inside the same
 * document, whose navigation and resource records still hold that address — the token. A provider's script never
 * runs in such a document.
 */
function openedAtOrderLink(): boolean {
  try {
    const [navigation] = performance.getEntriesByType("navigation");
    return navigation !== undefined && isOrderLinkAddress(navigation.name);
  } catch {
    return false;
  }
}

export function loadScriptOnce(src: string): Promise<void> {
  const known = loads.get(src);
  if (known) return known;
  if (typeof document !== "undefined" && openedAtOrderLink()) {
    // The page loads itself again from its own address first; the fresh document asks for the script.
    window.location.reload();
    return new Promise<void>(() => {});
  }
  const load = new Promise<void>((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("no document"));
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener(
      "error",
      () => {
        script.remove();
        loads.delete(src);
        reject(new Error("the script could not load"));
      },
      { once: true },
    );
    document.head.append(script);
  });
  loads.set(src, load);
  return load;
}
