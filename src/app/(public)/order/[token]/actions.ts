"use server";

import { headers } from "next/headers";

import type { OrderStatusAnswer } from "@/lib/schemas/order-confirmation";
import { clientAddressOf } from "@/lib/server/login-throttle";
import { orderStatus } from "@/lib/server/order-confirmation";

/**
 * The order page's status question — S1.7 (src/lib/server/order-confirmation.ts `orderStatus`). Asked by the page
 * while it shows "confirming", with the page's own token: the token is the only authority, and the answer is the
 * order's state and nothing else — no number, no amount, no detail. Both arguments are untrusted: a token of
 * another shape is "no such order"; `askProvider` counts only when it is exactly `true`, and what it permits is
 * decided on the server. Reading changes nothing; nothing here throws to the browser.
 */
export async function orderStatusAction(
  token: unknown,
  askProvider: unknown,
): Promise<OrderStatusAnswer> {
  try {
    let address = "";
    try {
      address = clientAddressOf(await headers());
    } catch {
      address = "";
    }
    return await orderStatus(token, {
      askProvider: askProvider === true,
      address,
    });
  } catch {
    return { status: "unavailable" };
  }
}
