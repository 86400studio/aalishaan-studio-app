/**
 * Help — the Wall Art FAQs, verbatim from prototype/scripts/build-pending.cjs (`questions`) as rendered in
 * prototype/pages/help/index.html. The two E10 entries under "Ordering" ("Can I pay cash on delivery?",
 * "What happens if ordering is paused?") are NS-15 — commercial wording the owner has not approved — and are
 * omitted until then (docs/ROADMAP.md S1.3); the eleven E8 questions remain.
 */

export const HELP_HEAD = {
  title: "Frequently asked questions | Aalishaan Studio",
  description: "Useful answers about your artwork, frame and what comes next.",
} as const;

export const HELP_PAGE = {
  breadcrumb: { about: "About", current: "Frequently asked questions" },
  heading: "Frequently asked questions",
  intro: "Useful answers about your artwork, frame and what comes next.",
  searchLabel: "Search questions",
  searchPlaceholder: "Try frame, size or delivery",
  topicLabel: "Topic",
  allTopics: "All topics",
  reset: "Reset",
  status: (count: number) => `${count} answers`,
  empty: "No matching answers. Try another word or reset the filters.",
  related: {
    heading: "Still need a hand?",
    rows: [
      {
        title: "Contact & Support",
        line: "Tell us about your artwork or your question.",
        href: "/contact",
      },
      {
        title: "Track your order",
        line: "Follow your artwork from our studio to your door.",
        href: "/track",
      },
      {
        title: "About Aalishaan Studio",
        line: "Our artwork, archival prints and frames.",
        href: "/about/studio",
      },
      {
        title: "Shipping & Delivery Policy",
        line: "Made to order. Delivered across India.",
        href: "/policies/shipping",
      },
      {
        title: "Cancellation Policy",
        line: "A clear place to understand changes to an order.",
        href: "/policies/cancellation",
      },
      {
        title: "Returns & Replacements Policy",
        line: "Help when something is not as expected.",
        href: "/policies/returns",
      },
      {
        title: "Refund Policy",
        line: "Understanding an eligible refund.",
        href: "/policies/refunds",
      },
      {
        title: "Privacy Policy",
        line: "How this preview handles information.",
        href: "/policies/privacy",
      },
      {
        title: "Terms & Conditions",
        line: "What you are exploring and what you would receive.",
        href: "/policies/terms",
      },
      {
        title: "Cookie Policy",
        line: "Simple controls for this preview.",
        href: "/policies/cookies",
      },
    ],
  },
} as const;

export const HELP_TOPICS = [
  "Artwork & print",
  "Size & frame",
  "Ordering",
  "Delivery & care",
  "Support",
] as const;
export type HelpTopic = (typeof HELP_TOPICS)[number];

export type HelpQuestion = { topic: HelpTopic; q: string; a: string };

export const HELP_QUESTIONS: readonly HelpQuestion[] = [
  {
    topic: "Artwork & print",
    q: "What exactly am I buying?",
    a: "A made-to-order, framed A2 archival giclée print, not an original painting. The textures and metallic effects you see in the artwork are reproduced in print.",
  },
  {
    topic: "Artwork & print",
    q: "What paper and inks do you use?",
    a: "Hahnemühle Museum Etching 350 gsm paper and 12-colour pigment inks.",
  },
  {
    topic: "Size & frame",
    q: "What size is A2?",
    a: "Portrait prints measure 42 × 59.4 cm; landscape prints measure 59.4 × 42 cm. These are print dimensions. Outer frame dimensions will be confirmed before ordering.",
  },
  {
    topic: "Size & frame",
    q: "Which frames can I choose?",
    a: "White ₹19,000, Black ₹21,000 or Antique Gold ₹23,000. Each is ornately carved solid wood with acrylic glazing and fitted hanging hardware.",
  },
  {
    topic: "Ordering",
    q: "How many artworks are available?",
    a: "Explore 22 artworks, three collections and eleven art styles. Choose a frame on the artwork page, then add it to your bag.",
  },
  {
    topic: "Ordering",
    q: "Can I place an order here?",
    a: "This is a visual preview. You can explore a sample checkout, but no order is placed and no payment is collected.",
  },
  {
    topic: "Delivery & care",
    q: "Where do you deliver?",
    a: "Delivery is planned across India. Enter your PIN code on any artwork page, in your bag or at checkout to see a sample serviceability check and delivery estimate. Shipping charges, final serviceable locations and production and delivery estimates will be confirmed before orders open.",
  },
  {
    topic: "Delivery & care",
    q: "How do I care for my print?",
    a: "Hang away from direct sunlight and moisture. Use a soft, dry cloth on the frame; never spray cleaning products directly onto the glazing.",
  },
  {
    topic: "Support",
    q: "What if my artwork arrives damaged?",
    a: "Keep photographs of the artwork and packaging. Full reporting, replacement and return conditions will be confirmed before orders open.",
  },
  {
    topic: "Support",
    q: "Can I cancel or request a refund?",
    a: "Eligibility, cut-offs and refund timings are still being finalised. See the policy pages for the current status.",
  },
  {
    topic: "Support",
    q: "Are gifting options available?",
    a: "Gift notes, special packaging and delivery to a recipient are not yet confirmed. You can preview a gifting enquiry on the Contact page.",
  },
];
