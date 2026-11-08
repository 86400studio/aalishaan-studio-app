import type { Metadata } from "next";

import { ARTWORK_NOT_AVAILABLE } from "@/content/public/product";
import type { ArtworkPageState } from "@/lib/catalogue/product-model";

/**
 * The document head of an artwork page and of `/product` — S1.5. The frozen pages' `<title>` and meta description
 * are the artwork's SEO title and description (prototype/scripts/build-products.cjs:170 — the workbook's columns R and
 * S, the projection's `seo_title` / `seo_description`), read from the same validated row the page renders (one read,
 * shared through `getPublicCatalogue`'s request cache); their canonical link is the artwork's own URL, `/product`'s the
 * Lantern's (prototype/product/index.html). The frozen pages carry no Open Graph, Twitter or JSON-LD, and every
 * deployment stays noindex (the root layout, D-03). Where the page cannot show the artwork, the head says so
 * (ARTWORK_NOT_AVAILABLE.title, NS-proposed) and has no description, as S1.4's pages without one.
 */
export function artworkMetadata(
  state: ArtworkPageState,
  canonicalPath: string,
): Metadata {
  const alternates = { canonical: canonicalPath };
  if (state.status !== "ok")
    return { title: ARTWORK_NOT_AVAILABLE.title, description: "", alternates };
  return {
    title: state.product.seo.title,
    description: state.product.seo.description,
    alternates,
  };
}
