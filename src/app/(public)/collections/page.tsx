import type { Metadata } from "next";

import {
  BrowseImageHero,
  browseHeroStyle,
} from "@/components/catalogue/browse-hero";
import { HubNotice } from "@/components/catalogue/catalogue-section";
import { CollectionCardView } from "@/components/catalogue/hub-cards";
import { PublicPage } from "@/components/shell/public-page";
import { BROWSE_HERO_IMAGES, COLLECTIONS_PAGE } from "@/content/public/browse";
import { collectionCards } from "@/lib/catalogue/browse-model";
import { getPublicCatalogue } from "@/lib/server/catalogue";
import "@/styles/browse.css";

/**
 * The Collections hub — S1.4 (docs/TECH-ARCHITECTURE.md §3a `/collections`; prototype/pages/collections/index.html from
 * build-browse.cjs:80–82): one card per collection that has a public artwork, in the projection's order, with the
 * name and intro its rows carry and its cover. ISR, as Shop All.
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: COLLECTIONS_PAGE.head.title,
  description: COLLECTIONS_PAGE.head.description,
};

export default async function CollectionsPage() {
  const catalogue = await getPublicCatalogue();
  const cards =
    catalogue.status === "ok" ? collectionCards(catalogue.rows) : [];
  return (
    <PublicPage
      variant="browse"
      style={browseHeroStyle(BROWSE_HERO_IMAGES.collections)}
    >
      <BrowseImageHero
        eyebrow={COLLECTIONS_PAGE.hero.eyebrow}
        heading={COLLECTIONS_PAGE.hero.heading}
        intro={COLLECTIONS_PAGE.hero.intro}
      />
      {cards.length > 0 ? (
        <section
          className="container collection-grid"
          aria-label={COLLECTIONS_PAGE.sectionLabel}
        >
          {cards.map((card) => (
            <CollectionCardView key={card.route.slug} card={card} />
          ))}
        </section>
      ) : (
        <HubNotice unavailable={catalogue.status !== "ok"} />
      )}
    </PublicPage>
  );
}
