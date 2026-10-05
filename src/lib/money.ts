/**
 * The money boundary — S1.1 (docs/TECH-ARCHITECTURE.md → Money; locked-facts §2). Every stored or computed
 * monetary value is an exact integer number of paise held as a `bigint`; rupees exist only at the display
 * edge (`formatRupees`) and at the one seed boundary that reads the prototype's rupee prices. No float
 * arithmetic, no rounding, no silent coercion: a value that is negative, fractional, non-finite, outside the
 * JavaScript safe-integer range or above the schema's bound is refused with a reason.
 *
 * Postgres `bigint` columns arrive through PostgREST as JSON numbers (exact while ≤ 2^53 − 1) or, when a
 * caller asks for text, as decimal strings; `parsePaise` accepts a bigint, a safe integer number or a
 * decimal string and always returns a bigint, so a value that cannot be represented exactly never becomes
 * an approximate Number. `paiseToJson` serialises the other way for logs and API bodies.
 */

/** The upper bound every S1.1 money column enforces (1,000,000,000 rupees in paise). */
export const MAX_PAISE = BigInt("100000000000");

export type PaiseReason =
  "not_a_number" | "not_integer" | "negative" | "unsafe" | "too_large";

export type PaiseResult =
  { ok: true; paise: bigint } | { ok: false; reason: PaiseReason };

const DECIMAL_STRING = /^-?\d{1,21}$/;

/** Parses a database or API value into exact paise, or says why it cannot. */
export function parsePaise(value: unknown): PaiseResult {
  let paise: bigint;
  if (typeof value === "bigint") {
    paise = value;
  } else if (typeof value === "number") {
    if (!Number.isFinite(value)) return { ok: false, reason: "not_a_number" };
    if (!Number.isInteger(value)) return { ok: false, reason: "not_integer" };
    if (!Number.isSafeInteger(value)) return { ok: false, reason: "unsafe" };
    paise = BigInt(value);
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    if (!DECIMAL_STRING.test(trimmed)) {
      if (/^-?\d+\.\d+$/.test(trimmed))
        return { ok: false, reason: "not_integer" };
      return { ok: false, reason: "not_a_number" };
    }
    paise = BigInt(trimmed);
  } else {
    return { ok: false, reason: "not_a_number" };
  }
  if (paise < BigInt(0)) return { ok: false, reason: "negative" };
  if (paise > MAX_PAISE) return { ok: false, reason: "too_large" };
  return { ok: true, paise };
}

/** `parsePaise`, throwing on a refused value (for trusted call sites that have validated already). */
export function toPaise(value: unknown): bigint {
  const result = parsePaise(value);
  if (!result.ok) throw new RangeError(`not exact paise (${result.reason})`);
  return result.paise;
}

/** Exact rupees (whole or with at most two decimals, as a string) → paise. The seed boundary only. */
export function rupeesToPaise(rupees: string | number): PaiseResult {
  const text = typeof rupees === "number" ? String(rupees) : rupees.trim();
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) {
    if (/^-/.test(text)) return { ok: false, reason: "negative" };
    if (/^\d+\.\d{3,}$/.test(text)) return { ok: false, reason: "not_integer" };
    return { ok: false, reason: "not_a_number" };
  }
  const whole = BigInt(match[1]);
  const fraction = BigInt((match[2] ?? "").padEnd(2, "0"));
  return parsePaise(whole * BigInt(100) + fraction);
}

/** Paise as a decimal string for JSON bodies and logs — never a Number. */
export function paiseToJson(paise: bigint): string {
  return paise.toString(10);
}

/**
 * Display only: "₹19,000" for 1,900,000 paise, with Indian grouping (12,34,567) and no decimals when the
 * amount is whole rupees, two decimals otherwise. Browser values are display only (SECURITY-CHECKLIST §9).
 */
export function formatRupees(paise: bigint): string {
  if (paise < BigInt(0)) throw new RangeError("negative paise");
  const rupees = paise / BigInt(100);
  const remainder = paise % BigInt(100);
  const grouped = groupIndian(rupees.toString(10));
  return remainder === BigInt(0)
    ? `₹${grouped}`
    : `₹${grouped}.${remainder.toString(10).padStart(2, "0")}`;
}

function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  let rest = digits.slice(0, -3);
  const parts: string[] = [];
  while (rest.length > 2) {
    parts.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest) parts.unshift(rest);
  return `${parts.join(",")},${last3}`;
}

/** Exact sums for line totals: unit price × quantity, bounded. */
export function multiplyPaise(
  unitPaise: bigint,
  quantity: number,
): PaiseResult {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99)
    return { ok: false, reason: "not_integer" };
  return parsePaise(unitPaise * BigInt(quantity));
}

/** Exact sums for order totals: every part validated, NULL parts (unknown charges) contribute nothing. */
export function sumPaise(parts: ReadonlyArray<bigint | null>): PaiseResult {
  let total = BigInt(0);
  for (const part of parts) {
    if (part === null) continue;
    const checked = parsePaise(part);
    if (!checked.ok) return checked;
    total += checked.paise;
  }
  return parsePaise(total);
}
