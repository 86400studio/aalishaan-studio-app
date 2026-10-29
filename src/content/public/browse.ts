import type { FinishCode } from "@/lib/schemas/catalogue";
import type { SiteImageKey } from "@/lib/site-images";

/**
 * The approved copy of the S1.4 browse pages — Shop All, the Collections and Art Styles hubs and their three and
 * eleven detail pages (docs/TECH-ARCHITECTURE.md §3a): prototype/scripts/build-browse.cjs and the pages it generated
 * (prototype/shop-all/index.html, prototype/pages/collections/**, prototype/pages/art-styles/**), the runtime strings
 * of prototype/shared/browse.js where its behaviour is ported (docs/content/new-strings.md rule 7), and the honest
 * states the prototype has no copy for (NS-26 to NS-29). The routes' identities and their images are here too.
 * Everything about the artworks — which are public, their titles, hooks, prices and availability, their collections
 * and styles with those names and texts, and their order — comes from the `public_catalogue` projection
 * (src/lib/server/catalogue.ts): this file holds no second catalogue. None of the 17 prototype pages has a meta
 * description, so none is set (the Contact precedent).
 */

/** Shop All — build-browse.cjs:74. */
export const SHOP_PAGE = {
  head: { title: "Shop All | Aalishaan Studio", description: "" },
  hero: {
    eyebrow: "Aalishaan Studio",
    heading: "Shop All",
    intro:
      "Find a story you want to live with. Explore our collection of archival artworks.",
  },
} as const;

/** The Collections hub — build-browse.cjs:80, :82; its intro is locked (locked-facts.md §5, D-PRE-19). */
export const COLLECTIONS_PAGE = {
  head: { title: "Collections | Aalishaan Studio", description: "" },
  hero: {
    eyebrow: "Aalishaan Studio",
    heading: "Collections",
    intro: "Stories you can hang. Open the one that stops you.",
  },
  sectionLabel: "Collections",
  open: (name: string) => `Open the ${name} collection`,
  action: "Open the collection",
  coverAlt: (name: string) => `${name} collection cover`,
} as const;

/** The Art Styles hub — build-browse.cjs:81, :82; its intro is locked (locked-facts.md §5). */
export const ART_STYLES_PAGE = {
  head: { title: "Art Styles | Aalishaan Studio", description: "" },
  hero: {
    eyebrow: "Aalishaan Studio",
    heading: "Art Styles",
    intro:
      "How it was made changes how it feels. Find the marks that speak to you.",
  },
  sectionLabel: "Art Styles",
  open: (name: string) => `See the ${name} artworks`,
  action: "See the artworks",
} as const;

/** The detail pages' titles and back links — build-browse.cjs:58, :86, :87. */
export const BROWSE_DETAIL = {
  title: (name: string) => `${name} | Aalishaan Studio`,
  collectionsBack: { label: "All collections", href: "/collections" },
  stylesBack: { label: "All art styles", href: "/art-styles" },
} as const;

/** The supplied-image heroes (build-browse.cjs:74, :82, :87): the style pages show the Art Styles picture. */
export const BROWSE_HERO_IMAGES = {
  shop: "shop-all-page-hero",
  collections: "collections-page-hero",
  styles: "art-styles-page-hero",
} as const satisfies Record<string, SiteImageKey>;

export type CollectionRoute = {
  slug: string;
  /** The approved name: the page title, and the heading while the projection holds none of its artworks. */
  name: string;
  /** Its cover — the hub's card and the detail page's hero (build-browse.cjs:72, :86). */
  cover: SiteImageKey;
};

/** The three collection routes, in docs/TECH-ARCHITECTURE.md §3a's order (generateStaticParams; any other slug is the 404). */
export const COLLECTION_ROUTES: readonly CollectionRoute[] = [
  {
    slug: "painted-in-gold",
    name: "Painted in Gold",
    cover: "painted-in-gold-cover",
  },
  {
    slug: "blossoms-in-ink",
    name: "Blossoms in Ink",
    cover: "blossoms-in-ink-cover",
  },
  {
    slug: "the-age-of-sail",
    name: "The Age of Sail",
    cover: "the-age-of-sail-cover",
  },
];

export type StyleRoute = {
  slug: string;
  /** The approved short name (never the style's full name): the page title, and the heading while no artwork names it. */
  name: string;
  /**
   * Its picture on the Art Styles hub: the close-up of one of its artworks in the style's suggested frame, the one
   * the prototype chose (build-browse.cjs:34–36 — the picture in each style's folder; Gilded Peaks shows its second
   * artwork), delivered as that artwork's catalogue `close-<finish>` object, byte-identical to the prototype's copy.
   */
  cover: { artwork: string; finish: FinishCode };
};

/** The eleven style routes, in §3a's order. */
export const STYLE_ROUTES: readonly StyleRoute[] = [
  {
    slug: "gilded-peaks",
    name: "Gilded Peaks",
    cover: { artwork: "the-moon-between-two-peaks", finish: "antique-gold" },
  },
  {
    slug: "rinpa-moon",
    name: "Rinpa Moon",
    cover: { artwork: "the-pine-that-holds-the-moon", finish: "antique-gold" },
  },
  {
    slug: "four-gentlemen",
    name: "Four Gentlemen",
    cover: { artwork: "bamboo-after-the-storm", finish: "white" },
  },
  {
    slug: "scarlet-blossom",
    name: "Scarlet Blossom",
    cover: { artwork: "the-blossom-over-the-closed-window", finish: "white" },
  },
  {
    slug: "moonlit-blossom",
    name: "Moonlit Blossom",
    cover: { artwork: "the-branch-above-dark-water", finish: "white" },
  },
  {
    slug: "hand-printed-ukiyo-e",
    name: "Hand-Printed Ukiyo-e",
    cover: { artwork: "the-teahouse-shutters-at-spring-dawn", finish: "white" },
  },
  {
    slug: "mythic-voyage",
    name: "Mythic Voyage",
    cover: { artwork: "the-harbour-chain-opens", finish: "antique-gold" },
  },
  {
    slug: "corsair-chronicles",
    name: "Corsair Chronicles",
    cover: { artwork: "the-lantern-that-outlasted-the-gale", finish: "black" },
  },
  {
    slug: "ghostly-armada",
    name: "Ghostly Armada",
    cover: { artwork: "the-last-mooring-in-the-mist", finish: "black" },
  },
  {
    slug: "marquetry-voyage",
    name: "Marquetry Voyage",
    cover: { artwork: "the-shipyard-at-low-tide", finish: "black" },
  },
  {
    slug: "neo-classical-fantasy",
    name: "Neo-Classical Fantasy",
    cover: {
      artwork: "the-copper-citadel-at-the-sea-gate",
      finish: "antique-gold",
    },
  },
];

/** The listing of Shop All and the fourteen detail pages — build-browse.cjs:70; browse.js:12–15 at run time. */
export const LISTING = {
  label: "All Artworks",
  savedLabel: "Saved artworks",
  count: (n: number) => `${n} artwork${n === 1 ? "" : "s"}`,
  /** The Saved view's note: the link always leads to Shop All's whole list, even from a detail page. */
  savedNote: {
    link: "Explore all artworks",
    href: "/shop#artworks",
    text: " Saved on this browser.",
  },
  filters: {
    summary: "Filter artworks",
    summaryMark: "＋",
    search: {
      label: "Search artworks",
      placeholder: "Search by name or story",
    },
    selects: {
      collection: { label: "Collection", all: "All collections" },
      style: { label: "Art style", all: "All art styles" },
      rooms: { label: "Room", all: "All rooms" },
      moods: { label: "Mood", all: "All moods" },
      palettes: { label: "Colour palette", all: "All colour palettes" },
      orientation: { label: "Orientation", all: "All orientations" },
    },
    clear: "Clear all",
  },
  chips: {
    label: "Active filters",
    text: (value: string) => `${value} ×`,
    remove: (value: string) => `Remove ${value} filter`,
  },
  empty: {
    heading: "No artworks match these filters.",
    body: "Try a different colour, room or search term.",
    savedHeading: "No saved artworks match these filters.",
    savedBody:
      "Save an artwork using its heart, or clear the filters to keep exploring.",
    action: "Clear all filters",
  },
} as const;

/** The art card on the browse pages — build-browse.cjs:61, its alt :37 (the article is always "a"); Home's card words. */
export const ART_CARD = {
  label: "Museum Grade Giclée Artwork",
  view: "View Artwork",
  viewLabel: (title: string) => `View ${title}`,
  frame: (finishName: string) => `${finishName} frame`,
  alt: (title: string, finish: FinishCode) =>
    `${title} in a ${finish.replace(/-/g, " ")} frame`,
} as const;

/**
 * Honest states with no prototype copy (docs/content/new-strings.md; D-24 technical states, approved 2026-10-29): the
 * listing pages show the heading and the line; the two hubs, which have no heading of that level, the two together.
 */
export const CATALOGUE_STATES = {
  /** NS-26 — the page was built outside Vercel without the catalogue's configuration (the Code Check, a checkout without the local values). */
  unavailable: {
    heading: "The artworks could not be loaded.",
    body: "Try again in a few minutes.",
  },
  /** NS-27 — the projection holds no artwork for the page (Production until S3.3 loads the catalogue — D-48). */
  empty: {
    heading: "No artworks to show yet.",
    body: "Artworks appear here once they are published.",
  },
  /** NS-29 — the price line when the card's frame is not available to order. */
  notAvailable: "Not available to order",
} as const;

/**
 * NS-28 — the Saved view when the browser will not let the page read its storage: the prototype would show its "no
 * saved artworks" line, which is not true there; worded after the heart's own line (`WISHLIST.unavailable`,
 * src/content/public/strings.ts).
 */
export const SAVED_VIEW = {
  unavailable: {
    heading: "Saved artworks cannot be shown.",
    body: "Your browser could not read your saved artworks. Enable browser storage to keep a wishlist.",
  },
} as const;
