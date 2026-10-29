import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  BrowseImageHero,
  browseHeroStyle,
} from "@/components/catalogue/browse-hero";
import { CatalogueSection } from "@/components/catalogue/catalogue-section";
import { PublicPage } from "@/components/shell/public-page";
import {
  BROWSE_DETAIL,
  BROWSE_HERO_IMAGES,
  STYLE_ROUTES,
} from "@/content/public/browse";
import { sortForDisplay, styleRoute } from "@/lib/catalogue/browse-model";
import { getPublicCatalogue } from "@/lib/server/catalogue";
import "@/styles/browse.css";

/**
 * An art style — S1.4 (docs/TECH-ARCHITECTURE.md §3a `/art-styles/[slug]`; prototype/pages/art-styles/<slug>/
 * index.html from build-browse.cjs:84–88): the Art Styles picture behind the style's name and intro, then its public
 * artworks with Shop All's search, filters and Saved view, scoped to them. Statically generated for the eleven
 * approved slugs; any other slug is the designed 404 (`dynamicParams = false`). The heading and intro are the
 * projection's; while it holds none of the style's artworks, the approved short name heads the page.
 */
type Params = { slug: string };

export const revalidate = 3600;
export const dynamicParams = false;

export function generateStaticParams(): Params[] {
  return STYLE_ROUTES.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const route = styleRoute((await params).slug);
  if (!route) return {};
  return { title: BROWSE_DETAIL.title(route.name), description: "" };
}

export default async function ArtStylePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const route = styleRoute((await params).slug);
  if (!route) notFound();
  const catalogue = await getPublicCatalogue();
  const rows =
    catalogue.status === "ok"
      ? catalogue.rows.filter((row) => row.style_slug === route.slug)
      : null;
  const first = rows ? sortForDisplay(rows)[0] : undefined;
  return (
    <PublicPage
      variant="browse"
      style={browseHeroStyle(BROWSE_HERO_IMAGES.styles)}
    >
      <BrowseImageHero
        heading={first?.style_name ?? route.name}
        intro={first?.style_intro}
        back={BROWSE_DETAIL.stylesBack}
      />
      <CatalogueSection rows={rows} />
    </PublicPage>
  );
}
