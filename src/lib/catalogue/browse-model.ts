import {
  ART_CARD,
  COLLECTION_ROUTES,
  STYLE_ROUTES,
  type CollectionRoute,
  type StyleRoute,
} from "@/content/public/browse";
import { formatRupees } from "@/lib/money";
import type { FinishCode, PublicCatalogueRow } from "@/lib/schemas/catalogue";
import { catalogueImage } from "@/lib/site-images";

import type { FilterableArtwork, FilterOptions, SelectKey } from "./filters";

/**
 * From validated `public_catalogue` rows to what the browse pages render — S1.4. Pure and browser-safe: the pages
 * call it on the server, and the browser receives the cards it returns — display strings and filter facets, never a
 * row, a price in paise or a column the card does not show.
 */

/** Every path the projection renders: what the revalidation hook refreshes (src/lib/server/catalogue-revalidation.ts). */
export const CATALOGUE_PAGE_PATHS: readonly string[] = [
  "/shop",
  "/collections",
  ...COLLECTION_ROUTES.map(({ slug }) => `/collections/${slug}`),
  "/art-styles",
  ...STYLE_ROUTES.map(({ slug }) => `/art-styles/${slug}`),
];

/** The approved collection route for a slug, or undefined (the page's guard; routing already 404s any other slug). */
export function collectionRoute(slug: string): CollectionRoute | undefined {
  return COLLECTION_ROUTES.find((route) => route.slug === slug);
}

/** The approved style route for a slug, or undefined. */
export function styleRoute(slug: string): StyleRoute | undefined {
  return STYLE_ROUTES.find((route) => route.slug === slug);
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The display order: by collection, then style, as the projection orders them, then by slug. The projection carries no
 * order of its own artworks, so the prototype's workbook order cannot be read from it; it differs from this one
 * inside three styles (the S1.4 record → "Deviations").
 */
export function sortForDisplay(
  rows: readonly PublicCatalogueRow[],
): PublicCatalogueRow[] {
  return [...rows].sort(
    (a, b) =>
      a.collection_sort_order - b.collection_sort_order ||
      a.style_sort_order - b.style_sort_order ||
      compareText(a.slug, b.slug),
  );
}

/** One card of the catalogue grid as the browser receives it. */
export type BrowseCard = FilterableArtwork & {
  /** The suggested frame's finish name, from the projection's variant. */
  finishName: string;
  /** That variant's price from integer paise ("₹23,000"); null when it is not available to order (NS-29). */
  price: string | null;
  alt: string;
  /** The S1.1 catalogue objects of the suggested frame, at 480 and 1200. */
  image: { src: string; srcSet: string };
};

/**
 * The card (build-browse.cjs:61): the artwork in its style's suggested frame (`suggested_frame`; artwork-images.cjs:2–7),
 * that variant's database price and availability, the prototype's alt rule, and the image paths recomputed from the
 * slug by the S1.1 contract — never the projected path (S1.1 known limit 2). The reader has already refused a row
 * without that variant (src/lib/server/catalogue.ts).
 */
export function browseCard(row: PublicCatalogueRow): BrowseCard {
  const finish: FinishCode = row.suggested_frame;
  const variant = row.variants.find((v) => v.finish === finish);
  if (!variant) throw new Error(`no ${finish} variant for ${row.slug}`);
  const slot = `frame-${finish}` as const;
  const large = catalogueImage(row.slug, slot, "1200");
  return {
    slug: row.slug,
    title: row.title,
    hook: row.hook,
    collection: row.collection_name,
    style: row.style_name,
    rooms: [...row.rooms],
    moods: [...row.moods],
    palettes: [...row.palettes],
    orientation: row.orientation,
    finishName: variant.finish_name,
    price:
      variant.availability === "made_to_order"
        ? formatRupees(variant.price_paise)
        : null,
    alt: ART_CARD.alt(row.title, finish),
    image: {
      src: large,
      srcSet: `${catalogueImage(row.slug, slot, "480")} 480w, ${large} 1200w`,
    },
  };
}

/** build-browse.cjs:70 — each select lists the distinct values of the page's own artworks, in JavaScript's default order. */
export function filterOptions(
  artworks: readonly FilterableArtwork[],
): FilterOptions {
  const distinct = (key: SelectKey): string[] =>
    [
      ...new Set(
        artworks.flatMap((artwork) => {
          const value = artwork[key];
          return typeof value === "string" ? [value] : [...value];
        }),
      ),
    ].sort();
  return {
    collection: distinct("collection"),
    style: distinct("style"),
    rooms: distinct("rooms"),
    moods: distinct("moods"),
    palettes: distinct("palettes"),
    orientation: distinct("orientation"),
  } satisfies Record<SelectKey, string[]>;
}

export type CollectionCard = {
  route: CollectionRoute;
  name: string;
  intro: string;
};

/**
 * The Collections hub's cards: each collection that has a public artwork and an approved route, in the projection's
 * order, with the name and intro its rows carry. A collection with no public artwork is not shown.
 */
export function collectionCards(
  rows: readonly PublicCatalogueRow[],
): CollectionCard[] {
  const found = new Map<
    string,
    { name: string; intro: string; order: number }
  >();
  for (const row of rows)
    if (!found.has(row.collection_slug))
      found.set(row.collection_slug, {
        name: row.collection_name,
        intro: row.collection_intro,
        order: row.collection_sort_order,
      });
  return COLLECTION_ROUTES.flatMap((route) => {
    const collection = found.get(route.slug);
    return collection
      ? [
          {
            route,
            name: collection.name,
            intro: collection.intro,
            order: collection.order,
          },
        ]
      : [];
  })
    .sort(
      (a, b) => a.order - b.order || compareText(a.route.slug, b.route.slug),
    )
    .map(({ route, name, intro }) => ({ route, name, intro }));
}

export type StyleCard = {
  route: StyleRoute;
  name: string;
  intro: string;
  /** The close-up the hub shows: the prototype's choice while that artwork is public, else the style's first public artwork's. */
  image: { src: string; srcSet: string };
};

/** The Art Styles hub's cards, like the collections': only styles with a public artwork, in the projection's order. */
export function styleCards(rows: readonly PublicCatalogueRow[]): StyleCard[] {
  const ordered = sortForDisplay(rows);
  return STYLE_ROUTES.flatMap((route) => {
    const own = ordered.filter((row) => row.style_slug === route.slug);
    const first = own[0];
    if (!first) return [];
    const chosen = own.some((row) => row.slug === route.cover.artwork)
      ? route.cover
      : { artwork: first.slug, finish: first.suggested_frame };
    const slot = `close-${chosen.finish}` as const;
    const large = catalogueImage(chosen.artwork, slot, "1200");
    return [
      {
        route,
        name: first.style_name,
        intro: first.style_intro,
        order: first.style_sort_order,
        image: {
          src: large,
          // The close-ups are 4:5 portraits scaled on their longer side (prototype/scripts/prepare-artwork-web.cjs):
          // 384 and 960 px wide — their true widths, where the prototype's rewrite wrote 480w / 1200w (D-54).
          srcSet: `${catalogueImage(chosen.artwork, slot, "480")} 384w, ${large} 960w`,
        },
      },
    ];
  })
    .sort(
      (a, b) => a.order - b.order || compareText(a.route.slug, b.route.slug),
    )
    .map(({ route, name, intro, image }) => ({ route, name, intro, image }));
}
