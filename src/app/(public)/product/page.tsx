import type { Metadata } from "next";
import { cache } from "react";

import { artworkMetadata } from "@/components/product/artwork-metadata";
import {
  ArtworkUnavailable,
  ProductPage,
} from "@/components/product/product-page";
import { LANTERN } from "@/content/public/product";
import {
  lanternPageState,
  type ArtworkPageState,
} from "@/lib/catalogue/product-model";
import { getPublicCatalogue } from "@/lib/server/catalogue";
import "@/styles/browse.css";
import "@/styles/product.css";

/**
 * `/product` — S1.5 (docs/TECH-ARCHITECTURE.md §3a; prototype/product/index.html): the compatibility entry for
 * existing links, served — not redirected — with the Lantern's artwork page, byte for byte as the prototype serves it
 * (build-products.cjs:55), and a canonical link to `/artworks/the-lantern-that-outlasted-the-gale`. The same ISR,
 * projection read and honest states as the artwork route (src/app/(public)/artworks/[slug]/page.tsx); the revalidation
 * hook lists `/product` too.
 */
export const revalidate = 3600;

const pageState = cache(async (): Promise<ArtworkPageState> => {
  const catalogue = await getPublicCatalogue();
  return lanternPageState(catalogue.status === "ok" ? catalogue.rows : null);
});

export async function generateMetadata(): Promise<Metadata> {
  return artworkMetadata(await pageState(), LANTERN.canonicalPath);
}

export default async function LanternCompatibilityPage() {
  const state = await pageState();
  return state.status === "ok" ? (
    <ProductPage product={state.product} />
  ) : (
    <ArtworkUnavailable status={state.status} />
  );
}
