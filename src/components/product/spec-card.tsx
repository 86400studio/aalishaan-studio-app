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
 * The swatch draws its picture in a small box — 84 × 84 CSS px in the desktop figure, 96 px wide and 112–145 px
 * tall in the phone cards (`object-fit: cover` on a square picture, so it fills the box's longer side; the size
 * comparison is `contain`, so it fills the box's width). S1.3b (D-19) offers delivery copies sized to those
 * boxes instead of sending the full picture: `SWATCH_SIZES` names the box, the browser picks the copy for its
 * pixel ratio. `src` stays the full copy — the size row's link opens it. S1.5 measures its own boxes when the
 * product page reuses this card.
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

/** The drawn box: up to 145 CSS px at ≤ 900 px (the phone cards, square pictures filling a 96 × 112–145 box), 84 px above. */
const SWATCH_SIZES = "(max-width: 900px) 145px, 84px";
/** The size comparison fills the box's width: 96 px at ≤ 900 px, 84 px above. */
const SIZE_SWATCH_SIZES = "(max-width: 900px) 96px, 84px";

function swatchSrcSet(image: SiteImageKey): string {
  return image === "size-comparison-a2"
    ? siteImageSrcSet(image, [
        ["200", "200w"],
        ["400", "400w"],
      ])
    : siteImageSrcSet(image, [
        ["160", "160w"],
        ["320", "320w"],
        ["480", "480w"],
      ]);
}

export function SpecCard({ spec, number }: { spec: Spec; number: number }) {
  const copy = NATIVE[spec.image] ?? CRAFT;
  const src = siteImage(spec.image, copy.size);
  const image = (
    // eslint-disable-next-line @next/next/no-img-element -- the prototype's <img> markup ported verbatim; next/image is not used (D-48)
    <img
      src={src}
      srcSet={swatchSrcSet(spec.image)}
      sizes={
        spec.image === "size-comparison-a2" ? SIZE_SWATCH_SIZES : SWATCH_SIZES
      }
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
