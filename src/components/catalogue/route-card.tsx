import Link from "next/link";

import {
  siteImage,
  siteImageSrcSet,
  type SiteImageKey,
} from "@/lib/site-images";

/**
 * One "Ways to shop" route card (docs/DESIGN.md §3 "Route card"; prototype/index.html:608–622): the picture,
 * the heading, the line and the one primary action. The `srcset` widths are the prototype's own (the third
 * picture's large copy is 1122 px wide) plus the 800 px delivery copy of S1.3b (D-19), which a phone at 1.75–2×
 * takes for its cards, about 343–375 CSS px wide: the third card's picture fills its card, while the first two draw
 * a `contain` picture about 69 % as wide and so take more than they draw (the S1.3b record → deviation 7). The
 * `sizes` are the prototype's plus the 601–767 px carousel (home.css: cards 88 % of the track, up to 635 px drawn),
 * which the prototype's 70vw undercounts — there the 800 copy would have been drawn enlarged where S1.3 sent the
 * large one (measured at S1.3b, the sprint record → "Cloud execution"). Home only: S1.4's Collections and Art
 * Styles pages use cards of their own (docs/DESIGN.md §3).
 */
const SIZES =
  "(max-width: 600px) calc(100vw - 36px), (max-width: 47.9375rem) 88vw, (max-width: 900px) 70vw, 33vw";

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
        {/* eslint-disable-next-line @next/next/no-img-element -- the prototype's <img> markup ported verbatim; next/image is not used (D-48) */}
        <img
          className="route-card__image"
          src={siteImage(image, "1200")}
          srcSet={siteImageSrcSet(image, [
            ["600", "600w"],
            ["800", "800w"],
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
