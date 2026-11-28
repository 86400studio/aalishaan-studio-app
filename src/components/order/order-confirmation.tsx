import { CheckoutRow } from "@/components/checkout/checkout-row";
import type { BagLine } from "@/components/commerce/bag-lines";
import { PurchasedBag } from "@/components/commerce/purchased-bag";
import { BAG_ROW } from "@/content/public/cart";
import { CHECKOUT_TEST_MODE } from "@/content/public/checkout";
import {
  ORDER_CONFIRMED,
  ORDER_CONFIRMING,
  ORDER_FAILED,
  ORDER_HELP,
  ORDER_PANEL,
  ORDER_TEST,
} from "@/content/public/order";
import { formatRupees } from "@/lib/money";
import type { FinishCode } from "@/lib/schemas/catalogue";
import type {
  OrderPageState,
  OrderStatusAnswer,
  OrderView,
} from "@/lib/schemas/order-confirmation";
import { catalogueImage } from "@/lib/site-images";

import { OrderStatusWatcher } from "./order-status-watcher";

/**
 * The order page's body — S1.7 (docs/sprint-prompts/S1.7-razorpay-verification.md §H.3 "Order page"; the frozen
 * page is prototype/pages/order/demo/index.html, never imported). A server component: everything it shows is the
 * order as the database holds it at this request (`OrderView`, src/lib/schemas/order-confirmation.ts) — never a
 * redirect's word, a browser callback or anything stored in the browser.
 *
 * - **Confirmed** — only when a verified captured payment stands for the order: the frozen page's heading and line,
 *   the page's own status sentence, and the order.
 * - **Confirming** — a payment is known and not yet confirmed, or the order is being checked: it says so, offers no
 *   payment, and (./order-status-watcher.tsx) asks the server again for a bounded time. Without JavaScript the page
 *   says that it must be reloaded.
 * - **Failed** — recoverable (the way back to checkout) or closed (its time to pay has passed).
 *
 * The order is shown in every state: its number and date, its rows as the purchase snapshot holds them (the
 * checkout's read-only commerce row) and its totals in rupees from integer paise. Unknown charges stay "To be
 * confirmed"; a test order says that it is one (NS-47) and labels its amount "Test total"; "Amount paid" appears
 * only on a confirmed order that is not a test order. No contact detail and no address is shown: the page is given
 * none.
 *
 * Left to the sprints that make them true (src/content/public/order.ts): the receipt printer and paper with print
 * and PDF, the journey section with its email step (S1.8) and the track action (S1.9).
 */

type Copy = {
  heading: string;
  line: string | null;
  status: string;
  action: { label: string; href: string } | null;
};

function copyOf(state: OrderPageState, orderNumber: string): Copy {
  if (state.state === "confirmed")
    return {
      heading: ORDER_CONFIRMED.heading,
      line: ORDER_CONFIRMED.line,
      status: ORDER_CONFIRMED.status(orderNumber),
      action: null,
    };
  if (state.state === "confirming") {
    const copy = ORDER_CONFIRMING[state.reason];
    return {
      heading: copy.heading,
      line: null,
      status: copy.status(orderNumber),
      action: null,
    };
  }
  const copy = ORDER_FAILED[state.reason];
  return {
    heading: copy.heading,
    line: null,
    status: copy.status(orderNumber),
    action: copy.action,
  };
}

/** The order's rows as the checkout's read-only commerce row draws them — every value from the purchase snapshot. */
function linesOf(view: OrderView): BagLine[] {
  return view.items.map((item) => {
    const finish = item.finish_code as FinishCode;
    const large = catalogueImage(item.artwork_slug, `frame-${finish}`, "1200");
    return {
      code: item.variant_code,
      slug: item.artwork_slug,
      finish,
      finishName: item.finish_name,
      quantity: item.quantity,
      title: item.artwork_title,
      href: `/artworks/${item.artwork_slug}`,
      spec: BAG_ROW.spec(item.orientation, item.finish_name),
      alt: BAG_ROW.alt(item.artwork_title, item.finish_name),
      image: {
        src: large,
        srcSet: `${catalogueImage(item.artwork_slug, `frame-${finish}`, "480")} 480w, ${large} 1200w`,
      },
      price: {
        status: "priced",
        line: formatRupees(BigInt(item.line_total_paise)),
        each:
          item.quantity > 1
            ? formatRupees(BigInt(item.unit_price_paise))
            : null,
      },
    };
  });
}

/** The order's date in the studio's time zone (D-18), as the frozen receipt writes a date. */
export function orderDate(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}

/** "Shipping & tax": the sum once both are known; until then the approved "To be confirmed" — never a zero. */
function chargesText(view: OrderView): string {
  if (view.shipping_paise === null || view.tax_paise === null)
    return ORDER_PANEL.toBeConfirmed;
  return formatRupees(BigInt(view.shipping_paise) + BigInt(view.tax_paise));
}

export function OrderConfirmation({
  view,
  token,
  ask,
}: {
  view: OrderView;
  /** The page's own token: handed to the watcher, which asks the status question with it. */
  token: string;
  ask: (token: string, askProvider: boolean) => Promise<OrderStatusAnswer>;
}) {
  const { status } = view;
  const copy = copyOf(status, view.order_number);
  const total = formatRupees(BigInt(view.total_paise));
  return (
    <>
      <section className="confirmation-heading">
        <h1>{copy.heading}</h1>
        {copy.line === null ? null : <p>{copy.line}</p>}
        <p id="order-status" role="status" aria-live="polite">
          {copy.status}
        </p>
        {view.synthetic ? (
          <p className="flow-fine">{ORDER_TEST.disclosure}</p>
        ) : null}
        {status.state === "confirming" ? (
          <>
            <OrderStatusWatcher token={token} initial={status} ask={ask} />
            <noscript>
              <p className="flow-fine">{ORDER_CONFIRMING.noscript}</p>
            </noscript>
          </>
        ) : null}
      </section>
      {copy.action === null ? null : (
        <div className="receipt-actions">
          {/* A full page load, never a client navigation: the private page's document, whose address is the token,
              is not carried into the next page, where the checkout loads its providers' scripts. */}
          <a className="button button--primary" href={copy.action.href}>
            {copy.action.label}
          </a>
        </div>
      )}
      <section
        className="flow-panel flow-summary order-panel"
        aria-labelledby="order-panel-title"
      >
        <h2 id="order-panel-title">{ORDER_PANEL.heading}</h2>
        <p className="flow-fine order-meta">
          {ORDER_PANEL.order}
          <strong>{view.order_number}</strong>
          <br />
          {ORDER_PANEL.date}
          {orderDate(view.placed_at)}
        </p>
        <div id="order-items">
          {linesOf(view).map((line) => (
            <CheckoutRow key={line.code} line={line} />
          ))}
        </div>
        <dl className="flow-totals">
          <div>
            <dt>{ORDER_PANEL.subtotal}</dt>
            <dd>{formatRupees(BigInt(view.subtotal_paise))}</dd>
          </div>
          <div>
            <dt>{ORDER_PANEL.shippingAndTax}</dt>
            <dd>{chargesText(view)}</dd>
          </div>
          {view.synthetic ? (
            <div className="checkout-test-total">
              <dt>{CHECKOUT_TEST_MODE.totalLabel}</dt>
              <dd data-order-total="">{total}</dd>
            </div>
          ) : status.state === "confirmed" ? (
            <div className="checkout-test-total">
              <dt>{ORDER_PANEL.amountPaid}</dt>
              <dd data-order-total="">{total}</dd>
            </div>
          ) : null}
        </dl>
        <PurchasedBag
          state={status}
          attemptHash={view.attempt_hash}
          items={view.items.map((item) => ({
            variant_code: item.variant_code,
            quantity: item.quantity,
          }))}
        />
      </section>
      <div className="receipt-help">
        <p className="flow-help">
          {ORDER_HELP.before}
          {/* A full page load too, as the action above. */}
          <a href={ORDER_HELP.link.href}>{ORDER_HELP.link.label}</a>
        </p>
      </div>
    </>
  );
}
