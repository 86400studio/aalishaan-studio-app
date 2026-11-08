"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import { BAG_ROW } from "@/content/public/cart";
import { CATALOGUE_STATES } from "@/content/public/browse";
import { quantityFromInput } from "@/lib/bag";
import {
  FINISH_NAMES,
  finishCodeSchema,
  type FinishCode,
} from "@/lib/schemas/catalogue";

import type { BagLine } from "./bag-lines";

/**
 * One bag row, shared by the cart drawer and the cart page — S1.5. The markup is the prototype's commerce row
 * (prototype/shared/bag.js:13 `commerceRows`; never imported): the frame view of the row's finish, the title linking
 * the artwork page, "A2 {orientation} · {Finish} frame", then either "Quantity {n}" (the drawer) or the cart's
 * controls — the Frame select with the three finishes, the Quantity field and Remove — and the price, the line
 * total with "({each} each)" above one. The drawer's Remove is the button bag.js:15 appends to the row's text.
 *
 * - A price shows only from the answer for the bag's current revision (./bag-lines.ts); an unavailable variant
 *   shows NS-29 "Not available to order" and no price.
 * - The Quantity field acts on `change`, as bag.js:17 does — not on each keystroke: the value is coerced with the
 *   prototype's rule (`quantityFromInput`: max(1, min(99, floor(value) || 1))), written back to the field, and the
 *   store refuses anything that is not an integer 1–99 anyway.
 * - A finish change merges into the bag's row of that finish (src/lib/bag/rows.ts `changeRowFinish`).
 * - `data-code` and `data-control` let the cart put the focus back after a change (src/components/commerce/
 *   cart-items.tsx); they carry no meaning of their own.
 */

/** The drawer's picture box is 72 × 90 px (storefront.css); the cart's is 125 × 160, 90 × 130 ≤ 900 px and 76 × 106 ≤ 599 px (commerce.css). */
export const DRAWER_ROW_SIZES = "72px";
export const CART_ROW_SIZES =
  "(max-width: 599px) 76px, (max-width: 900px) 90px, 125px";

const FINISH_OPTIONS = finishCodeSchema.options;

type Shared = {
  line: BagLine;
  onRemove: (line: BagLine) => void;
  /** Called when the title link is followed (the drawer closes). */
  onNavigate?: () => void;
};

export type BagRowViewProps =
  | (Shared & { editable?: false })
  | (Shared & {
      editable: true;
      onQuantity: (line: BagLine, quantity: number) => void;
      onFinish: (line: BagLine, finish: FinishCode) => void;
    });

export function BagRowView(props: BagRowViewProps) {
  const { line, onRemove, onNavigate } = props;
  const remove = (
    <button
      type="button"
      className={props.editable ? undefined : "bag-remove"}
      aria-label={BAG_ROW.removeFor(line.title)}
      data-control="remove"
      onClick={() => onRemove(line)}
    >
      {BAG_ROW.remove}
    </button>
  );
  return (
    <article className="bag-row" data-code={line.code}>
      {/* eslint-disable-next-line @next/next/no-img-element -- the prototype's <img> markup ported verbatim; next/image is not used (D-48) */}
      <img
        src={line.image.src}
        srcSet={line.image.srcSet}
        sizes={props.editable ? CART_ROW_SIZES : DRAWER_ROW_SIZES}
        alt={line.alt}
        loading="lazy"
        decoding="async"
      />
      <div>
        <h3>
          <Link href={line.href} prefetch={false} onClick={onNavigate}>
            {line.title}
          </Link>
        </h3>
        <p>{line.spec}</p>
        {props.editable ? (
          <div className="bag-controls">
            <label>
              {BAG_ROW.frame}
              <select
                aria-label={BAG_ROW.frameFor(line.title)}
                data-control="frame"
                value={line.finish}
                onChange={(event) => {
                  const parsed = finishCodeSchema.safeParse(event.target.value);
                  if (parsed.success) props.onFinish(line, parsed.data);
                }}
              >
                {FINISH_OPTIONS.map((finish) => (
                  <option key={finish} value={finish}>
                    {FINISH_NAMES[finish]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {BAG_ROW.quantityLabel}
              <QuantityField
                title={line.title}
                quantity={line.quantity}
                onCommit={(quantity) => props.onQuantity(line, quantity)}
              />
            </label>
            {remove}
          </div>
        ) : (
          <p>{BAG_ROW.quantity(line.quantity)}</p>
        )}
        <BagPrice line={line} />
        {props.editable ? null : remove}
      </div>
    </article>
  );
}

function BagPrice({ line }: { line: BagLine }) {
  const { price } = line;
  if (price.status === "pending") return null;
  if (price.status === "unavailable")
    return <p className="bag-price">{CATALOGUE_STATES.notAvailable}</p>;
  return (
    <p className="bag-price">
      <strong>{price.line}</strong>
      {price.each ? (
        <>
          {" "}
          <small>{BAG_ROW.each(price.each)}</small>
        </>
      ) : null}
    </p>
  );
}

/**
 * The cart's Quantity field: uncontrolled, committed on the native `change` event (Enter, leaving the field, the
 * spinner), as bag.js:17 binds `onchange` — React's `onChange` fires on every keystroke instead. The shown value
 * follows the bag whenever the row's quantity changes (another tab, a merge), and a committed entry is written back
 * as the quantity it became, so "0", "", "2.7" or "1e9" never stay on screen.
 */
function QuantityField({
  title,
  quantity,
  onCommit,
}: {
  title: string;
  quantity: number;
  onCommit: (quantity: number) => void;
}) {
  const field = useRef<HTMLInputElement>(null);
  const commit = useRef(onCommit);
  useEffect(() => {
    commit.current = onCommit;
  }, [onCommit]);

  useEffect(() => {
    if (field.current) field.current.value = String(quantity);
  }, [quantity]);

  useEffect(() => {
    const element = field.current;
    if (!element) return;
    const onChange = () => {
      const next = quantityFromInput(element.value);
      element.value = String(next);
      commit.current(next);
    };
    element.addEventListener("change", onChange);
    return () => element.removeEventListener("change", onChange);
  }, []);

  return (
    <input
      ref={field}
      aria-label={BAG_ROW.quantityFor(title)}
      data-control="quantity"
      type="number"
      min={1}
      max={99}
      defaultValue={quantity}
    />
  );
}
