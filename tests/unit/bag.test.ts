import { describe, expect, it, vi } from "vitest";

import {
  addRow,
  BAG_CHANGE_EVENT,
  BAG_STORAGE_KEY,
  bagItemCount,
  changeRowFinish,
  clearDeliveryPin,
  clearFinishSelections,
  createBagStore,
  DELIVERY_CHECK_EVENT,
  DELIVERY_PIN_KEY,
  finishKey,
  isValidPin,
  normaliseRows,
  parseStoredBag,
  parseStoredPin,
  quantityFromInput,
  readDeliveryPin,
  readFinishSelection,
  removeRow,
  removeRowCodes,
  sanitisePinInput,
  saveDeliveryPin,
  saveFinishSelection,
  serialiseBag,
  setRowQuantity,
  subscribeToDeliveryPin,
  UNHYDRATED_BAG,
  createBagValidationController,
  EMPTY_BAG_RESULT,
  IDLE_VALIDATION,
  type BagChangeDetail,
  type BagRow,
  type BagValidationOutcome,
  type BagValidator,
  type DeliveryCheckDetail,
} from "@/lib/bag";
import type { BagValidationResult } from "@/lib/schemas/bag";

/**
 * The bag's browser API — S1.5 (src/lib/bag/; docs/sprint-prompts/S1.5-artwork-bag-cart.md §H.2 "Bag identity and
 * storage", "Selections"): the pure row rules (normalisation, the legacy prototype shape, merge, cap, finish change),
 * the one store (hydration, revision and `bagchange`, cross-tab re-reads that never write, corrupt, blocked and full
 * storage) and the finish and PIN selections. Hermetic: storage and the event target are injected fakes.
 */

/** Two real artwork slugs (prototype/data/products.json). */
const SLUG = "the-bridge-of-blue-stone";
const OTHER = "the-moon-between-two-peaks";
const WHITE = `${SLUG}:white`;
const BLACK = `${SLUG}:black`;
const GOLD = `${SLUG}:antique-gold`;
const OTHER_WHITE = `${OTHER}:white`;

const row = (code: string, quantity: number): BagRow => ({ code, quantity });

type FakeStorageOptions = {
  getThrows?: boolean;
  setThrows?: boolean;
  removeThrows?: boolean;
};

/** A Map-backed Storage that records writes and can refuse reads, writes or removals. */
class FakeStorage implements Storage {
  readonly data = new Map<string, string>();
  readonly writes: Array<[string, string]> = [];
  readonly removals: string[] = [];
  constructor(public options: FakeStorageOptions = {}) {}
  get length(): number {
    return this.data.size;
  }
  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }
  getItem(key: string): string | null {
    if (this.options.getThrows)
      throw new DOMException("denied", "SecurityError");
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.options.setThrows)
      throw new DOMException("full", "QuotaExceededError");
    this.writes.push([key, value]);
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    if (this.options.removeThrows)
      throw new DOMException("denied", "SecurityError");
    this.removals.push(key);
    this.data.delete(key);
  }
  clear(): void {
    this.data.clear();
  }
}

/** A `storage` event as another tab's change delivers it. */
function storageEvent(key: string | null, storageArea: Storage | null): Event {
  const event = new Event("storage");
  Object.defineProperty(event, "key", { value: key });
  Object.defineProperty(event, "storageArea", { value: storageArea });
  return event;
}

function pageShow(persisted: boolean): Event {
  const event = new Event("pageshow");
  Object.defineProperty(event, "persisted", { value: persisted });
  return event;
}

function setup(
  options: {
    stored?: string;
    storage?: FakeStorage | null;
    storageThrows?: boolean;
  } = {},
) {
  const storage =
    options.storage === undefined ? new FakeStorage() : options.storage;
  if (options.stored !== undefined && storage)
    storage.data.set(BAG_STORAGE_KEY, options.stored);
  const events = new EventTarget();
  const changes: BagChangeDetail[] = [];
  events.addEventListener(BAG_CHANGE_EVENT, (event) =>
    changes.push((event as CustomEvent<BagChangeDetail>).detail),
  );
  const store = createBagStore({
    storage: () => {
      if (options.storageThrows) throw new DOMException("denied");
      return storage;
    },
    events: () => events,
  });
  return { store, storage, events, changes };
}

const stored = (storage: FakeStorage | null) =>
  storage?.data.get(BAG_STORAGE_KEY) ?? null;

describe("normaliseRows — the one shape gate (prototype/shared/bag.js:7)", () => {
  it("keeps valid rows in first-seen order and sums duplicates", () => {
    expect(
      normaliseRows([
        row(WHITE, 2),
        row(OTHER_WHITE, 1),
        row(WHITE, 3),
        row(BLACK, 1),
      ]),
    ).toEqual([row(WHITE, 5), row(OTHER_WHITE, 1), row(BLACK, 1)]);
  });

  it("caps every row at 99, including a sum", () => {
    expect(
      normaliseRows([row(WHITE, 98), row(WHITE, 5), row(BLACK, 1000)]),
    ).toEqual([row(WHITE, 99), row(BLACK, 99)]);
  });

  it.each([
    ["a string", "2"],
    ["a fraction", 1.5],
    ["zero", 0],
    ["a negative", -1],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["null", null],
    ["missing", undefined],
  ])("drops a row whose quantity is %s", (_label, quantity) => {
    expect(normaliseRows([{ code: WHITE, quantity }, row(BLACK, 1)])).toEqual([
      row(BLACK, 1),
    ]);
  });

  it.each([
    ["an unknown finish", `${SLUG}:gold`],
    ["no finish", SLUG],
    ["upper case", `The-Bridge:white`],
    ["a number", 42],
    ["empty", ""],
    ["an injected suffix", `${SLUG}:white<script>`],
  ])("drops a row whose code is %s", (_label, code) => {
    expect(normaliseRows([{ code, quantity: 1 }])).toEqual([]);
  });

  it("keeps at most 66 distinct rows, and duplicates of kept rows still merge", () => {
    const many = Array.from({ length: 70 }, (_, index) =>
      row(`artwork-${index}:white`, 1),
    );
    const rows = normaliseRows([...many, row("artwork-0:white", 2)]);
    expect(rows).toHaveLength(66);
    expect(rows[0]).toEqual(row("artwork-0:white", 3));
    expect(rows[65].code).toBe("artwork-65:white");
  });

  it("reads a non-array, and non-object entries, as nothing", () => {
    expect(normaliseRows(null)).toEqual([]);
    expect(normaliseRows({ code: WHITE, quantity: 1 })).toEqual([]);
    expect(normaliseRows([null, 1, "x", [WHITE, 1]])).toEqual([]);
  });
});

describe("the stored text — v1 envelope, legacy array, corrupt", () => {
  it("nothing stored is an empty bag", () => {
    expect(parseStoredBag(null)).toEqual({
      status: "ok",
      rows: [],
      legacy: false,
    });
  });

  it("reads the v1 envelope and normalises it", () => {
    expect(
      parseStoredBag(
        JSON.stringify({
          v: 1,
          items: [
            { code: WHITE, quantity: 1 },
            { code: WHITE, quantity: 2 },
            { code: "nope", quantity: 1 },
          ],
        }),
      ),
    ).toEqual({ status: "ok", rows: [row(WHITE, 3)], legacy: false });
  });

  it("reads the prototype's legacy array: slug and frame become the code, its title, orientation and image are discarded", () => {
    const legacy = JSON.stringify([
      {
        slug: SLUG,
        title: "Injected <b>title</b>",
        orientation: "Portrait",
        frame: "antique-gold",
        quantity: 2,
        image: "https://example.invalid/x.webp",
      },
      { slug: SLUG, frame: "gold", quantity: 1 },
      { slug: OTHER, frame: "white", quantity: 0 },
      "junk",
    ]);
    expect(parseStoredBag(legacy)).toEqual({
      status: "ok",
      rows: [row(GOLD, 2)],
      legacy: true,
    });
  });

  it.each([
    ["not JSON", "{oops"],
    ["another version", JSON.stringify({ v: 2, items: [] })],
    ["no items", JSON.stringify({ v: 1 })],
    ["a string", JSON.stringify("bag")],
    ["a number", "7"],
    ["null", "null"],
  ])("treats %s as corrupt", (_label, text) => {
    expect(parseStoredBag(text)).toEqual({ status: "corrupt" });
  });

  it("serialises codes and quantities only, and reads back what it wrote", () => {
    const text = serialiseBag([
      { code: WHITE, quantity: 2, title: "x", price: 1 } as BagRow,
    ]);
    expect(JSON.parse(text)).toEqual({
      v: 1,
      items: [{ code: WHITE, quantity: 2 }],
    });
    expect(parseStoredBag(text)).toEqual({
      status: "ok",
      rows: [row(WHITE, 2)],
      legacy: false,
    });
  });
});

describe("row actions — add, quantity, finish change, remove", () => {
  it("add appends a new row and grows an existing one", () => {
    expect(addRow([], WHITE)).toEqual({ rows: [row(WHITE, 1)], capped: false });
    expect(addRow([row(WHITE, 1)], WHITE)).toEqual({
      rows: [row(WHITE, 2)],
      capped: false,
    });
    expect(addRow([row(WHITE, 1)], BLACK, 3)).toEqual({
      rows: [row(WHITE, 1), row(BLACK, 3)],
      capped: false,
    });
  });

  it("add caps at 99 and says so; at 99 nothing changes (the prototype's 'already has 99')", () => {
    expect(addRow([row(WHITE, 98)], WHITE, 5)).toEqual({
      rows: [row(WHITE, 99)],
      capped: true,
    });
    expect(addRow([row(WHITE, 99)], WHITE)).toEqual({
      rows: [row(WHITE, 99)],
      capped: true,
    });
  });

  it("add refuses an invalid code or quantity without a change", () => {
    const rows = [row(WHITE, 1)];
    for (const [code, quantity] of [
      ["nope", 1],
      [WHITE, 0],
      [WHITE, 1.5],
      [WHITE, 100],
      [WHITE, -2],
      [WHITE, Number.NaN],
    ] as const)
      expect(addRow(rows, code, quantity)).toEqual({ rows, capped: false });
  });

  it("add to a full bag of 66 rows changes nothing and reports capped", () => {
    const full = Array.from({ length: 66 }, (_, index) =>
      row(`artwork-${index}:white`, 1),
    );
    expect(addRow(full, WHITE)).toEqual({ rows: full, capped: true });
  });

  it("setRowQuantity accepts only an integer 1–99 for a code in the bag", () => {
    const rows = [row(WHITE, 2), row(BLACK, 1)];
    expect(setRowQuantity(rows, WHITE, 7)).toEqual([
      row(WHITE, 7),
      row(BLACK, 1),
    ]);
    for (const quantity of [0, -1, 1.5, 100, 1e9, Number.NaN])
      expect(setRowQuantity(rows, WHITE, quantity)).toEqual(rows);
    expect(setRowQuantity(rows, GOLD, 5)).toEqual(rows);
  });

  it("quantityFromInput is the cart field's coercion (prototype/shared/bag.js:17)", () => {
    expect(
      ["", "0", "-5", "2.7", "1e9", "abc", "1e999", 3, 0].map(
        quantityFromInput,
      ),
    ).toEqual([1, 1, 1, 2, 99, 1, 99, 3, 1]);
  });

  it("a finish change moves the row to the other finish, keeping its place", () => {
    expect(
      changeRowFinish([row(OTHER_WHITE, 1), row(WHITE, 2)], WHITE, "black"),
    ).toEqual([row(OTHER_WHITE, 1), row(BLACK, 2)]);
  });

  it("a finish change into a finish already in the bag merges, capped at 99, at the earlier row (review-commerce.cjs:16–24)", () => {
    // White 98 and black 2; switching black to white gives one row of 99 in white's place.
    expect(
      changeRowFinish([row(WHITE, 98), row(BLACK, 2)], BLACK, "white"),
    ).toEqual([row(WHITE, 99)]);
    // The later row's finish change merges into the earlier row's position.
    expect(
      changeRowFinish(
        [row(GOLD, 1), row(OTHER_WHITE, 1), row(WHITE, 3)],
        GOLD,
        "white",
      ),
    ).toEqual([row(WHITE, 4), row(OTHER_WHITE, 1)]);
  });

  it("a finish change to the same finish, an invalid finish or a code not in the bag changes nothing", () => {
    const rows = [row(WHITE, 1)];
    expect(changeRowFinish(rows, WHITE, "white")).toEqual(rows);
    expect(changeRowFinish(rows, WHITE, "gold" as "white")).toEqual(rows);
    expect(changeRowFinish(rows, BLACK, "antique-gold")).toEqual(rows);
  });

  it("remove and removeCodes drop rows; the count is total units", () => {
    const rows = [row(WHITE, 2), row(BLACK, 3), row(OTHER_WHITE, 1)];
    expect(removeRow(rows, BLACK)).toEqual([
      row(WHITE, 2),
      row(OTHER_WHITE, 1),
    ]);
    expect(removeRowCodes(rows, [WHITE, OTHER_WHITE])).toEqual([row(BLACK, 3)]);
    expect(bagItemCount(rows)).toBe(6);
    expect(bagItemCount([])).toBe(0);
  });
});

describe("the store — hydration", () => {
  it("starts as the unhydrated empty bag, the same object as the server snapshot, and reads nothing until it hydrates", () => {
    const { store, storage } = setup({ stored: serialiseBag([row(WHITE, 2)]) });
    const get = vi.spyOn(storage as FakeStorage, "getItem");
    expect(store.getSnapshot()).toBe(UNHYDRATED_BAG);
    expect(store.getServerSnapshot()).toBe(UNHYDRATED_BAG);
    expect(store.getSnapshot()).toBe(store.getSnapshot());
    expect(get).not.toHaveBeenCalled();
    expect(UNHYDRATED_BAG).toEqual({
      hydrated: false,
      rows: [],
      revision: 0,
      persistence: "local",
      notice: null,
    });
  });

  it("the first subscriber hydrates it from storage, once, and writes nothing", () => {
    const { store, storage, changes } = setup({
      stored: serialiseBag([row(WHITE, 2)]),
    });
    const listener = vi.fn();
    store.subscribe(listener);
    store.subscribe(vi.fn());
    store.hydrate();
    expect(store.getSnapshot()).toEqual({
      hydrated: true,
      rows: [row(WHITE, 2)],
      revision: 1,
      persistence: "local",
      notice: null,
    });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(changes).toEqual([{ revision: 1 }]);
    expect(storage?.writes).toEqual([]);
    expect(store.getServerSnapshot()).toBe(UNHYDRATED_BAG);
  });

  it("rewrites the prototype's legacy array in the v1 shape", () => {
    const { store, storage } = setup({
      stored: JSON.stringify([
        { slug: SLUG, frame: "black", quantity: 2, title: "T", image: "i" },
      ]),
    });
    store.hydrate();
    expect(store.getSnapshot().rows).toEqual([row(BLACK, 2)]);
    expect(JSON.parse(stored(storage) ?? "")).toEqual({
      v: 1,
      items: [{ code: BLACK, quantity: 2 }],
    });
  });

  it("clears a corrupt value with a notice, and the next change replaces the notice", () => {
    const { store, storage } = setup({ stored: "{not json" });
    store.hydrate();
    expect(store.getSnapshot()).toMatchObject({
      hydrated: true,
      rows: [],
      notice: "corrupt_cleared",
      persistence: "local",
    });
    expect(storage?.removals).toEqual([BAG_STORAGE_KEY]);
    expect(stored(storage)).toBeNull();
    store.add(WHITE);
    expect(store.getSnapshot().notice).toBeNull();
    expect(parseStoredBag(stored(storage))).toEqual({
      status: "ok",
      rows: [row(WHITE, 1)],
      legacy: false,
    });
  });

  it.each([
    ["no storage", { storage: null }],
    ["a storage property that throws", { storageThrows: true }],
    ["a read that throws", { storage: new FakeStorage({ getThrows: true }) }],
  ])(
    "keeps the bag in memory with the disclosure when storage is blocked (%s), and writes nothing",
    (_label, options) => {
      const { store, storage } = setup(options);
      store.hydrate();
      expect(store.getSnapshot()).toMatchObject({
        hydrated: true,
        rows: [],
        persistence: "memory",
        notice: "memory_only",
      });
      expect(store.add(WHITE)).toEqual({
        capped: false,
        persistence: "memory",
      });
      store.add(WHITE);
      expect(store.getSnapshot()).toMatchObject({
        rows: [row(WHITE, 2)],
        persistence: "memory",
        notice: "memory_only",
      });
      expect(storage?.writes ?? []).toEqual([]);
    },
  );

  it("a full storage (a write that throws) switches to memory for the page's life, keeping the rows", () => {
    const storage = new FakeStorage({ setThrows: true });
    const { store } = setup({ storage });
    store.hydrate();
    expect(store.getSnapshot().persistence).toBe("local");
    expect(store.add(WHITE)).toEqual({ capped: false, persistence: "memory" });
    expect(store.getSnapshot()).toMatchObject({
      rows: [row(WHITE, 1)],
      persistence: "memory",
      notice: "memory_only",
    });
    // Storage working again does not bring the page back: its bag stays in memory.
    storage.options.setThrows = false;
    store.add(BLACK);
    expect(storage.writes).toEqual([]);
    expect(store.getSnapshot().persistence).toBe("memory");
  });

  it("clear on a full storage still removes the stored bag, so it does not come back on the next load", () => {
    const storage = new FakeStorage({ setThrows: true });
    const { store } = setup({
      storage,
      stored: JSON.stringify({ v: 1, items: [{ code: WHITE, quantity: 2 }] }),
    });
    store.hydrate();
    store.add(BLACK);
    expect(store.getSnapshot().persistence).toBe("memory");
    store.clear();
    expect(storage.removals).toEqual([BAG_STORAGE_KEY]);
    expect(storage.data.has(BAG_STORAGE_KEY)).toBe(false);
    expect(store.getSnapshot()).toMatchObject({
      rows: [],
      notice: "memory_only",
    });
  });

  it("a corrupt value that cannot be removed leaves the page in memory", () => {
    const { store } = setup({
      storage: new FakeStorage({ removeThrows: true }),
      stored: "]",
    });
    store.hydrate();
    expect(store.getSnapshot()).toMatchObject({
      rows: [],
      persistence: "memory",
      notice: "memory_only",
    });
  });
});

describe("the store — changes, revisions and bagchange", () => {
  it("each change bumps the revision by one, writes the v1 envelope and raises bagchange with that revision", () => {
    const { store, storage, changes } = setup();
    const listener = vi.fn();
    store.subscribe(listener);
    store.add(WHITE);
    store.add(WHITE);
    store.setQuantity(WHITE, 5);
    store.changeFinish(WHITE, "black");
    store.add(OTHER_WHITE);
    store.remove(OTHER_WHITE);
    expect(changes.map((change) => change.revision)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
    expect(store.getSnapshot()).toMatchObject({
      revision: 7,
      rows: [row(BLACK, 5)],
    });
    expect(listener).toHaveBeenCalledTimes(7);
    expect(JSON.parse(stored(storage) ?? "")).toEqual({
      v: 1,
      items: [{ code: BLACK, quantity: 5 }],
    });
  });

  it("a call that changes nothing is not a change: no revision, no write, no event", () => {
    const { store, storage, changes } = setup();
    store.add(WHITE);
    const before = store.getSnapshot();
    const writes = storage?.writes.length;
    store.setQuantity(WHITE, 1);
    store.setQuantity(WHITE, 0);
    store.setQuantity(WHITE, 2.5);
    store.changeFinish(WHITE, "white");
    store.remove(GOLD);
    store.add("not-a-code");
    expect(store.getSnapshot()).toBe(before);
    expect(storage?.writes.length).toBe(writes);
    expect(changes).toHaveLength(2);
  });

  it("an add at the cap reports capped and changes nothing; a finish change into an existing finish merges at 99", () => {
    const { store } = setup({
      stored: serialiseBag([row(WHITE, 99), row(BLACK, 5)]),
    });
    store.hydrate();
    const before = store.getSnapshot();
    expect(store.add(WHITE)).toEqual({ capped: true, persistence: "local" });
    expect(store.getSnapshot()).toBe(before);
    store.changeFinish(BLACK, "white");
    expect(store.getSnapshot().rows).toEqual([row(WHITE, 99)]);
  });

  it("the snapshot is immutable and replaced on each change", () => {
    const { store } = setup();
    store.add(WHITE);
    const first = store.getSnapshot();
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.rows)).toBe(true);
    store.add(BLACK);
    expect(store.getSnapshot()).not.toBe(first);
    expect(first.rows).toEqual([row(WHITE, 1)]);
  });

  it("stores no price, title, image or orientation — codes and quantities only", () => {
    const { store, storage } = setup();
    store.add(WHITE, 2);
    store.add(OTHER_WHITE);
    const text = stored(storage) ?? "";
    expect(Object.keys(JSON.parse(text))).toEqual(["v", "items"]);
    for (const item of JSON.parse(text).items)
      expect(Object.keys(item)).toEqual(["code", "quantity"]);
    expect(text).not.toMatch(/price|paise|title|image|orientation/);
  });

  it("removeCodes removes the validation's codes in one change", () => {
    const { store, changes } = setup();
    store.add(WHITE);
    store.add(BLACK);
    store.add(OTHER_WHITE);
    const before = changes.length;
    store.removeCodes([WHITE, OTHER_WHITE]);
    expect(store.getSnapshot().rows).toEqual([row(BLACK, 1)]);
    expect(changes.length).toBe(before + 1);
  });

  it("clear empties the bag and removes the stored value; clearing an empty bag again is not a change", () => {
    const { store, storage, changes } = setup({
      stored: serialiseBag([row(WHITE, 3)]),
    });
    store.hydrate();
    store.clear();
    expect(store.getSnapshot()).toMatchObject({ rows: [], revision: 2 });
    expect(stored(storage)).toBeNull();
    expect(storage?.removals).toEqual([BAG_STORAGE_KEY]);
    store.clear();
    expect(changes).toHaveLength(2);
    expect(storage?.removals).toEqual([BAG_STORAGE_KEY, BAG_STORAGE_KEY]);
  });

  it("an action before hydration hydrates first, so the stored bag is never overwritten by an empty one", () => {
    const { store, storage } = setup({ stored: serialiseBag([row(WHITE, 2)]) });
    store.add(BLACK);
    expect(store.getSnapshot().rows).toEqual([row(WHITE, 2), row(BLACK, 1)]);
    expect(parseStoredBag(stored(storage))).toMatchObject({
      rows: [row(WHITE, 2), row(BLACK, 1)],
    });
  });
});

describe("the store — another tab's change is re-read, never re-written", () => {
  it("re-reads a storage event for the bag key, raises bagchange and writes nothing", () => {
    const { store, storage, events, changes } = setup();
    store.add(WHITE);
    const writes = storage?.writes.length;
    // Another tab writes the shared storage, then this tab hears it.
    storage?.data.set(
      BAG_STORAGE_KEY,
      serialiseBag([row(WHITE, 4), row(GOLD, 1)]),
    );
    events.dispatchEvent(storageEvent(BAG_STORAGE_KEY, storage));
    expect(store.getSnapshot().rows).toEqual([row(WHITE, 4), row(GOLD, 1)]);
    expect(changes.at(-1)).toEqual({ revision: store.getSnapshot().revision });
    expect(storage?.writes.length).toBe(writes);
  });

  it("two tabs sharing one storage do not feed each other", () => {
    const storage = new FakeStorage();
    const a = setup({ storage });
    const b = setup({ storage });
    a.store.hydrate();
    b.store.hydrate();
    const deliver = (to: EventTarget) =>
      to.dispatchEvent(storageEvent(BAG_STORAGE_KEY, storage));
    a.store.add(WHITE);
    deliver(b.events);
    b.store.add(BLACK);
    deliver(a.events);
    const writesAfter = storage.writes.length;
    // Echoes of the same value change nothing and write nothing.
    deliver(a.events);
    deliver(b.events);
    expect(storage.writes.length).toBe(writesAfter);
    expect(writesAfter).toBe(2);
    expect(a.store.getSnapshot().rows).toEqual([row(WHITE, 1), row(BLACK, 1)]);
    expect(b.store.getSnapshot().rows).toEqual(a.store.getSnapshot().rows);
  });

  it("re-reads a whole-storage clear (key null) as an empty bag", () => {
    const { store, storage, events } = setup();
    store.add(WHITE);
    storage?.data.clear();
    events.dispatchEvent(storageEvent(null, storage));
    expect(store.getSnapshot().rows).toEqual([]);
  });

  it("ignores another key, another storage area, and every event while the page is in memory", () => {
    const { store, storage, events } = setup();
    store.add(WHITE);
    const before = store.getSnapshot();
    storage?.data.set(BAG_STORAGE_KEY, serialiseBag([row(GOLD, 9)]));
    events.dispatchEvent(storageEvent("aalishaan-wishlist-x", storage));
    events.dispatchEvent(storageEvent(BAG_STORAGE_KEY, new FakeStorage()));
    expect(store.getSnapshot()).toBe(before);

    const memory = setup({ storage: new FakeStorage({ setThrows: true }) });
    memory.store.add(WHITE);
    memory.storage?.data.set(BAG_STORAGE_KEY, serialiseBag([row(GOLD, 9)]));
    memory.events.dispatchEvent(storageEvent(BAG_STORAGE_KEY, memory.storage));
    expect(memory.store.getSnapshot().rows).toEqual([row(WHITE, 1)]);
  });

  it("another tab's corrupt value empties this page's bag with the notice, without a write or a removal", () => {
    const { store, storage, events } = setup();
    store.add(WHITE);
    const writes = storage?.writes.length;
    storage?.data.set(BAG_STORAGE_KEY, "{");
    events.dispatchEvent(storageEvent(BAG_STORAGE_KEY, storage));
    expect(store.getSnapshot()).toMatchObject({
      rows: [],
      notice: "corrupt_cleared",
    });
    expect(storage?.writes.length).toBe(writes);
    expect(storage?.removals).toEqual([]);
  });

  it("a page restored from the back-forward cache re-reads; an ordinary pageshow does not", () => {
    const { store, storage, events } = setup();
    store.add(WHITE);
    storage?.data.set(BAG_STORAGE_KEY, serialiseBag([row(BLACK, 2)]));
    events.dispatchEvent(pageShow(false));
    expect(store.getSnapshot().rows).toEqual([row(WHITE, 1)]);
    events.dispatchEvent(pageShow(true));
    expect(store.getSnapshot().rows).toEqual([row(BLACK, 2)]);
  });
});

describe("selections — the finish per artwork (sessionStorage aalishaan-frame-<slug>)", () => {
  it("saves and reads a finish code under the prototype's key", () => {
    const storage = new FakeStorage();
    expect(saveFinishSelection(SLUG, "black", storage)).toBe(true);
    expect(storage.data.get(finishKey(SLUG))).toBe("black");
    expect(finishKey(SLUG)).toBe(`aalishaan-frame-${SLUG}`);
    expect(readFinishSelection(SLUG, storage)).toBe("black");
    expect(readFinishSelection(OTHER, storage)).toBeNull();
  });

  it("ignores an invalid stored value and refuses to save one", () => {
    const storage = new FakeStorage();
    storage.data.set(finishKey(SLUG), "gold");
    expect(readFinishSelection(SLUG, storage)).toBeNull();
    expect(saveFinishSelection(SLUG, "gold" as "white", storage)).toBe(false);
    expect(storage.writes).toEqual([]);
  });

  it("tolerates blocked storage", () => {
    expect(readFinishSelection(SLUG, null)).toBeNull();
    expect(saveFinishSelection(SLUG, "white", null)).toBe(false);
    const blocked = new FakeStorage({ getThrows: true, setThrows: true });
    expect(readFinishSelection(SLUG, blocked)).toBeNull();
    expect(saveFinishSelection(SLUG, "white", blocked)).toBe(false);
  });

  it("clearFinishSelections forgets every remembered finish and nothing else", () => {
    const storage = new FakeStorage();
    storage.data.set(finishKey(SLUG), "white");
    storage.data.set(finishKey(OTHER), "black");
    storage.data.set("aalishaanOrderPreview", "x");
    expect(clearFinishSelections(storage)).toBe(true);
    expect([...storage.data.keys()]).toEqual(["aalishaanOrderPreview"]);
    expect(clearFinishSelections(null)).toBe(false);
  });
});

describe("selections — the delivery PIN (localStorage aalishaanDeliveryCheck)", () => {
  it.each([
    ["110001", true],
    ["400001", true],
    ["999999", true],
    ["012345", false],
    ["11000", false],
    ["1100011", false],
    ["11000a", false],
    [" 110001", false],
    ["", false],
  ])("the PIN rule (locked-facts §6): %j → %s", (pin, valid) => {
    expect(isValidPin(pin)).toBe(valid);
  });

  it("a typed value keeps digits only, at most six", () => {
    expect(sanitisePinInput("4a0 0-0.0 1 9")).toBe("400001");
    expect(sanitisePinInput("abc")).toBe("");
  });

  it("saves the PIN only, as { v: 1, pin }, and announces it with its source", () => {
    const storage = new FakeStorage();
    const events = new EventTarget();
    const heard: DeliveryCheckDetail[] = [];
    events.addEventListener(DELIVERY_CHECK_EVENT, (event) =>
      heard.push((event as CustomEvent<DeliveryCheckDetail>).detail),
    );
    expect(saveDeliveryPin("400001", { storage, events, source: "a" })).toBe(
      true,
    );
    expect(JSON.parse(storage.data.get(DELIVERY_PIN_KEY) ?? "")).toEqual({
      v: 1,
      pin: "400001",
    });
    expect(readDeliveryPin(storage)).toBe("400001");
    expect(heard).toEqual([{ pin: "400001", source: "a" }]);
  });

  it("never saves or announces an invalid PIN", () => {
    const storage = new FakeStorage();
    const events = new EventTarget();
    const heard = vi.fn();
    events.addEventListener(DELIVERY_CHECK_EVENT, heard);
    for (const pin of ["012345", "12345", "abcdef", "1234567"])
      expect(saveDeliveryPin(pin, { storage, events })).toBe(false);
    expect(storage.writes).toEqual([]);
    expect(heard).not.toHaveBeenCalled();
  });

  it("reads the prototype's legacy check for its PIN only and rewrites it without the estimate", () => {
    const storage = new FakeStorage();
    storage.data.set(
      DELIVERY_PIN_KEY,
      JSON.stringify({
        status: "serviceable",
        pincode: "560001",
        zone: "metro",
        estimate: { from: "2026-01-01", to: "2026-01-05" },
      }),
    );
    expect(readDeliveryPin(storage)).toBe("560001");
    expect(JSON.parse(storage.data.get(DELIVERY_PIN_KEY) ?? "")).toEqual({
      v: 1,
      pin: "560001",
    });
  });

  it.each([
    ["not JSON", "{"],
    ["an invalid PIN", JSON.stringify({ v: 1, pin: "012345" })],
    ["another version", JSON.stringify({ v: 2, pin: "110001" })],
    ["an invalid legacy PIN", JSON.stringify({ pincode: "000000" })],
    ["an array", "[]"],
  ])("reads %s as no PIN", (_label, text) => {
    expect(parseStoredPin(text).pin).toBeNull();
  });

  it("clear forgets the PIN and announces null; blocked storage reads nothing and saves nothing", () => {
    const storage = new FakeStorage();
    const events = new EventTarget();
    const heard: DeliveryCheckDetail[] = [];
    events.addEventListener(DELIVERY_CHECK_EVENT, (event) =>
      heard.push((event as CustomEvent<DeliveryCheckDetail>).detail),
    );
    saveDeliveryPin("110001", { storage, events });
    expect(clearDeliveryPin({ storage, events, source: "b" })).toBe(true);
    expect(storage.data.has(DELIVERY_PIN_KEY)).toBe(false);
    expect(heard.at(-1)).toEqual({ pin: null, source: "b" });

    const blocked = new FakeStorage({ getThrows: true, setThrows: true });
    expect(readDeliveryPin(blocked)).toBeNull();
    expect(readDeliveryPin(null)).toBeNull();
    // Still announced, so the page's forms stay consistent.
    expect(saveDeliveryPin("110001", { storage: blocked, events })).toBe(false);
    expect(heard.at(-1)).toEqual({ pin: "110001", source: null });
  });

  it("subscribers hear this page's changes and another tab's (re-read, not re-written), and stop when released", () => {
    const storage = new FakeStorage();
    const events = new EventTarget();
    const heard: DeliveryCheckDetail[] = [];
    const release = subscribeToDeliveryPin((detail) => heard.push(detail), {
      storage,
      events,
    });
    saveDeliveryPin("110001", { storage, events, source: "form-1" });
    storage.data.set(DELIVERY_PIN_KEY, JSON.stringify({ v: 1, pin: "400001" }));
    const writes = storage.writes.length;
    events.dispatchEvent(storageEvent(DELIVERY_PIN_KEY, storage));
    events.dispatchEvent(storageEvent("other", storage));
    expect(heard).toEqual([
      { pin: "110001", source: "form-1" },
      { pin: "400001", source: null },
    ]);
    expect(storage.writes.length).toBe(writes);
    release();
    saveDeliveryPin("560001", { storage, events });
    expect(heard).toHaveLength(2);
  });
});

/** A validator whose answers the test releases one by one, recording each request's rows and signal. */
function deferredValidator() {
  const calls: Array<{
    rows: BagRow[];
    signal: AbortSignal;
    resolve: (outcome: BagValidationOutcome) => void;
  }> = [];
  const validate: BagValidator = (rows, { signal }) =>
    new Promise((resolve) => {
      if (!signal) throw new Error("validation without a signal");
      calls.push({
        rows: rows.map((entry) => ({ ...entry })),
        signal,
        resolve,
      });
    });
  return { validate, calls };
}

/** Lets the controller's promise chain settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** The server's answer for some rows (every code priced at 1,900,000 paise), with `removed` codes left out. */
function okAnswer(
  rows: readonly BagRow[],
  removed: readonly string[] = [],
): BagValidationOutcome {
  const kept = rows.filter((entry) => !removed.includes(entry.code));
  const items = kept.map((entry) => {
    const at = entry.code.lastIndexOf(":");
    return {
      variant_code: entry.code,
      quantity: entry.quantity,
      slug: entry.code.slice(0, at),
      title: "An artwork",
      orientation: "Portrait" as const,
      finish: entry.code.slice(at + 1) as "white",
      finish_name: "White",
      available: true,
      unit_price_paise: BigInt(1900000),
      line_total_paise: BigInt(1900000 * entry.quantity),
    };
  });
  const result: BagValidationResult = {
    status: "ok",
    items,
    removed: removed.map((variant_code) => ({
      variant_code,
      reason: "not_found" as const,
    })),
    subtotal_paise: items.reduce(
      (total, entry) => total + entry.line_total_paise,
      BigInt(0),
    ),
    item_count: kept.reduce((total, entry) => total + entry.quantity, 0),
  };
  return { status: "ok", result };
}

function validationSetup(stored?: BagRow[]) {
  const bag = setup(
    stored === undefined ? {} : { stored: serialiseBag(stored) },
  );
  const deferred = deferredValidator();
  const controller = createBagValidationController(
    bag.store,
    deferred.validate,
  );
  return { ...bag, ...deferred, controller };
}

describe("the shared validation — one request per revision, current revision only", () => {
  it("is idle before anything subscribes; an empty bag is ok with a zero subtotal and no request", async () => {
    const { controller, calls } = validationSetup();
    expect(controller.getState()).toBe(IDLE_VALIDATION);
    expect(controller.getServerState()).toBe(IDLE_VALIDATION);
    controller.subscribe(vi.fn());
    controller.demand();
    await settle();
    expect(controller.getState()).toMatchObject({
      status: "ok",
      result: EMPTY_BAG_RESULT,
    });
    expect(EMPTY_BAG_RESULT.subtotal_paise).toBe(BigInt(0));
    expect(calls).toHaveLength(0);
  });

  it("asks nothing until something demands it, then once however many ask", async () => {
    const { controller, calls } = validationSetup([row(WHITE, 2)]);
    controller.subscribe(vi.fn());
    await settle();
    expect(controller.getState().status).toBe("idle");
    expect(calls).toHaveLength(0);
    const releaseDrawer = controller.demand();
    controller.demand();
    await settle();
    expect(calls).toHaveLength(1);
    expect(calls[0].rows).toEqual([row(WHITE, 2)]);
    expect(controller.getState()).toMatchObject({
      status: "pending",
      result: null,
    });
    releaseDrawer();
    releaseDrawer();
    await settle();
    expect(calls).toHaveLength(1);
  });

  it("an ok answer serves every asker present at once; a fresh ask after they had gone checks again", async () => {
    const { controller, calls, store } = validationSetup([row(WHITE, 2)]);
    controller.subscribe(vi.fn());
    const release = controller.demand();
    await settle();
    calls[0].resolve(okAnswer(calls[0].rows));
    await settle();
    const state = controller.getState();
    expect(state).toMatchObject({
      status: "ok",
      revision: store.getSnapshot().revision,
    });
    expect(state.result?.subtotal_paise).toBe(BigInt(3800000));
    // A second asker at the same moment (the drawer opened on the cart page) shares the answer.
    const second = controller.demand();
    await settle();
    expect(calls).toHaveLength(1);
    expect(controller.getState()).toBe(state);
    second();
    release();
    // Every asker gone, then a fresh ask: no old answer is shown as current — pending, then a new request.
    controller.demand();
    await settle();
    expect(calls).toHaveLength(2);
    expect(controller.getState()).toMatchObject({
      status: "pending",
      result: null,
    });
    calls[1].resolve(okAnswer(calls[1].rows));
    await settle();
    expect(controller.getState().status).toBe("ok");
  });

  it("a failure does not stick: a fresh ask after every asker had gone (the drawer reopened, /cart visited) checks again", async () => {
    const { controller, calls } = validationSetup([row(WHITE, 1)]);
    controller.subscribe(vi.fn());
    const release = controller.demand();
    await settle();
    calls[0].resolve({ status: "failed", reason: "unavailable" });
    await settle();
    expect(controller.getState().status).toBe("failed");
    release();
    expect(calls).toHaveLength(1);
    controller.demand();
    await settle();
    expect(calls).toHaveLength(2);
    expect(controller.getState().status).toBe("pending");
    calls[1].resolve(okAnswer(calls[1].rows));
    await settle();
    expect(controller.getState().status).toBe("ok");
  });

  it("a change while pending aborts the request; its late answer is discarded and never overwrites the newer quantity", async () => {
    const { controller, calls, store } = validationSetup([row(WHITE, 2)]);
    controller.subscribe(vi.fn());
    controller.demand();
    await settle();
    store.setQuantity(WHITE, 5);
    await settle();
    expect(calls[0].signal.aborted).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[1].rows).toEqual([row(WHITE, 5)]);
    calls[0].resolve(okAnswer(calls[0].rows));
    await settle();
    expect(controller.getState()).toMatchObject({
      status: "pending",
      result: null,
    });
    expect(store.getSnapshot().rows).toEqual([row(WHITE, 5)]);
    calls[1].resolve(okAnswer(calls[1].rows));
    await settle();
    expect(controller.getState().result?.items[0].quantity).toBe(5);
  });

  it("a late answer for a superseded bag cannot resurrect a removed row or undo a finish change", async () => {
    const { controller, calls, store } = validationSetup([
      row(WHITE, 1),
      row(OTHER_WHITE, 1),
    ]);
    controller.subscribe(vi.fn());
    controller.demand();
    await settle();
    store.remove(OTHER_WHITE);
    store.changeFinish(WHITE, "black");
    await settle();
    // The stale answer even claims a code left the projection: ignored entirely.
    calls[0].resolve(okAnswer(calls[0].rows, [WHITE]));
    await settle();
    expect(store.getSnapshot().rows).toEqual([row(BLACK, 1)]);
    expect(controller.getState()).toMatchObject({
      status: "pending",
      removedCount: 0,
    });
  });

  it("clearing the bag aborts the request in flight and is ok-empty at once", async () => {
    const { controller, calls, store } = validationSetup([row(WHITE, 1)]);
    controller.subscribe(vi.fn());
    controller.demand();
    await settle();
    store.clear();
    expect(calls[0].signal.aborted).toBe(true);
    expect(controller.getState()).toMatchObject({
      status: "ok",
      result: EMPTY_BAG_RESULT,
    });
    calls[0].resolve(okAnswer(calls[0].rows));
    await settle();
    expect(controller.getState().result).toBe(EMPTY_BAG_RESULT);
    expect(store.getSnapshot().rows).toEqual([]);
  });

  it("a failure keeps the rows and shows no total; retry asks again for the same revision", async () => {
    const { controller, calls, store } = validationSetup([row(WHITE, 3)]);
    controller.subscribe(vi.fn());
    controller.demand();
    await settle();
    calls[0].resolve({ status: "failed", reason: "unavailable" });
    await settle();
    expect(controller.getState()).toMatchObject({
      status: "failed",
      result: null,
    });
    expect(store.getSnapshot().rows).toEqual([row(WHITE, 3)]);
    // Asking again without a retry does not loop.
    controller.demand();
    await settle();
    expect(calls).toHaveLength(1);
    controller.retry();
    await settle();
    expect(calls).toHaveLength(2);
    expect(controller.getState().status).toBe("pending");
    calls[1].resolve(okAnswer(calls[1].rows));
    await settle();
    expect(controller.getState().status).toBe("ok");
  });

  it.each([
    ["a validator that rejects", "reject"],
    ["an 'aborted' answer nobody asked for", "aborted"],
  ])("%s is a failure, not a retry loop", async (_label, kind) => {
    const { store } = setup({ stored: serialiseBag([row(WHITE, 1)]) });
    const validate = vi.fn<BagValidator>(async () => {
      if (kind === "reject") throw new Error("boom");
      return { status: "aborted" };
    });
    const controller = createBagValidationController(store, validate);
    controller.subscribe(vi.fn());
    controller.demand();
    await settle();
    await settle();
    expect(controller.getState().status).toBe("failed");
    expect(validate).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().rows).toEqual([row(WHITE, 1)]);
  });

  it("an answer that removes codes removes those rows once, counts them, and stands for the new revision without a second request", async () => {
    const { controller, calls, store } = validationSetup([
      row(WHITE, 2),
      row(OTHER_WHITE, 1),
      row(GOLD, 1),
    ]);
    controller.subscribe(vi.fn());
    controller.demand();
    await settle();
    const before = store.getSnapshot().revision;
    calls[0].resolve(okAnswer(calls[0].rows, [OTHER_WHITE, GOLD]));
    await settle();
    expect(store.getSnapshot().rows).toEqual([row(WHITE, 2)]);
    expect(store.getSnapshot().revision).toBe(before + 1);
    expect(controller.getState()).toMatchObject({
      status: "ok",
      revision: before + 1,
      removedCount: 2,
    });
    expect(controller.getState().result?.removed).toEqual([]);
    expect(
      controller.getState().result?.items.map((entry) => entry.variant_code),
    ).toEqual([WHITE]);
    expect(calls).toHaveLength(1);
    controller.dismissRemoved();
    expect(controller.getState().removedCount).toBe(0);
  });

  it("does not validate an unhydrated bag, and the last listener leaving aborts the request", async () => {
    const { controller, calls } = validationSetup([row(WHITE, 1)]);
    controller.demand();
    await settle();
    expect(calls).toHaveLength(0);
    const unsubscribe = controller.subscribe(vi.fn());
    await settle();
    expect(calls).toHaveLength(1);
    unsubscribe();
    expect(calls[0].signal.aborted).toBe(true);
  });

  it("another tab's change is a new revision: the old request is aborted and the new rows asked about", async () => {
    const { controller, calls, store, storage, events } = validationSetup([
      row(WHITE, 1),
    ]);
    controller.subscribe(vi.fn());
    controller.demand();
    await settle();
    storage?.data.set(BAG_STORAGE_KEY, serialiseBag([row(WHITE, 4)]));
    events.dispatchEvent(storageEvent(BAG_STORAGE_KEY, storage));
    await settle();
    expect(calls[0].signal.aborted).toBe(true);
    expect(calls[1].rows).toEqual([row(WHITE, 4)]);
    expect(store.getSnapshot().rows).toEqual([row(WHITE, 4)]);
  });
});
