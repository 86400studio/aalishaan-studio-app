import { siteImage, type SiteImageKey } from "@/lib/site-images";

/**
 * One specification row of Home's materials figure (docs/DESIGN.md §3 "Spec card"; prototype/index.html:
 * 567–594): the swatch, the numbered title and the line. The A2 size row's swatch opens the comparison image
 * in a new tab (the prototype's `spec__swatch--size`). Reused by the product page at S1.5 ("What you'll
 * receive").
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

export function SpecCard({ spec, number }: { spec: Spec; number: number }) {
  const copy = NATIVE[spec.image] ?? CRAFT;
  const src = siteImage(spec.image, copy.size);
  const image = (
    <img
      src={src}
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
          rel="noopener"
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
