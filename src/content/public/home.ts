/**
 * Home — verbatim from prototype/index.html (lines 536–740: the hero, the materials, the routes, the featured
 * artworks, the journey and the FAQ; docs/APPROVED-INPUTS.md §2 row 6). The featured cards carry the Home
 * page's own copy and the bucket object paths of the S1.1 contract; S1.4 replaces this module's featured
 * list with the `public_catalogue` read. Prices are the launch prices (docs/content/locked-facts.md §2).
 */

export const HOME_HEAD = {
  title: "Aalishaan Studio | Museum-Grade Giclée Wall Art",
  description:
    "Museum-grade artworks produced through giclée technology. Made to order on Hahnemühle Museum Etching 350 gsm, finished in hand-carved wood frames, delivered across India.",
} as const;

export const HERO = {
  roomAlt:
    "A white carved frame above a white console in a light, minimal interior",
  artworkAlt: "Red blossoms above a closed window in an ornate white frame",
  artworkCaption: "Red blossoms above a closed window",
  heading: "Bring beauty into everyday life.",
  lead: "The world is full of extraordinary beauty. We believe it deserves a permanent place in your home.",
  primary: { label: "Explore Artworks", href: "/shop" },
  secondary: { label: "About Us", href: "/about" },
  promiseLabel: "The Aalishaan promise",
} as const;

/** The three promises; the icons are the prototype's inline SVG paths. */
export const PROMISES = [
  {
    title: "Museum-grade artworks",
    line: "Produced through giclée technology",
    icon: "m3 8 9-5 9 5M4 9h16M6 10v8m6-8v8m6-8v8M3 21h18M4 18h16",
  },
  {
    title: "Made to order",
    line: "Created especially for your home",
    icon: "m12 3 9 5-9 5-9-5 9-5Zm-9 5v9l9 5 9-5V8M12 13v9M7.5 5.5l9 5",
  },
  {
    title: "Delivered across India",
    line: "From our studio to your door",
    icon: "M3 6h11v11H3zM14 10h4l3 4v3h-7M3 10H1M3 13H1",
    extra: [
      { cx: 6, cy: 18, r: 2 },
      { cx: 18, cy: 18, r: 2 },
    ],
  },
] as const;

export const MATERIALS = {
  eyebrow: "The object on your wall",
  heading: "Museum Grade Artworks",
  craftLabel: "Artwork craftsmanship",
} as const;

/** The six specification rows (locked-facts §5 "Home specification strip"); left column then right. */
export const SPECS = [
  {
    image: "gen-01-craft-detail-gold-frame",
    alt: "Close-up of the carved gold wood frame",
    title: "Hand-carved wood frame",
    line: "Solid wood, ornately carved. Antique gold, black or white.",
  },
  {
    image: "gen-03-acrylic-glazing",
    alt: "Clear acrylic glazing protecting the artwork",
    title: "Protective glazing",
    line: "Clear acrylic glazing over the print.",
  },
  {
    image: "gen-03-back-of-frame-and-hanging-system",
    alt: "Back of the frame and its hanging hardware",
    title: "Hanging specification",
    line: "Hanging hardware fitted to the back of the frame.",
  },
  {
    image: "gen-02-paper-closeup",
    alt: "Close-up of Museum Etching paper texture",
    title: "Hahnemühle Museum Etching",
    line: "350 gsm natural-white cotton rag with a fine matt tooth.",
  },
  {
    image: "gen-04-print-closeup",
    alt: "Fine pigment print detail",
    title: "12-colour pigment giclée",
    line: "Archival pigment inks. Rich colour and finely held detail.",
  },
  {
    image: "size-comparison-a2",
    alt: "A2 portrait and landscape orientations, 42 by 59.4 centimetres",
    title: "A2 artwork, made to order",
    line: "42 × 59.4 cm. Printed and framed after you order.",
    sizeLink: "View A2 size comparison in a new tab",
  },
] as const;

export const ROUTES = {
  heading: "Ways to shop Aalishaan Studio",
  dotsLabel: "Shopping routes",
  cards: [
    {
      image: "card-1-shop-all",
      alt: "A selection of framed artworks from the studio",
      title: "Shop All",
      body: "Explore all our artwork at one central place and choose from a huge variety that fits your need.",
      action: { label: "Shop all artworks", href: "/shop" },
    },
    {
      image: "card-2-collection",
      alt: "Artworks curated into collections",
      title: "Shop by Collections",
      body: "Explore different collections built around different perspectives of exploring our beautiful world.",
      action: { label: "Browse collections", href: "/collections" },
    },
    {
      image: "card-3-artstyle",
      alt: "A selection of distinctive art styles",
      title: "Shop by Art Styles",
      body: "Explore creative unique art styles curated in our Aalishaan Studio to bring ideas and stories to life.",
      action: { label: "Browse art styles", href: "/art-styles" },
    },
  ],
} as const;

/** Launch prices in paise (locked-facts §2) and the finish labels (§3). */
export const FINISHES = {
  white: { label: "White", pricePaise: 1_900_000 },
  black: { label: "Black", pricePaise: 2_100_000 },
  "antique-gold": { label: "Antique Gold", pricePaise: 2_300_000 },
} as const;
export type FinishCode = keyof typeof FINISHES;

export const FEATURED = {
  eyebrow: "Featured artworks",
  heading: "Our best sellers.",
  body: "A short, honest list — the pieces people keep coming back to. More join this wall as orders build.",
  label: "Museum Grade Giclée Artwork",
  view: "View Artwork",
  action: { label: "Shop all Artworks", href: "/shop" },
  cards: [
    {
      slug: "the-ship-between-two-storms",
      title: "The Ship Between Two Storms",
      hook: "Two storms divide, and the ship takes the quiet water between them.",
      finish: "black",
      alt: "The Ship Between Two Storms in a black frame",
    },
    {
      slug: "the-pine-that-holds-the-moon",
      title: "The Pine That Holds the Moon",
      hook: "An old pine holds the moon between two branches.",
      finish: "antique-gold",
      alt: "The Pine That Holds the Moon in a antique gold frame",
    },
    {
      slug: "the-bridge-under-falling-blossom",
      title: "The Bridge Under Falling Blossom",
      hook: "The blossom falls; one folded cape waits on the bridge.",
      finish: "white",
      alt: "The Bridge Under Falling Blossom in a white frame",
    },
  ] as ReadonlyArray<{
    slug: string;
    title: string;
    hook: string;
    finish: FinishCode;
    alt: string;
  }>,
} as const;

export const JOURNEY = {
  heading: "What happens after you press buy.",
  note: "Every piece is made with care, so timing can vary slightly by artwork, frame, and delivery location.",
  steps: [
    {
      index: "STEP 01",
      title: "We confirm your order",
      body: "You will receive an email with your order details.",
      icon: ["m4.5 12.5 5 5 10-11"],
    },
    {
      index: "STEP 02",
      title: "We prepare your artwork",
      body: "Your selected piece is prepared for printing, framing, and finishing.",
      icon: ["M7 8h10M7 12h6", "M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"],
    },
    {
      index: "STEP 03",
      title: "We frame it carefully",
      body: "Each artwork is framed by hand and checked for finish and fit.",
      rects: [
        { x: 3.5, y: 4.5, width: 17, height: 15, rx: 1 },
        { x: 7, y: 8, width: 10, height: 8 },
      ],
    },
    {
      index: "STEP 04",
      title: "We inspect everything",
      body: "We review the print, frame, and overall presentation before packing.",
      icon: ["m15 15 4.5 4.5M8 10.5h5"],
      circles: [{ cx: 10.5, cy: 10.5, r: 6 }],
    },
    {
      index: "STEP 05",
      title: "We pack it securely",
      body: "Your artwork is protected so it travels safely.",
      icon: [
        "M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4z",
        "M3.5 7.5 12 11.5l8.5-4M12 11.5v9",
      ],
    },
    {
      index: "STEP 06",
      title: "It arrives at your home",
      body: "Your piece is delivered ready to style and enjoy.",
      icon: ["M3.5 20.5V10L12 3.5l8.5 6.5v10.5z", "M9.5 20.5v-6h5v6"],
    },
  ],
} as const;

/** The five "Before you buy" answers (prototype/data/before-you-buy.json; locked-facts §5). */
export const HOME_FAQ = {
  eyebrow: "Before you buy",
  heading: "Questions we’d ask too.",
  body: "Simple answers about the artwork, framing and delivery.",
  action: { label: "Ask us something else →", href: "/contact" },
  items: [
    {
      q: "What am I buying?",
      a: "A museum-grade giclée print, framed and ready to hang. Each piece is made to order for your home.",
    },
    {
      q: "What does museum-grade mean?",
      a: "Our prints use 12-colour pigment inks on Hahnemühle Museum Etching 350 gsm cotton paper. Museum-grade describes these materials and the printing process; it is not a certification.",
    },
    {
      q: "What size is available?",
      a: "Every artwork is available at A2: 42 × 59.4 cm, or 59.4 × 42 cm in landscape. These are print dimensions; the frame adds a border. Outer frame dimensions will be confirmed before ordering.",
    },
    {
      q: "Which frame finishes can I choose?",
      a: "White, Black and Antique Gold. Each is handcrafted solid wood with acrylic glazing and fitted hanging hardware. Choose your preferred finish on the artwork page.",
    },
    {
      q: "How long does delivery take?",
      a: "Each piece is printed and framed after you order, then delivered across India. Check your PIN code for a sample estimate. Confirmed production times, delivery estimates and charges will be shown before live orders open.",
    },
  ],
} as const;

/** Rupees with the Indian grouping and the ₹ symbol, from integer paise (locked-facts §2). */
export function formatRupees(pricePaise: number): string {
  if (!Number.isInteger(pricePaise) || pricePaise % 100 !== 0)
    throw new Error("a launch price is a whole-rupee amount in paise");
  return `₹${new Intl.NumberFormat("en-IN").format(pricePaise / 100)}`;
}
