import type { FinishCode } from "@/lib/schemas/catalogue";
import type { SiteImageKey } from "@/lib/site-images";

/**
 * The approved copy and editorial content of the S1.5 artwork pages — the 22 `/artworks/<slug>` pages and `/product`,
 * the Lantern's compatibility entry (docs/TECH-ARCHITECTURE.md §3a). Sources: the frozen generated pages
 * (prototype/pages/artworks/<slug>/index.html, prototype/product/index.html) and their generator
 * prototype/scripts/build-products.cjs — the final R5 / R12 layout of its lines 131–166, never the intermediate R3
 * page of its lines 69–129 —, prototype/data/before-you-buy.json for FAQs 1–5, and, where a behaviour is ported, the
 * runtime strings of prototype/product/r3.js and prototype/shared/delivery.js (docs/content/new-strings.md rule 7).
 *
 * Everything about an artwork — whether it is public, its title, hook, description, collection, style, rooms, moods,
 * palettes, palette names, suggested frame, variants, prices, availability, alt texts and SEO title / description —
 * comes from the `public_catalogue` projection (src/lib/server/catalogue.ts) through src/lib/catalogue/product-model.ts.
 * What this file holds is what the projection does not (the S1.5 record → H.2 "Editorial content not in the
 * projection"): the routes' identities, the section copy, the seven FAQs, the palette colours, the size-guide sheet
 * rule, the Lantern's extra pictures and one hook override. It is no second catalogue: no title, price or
 * availability of any artwork is here.
 */

export type ArtworkRoute = { slug: string };

/**
 * The 22 approved artwork routes — identities only (H.2 "Entries"): prototype/site-manifest.json's `/artworks/<slug>`
 * aliases, in its order. `generateStaticParams` lists them (`dynamicParams = false`, so any other slug is the global
 * 404), and the revalidation inventory derives its artwork paths from them, so a retired artwork's page is refreshed
 * too. Whether each one is public, and everything it shows, comes from the projection.
 */
export const ARTWORK_ROUTES: readonly ArtworkRoute[] = [
  { slug: "the-bridge-of-blue-stone" },
  { slug: "the-moon-between-two-peaks" },
  { slug: "the-pine-that-holds-the-moon" },
  { slug: "willow-after-rain" },
  { slug: "bamboo-after-the-storm" },
  { slug: "the-cup-beneath-the-plum" },
  { slug: "the-blossom-over-the-closed-window" },
  { slug: "the-first-warm-wall" },
  { slug: "the-branch-above-dark-water" },
  { slug: "the-window-after-midnight" },
  { slug: "the-teahouse-shutters-at-spring-dawn" },
  { slug: "the-bridge-under-falling-blossom" },
  { slug: "the-harbour-chain-opens" },
  { slug: "the-galley-beyond-the-breakwater" },
  { slug: "the-lantern-that-outlasted-the-gale" },
  { slug: "the-ship-between-two-storms" },
  { slug: "the-last-mooring-in-the-mist" },
  { slug: "the-ship-behind-the-fog-bell" },
  { slug: "the-shipyard-at-low-tide" },
  { slug: "the-clipper-in-a-grain-wind" },
  { slug: "the-copper-citadel-at-the-sea-gate" },
  { slug: "the-palace-above-the-dry-dock" },
];

/**
 * `/product` — prototype/product/index.html, the Lantern's page served at a second route (build-products.cjs:55: the
 * only product with a `master`), byte-identical to its artwork page apart from the relative prefix; its canonical
 * link is the Lantern's artwork URL (site-manifest.json `"/product"`).
 */
export const LANTERN = {
  slug: "the-lantern-that-outlasted-the-gale",
  compatibilityPath: "/product",
  canonicalPath: "/artworks/the-lantern-that-outlasted-the-gale",
} as const;

/**
 * The hero hook the page shows where it is not the projection's `hook` (build-products.cjs:137 — the R5 pass replaces
 * it for this artwork only; its related cards elsewhere and its story lead keep the stored hook).
 */
export const HOOK_OVERRIDES: Readonly<Record<string, string>> = {
  "the-blossom-over-the-closed-window":
    "A quiet study of scarlet blossom against an aged architectural surface.",
};

/** The hero — build-products.cjs:71–73, :137–150 (the R5 purchase layout). */
export const PRODUCT_HERO = {
  sectionLabel: "Artwork and purchase options",
  stageLabel: "Enlarge this view",
  zoomHint: "Enlarge",
  thumbsLabel: "Artwork views",
  frameLegend: "Frame",
  recommendation: (finishName: string) => `Recommended Frame: ${finishName}`,
  addToCart: "Add to cart",
  /**
   * The prototype's hidden link to its demo checkout, unhidden by r3.js:125 after an add. Inventoried, not rendered:
   * no checkout exists before S1.6 (H.2 "Checkout handoff").
   */
  continueCheckout: "Continue to Checkout",
  reassurance: "Framed and ready to hang · Delivered across India",
  /** R12's section nav (build-products.cjs:148) — curly apostrophes. */
  sectionNav: {
    label: "Explore this artwork",
    links: [
      { label: "Size guide", href: "#in-your-space" },
      { label: "What you’ll receive", href: "#what-you-receive" },
      { label: "The artwork’s story", href: "#artwork-story" },
      { label: "FAQs", href: "#pd-help" },
    ],
  },
} as const;

/** The stage's box per orientation — build-products.cjs:72–73 (`--stage-ratio`, the stage image's width × height). */
export const STAGE = {
  Portrait: { ratio: "1", width: 1200, height: 1200 },
  Landscape: { ratio: "4/3", width: 1200, height: 900 },
} as const;

export type ProductViewKey =
  "framed" | "closeup" | "paper" | "artwork" | "room" | "scale";

/**
 * The gallery's views — their thumbnail labels (build-products.cjs:63–66) and, for the stage and the lightbox, the
 * alt texts and captions r3.js:16–25 gives each (`room` is the artwork's first room, lower-cased). In this order;
 * `artwork` and `room` only where an artwork has the extra pictures (the Lantern — `EXTRA_VIEWS`).
 */
export const PRODUCT_VIEWS = {
  framed: {
    label: "Framed",
    fit: "contain",
    alt: (altText: string, finishName: string) =>
      `${altText} — ${finishName} frame`,
    caption: (finishName: string) => `Framed in ${finishName}`,
  },
  closeup: {
    label: "Frame detail",
    fit: "cover",
    alt: (title: string, finishName: string) =>
      `${title} — ${finishName} frame, close up`,
    caption: (finishName: string) => `${finishName} frame, close up`,
  },
  paper: {
    label: "Paper detail",
    fit: "cover",
    alt: (title: string) =>
      `${title} — print detail on Hahnemühle Museum Etching paper`,
    caption: "Print detail on Hahnemühle Museum Etching paper",
  },
  artwork: {
    label: "Artwork",
    fit: "contain",
    alt: (title: string) => `${title} — the artwork without its frame`,
    caption: "The artwork",
  },
  room: {
    label: "In a room",
    fit: "cover",
    alt: (title: string, room: string, finishName: string) =>
      `${title} in a ${room} — ${finishName} frame`,
    caption: (room: string, finishName: string) =>
      `In a ${room} · ${finishName} frame`,
  },
  scale: {
    label: "Scale guide",
    fit: "contain",
    alt: (orientation: string, room: string) =>
      `Illustrative A2 ${orientation} size guide for a ${room}; not this artwork`,
    caption: (orientation: string, room: string) =>
      `Illustrative A2 ${orientation} scale in a ${room}`,
  },
} as const;

/** The room every artwork-room phrase falls back to when the projection lists none (build-products.cjs:52). */
export const DEFAULT_ROOM = "Living Room";

/**
 * The A2 size-guide sheet per first room and orientation — build-products.cjs:65, :91 draw products.json's `scale`,
 * which for all 22 artworks is `sizeguide-<room>-<orientation>` of its first room and its orientation (verified
 * against products.json on 2026-11-07; the unit suite re-checks it), so the rule is encoded, not a per-artwork list.
 * The prototype holds these six sheets only: a combination without one shows no sheet (never another room's).
 */
export const SIZE_GUIDE_SHEETS: Readonly<
  Record<string, Partial<Record<"Portrait" | "Landscape", SiteImageKey>>>
> = {
  "Living Room": { Portrait: "sizeguide-living-room-portrait" },
  Bedroom: {
    Portrait: "sizeguide-bedroom-portrait",
    Landscape: "sizeguide-bedroom-landscape",
  },
  "Dining Room": { Landscape: "sizeguide-dining-room-landscape" },
  "Study & Office": {
    Portrait: "sizeguide-study-office-portrait",
    Landscape: "sizeguide-study-office-landscape",
  },
};

/** The size-guide sheets' single stored copy and its intrinsic size (scripts/testing/site-images.json). */
export const SIZE_GUIDE_SHEET_COPY = {
  size: "1120",
  width: 1120,
  height: 1400,
} as const;

/**
 * The extra pictures of the one artwork that has them (products.json `master` and `roomImages`; build-products.cjs:64,
 * :91; r3.js:22–23, :58–59): its artwork master — the "Artwork" view — and a room photo per finish, the "In a room"
 * view and its size-guide figure. Site keys, with their single stored copy.
 */
export const EXTRA_VIEWS: Readonly<
  Record<
    string,
    {
      artwork: { key: SiteImageKey; size: string };
      rooms: Readonly<
        Record<
          FinishCode,
          { key: SiteImageKey; size: string; width: number; height: number }
        >
      >;
    }
  >
> = {
  [LANTERN.slug]: {
    artwork: { key: "lantern-artwork-master", size: "1499" },
    rooms: {
      black: {
        key: "lantern-room-black",
        size: "1122",
        width: 1122,
        height: 1402,
      },
      white: {
        key: "lantern-room-white",
        size: "1122",
        width: 1122,
        height: 1402,
      },
      "antique-gold": {
        key: "lantern-room-antique-gold",
        size: "1122",
        width: 1122,
        height: 1402,
      },
    },
  },
};

/**
 * The frame pictures per finish: the swatch of the frame choice (`assets/site/frame 1/2/3.png`, product-pricing.cjs:3)
 * and the craft card of What you'll receive (products.json `craft`) are the same GEN 01 craft-detail pictures by
 * SHA-256, so one site key serves both — gold the S1.3 key, black and white the S1.5 ones; 160 / 320 / 480 for the
 * swatches (D-51), 1254 for the card.
 */
export const FRAME_PICTURES: Readonly<Record<FinishCode, SiteImageKey>> = {
  white: "gen-01-craft-detail-white-frame",
  black: "gen-01-craft-detail-black-frame",
  "antique-gold": "gen-01-craft-detail-gold-frame",
};

/** The frame order of the picker: the suggested frame, then the rest of this order (build-products.cjs:54). */
export const FRAME_PICKER_ORDER: readonly FinishCode[] = [
  "black",
  "antique-gold",
  "white",
];

/**
 * The delivery check of the hero (build-products.cjs:25), verbatim but for the hint (NS-36). The result line is the honest estimate-pending
 * state (NS-08, H.2 "Delivery check"), never the prototype's sample coverage; the invalid-PIN line is
 * shared/delivery.js:21 (rule 7; the rule is locked-facts §6).
 */
export const DELIVERY_CHECK = {
  label: "Check delivery availability",
  placeholder: "6-digit PIN code",
  submit: "Check",
  /** D-49 — NS-36, the owner-approved replacement of the E8 sentence (2026-11-07). */
  hint: "Enter your PIN code. Delivery availability and estimates will be shown here before orders open.",
  invalid: "Enter a six-digit Indian PIN code. It cannot start with 0.",
} as const;

/** The A2 comparison's site image (a named constant: the secret scanner reads `key: "<a long name>"` as a key). */
const SIZE_COMPARISON = "size-comparison-a2" satisfies SiteImageKey;

/** Size guide — build-products.cjs:91–98 with the R5 renames of :153. */
export const SIZE_GUIDE = {
  id: "in-your-space",
  heading: "Size guide",
  body: "Every Aalishaan artwork is printed at A2 and framed to order. A2 holds a wall on its own and still sits comfortably above a console, desk or bedside.",
  size: "A2",
  dimensions: {
    Portrait: {
      print: "42 × 59.4 cm",
      detail: "Portrait print size · 16.5 × 23.4 in",
    },
    Landscape: {
      print: "59.4 × 42 cm",
      detail: "Landscape print size · 23.4 × 16.5 in",
    },
  },
  small:
    "The finished frame extends beyond the print. Outer frame measurements will be confirmed before ordering.",
  /** The one-image lightbox of the A2 comparison (the S1.3 key `size-comparison-a2`, the same source picture). */
  compare: {
    label: "Compare A2 portrait and landscape",
    image: { key: SIZE_COMPARISON, size: "2048" },
    alt: "A2 portrait and landscape orientations at true relative scale, 42 by 59.4 centimetres",
    caption: "A2 size comparison",
  },
  /** The figure of an artwork without room photos: the plain A2 sheet (`room` lower-cased). */
  sheet: {
    alt: (orientation: string, room: string) =>
      `Illustrative A2 ${orientation} size guide for a ${room}; not this artwork`,
    caption: (orientation: string, room: string) =>
      `Illustrative A2 ${orientation} scale in a ${room}. The reference shows a plain A2 sheet, not this artwork.`,
  },
  /** The figure of an artwork with room photos — the selected finish's photo (r3.js:59). */
  room: {
    alt: (title: string, room: string, finishName: string) =>
      `${title} in a ${room} — ${finishName} frame`,
    caption: (finishName: string, room: string) =>
      `${finishName} frame · illustrative ${room} setting.`,
  },
} as const;

/**
 * The moodboard, "A closer look" (build-products.cjs:91–93, kept unchanged by R12) — six tiles, finish-independent:
 * the artwork, the suggested frame's close-up, the paper, then the three framed views in this order. Alts are r3.js's
 * (`tiles()`, :27–34), which replace the generator's on load.
 */
export const CLOSER_LOOK = {
  eyebrow: "A closer look",
  heading: "The artwork, the frame and the paper.",
  intro:
    "Select any image to enlarge it. Compare all three frames, with the studio’s recommended finish shown in detail.",
  enlarge: (caption: string) => `Enlarge: ${caption}`,
  artwork: { caption: "The artwork", alt: (title: string) => title },
  close: {
    caption: (finishName: string) => `${finishName} frame, close up`,
    alt: (finishName: string) => `${finishName} frame detail`,
  },
  paper: {
    caption: "Print on Hahnemühle paper",
    alt: "Paper and print detail",
  },
  framed: {
    caption: (finishName: string) => `Framed in ${finishName}`,
    alt: (title: string, finishName: string) =>
      `${title} in a ${finishName} frame`,
  },
  framedOrder: ["white", "black", "antique-gold"] as readonly FinishCode[],
} as const;

/** What you'll receive — build-products.cjs:100–109 with the R5 renames of :155. */
export const WHAT_YOU_RECEIVE = {
  id: "what-you-receive",
  heading: "What you’ll receive",
  intro:
    "An archival giclée print on Hahnemühle Museum Etching 350 gsm paper, in the wooden frame you choose.",
  paper: {
    heading: "Fine-art paper and print",
    body: "350 gsm cotton paper with a fine matt texture. This is the printed surface of your artwork.",
    alt: (title: string) =>
      `${title} — print detail on Hahnemühle Museum Etching paper`,
    zoomCaption: "Print on Hahnemühle Museum Etching 350 gsm",
    enlarge: "Enlarge the paper detail",
  },
  /** The selected finish's name, in its own element, then this text (`<span id="craft-name">…</span> is selected.`). */
  frame: {
    heading: "Handcrafted wooden frame",
    afterName:
      " is selected. Carved solid wood in antique gold, black or white.",
    alt: (finishName: string) => `${finishName} frame finish, close up`,
  },
  glazing: {
    heading: "Acrylic glazing",
    body: "A clear, light protective layer in front of the print.",
    alt: "Representative acrylic glazing in front of a print",
    image: "gen-03-acrylic-glazing" satisfies SiteImageKey,
  },
  hanging: {
    heading: "Hanging hardware fitted",
    body: "Sealed back with the hanging system attached, so it arrives ready for the wall.",
    alt: "Representative back of frame with hanging hardware fitted",
    image: "gen-03-back-of-frame-and-hanging-system" satisfies SiteImageKey,
  },
  footnote:
    "Frame, glazing and hanging images show representative materials and finishes.",
} as const;

/** The story — build-products.cjs:84–85 with the R5 rewrite of :156 (the lead is the description's first sentence). */
export const STORY = {
  id: "artwork-story",
  heading: "The artwork’s story",
} as const;

/** The style aside — build-products.cjs:86–89. */
export const STYLE_ASIDE = {
  eyebrow: "Art style",
  printNote:
    "You receive an archival giclée print in this tradition. The marks, textures and metallic effects are reproduced in print.",
  paletteLabel: "Colours in this artwork",
  meta: {
    mood: "Mood",
    room: "Suggested room",
    palette: "Colour palette",
    orientation: "Orientation",
  },
  separator: " · ",
  seeAll: (styleName: string) => `See all ${styleName} artworks`,
} as const;

/**
 * The palette swatches' colours by hue name (build-products.cjs:14–22 `hueColours`) — editorial: the projection holds
 * the names (`palette_hues`, the workbook's column AJ), not the colours. One value is a gradient. A name without a
 * colour shows the generator's neutral fallback (:34).
 */
export const PALETTE_HUES: Readonly<Record<string, string>> = {
  "Azurite blue": "#326582",
  "Malachite green": "#54735d",
  "Ink black": "#292c29",
  "Radiant gold": "#b8954c",
  Gold: "#b4934b",
  "Moon white": "#e9e5d9",
  "Soft pine green": "#6b7658",
  "Soft gray": "#92958e",
  "Warm paper white": "#ded9cb",
  "One pale red accent": "#bd8c84",
  "Blossom reds": "#9c3d37",
  "Warm paper": "#e6d8be",
  "The faintest leaf green": "#afb69c",
  "Bone white": "#dedbca",
  "Slate indigo": "#39465c",
  "Storm gray": "#7b858a",
  Umber: "#796044",
  "Blush-pink": "#c99c9a",
  "Indigo-gray": "#697885",
  "Rice-paper cream": "#e5dac1",
  "Ocean blue": "#385b77",
  "Shadow green": "#435851",
  "Pearl white": "#e7e5db",
  "Antique gold": "#a47b42",
  "Inky black": "#24292c",
  "Rusty orange": "#8b5b3c",
  "Deep sea blue": "#344b5b",
  "One gold accent": "#b79a5d",
  "Pale ultramarine": "#8498b7",
  "Pewter gray": "#969d9c",
  "Faint viridian": "#a3b9aa",
  "Natural wood tones from pale maple to dark walnut":
    "linear-gradient(90deg,#e0ceb0,#94704a,#553e2c)",
  "Deep black": "#292a27",
  "Rich copper": "#a36d48",
  "Warm gold": "#b69758",
  "Sea-teal verdigris": "#628e86",
};
export const PALETTE_FALLBACK = "#d8d2c8";

export type FaqLink = { label: string; href: string };
export type ProductFaq = {
  q: string;
  /** Plain text, or text with inline links (FAQ 6). */
  a: string | readonly (string | FaqLink)[];
};

/**
 * The FAQ section — build-products.cjs:110–113 with the R12 rewrite of :157 (its image, its heading, FAQs 6–7).
 * Items 1–5 are prototype/data/before-you-buy.json (the same five Home's FAQ carries — the unit suite holds them
 * equal, so a D-49 change cannot reach one page only); 6–7 are build-products.cjs:157. The first is open.
 */
export const PRODUCT_FAQ = {
  id: "pd-help",
  image: {
    key: "product-page-faq" satisfies SiteImageKey,
    size: "1672",
    width: 1672,
    height: 941,
  },
  eyebrow: "Before you buy",
  heading: "FAQs",
  intro: "Simple answers about the artwork, framing and delivery.",
  contact: { label: "Ask us something else →", href: "/contact" },
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
      /** D-49 — NS-36, the owner-approved replacement of the E8 sentence (2026-11-07). */
      a: "Each piece is printed and framed after you order, then delivered across India. Confirmed production times, delivery estimates and charges will be shown before live orders open.",
    },
    {
      q: "Where can I find delivery and return information?",
      a: [
        "Each piece is printed and framed after you order. Read our ",
        { label: "Shipping & Delivery", href: "/policies/shipping" },
        " and ",
        { label: "Returns & Replacements", href: "/policies/returns" },
        " information.",
      ],
    },
    {
      q: "How do I care for my artwork?",
      a: "Hang away from direct sunlight and moisture. Dust with a soft, dry cloth.",
    },
  ] as readonly ProductFaq[],
} as const;

/** Related artworks — build-products.cjs:114–117; the eyebrow is the collection's name, the cards are ART_CARD's. */
export const RELATED = {
  heading: "More from this collection.",
  open: "Open the collection",
  max: 3,
} as const;

/** The lightbox — build-products.cjs:167; its position line is r3.js:94. */
export const LIGHTBOX = {
  label: "Enlarged image",
  close: "Close ✕",
  previous: { label: "Previous image", mark: "‹" },
  next: { label: "Next image", mark: "›" },
  position: (caption: string, index: number, count: number) =>
    `${caption} · ${index} of ${count}`,
} as const;

/** The phone purchase bar — build-products.cjs:167: "A2 · <finish> · <price>" under the title. */
export const STICKY_BAR = {
  size: "A2",
  separator: " · ",
} as const;

/** The add notices — r3.js:127 (rule 7). */
export const PRODUCT_NOTICES = {
  added: (title: string, finishName: string) =>
    `Added to cart · ${title} · ${finishName} frame`,
  limited:
    "Your bag already has 99 of this artwork and frame. Edit the quantity in your bag.",
  /** Also the bag's own disclosure (prototype/shared/bag.js; H.2 "Bag identity and storage"). */
  memoryOnly:
    "Your selection is kept on this page only. Enable browser storage before continuing to checkout.",
} as const;

/** build-products.cjs:170 — the page's no-JavaScript line. */
export const PRODUCT_NOSCRIPT =
  "Frame switching, image enlargement and the cart need JavaScript. All artwork details are shown above.";

/**
 * An approved artwork route whose artwork the projection does not hold — Production until S3.3 loads the catalogue
 * (D-48), or a hidden or retired artwork (H.2 "Entries"). No prototype copy exists: the prototype has every artwork.
 * Worded in NS-27's voice ("No artworks to show yet." / "Artworks appear here once they are published."); the link is
 * the cart drawer's approved "Explore artworks" (CART_DRAWER.empty.primary).
 */
export const ARTWORK_NOT_AVAILABLE = {
  /** NS-PROPOSED: the page's <title> (the projection's seo_title is not available). */
  title: "Artwork not available | Aalishaan Studio",
  /** NS-PROPOSED: the heading. */
  heading: "This artwork is not available.",
  /** NS-PROPOSED: the line. */
  body: "It appears here once it is published.",
  action: { label: "Explore artworks", href: "/shop" },
} as const;
