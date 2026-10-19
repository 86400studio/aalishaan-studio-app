import Link from "next/link";

import { RECOVERY } from "@/content/public/pages";
import { siteImage } from "@/lib/site-images";

/**
 * The recovery layout shared by the 404 and the 500 pages (prototype/404.html, 500.html — build-shop-flow.cjs;
 * docs/DESIGN.md §5 "Recovery"): the framed blossom artwork beside the eyebrow, the heading, the line, the two
 * actions and the support line. The picture is the prototype's `Hero Artwork.png`, served as its 1200 delivery
 * copy (D-48) with the prototype's markup — one source, no srcset.
 *
 * On the 500 the way home is a plain link: when Home itself failed, a client navigation to the same path
 * cannot clear the error boundary — a full page load does (as in global-error.tsx).
 */
export function Recovery({ kind }: { kind: "404" | "500" }) {
  const copy = RECOVERY[kind];
  return (
    <section className="recovery">
      <div className="recovery-art">
        {/* eslint-disable-next-line @next/next/no-img-element -- the prototype's <img> markup ported verbatim; next/image is not used (D-48) */}
        <img
          src={siteImage("hero-artwork", "1200")}
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
          {kind === "500" ? (
            // a plain link: a same-path client navigation cannot clear the error boundary; a full page load does
            <a className="button button--primary" href={RECOVERY.primary.href}>
              {RECOVERY.primary.label}
            </a>
          ) : (
            <Link
              className="button button--primary"
              href={RECOVERY.primary.href}
              prefetch={false}
            >
              {RECOVERY.primary.label}
            </Link>
          )}
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
