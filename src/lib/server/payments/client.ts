import "server-only";

import { createPrivilegedClient } from "../supabase";
import { createPaymentStore, type PaymentStore } from "./store";

/**
 * The payments' adapter over the privileged client — S1.7. One client per call (src/lib/server/supabase.ts), handed
 * to the adapter as the one capability it needs: a function call by name. Only the SQLSTATE of a database error is
 * passed on; its message, detail and hint stay here, unread. `null` when the privileged client cannot be made
 * (the configuration is missing or does not resolve to the project this deployment must use).
 */
export function privilegedPaymentStore(): PaymentStore | null {
  const privileged = createPrivilegedClient();
  if (!privileged.ok) return null;
  const { client } = privileged;
  return createPaymentStore(async (name, args) => {
    const call = client.rpc(name, args);
    const { data, error } = await (BOUNDED_READS.has(name)
      ? call.abortSignal(AbortSignal.timeout(ORDER_READ_TIMEOUT_MS))
      : call);
    return { data, error: error ? { code: error.code } : null };
  });
}

/**
 * How long the order page's one read may take — in the proxy and in the page — before it is answered `unavailable`
 * (the page's temporary error), as the catalogue's reads are bounded: a stalled database never holds an order
 * request until the platform cuts it off. Only reads are bounded: a write cut off has an outcome nobody knows.
 */
export const ORDER_READ_TIMEOUT_MS = 5000;
const BOUNDED_READS: ReadonlySet<string> = new Set(["order_confirmation_view"]);
