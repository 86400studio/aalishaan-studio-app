import { BAG_MAX_QUANTITY, BAG_MAX_ROWS } from "@/lib/schemas/bag";
import {
  finishCodeSchema,
  variantCodeSchema,
  type FinishCode,
} from "@/lib/schemas/catalogue";

/**
 * The bag's rows and their pure normalisation — S1.5 (docs/sprint-prompts/S1.5-artwork-bag-cart.md §H.2 "Bag
 * identity and storage"), shared by the browser store (./store.ts) and anything on the server that needs the same
 * rules. The behaviour reference is prototype/shared/bag.js:7 (`normalize`), never imported:
 *
 * - A row is `{ code, quantity }`: `code` is a variant code `<slug>:<finish>` (the `variants.variant_code`
 *   contract), `quantity` an integer 1–99. Nothing else — no price, title, image or orientation — is ever kept.
 * - Normalising drops a row whose code is not a valid variant code or whose quantity is not an integer of at least
 *   1 (a string, a fraction, zero, a negative, NaN or Infinity), sums duplicate codes in first-seen order, caps
 *   every row at 99 and keeps at most 66 rows (the first 66 distinct codes).
 * - The stored text is `{ "v": 1, "items": [{ "code", "quantity" }] }` under `aalishaanProductBag` (the
 *   prototype's key). The prototype's own array `[{ slug, frame, quantity, title, orientation, image }]` is read as
 *   legacy: its slug and frame become the code, everything else is discarded, and the caller rewrites it in the new
 *   shape. Anything else — text that is not JSON, another version, another shape — is corrupt.
 */

export type BagRow = { readonly code: string; readonly quantity: number };

/** The prototype's own key (prototype/shared/bag.js:5), already cleared by the Cookies control. */
export const BAG_STORAGE_KEY = "aalishaanProductBag";
export const BAG_STORAGE_VERSION = 1;

export function isVariantCode(value: unknown): value is string {
  return variantCodeSchema.safeParse(value).success;
}

/** The finish of a valid variant code (the part after the last colon). */
export function finishOfCode(code: string): FinishCode {
  return finishCodeSchema.parse(code.slice(code.lastIndexOf(":") + 1));
}

/** The artwork slug of a valid variant code (the part before the last colon). */
export function slugOfCode(code: string): string {
  return code.slice(0, code.lastIndexOf(":"));
}

/**
 * Normalises candidate rows: invalid codes and quantities dropped, duplicates summed in first-seen order, every row
 * capped at 99, at most 66 rows. Never throws; a non-array is an empty bag.
 */
export function normaliseRows(candidates: unknown): BagRow[] {
  if (!Array.isArray(candidates)) return [];
  const merged = new Map<string, number>();
  for (const candidate of candidates) {
    if (typeof candidate !== "object" || candidate === null) continue;
    const { code, quantity } = candidate as Record<string, unknown>;
    if (!isVariantCode(code)) continue;
    if (typeof quantity !== "number" || !Number.isInteger(quantity)) continue;
    if (quantity < 1) continue;
    const existing = merged.get(code);
    if (existing === undefined) {
      if (merged.size >= BAG_MAX_ROWS) continue;
      merged.set(code, Math.min(BAG_MAX_QUANTITY, quantity));
    } else {
      merged.set(code, Math.min(BAG_MAX_QUANTITY, existing + quantity));
    }
  }
  return [...merged].map(([code, quantity]) => ({ code, quantity }));
}

export type ParsedStoredBag =
  | {
      status: "ok";
      rows: BagRow[];
      /** True for the prototype's legacy array: the caller rewrites it in the current shape. */
      legacy: boolean;
    }
  | { status: "corrupt" };

/** Reads the stored text: nothing stored is an empty bag; the v1 envelope and the legacy array are read. */
export function parseStoredBag(text: string | null): ParsedStoredBag {
  if (text === null) return { status: "ok", rows: [], legacy: false };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { status: "corrupt" };
  }
  if (Array.isArray(parsed)) {
    // prototype/shared/bag.js:7 — `{ slug, frame, quantity, … }`; only those three are read.
    const candidates = parsed.map((item: unknown) => {
      if (typeof item !== "object" || item === null) return null;
      const { slug, frame, quantity } = item as Record<string, unknown>;
      return typeof slug === "string" && typeof frame === "string"
        ? { code: `${slug}:${frame}`, quantity }
        : null;
    });
    return { status: "ok", rows: normaliseRows(candidates), legacy: true };
  }
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    (parsed as Record<string, unknown>).v === BAG_STORAGE_VERSION &&
    Array.isArray((parsed as Record<string, unknown>).items)
  )
    return {
      status: "ok",
      rows: normaliseRows((parsed as Record<string, unknown>).items),
      legacy: false,
    };
  return { status: "corrupt" };
}

/** The stored text of a bag: the v1 envelope with codes and quantities only. */
export function serialiseBag(rows: readonly BagRow[]): string {
  return JSON.stringify({
    v: BAG_STORAGE_VERSION,
    items: rows.map(({ code, quantity }) => ({ code, quantity })),
  });
}

export type AddResult = {
  rows: BagRow[];
  /**
   * True when the add could not be applied in full: the row already holds 99 (nothing changes — the prototype's
   * "already has 99" case, prototype/product/r3.js:115–128), or would pass 99 (capped at 99), or the bag already
   * holds 66 other rows (nothing changes).
   */
  capped: boolean;
};

/** Adds `quantity` (default 1) of a variant: an existing row grows up to 99, a new row is appended. */
export function addRow(
  rows: readonly BagRow[],
  code: string,
  quantity = 1,
): AddResult {
  if (
    !isVariantCode(code) ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > BAG_MAX_QUANTITY
  )
    return { rows: [...rows], capped: false };
  const index = rows.findIndex((row) => row.code === code);
  if (index === -1) {
    if (rows.length >= BAG_MAX_ROWS) return { rows: [...rows], capped: true };
    return { rows: [...rows, { code, quantity }], capped: false };
  }
  const existing = rows[index].quantity;
  const next = Math.min(BAG_MAX_QUANTITY, existing + quantity);
  const capped = existing + quantity > BAG_MAX_QUANTITY;
  if (next === existing) return { rows: [...rows], capped };
  return {
    rows: rows.map((row, at) =>
      at === index ? { code, quantity: next } : row,
    ),
    capped,
  };
}

/** Sets a row's quantity; only an integer 1–99 for a code in the bag changes anything. */
export function setRowQuantity(
  rows: readonly BagRow[],
  code: string,
  quantity: number,
): BagRow[] {
  if (
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > BAG_MAX_QUANTITY
  )
    return [...rows];
  return rows.map((row) => (row.code === code ? { code, quantity } : row));
}

/**
 * Moves a row to another finish of the same artwork. When the bag already holds that finish the two rows merge
 * (quantities summed, capped at 99) at the earlier row's position — prototype/shared/bag.js:17 with :7.
 */
export function changeRowFinish(
  rows: readonly BagRow[],
  code: string,
  finish: FinishCode,
): BagRow[] {
  if (!isVariantCode(code) || !finishCodeSchema.safeParse(finish).success)
    return [...rows];
  const next = `${slugOfCode(code)}:${finish}`;
  if (next === code || !rows.some((row) => row.code === code)) return [...rows];
  return normaliseRows(
    rows.map((row) =>
      row.code === code ? { code: next, quantity: row.quantity } : row,
    ),
  );
}

export function removeRow(rows: readonly BagRow[], code: string): BagRow[] {
  return rows.filter((row) => row.code !== code);
}

export function removeRowCodes(
  rows: readonly BagRow[],
  codes: Iterable<string>,
): BagRow[] {
  const drop = new Set(codes);
  return rows.filter((row) => !drop.has(row.code));
}

/** The badge's count: total units, not rows (prototype/shared/bag.js:14). */
export function bagItemCount(rows: readonly BagRow[]): number {
  return rows.reduce((total, row) => total + row.quantity, 0);
}

/**
 * A quantity field's value as a row quantity — prototype/shared/bag.js:17: `Math.max(1, Math.min(99,
 * Math.floor(+value) || 1))`, so an empty, zero, negative or non-numeric entry becomes 1, a fraction is floored and
 * a huge number becomes 99. The store still refuses anything that is not an integer 1–99.
 */
export function quantityFromInput(value: string | number): number {
  const number = Math.floor(typeof value === "number" ? value : Number(value));
  if (Number.isNaN(number) || number < 1) return 1;
  return Math.min(BAG_MAX_QUANTITY, number);
}

export function sameRows(a: readonly BagRow[], b: readonly BagRow[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (row, index) =>
        row.code === b[index].code && row.quantity === b[index].quantity,
    )
  );
}
