import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import {
  HMAC_SHA256_HEX_PATTERN,
  RAZORPAY_PAYMENT_ID_PATTERN,
} from "@/lib/schemas/payments";

import { RAZORPAY_ORDER_ID_PATTERN } from "../razorpay";

/**
 * Razorpay's two signatures — S1.7 (docs/sprint-prompts/S1.7-razorpay-verification.md §H.3 "Verification"). Two
 * different secrets for two different messages; neither stands in for the other:
 *
 *   - **The webhook**: `X-Razorpay-Signature` is the lower-case hex HMAC-SHA-256 of the request body EXACTLY as it
 *     arrived, keyed by the webhook secret (`RAZORPAY_WEBHOOK_SECRET`). The bytes are verified before anything
 *     parses them, and nothing is ever re-serialised to recreate them.
 *   - **The Checkout return**: the signature Checkout hands the page is the lower-case hex HMAC-SHA-256 of
 *     `<order id>|<payment id>`, keyed by the API key secret (`RAZORPAY_KEY_SECRET`). The order id is the one the
 *     SERVER stored for the attempt — never one the browser sent.
 *
 * A presented signature is first held to its shape (64 lower-case hex characters), so both sides of the comparison
 * are 32 bytes; the comparison itself is constant-time. Neither function throws, logs or returns anything but a
 * boolean, and a secret that is absent or empty verifies nothing.
 */

function hmacSha256(secret: string, message: string | Uint8Array): Buffer {
  return createHmac("sha256", secret).update(message).digest();
}

function matches(expected: Buffer, presentedHex: string): boolean {
  if (!HMAC_SHA256_HEX_PATTERN.test(presentedHex)) return false;
  const presented = Buffer.from(presentedHex, "hex");
  return (
    presented.length === expected.length && timingSafeEqual(presented, expected)
  );
}

/** True only when `signature` is the webhook secret's HMAC of exactly these bytes. */
export function verifyWebhookSignature(
  rawBody: Uint8Array,
  signature: string | null | undefined,
  webhookSecret: string,
): boolean {
  if (typeof signature !== "string" || webhookSecret === "") return false;
  return matches(hmacSha256(webhookSecret, rawBody), signature);
}

/** True only when `signature` is the key secret's HMAC of `<stored order id>|<payment id>`. */
export function verifyCheckoutSignature(
  storedProviderOrderId: string,
  paymentId: string,
  signature: string | null | undefined,
  keySecret: string,
): boolean {
  if (typeof signature !== "string" || keySecret === "") return false;
  if (
    !RAZORPAY_ORDER_ID_PATTERN.test(storedProviderOrderId) ||
    !RAZORPAY_PAYMENT_ID_PATTERN.test(paymentId)
  )
    return false;
  return matches(
    hmacSha256(keySecret, `${storedProviderOrderId}|${paymentId}`),
    signature,
  );
}
