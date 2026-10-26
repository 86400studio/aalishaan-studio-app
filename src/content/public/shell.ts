/**
 * The public shell's copy — verbatim from prototype/index.html (the header at lines 503–533, the footer at
 * 743–768 and the drawers at 773–808, copied by the builders into every page; docs/DESIGN.md §4). Routes are
 * the app routes of docs/TECH-ARCHITECTURE.md §3a; the catalogue and cart routes arrive with S1.4 / S1.5.
 */

export const BRAND = {
  name: "Aalishaan Studio",
  logoAlt: "Aalishaan Studio",
  homeLabel: "Aalishaan Studio — home",
  backToTopLabel: "Aalishaan Studio, back to top",
  /**
   * prototype/assets/brand/aalishaan-studio.png — 2172 × 724 (D-PRE-07). `srcSet`: its lossless WebP delivery
   * copies at 240 / 450 / 660 px (S1.3b, D-19 — `scripts/assets/encode-brand-logo.mjs`); the PNG stays `src`.
   */
  logo: {
    src: "/brand/aalishaan-studio.png",
    width: 2172,
    height: 724,
    srcSet:
      "/brand/aalishaan-studio-240.webp 240w, /brand/aalishaan-studio-450.webp 450w, /brand/aalishaan-studio-660.webp 660w",
  },
} as const;

export const SKIP_LINK = "Skip to main content";

export const PRIMARY_NAV = [
  { label: "Shop all", href: "/shop" },
  { label: "Collections", href: "/collections" },
  { label: "Art Styles", href: "/art-styles" },
  { label: "About us", href: "/about" },
] as const;

export const HEADER = {
  menuOpen: "Open menu",
  cartOpen: (count: number) => `Open cart, ${count} items`,
  trackOrder: "Track order",
  trackHref: "/track",
} as const;

export const MENU_DRAWER = {
  title: "Menu",
  close: "Close menu",
  items: [
    ...PRIMARY_NAV,
    { label: "Saved artworks", href: "/shop?saved=1#artworks" },
  ],
  footerAction: { label: "Track order", href: "/track" },
} as const;

export const CART_DRAWER = {
  title: "Your cart",
  close: "Close cart",
  empty: {
    heading: "Your cart is quiet.",
    body: "Choose an artwork, then pick its frame finish on the product page.",
    primary: { label: "Explore artworks", href: "/shop" },
    secondary: { label: "View cart page", href: "/cart" },
  },
  footerAction: { label: "Saved artworks", href: "/shop?saved=1#artworks" },
} as const;

/** The Home-only closing band (prototype/index.html:744–760). */
export const FOOTER_CTA = {
  eyebrow: "A practical way in",
  heading: "Find a piece that feels at home.",
  body: "Start with your room. Find a story, a colour or a little quiet you want to live with.",
  roomsLabel: "Shop by room",
  rooms: [
    { label: "Living room", href: "/shop?room=Living%20room" },
    { label: "Bedroom", href: "/shop?room=Bedroom" },
    { label: "Dining room", href: "/shop?room=Dining%20room" },
    { label: "Study & office", href: "/shop?room=Study" },
  ],
  primary: { label: "Explore all artworks", href: "/shop" },
  help: { label: "Need a hand choosing?", href: "/contact" },
  photoAlt: "A white-framed blossom artwork beside a bed in a warm, quiet room",
} as const;

export const FOOTER = {
  tagline: ["Art with a story.", "Made to order. Made to stay."],
  socialsLabel: "Social profiles",
  /** Five icons without destinations — owner-deferred (D-PRE-12, OI-13). */
  socials: ["Instagram", "Facebook", "Pinterest", "YouTube", "LinkedIn"],
  columns: [
    {
      heading: "Explore",
      links: [
        { label: "All artworks", href: "/shop" },
        { label: "Collections", href: "/collections" },
        { label: "Art styles", href: "/art-styles" },
        { label: "Our studio", href: "/about" },
      ],
    },
    {
      heading: "Here to help",
      links: [
        { label: "Track your order", href: "/track" },
        { label: "FAQs", href: "/help" },
        { label: "Contact & support", href: "/contact" },
        { label: "Shipping & delivery", href: "/policies/shipping" },
      ],
    },
    {
      heading: "Peace of mind",
      links: [
        { label: "Returns & replacements", href: "/policies/returns" },
        { label: "Cancellations", href: "/policies/cancellation" },
        { label: "Refunds", href: "/policies/refunds" },
      ],
    },
  ],
  /** The mobile-only Legal column (M5, D-PRE-06). */
  mobileLegal: {
    heading: "Legal",
    links: [
      { label: "Privacy", href: "/policies/privacy" },
      { label: "Terms", href: "/policies/terms" },
      { label: "Cookies", href: "/policies/cookies" },
    ],
  },
  newsletter: {
    heading: "Newsletter",
    body: "Subscribe to get updates on new collections, stories & exclusive offers.",
    placeholder: "Email address",
    inputLabel: "Newsletter email",
  },
  copyright: "© 2026 Aalishaan Studio. All rights reserved.",
  legalLabel: "Legal",
  legal: [
    { label: "Privacy", href: "/policies/privacy" },
    { label: "Terms", href: "/policies/terms" },
    { label: "Shipping", href: "/policies/shipping" },
    { label: "Cookies", href: "/policies/cookies" },
  ],
} as const;
