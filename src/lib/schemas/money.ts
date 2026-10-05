import { z } from "zod";

import { MAX_PAISE, parsePaise } from "@/lib/money";

/**
 * Zod mirrors of the money contract (S1.1). `paiseSchema` is the lossless database/JSON boundary: it accepts
 * what PostgREST or a JSON body can carry (a safe-integer number, a decimal string or a bigint) and yields an
 * exact `bigint`, refusing negatives, fractions, unsafe numbers and values above the schema bound — never a
 * silent coercion to an approximate Number.
 */
export const paiseSchema = z
  .union([z.bigint(), z.number(), z.string()])
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

/** A money column that may be unknown until the owner supplies it (shipping, tax — OI-02, OI-03). */
export const nullablePaiseSchema = z.union([z.null(), paiseSchema]);

export const currencySchema = z.literal("INR");

export { MAX_PAISE };
