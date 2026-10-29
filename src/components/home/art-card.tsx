import { ArtCardView } from "@/components/catalogue/art-card";
import {
  FEATURED,
  FINISHES,
  formatRupees,
  type FinishCode,
} from "@/content/public/home";
import { catalogueImage, type CatalogueSlot } from "@/lib/site-images";

/**
 * Home's featured card (docs/DESIGN.md §3 "Art card"; prototype/index.html:643–681): the shared art card
 * (src/components/catalogue/art-card.tsx) with Home's launch price for the card's finish, the image as Home's
 * prototype sizes it (`90vw` below 768 px, a 1200 × 1200 box) and the title naming the card. The image is the S1.1
 * bucket object for that finish (`frame-<finish>` at 480 / 1200); the product route arrives with S1.5.
 */
export function ArtCard({
  slug,
  title,
  hook,
  finish,
  alt,
}: {
  slug: string;
  title: string;
  hook: string;
  finish: FinishCode;
  alt: string;
}) {
  const slot: CatalogueSlot = `frame-${finish}`;
  return (
    <ArtCardView
      slug={slug}
      title={title}
      hook={hook}
      label={FEATURED.label}
      view={FEATURED.view}
      price={{
        frame: `${FINISHES[finish].label} frame`,
        amount: formatRupees(FINISHES[finish].pricePaise),
      }}
      image={{
        src: catalogueImage(slug, slot, "1200"),
        srcSet: `${catalogueImage(slug, slot, "480")} 480w, ${catalogueImage(slug, slot, "1200")} 1200w`,
        sizes: "(max-width:767px) 90vw, 420px",
        alt,
        width: 1200,
        height: 1200,
      }}
      labelledByTitle
    />
  );
}
