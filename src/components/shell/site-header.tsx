"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { BRAND, HEADER, PRIMARY_NAV } from "@/content/public/shell";

import { DrawerTrigger } from "./overlays";

/**
 * The locked public header — S1.3 (docs/DESIGN.md §4 "Header"; prototype/index.html:505–533). Fixed and
 * transparent over Home, solidifying at `scrollY > 24` (`data-stuck`); sticky and white on every other page
 * (`.browse-page`, by CSS). Desktop: logo left, the four plain links centred, cart and the outlined "Track
 * order" right. ≤ 900 px (signed off, D-PRE-04): menu left, logo centred, cart right, Track inside the menu.
 * On Home the logo is the in-page link to the top (prototype/index.html:512), elsewhere the way home.
 */
export function SiteHeader({ home = false }: { home?: boolean }) {
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const update = () => setStuck(window.scrollY > 24);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <header
      className="site-header"
      id="site-header"
      data-stuck={stuck ? "true" : "false"}
    >
      <div className="nav-shell">
        <DrawerTrigger
          drawer="mobile-nav"
          className="icon-button mobile-menu-trigger"
          label={HEADER.menuOpen}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </DrawerTrigger>

        {home ? (
          <a className="brand-logo" href="#top" aria-label={BRAND.homeLabel}>
            <BrandLogo />
          </a>
        ) : (
          <Link
            className="brand-logo"
            href="/"
            prefetch={false}
            aria-label={BRAND.homeLabel}
          >
            <BrandLogo />
          </Link>
        )}

        <nav className="primary-nav" aria-label="Primary">
          <ul className="primary-nav__list">
            {PRIMARY_NAV.map((item) => (
              <li key={item.href}>
                <Link className="nav-link" href={item.href} prefetch={false}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="utility-nav">
          <DrawerTrigger
            drawer="cart-drawer"
            className="icon-button"
            label={HEADER.cartOpen(0)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3.5 5h2l1.7 9.3a2 2 0 0 0 2 1.7h7.9a2 2 0 0 0 2-1.7L20.5 8H6.1" />
              <circle cx="9.5" cy="19" r="1" />
              <circle cx="17.5" cy="19" r="1" />
            </svg>
            <span className="cart-count" aria-hidden="true">
              0
            </span>
          </DrawerTrigger>
          <Link className="nav-cta" href={HEADER.trackHref} prefetch={false}>
            {HEADER.trackOrder}
          </Link>
        </div>
      </div>
    </header>
  );
}

/**
 * The header logo is drawn 2.05rem tall, 1.7rem up to 47.9375rem and 2.5rem from 75rem (storefront.css), so at the
 * logo's 3 : 1 it is 6.15rem, 5.1rem and 7.5rem wide (98.4, 81.6 and 120 CSS px at the default 16 px font size).
 * `sizes` names those widths in rem, so a larger default font size widens the slot as it widens the box, and a phone
 * takes the 240 px copy, not the 417 KB PNG (S1.3b, D-19); React's preload of this eager image follows the same
 * srcset.
 */
const HEADER_LOGO_SIZES =
  "(min-width: 75rem) 7.5rem, (max-width: 47.9375rem) 5.1rem, 6.15rem";

function BrandLogo() {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- the prototype's <img> markup ported verbatim; next/image is not used (D-48)
    <img
      src={BRAND.logo.src}
      srcSet={BRAND.logo.srcSet}
      sizes={HEADER_LOGO_SIZES}
      width={BRAND.logo.width}
      height={BRAND.logo.height}
      alt={BRAND.logoAlt}
      decoding="async"
    />
  );
}
