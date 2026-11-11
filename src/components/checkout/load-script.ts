/**
 * Loads a provider script once per page — S1.6. The checkout's two provider scripts (Cloudflare Turnstile and
 * Razorpay Checkout.js) are requested only by an open checkout page (./turnstile-widget.tsx, ./razorpay.ts): no
 * other page, and no closed checkout, asks for either. Every caller of one address shares one `<script>` and one
 * promise. A failed load removes its element and forgets the promise, so a later ask tries again; nothing is retried
 * on its own.
 */

const loads = new Map<string, Promise<void>>();

export function loadScriptOnce(src: string): Promise<void> {
  const known = loads.get(src);
  if (known) return known;
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
