import {
  bagOkResponseSchema,
  type BagRequest,
  type BagValidationResult,
} from "@/lib/schemas/bag";

import type { BagRow } from "./rows";

/**
 * The browser's call to `POST /api/bag` — S1.5 (docs/sprint-prompts/S1.5-artwork-bag-cart.md §H.2 "Client
 * validation"). The request carries the rows' variant codes and quantities only — every persisted or displayed field
 * is left behind — and the answer is parsed with the shared schema (src/lib/schemas/bag.ts). Anything but a 200
 * whose body parses and adds up is `failed`: a network error, a timeout, a 4xx/5xx (the 503 `unavailable` of a
 * catalogue that cannot be read included), a body that is not JSON or does not match. A failure never empties the
 * bag; the caller keeps the rows and shows the pending or failed state. An answer must also cover exactly the rows
 * asked about (`answersRows`). An aborted request (a newer revision, a cleared bag, an unmounted page) is `aborted`,
 * so the caller can ignore it.
 *
 * Which revision an answer belongs to is the caller's business (src/components/commerce/bag-provider.tsx): a late
 * answer for a superseded bag is discarded there.
 */

export const BAG_ENDPOINT = "/api/bag";

export type BagValidationFailure =
  "network" | "unavailable" | "rejected" | "invalid_response";

export type BagValidationOutcome =
  | { status: "ok"; result: BagValidationResult }
  | { status: "failed"; reason: BagValidationFailure }
  | { status: "aborted" };

/** The request body for some rows: `{ items: [{ variant_code, quantity }] }` and nothing else. */
export function bagRequestBody(rows: readonly BagRow[]): BagRequest {
  return {
    items: rows.map((row) => ({
      variant_code: row.code,
      quantity: row.quantity,
    })),
  };
}

export type ValidateBagOptions = {
  signal?: AbortSignal;
  fetch?: typeof fetch;
  endpoint?: string;
};

export async function requestBagValidation(
  rows: readonly BagRow[],
  {
    signal,
    fetch: fetcher = fetch,
    endpoint = BAG_ENDPOINT,
  }: ValidateBagOptions = {},
): Promise<BagValidationOutcome> {
  let response: Response;
  try {
    response = await fetcher(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bagRequestBody(rows)),
      cache: "no-store",
      credentials: "same-origin",
      signal,
    });
  } catch {
    return signal?.aborted
      ? { status: "aborted" }
      : { status: "failed", reason: "network" };
  }
  if (response.status !== 200) {
    // The body is not read: an error answer carries one status and nothing the page shows.
    void response.body?.cancel().catch(() => {});
    if (signal?.aborted) return { status: "aborted" };
    return {
      status: "failed",
      reason: response.status === 503 ? "unavailable" : "rejected",
    };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return signal?.aborted
      ? { status: "aborted" }
      : { status: "failed", reason: "invalid_response" };
  }
  if (signal?.aborted) return { status: "aborted" };
  const parsed = bagOkResponseSchema.safeParse(body);
  if (!parsed.success || !answersRows(parsed.data, rows))
    return { status: "failed", reason: "invalid_response" };
  return { status: "ok", result: parsed.data };
}

/**
 * True when an answer covers exactly the rows asked about: every row once, kept (in order, at its quantity) or
 * removed, and nothing else — an answer about some other bag is not applied to this one.
 */
export function answersRows(
  result: BagValidationResult,
  rows: readonly BagRow[],
): boolean {
  const removed = new Set(result.removed.map((item) => item.variant_code));
  if (removed.size !== result.removed.length) return false;
  const kept = rows.filter((row) => !removed.has(row.code));
  return (
    kept.length + removed.size === rows.length &&
    kept.length === result.items.length &&
    kept.every(
      (row, index) =>
        result.items[index].variant_code === row.code &&
        result.items[index].quantity === row.quantity,
    )
  );
}
