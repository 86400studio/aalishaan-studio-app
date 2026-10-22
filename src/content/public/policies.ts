/**
 * The seven policy pages — verbatim from prototype/scripts/build-pending.cjs (`policies`) as rendered in
 * prototype/pages/policies/<slug>/index.html, carrying the prototype's "terms pending" copy until S3.1
 * (D-PRE-13; docs/PROJECT-STATUS.md §10 #6). The E10 waiting-list sentences of the privacy and cookies pages
 * are NS-15 and are omitted; the cookies "Clear your preview" sentence is rendered as E8 — the S1.1 seed's
 * carve-out (scripts/testing/lib/catalogue.mjs `POLICY_CARVE_OUTS`), checked against the pinned E8 commit at
 * S1.1 and again at the S1.3 pick-up; the unit suite holds these pages equal to the seeded policy text.
 */

export type PolicySlug =
  | "cancellation"
  | "cookies"
  | "privacy"
  | "refunds"
  | "returns"
  | "shipping"
  | "terms";

export const POLICY_SLUGS: readonly PolicySlug[] = [
  "cancellation",
  "cookies",
  "privacy",
  "refunds",
  "returns",
  "shipping",
  "terms",
];

export type PolicyTabGroup = "remedies" | "legal";

export type Policy = {
  slug: PolicySlug;
  /** The page's h1 and the document title's first half. */
  title: string;
  /** The hub's search-index title where it differs from the page title (the privacy page). */
  indexTitle?: string;
  intro: string;
  tabs: PolicyTabGroup | null;
  previewNote: boolean;
  sections: ReadonlyArray<{ heading: string; body: string }>;
  related: ReadonlyArray<{ title: string; href: string }>;
};

export const POLICY_META_LINE =
  "Aalishaan Studio · Policy preview · 9 September 2026";
export const POLICY_PREVIEW_NOTE =
  "Commercial terms are not yet effective. Details will be confirmed before orders open.";

export const POLICY_TAB_GROUPS: Record<
  PolicyTabGroup,
  { label: string; tabs: ReadonlyArray<{ slug: PolicySlug; label: string }> }
> = {
  remedies: {
    label: "Cancellations, returns & refunds",
    tabs: [
      { slug: "cancellation", label: "Cancellation Policy" },
      { slug: "returns", label: "Returns & Replacements Policy" },
      { slug: "refunds", label: "Refund Policy" },
    ],
  },
  legal: {
    label: "Privacy & terms",
    tabs: [
      { slug: "privacy", label: "Privacy Policy" },
      { slug: "terms", label: "Terms & Conditions" },
      { slug: "cookies", label: "Cookie Policy" },
    ],
  },
};

export const POLICY_ASSISTANCE = {
  heading: "Have a question about this policy?",
  action: { label: "Contact us", href: "/contact" },
} as const;

const CONTACT_RELATED = { title: "Contact & Support", href: "/contact" };

export const POLICIES: readonly Policy[] = [
  {
    slug: "cancellation",
    title: "Cancellation Policy",
    intro: "A clear place to understand changes to an order.",
    tabs: "remedies",
    previewNote: true,
    sections: [
      {
        heading: "Requesting a change",
        body: "Request a correction as early as possible. The available request channels will be published before orders open.",
      },
      {
        heading: "Eligibility and production",
        body: "Cancellation eligibility, production cut-offs and any fees are still being finalised. Made-to-order status alone does not define these terms.",
      },
      {
        heading: "What happens next",
        body: "The final policy will explain how a request is confirmed and how any eligible refund is handled.",
      },
    ],
    related: [
      { title: "Returns & Replacements Policy", href: "/policies/returns" },
      { title: "Refund Policy", href: "/policies/refunds" },
      CONTACT_RELATED,
    ],
  },
  {
    slug: "cookies",
    title: "Cookie Policy",
    intro: "Simple controls for this preview.",
    tabs: "legal",
    previewNote: true,
    sections: [
      {
        heading: "What is remembered",
        body: "The prototype uses browser storage for the bag, wishlist, the PIN code you check for delivery and a session order preview. These let you revisit your selection while exploring the site.",
      },
      {
        heading: "Optional services",
        body: "This revision adds no analytics, advertising or payment service. No pretend consent switches are needed to use the preview.",
      },
      {
        heading: "Clear your preview",
        body: "Clear the saved bag, wishlist and order preview using the control below. Your browser also provides storage controls.",
      },
    ],
    related: [
      { title: "Privacy Policy", href: "/policies/privacy" },
      { title: "Terms & Conditions", href: "/policies/terms" },
      CONTACT_RELATED,
    ],
  },
  {
    slug: "privacy",
    title: "Privacy Policy",
    intro: "How this preview handles information.",
    tabs: "legal",
    previewNote: true,
    sections: [
      {
        heading: "Scope",
        body: "This page describes the current visual prototype. The live store’s seller identity, privacy contact and full data practices will be published before launch.",
      },
      {
        heading: "Forms and payments",
        body: "Contact and checkout do not send information. Use sample details only. Address and contact fields are not saved by the preview. No payment information is requested.",
      },
      {
        heading: "Browser storage",
        body: "Your selected artworks, wishlist and the PIN code you check for delivery can be remembered in this browser. The order preview is stored for the browser session and contains artwork selections, a payment-method label and that PIN code, not personal details.",
      },
      {
        heading: "Your controls",
        body: "You can clear this preview’s saved selections on the Cookies page or through your browser settings.",
      },
      {
        heading: "Future policy",
        body: "Live providers, retention periods and a privacy-request route have not been confirmed. This page does not describe an operating customer database.",
      },
    ],
    related: [
      { title: "Terms & Conditions", href: "/policies/terms" },
      { title: "Cookie Policy", href: "/policies/cookies" },
      CONTACT_RELATED,
    ],
  },
  {
    slug: "refunds",
    title: "Refund Policy",
    intro: "Understanding an eligible refund.",
    tabs: "remedies",
    previewNote: true,
    sections: [
      {
        heading: "When this applies",
        body: "Refund eligibility will be defined alongside the cancellation and returns policies before orders open.",
      },
      {
        heading: "Amounts and method",
        body: "The treatment of partial refunds, delivery charges and refund methods is still being finalised.",
      },
      {
        heading: "Timing",
        body: "Initiation and payment-provider processing are separate stages. Neither timeline is confirmed yet.",
      },
      {
        heading: "Payment questions",
        body: "A failed or reversed payment is different from a voluntary refund. This prototype does not take payments.",
      },
    ],
    related: [
      { title: "Cancellation Policy", href: "/policies/cancellation" },
      { title: "Returns & Replacements Policy", href: "/policies/returns" },
      CONTACT_RELATED,
    ],
  },
  {
    slug: "returns",
    title: "Returns & Replacements Policy",
    intro: "Help when something is not as expected.",
    tabs: "remedies",
    previewNote: true,
    sections: [
      {
        heading: "An issue with your artwork",
        body: "Damage, the wrong artwork or a material defect are useful details to describe in a support enquiry.",
      },
      {
        heading: "Photographs and packaging",
        body: "Keep photographs of the artwork and its packaging. Tell support if the packaging is too damaged to reuse. Evidence requirements will be confirmed before orders open.",
      },
      {
        heading: "Review and resolution",
        body: "Eligibility, reporting periods, collection arrangements, costs and replacement or refund conditions are being finalised.",
      },
      {
        heading: "Colour and care",
        body: "Screens and lighting can make colours appear different. Keep prints away from direct sunlight and moisture.",
      },
    ],
    related: [
      { title: "Cancellation Policy", href: "/policies/cancellation" },
      { title: "Refund Policy", href: "/policies/refunds" },
      CONTACT_RELATED,
    ],
  },
  {
    slug: "shipping",
    title: "Shipping & Delivery Policy",
    intro: "",
    tabs: null,
    previewNote: false,
    sections: [
      {
        heading: "Where we deliver",
        body: "Our delivery scope is India. You can check a PIN code on any artwork page for a sample serviceability result and delivery estimate. Specific serviceable locations and courier coverage will be confirmed before orders open.",
      },
      {
        heading: "Production and delivery",
        body: "Each piece is printed and framed after ordering. Production, dispatch and transit estimates are still being finalised.",
      },
      {
        heading: "Charges and address changes",
        body: "Delivery charges and the address-correction process will be shown before ordering becomes available.",
      },
      {
        heading: "Receiving your artwork",
        body: "Keep photographs of the packaging and artwork if something arrives damaged. Reporting and resolution conditions will be published before orders open.",
      },
    ],
    related: [
      { title: "Returns & Replacements Policy", href: "/policies/returns" },
      { title: "Cancellation Policy", href: "/policies/cancellation" },
      CONTACT_RELATED,
    ],
  },
  {
    slug: "terms",
    title: "Terms & Conditions",
    intro: "What you are exploring and what you would receive.",
    tabs: "legal",
    previewNote: true,
    sections: [
      {
        heading: "This preview",
        body: "This site is a visual demonstration. Adding to a bag or viewing confirmation does not create an order or a payment.",
      },
      {
        heading: "The artwork",
        body: "You receive an archival giclée reproduction, not an original painting. Marks, textures and metallic effects are reproduced in print.",
      },
      {
        heading: "Size, frame and price",
        body: "A2 prints come in White, Black or Antique Gold frames. Published artwork prices are ₹19,000, ₹21,000 and ₹23,000 respectively. Outer dimensions, delivery charges and tax treatment will be confirmed before ordering.",
      },
      {
        heading: "Orders and policies",
        body: "Order acceptance, cancellation, returns and refund terms are not yet final. Read the corresponding pages for their current status.",
      },
      {
        heading: "Seller information",
        body: "The seller’s legal identity, contact details and final commercial terms will be provided before live orders open.",
      },
    ],
    related: [
      { title: "Privacy Policy", href: "/policies/privacy" },
      { title: "Cookie Policy", href: "/policies/cookies" },
      CONTACT_RELATED,
    ],
  },
];

export function policyBySlug(slug: string): Policy | undefined {
  return POLICIES.find((policy) => policy.slug === slug);
}

/** The Cookies page's clear control (prototype/pages/policies/cookies/index.html). */
export const CLEAR_CONTROL = {
  label: "Clear saved preview data",
} as const;

/** The shipping page's search-index intro (the hub lists it with this line although the page's intro is empty). */
export const SHIPPING_INDEX_INTRO = "Made to order. Delivered across India.";
