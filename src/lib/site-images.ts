/**
 * The public image registry — S1.3 (docs/PROJECT-STATUS.md D-48; docs/TECH-ARCHITECTURE.md §7 "Supabase
 * Storage"). Every image the storefront shows lives in the one public bucket `catalogue-public`:
 *
 *  - the catalogue images under `artworks/<slug>/<slot>-<size>.webp` (the S1.1 contract, written by
 *    `pnpm db:test:upload-catalogue`);
 *  - the site images under `site/<key>-<size>.webp` (the prototype's responsive copies and the WebP
 *    delivery copies of its PNG-only sources, written by `pnpm db:test:upload-site-images` from the
 *    manifest `scripts/testing/site-images.json`, which this registry mirrors — the unit suite pins the two
 *    to each other).
 *
 * The URL origin is the project's API origin, `NEXT_PUBLIC_SUPABASE_URL` — TEST on Preview and locally,
 * PROD in Production — read once at module load from the build-inlined public value. Without a valid value
 * (the Code Check's build, a local build with no environment) nothing is thrown and no other origin is
 * guessed: the pages render the object paths against the app's own origin, where they answer 404, so every
 * image fails visibly with its alt text — never invented content (TECH-ARCHITECTURE §7). The response
 * header's `img-src` uses the same validator (src/lib/security-headers.ts). Pure and browser-safe: no server
 * module, no secret.
 */

export const PUBLIC_BUCKET = "catalogue-public";
export const SITE_PREFIX = "site/";

/** `https://<ref>.supabase.co` exactly — no port, path, query or credentials; a trailing slash allowed — or null. */
export function storageOriginFromUrl(value: string | undefined): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "")
    return null;
  if (url.port !== "" || url.search !== "" || url.hash !== "") return null;
  if (url.pathname !== "/" && url.pathname !== "") return null;
  if (!/^[a-z]{20}\.supabase\.co$/.test(url.hostname)) return null;
  return url.origin;
}

/** The public URL of one object of the public bucket, under the given origin. */
export function publicObjectUrl(origin: string, objectPath: string): string {
  if (!/^[a-z0-9][a-z0-9/._-]*\.webp$/.test(objectPath))
    throw new Error(`not a public object path: ${objectPath}`);
  return `${origin}/storage/v1/object/public/${PUBLIC_BUCKET}/${objectPath}`;
}

const originFromEnv = storageOriginFromUrl(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
);

/**
 * The origin the pages render: the project's Storage origin when the build holds the public value (every
 * deployment does — P12), otherwise "" — the app's own origin, where the objects answer 404 (see above).
 */
function renderOrigin(): string {
  return originFromEnv ?? "";
}

export type SiteImageKey =
  | "page-hero"
  | "hero-artwork"
  | "card-1-shop-all"
  | "card-2-collection"
  | "card-3-artstyle"
  | "about-page-hero"
  | "gen-01-craft-detail-gold-frame"
  | "gen-02-paper-closeup"
  | "gen-03-acrylic-glazing"
  | "gen-03-back-of-frame-and-hanging-system"
  | "gen-04-print-closeup"
  | "size-comparison-a2"
  | "before-you-buy";

/**
 * The sizes each key is stored at (the prototype's size labels: the responsive copies at 600 / 1200 / 1600,
 * a PNG source at its native width, the FAQ illustration as one native copy; from S1.3b — D-19 — the
 * narrower delivery copies encoded from the PNG originals by the same method, at the widths Home draws: 800
 * for the hero artwork and the route pictures, 160 / 320 / 480 for the craft swatches, 200 / 400 for the size
 * swatch). Mirrors the manifest.
 */
export const SITE_IMAGE_SIZES: Readonly<
  Record<SiteImageKey, readonly string[]>
> = {
  "page-hero": ["1200", "1600"],
  "hero-artwork": ["600", "800", "1200"],
  "card-1-shop-all": ["600", "800", "1200"],
  "card-2-collection": ["600", "800", "1200", "1600"],
  "card-3-artstyle": ["600", "800", "1200"],
  "about-page-hero": ["600", "1600"],
  "gen-01-craft-detail-gold-frame": ["160", "320", "480", "1254"],
  "gen-02-paper-closeup": ["160", "320", "480", "1254"],
  "gen-03-acrylic-glazing": ["160", "320", "480", "1254"],
  "gen-03-back-of-frame-and-hanging-system": ["160", "320", "480", "1254"],
  "gen-04-print-closeup": ["160", "320", "480", "1254"],
  "size-comparison-a2": ["200", "400", "2048"],
  "before-you-buy": ["native"],
};

export function siteImagePath(key: SiteImageKey, size: string): string {
  if (!SITE_IMAGE_SIZES[key].includes(size))
    throw new Error(`site image ${key} has no ${size} copy`);
  return `${SITE_PREFIX}${key}-${size}.webp`;
}

/** The public URL of one site image copy. */
export function siteImage(key: SiteImageKey, size: string): string {
  return publicObjectUrl(renderOrigin(), siteImagePath(key, size));
}

/** A `srcset` over the given copies, each with its width descriptor as the prototype writes it. */
export function siteImageSrcSet(
  key: SiteImageKey,
  descriptors: ReadonlyArray<readonly [size: string, width: string]>,
): string {
  return descriptors
    .map(([size, width]) => `${siteImage(key, size)} ${width}`)
    .join(", ");
}

export type CatalogueSlot =
  | "frame-white"
  | "close-white"
  | "frame-black"
  | "close-black"
  | "frame-antique-gold"
  | "close-antique-gold"
  | "paper"
  | "artwork";

/** The sizes of the S1.1 object-path contract: the artwork itself at full size, every other slot at 480 / 1200. */
export type CatalogueSize<S extends CatalogueSlot> = S extends "artwork"
  ? "full"
  : "480" | "1200";

export function catalogueImagePath<S extends CatalogueSlot>(
  slug: string,
  slot: S,
  size: CatalogueSize<S>,
): string {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug))
    throw new Error(`not an artwork slug: ${slug}`);
  if ((slot === "artwork") !== (size === "full"))
    throw new Error(`catalogue slot ${slot} has no ${size} copy`);
  return `artworks/${slug}/${slot}-${size}.webp`;
}

/** The public URL of one catalogue image (the S1.1 object-path contract). */
export function catalogueImage<S extends CatalogueSlot>(
  slug: string,
  slot: S,
  size: CatalogueSize<S>,
): string {
  return publicObjectUrl(renderOrigin(), catalogueImagePath(slug, slot, size));
}
