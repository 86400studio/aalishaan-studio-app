import type { BagValidationResult } from "@/lib/schemas/bag";

import type { BagRow } from "./rows";
import type { BagStore } from "./store";
import {
  requestBagValidation,
  type BagValidationOutcome,
  type ValidateBagOptions,
} from "./validate";

/**
 * The bag's one shared validation — S1.5 (docs/sprint-prompts/S1.5-artwork-bag-cart.md §H.2 "Client validation"),
 * framework-free so its revision rules are unit-tested (tests/unit/bag.test.ts); React reaches it through
 * src/components/commerce/bag-provider.tsx. One controller per page, over the one store (./store.ts):
 *
 * - It validates while something asks for it (`demand()` — the open drawer, the cart page), the bag is hydrated and
 *   holds rows: one request (./validate.ts) per bag revision, however many askers. An empty bag is `ok` with a zero
 *   subtotal and no request. The answer held for the current revision serves every asker present at the same
 *   moment; a fresh ask after every asker had gone (the drawer opened again, the cart page visited) asks again, so
 *   neither an earlier answer nor an earlier failure is shown as current.
 * - Each request is tagged with the revision (and retry attempt) it was made for. A change of the bag aborts the
 *   request in flight and starts one for the new revision; an answer that still arrives for a superseded revision is
 *   discarded, so a late answer can never resurrect a removed row or overwrite a newer quantity or finish. A cleared
 *   bag is empty, so its request is aborted too. The last listener leaving aborts it as well.
 * - While pending, or after a failure (a network error, the 503 of an unreadable catalogue, an answer that does not
 *   parse or add up), the rows stay stored and `result` is null: nothing may show a validated total. `retry()` asks
 *   again for the same revision.
 * - An ok answer that removes codes (no longer in the projection) removes those rows from the store in one change
 *   and adds their number to `removedCount` for the removal notice (`dismissRemoved()` resets it). The answer then
 *   stands for the new revision as is — its items are exactly the remaining rows — so the removal costs no second
 *   request.
 */

export type BagValidationStatus = "idle" | "pending" | "ok" | "failed";

export type BagValidationState = {
  readonly status: BagValidationStatus;
  /** The bag revision this state describes — always the store's current one. */
  readonly revision: number;
  /** The parsed answer, for `ok` only. */
  readonly result: BagValidationResult | null;
  /** Rows removed by validation since the notice was last dismissed. */
  readonly removedCount: number;
};

export type BagValidator = (
  rows: readonly BagRow[],
  options: ValidateBagOptions,
) => Promise<BagValidationOutcome>;

export type BagValidationController = {
  getState: () => BagValidationState;
  getServerState: () => BagValidationState;
  subscribe: (listener: () => void) => () => void;
  /** Asks for validation until the returned release is called (idempotent). */
  demand: () => () => void;
  retry: () => void;
  dismissRemoved: () => void;
};

/** The ok result of an empty bag: nothing to ask. */
export const EMPTY_BAG_RESULT: BagValidationResult = Object.freeze({
  status: "ok",
  items: Object.freeze([]) as unknown as BagValidationResult["items"],
  removed: Object.freeze([]) as unknown as BagValidationResult["removed"],
  subtotal_paise: BigInt(0),
  item_count: 0,
});

export const IDLE_VALIDATION: BagValidationState = Object.freeze({
  status: "idle",
  revision: 0,
  result: null,
  removedCount: 0,
});

export function createBagValidationController(
  store: BagStore,
  validate: BagValidator = requestBagValidation,
): BagValidationController {
  let state: BagValidationState = IDLE_VALIDATION;
  const listeners = new Set<() => void>();
  let releaseStore: (() => void) | null = null;
  let demand = 0;
  let attempt = 0;
  let removedCount = 0;
  let answer: { revision: number; result: BagValidationResult } | null = null;
  let failure: { revision: number; attempt: number } | null = null;
  let inFlight: {
    revision: number;
    attempt: number;
    controller: AbortController;
  } | null = null;
  /** A validation removal in progress: its answer stands for the revision the removal produces. */
  let carrying: BagValidationResult | null = null;

  function set(
    status: BagValidationStatus,
    revision: number,
    result: BagValidationResult | null,
  ): void {
    if (
      state.status === status &&
      state.revision === revision &&
      state.result === result &&
      state.removedCount === removedCount
    )
      return;
    state = Object.freeze({ status, revision, result, removedCount });
    for (const listener of [...listeners]) listener();
  }

  function abort(): void {
    inFlight?.controller.abort();
    inFlight = null;
  }

  function start(rows: readonly BagRow[], revision: number): void {
    abort();
    const controller = new AbortController();
    const request = { revision, attempt, controller };
    inFlight = request;
    Promise.resolve()
      .then(() => validate(rows, { signal: controller.signal }))
      .catch((): BagValidationOutcome => ({
        status: "failed",
        reason: "network",
      }))
      .then((outcome) => {
        // Superseded (a newer revision or attempt, a clear, the last listener gone): not this bag's answer.
        if (inFlight !== request) return;
        inFlight = null;
        if (
          controller.signal.aborted ||
          store.getSnapshot().revision !== revision
        )
          return sync();
        // An "aborted" outcome for a request nobody aborted is not an answer: a failure, never a silent retry loop.
        if (outcome.status !== "ok") {
          failure = { revision, attempt: request.attempt };
          return sync();
        }
        const { result } = outcome;
        if (result.removed.length === 0) {
          answer = { revision, result };
          return sync();
        }
        carrying = { ...result, removed: [] };
        removedCount += result.removed.length;
        store.removeCodes(result.removed.map((item) => item.variant_code));
        carrying = null;
        sync();
      });
  }

  function sync(): void {
    const { hydrated, rows, revision } = store.getSnapshot();
    if (carrying !== null) {
      answer = { revision, result: carrying };
      carrying = null;
    }
    if (!hydrated) return set("idle", revision, null);
    if (rows.length === 0) {
      abort();
      return set("ok", revision, EMPTY_BAG_RESULT);
    }
    if (inFlight && inFlight.revision !== revision) abort();
    if (answer?.revision === revision)
      return set("ok", revision, answer.result);
    if (failure?.revision === revision && failure.attempt === attempt)
      return set("failed", revision, null);
    if (demand === 0) return set(inFlight ? "pending" : "idle", revision, null);
    if (!(inFlight?.revision === revision && inFlight.attempt === attempt))
      start(rows, revision);
    set("pending", revision, null);
  }

  return {
    getState: () => state,
    getServerState: () => IDLE_VALIDATION,
    subscribe(listener) {
      listeners.add(listener);
      if (releaseStore === null) releaseStore = store.subscribe(sync);
      sync();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          releaseStore?.();
          releaseStore = null;
          abort();
        }
      };
    },
    demand() {
      // A fresh ask (the drawer opening, the cart page mounting, after every asker had gone) checks the bag again:
      // neither an earlier failure nor an earlier answer is shown as the current one (no old validation response).
      // Askers present at the same moment — the drawer opened on the cart page — share one answer.
      if (demand === 0) {
        failure = null;
        answer = null;
      }
      demand += 1;
      sync();
      let released = false;
      return () => {
        if (released) return;
        released = true;
        demand -= 1;
        sync();
      };
    },
    retry() {
      attempt += 1;
      sync();
    },
    dismissRemoved() {
      removedCount = 0;
      const { status, revision, result } = state;
      set(status, revision, result);
    },
  };
}
