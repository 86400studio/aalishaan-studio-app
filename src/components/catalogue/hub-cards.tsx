import Link from "next/link";

import { ART_STYLES_PAGE, COLLECTIONS_PAGE } from "@/content/public/browse";
import type { CollectionCard, StyleCard } from "@/lib/catalogue/browse-model";
import { siteImage, siteImageSrcSet } from "@/lib/site-images";

import { COLLECTION_COVER_SIZES, STYLE_COVER_SIZES } from "./image-sizes";

/**
 * The two hubs' cards (prototype/scripts/build-browse.cjs:80–81): one picture, the name, the intro and one action,
 * the picture and the action leading to the same page. A collection shows its cover (a site image); a style the
 * close-up the prototype chose for it (a catalogue object). Names and intros come from the projection's rows.
 */

export function CollectionCardView({ card }: { card: CollectionCard }) {
  const href = `/collections/${card.route.slug}`;
  return (
    <article className="collection-card">
      <Link
        className="collection-card__image"
        href={href}
        prefetch={false}
        aria-label={COLLECTIONS_PAGE.open(card.name)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- the prototype's <img> markup ported verbatim; next/image is not used (D-48) */}
        <img
          src={siteImage(card.route.cover, "1200")}
          srcSet={siteImageSrcSet(card.route.cover, [
            ["480", "480w"],
            ["1200", "1200w"],
          ])}
          sizes={COLLECTION_COVER_SIZES.card}
          alt={COLLECTIONS_PAGE.coverAlt(card.name)}
          width={600}
          height={600}
          loading="lazy"
        />
      </Link>
      <div className="collection-card__body">
        <h2>{card.name}</h2>
        <p>{card.intro}</p>
        <Link className="button button--primary" href={href} prefetch={false}>
          {COLLECTIONS_PAGE.action} <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  );
}

export function StyleCardView({ card }: { card: StyleCard }) {
  const href = `/art-styles/${card.route.slug}`;
  return (
    <article className="browse-story">
      <Link
        className="browse-story__image"
        href={href}
        prefetch={false}
        aria-label={ART_STYLES_PAGE.open(card.name)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- the prototype's <img> markup ported verbatim; next/image is not used (D-48) */}
        <img
          src={card.image.src}
          srcSet={card.image.srcSet}
          sizes={STYLE_COVER_SIZES}
          alt={card.name}
          width={600}
          height={600}
          loading="lazy"
        />
      </Link>
      <div className="browse-story__copy">
        <h2>{card.name}</h2>
        <p>{card.intro}</p>
        <Link className="button button--primary" href={href} prefetch={false}>
          {ART_STYLES_PAGE.action} <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  );
}
