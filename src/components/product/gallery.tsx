"use client";

import {
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";

import { PRODUCT_HERO, type ProductViewKey } from "@/content/public/product";
import type { ProductView } from "@/lib/catalogue/product-model";

import { STAGE_SIZES, THUMB_SIZES } from "./image-sizes";
import { useProduct } from "./product-context";

/**
 * The hero gallery — S1.5; the frozen page's `div.pd-gallery` (prototype/scripts/build-products.cjs:72–73) with
 * prototype/product/r3.js:39–51, :75–83, :109–111 (ported, never imported; docs/DESIGN.md §3 "Product stage,
 * thumbnails"): the stage — a button that opens the lightbox on the selected view, the lightbox walking every view of
 * the selected finish — and the `role=tablist` of views (Framed, Frame detail, Paper detail[, Artwork, In a room][,
 * Scale guide]) with a roving tabindex: a click or ArrowLeft / ArrowRight (wrapping round), Home and End select and
 * focus a view (automatic activation; no Up / Down, no tabpanel — the tabs control the stage). The views follow the
 * selected finish (src/components/product/product-context.tsx). The stage image is the page's one eager image
 * (`fetchpriority=high`); the thumbnails load lazily with their own measured slots (./image-sizes.ts).
 */
export function ProductGallery({ stage }: { stage: ProductView["stage"] }) {
  const { option, openLightbox } = useProduct();
  const [selected, setSelected] = useState<ProductViewKey>("framed");
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);

  const views = option.views;
  // A view this finish lacks falls back to Framed (r3.js:41); every finish has the same views today.
  const index = Math.max(
    0,
    views.findIndex((view) => view.key === selected),
  );
  const current = views[index]!;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const from = tabs.current.findIndex(
      (tab) => tab === document.activeElement,
    );
    const last = views.length - 1;
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? last
          : (Math.max(from, 0) +
              (event.key === "ArrowRight" ? 1 : -1) +
              views.length) %
            views.length;
    setSelected(views[next]!.key);
    tabs.current[next]?.focus();
  };

  const enlarge = () =>
    openLightbox(
      views.map((view) => ({
        src: view.zoom,
        alt: view.alt,
        caption: view.caption,
      })),
      index,
    );

  return (
    <div
      className="pd-gallery"
      style={{ "--stage-ratio": stage.ratio } as CSSProperties}
    >
      <figure className="pd-stage">
        <button
          type="button"
          className="pd-stage__button"
          id="stage-button"
          data-fit={current.fit}
          aria-label={PRODUCT_HERO.stageLabel}
          onClick={enlarge}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- the prototype's <img> markup ported verbatim; next/image is not used (D-48) */}
          <img
            src={current.image.src}
            srcSet={current.image.srcSet ?? undefined}
            sizes={current.image.srcSet ? STAGE_SIZES : undefined}
            alt={current.alt}
            fetchPriority="high"
            decoding="async"
            id="stage-image"
            width={stage.width}
            height={stage.height}
          />
          <span className="pd-zoom-hint" aria-hidden="true">
            {PRODUCT_HERO.zoomHint}
          </span>
        </button>
      </figure>
      <div
        className="pd-thumbs"
        role="tablist"
        aria-label={PRODUCT_HERO.thumbsLabel}
        onKeyDown={onKeyDown}
      >
        {views.map((view, i) => {
          const isSelected = i === index;
          return (
            <button
              key={view.key}
              ref={(element) => {
                tabs.current[i] = element;
              }}
              role="tab"
              type="button"
              data-view={view.key}
              data-fit={view.fit}
              aria-selected={isSelected}
              tabIndex={isSelected ? 0 : -1}
              aria-controls="stage-button"
              onClick={() => setSelected(view.key)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- the prototype's <img> markup ported verbatim; next/image is not used (D-48) */}
              <img
                src={view.image.src}
                srcSet={view.image.srcSet ?? undefined}
                sizes={view.image.srcSet ? THUMB_SIZES : undefined}
                alt=""
                loading="lazy"
                decoding="async"
              />
              <span>{view.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
