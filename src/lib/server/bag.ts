import "server-only";

import { multiplyPaise, paiseToJson, sumPaise } from "@/lib/money";
import {
  BAG_MAX_BODY_BYTES,
  bagRequestSchema,
  type BagErrorStatus,
  type BagRequestItem,
} from "@/lib/schemas/bag";
import type { FinishCode, PublicCatalogueRow } from "@/lib/schemas/catalogue";

import {
  readPublicCatalogueFresh,
  type CatalogueRead,
  type CatalogueUnavailableReason,
} from "./catalogue";

/**
 * Bag validation behind `POST /api/bag` — S1.5 (docs/sprint-prompts/S1.5-artwork-bag-cart.md §H.2 "POST /api/bag
 * and validateBag()"; owner amendment H.1 #3). The one public, read-only validation endpoint: it reads the
 * `public_catalogue` projection afresh (src/lib/server/catalogue.ts `readPublicCatalogueFresh` — the publishable
 * key, session-less, identity-checked, uncached and untagged), writes nothing, needs no session and returns no
 * private data. Its POST method authorises no write.
 *
 * `validateBag(items)` resolves each requested variant code against the projection:
 * - a code the projection holds becomes an item with the projection's own title, orientation, finish, finish name,
 *   availability and price — never a browser value. `available: false` for a variant whose availability is
 *   `unavailable`: kept, left out of the subtotal;
 * - a code it does not hold (unknown, draft, in review, hidden, retired — the projection shows Active artworks only)
 *   is `removed` with `not_found`, so the browser removes the row and says so. An unknown code never becomes an item;
 * - the subtotal is the exact sum (`multiplyPaise`, `sumPaise`) of the available lines in integer paise; the item
 *   count is the sum of the kept items' quantities;
 * - a projection that cannot be read is `unavailable` — never an empty successful bag.
 *
 * `handleBagRequest(request)` is the HTTP contract, fail-closed and bounded before any read:
 *   1. POST only — any other method is 405 with `Allow: POST`;
 *   2. `Content-Type: application/json` — else 400;
 *   3. one bounded body read: a declared `Content-Length` that is not a number is 400, one above 16 KiB — or an
 *      actual body above it — is 413, and the stream is cancelled;
 *   4. the strict schema (src/lib/schemas/bag.ts) — exactly `{ items: [{ variant_code, quantity }] }`, 0–66 rows, no
 *      duplicates, quantities safe integers 1–99; a supplied price, total, title or any other key is 400;
 *   5. the fresh read — unavailable is 503 `{ status: "unavailable" }`.
 * Only then 200. Every answer is JSON with `Cache-Control: no-store`; an error is one enumerated status. No answer
 * echoes the request or carries upstream text, and the log receives sanitised reason codes only (never a code, a
 * quantity, a value or a key). An empty bag is answered without reading the projection.
 *
 * The request is bounded (owner amendment H.1 #3: bounds only — a rate limit arrives with S1.6's Upstash work; the
 * read-amplification residual is recorded in docs/THREAT-MODEL.md). An S1.5 answer is display only: S1.6
 * recomputes every order line from the projection on the server.
 */

export type ValidatedBagItem = {
  variant_code: string;
  quantity: number;
  slug: string;
  title: string;
  orientation: PublicCatalogueRow["orientation"];
  finish: FinishCode;
  finish_name: string;
  available: boolean;
  unit_price_paise: bigint;
  line_total_paise: bigint;
};

export type RemovedBagItem = { variant_code: string; reason: "not_found" };

export type BagValidation =
  | {
      status: "ok";
      items: ValidatedBagItem[];
      removed: RemovedBagItem[];
      subtotal_paise: bigint;
      item_count: number;
    }
  | {
      status: "unavailable";
      reason: CatalogueUnavailableReason | "amount_out_of_range";
    };

/** Resolves already-validated request items against one fresh read of the projection. Never throws. */
export async function validateBag(
  items: readonly BagRequestItem[],
  read: () => Promise<CatalogueRead> = readPublicCatalogueFresh,
): Promise<BagValidation> {
  if (items.length === 0)
    return {
      status: "ok",
      items: [],
      removed: [],
      subtotal_paise: BigInt(0),
      item_count: 0,
    };
  let catalogue: CatalogueRead;
  try {
    catalogue = await read();
  } catch {
    return { status: "unavailable", reason: "query_failed" };
  }
  if (catalogue.status !== "ok")
    return { status: "unavailable", reason: catalogue.reason };

  const variants = new Map<
    string,
    { row: PublicCatalogueRow; variant: PublicCatalogueRow["variants"][number] }
  >();
  for (const row of catalogue.rows)
    for (const variant of row.variants)
      variants.set(variant.variant_code, { row, variant });

  const kept: ValidatedBagItem[] = [];
  const removed: RemovedBagItem[] = [];
  for (const item of items) {
    const found = variants.get(item.variant_code);
    if (!found) {
      removed.push({ variant_code: item.variant_code, reason: "not_found" });
      continue;
    }
    const line = multiplyPaise(found.variant.price_paise, item.quantity);
    if (!line.ok)
      return { status: "unavailable", reason: "amount_out_of_range" };
    kept.push({
      variant_code: found.variant.variant_code,
      quantity: item.quantity,
      slug: found.row.slug,
      title: found.row.title,
      orientation: found.row.orientation,
      finish: found.variant.finish,
      finish_name: found.variant.finish_name,
      available: found.variant.availability === "made_to_order",
      unit_price_paise: found.variant.price_paise,
      line_total_paise: line.paise,
    });
  }
  const subtotal = sumPaise(
    kept.map((item) => (item.available ? item.line_total_paise : null)),
  );
  if (!subtotal.ok)
    return { status: "unavailable", reason: "amount_out_of_range" };
  return {
    status: "ok",
    items: kept,
    removed,
    subtotal_paise: subtotal.paise,
    item_count: kept.reduce((total, item) => total + item.quantity, 0),
  };
}

/** The 200 body: money as decimal strings of integer paise (`paiseToJson`), matching `bagOkResponseSchema`. */
export function bagResponseBody(
  validation: Extract<BagValidation, { status: "ok" }>,
): Record<string, unknown> {
  return {
    status: "ok",
    items: validation.items.map((item) => ({
      variant_code: item.variant_code,
      quantity: item.quantity,
      slug: item.slug,
      title: item.title,
      orientation: item.orientation,
      finish: item.finish,
      finish_name: item.finish_name,
      available: item.available,
      unit_price_paise: paiseToJson(item.unit_price_paise),
      line_total_paise: paiseToJson(item.line_total_paise),
    })),
    removed: validation.removed.map((item) => ({
      variant_code: item.variant_code,
      reason: item.reason,
    })),
    subtotal_paise: paiseToJson(validation.subtotal_paise),
    item_count: validation.item_count,
  };
}

type BoundedBody =
  | { ok: true; text: string }
  | { ok: false; status: "invalid_request" | "too_large" };

/**
 * Reads at most `maxBytes` (the bounded read of src/lib/server/catalogue-revalidation.ts, with the two refusals told
 * apart): a declared length that is not a number is invalid, a declared or actual length above the bound is too
 * large and the stream is cancelled. Invalid UTF-8 is invalid.
 */
async function readBounded(
  request: Request,
  maxBytes: number,
): Promise<BoundedBody> {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    if (!/^\d+$/.test(declared))
      return { ok: false, status: "invalid_request" };
    if (Number(declared) > maxBytes) return { ok: false, status: "too_large" };
  }
  if (!request.body) return { ok: true, text: "" };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return { ok: false, status: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, status: "invalid_request" };
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return {
      ok: true,
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    };
  } catch {
    return { ok: false, status: "invalid_request" };
  }
}

function jsonResponse(
  status: number,
  body: Record<string, unknown>,
  headers?: HeadersInit,
): Response {
  const response = Response.json(body, { status, headers });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

const ERROR_HTTP_STATUS: Readonly<Record<BagErrorStatus, number>> = {
  invalid_request: 400,
  method_not_allowed: 405,
  too_large: 413,
  unavailable: 503,
};

function errorResponse(status: BagErrorStatus): Response {
  return jsonResponse(
    ERROR_HTTP_STATUS[status],
    { status },
    status === "method_not_allowed" ? { Allow: "POST" } : undefined,
  );
}

export type BagRequestDependencies = {
  /** One fresh read of the projection. */
  read: () => Promise<CatalogueRead>;
  /** Where a sanitised reason code goes. */
  report: (message: string) => void;
};

function defaultDependencies(): BagRequestDependencies {
  return {
    read: () => readPublicCatalogueFresh(),
    report: (message) => console.error(message),
  };
}

export async function handleBagRequest(
  request: Request,
  deps: BagRequestDependencies = defaultDependencies(),
): Promise<Response> {
  if (request.method !== "POST") return errorResponse("method_not_allowed");
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json\b/i.test(contentType))
    return errorResponse("invalid_request");
  const body = await readBounded(request, BAG_MAX_BODY_BYTES);
  if (!body.ok) return errorResponse(body.status);
  let candidate: unknown;
  try {
    candidate = JSON.parse(body.text);
  } catch {
    return errorResponse("invalid_request");
  }
  const parsed = bagRequestSchema.safeParse(candidate);
  if (!parsed.success) return errorResponse("invalid_request");

  const validation = await validateBag(parsed.data.items, deps.read);
  if (validation.status !== "ok") {
    deps.report(`[bag] validation unavailable (${validation.reason})`);
    return errorResponse("unavailable");
  }
  return jsonResponse(200, bagResponseBody(validation));
}
