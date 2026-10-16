import Link from "next/link";

import { RECOVERY } from "@/content/public/pages";
import { siteImage, siteImageSrcSet } from "@/lib/site-images";

/**
 * The recovery layout shared by the 404 and the 500 pages (prototype/404.html, 500.html — build-shop-flow.cjs;
 * docs/DESIGN.md §5 "Recovery"): the framed blossom artwork beside the eyebrow, the heading, the line, the two
 * actions and the support line. The picture is the prototype's `Hero Artwork.png`, served as its responsive
 * copy (D-48).
 */
export function Recovery({ kind }: { kind: "404" | "500" }) {
  const copy = RECOVERY[kind];
  return (
    <section className="recovery">
      <div className="recovery-art">
        <img
          src={siteImage("hero-artwork", "1200")}
          srcSet={siteImageSrcSet("hero-artwork", [
            ["600", "600w"],
            ["1200", "1199w"],
          ])}
          sizes="(max-width: 900px) 420px, 480px"
          alt={RECOVERY.artAlt}
          width={1199}
          height={1312}
        />
      </div>
      <div>
        <span className="eyebrow">{copy.eyebrow}</span>
        <h1>{copy.heading}</h1>
        <p>{copy.body}</p>
        <div className="utility-actions">
          <Link
            className="button button--primary"
            href={RECOVERY.primary.href}
            prefetch={false}
          >
            {RECOVERY.primary.label}
          </Link>
          <Link
            className="button button--secondary"
            href={RECOVERY.secondary.href}
            prefetch={false}
          >
            {RECOVERY.secondary.label}
          </Link>
        </div>
        <p className="flow-fine">
          {copy.helpBefore}
          <Link href={RECOVERY.helpLink.href} prefetch={false}>
            {RECOVERY.helpLink.label}
          </Link>
        </p>
      </div>
    </section>
  );
}
