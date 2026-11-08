/**
 * The `sizes` of the artwork page's images — S1.5, computed from the boxes of src/styles/product.css's cascade (the
 * frozen page's r3.css → gallery-r8.css → revision-r9.css → revision-r11.css, the S1.5 record → H.2 "Images"), never
 * Home's `SWATCH_SIZES` (src/components/product/spec-card.tsx, Home's 84–168 px swatches — D-51). The precedent is
 * S1.4's D-54 (src/components/catalogue/image-sizes.ts): only which copy the browser takes changes — never the
 * picture, its box or its crop. The prototype gives none of these images a `srcset` (its related cards carry
 * "(max-width:767px) 50vw, 420px"); the copies come from the Storage mapping (src/lib/catalogue/product-model.ts).
 *
 * Every box is a share of the content width W of storefront.css's `.container` (`width: 100%`, `max-width: 82rem`,
 * `padding-inline: var(--gutter)`; the gutter is 2.5rem, 1.75rem at ≤ 74.9375rem and 1.15rem at ≤ 47.9375rem —
 * globals.css):
 *   W = 77rem above 82rem · 100vw − 5rem to 82rem · 100vw − 3.5rem to 74.9375rem · 100vw − 2.3rem to 47.9375rem.
 * The boxes are border-box, so a 1 px border takes 2 px off the drawn width. Computed at the default 16 px font size;
 * the Preview evidence (QA-CHECKLIST, 320 / 768 / 1440) re-measures them in the browser. Where a box draws its picture
 * `contain` with padding (the stage's 1.5 %, the wall's 4 %), the box width is given: an upper bound.
 */

/**
 * The stage (`.pd-stage` → `.pd-stage__button`, its 1 px border): the gallery column of the two-column hero above
 * 900 px — `(W − gap) × 1.05 / 2` (`.pd-hero--purchase` 1.05fr / .95fr; gap `clamp(2rem, 4vw, 4.5rem)`, 2rem at
 * ≤ 1100 px — r3.css:21, :66, :193); the full content width at ≤ 900 px (r3.css:86, :198). Above 82rem the gap's
 * 4vw is kept (its 4.5rem cap is reached at 1800 px; beyond it the slot understates the box by at most 4 px).
 */
export const STAGE_SIZES =
  "(max-width: 47.9375rem) calc(100vw - 2.3rem - 2px), (max-width: 900px) calc(100vw - 3.5rem - 2px), (max-width: 1100px) calc(52.5vw - 2.8875rem - 2px), (max-width: 74.9375rem) calc(50.4vw - 1.8375rem - 2px), (max-width: 82rem) calc(50.4vw - 2.625rem - 2px), calc(40.425rem - 2.1vw - 2px)";

/**
 * A thumbnail: above 900 px one of six columns of the gallery (gap .6rem) inside the button's .35rem padding and
 * 1 px border — at most 82 px (at 82rem and wider; 50–82 px from 901 px — r3.css:29–31); at ≤ 900 px the 76 px
 * flex item less its 5 px padding and border, 64 px (gallery-r8.css:85–86). The smallest catalogue copies (384 / 480)
 * cover every one of these slots at 3×, so the widest box stands for the whole range.
 */
export const THUMB_SIZES = "(max-width: 900px) 64px, 82px";

/** The frame choice's swatch: 4.25rem square, 56 px at ≤ 599 px (r3.css:72; gallery-r8.css:122). */
export const FRAME_SWATCH_SIZES = "(max-width: 599px) 56px, 4.25rem";

/**
 * A small tile of "A closer look" (the close-up, the paper, the three framed views): one of three columns at every
 * width (`body .pd-wall__grid`, revision-r9.css:32 — r3.css's two-column phone rules never apply), gap 20 px, 10 px
 * at ≤ 700 px (revision-r9.css:64), less the tile's border — `W / 3 − 2·gap / 3 − 2px`. The large tile holds the
 * artwork's one `full` copy and needs no slot.
 */
export const WALL_TILE_SIZES =
  "(max-width: 700px) calc(33.33vw - 0.767rem - 8.67px), (max-width: 47.9375rem) calc(33.33vw - 0.767rem - 15.33px), (max-width: 74.9375rem) calc(33.33vw - 1.167rem - 15.33px), (max-width: 82rem) calc(33.33vw - 1.667rem - 15.33px), calc(25.67rem - 15.33px)";

/**
 * A card of "What you'll receive" (`figure.pd-spec`, its 1 px border; the square picture fills the card's width):
 * four columns above 1100 px — `W / 4 − 17px` (gap 1.25rem; ≈ 291 px at 1440), two to 481 px — `W / 2 − 12px`
 * (≈ 344 px at 768), r3.css:131, :195. At ≤ 480 px the card is a row (r3.css:232; the 96 px column of
 * gallery-r8.css:130) and the square picture covers a 96 px wide box as tall as the row — at least 7rem
 * (r3.css:234), up to about 10rem where the caption wraps onto more lines at 320 px — so the slot is the row's
 * height, 10rem, not the 96 px width.
 */
export const SPEC_SIZES =
  "(max-width: 480px) 10rem, (max-width: 47.9375rem) calc(50vw - 1.15rem - 12px), (max-width: 1100px) calc(50vw - 1.75rem - 12px), (max-width: 74.9375rem) calc(25vw - 0.875rem - 17px), (max-width: 82rem) calc(25vw - 1.25rem - 17px), calc(19.25rem - 17px)";

/**
 * A related card's frame (`.catalogue-grid.pd-related__grid`, the art card's 1 px border): one column at ≤ 599 px
 * (gallery-r8.css:94); two from 600 to 900 px (r3.css:203), gap 24 px (gallery-r8.css:90) and, to 767 px, the
 * compact card's 7 px padding (browse.css:5:661, src/styles/browse.css); three above 900 px, gap 32 px
 * (gallery-r8.css:24). Not the catalogue grid's ART_CARD_SIZES, whose two-column range ends at 767 px.
 */
export const RELATED_CARD_SIZES =
  "(max-width: 599px) calc(100vw - 2.3rem - 2px), (max-width: 47.9375rem) calc(50vw - 1.15rem - 28px), (max-width: 900px) calc(50vw - 1.75rem - 14px), (max-width: 74.9375rem) calc(33.33vw - 1.167rem - 23.33px), (max-width: 82rem) calc(33.33vw - 1.667rem - 23.33px), calc(25.67rem - 23.33px)";
