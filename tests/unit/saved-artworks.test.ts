import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { WISHLIST_KEY_PREFIX } from "@/content/public/strings";
import {
  browserLocalStorage,
  readSavedArtworks,
  savedArtworkKey,
} from "@/lib/catalogue/saved-artworks";

/**
 * The Saved view's read of the browser-local wishlist (S1.4), hermetically: the prototype's key
 * `aalishaan-wishlist-<slug>` and its rule that only the string "true" is saved (the card wishlist script of
 * prototype/shop-all/index.html, which the S1.3 hearts port); only the slugs a page shows are read, so a key left by an
 * artwork that is no longer public is never read and never shown; and a missing or refusing storage is reported as
 * unreadable — never as "nothing saved", never as a partial answer. No browser: the storage is a stub, and `window` is
 * stubbed per test and restored after it.
 */

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (relative: string) =>
  readFileSync(path.join(ROOT, relative), "utf8");

/** A storage stub over fixed entries that records every key it is asked for, and refuses the keys `refuse` names. */
function stubStorage(
  entries: Record<string, string>,
  refuse: (key: string) => boolean = () => false,
) {
  const asked: string[] = [];
  const storage = {
    getItem(key: string): string | null {
      asked.push(key);
      if (refuse(key))
        throw new DOMException("The operation is insecure.", "SecurityError");
      return Object.hasOwn(entries, key) ? entries[key] : null;
    },
  };
  return { storage, asked };
}

const BRIDGE = "the-bridge-of-blue-stone";
const LANTERN = "the-lantern-that-outlasted-the-gale";
const WILLOW = "willow-after-rain";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("savedArtworkKey — the prototype's key", () => {
  it("is `aalishaan-wishlist-` and the slug: the key the prototype's hearts and the S1.3 hearts write", () => {
    expect(WISHLIST_KEY_PREFIX).toBe("aalishaan-wishlist-");
    expect(savedArtworkKey(BRIDGE)).toBe(
      "aalishaan-wishlist-the-bridge-of-blue-stone",
    );
    expect(savedArtworkKey(LANTERN)).toBe(`${WISHLIST_KEY_PREFIX}${LANTERN}`);
    // The prototype's card script reads and writes that key, "true" meaning saved…
    const prototype = read("prototype/shop-all/index.html");
    expect(prototype).toContain(
      "key = 'aalishaan-wishlist-' + card.dataset.product;",
    );
    expect(prototype).toContain(
      "saved = localStorage.getItem(key) === 'true';",
    );
    expect(prototype).toContain("localStorage.setItem(key, String(saved));");
    // …and so does the heart the browse cards render.
    const heart = read("src/components/home/wishlist-heart.tsx");
    expect(heart).toContain("const key = `${WISHLIST_KEY_PREFIX}${slug}`;");
    expect(heart).toContain('localStorage.getItem(key) === "true"');
    expect(heart).toContain("localStorage.setItem(key, String(next));");
  });
});

describe("readSavedArtworks — which of a page's artworks are saved", () => {
  it('counts only the string "true" as saved: "false", a missing key and any other value are not', () => {
    const values: Record<string, string> = {
      a: "true",
      b: "false",
      c: "TRUE",
      d: "True",
      e: " true",
      f: "1",
      g: "yes",
      h: "",
    };
    const slugs = [...Object.keys(values), "never-saved"];
    const { storage } = stubStorage(
      Object.fromEntries(
        Object.entries(values).map(([slug, value]) => [
          savedArtworkKey(slug),
          value,
        ]),
      ),
    );
    expect(readSavedArtworks(storage, slugs)).toEqual({
      ok: true,
      saved: new Set(["a"]),
    });
  });

  it("reads only the slugs it is given, each once, in order: a key left by an artwork that is not on the page is never read and never shown", () => {
    const { storage, asked } = stubStorage({
      [savedArtworkKey(BRIDGE)]: "true",
      [savedArtworkKey(LANTERN)]: "true",
      [savedArtworkKey("an-artwork-no-longer-public")]: "true",
    });
    const result = readSavedArtworks(storage, [BRIDGE, WILLOW]);
    expect(result).toEqual({ ok: true, saved: new Set([BRIDGE]) });
    expect(asked).toEqual([savedArtworkKey(BRIDGE), savedArtworkKey(WILLOW)]);
    // A page with no artworks reads nothing and has nothing saved.
    const empty = stubStorage({ [savedArtworkKey(BRIDGE)]: "true" });
    expect(readSavedArtworks(empty.storage, [])).toEqual({
      ok: true,
      saved: new Set(),
    });
    expect(empty.asked).toEqual([]);
  });

  it("reports no storage as unreadable, never as nothing saved", () => {
    expect(readSavedArtworks(null, [BRIDGE, LANTERN])).toEqual({ ok: false });
    expect(readSavedArtworks(null, [])).toEqual({ ok: false });
  });

  it("reports a storage whose read throws as unreadable — never a partial answer", () => {
    const entries = {
      [savedArtworkKey(BRIDGE)]: "true",
      [savedArtworkKey(LANTERN)]: "true",
    };
    // Refused from the first read…
    const blocked = stubStorage(entries, () => true);
    expect(readSavedArtworks(blocked.storage, [BRIDGE, LANTERN])).toEqual({
      ok: false,
    });
    // …and part-way through, after a saved artwork was already found.
    const partWay = stubStorage(
      entries,
      (key) => key === savedArtworkKey(LANTERN),
    );
    expect(readSavedArtworks(partWay.storage, [BRIDGE, LANTERN])).toEqual({
      ok: false,
    });
    expect(partWay.asked).toEqual([
      savedArtworkKey(BRIDGE),
      savedArtworkKey(LANTERN),
    ]);
  });
});

describe("browserLocalStorage — the browser's storage, or null", () => {
  it("is null where there is no window: the server, and this Node run", () => {
    expect(typeof window).toBe("undefined");
    expect(browserLocalStorage()).toBeNull();
    expect(readSavedArtworks(browserLocalStorage(), [BRIDGE])).toEqual({
      ok: false,
    });
  });

  it("is null when the browser refuses storage: reading window.localStorage throws", () => {
    const refusing = {};
    Object.defineProperty(refusing, "localStorage", {
      get() {
        throw new DOMException("The operation is insecure.", "SecurityError");
      },
    });
    vi.stubGlobal("window", refusing);
    expect(browserLocalStorage()).toBeNull();
    expect(readSavedArtworks(browserLocalStorage(), [BRIDGE])).toEqual({
      ok: false,
    });
  });

  it("is window.localStorage when it works, and the Saved view reads the hearts' keys from it", () => {
    const items = new Map<string, string>();
    const storage = {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => {
        items.set(key, String(value));
      },
    };
    vi.stubGlobal("window", { localStorage: storage });
    expect(browserLocalStorage()).toBe(storage);
    // What a heart writes (String(saved)), the Saved view reads back.
    storage.setItem(savedArtworkKey(BRIDGE), String(true));
    storage.setItem(savedArtworkKey(LANTERN), String(false));
    expect(
      readSavedArtworks(browserLocalStorage(), [BRIDGE, LANTERN, WILLOW]),
    ).toEqual({ ok: true, saved: new Set([BRIDGE]) });
  });

  it("restores the missing window after a stub (the cases above stay independent)", () => {
    expect(typeof window).toBe("undefined");
    expect(browserLocalStorage()).toBeNull();
  });
});
