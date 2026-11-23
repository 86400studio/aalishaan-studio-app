/**
 * The order page's strings — S1.7 (docs/sprint-prompts/S1.7-razorpay-verification.md §H.3 "Order page"; route
 * `/order/[token]`, D-09). The frozen page is prototype/pages/order/demo/index.html (built by
 * prototype/scripts/build-shop-flow.cjs:13; its receipt by prototype/shared/commerce-r9.js:24–36; neither is
 * imported).
 *
 * What S1.7 takes from it, verbatim: the confirmed state's heading and line, the order's labels ("Order: ", "Date: ",
 * "Artwork subtotal", "Shipping & tax" / "To be confirmed", "Amount paid") and the help line. The panel's heading is
 * the checkout summary's ("Your order", prototype/pages/checkout/index.html:40).
 *
 * What it leaves for the sprints that make it true: the receipt printer and paper, "Your order receipt", the thanks
 * line and the contact lines, "Download receipt (PDF)" and "Print / Save PDF" (S1.8 — the receipt and its PDF); the
 * journey section, whose first step promises an email (S1.8 — the confirmation email); "Track your artwork →"
 * (S1.9 — until then `/track` looks nothing up). Never ported: the sample order and its wording, the browser-stored
 * preview, the page's no-JavaScript line.
 *
 * The frozen page has one state — a sample success. The page's other states, its title and its status lines have no
 * approved source: each carries an NS-PROPOSED note for docs/content/new-strings.md (NS-05's S1.7 half, NS-06 and
 * NS-43–NS-46; honest technical states, D-24). None says a payment was taken or an order confirmed unless the
 * database holds a verified captured payment for it.
 */

/**
 * NS-43 — NS-PROPOSED (technical, D-24): the title and description, true in every state. The frozen title names the
 * prototype's sample page and its description is the success line; "Your order" is the checkout summary's heading.
 * The page is a private link: it is never indexed and its address is in no metadata.
 */
export const ORDER_HEAD = {
  title: "Your order | Aalishaan Studio",
  description: "Your order with Aalishaan Studio.",
} as const;

/** The order's panel — approved prototype copy (see the header). */
export const ORDER_PANEL = {
  /** prototype/pages/checkout/index.html:40 — the summary's heading. */
  heading: "Your order",
  /** prototype/shared/commerce-r9.js:29 — the receipt's "Order: " and "Date: ". */
  order: "Order: ",
  date: "Date: ",
  /** commerce-r9.js:29 — the totals. */
  subtotal: "Artwork subtotal",
  shippingAndTax: "Shipping & tax",
  toBeConfirmed: "To be confirmed",
  /** commerce-r9.js:29 — shown only for a confirmed order that is not a test order: the verified captured amount. */
  amountPaid: "Amount paid",
} as const;

/** prototype/scripts/build-shop-flow.cjs:7 — the help line under the page. */
export const ORDER_HELP = {
  before: "A question before you continue? ",
  link: { label: "Contact & Support →", href: "/contact" },
} as const;

/**
 * The confirmed state — prototype/pages/order/demo/index.html:30 (heading and line, approved copy). `status` is the
 * page's own sentence for the fact: NS-06 — NS-PROPOSED (technical, D-24); shown only when the database holds a
 * verified captured payment for the order.
 */
export const ORDER_CONFIRMED = {
  heading: "A beautiful choice.",
  line: "Made with care. Soon, part of your home.",
  status: (orderNumber: string) => `Order ${orderNumber} is confirmed.`,
} as const;

/**
 * The confirming state. NS-PROPOSED (technical, D-24), each one — NS-05's S1.7 half (`payment`: a payment is known
 * and not yet confirmed) and NS-44 (`review`: the order is being checked). Neither offers a payment; neither says
 * a payment was received. Voice: NS-05's S1.6 half ("… your payment is not confirmed yet. The order stays pending
 * until the payment provider confirms it. Please do not pay again.").
 */
export const ORDER_CONFIRMING = {
  payment: {
    heading: "Your payment is being confirmed.",
    status: (orderNumber: string) =>
      `Order ${orderNumber} stays pending until the payment provider confirms your payment. This page updates when it does. Please do not pay again.`,
  },
  review: {
    heading: "Your payment is being checked.",
    status: (orderNumber: string) =>
      `Order ${orderNumber} is not confirmed yet: its payment has to be checked first. Please do not pay again. If you have a question, please contact us.`,
  },
  /** NS-45 — NS-PROPOSED: after the page has asked for a while and nothing has changed. */
  stillWaiting:
    "This is taking longer than usual. You do not need to pay again or keep this page open. Open it again later to see where your order stands.",
  /** NS-45 — NS-PROPOSED: without JavaScript the page cannot ask again by itself. */
  noscript:
    "This page updates by itself only with JavaScript. Reload it to see where your order stands.",
} as const;

/**
 * The failed state — NS-06. NS-PROPOSED (technical, D-24), each one. `retry` is the recoverable state: no payment
 * for the order is known and its time to pay has not passed. `closed`: that time has passed (its heading is NS-38's
 * own sentence, prototype voice). Neither says that nothing was charged — the page cannot know that.
 */
export const ORDER_FAILED = {
  retry: {
    heading: "This order has not been paid for.",
    status: (orderNumber: string) =>
      `No payment for order ${orderNumber} has been confirmed. You can return to checkout to try again.`,
    action: { label: "Return to checkout", href: "/checkout" },
  },
  closed: {
    heading: "The time to pay for this order has passed.",
    status: (orderNumber: string) =>
      `Order ${orderNumber} was not paid for in time. To order, please start again.`,
    /** The approved "Explore artworks" (prototype/shared/commerce-r9.js:18). */
    action: { label: "Explore artworks", href: "/shop" },
  },
} as const;

/**
 * NS-46 — NS-PROPOSED (technical, D-24): the bag still held exactly the artworks of this confirmed order, in the
 * browser that placed it, and they were taken out of it.
 */
export const ORDER_BAG = {
  cleared: "The artworks of this order have been taken out of your bag.",
} as const;

/**
 * NS-47 — NS-PROPOSED (technical, D-24): a test order's own disclosure, in every state of its page. The checkout's
 * line (NS-09: "… no order is made or shipped.") is the checkout's; under "Order {AS} is confirmed." it would deny the
 * very order the page has just named, so the order's page says what a test order is in the same voice.
 */
export const ORDER_TEST = {
  disclosure:
    "Test order. Payment runs in Razorpay Test Mode: no real payment is taken, and nothing is made or shipped.",
} as const;
