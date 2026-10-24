import {
  siteImage,
  siteImageSrcSet,
  type SiteImageKey,
} from "@/lib/site-images";

/**
 * One specification row of Home's materials figure (docs/DESIGN.md §3 "Spec card"; prototype/index.html:
 * 567–594): the swatch, the numbered title and the line. The A2 size row's swatch opens the comparison image
 * in a new tab (the prototype's `spec__swatch--size`). Reused by the product page at S1.5 ("What you'll
 * receive").
 *
 * A craft swatch draws its square picture in a small box — 5.25rem square in the desktop figure (84 CSS px at the
 * default 16 px font size), 96 px wide and 112–145 px tall in the phone cards (`object-fit: cover`, so it fills the
 * box's longer side). S1.3b (D-19) offers
 * delivery copies sized to that box instead of the full 1254 px picture: `SWATCH_SIZES` names the box, the
 * browser picks the copy for its pixel ratio; `src` stays the full copy. The size comparison keeps its one full
 * copy (25 KB of line art, whose thin lines a smaller copy would lighten) — the size row's link opens it. S1.5
 * measures its own boxes when the product page reuses this card.
 */
export type Spec = {
  image: SiteImageKey;
  alt: string;
  title: string;
  line: string;
  /** The accessible name of the new-tab link; present on the size row only. */
  sizeLink?: string;
};

const NATIVE: Partial<
  Record<SiteImageKey, { size: string; width: number; height: number }>
> = {
  "size-comparison-a2": { size: "2048", width: 2048, height: 1035 },
};
const CRAFT = { size: "1254", width: 1254, height: 1254 };

/**
 * The drawn picture (measured at S1.3b at the default 16 px font size — on Linux in the cloud leg, again on Windows in
 * the VS Code leg): up to 145.1 CSS px from 299 to 900 px (the phone cards, square pictures filling a 96 × 112–145
 * box), up to 168.2 px from 280 to 298 px where wrapped text makes a card taller, 84 px above 900 px. The slots and
 * the narrow clause's breakpoint are in rem (11.875rem = 190 px, 9.125rem = 146 px, 5.25rem = 84 px and 19.3125rem =
 * 309 px at 16 px), as the swatch box and the text that sizes the cards are, so a larger default font size widens
 * both (measured at 20 px too — `tests/unit/site-images.test.ts`). Below 280 px, narrower than any phone the site
 * supports, a further line of text draws the picture wider (191.3 px at 262–271 px). The full 1254 px picture stays
 * the last candidate, so a need beyond 480 device pixels gets it, as S1.3 sent.
 */
const SWATCH_SIZES =
  "(max-width: 19.3125rem) 11.875rem, (max-width: 900px) 9.125rem, 5.25rem";

export function SpecCard({ spec, number }: { spec: Spec; number: number }) {
  const native = NATIVE[spec.image];
  const copy = native ?? CRAFT;
  const src = siteImage(spec.image, copy.size);
  const image = (
    // eslint-disable-next-line @next/next/no-img-element -- the prototype's <img> markup ported verbatim; next/image is not used (D-48)
    <img
      src={src}
      srcSet={
        native
          ? undefined
          : siteImageSrcSet(spec.image, [
              ["160", "160w"],
              ["320", "320w"],
              ["480", "480w"],
              [CRAFT.size, `${CRAFT.width}w`],
            ])
      }
      sizes={native ? undefined : SWATCH_SIZES}
      alt={spec.alt}
      width={copy.width}
      height={copy.height}
      loading="lazy"
      decoding="async"
    />
  );
  return (
    <div className="spec">
      {spec.sizeLink ? (
        <a
          className="spec__swatch spec__swatch--size"
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={spec.sizeLink}
        >
          {image}
        </a>
      ) : (
        <span className="spec__swatch">{image}</span>
      )}
      <span>
        <span className="spec__title" data-number={String(number)}>
          {spec.title}
        </span>
        <span className="spec__line">{spec.line}</span>
      </span>
    </div>
  );
}
