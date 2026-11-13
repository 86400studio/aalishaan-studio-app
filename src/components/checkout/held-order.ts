import { bagLines, type BagLine } from "@/components/commerce/bag-lines";
import { CHECKOUT_HELD_ORDER } from "@/content/public/checkout";
import type { BagRow } from "@/lib/bag";
import type { BagValidationResult } from "@/lib/schemas/bag";
import type { CheckoutLaunch } from "@/lib/schemas/checkout";

import type { CheckoutHold } from "./attempt-key";

/**
 * The order that holds the checkout page, as the page shows it — S1.6, the independent review's finding of
 * 2026-11-12 (docs/code-reviews/S1.6-checkout-pending-order-review.md). Framework-free, so its rules are unit-tested;
 * the React side is ./checkout-form.tsx.
 *
 * While an order holds the page, the pay button opens that order's payment window and nothing else, so the summary
 * describes that order — never the bag as it is now, which the customer may have changed since ("Edit bag", another
 * tab, a reload):
 *
 * - **Its rows** are the lines of the bag answer the page SUBMITTED: the variant codes and quantities the server bound
 *   to the attempt (the payload MAC) and wrote as the order's items. They are kept with the hold (./attempt-key.ts),
 *   in memory, for the page's life: never stored, so they survive "Edit bag" and Back, not a reload. **Their prices**
 *   are shown only when that answer's subtotal is the order's stored amount (`orderForLaunch`): a new order is taken
 *   only at the total the page showed (the server refuses any other — `total_changed`), but a press that repeats an
 *   attempt (the same key — a retry after a lost answer) is answered with the order the first press wrote, untouched,
 *   at that moment's prices, which may have changed since; then the rows show no price.
 * - **A hold found after the page was opened again** (a reload, by the stored attempt key alone — D-62) has no rows
 *   the page could vouch for: none are listed, and a line says so (NS-40). Nothing new is stored to recover them.
 * - **Its totals** are its stored amount (the launch's `amount_paise`) — for an order this page started under the
 *   S1.6 rule (no shipping, no tax), its artwork subtotal.
 * - **When the bag differs** from the held order's items, a line says that continuing pays for that order as shown,
 *   not for the bag as it is now (NS-40).
 */

/** One item of an order: its variant code and quantity. */
export type HeldItem = readonly [code: string, quantity: number];

export type HeldOrder = {
  /** The order's rows, as the page submitted them. */
  readonly lines: readonly BagLine[];
  /** The order's items, sorted by code — compared with the bag as it is now. */
  readonly items: readonly HeldItem[];
  /** The exact artwork subtotal of the answer that was submitted. */
  readonly subtotalPaise: bigint;
};

/** Items as sorted (code, quantity) pairs; a bag holds each code once. */
export function itemsOf(
  rows: ReadonlyArray<{ readonly code: string; readonly quantity: number }>,
): HeldItem[] {
  return rows
    .map((row): HeldItem => [row.code, row.quantity])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

/** The held order of a submission: the rows and subtotal of the answer that was submitted, and nothing else. */
export function heldOrderOf(answer: BagValidationResult): HeldOrder {
  const rows: BagRow[] = answer.items.map((item) => ({
    code: item.variant_code,
    quantity: item.quantity,
  }));
  return {
    // Every row is the answer's own item, so every line is drawn from it — no remembered artwork is needed.
    lines: bagLines(rows, answer, new Map()).lines,
    items: itemsOf(rows),
    subtotalPaise: answer.subtotal_paise,
  };
}

/** The launch's stored amount as exact paise, or null when it cannot be read. */
export function launchAmountPaise(launch: CheckoutLaunch): bigint | null {
  return /^(?:0|[1-9][0-9]{0,11})$/.test(launch.amount_paise)
    ? BigInt(launch.amount_paise)
    : null;
}

/**
 * The submitted order as the summary may show it for the order the server answered with: as it is when the press's
 * subtotal is that order's stored amount; otherwise its rows without their prices — the items are the order's (the
 * payload MAC binds them), the prices were the page's, not the order's.
 */
export function orderForLaunch(
  order: HeldOrder,
  launch: CheckoutLaunch,
): HeldOrder {
  if (launchAmountPaise(launch) === order.subtotalPaise) return order;
  return {
    ...order,
    // `pending` is a row's "no price" state: ./checkout-row.tsx draws no price for it.
    lines: order.lines.map((line) => ({
      ...line,
      price: { status: "pending" },
    })),
  };
}

/** True when the hold that stands is `target`'s order (its reported copy included); false when none stands. */
export function sameOrder(
  current: CheckoutHold | null,
  target: CheckoutHold,
): boolean {
  return (
    current !== null &&
    current.launch.provider_order_id === target.launch.provider_order_id
  );
}

/** True when the bag holds exactly the order's items — the same codes, each in the same quantity. */
export function sameItems(order: HeldOrder, rows: readonly BagRow[]): boolean {
  const now = itemsOf(rows);
  return (
    now.length === order.items.length &&
    now.every(
      ([code, quantity], index) =>
        order.items[index][0] === code && order.items[index][1] === quantity,
    )
  );
}

/**
 * The line under a held order's summary, or null. A hold whose rows this page does not know (found after a reload)
 * always says so, and — while the page offers to pay for the order — that continuing pays for it as it was started.
 * While payment is offered (not after Razorpay reported a payment, not when the order cannot be paid from here), a
 * bag that, once read, differs from the order's items is named: continuing pays for the order as shown.
 */
export function heldOrderNote(
  hold: CheckoutHold,
  bag: { readonly hydrated: boolean; readonly rows: readonly BagRow[] },
  offersPayment: boolean,
): string | null {
  const orderNumber = hold.launch.order_number;
  if (hold.order === null)
    return offersPayment
      ? `${CHECKOUT_HELD_ORDER.notListed(orderNumber)} ${CHECKOUT_HELD_ORDER.notListedContinue(orderNumber)}`
      : CHECKOUT_HELD_ORDER.notListed(orderNumber);
  if (offersPayment && bag.hydrated && !sameItems(hold.order, bag.rows))
    return CHECKOUT_HELD_ORDER.bagChanged(orderNumber);
  return null;
}
