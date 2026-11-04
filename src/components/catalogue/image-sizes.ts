/**
 * The `sizes` of the browse pages' images — S1.4, measured (the S1.4 record → D-54; S1.3b's D-51 practice). The
 * prototype gives every browse image the same "(max-width:767px) 50vw, 420px" (build-browse.cjs:97–100 rewrites
 * them all), whatever box it is drawn in: on a phone that is about 55 % of the box, so a 3× phone takes the 480 copy
 * for a 351 px card, and from 768 px its 420px overstates every box. These slots are the rendered boxes of
 * src/styles/browse.css's cascade (measured on the prototype's pages and the app's, identical): rem where the CSS
 * dimension is rem (the gutters, the 82rem container, the 32rem collection column), px where it is px. Only which copy
 * the browser takes changes — never the picture, its box or its crop.
 */

/** The art card's frame in the catalogue grid: one column ≤ 599 px, two to 767 px (the card's 7 px padding), then three. */
export const ART_CARD_SIZES =
  "(max-width: 599px) calc(100vw - 2.3rem - 2px), (max-width: 767px) calc(50vw - 1.15rem - 32px), (max-width: 82rem) calc(33.34vw - 1.16rem - 23px), calc(25.67rem - 23px)";

/** A collection's cover: its hub card (one 32rem column to 900 px, then three), and its detail hero (a square drawn at the box's height). */
export const COLLECTION_COVER_SIZES = {
  card: "(max-width: 32rem) calc(100vw - 2.3rem - 2px), (max-width: 767px) calc(29.7rem - 2px), (max-width: 900px) calc(28.5rem - 2px), (max-width: 82rem) calc(33.34vw - 1.16rem - 15px), calc(25.67rem - 20px)",
  detail: "(max-width: 480px) 230px, (max-width: 767px) 260px, 340px",
} as const;

/** A style's close-up on the Art Styles hub: a 4:5 picture covering its column, so the slot is the drawn width. */
export const STYLE_COVER_SIZES =
  "(max-width: 480px) calc(100vw - 2.3rem - 2px), (max-width: 599px) 320px, 240px";
