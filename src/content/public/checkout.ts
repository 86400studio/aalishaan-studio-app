import type {
  CheckoutField,
  CheckoutPaymentMethod,
} from "@/lib/schemas/checkout";

/**
 * The checkout page's strings — S1.6 (docs/sprint-prompts/S1.6-checkout-pending-order.md §H.3). Verbatim from the
 * frozen prototype where it has them: prototype/pages/checkout/index.html:1 (the head) and :30–40 (the heading, the
 * guest line, the section titles, the field labels and placeholders, the payment choices, the summary, the policy
 * links, the craft line and the help link) and prototype/shared/commerce-r9.js:17–18 (the field messages, the
 * "check the highlighted details" status and the empty bag). Everything the prototype simulated is not ported: its
 * sample-details button and the design-preview line under the heading, the PIN-to-city lookup, the delivery line of
 * the PIN field, the E10 intake slot (D-32j), the sample-order button label and the second sentence of the summary's
 * fine print, the browser-side order preview, and its no-JavaScript wording. The payment-policy line with its
 * messaging link (NS-15) is not approved and is omitted. Strings with no approved source carry an NS-PROPOSED note
 * for registration in docs/content/new-strings.md.
 */

/** prototype/pages/checkout/index.html:1 — `<title>` and the description. */
export const CHECKOUT_HEAD = {
  title: "Checkout | Aalishaan Studio",
  description: "Your artwork, made for you.",
} as const;

/** The page — prototype/pages/checkout/index.html:30–40. */
export const CHECKOUT_PAGE = {
  heading: "Checkout",
  sub: "Guest checkout · Your artwork, made for you.",
  /** commerce-r9.js:18 and the page's `#checkout-empty` panel. */
  empty: {
    heading: "Your bag is empty.",
    action: { label: "Explore artworks", href: "/shop" },
  },
  contact: {
    heading: "Contact & delivery",
    fine: "India · All fields required unless marked optional.",
  },
  payment: {
    heading: "Payment",
    legend: "Choose payment method",
    /**
     * NS-PROPOSED (technical, D-24) — the choice is passed to the payment window as its starting selection only;
     * nothing on this page enforces it.
     */
    note: "You confirm the payment method in the Razorpay window. Your choice here only sets where it starts.",
  },
  summary: {
    heading: "Your order",
    editBag: { label: "Edit bag", href: "/cart" },
    subtotal: "Artwork subtotal",
    shipping: "Shipping",
    shippingValue: "To be confirmed",
    /** The first sentence of the prototype's fine print; its second sentence described the prototype's simulation. */
    fine: "Final shipping and tax details will appear before live payment.",
    terms: { label: "Terms", href: "/policies/terms" },
    policySeparator: " · ",
    returns: { label: "Returns & replacements", href: "/policies/returns" },
    craft: "Handcrafted frame · Ready to hang",
    help: { label: "Need help?", href: "/contact" },
  },
  /**
   * NS-PROPOSED (technical, D-24) — the no-JavaScript line, in the cart's structure (src/content/public/cart.ts
   * `CART_PAGE.noscript`); the link and its destination are the prototype's.
   */
  noscript: {
    before: "Checkout needs JavaScript. You can still ",
    link: { label: "browse the artworks", href: "/shop" },
    after: ".",
  },
} as const;

/** The form's fields, in the frozen page's order, with its labels and placeholders (index.html:31–39). */
export const CHECKOUT_FIELD_COPY: Readonly<
  Record<CheckoutField, { label: string; placeholder?: string }>
> = {
  name: { label: "Full name" },
  email: { label: "Email" },
  phone: { label: "Mobile number", placeholder: "10-digit mobile number" },
  pin: { label: "PIN code" },
  address: {
    label: "Address",
    placeholder: "House / flat number, building and street",
  },
  address2: { label: "Landmark (optional)" },
  city: { label: "City" },
  state: { label: "State / Union territory" },
};

/** The four payment choices (index.html:40), keyed by the wire value (src/lib/schemas/checkout.ts). */
export const CHECKOUT_PAYMENT_CHOICES: ReadonlyArray<{
  value: CheckoutPaymentMethod;
  title: string;
  note: string;
}> = [
  { value: "upi", title: "UPI", note: "Your preferred UPI app" },
  { value: "card", title: "Card", note: "Credit or debit card" },
  { value: "netbanking", title: "Net banking", note: "Pay through your bank" },
  { value: "wallet", title: "Wallet", note: "A supported wallet" },
];

/** The field messages and the form status — prototype/shared/commerce-r9.js:17. */
export const CHECKOUT_FIELD_MESSAGES = {
  email: "Enter a valid email address.",
  phone: "Enter a valid 10-digit Indian mobile number.",
  pin: "Enter a six-digit PIN code.",
  required: "Please complete this field.",
  /** NS-PROPOSED (technical, D-24) — an entry longer than the field can hold. */
  tooLong: "This entry is too long. Please shorten it.",
  /** commerce-r9.js:17 — the status line when any field is refused. */
  status: "Please check the highlighted details.",
} as const;

/**
 * NS-04 — NS-PROPOSED (technical, D-24): sales are not open on this deployment. Nothing can be ordered and no
 * provider is called; the action link is the prototype's "Explore artworks".
 */
export const CHECKOUT_CLOSED = {
  heading: "Orders are not open yet.",
  body: "Nothing can be ordered or paid for here at the moment. Your bag is kept in this browser.",
  action: { label: "Explore artworks", href: "/shop" },
} as const;

/**
 * The S1.6 test checkout's own wording — none has a prototype source. NS-PROPOSED (technical, D-24), each one.
 * Shown whenever checkout is open in S1.6: payment runs in Razorpay Test Mode on a synthetic business rule.
 */
export const CHECKOUT_TEST_MODE = {
  /** NS-PROPOSED — the disclosure under the heading. */
  disclosure:
    "Test checkout. Payment runs in Razorpay Test Mode: no real payment is taken, and no order is made or shipped.",
  /** NS-PROPOSED — the row under Shipping: the amount the test payment window will show. */
  totalLabel: "Test total",
  /** NS-PROPOSED — why the test total is the artwork subtotal alone. */
  totalNote:
    "The test total is the artwork subtotal. Shipping and tax are not included because they are not confirmed yet.",
} as const;

/** The pay button. NS-PROPOSED (technical, D-24), each one — the prototype's label named its simulated order. */
export const CHECKOUT_PAY = {
  /** NS-PROPOSED — starts the payment for the details on the page. */
  label: "Continue to payment →",
  /** NS-PROPOSED — while the order is being recorded and the payment started. */
  busy: "Starting payment…",
  /** NS-PROPOSED — opens the payment window again for the order that is already waiting. */
  resume: "Continue to payment",
} as const;

/**
 * The checkout's honest states. NS-PROPOSED (technical, D-24), each one. None says a payment was taken or an order
 * accepted: a browser cannot know either (S1.7 verifies payments on the server).
 */
export const CHECKOUT_NOTICES = {
  /** NS-PROPOSED — an item of the bag cannot be bought now (the cart drawer, the cart page and the checkout). */
  itemUnavailable:
    "An artwork in your bag is not available to order right now. Edit your bag to continue.",
  /** NS-PROPOSED — the server found an item or the total different from what the page showed; the bag is re-checked. */
  bagChanged:
    "Your bag or a price has changed since this page showed it. Your bag has been checked again. Please review your order, then continue.",
  /** NS-PROPOSED — the pay button was pressed before the security check produced a token. */
  challengeNeeded: "Please complete the security check, then try again.",
  /** NS-PROPOSED — the security check's script could not load. */
  challengeUnavailable:
    "The security check could not load, so payment cannot start. Reload the page to try again.",
  /** NS-PROPOSED — the server refused the security check's token. */
  challengeFailed:
    "The security check did not pass. Please complete it again, then try again.",
  /** NS-PROPOSED — too many attempts from this address. */
  throttled: "Too many attempts. Please wait a few minutes, then try again.",
  /** NS-PROPOSED — a control or the database could not be reached. */
  unavailable:
    "Checkout is temporarily unavailable. Nothing was charged. Please try again shortly.",
  /** NS-PROPOSED — the provider refused to start the payment for this order. */
  startFailed:
    "The payment could not be started. Nothing was charged. You can try again.",
  /** NS-PROPOSED — whether the provider started the payment is not known. */
  startUnknown:
    "We could not confirm whether the payment could be started. No payment window was opened and nothing was charged. You can try again.",
  /** NS-PROPOSED — a payment window exists for an order of this browser (after a reload, or on returning). */
  waiting: (orderNumber: string) =>
    `A payment window is waiting for order ${orderNumber}. If you have already paid, please do not pay again: the payment still has to be confirmed.`,
  /** NS-PROPOSED — the payment window was closed. */
  dismissed: (orderNumber: string) =>
    `The payment window for order ${orderNumber} was closed. Nothing has been confirmed. You can continue to payment when you are ready.`,
  /** NS-PROPOSED — Razorpay reported a failed payment; its own window offers the retry. */
  paymentFailed:
    "Razorpay reported that the payment did not go through. You can try again in the payment window. Nothing has been confirmed.",
  /**
   * NS-05 — NS-PROPOSED: Razorpay reported a completed payment to the browser. That report is not proof, so the
   * order stays pending.
   */
  unverified: (orderNumber: string) =>
    `Order ${orderNumber}: your payment is not confirmed yet. The order stays pending until the payment provider confirms it. Please do not pay again.`,
  /** NS-PROPOSED — the order is under review or no longer payable from this page. */
  held: {
    before:
      "This order cannot be paid for from this page. It may be under review. Please ",
    link: { label: "contact us", href: "/contact" },
    after: ".",
  },
  /** NS-PROPOSED — the order's payment window has passed. */
  expired:
    "The time to pay for this order has passed. To order, please start again.",
  /** NS-PROPOSED — Razorpay's checkout script could not load. */
  scriptUnavailable:
    "The payment window could not load, so payment cannot start. Check your connection and reload the page.",
} as const;
