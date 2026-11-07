import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { artworkMetadata } from "@/components/product/artwork-metadata";
import {
  ArtworkUnavailable,
  ProductPage,
} from "@/components/product/product-page";
import {
  artworkPageState,
  artworkPath,
  artworkRoute,
  artworkStaticParams,
  type ArtworkPageState,
} from "@/lib/catalogue/product-model";
import { getPublicCatalogue } from "@/lib/server/catalogue";
import "@/styles/browse.css";
import "@/styles/product.css";

/**
 * An artwork — S1.5 (docs/TECH-ARCHITECTURE.md §3a `/artworks/[slug]`; the S1.5 record → H.2 "Entries";
 * prototype/pages/artworks/<slug>/index.html from prototype/scripts/build-products.cjs). Statically generated for the
 * 22 approved slugs (src/content/public/product.ts — identities only); any other slug is the designed global 404
 * (`dynamicParams = false` — the routing 404, never a render-time one, §10 #23 (j)). ISR: the page reads the
 * `public_catalogue` projection through `getPublicCatalogue()` (one read, shared with the head) and is regenerated
 * after the hour or at once by the revalidation hook (src/lib/server/catalogue-revalidation.ts lists every artwork
 * path). Every product fact comes from the projection: while it does not hold the artwork (Production until S3.3, a
 * hidden or retired artwork) the page says so honestly; a build without the catalogue's configuration outside Vercel
 * shows the catalogue's NS-26 state; any other failed read stops the build or renders the designed 500, as S1.4's
 * pages do (src/lib/server/catalogue.ts). browse.css brings the related grid's art cards; product.css the page.
 */
type Params = { slug: string };

export const revalidate = 3600;
export const dynamicParams = false;

export function generateStaticParams(): Params[] {
  return artworkStaticParams();
}

/** The page's state from the request's one projection read; the model is built once for the head and the page. */
const pageState = cache(async (slug: string): Promise<ArtworkPageState> => {
  const catalogue = await getPublicCatalogue();
  return artworkPageState(
    catalogue.status === "ok" ? catalogue.rows : null,
    slug,
  );
});

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (!artworkRoute(slug)) return {};
  return artworkMetadata(await pageState(slug), artworkPath(slug));
}

export default async function ArtworkPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  if (!artworkRoute(slug)) notFound();
  const state = await pageState(slug);
  return state.status === "ok" ? (
    <ProductPage product={state.product} />
  ) : (
    <ArtworkUnavailable status={state.status} />
  );
}
