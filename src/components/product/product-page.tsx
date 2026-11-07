import Link from "next/link";

import { ArtCardView } from "@/components/catalogue/art-card";
import { DeliveryCheck } from "@/components/commerce/delivery-check";
import { PublicPage } from "@/components/shell/public-page";
import { ButtonLink } from "@/components/ui/button";
import { ART_CARD, CATALOGUE_STATES } from "@/content/public/browse";
import {
  ARTWORK_NOT_AVAILABLE,
  CLOSER_LOOK,
  DELIVERY_CHECK,
  PRODUCT_FAQ,
  PRODUCT_HERO,
  PRODUCT_NOSCRIPT,
  RELATED,
  SIZE_GUIDE,
  STORY,
  STYLE_ASIDE,
  WHAT_YOU_RECEIVE,
  type ProductFaq,
} from "@/content/public/product";
import type {
  ArtworkPageState,
  ProductView,
} from "@/lib/catalogue/product-model";
import { siteImage } from "@/lib/site-images";

import {
  CraftSpec,
  SizeGuideVisual,
  WallGrid,
  ZoomButton,
} from "./finish-views";
import { ProductGallery } from "./gallery";
import { RELATED_CARD_SIZES, SPEC_SIZES } from "./image-sizes";
import { ProductProvider } from "./product-context";
import {
  AddToCartButton,
  FramePicker,
  ProductNotice,
  ProductPrice,
  StickyBar,
} from "./purchase";

/**
 * One artwork page — S1.5 (docs/TECH-ARCHITECTURE.md §3a `/artworks/[slug]`, `/product`; the S1.5 record → H.2
 * "Entries"): the frozen generated page (prototype/pages/artworks/<slug>/index.html from
 * prototype/scripts/build-products.cjs — its final R5 / R12 layout, lines 131–166) in its sections and order: the
 * purchase hero, Size guide, A closer look (the R12 moodboard), What you'll receive, The artwork's story, FAQs and
 * More from this collection; then the add notice, the phone purchase bar, the lightbox and the no-JavaScript line.
 * Server-rendered from the page's validated projection row (src/lib/catalogue/product-model.ts) with the suggested
 * finish; the islands that follow the selected finish or open the lightbox are client components under one provider
 * (./product-context.tsx). The overlays sit inside `main.pd` here (the prototype draws them after the footer);
 * src/styles/product.css undoes `.pd`'s descendant rules for them.
 *
 * Without JavaScript every section, image and FAQ is readable; the frame choice, the views, the enlargement and the
 * cart do nothing, which the prototype's own line says (build-products.cjs:170); the hearts cannot save, so they are
 * hidden, as on Home and the browse pages (docs/DESIGN.md §6); the PIN field stays disabled
 * (src/components/commerce/delivery-check.tsx).
 */
const NO_SCRIPT_CSS = ".wishlist{display:none}";

function FaqAnswer({ answer }: { answer: ProductFaq["a"] }) {
  if (typeof answer === "string") return <p>{answer}</p>;
  return (
    <p>
      {answer.map((part) =>
        typeof part === "string" ? (
          part
        ) : (
          <Link key={part.href} href={part.href} prefetch={false}>
            {part.label}
          </Link>
        ),
      )}
    </p>
  );
}

export function ProductPage({ product }: { product: ProductView }) {
  return (
    <PublicPage variant="product">
      <ProductProvider
        product={{
          slug: product.slug,
          title: product.title,
          suggestedFinish: product.suggestedFinish,
          finishOrder: product.finishOrder,
          finishes: product.finishes,
        }}
      >
        <section
          className="container pd-hero pd-hero--purchase"
          aria-label={PRODUCT_HERO.sectionLabel}
        >
          <ProductGallery stage={product.stage} />
          <div className="pd-buy">
            <h1>{product.title}</h1>
            <p className="pd-hook">{product.hook}</p>
            <ProductPrice />
            <FramePicker />
            <p className="pd-recommendation">{product.recommendation}</p>
            <AddToCartButton />
            <p className="pd-reassurance">{PRODUCT_HERO.reassurance}</p>
            <DeliveryCheck variant="product" hint={DELIVERY_CHECK.hint} />
            <nav
              className="pd-section-nav"
              aria-label={PRODUCT_HERO.sectionNav.label}
            >
              {PRODUCT_HERO.sectionNav.links.map((link) => (
                <a
                  key={link.href}
                  className="button button--secondary"
                  href={link.href}
                >
                  {link.label}
                </a>
              ))}
            </nav>
          </div>
        </section>

        <section
          className="pd-section pd-section--ivory pd-space"
          id={SIZE_GUIDE.id}
          aria-labelledby="space-title"
        >
          <div className="container pd-space__grid">
            <SizeGuideVisual />
            <div className="pd-space__copy">
              <h2 id="space-title">{SIZE_GUIDE.heading}</h2>
              <p>{SIZE_GUIDE.body}</p>
              <div className="pd-size">
                <strong>{SIZE_GUIDE.size}</strong>
                <div>
                  <span>{product.dimensions.print}</span>
                  <small>{product.dimensions.detail}</small>
                </div>
              </div>
              <p className="pd-small">{SIZE_GUIDE.small}</p>
              <ZoomButton item={product.comparison} className="text-link">
                {SIZE_GUIDE.compare.label}
              </ZoomButton>
            </div>
          </div>
        </section>

        <section className="pd-section pd-wall" aria-labelledby="wall-title">
          <div className="container">
            <div className="pd-section__head">
              <div>
                <span className="eyebrow">{CLOSER_LOOK.eyebrow}</span>
                <h2 id="wall-title">{CLOSER_LOOK.heading}</h2>
              </div>
              <p>{CLOSER_LOOK.intro}</p>
            </div>
            <WallGrid tiles={product.wall} />
          </div>
        </section>

        <section
          className="pd-section pd-arrives"
          id={WHAT_YOU_RECEIVE.id}
          aria-labelledby="arrives-title"
        >
          <div className="container">
            <div className="pd-section__head">
              <div>
                <h2 id="arrives-title">{WHAT_YOU_RECEIVE.heading}</h2>
              </div>
              <p>{WHAT_YOU_RECEIVE.intro}</p>
            </div>
            <div className="pd-spec-grid">
              <figure className="pd-spec">
                <ZoomButton
                  item={product.paperCard.zoom}
                  label={WHAT_YOU_RECEIVE.paper.enlarge}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- the prototype's <img> markup ported verbatim; next/image is not used (D-48) */}
                  <img
                    src={product.paperCard.image.src}
                    srcSet={product.paperCard.image.srcSet ?? undefined}
                    sizes={
                      product.paperCard.image.srcSet ? SPEC_SIZES : undefined
                    }
                    alt={product.paperCard.alt}
                    width={1200}
                    height={1200}
                    loading="lazy"
                    decoding="async"
                  />
                </ZoomButton>
                <figcaption>
                  <h3>{WHAT_YOU_RECEIVE.paper.heading}</h3>
                  <p>{WHAT_YOU_RECEIVE.paper.body}</p>
                </figcaption>
              </figure>
              <CraftSpec />
              {(
                [
                  [WHAT_YOU_RECEIVE.glazing, product.materials.glazing],
                  [WHAT_YOU_RECEIVE.hanging, product.materials.hanging],
                ] as const
              ).map(([copy, image]) => (
                <figure className="pd-spec" key={copy.heading}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- the prototype's <img> markup ported verbatim; next/image is not used (D-48) */}
                  <img
                    src={image.src}
                    srcSet={image.srcSet ?? undefined}
                    sizes={image.srcSet ? SPEC_SIZES : undefined}
                    alt={copy.alt}
                    width={1254}
                    height={1254}
                    loading="lazy"
                    decoding="async"
                  />
                  <figcaption>
                    <h3>{copy.heading}</h3>
                    <p>{copy.body}</p>
                  </figcaption>
                </figure>
              ))}
            </div>
            <p className="pd-small">{WHAT_YOU_RECEIVE.footnote}</p>
          </div>
        </section>

        <section
          className="pd-section pd-section--ivory pd-story"
          id={STORY.id}
          aria-labelledby="story-title"
        >
          <div className="container pd-story__grid">
            <div className="pd-story__copy">
              <h2 id="story-title">{STORY.heading}</h2>
              <p className="pd-story-lead">{product.story.lead}</p>
              {product.story.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
            <aside className="pd-style" aria-labelledby="style-title">
              <span className="eyebrow">{STYLE_ASIDE.eyebrow}</span>
              <h3 id="style-title">{product.style.name}</h3>
              <p>{product.style.intro}</p>
              <p className="pd-print-note">{STYLE_ASIDE.printNote}</p>
              {product.style.palette.length > 0 ? (
                <div
                  className="pd-palette"
                  aria-label={STYLE_ASIDE.paletteLabel}
                >
                  {product.style.palette.map((swatch) => (
                    <span key={swatch.name}>
                      <i
                        style={{ background: swatch.colour }}
                        aria-hidden="true"
                      />
                      <span>{swatch.name}</span>
                    </span>
                  ))}
                </div>
              ) : null}
              <dl className="pd-meta">
                {product.style.meta.map((item) => (
                  <div key={item.label}>
                    <dt>{item.label}</dt>
                    <dd>{item.value}</dd>
                  </div>
                ))}
              </dl>
              <Link
                className="text-link"
                href={product.style.href}
                prefetch={false}
              >
                {product.style.seeAll}
              </Link>
            </aside>
          </div>
        </section>

        <section
          className="pd-section pd-section--ivory pd-help"
          id={PRODUCT_FAQ.id}
          aria-labelledby="help-title"
        >
          <div className="container pd-help__grid">
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element -- the prototype's <img> markup ported verbatim; next/image is not used (D-48) */}
              <img
                className="pd-faq-image"
                src={siteImage(PRODUCT_FAQ.image.key, PRODUCT_FAQ.image.size)}
                width={PRODUCT_FAQ.image.width}
                height={PRODUCT_FAQ.image.height}
                alt=""
                loading="lazy"
                decoding="async"
              />
              <span className="eyebrow">{PRODUCT_FAQ.eyebrow}</span>
              <h2 id="help-title">{PRODUCT_FAQ.heading}</h2>
              <p>{PRODUCT_FAQ.intro}</p>
              <ButtonLink href={PRODUCT_FAQ.contact.href}>
                {PRODUCT_FAQ.contact.label}
              </ButtonLink>
            </div>
            <div className="pd-faq">
              {PRODUCT_FAQ.items.map((item, index) => (
                <details
                  key={item.q}
                  className="r11-faq"
                  open={index === 0 || undefined}
                >
                  <summary>{item.q}</summary>
                  <FaqAnswer answer={item.a} />
                </details>
              ))}
            </div>
          </div>
        </section>

        {product.related.cards.length > 0 ? (
          <section
            className="pd-section pd-related"
            aria-labelledby="related-title"
          >
            <noscript>
              <style>{NO_SCRIPT_CSS}</style>
            </noscript>
            <div className="container">
              <div className="pd-section__head">
                <div>
                  <span className="eyebrow">{product.related.eyebrow}</span>
                  <h2 id="related-title">{RELATED.heading}</h2>
                </div>
                <Link
                  className="text-link"
                  href={product.related.href}
                  prefetch={false}
                >
                  {RELATED.open}
                </Link>
              </div>
              <div className="catalogue-grid pd-related__grid">
                {product.related.cards.map((card) => (
                  <ArtCardView
                    key={card.slug}
                    slug={card.slug}
                    title={card.title}
                    hook={card.hook}
                    label={ART_CARD.label}
                    view={ART_CARD.view}
                    price={{
                      frame: ART_CARD.frame(card.finishName),
                      amount: card.price ?? CATALOGUE_STATES.notAvailable,
                    }}
                    image={{
                      src: card.image.src,
                      srcSet: card.image.srcSet,
                      sizes: RELATED_CARD_SIZES,
                      alt: card.alt,
                      width: 1200,
                      height: 1200,
                    }}
                  />
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <ProductNotice />
        <StickyBar />
        <noscript>
          <p className="pd-noscript">{PRODUCT_NOSCRIPT}</p>
        </noscript>
      </ProductProvider>
    </PublicPage>
  );
}

/**
 * An approved artwork route the page cannot show — S1.5 (H.2 "Entries"), in the shared browse shell:
 *  - `not_available` — the projection answered without the artwork (Production until S3.3 loads the catalogue —
 *    D-48 —, a hidden or retired artwork): ARTWORK_NOT_AVAILABLE (NS-proposed) and the approved "Explore artworks";
 *  - `unavailable` — the page was built outside Vercel without the catalogue's configuration: the catalogue's NS-26
 *    state, as S1.4's pages render it (src/components/catalogue/catalogue-section.tsx).
 * Never TEST data, never a fallback artwork, never the framework's 404 (an approved route is a real page — §10 #23 (j)).
 */
export function ArtworkUnavailable({
  status,
}: {
  status: Exclude<ArtworkPageState["status"], "ok">;
}) {
  const state =
    status === "not_available"
      ? ARTWORK_NOT_AVAILABLE
      : CATALOGUE_STATES.unavailable;
  return (
    <PublicPage variant="browse">
      <section className="container catalogue artwork-unavailable">
        <div className="empty-results">
          <h1>{state.heading}</h1>
          <p>{state.body}</p>
          {status === "not_available" ? (
            <ButtonLink href={ARTWORK_NOT_AVAILABLE.action.href}>
              {ARTWORK_NOT_AVAILABLE.action.label}
            </ButtonLink>
          ) : null}
        </div>
      </section>
    </PublicPage>
  );
}
