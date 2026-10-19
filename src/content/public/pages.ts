/**
 * About hub, About the Studio, Contact, Track and the recovery pages — verbatim from the generated prototype
 * pages and their build sources (docs/APPROVED-INPUTS.md §2 row 6): prototype/scripts/build-about-hub.cjs,
 * studio-content.cjs, build-pending.cjs (contact) and build-shop-flow.cjs (track, 404, 500). The studio
 * contact details are locked facts (docs/content/locked-facts.md §7).
 */

import { HELP_QUESTIONS } from "./help";
import { POLICIES, SHIPPING_INDEX_INTRO } from "./policies";

export const CONTACT_DETAILS = {
  email: "info@aalishaanstudio.com",
  phoneDisplay: "+91 9137624394",
  phoneHref: "tel:+919137624394",
} as const;

export const HELP_SEARCH = {
  label: "Search studio information and policies",
  placeholder: "Search for answers...",
  submit: "Search",
  action: "/about",
} as const;

// ---------- About hub ----------

export const ABOUT_HEAD = {
  title: "About Aalishaan Studio | Aalishaan Studio",
  description: "Get to know the studio. Find answers, policies and support.",
} as const;

export const ABOUT_HUB = {
  heading: "About Aalishaan Studio",
  intro: "Get to know the studio. Find answers, policies and support.",
  results: {
    heading: "Search results",
    status: (count: number) =>
      `${count} ${count === 1 ? "article" : "articles"} found`,
    noResultsBefore:
      "No matching articles. Try “frame”, “delivery” or “refund”, or ",
    noResultsLink: "contact support",
    noResultsAfter: ".",
  },
  categories: [
    {
      href: "/about/studio",
      heading: "About the studio",
      body: "Get to know the artwork and the objects we make.",
      meta: "Our studio",
      icon: ["M3 21h18M5 21V8l7-5 7 5v13M9 21v-7h6v7M9 9h6"],
    },
    {
      href: "/help",
      heading: "FAQs",
      body: "Useful answers about prints, frames, sizes and care.",
      meta: `${HELP_QUESTIONS.length} answers`,
      icon: ["M8 9a4 4 0 0 1 8 0c0 3-4 3-4 6M12 18h.01"],
      rect: { x: 3, y: 2, width: 18, height: 20, rx: 4 },
    },
    {
      href: "/policies/shipping",
      heading: "Shipping & delivery",
      body: "From making your print to receiving it at home.",
      meta: "Delivery information",
      icon: ["M3 5h11v12H3zM14 9h4l3 4v4h-7M4 17h2m4 0h6"],
      circles: [
        { cx: 8, cy: 18, r: 2 },
        { cx: 18, cy: 18, r: 2 },
      ],
    },
    {
      href: "/policies/cancellation",
      heading: "Cancellations, returns & refunds",
      body: "Find the right information when plans change.",
      meta: "Browse policies",
      icon: ["M8 4 3 9l5 5M3 9h11a7 7 0 0 1 0 14"],
      transform: "translate(0 -2)",
    },
    {
      href: "/policies/privacy",
      heading: "Privacy & terms",
      body: "Understand the website, your information and browser storage.",
      meta: "3 policies",
      icon: ["m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6"],
    },
    {
      href: "/contact",
      heading: "Contact & Support",
      body: "A little guidance, or help with your artwork.",
      meta: "Get in touch",
      icon: [
        "M4 14v-3a8 8 0 0 1 16 0v3M4 12H2v6h4v-6zM20 12h2v6h-4v-6zM20 18c0 3-4 3-8 3",
      ],
    },
  ],
} as const;

export type HelpIndexEntry = {
  href: string;
  title: string;
  line: string;
  /** The words the client-side search matches (build-about-hub.cjs `data-search`). */
  search: string;
};

/** The hub's search index — ten entries in the prototype's order, each over its page's text. */
export const HELP_INDEX: readonly HelpIndexEntry[] = [
  {
    href: "/about/studio",
    title: "About Aalishaan Studio",
    line: "Our artwork, archival prints and frames.",
    search: "About Aalishaan Studio Our artwork, archival prints and frames. ",
  },
  {
    href: "/help",
    title: "Frequently asked questions",
    line: "Materials, sizes, ordering and care.",
    search:
      "Frequently asked questions Materials, sizes, ordering and care. " +
      HELP_QUESTIONS.map((item) => `${item.topic} ${item.q} ${item.a}`).join(
        " ",
      ),
  },
  {
    href: "/contact",
    title: "Contact & Support",
    line: "Help choosing artwork or asking about an order.",
    search:
      "Contact & Support Help choosing artwork or asking about an order. ",
  },
  ...(
    [
      "shipping",
      "cancellation",
      "returns",
      "refunds",
      "privacy",
      "terms",
      "cookies",
    ] as const
  ).map((slug) => {
    const policy = POLICIES.find((p) => p.slug === slug)!;
    const line = policy.intro || SHIPPING_INDEX_INTRO;
    return {
      href: `/policies/${slug}`,
      title: policy.title,
      line,
      search: `${policy.title} ${line} ${policy.sections
        .map((section) => `${section.heading} ${section.body}`)
        .join(" ")}`,
    };
  }),
];

// ---------- About the Studio ----------

export const STUDIO_HEAD = {
  title: "About the Studio | Aalishaan Studio",
  description: "Bring beauty into everyday life.",
} as const;

export const STUDIO = {
  hero: {
    eyebrow: "About the Studio",
    heading: "Bring beauty into everyday life.",
    body: "The world is full of extraordinary beauty. We believe it deserves a permanent place in your home.",
    action: { label: "Meet the studio", href: "#our-story" },
  },
  navLabel: "Explore the studio",
  nav: [
    { label: "Our Story", href: "#our-story" },
    { label: "Our Artworks", href: "#our-artworks" },
    { label: "Our Printing Process", href: "#our-printing" },
    { label: "Our Frames", href: "#our-frames" },
    { label: "Our Papers", href: "#our-papers" },
    { label: "Our Mission & Vision", href: "#our-purpose" },
  ],
  sections: [
    {
      id: "our-story",
      image: { key: "card-2-collection", size: "1600" },
      alt: "Artwork from the Aalishaan Studio collections",
      eyebrow: "Our Story",
      heading: "Some things deserve a second look.",
      paragraphs: [
        "A branch after rain. A window catching the light. A harbour that feels like somewhere you have dreamed of.",
        "Aalishaan Studio begins with moments like these. We curate artwork for the feeling it brings into a room—and the quiet pleasure of seeing it again tomorrow.",
      ],
    },
    {
      id: "our-artworks",
      reverse: true,
      image: { key: "card-3-artstyle", size: "1200" },
      alt: "A selection of visual traditions and art styles",
      eyebrow: "Our Artworks",
      heading: "Find the one that feels like you.",
      paragraphs: [
        "Some walls ask for stillness. Others, a little adventure. Our collections move between landscapes, blossoms and imagined worlds, each with a story of its own.",
        "We shape and curate our artwork using digital tools under professional creative direction. Each piece becomes an A2 archival print, made for the frame you choose.",
      ],
      link: { label: "Explore the artworks →", href: "/shop" },
    },
    {
      id: "our-printing",
      image: { key: "gen-04-print-closeup", size: "1254" },
      alt: "Close detail of a fine-art print",
      eyebrow: "Our Printing Process",
      heading: "From a feeling to a fine-art print.",
      paragraphs: [
        "The image is only the beginning. Giclée printing brings its colour, fine lines and subtle transitions onto paper with care.",
        "Our process uses 12-colour archival pigment inks on fine-art paper. Each artwork is printed and framed to order, ready for its place in your home.",
      ],
      facts: ["Giclée printing", "12-colour pigment inks", "Made to order"],
    },
    {
      id: "our-frames",
      reverse: true,
      image: { key: "gen-01-craft-detail-gold-frame", size: "1254" },
      alt: "Carved wood and antique gold frame detail",
      eyebrow: "Our Frames",
      heading: "A frame that belongs to the story.",
      paragraphs: [
        "The right frame gives an artwork presence. Ornately carved solid wood brings depth and detail, with a finish that changes how the piece feels.",
        "Choose Antique Gold for warmth, Black for definition or White for a softer presence. Acrylic glazing and fitted hanging hardware complete the piece.",
      ],
      facts: ["Antique Gold", "Black", "White"],
    },
    {
      id: "our-papers",
      image: { key: "gen-02-paper-closeup", size: "1254" },
      alt: "The texture of fine-art paper",
      eyebrow: "Our Papers",
      heading: "Beauty you can see. Character you can feel.",
      paragraphs: [
        "Paper is part of the artwork. Its surface holds the colour, catches the light and lends the image a quiet depth.",
        "We use Hahnemühle Museum Etching 350 gsm: natural-white cotton paper with a fine matt texture. A considered foundation for every A2 print.",
      ],
    },
  ],
  purpose: {
    id: "our-purpose",
    eyebrow: "Our Mission and Vision",
    heading: "More beauty in the everyday.",
    columns: [
      {
        heading: "Our mission",
        body: "To bring thoughtfully curated artwork into everyday spaces—pieces that catch your eye, stir a feeling and make a room your own.",
      },
      {
        heading: "Our vision",
        body: "Homes where art is part of living. Something you return to, connect with and enjoy, day after day.",
      },
    ],
    action: { label: "Find your artwork", href: "/shop" },
  },
} as const;

// ---------- Contact ----------

export const CONTACT_HEAD = {
  title: "Contact & Support | Aalishaan Studio",
  description: "",
} as const;

export const CONTACT = {
  breadcrumb: { about: "About", current: "Contact & Support" },
  heading: "Contact & Support",
  fields: {
    name: "Name",
    email: "Email",
    topic: "What can we help with?",
    topics: [
      "Choosing an artwork",
      "Gifting",
      "Order question",
      "Damage or replacement",
      "Privacy question",
    ],
    message: "Your message",
    messagePlaceholder: "Tell us what you have in mind.",
  },
  before: {
    heading: "Before you write",
    points: [
      "For artwork advice, include its name and your preferred frame finish.",
      "For an order question, include your order reference.",
      "Describe the issue or the help you need.",
      "For damage, keep photographs of the piece and packaging ready.",
    ],
  },
  quick: {
    heading: "Find a quick answer",
    action: { label: "Read the FAQs", href: "/help" },
    body: "Sizes, materials, frame finishes and care, all in one place.",
  },
} as const;

// ---------- Track ----------

export const TRACK_HEAD = {
  title: "Track your artwork | Aalishaan Studio",
  description: "From our studio to your wall. Follow every step.",
} as const;

export type TrackMode = "order" | "awb" | "mobile";

export const TRACK = {
  heading: "Track your artwork",
  tabsLabel: "Find order by",
  tabs: [
    { mode: "order", label: "Order ID" },
    { mode: "awb", label: "AWB" },
    { mode: "mobile", label: "Mobile number" },
  ] as ReadonlyArray<{ mode: TrackMode; label: string }>,
  /** The hint the page loads with (prototype/scripts/build-shop-flow.cjs:14, `#track-hint`), until a tab is chosen. */
  initialHint:
    "Find your order ID in your confirmation email. Your AWB is available once a courier is assigned.",
  /**
   * prototype/shared/commerce-r9.js `modes`: the field label, the placeholder and the hint per tab, written on
   * every tab choice (the placeholders and the mobile hint per NS-03: the sample values are dropped — D-09).
   */
  modes: {
    order: {
      label: "Order reference",
      placeholder: "Order reference",
      hint: "Find your order ID in your confirmation email.",
    },
    awb: {
      label: "Airway Bill number (AWB)",
      placeholder: "Airway Bill number (AWB)",
      hint: "A courier assigns an AWB when your shipment is booked. It is not available during printing or framing.",
    },
    mobile: {
      label: "Mobile number",
      placeholder: "10-digit mobile number",
      hint: "Live tracking by phone will require verification.",
    },
  } as Record<TrackMode, { label: string; placeholder: string; hint: string }>,
  submit: "Track artwork →",
  helpBefore: "A question before you continue? ",
  helpLink: { label: "Contact & Support →", href: "/contact" },
  result: {
    intro:
      "Enter your reference to see the current stage, what happens next and where to find help.",
    from: "Studio",
    to: "Your home",
  },
} as const;

// ---------- Recovery ----------

export const RECOVERY = {
  "404": {
    title: "404 — Page not found | Aalishaan Studio",
    description: "Find your way back to the artwork.",
    eyebrow: "404 · Page not found",
    heading: "A little off the beaten path.",
    body: "This page may have moved, but there is still plenty of beauty to discover.",
    helpBefore: "Looking for something specific? ",
  },
  "500": {
    title: "500 — Something went wrong | Aalishaan Studio",
    description: "Find your way back to the artwork.",
    eyebrow: "500 · A temporary interruption",
    heading: "Let’s try that again.",
    body: "Something interrupted this page. Return home and try opening it again.",
    helpBefore: "Still having trouble? ",
  },
  artAlt: "A framed blossom artwork",
  primary: { label: "Return home", href: "/" },
  secondary: { label: "Explore artworks", href: "/shop" },
  helpLink: { label: "Contact & Support →", href: "/contact" },
} as const;
