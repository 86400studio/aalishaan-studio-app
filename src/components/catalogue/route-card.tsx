import Link from "next/link";

import {
  siteImage,
  siteImageSrcSet,
  type SiteImageKey,
} from "@/lib/site-images";

/**
 * One "Ways to shop" route card (docs/DESIGN.md §3 "Route card"; prototype/index.html:608–622): the picture,
 * the heading, the line and the one primary action. The `srcset` widths are the prototype's own (the third
 * picture's large copy is 1122 px wide). Reused by the collection and art-style landings at S1.4.
 */
const SIZES =
  "(max-width: 600px) calc(100vw - 36px), (max-width: 900px) 70vw, 33vw";

export function RouteCard({
  image,
  largeWidth = "1200w",
  alt,
  title,
  body,
  action,
}: {
  image: SiteImageKey;
  largeWidth?: string;
  alt: string;
  title: string;
  body: string;
  action: { label: string; href: string };
}) {
  return (
    <article className="route-card">
      <div className="route-card__media">
        <img
          className="route-card__image"
          src={siteImage(image, "1200")}
          srcSet={siteImageSrcSet(image, [
            ["600", "600w"],
            ["1200", largeWidth],
          ])}
          sizes={SIZES}
          alt={alt}
          width={1122}
          height={1402}
          loading="lazy"
          decoding="async"
        />
      </div>
      <div className="route-card__body">
        <h3>{title}</h3>
        <p>{body}</p>
        <Link
          className="button button--primary"
          href={action.href}
          prefetch={false}
        >
          {action.label}
        </Link>
      </div>
    </article>
  );
}
