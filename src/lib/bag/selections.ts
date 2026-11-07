import { finishCodeSchema, type FinishCode } from "@/lib/schemas/catalogue";

/**
 * The two selections kept beside the bag — S1.5 (docs/sprint-prompts/S1.5-artwork-bag-cart.md §H.2 "Selections"),
 * under the prototype's own keys (cleared by the Cookies control). Both are conveniences, never proofs:
 *
 * - The finish chosen on an artwork page: `sessionStorage["aalishaan-frame-<slug>"]` = a finish code
 *   (prototype/product/r3.js:12–13, 85). Anything else stored there is ignored.
 * - The delivery PIN: `localStorage["aalishaanDeliveryCheck"]` = `{ "v": 1, "pin": "<6 digits>" }` — the PIN only,
 *   never a result, an estimate or a date. The rule is locked-facts §6, `/^[1-9][0-9]{5}$/`
 *   (prototype/shared/delivery.js:21). The prototype stored its whole simulated check there
 *   (`{ status, pincode, zone, estimate, … }`); only its PIN is read, and the value is rewritten as `{ v, pin }`.
 *   The PIN is never sent to the server, logged or reported, and saving it is not a serviceability or quote check.
 *   A change raises `deliverycheck` (`CustomEvent`, `detail: { pin, source }` — `pin` null when cleared) so the
 *   other PIN forms of the page follow; another tab's change arrives as `storage`.
 *
 * Every read and write tolerates blocked storage: a read gives nothing, a write reports false.
 */

export const FINISH_KEY_PREFIX = "aalishaan-frame-";
export const DELIVERY_PIN_KEY = "aalishaanDeliveryCheck";
export const DELIVERY_PIN_VERSION = 1;
/** locked-facts §6: six digits, not starting with 0. */
export const PIN_PATTERN = /^[1-9][0-9]{5}$/;
export const DELIVERY_CHECK_EVENT = "deliverycheck";

export type DeliveryCheckDetail = {
  pin: string | null;
  /** The form that made the change, so it does not apply its own change twice. */
  source: string | null;
};

type StorageReader = () => Storage | null;

function safeStorage(read: StorageReader): Storage | null {
  try {
    return read();
  } catch {
    return null;
  }
}

/** `window.sessionStorage`, or null where there is no window or the property itself throws. */
export function browserSessionStorage(): Storage | null {
  return safeStorage(() =>
    typeof window === "undefined" ? null : window.sessionStorage,
  );
}

/** `window.localStorage`, or null where there is no window or the property itself throws. */
export function browserLocalStorage(): Storage | null {
  return safeStorage(() =>
    typeof window === "undefined" ? null : window.localStorage,
  );
}

function browserEvents(): EventTarget | null {
  return typeof window === "undefined" ? null : window;
}

export function finishKey(slug: string): string {
  return `${FINISH_KEY_PREFIX}${slug}`;
}

/** The finish last chosen for an artwork in this tab, or null (nothing chosen, an invalid value, no storage). */
export function readFinishSelection(
  slug: string,
  storage: Storage | null = browserSessionStorage(),
): FinishCode | null {
  if (storage === null) return null;
  try {
    const parsed = finishCodeSchema.safeParse(storage.getItem(finishKey(slug)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Remembers the chosen finish for this tab; false when it could not be kept. */
export function saveFinishSelection(
  slug: string,
  finish: FinishCode,
  storage: Storage | null = browserSessionStorage(),
): boolean {
  if (storage === null || !finishCodeSchema.safeParse(finish).success)
    return false;
  try {
    storage.setItem(finishKey(slug), finish);
    return true;
  } catch {
    return false;
  }
}

/** Forgets every remembered finish (the Cookies control); false when storage refused. */
export function clearFinishSelections(
  storage: Storage | null = browserSessionStorage(),
): boolean {
  if (storage === null) return false;
  try {
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key !== null && key.startsWith(FINISH_KEY_PREFIX)) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function isValidPin(value: string): boolean {
  return PIN_PATTERN.test(value);
}

/** A PIN field's typed value: digits only, at most six (prototype/shared/delivery.js:48). */
export function sanitisePinInput(value: string): string {
  return value.replace(/\D/g, "").slice(0, 6);
}

/** The stored PIN, or null. Reads the v1 value and the prototype's legacy check (its PIN only). */
export function parseStoredPin(text: string | null): {
  pin: string | null;
  legacy: boolean;
} {
  if (text === null) return { pin: null, legacy: false };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { pin: null, legacy: false };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    return { pin: null, legacy: false };
  const record = parsed as Record<string, unknown>;
  if (record.v === DELIVERY_PIN_VERSION)
    return {
      pin:
        typeof record.pin === "string" && isValidPin(record.pin)
          ? record.pin
          : null,
      legacy: false,
    };
  // prototype/shared/delivery.js:32 — a whole check; only a valid `pincode` is kept.
  if (
    record.v === undefined &&
    typeof record.pincode === "string" &&
    isValidPin(record.pincode)
  )
    return { pin: record.pincode, legacy: true };
  return { pin: null, legacy: false };
}

export function serialisePin(pin: string): string {
  return JSON.stringify({ v: DELIVERY_PIN_VERSION, pin });
}

/** The saved PIN, or null. A legacy prototype value is rewritten as `{ v, pin }` (its estimate discarded). */
export function readDeliveryPin(
  storage: Storage | null = browserLocalStorage(),
): string | null {
  if (storage === null) return null;
  try {
    const { pin, legacy } = parseStoredPin(storage.getItem(DELIVERY_PIN_KEY));
    if (legacy && pin !== null) {
      try {
        storage.setItem(DELIVERY_PIN_KEY, serialisePin(pin));
      } catch {
        // Kept as read; the next save writes the current shape.
      }
    }
    return pin;
  } catch {
    return null;
  }
}

function announce(
  events: EventTarget | null,
  pin: string | null,
  source: string | null,
): void {
  const detail: DeliveryCheckDetail = { pin, source };
  events?.dispatchEvent(new CustomEvent(DELIVERY_CHECK_EVENT, { detail }));
}

export type PinStoreOptions = {
  storage?: Storage | null;
  events?: EventTarget | null;
  /** The form making the change (see DeliveryCheckDetail). */
  source?: string | null;
};

/**
 * Saves a valid PIN and tells the page's other forms; an invalid PIN is never saved (false). The PIN still reaches
 * the other forms when storage refuses, so the page stays consistent.
 */
export function saveDeliveryPin(
  pin: string,
  {
    storage = browserLocalStorage(),
    events = browserEvents(),
    source = null,
  }: PinStoreOptions = {},
): boolean {
  if (!isValidPin(pin)) return false;
  let saved = false;
  if (storage !== null) {
    try {
      storage.setItem(DELIVERY_PIN_KEY, serialisePin(pin));
      saved = true;
    } catch {
      saved = false;
    }
  }
  announce(events, pin, source);
  return saved;
}

/** Forgets the saved PIN and tells the page's other forms; false when storage refused. */
export function clearDeliveryPin({
  storage = browserLocalStorage(),
  events = browserEvents(),
  source = null,
}: PinStoreOptions = {}): boolean {
  let cleared = false;
  if (storage !== null) {
    try {
      storage.removeItem(DELIVERY_PIN_KEY);
      cleared = true;
    } catch {
      cleared = false;
    }
  }
  announce(events, null, source);
  return cleared;
}

/**
 * Calls `listener` with the PIN and its source when a form of this page changes it (`deliverycheck`), or another
 * tab does (`storage` for this key or a whole-storage clear — re-read, never re-written; `source` null).
 */
export function subscribeToDeliveryPin(
  listener: (detail: DeliveryCheckDetail) => void,
  {
    storage = browserLocalStorage(),
    events = browserEvents(),
  }: { storage?: Storage | null; events?: EventTarget | null } = {},
): () => void {
  if (events === null) return () => {};
  const onCheck = (event: Event) => {
    const detail = (event as CustomEvent<DeliveryCheckDetail>).detail;
    if (detail && (detail.pin === null || isValidPin(detail.pin)))
      listener({ pin: detail.pin, source: detail.source ?? null });
  };
  const onStorage = (event: Event) => {
    const { key, storageArea } = event as StorageEvent;
    if (key !== null && key !== DELIVERY_PIN_KEY) return;
    if (storageArea && storageArea !== storage) return;
    let text: string | null = null;
    try {
      text = storage === null ? null : storage.getItem(DELIVERY_PIN_KEY);
    } catch {
      return;
    }
    listener({ pin: parseStoredPin(text).pin, source: null });
  };
  events.addEventListener(DELIVERY_CHECK_EVENT, onCheck);
  events.addEventListener("storage", onStorage);
  return () => {
    events.removeEventListener(DELIVERY_CHECK_EVENT, onCheck);
    events.removeEventListener("storage", onStorage);
  };
}
