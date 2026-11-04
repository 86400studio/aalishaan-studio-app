import type { Metadata } from "next";

import {
  BrowseImageHero,
  browseHeroStyle,
} from "@/components/catalogue/browse-hero";
import { CatalogueSection } from "@/components/catalogue/catalogue-section";
import { PublicPage } from "@/components/shell/public-page";
import { BROWSE_HERO_IMAGES, SHOP_PAGE } from "@/content/public/browse";
import { getPublicCatalogue } from "@/lib/server/catalogue";
import "@/styles/browse.css";

/**
 * Shop All — S1.4 (docs/TECH-ARCHITECTURE.md §3a `/shop`; prototype/shop-all/index.html from build-browse.cjs:74): every
 * public artwork of the `public_catalogue` projection, with the search, the six filters and the Saved artworks view
 * kept in the URL and applied in the browser (src/components/catalogue/catalogue-listing.tsx). ISR: one page for every
 * query, regenerated after the hour or at once by the revalidation hook (src/lib/server/catalogue.ts).
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: SHOP_PAGE.head.title,
  description: SHOP_PAGE.head.description,
};

export default async function ShopPage() {
  const catalogue = await getPublicCatalogue();
  return (
    <PublicPage
      variant="browse"
      style={browseHeroStyle(BROWSE_HERO_IMAGES.shop)}
    >
      <BrowseImageHero
        eyebrow={SHOP_PAGE.hero.eyebrow}
        heading={SHOP_PAGE.hero.heading}
        intro={SHOP_PAGE.hero.intro}
      />
      <CatalogueSection
        rows={catalogue.status === "ok" ? catalogue.rows : null}
      />
    </PublicPage>
  );
}
