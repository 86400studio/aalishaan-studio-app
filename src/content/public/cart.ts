/**
 * The bag's, the cart page's and the delivery check's strings — S1.5. Verbatim from the frozen prototype where it
 * has them: prototype/scripts/build-shop-flow.cjs:7–10 (the cart page `/cart`, its head, its summary and its PIN
 * form), prototype/scripts/build-products.cjs:25 (the artwork page's PIN form) and :168 (the artwork pages' static
 * drawer line "Checkout is not yet available." — rule 7, the honest disabled checkout), prototype/shared/bag.js:13–16
 * (the commerce rows, the cart labels and the empty bag), prototype/shared/delivery.js:21 (the PIN syntax error —
 * real validation copy) and prototype/shared/bag.js:15 with prototype/product/r3.js:126 (the memory-only disclosure
 * — rule 7, the behaviour is ported). Everything the prototype simulated — serviceability, zones, dates, "sample
 * coverage", the sample bag — is not ported; the PIN is a convenience selection and the form shows that the estimate
 * is pending. Strings with no approved source carry an NS-PROPOSED note for registration in
 * docs/content/new-strings.md.
 */

export const DELIVERY_CHECK = {
  /** prototype/scripts/build-shop-flow.cjs:9 — `#cart-delivery`. */
  cartLabel: "Can we deliver to you?",
  /** prototype/scripts/build-products.cjs:25 — `#delivery-check`. */
  productLabel: "Check delivery availability",
  placeholder: "6-digit PIN code",
  submit: "Check",
  /** prototype/shared/delivery.js:21 — locked-facts §6's rule, stated. */
  invalid: "Enter a six-digit Indian PIN code. It cannot start with 0.",
  /**
   * NS-PROPOSED (NS-08 lane: technical, D-24) — replaces the prototype's simulated serviceability and estimate
   * (prototype/shared/delivery.js:37–38). No date, zone or availability claim.
   */
  pending: (pin: string) =>
    `Delivery to ${pin} is not confirmed yet. Delivery availability and estimates will be shown before orders open.`,
} as const;

export const BAG_STORAGE_NOTICES = {
  /** prototype/shared/bag.js:15, prototype/product/r3.js:126 — rule 7. */
  memoryOnly:
    "Your selection is kept on this page only. Enable browser storage before continuing to checkout.",
  /** NS-PROPOSED (technical, D-24) — a stored bag that could not be read was cleared. */
  corruptCleared:
    "Your saved bag could not be read in this browser, so it was cleared. Choose your artworks again.",
} as const;

/** prototype/pages/cart/index.html `<head>` — build-shop-flow.cjs:10 (`shell('pages/cart/index.html', …)`). */
export const CART_HEAD = {
  title: "Your bag | Aalishaan Studio",
  description: "The artwork you love. The frame that makes it yours.",
} as const;

/** The cart page — prototype/pages/cart/index.html:30 (build-shop-flow.cjs:7–10) and bag.js:16. */
export const CART_PAGE = {
  heading: "Your bag",
  items: {
    heading: "Your artworks",
    explore: { label: "Keep exploring", href: "/shop" },
  },
  /**
   * bag.js:16 (`empty`): the heading and the link are the prototype's. Its line "Choose an artwork and frame, or
   * add a sample on the bag page to explore checkout." names the prototype-only sample bag, so the line is the
   * drawer's own runtime sentence instead (bag.js:15, "Your cart is empty. Choose an artwork and its frame finish to
   * add it here." — its second sentence, rule 7; registered for the owner's review with the S1.5 strings).
   */
  empty: {
    heading: "Your bag is empty.",
    body: "Choose an artwork and its frame finish to add it here.",
    action: { label: "Explore artworks", href: "/shop" },
  },
  summary: {
    eyebrow: "One step closer",
    heading: "Your selection",
    subtotal: "Artwork subtotal",
    delivery: "Delivery charge",
    deliveryValue: "To be confirmed",
    fine: "Delivery charges and tax treatment will be confirmed before live checkout opens.",
    guest: "Continue as a guest. No account needed.",
    /** build-shop-flow.cjs:7 (`help`). */
    helpBefore: "A question before you continue? ",
    help: { label: "Contact & Support →", href: "/contact" },
  },
  /**
   * NS-PROPOSED (technical, D-24) — the no-JavaScript line. The prototype's own line (prototype/pages/cart/
   * index.html:30, `<noscript>`) speaks of the prototype's interactive previews and is on the S1.3 record's list of
   * wording not ported (tests/unit/public-content.test.ts, "prototype-only wording"); the link and its destination
   * are the prototype's.
   */
  noscript: {
    before: "Your bag needs JavaScript. You can still ",
    link: { label: "browse the artworks", href: "/shop" },
    after: ".",
  },
} as const;

/** The bag rows of the drawer and the cart — prototype/shared/bag.js:13 (`commerceRows`). */
export const BAG_ROW = {
  /** locked-facts §5 ("Bag line format"): "A2 {Portrait|Landscape} · {Finish} frame". */
  spec: (orientation: string, finishName: string) =>
    `A2 ${orientation} · ${finishName} frame`,
  quantity: (quantity: number) => `Quantity ${quantity}`,
  each: (price: string) => `(${price} each)`,
  alt: (title: string, finishName: string) =>
    `${title} in a ${finishName} frame`,
  frame: "Frame",
  frameFor: (title: string) => `Frame for ${title}`,
  quantityLabel: "Quantity",
  quantityFor: (title: string) => `Quantity for ${title}`,
  remove: "Remove",
  removeFor: (title: string) => `Remove ${title}`,
} as const;

/**
 * The checkout control of the drawer and the cart (src/components/commerce/checkout-control.tsx — since S1.6 a
 * guarded link to the checkout where checkout is open, the disabled button everywhere else). The labels are the
 * prototype's links (bag.js:15, the drawer; build-shop-flow.cjs:10, the cart) and `unavailable` — the line of the
 * closed state — is the artwork pages' static drawer line (build-products.cjs:168 — rule 7, not new wording).
 */
export const CHECKOUT_CONTROL = {
  drawer: "Continue to checkout",
  cart: "Continue to checkout →",
  unavailable: "Checkout is not yet available.",
} as const;

/**
 * The honest states of the bag's validation (`POST /api/bag`) — none has a prototype source, which computed its
 * prices in the browser. NS-PROPOSED (technical, D-24), each one.
 */
export const BAG_STATUS = {
  /** NS-PROPOSED — while the bag's current selection is being checked against the catalogue. */
  pending: "Checking your bag…",
  /** NS-PROPOSED — the check failed (network, an unreadable catalogue, an answer that does not add up). */
  failed: "Your bag could not be checked right now. Your selections are kept.",
  /** NS-PROPOSED — asks for the same check again. */
  retry: "Try again",
  /** NS-PROPOSED — rows the catalogue no longer holds were removed (the retired-variant notice of new-strings.md §3). */
  removed: (count: number) =>
    count === 1
      ? "An artwork in your bag is no longer available and was removed."
      : `${count} artworks in your bag are no longer available and were removed.`,
  /** NS-PROPOSED — the cart's subtotal while the check is pending. */
  subtotalPending: "Checking…",
  /** NS-PROPOSED — the cart's subtotal when the check failed. */
  subtotalFailed: "Not available right now",
} as const;
