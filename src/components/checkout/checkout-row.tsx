import Link from "next/link";

import type { BagLine } from "@/components/commerce/bag-lines";
import { CATALOGUE_STATES } from "@/content/public/browse";
import { BAG_ROW } from "@/content/public/cart";

/**
 * One row of the checkout's order summary — S1.6. The markup is the prototype's read-only commerce row
 * (prototype/shared/bag.js:13 `commerceRows(items, false)`, which bag.js:18 writes into `#checkout-items`; never
 * imported): the frame view of the row's finish, the title linking the artwork page, "A2 {orientation} · {Finish}
 * frame", "Quantity {n}" and the line total with "({each} each)" above one. Nothing here edits the bag — "Edit bag"
 * leads to the cart page.
 *
 * The line is the bag's own display line (src/components/commerce/bag-lines.ts): every word and amount comes from
 * the server's answer for the bag's current revision, so a row whose answer is pending shows no price and an item
 * that cannot be bought shows NS-29 "Not available to order". The image is wrapped in a `<picture>` whose box is
 * removed in the sheet (`display: contents`, src/styles/checkout.css), so the image stays the row's grid item.
 */

/** The summary's picture box: 70 × 100 px, the column's width between 701 and 900 px, 76 × 106 px ≤ 599 px (checkout.css). */
export const CHECKOUT_ROW_SIZES =
  "(max-width: 599px) 76px, (max-width: 700px) 70px, (max-width: 900px) 40vw, 70px";

export function CheckoutRow({ line }: { line: BagLine }) {
  const { price } = line;
  return (
    <article className="bag-row" data-code={line.code}>
      <picture>
        <img
          src={line.image.src}
          srcSet={line.image.srcSet}
          sizes={CHECKOUT_ROW_SIZES}
          alt={line.alt}
          loading="lazy"
          decoding="async"
        />
      </picture>
      <div>
        <h3>
          <Link href={line.href} prefetch={false}>
            {line.title}
          </Link>
        </h3>
        <p>{line.spec}</p>
        <p>{BAG_ROW.quantity(line.quantity)}</p>
        {price.status === "pending" ? null : price.status === "unavailable" ? (
          <p className="bag-price">{CATALOGUE_STATES.notAvailable}</p>
        ) : (
          <p className="bag-price">
            <strong>{price.line}</strong>
            {price.each ? (
              <>
                {" "}
                <small>{BAG_ROW.each(price.each)}</small>
              </>
            ) : null}
          </p>
        )}
      </div>
    </article>
  );
}
