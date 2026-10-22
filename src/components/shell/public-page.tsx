import type { CSSProperties, ReactNode } from "react";

import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

/**
 * One public page: the shared header, the main landmark and the shared footer, inside the wrapper that
 * carries the prototype's body classes for that page (docs/DESIGN.md §4: "Per-page variation is limited to
 * body-class scoping"). Home carries none; every other S1.3 page is `browse-page utility-page` plus its own
 * family class, exactly as prototype/pages/** render them.
 */
export type PageVariant =
  | "home"
  | "help-hub" // about: browse-page utility-page help-page help-brand
  | "help" // help: the same classes as the hub
  | "help-article" // the seven policies
  | "contact" // help-page without help-brand
  | "studio"
  | "commerce" // track
  | "recovery"; // 404 / 500

const VARIANT_CLASSES: Record<PageVariant, string> = {
  home: "page page--home",
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
  return (
    <div className={VARIANT_CLASSES[variant]} style={style}>
      <SiteHeader home={home} />
      {home ? (
        <main id="main">{children}</main>
      ) : (
        <main id="main" className="container utility-main">
          {children}
        </main>
      )}
      <SiteFooter home={home} />
    </div>
  );
}
