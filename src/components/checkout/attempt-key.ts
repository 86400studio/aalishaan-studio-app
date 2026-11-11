import {
  ATTEMPT_KEY_PATTERN,
  type CheckoutLaunch,
} from "@/lib/schemas/checkout";

import { ATTEMPT_STORAGE_KEY } from "./storage-key";

/**
 * The checkout's attempt key and the order that holds the page — S1.6 (docs/sprint-prompts/
 * S1.6-checkout-pending-order.md §H.3 "Attempt ownership"). Framework-free, so its rules are unit-tested; the React
 * side is ./checkout-form.tsx.
 *
 * - **The submit slot** lives in memory only: `{ key, canonical }`. A pay press asks `keyFor(canonical)` — the same
 *   canonical payload (src/lib/schemas/checkout.ts `canonicalCheckoutPayload`) reuses the slot's key, so a double
 *   press or a retry is the same submission; a changed bag or changed details mint a new key (32 bytes from the
 *   browser's CSPRNG as unpadded base64url — `ATTEMPT_KEY_PATTERN`) and replace the slot.
 * - **The stored copy** is the key alone, in `sessionStorage["aalishaanCheckoutAttempt"]`, so a reload can ask
 *   where the attempt stands. No name, address, amount or order number is ever stored. Storage that is blocked or
 *   full loses only that reload-resume.
 * - **A key read back from storage is resume-only** (`storedKey()`): it is returned to the caller and never placed
 *   in the submit slot, so nothing here can send it with a submission — a key planted in storage can therefore
 *   never capture a later order. A malformed stored value is ignored.
 * - **The hold** is the launch the server answered for an order, kept in memory for the page's life: while it
 *   stands, the page offers only "continue to payment" for that order, never a new one. It is released by
 *   `forget()` alone — the callers release it when the server says the attempt is over or when `expires_at` has
 *   passed (`launchExpired`), never because a browser callback fired.
 */

export { ATTEMPT_STORAGE_KEY };

/** The bytes of one attempt key. */
export const ATTEMPT_KEY_BYTES = 32;

export type AttemptSlot = { readonly key: string; readonly canonical: string };

/** What the payment window may be prefilled with: only what was typed in the page that is open. */
export type CheckoutPrefill = {
  readonly name: string;
  readonly email: string;
  readonly contact: string;
  readonly method: string;
};

export type CheckoutHold = {
  readonly launch: CheckoutLaunch;
  /** Null after a reload: nothing typed in this page, so nothing is prefilled. */
  readonly prefill: CheckoutPrefill | null;
  /** True once the payment window reported a completed payment to the browser (unverified — NS-05). */
  readonly reported: boolean;
};

export type AttemptEnvironment = {
  /** `window.sessionStorage`; null or a throw means storage is blocked. */
  storage: () => Storage | null;
  /** Fills the array with cryptographically strong random bytes (`crypto.getRandomValues`). */
  fillRandom: (bytes: Uint8Array) => void;
};

export type AttemptKeys = {
  /** The key to submit `canonical` with: the slot's for the same payload, otherwise a new one (slot and storage). */
  keyFor: (canonical: string) => string;
  /** The submit slot, or null. */
  slot: () => AttemptSlot | null;
  /** A well-formed key in storage, for resume only — or null. Never touches the slot. */
  storedKey: () => string | null;
  /** Removes the stored key if it still is `key` (a resume said the attempt is over). */
  dropStored: (key: string) => void;
  /** Forgets the slot, the hold and the stored key: the next pay press is a new order. */
  forget: () => void;
  /** Records the launch that now holds the page. */
  hold: (launch: CheckoutLaunch, prefill: CheckoutPrefill | null) => void;
  /** Marks the hold as reported complete by the browser (unverified). */
  markReported: () => void;
  /** The hold, or null. Expiry is the caller's check (`launchExpired`). */
  held: () => CheckoutHold | null;
};

/** Unpadded base64url of the bytes (RFC 4648 §5). */
export function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** A new attempt key: 32 random bytes as 43 base64url characters. */
export function mintAttemptKey(
  fillRandom: AttemptEnvironment["fillRandom"],
): string {
  const bytes = new Uint8Array(ATTEMPT_KEY_BYTES);
  fillRandom(bytes);
  const key = base64Url(bytes);
  if (!ATTEMPT_KEY_PATTERN.test(key))
    throw new Error("the attempt key is malformed");
  return key;
}

/** True when the launch's payment window has passed at `nowMs` — or its deadline cannot be read. */
export function launchExpired(launch: CheckoutLaunch, nowMs: number): boolean {
  const deadline = Date.parse(launch.expires_at);
  return !Number.isFinite(deadline) || deadline <= nowMs;
}

/** Milliseconds from `nowMs` to the launch's deadline; 0 when it has passed or cannot be read. */
export function millisecondsToExpiry(
  launch: CheckoutLaunch,
  nowMs: number,
): number {
  const deadline = Date.parse(launch.expires_at);
  return Number.isFinite(deadline) ? Math.max(0, deadline - nowMs) : 0;
}

export function createAttemptKeys(
  environment: AttemptEnvironment,
): AttemptKeys {
  let slot: AttemptSlot | null = null;
  let hold: CheckoutHold | null = null;

  const storage = (): Storage | null => {
    try {
      return environment.storage();
    } catch {
      return null;
    }
  };
  const readStored = (): string | null => {
    try {
      const value = storage()?.getItem(ATTEMPT_STORAGE_KEY) ?? null;
      return value !== null && ATTEMPT_KEY_PATTERN.test(value) ? value : null;
    } catch {
      return null;
    }
  };
  const writeStored = (key: string): void => {
    try {
      storage()?.setItem(ATTEMPT_STORAGE_KEY, key);
    } catch {
      // Blocked or full storage loses only the reload-resume.
    }
  };
  const removeStored = (): void => {
    try {
      storage()?.removeItem(ATTEMPT_STORAGE_KEY);
    } catch {
      // Nothing to remove from a storage that cannot be reached.
    }
  };

  return {
    keyFor(canonical) {
      if (slot !== null && slot.canonical === canonical) return slot.key;
      const key = mintAttemptKey(environment.fillRandom);
      slot = { key, canonical };
      writeStored(key);
      return key;
    },
    slot: () => slot,
    storedKey: readStored,
    dropStored(key) {
      try {
        const store = storage();
        if (store?.getItem(ATTEMPT_STORAGE_KEY) === key)
          store.removeItem(ATTEMPT_STORAGE_KEY);
      } catch {
        // Nothing to remove from a storage that cannot be reached.
      }
    },
    forget() {
      slot = null;
      hold = null;
      removeStored();
    },
    hold(launch, prefill) {
      hold = { launch, prefill, reported: false };
    },
    markReported() {
      if (hold !== null) hold = { ...hold, reported: true };
    },
    held: () => hold,
  };
}

/** The page's one instance. */
export const attemptKeys: AttemptKeys = createAttemptKeys({
  storage: () => (typeof window === "undefined" ? null : window.sessionStorage),
  fillRandom: (bytes) => {
    crypto.getRandomValues(bytes);
  },
});
