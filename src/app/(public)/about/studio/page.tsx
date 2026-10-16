import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";

import { PublicPage } from "@/components/shell/public-page";
import { Eyebrow } from "@/components/ui/eyebrow";
import { STUDIO, STUDIO_HEAD } from "@/content/public/pages";
import { siteImage, type SiteImageKey } from "@/lib/site-images";

/**
 * About the Studio — S1.3 (docs/TECH-ARCHITECTURE.md §3a `/about/studio`; the signed-off editorial article,
 * D-PRE-17; prototype/pages/about/studio/index.html from prototype/scripts/studio-content.cjs). The hero and
 * the five section pictures are the responsive copies of the prototype's PNG sources (D-48).
 */
export const metadata: Metadata = {
  title: STUDIO_HEAD.title,
  description: STUDIO_HEAD.description,
};

const HERO_STYLE = {
  "--site-image-about-page-hero-1600": `url("${siteImage("about-page-hero", "1600")}")`,
  "--site-image-about-page-hero-600": `url("${siteImage("about-page-hero", "600")}")`,
  "--site-image-card-2-collection-1600": `url("${siteImage("card-2-collection", "1600")}")`,
} as CSSProperties;

export default function StudioPage() {
  return (
    <PublicPage variant="studio">
      <section
        className="editorial-hero studio-hero studio-hero--r11"
        style={HERO_STYLE}
      >
        <div>
          <Eyebrow>{STUDIO.hero.eyebrow}</Eyebrow>
          <h1>{STUDIO.hero.heading}</h1>
          <p>{STUDIO.hero.body}</p>
          <a className="button button--primary" href={STUDIO.hero.action.href}>
            {STUDIO.hero.action.label} <span aria-hidden="true">↓</span>
          </a>
        </div>
      </section>
      <nav className="studio-nav" aria-label={STUDIO.navLabel}>
        {STUDIO.nav.map((item) => (
          <a href={item.href} key={item.href}>
            {item.label}
          </a>
        ))}
      </nav>
      {STUDIO.sections.map((section) => (
        <section
          id={section.id}
          className={
            "reverse" in section && section.reverse
              ? "studio-section studio-section--reverse"
              : "studio-section"
          }
          key={section.id}
        >
          <div className="studio-image">
            <img
              src={siteImage(
                section.image.key as SiteImageKey,
                section.image.size,
              )}
              alt={section.alt}
              loading="lazy"
              decoding="async"
            />
          </div>
          <div className="studio-copy">
            <Eyebrow>{section.eyebrow}</Eyebrow>
            <h2>{section.heading}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {"link" in section ? (
              <Link
                className="text-link"
                href={section.link.href}
                prefetch={false}
              >
                {section.link.label}
              </Link>
            ) : null}
            {"facts" in section ? (
              <div className="studio-facts">
                {section.facts.map((fact) => (
                  <span key={fact}>{fact}</span>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      ))}
      <section id={STUDIO.purpose.id} className="studio-purpose">
        <Eyebrow>{STUDIO.purpose.eyebrow}</Eyebrow>
        <h2>{STUDIO.purpose.heading}</h2>
        <div>
          {STUDIO.purpose.columns.map((column) => (
            <article key={column.heading}>
              <h3>{column.heading}</h3>
              <p>{column.body}</p>
            </article>
          ))}
        </div>
        <Link
          className="button button--primary"
          href={STUDIO.purpose.action.href}
          prefetch={false}
        >
          {STUDIO.purpose.action.label} <span aria-hidden="true">→</span>
        </Link>
      </section>
    </PublicPage>
  );
}
