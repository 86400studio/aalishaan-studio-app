import { z } from "zod";

import {
  BAG_MAX_ROWS,
  bagRequestItemSchema,
  type BagRequestItem,
} from "@/lib/schemas/bag";
import {
  emailSchema,
  indianMobileSchema,
  pincodeSchema,
} from "@/lib/schemas/orders";

/**
 * The checkout's wire contract — S1.6 (docs/sprint-prompts/S1.6-checkout-pending-order.md §H.3). Pure and
 * browser-safe: the page checks a form with it before sending, and the server action parses and normalises every
 * submission with it again — the browser's check is a convenience, never the authority.
 *
 * - A submission is exactly the bag's variant codes and quantities, the eight form fields, the chosen payment
 *   method, the total the page showed, a Turnstile token and the attempt key. Strict objects at every level: a
 *   supplied price, customer or order id, sales flag, synthetic flag, policy version or provider order id is refused,
 *   never ignored. No money in it is authoritative — `shown_total_paise` is a precondition the server can only
 *   refuse on (the total changed since the page showed it).
 * - The attempt key is 32 random bytes minted by the browser as base64url (43 characters). The server stores only
 *   its SHA-256; presenting the key is the only way to reach an attempt.
 * - `normaliseCheckoutFields` is the one normalisation: NFC, whitespace runs collapsed, trimmed; the mobile number
 *   stripped of spaces, brackets, `+` and `-` and of a leading `91` before ten digits (locked-facts §6, prototype/
 *   shared/commerce-r9.js `validate`); the email lower-cased. Every field the approved form requires is required
 *   here, although the contact table itself would accept an email or a phone alone.
 * - An answer is one enumerated status. Only `launch` carries data, and only what Checkout.js needs.
 */

export const CHECKOUT_PAYMENT_METHODS = [
  "upi",
  "card",
  "netbanking",
  "wallet",
] as const;
export type CheckoutPaymentMethod = (typeof CHECKOUT_PAYMENT_METHODS)[number];

/** 32 random bytes as unpadded base64url. */
export const ATTEMPT_KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const attemptKeySchema = z.string().regex(ATTEMPT_KEY_PATTERN);

/** The form's fields, by the frozen page's `name` attributes (prototype/pages/checkout/index.html). */
export const CHECKOUT_FIELDS = [
  "name",
  "email",
  "phone",
  "pin",
  "address",
  "address2",
  "city",
  "state",
] as const;
export type CheckoutField = (typeof CHECKOUT_FIELDS)[number];

export type CheckoutFieldValues = Record<CheckoutField, string>;

export const EMPTY_CHECKOUT_FIELDS: CheckoutFieldValues = Object.freeze({
  name: "",
  email: "",
  phone: "",
  pin: "",
  address: "",
  address2: "",
  city: "",
  state: "",
});

/** Why a field is refused. `invalid` is the field's own shape (an email, a mobile number, a PIN code). */
export type CheckoutFieldError = "required" | "invalid" | "too_long";
export type CheckoutFieldErrors = Partial<
  Record<CheckoutField, CheckoutFieldError>
>;

/** The stored limits of 0002_orders (customers_contact, addresses). */
export const CHECKOUT_FIELD_MAX: Readonly<Record<CheckoutField, number>> = {
  name: 120,
  email: 254,
  phone: 10,
  pin: 6,
  address: 200,
  address2: 200,
  city: 100,
  state: 100,
};

/** The most characters a raw field may carry on the wire, before normalisation. */
export const CHECKOUT_RAW_FIELD_MAX = 600;

export type NormalisedCheckoutFields = {
  name: string;
  email: string;
  phone: string;
  pincode: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
};

// Control characters (C0, DEL, C1), the bidirectional controls and the line / paragraph separators, written as
// code points so no invisible character sits in this file.
const FORBIDDEN_CODE_POINT_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0000, 0x001f],
  [0x007f, 0x009f],
  [0x200e, 0x200f],
  [0x2028, 0x202e],
  [0x2066, 0x2069],
];

function hasForbiddenCharacter(value: string): boolean {
  for (const character of value) {
    const point = character.codePointAt(0) ?? 0;
    for (const [from, to] of FORBIDDEN_CODE_POINT_RANGES)
      if (point >= from && point <= to) return true;
  }
  return false;
}

/** NFC, every whitespace run one space, trimmed. */
export function cleanText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

/** The approved checkout's mobile rule: spaces, brackets, `+` and `-` removed, then a leading `91` before ten digits. */
export function normaliseMobile(value: string): string {
  return value.replace(/[\s()+-]/g, "").replace(/^91(?=\d{10}$)/, "");
}

export type CheckoutFieldsResult =
  | { ok: true; fields: NormalisedCheckoutFields }
  | { ok: false; errors: CheckoutFieldErrors };

/** Normalises and checks the eight fields. Never throws; reports every refused field, in the form's order. */
export function normaliseCheckoutFields(
  raw: CheckoutFieldValues,
): CheckoutFieldsResult {
  const errors: CheckoutFieldErrors = {};
  const text = (field: CheckoutField, required: boolean): string => {
    const original = raw[field];
    if (typeof original !== "string" || hasForbiddenCharacter(original)) {
      errors[field] = "invalid";
      return "";
    }
    const value = cleanText(original);
    if (value === "") {
      if (required) errors[field] = "required";
      return "";
    }
    if ([...value].length > CHECKOUT_FIELD_MAX[field])
      errors[field] = "too_long";
    return value;
  };

  const name = text("name", true);

  let email = "";
  const rawEmail = typeof raw.email === "string" ? raw.email.trim() : "";
  if (rawEmail === "") errors.email = "required";
  else {
    const parsed = emailSchema.safeParse(rawEmail);
    if (parsed.success && !hasForbiddenCharacter(parsed.data))
      email = parsed.data;
    else errors.email = "invalid";
  }

  let phone = "";
  const rawPhone = typeof raw.phone === "string" ? raw.phone.trim() : "";
  if (rawPhone === "") errors.phone = "required";
  else {
    const candidate = normaliseMobile(rawPhone);
    if (indianMobileSchema.safeParse(candidate).success) phone = candidate;
    else errors.phone = "invalid";
  }

  let pincode = "";
  const rawPin = typeof raw.pin === "string" ? raw.pin.trim() : "";
  if (rawPin === "") errors.pin = "required";
  else if (pincodeSchema.safeParse(rawPin).success) pincode = rawPin;
  else errors.pin = "invalid";

  const line1 = text("address", true);
  const line2 = text("address2", false);
  const city = text("city", true);
  const state = text("state", true);

  if (Object.keys(errors).length > 0) {
    const ordered: CheckoutFieldErrors = {};
    for (const field of CHECKOUT_FIELDS)
      if (errors[field]) ordered[field] = errors[field];
    return { ok: false, errors: ordered };
  }
  return {
    ok: true,
    fields: {
      name,
      email,
      phone,
      pincode,
      line1,
      line2: line2 === "" ? null : line2,
      city,
      state,
    },
  };
}

const rawField = z.string().max(CHECKOUT_RAW_FIELD_MAX);

/** Integer paise as a decimal string — what the page showed as the total; never used as the amount. */
export const shownTotalSchema = z.string().regex(/^(?:0|[1-9][0-9]{0,11})$/);

export const checkoutSubmissionSchema = z
  .strictObject({
    attempt_key: attemptKeySchema,
    items: z.array(bagRequestItemSchema).min(1).max(BAG_MAX_ROWS),
    shown_total_paise: shownTotalSchema,
    fields: z.strictObject({
      name: rawField,
      email: rawField,
      phone: rawField,
      pin: rawField,
      address: rawField,
      address2: rawField,
      city: rawField,
      state: rawField,
    }),
    payment_method: z.enum(CHECKOUT_PAYMENT_METHODS),
    turnstile_token: z.string().min(1).max(2048),
  })
  .superRefine((body, ctx) => {
    const seen = new Set<string>();
    body.items.forEach((item, index) => {
      if (seen.has(item.variant_code))
        ctx.addIssue({
          code: "custom",
          path: ["items", index, "variant_code"],
          message: "a variant code appears more than once",
        });
      seen.add(item.variant_code);
    });
  });

export type CheckoutSubmission = z.infer<typeof checkoutSubmissionSchema>;

export const checkoutResumeSchema = z.strictObject({
  attempt_key: attemptKeySchema,
});
export type CheckoutResume = z.infer<typeof checkoutResumeSchema>;

/** What Checkout.js is opened with — the durable server answer and nothing else. */
export type CheckoutLaunch = {
  /** The public Razorpay key id (Test Mode in S1.6). */
  key_id: string;
  provider_order_id: string;
  /** Integer paise as a decimal string — the stored amount of the order. */
  amount_paise: string;
  currency: "INR";
  order_number: string;
  /** ISO timestamp: when this pending order stops being payable. Never extended. */
  expires_at: string;
};

/**
 * Every answer of the two checkout actions.
 *
 * - `launch` — a linked, pending, unexpired order: open Checkout.js with it.
 * - `closed` — sales are not open here (NS-04). Nothing was written and no provider was called.
 * - `invalid` — refused fields (`fields`), or a malformed submission (`fields` empty).
 * - `bag_changed` — an item or the total is not what the page showed: check the bag again.
 * - `challenge_failed` — the Turnstile token was missing, spent, expired or refused: a fresh one is needed.
 * - `throttled` — too many attempts from this address.
 * - `unavailable` — a control or the database could not be reached; nothing is known to have been charged.
 * - `in_progress` — another request is starting this payment right now: ask again shortly (resume).
 * - `start_failed` — the payment could not be started for this order; a new submission is a new order.
 * - `start_unknown` — whether the payment could be started is not known; nothing was opened or charged.
 * - `held` — the order exists but is not payable from here (under review, or no longer pending).
 * - `expired` — the order's payment window has passed.
 * - `not_found` — resume only: no attempt for this key (or older than the server honours).
 */
export type CheckoutActionResult =
  | { status: "launch"; launch: CheckoutLaunch }
  | { status: "invalid"; fields: CheckoutFieldErrors }
  | {
      status:
        | "closed"
        | "bag_changed"
        | "challenge_failed"
        | "throttled"
        | "unavailable"
        | "in_progress"
        | "start_failed"
        | "start_unknown"
        | "held"
        | "expired"
        | "not_found";
    };

export type CheckoutActionStatus = CheckoutActionResult["status"];

/**
 * The canonical form of what an attempt covers — the bag (by code) and the normalised fields. The server binds an
 * attempt to it with an HMAC keyed by the attempt key; the browser compares it to decide whether a second press of
 * the pay button is the same submission (the same key) or a changed one (a new key). The payment method, the
 * Turnstile token and the shown total are not part of it.
 */
export function canonicalCheckoutPayload(
  items: readonly BagRequestItem[],
  fields: NormalisedCheckoutFields,
): string {
  const rows = [...items]
    .map((item): [string, number] => [item.variant_code, item.quantity])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return JSON.stringify([
    1,
    rows,
    [
      fields.name,
      fields.email,
      fields.phone,
      fields.pincode,
      fields.line1,
      fields.line2,
      fields.city,
      fields.state,
    ],
  ]);
}
