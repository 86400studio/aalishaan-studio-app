import {
  BAG_STATUS,
  BAG_ROW,
  BAG_STORAGE_NOTICES,
} from "@/content/public/cart";
import {
  finishOfCode,
  slugOfCode,
  type BagRow,
  type BagSnapshot,
  type BagValidationState,
} from "@/lib/bag";
import { formatRupees } from "@/lib/money";
import type { BagValidationResult } from "@/lib/schemas/bag";
import { FINISH_NAMES, type FinishCode } from "@/lib/schemas/catalogue";
import { catalogueImage } from "@/lib/site-images";

/**
 * What the drawer and the cart draw for the bag — S1.5 (docs/sprint-prompts/S1.5-artwork-bag-cart.md §H.2 "Client
 * validation"). Pure, so its rules are unit-tested (tests/unit/bag-validation.test.ts → "the shared commerce UI"); the React side is
 * ./use-bag-lines.ts. The bag itself holds variant codes and quantities only (src/lib/bag/), so every word and
 * amount a row shows comes from the server's answer (`POST /api/bag`), never from the browser:
 *
 * - Prices, availability and the subtotal come only from the answer for the bag's **current** revision. While that
 *   answer is pending, or after it failed, a row shows no price and the cart's subtotal shows a pending marker —
 *   nothing claims a validated total.
 * - An artwork's title and orientation (catalogue facts, not prices) come from the current answer, or — while the
 *   current revision is pending or failed — from the last answer of this page that named the artwork
 *   (`ArtworkFacts`), so editing a quantity or a finish keeps its row, and the focus inside it, on screen. A row
 *   this page has never had an answer for is not drawn until its answer arrives (`undrawn`).
 * - The image is the frame view of the row's finish, recomputed from the slug through the S1.1 object-path contract
 *   (src/lib/site-images.ts), never a stored or projected path; the finish name is the locked one (locked-facts §3).
 */

export type ArtworkFacts = {
  readonly title: string;
  readonly orientation: "Portrait" | "Landscape";
};

export type BagLinePrice =
  | {
      readonly status: "priced";
      /** The line total, `formatRupees` of exact paise. */
      readonly line: string;
      /** The unit price, shown only when the quantity is above 1 (bag.js:13). */
      readonly each: string | null;
    }
  /** NS-29 "Not available to order": the variant is in the catalogue but cannot be bought now. */
  | { readonly status: "unavailable" }
  /** The current revision's answer has not arrived (or failed): no price. */
  | { readonly status: "pending" };

export type BagLine = {
  readonly code: string;
  readonly slug: string;
  readonly finish: FinishCode;
  readonly finishName: string;
  readonly quantity: number;
  readonly title: string;
  readonly href: string;
  readonly spec: string;
  readonly alt: string;
  readonly image: { readonly src: string; readonly srcSet: string };
  readonly price: BagLinePrice;
};

export type BagView = {
  readonly lines: readonly BagLine[];
  /** Rows with no answer yet on this page: kept in the bag, not drawn. */
  readonly undrawn: number;
};

/** The answer for the bag's current revision, or null (pending, failed, idle or for an older revision). */
export function currentAnswer(
  snapshot: BagSnapshot,
  validation: BagValidationState,
): BagValidationResult | null {
  return validation.status === "ok" &&
    validation.revision === snapshot.revision &&
    snapshot.hydrated
    ? validation.result
    : null;
}

/** Remembers the artworks an answer names, for the rows of a later revision that is still pending. */
export function rememberArtworks(
  known: Map<string, ArtworkFacts>,
  answer: BagValidationResult,
): void {
  for (const item of answer.items)
    known.set(item.slug, { title: item.title, orientation: item.orientation });
}

export function bagLines(
  rows: readonly BagRow[],
  answer: BagValidationResult | null,
  known: ReadonlyMap<string, ArtworkFacts>,
): BagView {
  const answered = new Map(
    (answer?.items ?? []).map((item) => [item.variant_code, item]),
  );
  const lines: BagLine[] = [];
  let undrawn = 0;
  for (const row of rows) {
    const slug = slugOfCode(row.code);
    const finish = finishOfCode(row.code);
    const item = answered.get(row.code);
    const facts: ArtworkFacts | undefined = item
      ? { title: item.title, orientation: item.orientation }
      : known.get(slug);
    if (!facts) {
      undrawn += 1;
      continue;
    }
    const finishName = item?.finish_name ?? FINISH_NAMES[finish];
    const price: BagLinePrice = !item
      ? { status: "pending" }
      : item.available
        ? {
            status: "priced",
            line: formatRupees(item.line_total_paise),
            each: row.quantity > 1 ? formatRupees(item.unit_price_paise) : null,
          }
        : { status: "unavailable" };
    const large = catalogueImage(slug, `frame-${finish}`, "1200");
    lines.push({
      code: row.code,
      slug,
      finish,
      finishName,
      quantity: row.quantity,
      title: facts.title,
      href: `/artworks/${slug}`,
      spec: BAG_ROW.spec(facts.orientation, finishName),
      alt: BAG_ROW.alt(facts.title, finishName),
      image: {
        src: large,
        srcSet: `${catalogueImage(slug, `frame-${finish}`, "480")} 480w, ${large} 1200w`,
      },
      price,
    });
  }
  return { lines, undrawn };
}

/** The status sentences under the rows: the validation state, the removal notice and the storage notice. */
export function bagStatusMessages(
  snapshot: BagSnapshot,
  validation: BagValidationState,
): string[] {
  if (!snapshot.hydrated) return [];
  const messages: string[] = [];
  if (snapshot.rows.length > 0 && !currentAnswer(snapshot, validation))
    messages.push(
      validation.status === "failed" &&
        validation.revision === snapshot.revision
        ? BAG_STATUS.failed
        : BAG_STATUS.pending,
    );
  if (validation.removedCount > 0)
    messages.push(BAG_STATUS.removed(validation.removedCount));
  if (snapshot.notice === "memory_only")
    messages.push(BAG_STORAGE_NOTICES.memoryOnly);
  if (snapshot.notice === "corrupt_cleared")
    messages.push(BAG_STORAGE_NOTICES.corruptCleared);
  return messages;
}

/** True when the current revision's check failed: the "Try again" button shows. */
export function validationFailed(
  snapshot: BagSnapshot,
  validation: BagValidationState,
): boolean {
  return (
    snapshot.hydrated &&
    snapshot.rows.length > 0 &&
    validation.status === "failed" &&
    validation.revision === snapshot.revision
  );
}

/** The cart's subtotal cell: the server's exact subtotal for the current revision, otherwise a pending marker. */
export function subtotalText(
  snapshot: BagSnapshot,
  validation: BagValidationState,
): string {
  if (!snapshot.hydrated) return "";
  const answer = currentAnswer(snapshot, validation);
  if (answer) return formatRupees(answer.subtotal_paise);
  return validationFailed(snapshot, validation)
    ? BAG_STATUS.subtotalFailed
    : BAG_STATUS.subtotalPending;
}
