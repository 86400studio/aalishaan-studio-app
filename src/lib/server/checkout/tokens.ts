import "server-only";

import { createHash, createHmac, randomBytes } from "node:crypto";

/**
 * The checkout's hashes and derived values — S1.6 (docs/sprint-prompts/S1.6-checkout-pending-order.md §H.3
 * "Attempt ownership", "Confirmation capability"; D-09 as amended by D-61).
 *
 * The attempt key (32 random bytes, minted by the browser, base64url):
 *   - `attemptHash(key)` — its SHA-256, the only form the database holds and the only handle on an attempt;
 *   - `payloadMac(key, canonical)` — an HMAC of the canonical bag and details keyed by the key itself, so the same
 *     key with other details is refused, and a database copy alone holds no digest of personal data it could test.
 *
 * The confirmation link (D-61): `salt` = 32 random bytes per order; `token = base64url(HMAC-SHA-256(secret,
 * label ‖ salt))` with the server-only `ORDER_TOKEN_SECRET`; the database stores the salt and the token's SHA-256,
 * never the token. The token can therefore be derived again — for S1.7's verified return and S1.8's email — without
 * storing or rotating it, and `/order/[token]` verifies by hash alone. `issueConfirmationToken` deliberately returns
 * no token: S1.6 hands it to nobody (S1.7 delivers it only after its signature check). The cost, stated in the
 * decision: someone holding both a database copy and the secret could derive every order's link, and rotating the
 * secret revokes none (verification uses the stored hash).
 *
 * The provider receipt is `pa_` + the payment attempt's id without dashes (35 characters; Razorpay allows 40): a
 * stable, non-personal reference, and the handle the recovery read uses.
 */

const TOKEN_LABEL = "aalishaan.order-token.v1:";
const HEX_64 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function sha256Hex(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

/** The stored handle of an attempt: lower-case hex SHA-256 of the key as sent. */
export function attemptHash(attemptKey: string): string {
  return sha256Hex(attemptKey);
}

/** The payload binding: lower-case hex HMAC-SHA-256 of the canonical payload, keyed by the attempt key's bytes. */
export function payloadMac(attemptKey: string, canonical: string): string {
  return createHmac("sha256", Buffer.from(attemptKey, "base64url"))
    .update(canonical, "utf8")
    .digest("hex");
}

/** The confirmation token of an order, derived from its stored salt. Server-side only; never logged or stored. */
export function deriveConfirmationToken(
  secret: string,
  saltHex: string,
): string {
  if (!HEX_64.test(saltHex)) throw new RangeError("not a token salt");
  return createHmac("sha256", secret)
    .update(TOKEN_LABEL, "utf8")
    .update(Buffer.from(saltHex, "hex"))
    .digest("base64url");
}

/** What `/order/[token]` compares: lower-case hex SHA-256 of the token (D-09). */
export function confirmationTokenHash(token: string): string {
  return sha256Hex(token);
}

export type IssuedConfirmation = { salt: string; hash: string };

/** A new order's salt and token hash — the two values the database stores. The token itself is not returned. */
export function issueConfirmationToken(
  secret: string,
  random: (size: number) => Buffer = randomBytes,
): IssuedConfirmation {
  const salt = random(32).toString("hex");
  return {
    salt,
    hash: confirmationTokenHash(deriveConfirmationToken(secret, salt)),
  };
}

/** The Razorpay receipt of a payment attempt: `pa_<32 hex>`. */
export function providerReceipt(paymentAttemptId: string): string {
  const id = paymentAttemptId.toLowerCase();
  if (!UUID.test(id)) throw new RangeError("not a payment attempt id");
  return `pa_${id.replace(/-/g, "")}`;
}
