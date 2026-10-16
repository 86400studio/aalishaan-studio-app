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
 * PROD in Production — read once at module load from the build-inlined public value. There is no fallback:
 * without the value the build fails here, and a missing object fails visibly in the browser (an alt text,
 * never invented content — TECH-ARCHITECTURE §7). Pure and browser-safe: no server module, no secret.
 */

export const PUBLIC_BUCKET = "catalogue-public";
export const SITE_PREFIX = "site/";

/** `https://<ref>.supabase.co` exactly (an optional trailing slash), or null. */
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
  if (url.search !== "" || url.hash !== "") return null;
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
 * The origin the pages render. Every deployment holds the public value (P12), so the deployed pages carry
 * the project's Storage origin. A build without it — the Code Check's, a local build with no environment —
 * renders the object paths against the app's own origin, where they answer 404 and the images fail
 * visibly with their alt text; nothing is invented and no other origin is guessed.
 */
function requireOrigin(): string {
  return originFromEnv ?? "";
}

/** True when the build holds the project's API origin (the deployed case). */
export function hasStorageOrigin(): boolean {
  return originFromEnv !== null;
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
 * a PNG source at its native width, the FAQ illustration as one native copy). Mirrors the manifest.
 */
export const SITE_IMAGE_SIZES: Readonly<
  Record<SiteImageKey, readonly string[]>
> = {
  "page-hero": ["600", "1200", "1600"],
  "hero-artwork": ["600", "1200"],
  "card-1-shop-all": ["600", "1200"],
  "card-2-collection": ["600", "1200", "1600"],
  "card-3-artstyle": ["600", "1200"],
  "about-page-hero": ["600", "1600"],
  "gen-01-craft-detail-gold-frame": ["1254"],
  "gen-02-paper-closeup": ["1254"],
  "gen-03-acrylic-glazing": ["1254"],
  "gen-03-back-of-frame-and-hanging-system": ["1254"],
  "gen-04-print-closeup": ["1254"],
  "size-comparison-a2": ["2048"],
  "before-you-buy": ["native"],
};

export function siteImagePath(key: SiteImageKey, size: string): string {
  if (!SITE_IMAGE_SIZES[key].includes(size))
    throw new Error(`site image ${key} has no ${size} copy`);
  return `${SITE_PREFIX}${key}-${size}.webp`;
}

/** The public URL of one site image copy. */
export function siteImage(key: SiteImageKey, size: string): string {
  return publicObjectUrl(requireOrigin(), siteImagePath(key, size));
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

export function catalogueImagePath(
  slug: string,
  slot: CatalogueSlot,
  size: "480" | "1200",
): string {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug))
    throw new Error(`not an artwork slug: ${slug}`);
  return `artworks/${slug}/${slot}-${size}.webp`;
}

/** The public URL of one catalogue image (the S1.1 object-path contract). */
export function catalogueImage(
  slug: string,
  slot: CatalogueSlot,
  size: "480" | "1200",
): string {
  return publicObjectUrl(requireOrigin(), catalogueImagePath(slug, slot, size));
}
