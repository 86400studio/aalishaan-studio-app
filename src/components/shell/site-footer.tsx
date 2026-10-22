import Link from "next/link";

import { BRAND, FOOTER, FOOTER_CTA } from "@/content/public/shell";
import { NEWSLETTER_FORM } from "@/content/public/strings";
import { siteImage, siteImageSrcSet } from "@/lib/site-images";

/**
 * The E7 / R13 footer — S1.3 (docs/DESIGN.md §4 "Footer"; prototype/index.html:743–768, revision-r11.css
 * 43–82). Five columns with the mobile-only Legal column and the centred mobile brand (M5); the five social
 * marks have no destination (D-PRE-12); the newsletter form is rendered disabled with NS-02 until S2.12; the
 * decorative watercolour strip of earlier revisions is not reintroduced (M3). The photo-led CTA band is
 * Home-only (`home`), and on Home the brand mark is the in-page link to the top (prototype/index.html:761).
 */
export function SiteFooter({ home = false }: { home?: boolean }) {
  const mark = (
    // eslint-disable-next-line @next/next/no-img-element -- the prototype's <img> markup ported verbatim; next/image is not used (D-48)
    <img
      src={BRAND.logo.src}
      // The footer mark is 220 CSS px wide at every width (storefront.css): the 450 px copy at 2× (S1.3b, D-19).
      srcSet={BRAND.logo.srcSet}
      sizes="220px"
      width={BRAND.logo.width}
      height={BRAND.logo.height}
      alt={BRAND.logoAlt}
      loading="lazy"
      decoding="async"
    />
  );
  return (
    <footer className="site-footer" id="practical">
      {home ? <FooterCta /> : null}
      <div className="footer-watercolour">
        <div className="container footer-main">
          <div className="footer-brand">
            {home ? (
              <a
                className="footer-brand__mark"
                href="#top"
                aria-label={BRAND.backToTopLabel}
              >
                {mark}
              </a>
            ) : (
              <Link
                className="footer-brand__mark"
                href="/"
                prefetch={false}
                aria-label={BRAND.backToTopLabel}
              >
                {mark}
              </Link>
            )}
            <p>
              {FOOTER.tagline[0]}
              <br />
              {FOOTER.tagline[1]}
            </p>
            <div className="footer-socials" aria-label={FOOTER.socialsLabel}>
              {FOOTER.socials.map((name) => (
                <span
                  key={name}
                  className="footer-social"
                  role="img"
                  aria-label={name}
                  title={name}
                >
                  <SocialIcon name={name} />
                </span>
              ))}
            </div>
          </div>
          {FOOTER.columns.map((column) => (
            <div className="footer-column" key={column.heading}>
              <h2>{column.heading}</h2>
              <ul className="footer-links">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} prefetch={false}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="footer-column footer-mobile-legal">
            <h2>{FOOTER.mobileLegal.heading}</h2>
            <ul className="footer-links">
              {FOOTER.mobileLegal.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} prefetch={false}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="footer-column footer-newsletter">
            <h2>{FOOTER.newsletter.heading}</h2>
            <p>{FOOTER.newsletter.body}</p>
            {/* NS-02: disabled controls, no handler, nothing submits (D-PRE-20) until S2.12. */}
            <form className="newsletter-form">
              <div>
                <input
                  name="subscriber"
                  type="email"
                  autoComplete="email"
                  placeholder={FOOTER.newsletter.placeholder}
                  aria-label={FOOTER.newsletter.inputLabel}
                  disabled
                />
                <button
                  type="submit"
                  disabled
                  aria-label={NEWSLETTER_FORM.submitLabel}
                >
                  →
                </button>
              </div>
              <p className="newsletter-note">{NEWSLETTER_FORM.note}</p>
              <p role="status" className="newsletter-status"></p>
            </form>
          </div>
        </div>
        <div className="container footer-bottom">
          <div className="footer-identity">
            <span>{FOOTER.copyright}</span>
          </div>
          <nav className="footer-bottom__links" aria-label={FOOTER.legalLabel}>
            {FOOTER.legal.map((link) => (
              <Link key={link.href} href={link.href} prefetch={false}>
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}

function FooterCta() {
  return (
    <div className="footer-cta">
      {/* eslint-disable-next-line @next/next/no-img-element -- the prototype's <img> markup ported verbatim; next/image is not used (D-48) */}
      <img
        className="footer-photo"
        src={siteImage("card-3-artstyle", "1200")}
        srcSet={siteImageSrcSet("card-3-artstyle", [
          ["600", "600w"],
          ["1200", "1122w"],
        ])}
        sizes="(max-width: 600px) calc(100vw - 36px), (max-width: 900px) 70vw, 33vw"
        width={1122}
        height={1402}
        alt={FOOTER_CTA.photoAlt}
        loading="lazy"
        decoding="async"
      />
      <div className="footer-cta-content">
        <span className="eyebrow eyebrow--light">{FOOTER_CTA.eyebrow}</span>
        <h2>{FOOTER_CTA.heading}</h2>
        <span className="footer-rule" aria-hidden="true"></span>
        <p>{FOOTER_CTA.body}</p>
        <nav className="footer-rooms" aria-label={FOOTER_CTA.roomsLabel}>
          {FOOTER_CTA.rooms.map((room) => (
            <Link key={room.href} href={room.href} prefetch={false}>
              {room.label} <span aria-hidden="true">↗</span>
            </Link>
          ))}
        </nav>
        <div className="footer-cta-actions">
          <Link
            className="button button--primary"
            href={FOOTER_CTA.primary.href}
            prefetch={false}
          >
            {FOOTER_CTA.primary.label} <span aria-hidden="true">→</span>
          </Link>
          <Link
            className="footer-help"
            href={FOOTER_CTA.help.href}
            prefetch={false}
          >
            {FOOTER_CTA.help.label}
          </Link>
        </div>
      </div>
    </div>
  );
}

/** The five inline marks of prototype/index.html (stroke icons, no destinations — D-PRE-12). */
function SocialIcon({ name }: { name: string }) {
  switch (name) {
    case "Instagram":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="1" />
        </svg>
      );
    case "Facebook":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M14 21v-8h3l.5-4H14V7c0-1 1-1.5 2-1.5h2V2h-3c-4 0-5 2.5-5 5v2H7v4h3v8" />
        </svg>
      );
    case "Pinterest":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 21 11 8m0 7c7 4 11-7 6-11C10-2 1 5 5 13m6-4c0-5 6-3 5 1s-5 5-5 1" />
        </svg>
      );
    case "YouTube":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="2" y="5" width="20" height="14" rx="4" />
          <path d="m10 9 6 3-6 3Z" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 9v12M4 3v1M10 21V9m0 4c0-6 10-6 10 1v7" />
        </svg>
      );
  }
}
