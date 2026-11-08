"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  bagItemCount,
  bagStore,
  createBagValidationController,
  requestBagValidation,
  type BagAddOutcome,
  type BagSnapshot,
  type BagStore,
  type BagValidationState,
  type BagValidator,
} from "@/lib/bag";
import type { FinishCode } from "@/lib/schemas/catalogue";

/**
 * The bag for React — S1.5 (docs/sprint-prompts/S1.5-artwork-bag-cart.md §H.2 "Bag identity and storage", "Client
 * validation"). Mounted once in the public shell (src/components/shell/public-shell.tsx), above the overlays, so the
 * `(public)` pages, the cart drawer, the header badge and the global 404 share one bag and one validation. It adds no
 * rule of its own: the store (src/lib/bag/store.ts) is the one writer and the validation controller
 * (src/lib/bag/validation.ts) owns the revision rules — one request per revision, late answers discarded, removals
 * applied once, failures keeping the rows. Both are read with `useSyncExternalStore`, so the server and hydrating
 * renders see the unhydrated empty bag and an idle validation.
 *
 * Validation runs only while some mounted component asks for it: `useBagValidation(active)` — the drawer passes its
 * open state, the cart page passes nothing. `useBag()` alone reads the bag (the badge, the artwork page's add) and
 * never starts a request.
 */

export type { BagValidationState } from "@/lib/bag";

export type BagContextValue = {
  snapshot: BagSnapshot;
  /** The badge's count: total units (prototype/shared/bag.js:14). */
  itemCount: number;
  add: (code: string, quantity?: number) => BagAddOutcome;
  setQuantity: (code: string, quantity: number) => void;
  changeFinish: (code: string, finish: FinishCode) => void;
  remove: (code: string) => void;
  /** Empties the bag (and so aborts its validation in flight). */
  clear: () => void;
  /** The validation of the current revision only; `result` is null unless `status` is `ok`. */
  validation: BagValidationState;
  retry: () => void;
  dismissRemovedNotice: () => void;
  /** Registers a need for validation; returns its release. Components use `useBagValidation` instead. */
  demandValidation: () => () => void;
};

const BagContext = createContext<BagContextValue | null>(null);

export function BagProvider({
  children,
  store = bagStore,
  validate = requestBagValidation,
}: {
  children: ReactNode;
  /** Injectable for tests; the page's singleton otherwise. */
  store?: BagStore;
  validate?: BagValidator;
}) {
  const controller = useMemo(
    () => createBagValidationController(store, validate),
    [store, validate],
  );
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  const validation = useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getServerState,
  );

  const value = useMemo<BagContextValue>(
    () => ({
      snapshot,
      itemCount: bagItemCount(snapshot.rows),
      add: (code, quantity) => store.add(code, quantity),
      setQuantity: (code, quantity) => store.setQuantity(code, quantity),
      changeFinish: (code, finish) => store.changeFinish(code, finish),
      remove: (code) => store.remove(code),
      clear: () => store.clear(),
      validation,
      retry: controller.retry,
      dismissRemovedNotice: controller.dismissRemoved,
      demandValidation: controller.demand,
    }),
    [snapshot, validation, store, controller],
  );

  return <BagContext.Provider value={value}>{children}</BagContext.Provider>;
}

/** The shared bag: its snapshot, its actions and the current revision's validation. */
export function useBag(): BagContextValue {
  const value = useContext(BagContext);
  if (!value) throw new Error("useBag is used outside the public shell");
  return value;
}

/**
 * `useBag()`, and validation for as long as `active` is true (the default): the drawer passes its open state, the
 * cart page passes nothing. When no component asks any more, no new request starts; one in flight still lands for
 * its revision, and its answer is reused when asked again.
 */
export function useBagValidation(active = true): BagContextValue {
  const bag = useBag();
  const { demandValidation } = bag;
  useEffect(() => {
    if (!active) return;
    return demandValidation();
  }, [active, demandValidation]);
  return bag;
}
