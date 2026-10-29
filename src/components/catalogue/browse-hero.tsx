import Link from "next/link";
import type { CSSProperties } from "react";

import { COLLECTIONS_PAGE } from "@/content/public/browse";
import {
  siteImage,
  siteImageSrcSet,
  type SiteImageKey,
} from "@/lib/site-images";

import { COLLECTION_COVER_SIZES } from "./image-sizes";

/**
 * The browse heroes (prototype/scripts/build-browse.cjs:63–67). The supplied-image band of Shop All, the two hubs and
 * the eleven style pages (`browse-hero--r9`): its picture is a CSS background, which the page passes as the
 * custom properties `browseHeroStyle` returns — the 1600 copy, the 600 at 700 px and below (src/styles/browse.css; the
 * prototype's in-document rule) — and which has no alt, as in the prototype. The collection pages' white band with the
 * cover beside the copy (`browse-hero--detail`), the cover being the page's first image (`fetchpriority="high"`).
 */

/** The page's hero picture, for `PublicPage`'s `style` (the D-48 custom-property pattern of the About hero). */
export function browseHeroStyle(image: SiteImageKey): CSSProperties {
  return {
    "--site-image-browse-hero-1600": `url("${siteImage(image, "1600")}")`,
    "--site-image-browse-hero-600": `url("${siteImage(image, "600")}")`,
  } as CSSProperties;
}

function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link className="back-link" href={href} prefetch={false}>
      <span aria-hidden="true">←</span> {label}
    </Link>
  );
}

/** Shop All and the hubs (an eyebrow), or a style page (a back link and `browse-hero--style`). */
export function BrowseImageHero({
  heading,
  intro,
  eyebrow,
  back,
}: {
  heading: string;
  intro?: string;
  eyebrow?: string;
  back?: { href: string; label: string };
}) {
  return (
    <section
      className={
        back
          ? "browse-hero browse-hero--r9 browse-hero--style"
          : "browse-hero browse-hero--r9"
      }
    >
      <div className="container browse-hero__inner">
        <div>
          {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
          {back ? <BackLink href={back.href} label={back.label} /> : null}
          <h1>{heading}</h1>
          {intro ? <p>{intro}</p> : null}
        </div>
      </div>
    </section>
  );
}

/** A collection page: the back link, the name and intro, and the cover (700 × 700 box, `fetchpriority="high"`). */
export function CollectionHero({
  name,
  intro,
  cover,
  back,
}: {
  name: string;
  intro?: string;
  cover: SiteImageKey;
  back: { href: string; label: string };
}) {
  return (
    <section className="browse-hero browse-hero--detail">
      <div className="container browse-hero__inner">
        <div className="browse-detail-copy">
          <BackLink href={back.href} label={back.label} />
          <div className="browse-detail-text">
            <h1>{name}</h1>
            {intro ? <p>{intro}</p> : null}
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- the prototype's <img> markup ported verbatim; next/image is not used (D-48) */}
        <img
          src={siteImage(cover, "1200")}
          srcSet={siteImageSrcSet(cover, [
            ["480", "480w"],
            ["1200", "1200w"],
          ])}
          sizes={COLLECTION_COVER_SIZES.detail}
          alt={COLLECTIONS_PAGE.coverAlt(name)}
          width={700}
          height={700}
          fetchPriority="high"
        />
      </div>
    </section>
  );
}
