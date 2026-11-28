import "server-only";

import { timingSafeEqual } from "node:crypto";

import {
  orderPageState,
  type OrderConfirmationRow,
  type OrderStatusAnswer,
} from "@/lib/schemas/order-confirmation";
import { CONFIRMATION_TOKEN_PATTERN } from "@/lib/schemas/payments";

import {
  consumeCheckoutAttempt,
  type CheckoutThrottleKind,
} from "./checkout-throttle";
import { confirmationTokenHash } from "./checkout/tokens";
import type { ThrottleOutcome } from "./login-throttle";
import { privilegedPaymentStore } from "./payments/client";
import { paymentsGate, type PaymentsGate } from "./payments/config";
import { checkProviderPayments } from "./payments/reconcile";
import type { PaymentStore } from "./payments/store";
import {
  fetchRazorpayOrderPayments,
  type OrderPaymentsOutcome,
  type RazorpayCredentials,
} from "./razorpay";

/**
 * The order behind a confirmation link — S1.7 (docs/sprint-prompts/S1.7-razorpay-verification.md §H.3 "Order
 * page"; D-09 as amended by D-61). `/order/<token>` is a capability: whoever holds the link sees that one order and
 * nothing else. There is no other way in — no lookup by order number, email, phone or id.
 *
 * - The token is held to its shape (32 bytes as unpadded base64url) before anything else; anything else is "no such
 *   order" without a read.
 * - It is hashed (SHA-256, the D-09 form) and the order is read by that hash through one database function
 *   (`order_confirmation_view`). The raw token is never stored, logged, sent to the database or put in an error;
 *   this module needs no secret — the stored hash is the whole check.
 * - The row's own hash is then compared with the presented one in constant time: the answer is used only when
 *   the two are the same 32 bytes.
 * - "No such order" and "could not be read" are different answers: an unknown or malformed token is `not_found`
 *   (the designed 404); a database that cannot be reached is `unavailable` (an honest temporary error), never a
 *   missing order.
 * - Reading an order changes nothing. The one thing a status question may do beyond reading is ask Razorpay what it
 *   holds for the order (D-68) — only when the page asks for it, only while a reported payment still waits for its
 *   confirmation, within the resume quota, and only to record what it shows (every live payment, with its money —
 *   0006): the hold, or the review, that flags the order for the studio. It never confirms.
 */

export type OrderRead =
  | { readonly status: "ok"; readonly row: OrderConfirmationRow }
  | { readonly status: "not_found" | "unavailable" };

export type OrderReadDependencies = {
  /** The database adapter over the privileged client, or null when that client cannot be made. */
  store: () => PaymentStore | null;
};

function defaultReadDependencies(): OrderReadDependencies {
  return { store: () => privilegedPaymentStore() };
}

/** True for a string of the confirmation token's shape. */
export function isConfirmationToken(value: unknown): value is string {
  return typeof value === "string" && CONFIRMATION_TOKEN_PATTERN.test(value);
}

function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return (
    left.length === 32 && right.length === 32 && timingSafeEqual(left, right)
  );
}

/** The order of a presented token — or that there is none, or that it could not be read. */
export async function readOrder(
  token: unknown,
  deps: OrderReadDependencies = defaultReadDependencies(),
): Promise<OrderRead> {
  if (!isConfirmationToken(token)) return { status: "not_found" };
  const hash = confirmationTokenHash(token);
  const store = deps.store();
  if (!store) return { status: "unavailable" };
  const found = await store.confirmationView(hash);
  if (!found.ok)
    return {
      status: found.refusal === "invalid_request" ? "not_found" : "unavailable",
    };
  if (found.value === null) return { status: "not_found" };
  return sameHash(found.value.confirmation_token_hash, hash)
    ? { status: "ok", row: found.value }
    : { status: "not_found" };
}

/** The one shape of an order page's path: `/order/<one segment>` (a trailing slash is the same page). */
const ORDER_PAGE_PATH = /^\/order\/([^/]+)\/?$/;

/**
 * A path no route answers — two segments under `/order`, where only `/order/[token]` exists. Rewriting a request to
 * it is how the proxy asks the framework for its own 404: the designed page, rendered on the server, status 404.
 */
export const MISSING_ORDER_REWRITE = "/order/missing/order";

/**
 * What the proxy does with a request under `/order` — S1.7 (src/proxy.ts; docs/PROJECT-STATUS.md §10 #23 (j)).
 * `missing`: the path is not an order page's, its token is not of the token's shape, or no order has that token —
 * the proxy answers the designed 404, on the server, with a 404 status. `render`: the request goes on to the page —
 * also when the order could not be read, because a database that cannot be reached is not a missing order: the
 * page then shows its temporary error.
 */
export async function orderRouteAnswer(
  pathname: string,
  deps: OrderReadDependencies = defaultReadDependencies(),
): Promise<"render" | "missing"> {
  const match = ORDER_PAGE_PATH.exec(pathname);
  if (!match || !isConfirmationToken(match[1])) return "missing";
  let read: OrderRead;
  try {
    read = await readOrder(match[1], deps);
  } catch {
    return "render";
  }
  return read.status === "not_found" ? "missing" : "render";
}

export type OrderStatusDependencies = OrderReadDependencies & {
  gate: () => PaymentsGate;
  throttle: (
    kind: CheckoutThrottleKind,
    address: string,
  ) => Promise<ThrottleOutcome>;
  fetchPayments: (
    providerOrderId: string,
    credentials: RazorpayCredentials,
  ) => Promise<OrderPaymentsOutcome>;
  /** Where a sanitised reason code goes. */
  report: (message: string) => void;
};

function defaultStatusDependencies(): OrderStatusDependencies {
  return {
    ...defaultReadDependencies(),
    gate: () => paymentsGate(),
    throttle: (kind, address) => consumeCheckoutAttempt(kind, address),
    fetchPayments: (providerOrderId, credentials) =>
      fetchRazorpayOrderPayments(providerOrderId, credentials),
    report: (message) => console.error(message),
  };
}

/**
 * True when asking the provider could change what the order page should say: the order still awaits its payment,
 * is under no review, is linked to a provider order, and shows a payment that was reported and nothing firmer.
 */
function providerQuestionApplies(row: OrderConfirmationRow): boolean {
  return (
    row.payment_status === "pending" &&
    !row.needs_review &&
    row.provider_order_state === "linked" &&
    row.provider_order_id !== null &&
    row.payment_attempt_id !== null &&
    row.payments.reported > 0 &&
    row.payments.authorized + row.payments.captured === 0
  );
}

/**
 * The page's state for a token — the status question the order page asks while it shows "confirming". With
 * `askProvider`, and only where `providerQuestionApplies`, Razorpay is asked once what it holds for the order; a
 * captured or an authorised payment there flags the order (the hold — or, for more than one live payment or other
 * money, a review: 0006), and the state is read again. Every refusal on
 * that path — a closed gate, the quota, an unreachable provider — leaves the state exactly as the database has it.
 */
export async function orderStatus(
  token: unknown,
  options: { askProvider: boolean; address: string },
  deps: OrderStatusDependencies = defaultStatusDependencies(),
): Promise<OrderStatusAnswer> {
  const read = await readOrder(token, deps);
  if (read.status !== "ok") return { status: read.status };
  let { row } = read;

  if (options.askProvider && providerQuestionApplies(row)) {
    const gate = deps.gate();
    const store = deps.store();
    if (gate.open && store) {
      const allowed = await deps.throttle("resume", options.address);
      if (allowed.ok) {
        const standing = await checkProviderPayments(
          {
            // `providerQuestionApplies` has established both.
            paymentAttemptId: row.payment_attempt_id as string,
            providerOrderId: row.provider_order_id as string,
          },
          {
            keyId: gate.config.razorpayKeyId,
            keySecret: gate.config.razorpayKeySecret,
          },
          {
            fetchPayments: deps.fetchPayments,
            store,
            report: deps.report,
          },
        );
        if (
          standing.standing === "captured" ||
          standing.standing === "authorized"
        ) {
          const again = await readOrder(token, deps);
          if (again.status === "ok") row = again.row;
        }
      }
    }
  }

  return { status: "ok", state: orderPageState(row) };
}
