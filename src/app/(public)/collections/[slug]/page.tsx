import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CollectionHero } from "@/components/catalogue/browse-hero";
import { CatalogueSection } from "@/components/catalogue/catalogue-section";
import { PublicPage } from "@/components/shell/public-page";
import { BROWSE_DETAIL, COLLECTION_ROUTES } from "@/content/public/browse";
import { collectionRoute, sortForDisplay } from "@/lib/catalogue/browse-model";
import { getPublicCatalogue } from "@/lib/server/catalogue";
import "@/styles/browse.css";

/**
 * A collection — S1.4 (docs/TECH-ARCHITECTURE.md §3a `/collections/[slug]`; prototype/pages/collections/<slug>/
 * index.html from build-browse.cjs:84–88): the white hero with its cover, then the collection's public artworks with
 * Shop All's search, filters and Saved view, scoped to them. Statically generated for the three approved slugs; any
 * other slug is the designed 404 (`dynamicParams = false` — the routing 404, never a render-time one). The heading and
 * intro are the projection's; while it holds none of the collection's artworks, the approved name heads the page.
 */
type Params = { slug: string };

export const revalidate = 3600;
export const dynamicParams = false;

export function generateStaticParams(): Params[] {
  return COLLECTION_ROUTES.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const route = collectionRoute((await params).slug);
  if (!route) return {};
  return { title: BROWSE_DETAIL.title(route.name), description: "" };
}

export default async function CollectionPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const route = collectionRoute((await params).slug);
  if (!route) notFound();
  const catalogue = await getPublicCatalogue();
  const rows =
    catalogue.status === "ok"
      ? catalogue.rows.filter((row) => row.collection_slug === route.slug)
      : null;
  const first = rows ? sortForDisplay(rows)[0] : undefined;
  return (
    <PublicPage variant="browse">
      <CollectionHero
        name={first?.collection_name ?? route.name}
        intro={first?.collection_intro}
        cover={route.cover}
        back={BROWSE_DETAIL.collectionsBack}
      />
      <CatalogueSection rows={rows} />
    </PublicPage>
  );
}
