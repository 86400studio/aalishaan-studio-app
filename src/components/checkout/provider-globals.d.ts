/**
 * The two provider scripts' globals, as far as the checkout uses them — S1.6. Types only; the scripts themselves are
 * loaded by ./load-script.ts on an open checkout page and nowhere else.
 *
 * - Cloudflare Turnstile (`https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit`) defines
 *   `window.turnstile`.
 * - Razorpay Checkout.js (`https://checkout.razorpay.com/v1/checkout.js`) defines `window.Razorpay`.
 */

export type TurnstileRenderOptions = {
  sitekey: string;
  action?: string;
  size?: "normal" | "flexible" | "compact";
  callback?: (token: string) => void;
  "expired-callback"?: () => void;
  "error-callback"?: (code?: string) => boolean | void;
};

export type TurnstileApi = {
  /** Renders a widget into the container; returns its id (undefined when it could not render). */
  render: (
    container: HTMLElement,
    options: TurnstileRenderOptions,
  ) => string | null | undefined;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
};

export type RazorpayPrefill = {
  name?: string;
  email?: string;
  contact?: string;
  method?: string;
};

export type RazorpayCheckoutOptions = {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefill?: RazorpayPrefill;
  /** The provider passes its payment id and signature here; the checkout takes no argument, so both are discarded. */
  handler: () => void;
  modal?: { ondismiss?: () => void };
};

export type RazorpayCheckoutInstance = {
  open: () => void;
  on: (event: "payment.failed", listener: () => void) => void;
};

export type RazorpayCheckoutConstructor = new (
  options: RazorpayCheckoutOptions,
) => RazorpayCheckoutInstance;

declare global {
  interface Window {
    turnstile?: TurnstileApi;
    Razorpay?: RazorpayCheckoutConstructor;
  }
}
