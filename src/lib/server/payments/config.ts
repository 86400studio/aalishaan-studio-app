import "server-only";

import {
  providerGate,
  readSalesGateEnv,
  type ProviderConfig,
  type ProviderGateClosedReason,
  type SalesGateEnv,
} from "../checkout/gate";

/**
 * Where payments are processed — S1.7 (docs/sprint-prompts/S1.7-razorpay-verification.md §H.3 "Payment gate").
 * The webhook, the verified Checkout return and the order page stand on the deployment's PROVIDER half alone
 * (src/lib/server/checkout/gate.ts `providerGate`): not Production, the server's identity resolved to the TEST
 * project, a Razorpay Test Mode key with its secret, the webhook secret and the order-link secret.
 *
 * It deliberately does NOT look at `SALES_MODE`, Turnstile, Upstash or the business rule: those decide whether a
 * NEW order may be started. A payment already made is processed, and its order shown, whether or not the store
 * is taking orders at that moment (the capacity pause of S2.21 included).
 *
 * Production is closed here as it is for checkout: no order exists there and no provider value is configured
 * before S3.3; live processing opens by its own change, never through this file. A Test Mode key is required, so a
 * Preview can never process a live account's events.
 *
 * Configuration only — no network. The configuration never leaves the server.
 */

export type PaymentsConfig = ProviderConfig;
export type PaymentsClosedReason = ProviderGateClosedReason;

export type PaymentsGate =
  | { open: true; config: PaymentsConfig }
  | { open: false; reason: PaymentsClosedReason };

export function paymentsGate(
  env: SalesGateEnv = readSalesGateEnv(),
): PaymentsGate {
  const gate = providerGate(env);
  return gate.open
    ? { open: true, config: gate.provider }
    : { open: false, reason: gate.reason };
}
