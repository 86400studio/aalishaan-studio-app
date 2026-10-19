import type { Metadata } from "next";
import type { CSSProperties } from "react";

import { ArtCard } from "@/components/home/art-card";
import { HomeOpening } from "@/components/home/opening";
import { HomeRoutes } from "@/components/home/routes";
import { PublicPage } from "@/components/shell/public-page";
import { ButtonLink } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { FaqItem } from "@/components/ui/faq-accordion";
import { FEATURED, HOME_FAQ, HOME_HEAD, JOURNEY } from "@/content/public/home";
import { siteImage } from "@/lib/site-images";

/**
 * Home — S1.3 (docs/TECH-ARCHITECTURE.md §3a `/`; docs/DESIGN.md §5 "Home"): the opening with the
 * wall-to-materials handoff, the three shopping routes, the three featured artworks, the six-step journey
 * and the five "Before you buy" answers, in the order and markup of prototype/index.html. The holding page
 * of S0.2 (NS-17) is replaced here; the storefront stays `noindex` until S3.4 (root layout).
 */
export const metadata: Metadata = {
  title: HOME_HEAD.title,
  description: HOME_HEAD.description,
};

const FAQ_STYLE = {
  "--site-image-before-you-buy": `url("${siteImage("before-you-buy", "native")}")`,
} as CSSProperties;

// prototype/index.html:499 (DESIGN §6 "No-JS fallbacks"): without JavaScript the hearts cannot save, so they are
// hidden; and the specification numbers, which the prototype's script writes, stay off with their markers.
const NO_SCRIPT_CSS =
  ".wishlist{display:none}.spec__title[data-number]::before{content:none}";

export default function HomePage() {
  return (
    <PublicPage variant="home">
      <noscript>
        <style>{NO_SCRIPT_CSS}</style>
      </noscript>
      <HomeOpening />
      <HomeRoutes />

      <section
        className="section section--white featured"
        id="featured"
        aria-labelledby="featured-title"
      >
        <div className="container">
          <div className="section-heading">
            <div>
              <Eyebrow>{FEATURED.eyebrow}</Eyebrow>
              <h2 id="featured-title">{FEATURED.heading}</h2>
            </div>
            <p>{FEATURED.body}</p>
          </div>
          <div className="featured__grid">
            {FEATURED.cards.map((card) => (
              <ArtCard key={card.slug} {...card} />
            ))}
          </div>
          <div className="featured__action">
            <ButtonLink href={FEATURED.action.href} variant="secondary">
              {FEATURED.action.label}
            </ButtonLink>
          </div>
        </div>
      </section>

      <section
        className="section section--ink journey"
        id="journey"
        aria-labelledby="journey-title"
      >
        <div className="container">
          <div className="journey__head">
            <h2 id="journey-title">{JOURNEY.heading}</h2>
          </div>
          <ol className="journey__rail">
            {JOURNEY.steps.map((step) => (
              <li className="step" key={step.index}>
                <span className="step__node" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    {"circles" in step
                      ? step.circles.map((c) => (
                          <circle key={c.cx} cx={c.cx} cy={c.cy} r={c.r} />
                        ))
                      : null}
                    {"rects" in step
                      ? step.rects.map((r) => (
                          <rect
                            key={`${r.x}-${r.y}`}
                            x={r.x}
                            y={r.y}
                            width={r.width}
                            height={r.height}
                            rx={"rx" in r ? r.rx : undefined}
                          />
                        ))
                      : null}
                    {"icon" in step
                      ? step.icon.map((d) => <path key={d} d={d} />)
                      : null}
                  </svg>
                </span>
                <span className="step__index">{step.index}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
          <p className="journey__note">{JOURNEY.note}</p>
        </div>
      </section>

      <section
        className="section section--white faq"
        id="faq"
        aria-labelledby="faq-title"
      >
        <div className="container faq__grid">
          <div className="faq__aside">
            <div
              className="faq-illustration"
              aria-hidden="true"
              style={FAQ_STYLE}
            />
            <Eyebrow>{HOME_FAQ.eyebrow}</Eyebrow>
            <h2 id="faq-title">{HOME_FAQ.heading}</h2>
            <p>{HOME_FAQ.body}</p>
            <ButtonLink href={HOME_FAQ.action.href}>
              {HOME_FAQ.action.label}
            </ButtonLink>
          </div>
          <div className="faq__list">
            {HOME_FAQ.items.map((item, i) => (
              <FaqItem
                key={item.q}
                question={item.q}
                answer={item.a}
                open={i === 0}
              />
            ))}
          </div>
        </div>
      </section>
    </PublicPage>
  );
}
