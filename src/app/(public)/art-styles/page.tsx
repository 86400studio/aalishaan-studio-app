import type { Metadata } from "next";

import {
  BrowseImageHero,
  browseHeroStyle,
} from "@/components/catalogue/browse-hero";
import { HubNotice } from "@/components/catalogue/catalogue-section";
import { StyleCardView } from "@/components/catalogue/hub-cards";
import { PublicPage } from "@/components/shell/public-page";
import { ART_STYLES_PAGE, BROWSE_HERO_IMAGES } from "@/content/public/browse";
import { styleCards } from "@/lib/catalogue/browse-model";
import { getPublicCatalogue } from "@/lib/server/catalogue";
import "@/styles/browse.css";

/**
 * The Art Styles hub — S1.4 (docs/TECH-ARCHITECTURE.md §3a `/art-styles`; prototype/pages/art-styles/index.html from
 * build-browse.cjs:81–82): one card per style that has a public artwork, in the projection's order, with the short
 * name and intro its rows carry and the close-up the prototype chose (another public artwork's while that one is
 * not public). ISR, as Shop All.
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: ART_STYLES_PAGE.head.title,
  description: ART_STYLES_PAGE.head.description,
};

export default async function ArtStylesPage() {
  const catalogue = await getPublicCatalogue();
  const cards = catalogue.status === "ok" ? styleCards(catalogue.rows) : [];
  return (
    <PublicPage
      variant="browse"
      style={browseHeroStyle(BROWSE_HERO_IMAGES.styles)}
    >
      <BrowseImageHero
        eyebrow={ART_STYLES_PAGE.hero.eyebrow}
        heading={ART_STYLES_PAGE.hero.heading}
        intro={ART_STYLES_PAGE.hero.intro}
      />
      {cards.length > 0 ? (
        <section
          className="container browse-stories"
          aria-label={ART_STYLES_PAGE.sectionLabel}
        >
          {cards.map((card) => (
            <StyleCardView key={card.route.slug} card={card} />
          ))}
        </section>
      ) : (
        <HubNotice unavailable={catalogue.status !== "ok"} />
      )}
    </PublicPage>
  );
}
