import Link from "next/link";

import { WishlistHeart } from "@/components/home/wishlist-heart";

/**
 * The art card (docs/DESIGN.md §3 "Art card"): one image, the label, the title, the hook, a price for one frame and
 * one clear next step, with the heart. One implementation for Home's featured cards (src/components/home/
 * art-card.tsx, prototype/index.html:643–681) and the S1.4 catalogue grid (src/components/catalogue/
 * catalogue-listing.tsx, prototype/scripts/build-browse.cjs:61). The two prototypes differ only in the image's
 * `sizes` and box attributes and in Home's `aria-labelledby`, which the caller passes; the data is the caller's —
 * Home's launch prices, the grid's projection rows. The product route arrives with S1.5.
 */
export type ArtCardViewProps = {
  slug: string;
  title: string;
  hook: string;
  label: string;
  view: string;
  /** The price line: the frame's words, then the amount (or the NS-29 line when it is not available to order). */
  price: { frame: string; amount: string };
  image: {
    src: string;
    srcSet: string;
    sizes: string;
    alt: string;
    width: number;
    height: number;
  };
  /** Home's card names itself by its heading (`aria-labelledby`); the grid's does not. */
  labelledByTitle?: boolean;
  /** Hidden by the grid's filters (the `hidden` attribute: out of the layout and the accessibility tree). */
  hidden?: boolean;
};

export function ArtCardView({
  slug,
  title,
  hook,
  label,
  view,
  price,
  image,
  labelledByTitle = false,
  hidden = false,
}: ArtCardViewProps) {
  const href = `/artworks/${slug}`;
  const titleId = labelledByTitle ? `${slug}-title` : undefined;
  return (
    <article
      className="art-card"
      data-product={slug}
      aria-labelledby={titleId}
      hidden={hidden}
    >
      <div className="art-card__media">
        <Link
          className="art-card__main"
          href={href}
          prefetch={false}
          aria-label={`View ${title}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- the prototype's <img> markup ported verbatim; next/image is not used (D-48) */}
          <img
            src={image.src}
            srcSet={image.srcSet}
            sizes={image.sizes}
            alt={image.alt}
            width={image.width}
            height={image.height}
            loading="lazy"
            decoding="async"
          />
        </Link>
        <WishlistHeart slug={slug} title={title} />
      </div>
      <div className="art-card__body">
        <p className="art-card__label">{label}</p>
        <h3 id={titleId}>
          <Link href={href} prefetch={false}>
            {title}
          </Link>
        </h3>
        <p className="art-card__hook">{hook}</p>
        <p className="art-card__price">
          <span>{price.frame}</span>
          {price.amount}
        </p>
        <div className="art-card__actions">
          <Link className="art-card__view" href={href} prefetch={false}>
            {view} <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </article>
  );
}
