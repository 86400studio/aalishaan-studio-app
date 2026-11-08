"use client";

import { useEffect, useRef, type MouseEvent, type KeyboardEvent } from "react";

import { LIGHTBOX } from "@/content/public/product";

/**
 * The artwork page's one zoom view — S1.5; the frozen page's `dialog#lightbox` (prototype/scripts/
 * build-products.cjs:167) with the behaviour of prototype/product/r3.js:89–112 (ported, never imported; docs/DESIGN.md
 * §6): a native modal `<dialog>` (`showModal()` makes the rest of the page inert and traps focus), focus on "Close ✕"
 * when it opens, the caption "<caption> · n of N", previous / next buttons (hidden for a single image) and
 * ArrowLeft / ArrowRight wrapping round, Escape (the dialog's own cancel), a click on the backdrop, the frame or the
 * figure closes it; closing restores the page's scroll, empties the image and returns focus to the control that opened
 * it. The images are the largest copies Storage holds (the owner's amendment H.1 #2), never the prototype's PNGs.
 * State lives in src/components/product/product-context.tsx, whose `openLightbox` the openers call.
 */
export type LightboxItem = { src: string; alt: string; caption: string };

export type LightboxState = {
  items: readonly LightboxItem[];
  index: number;
  /** The focused element when it opened, focused again when it closes. */
  opener: Element | null;
} | null;

export function Lightbox({
  state,
  onStep,
  onClosed,
}: {
  state: LightboxState;
  onStep: (direction: 1 | -1) => void;
  onClosed: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const overflow = useRef("");
  const opener = useRef<Element | null>(null);
  const isOpen = state !== null;
  const stateOpener = state?.opener ?? null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !isOpen || dialog.open) return;
    opener.current = stateOpener;
    overflow.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    closeRef.current?.focus();
  }, [isOpen, stateOpener]);

  // Leaving the page while it is open still gives the page its scroll back.
  useEffect(() => {
    const dialog = dialogRef.current;
    const saved = overflow;
    return () => {
      if (dialog?.open) document.body.style.overflow = saved.current;
    };
  }, []);

  const onClose = () => {
    document.body.style.overflow = overflow.current;
    onClosed();
    const target = opener.current;
    opener.current = null;
    if (target instanceof HTMLElement && target.isConnected) target.focus();
  };

  const close = () => dialogRef.current?.close();

  const onClick = (event: MouseEvent<HTMLDialogElement>) => {
    const target = event.target as HTMLElement;
    if (
      target === event.currentTarget ||
      target.classList.contains("pd-lightbox__inner") ||
      target.tagName === "FIGURE"
    )
      close();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === "ArrowLeft") onStep(-1);
    if (event.key === "ArrowRight") onStep(1);
  };

  const item = state ? state.items[state.index] : undefined;
  const count = state?.items.length ?? 0;

  return (
    <dialog
      ref={dialogRef}
      id="lightbox"
      className="pd-lightbox"
      aria-label={LIGHTBOX.label}
      onClose={onClose}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      <div className="pd-lightbox__inner">
        <div className="pd-lightbox__bar">
          <p id="lightbox-caption">
            {item && state
              ? LIGHTBOX.position(item.caption, state.index + 1, count)
              : ""}
          </p>
          <button
            ref={closeRef}
            type="button"
            className="pd-lightbox__close"
            id="lightbox-close"
            onClick={close}
          >
            {LIGHTBOX.close}
          </button>
        </div>
        <figure>
          {/* eslint-disable-next-line @next/next/no-img-element -- the prototype's <img> markup ported verbatim; next/image is not used (D-48) */}
          <img id="lightbox-image" src={item?.src} alt={item?.alt ?? ""} />
        </figure>
        <button
          type="button"
          className="pd-lightbox__nav pd-lightbox__nav--prev"
          id="lightbox-prev"
          aria-label={LIGHTBOX.previous.label}
          hidden={count < 2}
          onClick={() => onStep(-1)}
        >
          {LIGHTBOX.previous.mark}
        </button>
        <button
          type="button"
          className="pd-lightbox__nav pd-lightbox__nav--next"
          id="lightbox-next"
          aria-label={LIGHTBOX.next.label}
          hidden={count < 2}
          onClick={() => onStep(1)}
        >
          {LIGHTBOX.next.mark}
        </button>
      </div>
    </dialog>
  );
}
