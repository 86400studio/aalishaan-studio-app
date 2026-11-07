import type { FinishCode } from "@/lib/schemas/catalogue";

import {
  addRow,
  BAG_STORAGE_KEY,
  changeRowFinish,
  parseStoredBag,
  removeRow,
  removeRowCodes,
  sameRows,
  serialiseBag,
  setRowQuantity,
  type BagRow,
} from "./rows";

/**
 * The bag's one browser store — S1.5 (docs/sprint-prompts/S1.5-artwork-bag-cart.md §H.2 "Bag identity and
 * storage"). Every caller — the artwork page's add, the drawer, the cart page, the header badge, the Cookies clear
 * control — reads and writes the bag through this module and nothing else writes `aalishaanProductBag`. The
 * behaviour reference is prototype/shared/bag.js (read, save, the `bagchange` event; never imported).
 *
 * - The snapshot is `{ hydrated, rows, revision, persistence, notice }`, immutable, and the same object until the
 *   bag changes — `getSnapshot` / `getServerSnapshot` / `subscribe` are `useSyncExternalStore`'s contract. The
 *   server render and the hydrating render see the unhydrated empty bag (`getServerSnapshot`, which the store also
 *   starts from); the stored bag is read when the first subscriber arrives (after hydration) or `hydrate()` runs,
 *   so a hydrating page never mismatches and never overwrites the stored bag with an empty one.
 * - Every change bumps the in-memory `revision`, writes the v1 envelope (./rows.ts), notifies subscribers and raises
 *   `bagchange` (`CustomEvent`, `detail: { revision }`) on the window. A call that changes nothing (the same rows) is
 *   not a change. A client validation answer is tagged with the revision it was made for
 *   (src/components/commerce/bag-provider.tsx).
 * - Another tab's change arrives as `storage` for this key (or a whole-storage clear) and is re-read — never
 *   re-written, so two tabs cannot feed each other; a page restored from the back-forward cache re-reads too. Both
 *   raise `bagchange` like any change.
 * - Storage that is blocked (no storage, or reading throws) or full (writing throws) keeps the bag in memory for the
 *   page's life: `persistence: "memory"` and the `memory_only` notice — the prototype's own disclosure
 *   (prototype/shared/bag.js:15). Other tabs' changes are then ignored, since this page's bag is no longer theirs.
 * - A stored value that is corrupt (not JSON, another version or shape) is cleared with the `corrupt_cleared`
 *   notice, which the next change replaces. The prototype's legacy array is read and rewritten in the v1 shape.
 * - No price, title, image or orientation is ever stored; the rows are variant codes and quantities.
 */

export type BagPersistence = "local" | "memory";
export type BagNotice = "memory_only" | "corrupt_cleared" | null;

export type BagSnapshot = {
  readonly hydrated: boolean;
  readonly rows: readonly BagRow[];
  readonly revision: number;
  readonly persistence: BagPersistence;
  readonly notice: BagNotice;
};

export const BAG_CHANGE_EVENT = "bagchange";
export type BagChangeDetail = { revision: number };

export type BagStoreEnvironment = {
  /** The persistent storage (`window.localStorage`); null or a throw means storage is blocked. */
  storage: () => Storage | null;
  /** Where `bagchange` is raised and `storage` / `pageshow` are heard (the window); null on the server. */
  events: () => EventTarget | null;
};

export type BagAddOutcome = {
  /** The add was not applied in full (the row holds 99, or the bag is full) — ./rows.ts `addRow`. */
  capped: boolean;
  persistence: BagPersistence;
};

export type BagStore = {
  getSnapshot: () => BagSnapshot;
  getServerSnapshot: () => BagSnapshot;
  subscribe: (listener: () => void) => () => void;
  /** Reads the stored bag once; later calls do nothing. Every action hydrates first. */
  hydrate: () => void;
  add: (code: string, quantity?: number) => BagAddOutcome;
  setQuantity: (code: string, quantity: number) => void;
  changeFinish: (code: string, finish: FinishCode) => void;
  remove: (code: string) => void;
  removeCodes: (codes: Iterable<string>) => void;
  /** Empties the bag and removes the stored value (the Cookies control). */
  clear: () => void;
};

const NO_ROWS: readonly BagRow[] = Object.freeze([]);

/** The unhydrated empty bag: the server snapshot, and the store's state until it hydrates. */
export const UNHYDRATED_BAG: BagSnapshot = Object.freeze({
  hydrated: false,
  rows: NO_ROWS,
  revision: 0,
  persistence: "local",
  notice: null,
});

export function createBagStore(environment: BagStoreEnvironment): BagStore {
  let snapshot: BagSnapshot = UNHYDRATED_BAG;
  let storage: Storage | null = null;
  let memoryOnly = false;
  let target: EventTarget | null = null;
  const listeners = new Set<() => void>();

  const persistence = (): BagPersistence => (memoryOnly ? "memory" : "local");

  function publish(rows: readonly BagRow[], notice: BagNotice): void {
    snapshot = Object.freeze({
      hydrated: true,
      rows: Object.freeze(rows.map((row) => Object.freeze({ ...row }))),
      revision: snapshot.revision + 1,
      persistence: persistence(),
      notice,
    });
    for (const listener of [...listeners]) listener();
    const detail: BagChangeDetail = { revision: snapshot.revision };
    target?.dispatchEvent(new CustomEvent(BAG_CHANGE_EVENT, { detail }));
  }

  /** Writes the rows; a full or blocked storage switches the page to memory for its life. */
  function write(rows: readonly BagRow[]): void {
    if (memoryOnly || storage === null) return;
    try {
      storage.setItem(BAG_STORAGE_KEY, serialiseBag(rows));
    } catch {
      memoryOnly = true;
    }
  }

  /** Another tab's change, or a page shown again from the back-forward cache: read, never written. */
  function reread(): void {
    if (memoryOnly || storage === null) return;
    let text: string | null;
    try {
      text = storage.getItem(BAG_STORAGE_KEY);
    } catch {
      return;
    }
    const parsed = parseStoredBag(text);
    if (parsed.status === "corrupt") {
      if (snapshot.rows.length === 0 && snapshot.notice === "corrupt_cleared")
        return;
      publish(NO_ROWS, "corrupt_cleared");
      return;
    }
    if (sameRows(parsed.rows, snapshot.rows)) return;
    publish(parsed.rows, null);
  }

  const onStorage = (event: Event) => {
    const { key, storageArea } = event as StorageEvent;
    if (key !== null && key !== BAG_STORAGE_KEY) return;
    if (storageArea && storageArea !== storage) return;
    reread();
  };
  const onPageShow = (event: Event) => {
    if ((event as PageTransitionEvent).persisted) reread();
  };

  function hydrate(): void {
    if (snapshot.hydrated) return;
    try {
      target = environment.events();
    } catch {
      target = null;
    }
    let candidate: Storage | null;
    try {
      candidate = environment.storage();
    } catch {
      candidate = null;
    }
    let rows: readonly BagRow[] = NO_ROWS;
    let notice: BagNotice = null;
    let text: string | null = null;
    if (candidate === null) {
      memoryOnly = true;
    } else {
      try {
        text = candidate.getItem(BAG_STORAGE_KEY);
        storage = candidate;
      } catch {
        memoryOnly = true;
      }
    }
    if (storage !== null) {
      const parsed = parseStoredBag(text);
      if (parsed.status === "corrupt") {
        notice = "corrupt_cleared";
        try {
          storage.removeItem(BAG_STORAGE_KEY);
        } catch {
          memoryOnly = true;
        }
      } else {
        rows = parsed.rows;
        if (parsed.legacy) write(rows);
      }
    }
    if (memoryOnly) notice = "memory_only";
    target?.addEventListener("storage", onStorage);
    target?.addEventListener("pageshow", onPageShow);
    publish(rows, notice);
  }

  /** One change: written (or kept in memory), then published. Nothing happens when the rows are the same. */
  function change(next: readonly BagRow[]): void {
    if (sameRows(next, snapshot.rows)) return;
    write(next);
    publish(next, memoryOnly ? "memory_only" : null);
  }

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => UNHYDRATED_BAG,
    subscribe(listener) {
      listeners.add(listener);
      hydrate();
      return () => {
        listeners.delete(listener);
      };
    },
    hydrate,
    add(code, quantity = 1) {
      hydrate();
      const result = addRow(snapshot.rows, code, quantity);
      change(result.rows);
      return { capped: result.capped, persistence: persistence() };
    },
    setQuantity(code, quantity) {
      hydrate();
      change(setRowQuantity(snapshot.rows, code, quantity));
    },
    changeFinish(code, finish) {
      hydrate();
      change(changeRowFinish(snapshot.rows, code, finish));
    },
    remove(code) {
      hydrate();
      change(removeRow(snapshot.rows, code));
    },
    removeCodes(codes) {
      hydrate();
      change(removeRowCodes(snapshot.rows, codes));
    },
    clear() {
      hydrate();
      // Removal is tried even in memory-only mode: a storage that refuses writes (a full quota) may still accept a
      // removal, and the old stored bag must not come back on the next load.
      if (storage !== null) {
        try {
          storage.removeItem(BAG_STORAGE_KEY);
        } catch {
          memoryOnly = true;
        }
      }
      const notice: BagNotice = memoryOnly ? "memory_only" : null;
      if (snapshot.rows.length === 0 && snapshot.notice === notice) return;
      publish(NO_ROWS, notice);
    },
  };
}

function browserWindow(): Window | null {
  return typeof window === "undefined" ? null : window;
}

/** The page's bag: `window.localStorage` and the window's events. Inert on the server (nothing is read there). */
export const bagStore: BagStore = createBagStore({
  storage: () => browserWindow()?.localStorage ?? null,
  events: browserWindow,
});
