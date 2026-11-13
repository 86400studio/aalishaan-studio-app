"use server";

import { headers } from "next/headers";

import type { CheckoutActionResult } from "@/lib/schemas/checkout";
import { resumeCheckout, submitCheckout } from "@/lib/server/checkout/flow";
import { clientAddressOf } from "@/lib/server/login-throttle";

/**
 * The checkout's two server actions — S1.6 (docs/sprint-prompts/S1.6-checkout-pending-order.md §H.3). Thin on
 * purpose: each takes the untrusted argument as `unknown`, adds the one request fact the flow needs (the client
 * address Vercel vouches for) and hands over to src/lib/server/checkout/flow.ts, which enforces every gate itself —
 * the sales gate first, with no network; then the strict parse, the rate limit, Turnstile, the atomic write and the
 * provider step. A disabled or hidden control in the page is never the protection.
 *
 * Next.js checks the Origin of a server action against the Host before it runs (no allowed origin is added); the
 * framework's body limit bounds the argument before the strict schema caps every string. The answer is one
 * enumerated status (src/lib/schemas/checkout.ts); only `launch` carries data. Nothing here throws to the browser:
 * an unexpected failure is `unavailable`.
 */

async function requestAddress(): Promise<string> {
  try {
    return clientAddressOf(await headers());
  } catch {
    return "";
  }
}

/** A new submission, or the same one again (the same attempt key and the same details). */
export async function submitCheckoutAction(
  input: unknown,
): Promise<CheckoutActionResult> {
  try {
    return await submitCheckout(input, { address: await requestAddress() });
  } catch {
    return { status: "unavailable" };
  }
}

/** Where an attempt stands, by its key alone: after a reload, a lost answer or a closed payment window. */
export async function resumeCheckoutAction(
  input: unknown,
): Promise<CheckoutActionResult> {
  try {
    return await resumeCheckout(input, { address: await requestAddress() });
  } catch {
    return { status: "unavailable" };
  }
}
