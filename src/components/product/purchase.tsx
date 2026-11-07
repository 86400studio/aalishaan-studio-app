"use client";

import { useEffect, useState } from "react";

import { PRODUCT_HERO, STICKY_BAR } from "@/content/public/product";

import { FRAME_SWATCH_SIZES } from "./image-sizes";
import { useProduct } from "./product-context";

/**
 * The purchase islands of the artwork page — S1.5; the frozen page's buy column and overlays
 * (prototype/scripts/build-products.cjs:138–150, :167) with prototype/product/r3.js:52–57, :84–87, :114–140 (ported,
 * never imported). Each reads the one selected finish of src/components/product/product-context.tsx.
 */

/** `p.pd-price` — the selected variant's price from integer paise (or NS-29), announced politely when it changes. */
export function ProductPrice() {
  const { option, priceLabel } = useProduct();
  return (
    <p className="pd-price">
      <strong id="product-price" aria-live="polite">
        {priceLabel(option)}
      </strong>
    </p>
  );
}

/**
 * `fieldset.pd-frames` — one radio per finish, the suggested first (build-products.cjs:54), each with its swatch, its
 * name and its price; the selected label carries `is-selected`. A change selects the finish everywhere and is
 * remembered for the tab.
 */
export function FramePicker() {
  const { product, finish, selectFinish, priceLabel } = useProduct();
  return (
    <fieldset className="pd-frames">
      <legend>{PRODUCT_HERO.frameLegend}</legend>
      <div className="pd-frames__options">
        {product.finishOrder.map((code) => {
          const option = product.finishes[code];
          const selected = code === finish;
          return (
            <label
              key={code}
              className={selected ? "pd-frame is-selected" : "pd-frame"}
            >
              <input
                type="radio"
                name="frame"
                value={code}
                checked={selected}
                onChange={() => selectFinish(code)}
              />
              {/* eslint-disable-next-line @next/next/no-img-element -- the prototype's <img> markup ported verbatim; next/image is not used (D-48) */}
              <img
                src={option.swatch.src}
                srcSet={option.swatch.srcSet ?? undefined}
                sizes={option.swatch.srcSet ? FRAME_SWATCH_SIZES : undefined}
                alt=""
                width={1254}
                height={1254}
                loading="lazy"
                decoding="async"
              />
              <span>{option.name}</span>
              <span className="pd-frame-price">{priceLabel(option)}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** The main "Add to cart" (`#main-cta`); disabled while the selected finish is not available to order. */
export function AddToCartButton() {
  const { option, addSelected } = useProduct();
  return (
    <button
      type="button"
      className="button button--primary pd-add"
      id="main-cta"
      data-add=""
      disabled={!option.available}
      onClick={addSelected}
    >
      {PRODUCT_HERO.addToCart}
    </button>
  );
}

/** `#pd-notice` — the add's status line (r3.js:126–130), fixed at the bottom; `role=status`, polite. */
export function ProductNotice() {
  const { notice } = useProduct();
  return (
    <div
      id="pd-notice"
      className="pd-notice"
      role="status"
      aria-live="polite"
      data-open={notice.open ? "true" : undefined}
    >
      {notice.text}
    </div>
  );
}

const STICKY_MAX_WIDTH = 900; // r3.js:138
const FOOTER_CLEARANCE = 40;

/**
 * The phone purchase bar (`#pd-sticky`, r3.js:133–140): shown at ≤ 900 px once the main "Add to cart" has scrolled
 * above the viewport and while the footer's top is more than 40 px below the viewport's bottom — evaluated on load,
 * scroll and resize. The stylesheet hides it while a drawer or a dialog is open (r3.css:163). Its button adds the
 * selected variant like the main one.
 */
export function StickyBar() {
  const { product, option, priceLabel, addSelected } = useProduct();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const update = () => {
      const cta = document.getElementById("main-cta");
      if (!cta) return;
      const footer = document.querySelector(".site-footer");
      const footerTop = footer
        ? footer.getBoundingClientRect().top
        : Number.POSITIVE_INFINITY;
      setVisible(
        window.innerWidth <= STICKY_MAX_WIDTH &&
          cta.getBoundingClientRect().bottom < 0 &&
          footerTop > window.innerHeight - FOOTER_CLEARANCE,
      );
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <div id="pd-sticky" className="pd-sticky" data-visible={String(visible)}>
      <div>
        <strong>{product.title}</strong>
        <small>
          {STICKY_BAR.size}
          {STICKY_BAR.separator}
          <span id="sticky-frame">{option.name}</span>
          {STICKY_BAR.separator}
          <span id="sticky-price">{priceLabel(option)}</span>
        </small>
      </div>
      <button
        type="button"
        className="button button--primary"
        data-add=""
        disabled={!option.available}
        onClick={addSelected}
      >
        {PRODUCT_HERO.addToCart}
      </button>
    </div>
  );
}
