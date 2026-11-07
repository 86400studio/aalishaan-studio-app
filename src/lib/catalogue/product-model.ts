import {
  ARTWORK_ROUTES,
  CLOSER_LOOK,
  DEFAULT_ROOM,
  EXTRA_VIEWS,
  FRAME_PICKER_ORDER,
  FRAME_PICTURES,
  HOOK_OVERRIDES,
  LANTERN,
  PALETTE_FALLBACK,
  PALETTE_HUES,
  PRODUCT_HERO,
  PRODUCT_VIEWS,
  RELATED,
  SIZE_GUIDE,
  SIZE_GUIDE_SHEETS,
  SIZE_GUIDE_SHEET_COPY,
  STAGE,
  STYLE_ASIDE,
  WHAT_YOU_RECEIVE,
  type ArtworkRoute,
  type ProductViewKey,
} from "@/content/public/product";
import { formatRupees } from "@/lib/money";
import type { FinishCode, PublicCatalogueRow } from "@/lib/schemas/catalogue";
import {
  catalogueImage,
  siteImage,
  siteImageSrcSet,
  type SiteImageKey,
} from "@/lib/site-images";

import { browseCard, sortForDisplay, type BrowseCard } from "./browse-model";

/**
 * From a validated `public_catalogue` row to what an artwork page renders — S1.5 (the sprint record → H.2). Pure and
 * browser-safe (the eslint browser-shared rule covers src/lib/catalogue/**): the pages call it on the server and pass
 * its result — display strings, image URLs and variant codes, never a row, a price in paise or a column the page does
 * not show — to their client components. Every product fact comes from the projection; the editorial content the
 * projection does not hold comes from src/content/public/product.ts. Ports prototype/scripts/build-products.cjs (the
 * final R5 / R12 page) and the runtime of prototype/product/r3.js, never their code.
 *
 * Images are the existing Storage mapping: the catalogue's S1.1 objects recomputed from the slug (never the projected
 * path — S1.1 known limit 2), the site keys of src/lib/site-images.ts for the reference pictures. The lightbox shows the
 * largest copy Storage holds of each picture — the catalogue 1200 copies, `artwork-full`, the site copies — instead of
 * the prototype's PNG originals (the owner's amendment H.1 #2). `sizes` are the components' (measured for the product
 * page — never Home's `SWATCH_SIZES`); this model gives each image its `src` and its `srcset` with true widths.
 */

/** One image as the page draws it: its default copy and, where Storage holds several, a `srcset` of true widths. */
export type ProductImage = { src: string; srcSet: string | null };

/** One view of the gallery — a thumbnail, the stage when selected, one lightbox slide (r3.js:16–25). */
export type GalleryView = {
  key: ProductViewKey;
  label: string;
  fit: "contain" | "cover";
  image: ProductImage;
  alt: string;
  /** The lightbox caption, before its "· n of m" (LIGHTBOX.position). */
  caption: string;
  /** The lightbox copy: the largest Storage copy of the picture (H.1 #2). */
  zoom: string;
};

/** The size-guide figure: the plain A2 sheet, or — for an artwork with room photos — the finish's room photo. */
export type SizeGuideFigure = {
  room: boolean;
  image: ProductImage;
  width: number;
  height: number;
  alt: string;
  caption: string;
  zoom: string;
};

/** One frame finish of the artwork: its variant, its price line and every picture that follows the selection. */
export type FinishOption = {
  finish: FinishCode;
  /** The projection's finish name ("Antique Gold"). */
  name: string;
  /** The bag identity, `<slug>:<finish>` (H.2 "Bag identity and storage"). */
  variantCode: string;
  available: boolean;
  /** The variant's price from integer paise ("₹23,000"); null when it is not available to order (NS-29). */
  price: string | null;
  /** The frame picker's swatch (160 / 320 / 480 / 1254). */
  swatch: ProductImage;
  /** The gallery in this finish: framed, frame detail, paper[, artwork, in a room][, scale guide]. */
  views: GalleryView[];
  /** What you'll receive → Handcrafted wooden frame. */
  craft: { image: ProductImage; alt: string };
  /** The size guide's figure in this finish; null when no sheet exists for the artwork's room and orientation. */
  sizeGuide: SizeGuideFigure | null;
};

/** One tile of "A closer look" (finish-independent). */
export type WallTile = {
  caption: string;
  alt: string;
  enlargeLabel: string;
  fit: "contain" | "cover";
  large: boolean;
  image: ProductImage;
  zoom: string;
};

export type ProductView = {
  slug: string;
  /** `/artworks/<slug>` — the canonical URL of the page and of `/product` for the Lantern. */
  canonicalPath: string;
  title: string;
  /** The hero's hook (HOOK_OVERRIDES applied). */
  hook: string;
  /** The page's `<title>` and meta description: the projection's SEO columns (build-products.cjs:170). */
  seo: { title: string; description: string };
  orientation: "Portrait" | "Landscape";
  stage: { ratio: string; width: number; height: number };
  suggestedFinish: FinishCode;
  /** The picker's order: the suggested finish, then the rest of black, antique gold, white (build-products.cjs:54). */
  finishOrder: FinishCode[];
  finishes: Record<FinishCode, FinishOption>;
  /** "Recommended Frame: <suggested>" — static, never follows the selection (r3.js does not update it). */
  recommendation: string;
  /** The size guide's A2 lines for the orientation. */
  dimensions: { print: string; detail: string };
  wall: WallTile[];
  /** What you'll receive → Fine-art paper and print, a one-image lightbox. */
  paperCard: {
    image: ProductImage;
    alt: string;
    zoom: { src: string; alt: string; caption: string };
  };
  /** What you'll receive → glazing and hanging hardware (representative, finish-independent). */
  materials: { glazing: ProductImage; hanging: ProductImage };
  /** The A2 comparison of the size guide, a one-image lightbox. */
  comparison: { src: string; alt: string; caption: string };
  story: StoryText;
  style: {
    name: string;
    intro: string;
    href: string;
    seeAll: string;
    palette: Array<{ name: string; colour: string }>;
    meta: Array<{ label: string; value: string }>;
  };
  /** More from this collection: eligible public artworks only — derived from the rows given, never a static list. */
  related: { eyebrow: string; href: string; cards: BrowseCard[] };
};

export type StoryText = { lead: string; paragraphs: string[] };

/** `/artworks/<slug>`. */
export function artworkPath(slug: string): string {
  return `/artworks/${slug}`;
}

/** The approved artwork route for a slug, or undefined (the page's guard; routing already 404s any other slug). */
export function artworkRoute(slug: string): ArtworkRoute | undefined {
  return ARTWORK_ROUTES.find((route) => route.slug === slug);
}

/** The approved routes as `generateStaticParams` returns them. */
export function artworkStaticParams(): Array<{ slug: string }> {
  return ARTWORK_ROUTES.map(({ slug }) => ({ slug }));
}

// The markers the generator splits the approved five-move description at (build-products.cjs:39–47).
const CLOSE_LOOK_MARKER = "Stand close and it keeps giving:";
const OBJECT_MARKER = "You receive an archival";
const OBJECT_LINE = /^([\s\S]*?black or white\.)\s*([\s\S]*)$/;
const FIRST_SENTENCE = /^[^.!?]+[.!?]/;

/**
 * The story — build-products.cjs:36–48, word for word: the lead is the description's first sentence; then the rest
 * of the scene, the close look (from "Stand close and it keeps giving:"), the object line (from "You receive an
 * archival" through "…black or white.") and the use line; empty paragraphs dropped. All 22 approved descriptions give
 * four. Where an edited description lacks a marker (the generator would refuse to build), the lead is still its first
 * sentence and the rest is one paragraph — every word shown, none invented.
 */
export function splitStory(description: string): StoryText {
  const d = description.trim();
  const iClose = d.indexOf(CLOSE_LOOK_MARKER);
  const iObject = d.indexOf(OBJECT_MARKER);
  if (iClose < 0 || iObject < iClose) {
    const lead = (d.match(FIRST_SENTENCE) ?? [d])[0].trim();
    return { lead, paragraphs: [d.slice(lead.length).trim()].filter(Boolean) };
  }
  let scene = d.slice(0, iClose).trim();
  const lead = (scene.match(FIRST_SENTENCE) ?? [scene])[0].trim();
  scene = scene.slice(lead.length).trim();
  const closeLook = d.slice(iClose, iObject).trim();
  const rest = d.slice(iObject).trim();
  const objectMatch = rest.match(OBJECT_LINE);
  const objectLine = objectMatch ? objectMatch[1]! : rest;
  const useLine = objectMatch ? objectMatch[2]!.trim() : "";
  return {
    lead,
    paragraphs: [scene, closeLook, objectLine, useLine].filter(Boolean),
  };
}

/** The hero's hook: the projection's, except where the frozen page overrides it (build-products.cjs:137). */
export function heroHook(
  row: Pick<PublicCatalogueRow, "slug" | "hook">,
): string {
  return HOOK_OVERRIDES[row.slug] ?? row.hook.trim();
}

/** The palette swatches: the projection's hue names with the generator's colours (build-products.cjs:34). */
export function paletteSwatches(
  hues: readonly string[],
): Array<{ name: string; colour: string }> {
  return hues
    .slice(0, 4)
    .map((name) => ({ name, colour: PALETTE_HUES[name] ?? PALETTE_FALLBACK }));
}

/** The A2 sheet for a first room and orientation, or null where the prototype holds none. */
export function sizeGuideSheet(
  room: string,
  orientation: "Portrait" | "Landscape",
): SiteImageKey | null {
  return SIZE_GUIDE_SHEETS[room]?.[orientation] ?? null;
}

/**
 * More from this collection — build-products.cjs:53 on the projection (D-56): the other public artworks of the same
 * collection, those of the same style first, otherwise in `sortForDisplay` order, at most three; never the artwork
 * itself. Only rows the projection returned can appear, so a hidden or retired artwork is never linked.
 */
export function relatedRows(
  row: PublicCatalogueRow,
  rows: readonly PublicCatalogueRow[],
): PublicCatalogueRow[] {
  const sameStyle = (r: PublicCatalogueRow) =>
    r.style_slug === row.style_slug ? 1 : 0;
  return sortForDisplay(
    rows.filter(
      (r) => r.slug !== row.slug && r.collection_slug === row.collection_slug,
    ),
  )
    .sort((a, b) => sameStyle(b) - sameStyle(a))
    .slice(0, RELATED.max);
}

/** The frame picker's order (build-products.cjs:54). */
export function finishOrder(suggested: FinishCode): FinishCode[] {
  return [suggested, ...FRAME_PICKER_ORDER.filter((f) => f !== suggested)];
}

// The catalogue copies with their true widths: frames and paper scaled on the longer side to 480 / 1200 (1200 wide
// for every frame: squares and 1200 × 848 landscapes); close-ups are 4:5 portraits, 384 / 960 wide (D-54).
function frameImage(slug: string, finish: FinishCode): ProductImage {
  const large = catalogueImage(slug, `frame-${finish}`, "1200");
  return {
    src: large,
    srcSet: `${catalogueImage(slug, `frame-${finish}`, "480")} 480w, ${large} 1200w`,
  };
}
function closeImage(slug: string, finish: FinishCode): ProductImage {
  const large = catalogueImage(slug, `close-${finish}`, "1200");
  return {
    src: large,
    srcSet: `${catalogueImage(slug, `close-${finish}`, "480")} 384w, ${large} 960w`,
  };
}
function paperImage(slug: string): ProductImage {
  const large = catalogueImage(slug, "paper", "1200");
  return {
    src: large,
    srcSet: `${catalogueImage(slug, "paper", "480")} 480w, ${large} 1200w`,
  };
}
/** A site picture stored at 160 / 320 / 480 / 1254 (the craft details, glazing, back of frame). */
function craftImage(key: SiteImageKey): ProductImage {
  return {
    src: siteImage(key, "1254"),
    srcSet: siteImageSrcSet(key, [
      ["160", "160w"],
      ["320", "320w"],
      ["480", "480w"],
      ["1254", "1254w"],
    ]),
  };
}
function single(key: SiteImageKey, size: string): ProductImage {
  return { src: siteImage(key, size), srcSet: null };
}

function finishOption(
  row: PublicCatalogueRow,
  finish: FinishCode,
  room: string,
  sheet: SiteImageKey | null,
): FinishOption {
  const variant = row.variants.find((v) => v.finish === finish);
  if (!variant) throw new Error(`no ${finish} variant for ${row.slug}`);
  const name = variant.finish_name;
  const roomLower = room.toLowerCase();
  const orientation = row.orientation.toLowerCase();
  const extra = EXTRA_VIEWS[row.slug];

  const framed = frameImage(row.slug, finish);
  const close = closeImage(row.slug, finish);
  const paper = paperImage(row.slug);
  const views: GalleryView[] = [
    {
      key: "framed",
      label: PRODUCT_VIEWS.framed.label,
      fit: PRODUCT_VIEWS.framed.fit,
      image: framed,
      alt: PRODUCT_VIEWS.framed.alt(row.image_alt_text, name),
      caption: PRODUCT_VIEWS.framed.caption(name),
      zoom: framed.src,
    },
    {
      key: "closeup",
      label: PRODUCT_VIEWS.closeup.label,
      fit: PRODUCT_VIEWS.closeup.fit,
      image: close,
      alt: PRODUCT_VIEWS.closeup.alt(row.title, name),
      caption: PRODUCT_VIEWS.closeup.caption(name),
      zoom: close.src,
    },
    {
      key: "paper",
      label: PRODUCT_VIEWS.paper.label,
      fit: PRODUCT_VIEWS.paper.fit,
      image: paper,
      alt: PRODUCT_VIEWS.paper.alt(row.title),
      caption: PRODUCT_VIEWS.paper.caption,
      zoom: paper.src,
    },
  ];
  let sizeGuide: SizeGuideFigure | null = null;
  if (extra) {
    const master = single(extra.artwork.key, extra.artwork.size);
    const roomCopy = extra.rooms[finish];
    const roomPhoto = single(roomCopy.key, roomCopy.size);
    views.push(
      {
        key: "artwork",
        label: PRODUCT_VIEWS.artwork.label,
        fit: PRODUCT_VIEWS.artwork.fit,
        image: master,
        alt: PRODUCT_VIEWS.artwork.alt(row.title),
        caption: PRODUCT_VIEWS.artwork.caption,
        zoom: master.src,
      },
      {
        key: "room",
        label: PRODUCT_VIEWS.room.label,
        fit: PRODUCT_VIEWS.room.fit,
        image: roomPhoto,
        alt: PRODUCT_VIEWS.room.alt(row.title, roomLower, name),
        caption: PRODUCT_VIEWS.room.caption(roomLower, name),
        zoom: roomPhoto.src,
      },
    );
    sizeGuide = {
      room: true,
      image: roomPhoto,
      width: roomCopy.width,
      height: roomCopy.height,
      alt: SIZE_GUIDE.room.alt(row.title, roomLower, name),
      caption: SIZE_GUIDE.room.caption(name, roomLower),
      zoom: roomPhoto.src,
    };
  }
  if (sheet) {
    const sheetImage = single(sheet, SIZE_GUIDE_SHEET_COPY.size);
    views.push({
      key: "scale",
      label: PRODUCT_VIEWS.scale.label,
      fit: PRODUCT_VIEWS.scale.fit,
      image: sheetImage,
      alt: PRODUCT_VIEWS.scale.alt(orientation, roomLower),
      caption: PRODUCT_VIEWS.scale.caption(orientation, roomLower),
      zoom: sheetImage.src,
    });
    sizeGuide ??= {
      room: false,
      image: sheetImage,
      width: SIZE_GUIDE_SHEET_COPY.width,
      height: SIZE_GUIDE_SHEET_COPY.height,
      alt: SIZE_GUIDE.sheet.alt(orientation, roomLower),
      caption: SIZE_GUIDE.sheet.caption(orientation, roomLower),
      zoom: sheetImage.src,
    };
  }
  return {
    finish,
    name,
    variantCode: variant.variant_code,
    available: variant.availability === "made_to_order",
    price:
      variant.availability === "made_to_order"
        ? formatRupees(variant.price_paise)
        : null,
    swatch: craftImage(FRAME_PICTURES[finish]),
    views,
    craft: {
      image: craftImage(FRAME_PICTURES[finish]),
      alt: WHAT_YOU_RECEIVE.frame.alt(name),
    },
    sizeGuide,
  };
}

/**
 * The page's model for one validated projection row. `rows` is the projection's whole answer (for the related cards);
 * it may or may not include `row` itself.
 */
export function productView(
  row: PublicCatalogueRow,
  rows: readonly PublicCatalogueRow[],
): ProductView {
  const room = row.rooms[0] ?? DEFAULT_ROOM;
  const sheet = sizeGuideSheet(room, row.orientation);
  const finishes = Object.fromEntries(
    (["white", "black", "antique-gold"] as const).map((finish) => [
      finish,
      finishOption(row, finish, room, sheet),
    ]),
  ) as Record<FinishCode, FinishOption>;
  const suggestedName = finishes[row.suggested_frame].name;
  const paper = paperImage(row.slug);
  const artwork = catalogueImage(row.slug, "artwork", "full");
  const comparison = SIZE_GUIDE.compare;

  const tiles: Array<Omit<WallTile, "enlargeLabel">> = [
    {
      caption: CLOSER_LOOK.artwork.caption,
      alt: CLOSER_LOOK.artwork.alt(row.title),
      fit: "contain",
      large: true,
      image: { src: artwork, srcSet: null },
      zoom: artwork,
    },
    {
      caption: CLOSER_LOOK.close.caption(suggestedName),
      alt: CLOSER_LOOK.close.alt(suggestedName),
      fit: "cover",
      large: false,
      image: closeImage(row.slug, row.suggested_frame),
      zoom: catalogueImage(row.slug, `close-${row.suggested_frame}`, "1200"),
    },
    {
      caption: CLOSER_LOOK.paper.caption,
      alt: CLOSER_LOOK.paper.alt,
      fit: "cover",
      large: false,
      image: paper,
      zoom: paper.src,
    },
    ...CLOSER_LOOK.framedOrder.map((finish) => {
      const image = frameImage(row.slug, finish);
      const name = finishes[finish].name;
      return {
        caption: CLOSER_LOOK.framed.caption(name),
        alt: CLOSER_LOOK.framed.alt(row.title, name),
        fit: "contain" as const,
        large: false,
        image,
        zoom: image.src,
      };
    }),
  ];
  const wall: WallTile[] = tiles.map((tile) => ({
    ...tile,
    enlargeLabel: CLOSER_LOOK.enlarge(tile.caption),
  }));

  return {
    slug: row.slug,
    canonicalPath: artworkPath(row.slug),
    title: row.title,
    hook: heroHook(row),
    seo: { title: row.seo_title, description: row.seo_description },
    orientation: row.orientation,
    stage: { ...STAGE[row.orientation] },
    suggestedFinish: row.suggested_frame,
    finishOrder: finishOrder(row.suggested_frame),
    finishes,
    recommendation: PRODUCT_HERO.recommendation(suggestedName),
    dimensions: { ...SIZE_GUIDE.dimensions[row.orientation] },
    wall,
    paperCard: {
      image: paper,
      alt: WHAT_YOU_RECEIVE.paper.alt(row.title),
      zoom: {
        src: paper.src,
        alt: WHAT_YOU_RECEIVE.paper.alt(row.title),
        caption: WHAT_YOU_RECEIVE.paper.zoomCaption,
      },
    },
    materials: {
      glazing: craftImage(WHAT_YOU_RECEIVE.glazing.image),
      hanging: craftImage(WHAT_YOU_RECEIVE.hanging.image),
    },
    comparison: {
      src: siteImage(comparison.image.key, comparison.image.size),
      alt: comparison.alt,
      caption: comparison.caption,
    },
    story: splitStory(row.description),
    style: {
      name: row.style_name,
      intro: row.style_intro,
      href: `/art-styles/${row.style_slug}`,
      seeAll: STYLE_ASIDE.seeAll(row.style_name),
      palette: paletteSwatches(row.palette_hues),
      meta: [
        {
          label: STYLE_ASIDE.meta.mood,
          value: row.moods.join(STYLE_ASIDE.separator),
        },
        {
          label: STYLE_ASIDE.meta.room,
          value: row.rooms.join(STYLE_ASIDE.separator),
        },
        {
          label: STYLE_ASIDE.meta.palette,
          value: row.palettes.join(STYLE_ASIDE.separator),
        },
        { label: STYLE_ASIDE.meta.orientation, value: row.orientation },
      ],
    },
    related: {
      eyebrow: row.collection_name,
      href: `/collections/${row.collection_slug}`,
      cards: relatedRows(row, rows).map(browseCard),
    },
  };
}

/**
 * What an approved artwork route renders (H.2 "Entries"):
 *  - `ok` — the projection holds the artwork: its model;
 *  - `not_available` — the projection answered without it (Production until S3.3 loads the catalogue, a hidden or
 *    retired artwork): the honest ARTWORK_NOT_AVAILABLE state in the shared shell, never TEST data;
 *  - `unavailable` — the page was built without the catalogue's configuration (`rows` null — `not_configured` outside
 *    Vercel): the catalogue's NS-26 state. Every other failed read throws in the page, as S1.4's do.
 * A slug outside the approved routes throws: routing never renders one (`dynamicParams = false`).
 */
export type ArtworkPageState =
  | { status: "ok"; product: ProductView }
  | { status: "not_available" }
  | { status: "unavailable" };

export function artworkPageState(
  rows: readonly PublicCatalogueRow[] | null,
  slug: string,
): ArtworkPageState {
  if (!artworkRoute(slug))
    throw new Error(`not an approved artwork route: ${slug}`);
  if (rows === null) return { status: "unavailable" };
  const row = rows.find((r) => r.slug === slug);
  return row
    ? { status: "ok", product: productView(row, rows) }
    : { status: "not_available" };
}

/** `/product`: the Lantern's state, with the Lantern's canonical URL (ProductView.canonicalPath). */
export function lanternPageState(
  rows: readonly PublicCatalogueRow[] | null,
): ArtworkPageState {
  return artworkPageState(rows, LANTERN.slug);
}
