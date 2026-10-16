import Link from "next/link";

import {
  FEATURED,
  FINISHES,
  formatRupees,
  type FinishCode,
} from "@/content/public/home";
import { catalogueImage, type CatalogueSlot } from "@/lib/site-images";

import { WishlistHeart } from "./wishlist-heart";

/**
 * The reusable product card (docs/DESIGN.md §3 "Art card"; prototype/index.html:643–681): one image, the
 * title, the hook, the launch price for the card's finish and one clear next step. The image is the S1.1
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
  const href = `/artworks/${slug}`;
  const slot: CatalogueSlot = `frame-${finish}`;
  const titleId = `${slug}-title`;
  return (
    <article className="art-card" data-product={slug} aria-labelledby={titleId}>
      <div className="art-card__media">
        <Link
          className="art-card__main"
          href={href}
          prefetch={false}
          aria-label={`View ${title}`}
        >
          <img
            src={catalogueImage(slug, slot, "1200")}
            srcSet={`${catalogueImage(slug, slot, "480")} 480w, ${catalogueImage(slug, slot, "1200")} 1200w`}
            sizes="(max-width:767px) 90vw, 420px"
            alt={alt}
            width={1200}
            height={1200}
            loading="lazy"
            decoding="async"
          />
        </Link>
        <WishlistHeart slug={slug} title={title} />
      </div>
      <div className="art-card__body">
        <p className="art-card__label">{FEATURED.label}</p>
        <h3 id={titleId}>
          <Link href={href} prefetch={false}>
            {title}
          </Link>
        </h3>
        <p className="art-card__hook">{hook}</p>
        <p className="art-card__price">
          <span>{FINISHES[finish].label} frame</span>
          {formatRupees(FINISHES[finish].pricePaise)}
        </p>
        <div className="art-card__actions">
          <Link className="art-card__view" href={href} prefetch={false}>
            {FEATURED.view} <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </article>
  );
}
