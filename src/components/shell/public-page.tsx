import type { CSSProperties, ReactNode } from "react";

import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

/**
 * One public page: the shared header, the main landmark and the shared footer, inside the wrapper that
 * carries the prototype's body classes for that page (docs/DESIGN.md §4: "Per-page variation is limited to
 * body-class scoping"). Home carries none; every other S1.3 page is `browse-page utility-page` plus its own
 * family class, exactly as prototype/pages/** render them; the S1.4 browse pages are `browse-page` alone, and their
 * `<main>`, like Home's, has no class — each section brings its own container and the hero is full-bleed
 * (prototype/scripts/build-browse.cjs:58) — and their footer shows Home's CTA band, as the frozen browse pages do. The
 * S1.5 artwork pages (and `/product`) are `browse-page product-page` with `<main class="pd">` and the same CTA band
 * (prototype/pages/artworks/<slug>/index.html; build-products.cjs:7 copies Shop All's shell) — the frozen cascade
 * styles the shared footer through `.product-page .site-footer`, so the class must sit on this wrapper.
 */
export type PageVariant =
  | "home"
  | "browse" // shop all, the collections and art styles hubs and their detail pages: browse-page only
  | "product" // the 22 artwork pages and /product: browse-page product-page, main.pd
  | "help-hub" // about: browse-page utility-page help-page help-brand
  | "help" // help: the same classes as the hub
  | "help-article" // the seven policies
  | "contact" // help-page without help-brand
  | "studio"
  | "commerce" // track
  | "recovery"; // 404 / 500

const VARIANT_CLASSES: Record<PageVariant, string> = {
  home: "page page--home",
  browse: "page browse-page",
  product: "page browse-page product-page",
  "help-hub": "page browse-page utility-page help-page help-brand",
  help: "page browse-page utility-page help-page help-brand",
  "help-article":
    "page browse-page utility-page help-page help-article-page help-brand",
  contact: "page browse-page utility-page help-page",
  studio: "page browse-page utility-page studio-page",
  commerce: "page browse-page utility-page commerce-page",
  recovery: "page browse-page utility-page recovery-page",
};

export function PublicPage({
  variant,
  style,
  children,
}: {
  variant: PageVariant;
  /** Custom properties a page family's CSS reads (the image URLs of D-48), inherited by the page. */
  style?: CSSProperties;
  children: ReactNode;
}) {
  const home = variant === "home";
  const ctaBand = home || variant === "browse" || variant === "product";
  return (
    <div className={VARIANT_CLASSES[variant]} style={style}>
      <SiteHeader home={home} />
      {variant === "product" ? (
        <main id="main" className="pd">
          {children}
        </main>
      ) : home || variant === "browse" ? (
        <main id="main">{children}</main>
      ) : (
        <main id="main" className="container utility-main">
          {children}
        </main>
      )}
      <SiteFooter home={home} cta={ctaBand} />
    </div>
  );
}
