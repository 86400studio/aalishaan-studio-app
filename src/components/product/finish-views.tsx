"use client";

import type { ReactNode } from "react";

import { WHAT_YOU_RECEIVE } from "@/content/public/product";
import type { WallTile } from "@/lib/catalogue/product-model";

import { SPEC_SIZES, WALL_TILE_SIZES } from "./image-sizes";
import type { LightboxItem } from "./lightbox";
import { useProduct } from "./product-context";

/**
 * The lower sections' islands of the artwork page — S1.5 (prototype/product/r3.js:56–60, :62–72, :112; ported, never
 * imported): the pictures that follow the selected finish (the craft card, the Lantern's room photo) and the buttons
 * that open the lightbox (the moodboard's tiles, the A2 comparison, the paper card). Everything else of those sections
 * is server-rendered (src/components/product/product-page.tsx).
 */

/**
 * What you'll receive → "Handcrafted wooden frame": the selected finish's craft picture, alt and name
 * (`#craft-image`, `#craft-name` — r3.js:56–57).
 */
export function CraftSpec() {
  const { option } = useProduct();
  return (
    <figure className="pd-spec">
      {/* eslint-disable-next-line @next/next/no-img-element -- the prototype's <img> markup ported verbatim; next/image is not used (D-48) */}
      <img
        src={option.craft.image.src}
        srcSet={option.craft.image.srcSet ?? undefined}
        sizes={option.craft.image.srcSet ? SPEC_SIZES : undefined}
        alt={option.craft.alt}
        width={1254}
        height={1254}
        loading="lazy"
        decoding="async"
        id="craft-image"
      />
      <figcaption>
        <h3>{WHAT_YOU_RECEIVE.frame.heading}</h3>
        <p>
          <span id="craft-name">{option.name}</span>
          {WHAT_YOU_RECEIVE.frame.afterName}
        </p>
      </figcaption>
    </figure>
  );
}

/**
 * The size guide's figure (`#room-image`, `#room-caption`): the plain A2 sheet of the artwork's first room and
 * orientation, or — for the Lantern — the selected finish's room photo (r3.js:58–59). Nothing where the prototype
 * holds no sheet for that room and orientation.
 */
export function SizeGuideVisual() {
  const { option } = useProduct();
  const figure = option.sizeGuide;
  if (!figure) return null;
  return (
    <figure
      className={
        figure.room
          ? "pd-space__visual pd-space__visual--room"
          : "pd-space__visual"
      }
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- the prototype's <img> markup ported verbatim; next/image is not used (D-48) */}
      <img
        src={figure.image.src}
        alt={figure.alt}
        width={figure.width}
        height={figure.height}
        loading="lazy"
        decoding="async"
        id="room-image"
      />
      <figcaption id="room-caption">{figure.caption}</figcaption>
    </figure>
  );
}

/**
 * A button that opens one picture in the lightbox (the prototype's `[data-zoom-src]`, r3.js:112): the A2 comparison
 * of the size guide and the paper card of What you'll receive. Its children are the server-rendered contents.
 */
export function ZoomButton({
  item,
  className,
  label,
  children,
}: {
  item: LightboxItem;
  className?: string;
  /** The accessible name where the contents are only a picture (the paper card). */
  label?: string;
  children: ReactNode;
}) {
  const { openLightbox } = useProduct();
  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      onClick={() => openLightbox([item], 0)}
    >
      {children}
    </button>
  );
}

/**
 * The moodboard's grid (`#wall-grid`, r3.js:62–72): six finish-independent tiles; a tile opens the lightbox over all
 * six at its own picture.
 */
export function WallGrid({ tiles }: { tiles: readonly WallTile[] }) {
  const { openLightbox } = useProduct();
  const items = tiles.map((tile) => ({
    src: tile.zoom,
    alt: tile.alt,
    caption: tile.caption,
  }));
  return (
    <div className="pd-wall__grid" id="wall-grid">
      {tiles.map((tile, index) => (
        <figure
          key={tile.caption}
          className={tile.large ? "pd-tile pd-tile--large" : "pd-tile"}
          data-fit={tile.fit}
        >
          <button
            type="button"
            aria-label={tile.enlargeLabel}
            onClick={() => openLightbox(items, index)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- the prototype's <img> markup ported verbatim; next/image is not used (D-48) */}
            <img
              src={tile.image.src}
              srcSet={tile.image.srcSet ?? undefined}
              sizes={tile.image.srcSet ? WALL_TILE_SIZES : undefined}
              alt={tile.alt}
              loading="lazy"
              decoding="async"
            />
          </button>
          <figcaption>{tile.caption}</figcaption>
        </figure>
      ))}
    </div>
  );
}
