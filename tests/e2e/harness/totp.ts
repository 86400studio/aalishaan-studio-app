import { createHmac } from "node:crypto";

/**
 * RFC 6238 TOTP for the Playwright auth-setup project — S1.2. Supabase Auth's TOTP factors use SHA-1, 30-second
 * steps and six digits (the authenticator-app defaults). The secret is the base32 key the enrolment page shows for
 * manual entry; it lives only in the harness's git-ignored `.auth/` folder and is never printed.
 */

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=-]/g, "");
  if (clean.length === 0 || /[^A-Z2-7]/.test(clean))
    throw new Error("the TOTP secret is not base32");
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of clean) {
    value = (value << 5) | BASE32.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function totpCode(
  secret: string,
  options: { at?: number; stepSeconds?: number; digits?: number } = {},
): string {
  const step = options.stepSeconds ?? 30;
  const digits = options.digits ?? 6;
  const counter = Math.floor((options.at ?? Date.now()) / 1000 / step);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", base32Decode(secret))
    .update(message)
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 10 ** digits).padStart(digits, "0");
}

/** Milliseconds until the current step ends — a code read this late is better taken from the next step. */
export function millisecondsLeftInStep(
  at = Date.now(),
  stepSeconds = 30,
): number {
  return stepSeconds * 1000 - (at % (stepSeconds * 1000));
}
