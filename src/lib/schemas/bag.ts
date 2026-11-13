import { z } from "zod";

import { multiplyPaise, parsePaise, sumPaise } from "@/lib/money";
import {
  finishCodeSchema,
  orientationSchema,
  slugSchema,
  variantCodeSchema,
} from "@/lib/schemas/catalogue";

/**
 * The bag's wire contract — S1.5 (docs/sprint-prompts/S1.5-artwork-bag-cart.md §H.2 "POST /api/bag and
 * validateBag()"). Pure and browser-safe: the server parses each request with it (src/lib/server/bag.ts) and the
 * browser parses each answer with it (src/lib/bag/validate.ts), so the two sides cannot drift.
 *
 * - A request is exactly `{ "items": [{ "variant_code", "quantity" }] }`: strict objects at every level, so a
 *   supplied price, total, title, image or any other key is refused (400), never ignored. A row is a variant code
 *   (`<slug>:<finish>`) and a quantity that is a safe integer 1–99 — no string, fraction, zero, negative or huge
 *   number. 0–66 rows (the launch catalogue's 22 artworks × three finishes is the largest bag a normalised browser
 *   bag can hold), no code twice. The body is at most 16 KiB — far above the largest valid body (~5 KiB).
 * - A 200 answer carries money as decimal strings of integer paise (`paiseToJson`; a bigint is not JSON), read back
 *   here with the money boundary (`parsePaise`) into exact `bigint`s. The answer is checked for its own
 *   consistency too (each code matches its slug and finish, each line is unit × quantity, the subtotal is the sum
 *   of the available lines, the count is the sum of the quantities), so an answer that does not add up is a failed
 *   validation in the browser, never a displayed total.
 * - Every error answer is one enumerated status and nothing else.
 *
 * An S1.5 answer is display only: S1.6 recomputes every order line from the projection on the server.
 */

/** At most this many rows: 22 artworks × three finishes, every variant of the launch catalogue once. */
export const BAG_MAX_ROWS = 66;
/** The largest quantity of one row (the prototype's cap, prototype/shared/bag.js:7). */
export const BAG_MAX_QUANTITY = 99;
/** Upper bound on a request body in bytes; a full 66-row bag of the longest real codes is about 5 KiB. */
export const BAG_MAX_BODY_BYTES = 16384;

export const bagQuantitySchema = z.number().int().min(1).max(BAG_MAX_QUANTITY);

export const bagRequestItemSchema = z.strictObject({
  variant_code: variantCodeSchema,
  quantity: bagQuantitySchema,
});

export const bagRequestSchema = z
  .strictObject({
    items: z.array(bagRequestItemSchema).max(BAG_MAX_ROWS),
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

export type BagRequest = z.infer<typeof bagRequestSchema>;
export type BagRequestItem = z.infer<typeof bagRequestItemSchema>;

/** A decimal string of integer paise (no sign, no leading zero, no fraction) → exact `bigint`. */
export const paiseStringSchema = z
  .string()
  .regex(/^(?:0|[1-9][0-9]*)$/)
  .transform((value, ctx) => {
    const result = parsePaise(value);
    if (!result.ok) {
      ctx.addIssue({
        code: "custom",
        message: `not exact paise (${result.reason})`,
      });
      return z.NEVER;
    }
    return result.paise;
  });

export const bagValidatedItemSchema = z.strictObject({
  variant_code: variantCodeSchema,
  quantity: bagQuantitySchema,
  slug: slugSchema,
  title: z.string().min(1).max(160),
  orientation: orientationSchema,
  finish: finishCodeSchema,
  finish_name: z.string().min(1).max(40),
  /** False for a variant the projection marks `unavailable`: kept in the bag, left out of the subtotal. */
  available: z.boolean(),
  unit_price_paise: paiseStringSchema,
  line_total_paise: paiseStringSchema,
});

export const bagRemovedItemSchema = z.strictObject({
  variant_code: variantCodeSchema,
  /** The projection does not hold the code: unknown, draft, in review, hidden or retired. */
  reason: z.literal("not_found"),
});

export const bagOkResponseSchema = z
  .strictObject({
    status: z.literal("ok"),
    items: z.array(bagValidatedItemSchema).max(BAG_MAX_ROWS),
    removed: z.array(bagRemovedItemSchema).max(BAG_MAX_ROWS),
    subtotal_paise: paiseStringSchema,
    item_count: z.number().int().min(0),
  })
  .superRefine((body, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    const codes = new Set<string>();
    let count = 0;
    const lines: bigint[] = [];
    for (const item of body.items) {
      if (item.variant_code !== `${item.slug}:${item.finish}`)
        return fail("an item's code does not match its slug and finish");
      if (codes.has(item.variant_code)) return fail("an item appears twice");
      codes.add(item.variant_code);
      const line = multiplyPaise(item.unit_price_paise, item.quantity);
      if (!line.ok || line.paise !== item.line_total_paise)
        return fail("a line total is not unit price × quantity");
      count += item.quantity;
      if (item.available) lines.push(item.line_total_paise);
    }
    for (const removed of body.removed) {
      if (codes.has(removed.variant_code))
        return fail("a code is both kept and removed");
      codes.add(removed.variant_code);
    }
    const subtotal = sumPaise(lines);
    if (!subtotal.ok || subtotal.paise !== body.subtotal_paise)
      fail("the subtotal is not the sum of the available lines");
    if (count !== body.item_count)
      fail("the item count is not the sum of the quantities");
  });

/** The parsed 200 answer: exact paise as `bigint`. */
export type BagValidationResult = z.infer<typeof bagOkResponseSchema>;
export type BagValidatedItem = z.infer<typeof bagValidatedItemSchema>;
export type BagRemovedItem = z.infer<typeof bagRemovedItemSchema>;

export const BAG_ERROR_STATUSES = [
  "invalid_request",
  "method_not_allowed",
  "too_large",
  /** S1.6 (D-58 #3): too many bag checks from this address in the window — 429. */
  "throttled",
  "unavailable",
] as const;
export type BagErrorStatus = (typeof BAG_ERROR_STATUSES)[number];

export const bagErrorResponseSchema = z.strictObject({
  status: z.enum(BAG_ERROR_STATUSES),
});
