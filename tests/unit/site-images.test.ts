import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PUBLIC_BUCKET,
  SITE_IMAGE_SIZES,
  SITE_PREFIX,
  catalogueImagePath,
  publicObjectUrl,
  siteImagePath,
  storageOriginFromUrl,
  type SiteImageKey,
} from "@/lib/site-images";
import { PINNED_PROTOTYPE_COMMIT } from "../../scripts/testing/lib/catalogue.mjs";
import {
  MANIFEST_PATH,
  deliverySize,
  entryProblem,
  isPng,
  isWebp,
  pngSize,
  verifySiteSource,
} from "../../scripts/testing/upload-site-images.mjs";

/**
 * The S1.3 site-image route (D-48), hermetically: the manifest is pinned to the prototype commit and the E10
 * development baseline's hashes; the registry mirrors the manifest exactly (every key and size both ways);
 * every object path is `site/<key>-<size>.webp`; the public URL builder accepts only the project's own
 * Storage origin, and without a valid public URL the pages render the app's own relative paths, never another
 * origin; and the upload tool refuses escaping paths, links, wrong signatures and wrong hashes on a scratch
 * directory. From S1.3b (D-19) the manifest also lists narrower delivery copies encoded from the PNG originals,
 * and the tool's scaling — the prototype's — is checked here as pure arithmetic. No network, no database.
 */

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
type Entry = {
  name: string;
  size: string;
  width: number | null;
  height: number | null;
  object_path: string;
  source_path: string;
  sha256: string;
  encode: boolean;
};
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as {
  commit: string;
  bucket: string;
  prefix: string;
  baseline: string;
  entries: Entry[];
};
const baseline = JSON.parse(
  readFileSync(
    path.join(ROOT, "prototype/data/development-baseline.json"),
    "utf8",
  ),
) as { files: Record<string, string> };

/**
 * The PNG originals' own dimensions (their IHDR, read from the pinned checkout b24dce1b… on 2026-10-22 — the
 * files are not in this repository, D-07); the upload tool reads the same header before it scales.
 */
const NATIVE: Record<string, { width: number; height: number }> = {
  "assets/site/Hero Artwork.png": { width: 1199, height: 1312 },
  "assets/site/Card 1 - Shop All Image.png": { width: 1254, height: 1254 },
  "assets/site/Card 2 - Collection Image.png": { width: 2048, height: 2048 },
  "assets/site/Card 3 - Artstyle Image.png": { width: 1122, height: 1402 },
  "assets/site/GEN 01 - Craft Detail - Gold Frame.png": {
    width: 1254,
    height: 1254,
  },
  "assets/site/GEN-02 - Paper Closeup.png": { width: 1254, height: 1254 },
  "assets/site/GEN-03 - Acrylic Glazing.png": { width: 1254, height: 1254 },
  "assets/site/GEN-03 - Back of Frame and Hanging System.png": {
    width: 1254,
    height: 1254,
  },
  "assets/site/GEN-04-Print Closeup.png": { width: 1254, height: 1254 },
  "assets/site/size-comparison-A2.png": { width: 2048, height: 1035 },
  "assets/site/Before you buy.png": { width: 2084, height: 754 },
};

describe("scripts/testing/site-images.json — the pinned manifest", () => {
  it("names the pinned prototype commit, the public bucket, the site prefix and the E10 baseline", () => {
    expect(manifest.commit).toBe(PINNED_PROTOTYPE_COMMIT);
    expect(manifest.bucket).toBe(PUBLIC_BUCKET);
    expect(manifest.prefix).toBe(SITE_PREFIX);
    expect(manifest.baseline).toContain("development-baseline.json");
  });

  it("every entry is well formed and unique, with the baseline's SHA-256 for its source", () => {
    const paths = new Set<string>();
    for (const entry of manifest.entries) {
      expect(entryProblem(entry), entry.object_path).toBeNull();
      expect(
        paths.has(entry.object_path),
        `duplicate ${entry.object_path}`,
      ).toBe(false);
      paths.add(entry.object_path);
      expect(
        baseline.files[entry.source_path],
        `baseline hash for ${entry.source_path}`,
      ).toBe(entry.sha256);
    }
    expect(manifest.entries).toHaveLength(39);
  });

  it("the encoded copies come from PNG originals — native for the PNG-only sources, narrower delivery copies from S1.3b; the rest are the prototype's responsive WebP copies", () => {
    const encoded = manifest.entries.filter((e) => e.encode);
    const native = encoded.filter(
      (e) => e.size === "native" || e.width === NATIVE[e.source_path]?.width,
    );
    expect(native.map((e) => e.name).sort()).toEqual([
      "before-you-buy",
      "gen-01-craft-detail-gold-frame",
      "gen-02-paper-closeup",
      "gen-03-acrylic-glazing",
      "gen-03-back-of-frame-and-hanging-system",
      "gen-04-print-closeup",
      "size-comparison-a2",
    ]);
    // The S1.3b delivery copies: the widths Home draws (the sprint record → "Image delivery copies").
    expect(
      encoded
        .filter((e) => !native.includes(e))
        .map((e) => e.object_path)
        .sort(),
    ).toEqual(
      [
        "site/card-1-shop-all-800.webp",
        "site/card-2-collection-800.webp",
        "site/card-3-artstyle-800.webp",
        "site/hero-artwork-817.webp",
        ...[
          "gen-01-craft-detail-gold-frame",
          "gen-02-paper-closeup",
          "gen-03-acrylic-glazing",
          "gen-03-back-of-frame-and-hanging-system",
          "gen-04-print-closeup",
        ].flatMap((k) => [160, 320, 480].map((w) => `site/${k}-${w}.webp`)),
      ].sort(),
    );
    for (const entry of encoded)
      expect(entry.source_path).toMatch(/^assets\/site\/[^/]+\.png$/);
    for (const entry of manifest.entries.filter((e) => !e.encode))
      expect(entry.source_path).toMatch(
        /^assets\/site\/responsive\/[a-z0-9-]+\.webp$/,
      );
    // The backgrounds the R13 cascade dropped are not uploaded (the sprint record's step-1 contracts).
    for (const entry of manifest.entries)
      expect(entry.source_path).not.toMatch(
        /hero-desktop-landscape|hero-mobile-landscape|footer/i,
      );
  });
});

describe("the S1.3b delivery copies — the prototype's scaling, never enlarged", () => {
  it("every encoded copy is the scaled size of its PNG original (min(1, width / native), rounded) and no wider", () => {
    for (const entry of manifest.entries.filter(
      (e) => e.encode && e.size !== "native",
    )) {
      const natural = NATIVE[entry.source_path];
      expect(natural, `native size of ${entry.source_path}`).toBeDefined();
      expect(deliverySize(natural!, entry)).toEqual({
        width: entry.width,
        height: entry.height,
      });
      expect(entry.width!).toBeLessThanOrEqual(natural!.width);
    }
  });

  it("each key a page draws smaller than the prototype's copies gains a copy at least as wide as its widest box at 1.75×", () => {
    // The boxes measured at S1.3b (CSS px): the landed hero artwork 415, a route card 375 at a 412 px phone,
    // a swatch 145 (the phone cards) — each × 1.75 (Lighthouse's phone) fits under the new copy.
    const widths = (key: SiteImageKey) =>
      SITE_IMAGE_SIZES[key].filter((s) => s !== "native").map(Number);
    expect(
      Math.min(...widths("hero-artwork").filter((w) => w >= 415 * 1.75)),
    ).toBe(817);
    for (const key of [
      "card-1-shop-all",
      "card-2-collection",
      "card-3-artstyle",
    ] as const)
      expect(Math.min(...widths(key).filter((w) => w >= 375 * 1.75))).toBe(800);
    expect(
      Math.min(
        ...widths("gen-04-print-closeup").filter((w) => w >= 145 * 1.75),
      ),
    ).toBe(320);
  });
});

describe("the S1.3b delivery copies — no box moves", () => {
  it("the hero artwork's copy keeps the PNG's proportions to 0.001 % (the cutout's height follows the loaded copy)", () => {
    const natural = NATIVE["assets/site/Hero Artwork.png"]!;
    const copy = manifest.entries.find(
      (e) => e.object_path === "site/hero-artwork-817.webp",
    )!;
    const error =
      Math.abs(copy.height! / copy.width! - natural.height / natural.width) /
      (natural.height / natural.width);
    expect(error).toBeLessThan(0.00001);
  });

  it("the footer photo keeps the prototype's srcset: its height follows the copy, and no narrower copy keeps 1122 : 1402", () => {
    const footer = readFileSync(
      fileURLToPath(
        new URL("../../src/components/shell/site-footer.tsx", import.meta.url),
      ),
      "utf8",
    );
    expect(footer).toMatch(
      /siteImageSrcSet\("card-3-artstyle", \[\s*\["600", "600w"\],\s*\["1200", "1122w"\],\s*\]\)/,
    );
  });
});

describe("src/lib/site-images.ts — the registry mirrors the manifest", () => {
  it("every registry key and size is in the manifest, and every manifest entry is in the registry", () => {
    const fromRegistry = new Set<string>();
    for (const [key, sizes] of Object.entries(SITE_IMAGE_SIZES))
      for (const size of sizes)
        fromRegistry.add(siteImagePath(key as SiteImageKey, size));
    const fromManifest = new Set(manifest.entries.map((e) => e.object_path));
    expect([...fromRegistry].sort()).toEqual([...fromManifest].sort());
  });

  it("builds `site/<key>-<size>.webp` and refuses a size the key is not stored at", () => {
    expect(siteImagePath("page-hero", "1600")).toBe("site/page-hero-1600.webp");
    expect(siteImagePath("before-you-buy", "native")).toBe(
      "site/before-you-buy-native.webp",
    );
    expect(() => siteImagePath("page-hero", "480")).toThrow(/no 480 copy/);
    expect(() => siteImagePath("hero-artwork", "1600")).toThrow();
  });

  it("catalogue paths follow the S1.1 object-path contract and refuse a non-slug", () => {
    expect(
      catalogueImagePath("the-ship-between-two-storms", "frame-black", "1200"),
    ).toBe("artworks/the-ship-between-two-storms/frame-black-1200.webp");
    expect(() => catalogueImagePath("../x", "paper", "480")).toThrow();
    expect(() => catalogueImagePath("Ship", "paper", "480")).toThrow();
  });

  it("an artwork is stored only at full size, every other slot only at 480 and 1200 (scripts/testing/lib/catalogue.mjs)", () => {
    const slug = "the-ship-between-two-storms";
    expect(catalogueImagePath(slug, "artwork", "full")).toBe(
      `artworks/${slug}/artwork-full.webp`,
    );
    expect(catalogueImagePath(slug, "paper", "480")).toBe(
      `artworks/${slug}/paper-480.webp`,
    );
    expect(catalogueImagePath(slug, "close-antique-gold", "1200")).toBe(
      `artworks/${slug}/close-antique-gold-1200.webp`,
    );
    // The types already refuse these pairs; the runtime guard holds for a caller the types do not reach.
    expect(() => catalogueImagePath(slug, "artwork", "1200" as "full")).toThrow(
      /no 1200 copy/,
    );
    expect(() => catalogueImagePath(slug, "paper", "full" as "480")).toThrow(
      /no full copy/,
    );
  });
});

describe("the rendered URLs follow the build's public Supabase URL (read once at module load)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function registryBuiltWith(supabaseUrl: string | undefined) {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", supabaseUrl);
    return import("@/lib/site-images");
  }

  it("renders the project's Storage origin when the value is valid", async () => {
    const { catalogueImage, siteImage } = await registryBuiltWith(
      "https://abcdefghijklmnopqrst.supabase.co/",
    );
    const base =
      "https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/catalogue-public";
    expect(siteImage("page-hero", "1200")).toBe(
      `${base}/site/page-hero-1200.webp`,
    );
    expect(
      catalogueImage("the-ship-between-two-storms", "artwork", "full"),
    ).toBe(`${base}/artworks/the-ship-between-two-storms/artwork-full.webp`);
  });

  it.each([
    [undefined],
    [""],
    ["not a url"],
    ["https://abcdefghijklmnopqrst.supabase.co:8443"],
    ["https://example.com"],
  ])(
    "renders the app's own relative paths, never another origin, for %j",
    async (supabaseUrl) => {
      const { catalogueImage, siteImage, siteImageSrcSet } =
        await registryBuiltWith(supabaseUrl);
      const base = "/storage/v1/object/public/catalogue-public";
      expect(siteImage("page-hero", "1200")).toBe(
        `${base}/site/page-hero-1200.webp`,
      );
      expect(
        siteImageSrcSet("hero-artwork", [
          ["600", "600w"],
          ["1200", "1200w"],
        ]),
      ).toBe(
        `${base}/site/hero-artwork-600.webp 600w, ${base}/site/hero-artwork-1200.webp 1200w`,
      );
      expect(
        catalogueImage("the-ship-between-two-storms", "paper", "480"),
      ).toBe(`${base}/artworks/the-ship-between-two-storms/paper-480.webp`);
    },
  );
});

describe("storageOriginFromUrl / publicObjectUrl — only the project's own Storage origin", () => {
  it.each([
    [
      "https://abcdefghijklmnopqrst.supabase.co",
      "https://abcdefghijklmnopqrst.supabase.co",
    ],
    [
      "https://abcdefghijklmnopqrst.supabase.co/",
      "https://abcdefghijklmnopqrst.supabase.co",
    ],
  ])("accepts %s", (input, origin) => {
    expect(storageOriginFromUrl(input)).toBe(origin);
    expect(publicObjectUrl(origin, "site/page-hero-1200.webp")).toBe(
      `${origin}/storage/v1/object/public/catalogue-public/site/page-hero-1200.webp`,
    );
  });

  it.each([
    [undefined],
    [""],
    ["   "],
    ["not a url"],
    ["http://abcdefghijklmnopqrst.supabase.co"],
    ["https://abcdefghijklmnopqrst.supabase.co/rest/v1"],
    ["https://abcdefghijklmnopqrst.supabase.co/?x=1"],
    ["https://abcdefghijklmnopqrst.supabase.co/#f"],
    ["https://user:pw@abcdefghijklmnopqrst.supabase.co"],
    ["https://abcdefghijklmnopqrst.supabase.co:8443"],
    ["https://example.com"],
    ["https://abc.supabase.co"],
    ["https://abcdefghijklmnopqrst.supabase.co.evil.test"],
    ["javascript:alert(1)"],
  ])("rejects %j", (input) => {
    expect(storageOriginFromUrl(input)).toBeNull();
  });

  it("refuses an object path that is not a plain .webp path", () => {
    const origin = "https://abcdefghijklmnopqrst.supabase.co";
    for (const bad of [
      "../x.webp",
      "/site/a.webp",
      "site/a.png",
      "site/a b.webp",
      "site/A.webp",
      "",
    ])
      expect(() => publicObjectUrl(origin, bad), bad).toThrow();
  });
});

describe("scripts/testing/upload-site-images.mjs — bounded verification on a scratch root", () => {
  const WEBP = Buffer.concat([
    Buffer.from("RIFF"),
    Buffer.alloc(4),
    Buffer.from("WEBPVP8 "),
    Buffer.alloc(8),
  ]);
  const PNG = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(16),
  ]);
  const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
  const scratch = mkdtempSync(path.join(tmpdir(), "site-images-"));
  const root = path.join(scratch, "root");
  mkdirSync(path.join(root, "assets/site/responsive"), { recursive: true });
  writeFileSync(path.join(root, "assets/site/responsive/ok-600.webp"), WEBP);
  writeFileSync(path.join(root, "assets/site/Craft.png"), PNG);
  writeFileSync(path.join(root, "assets/site/fake.webp"), PNG);
  writeFileSync(path.join(scratch, "outside.webp"), WEBP);
  const link = path.join(root, "assets/site/link.webp");
  try {
    symlinkSync(path.join(scratch, "outside.webp"), link);
  } catch (error) {
    // Windows grants a file symbolic link only in Developer Mode or to an administrator. A directory junction
    // needs no privilege and is a symbolic link to lstat all the same, so the refusal is exercised either way
    // (the fallback of tests/unit/catalogue-tools.test.ts).
    if ((error as NodeJS.ErrnoException).code !== "EPERM") throw error;
    symlinkSync(
      mkdtempSync(path.join(tmpdir(), "site-images-outside-")),
      link,
      "junction",
    );
  }
  const entry = (over: Partial<Entry>): Entry => ({
    name: "ok",
    size: "600",
    width: 600,
    height: 338,
    object_path: "site/ok-600.webp",
    source_path: "assets/site/responsive/ok-600.webp",
    sha256: sha(WEBP),
    encode: false,
    ...over,
  });

  it("recognises the two signatures", () => {
    expect(isWebp(WEBP)).toBe(true);
    expect(isWebp(PNG)).toBe(false);
    expect(isPng(PNG)).toBe(true);
    expect(isPng(WEBP)).toBe(false);
  });

  it("accepts a verified WebP copy and a verified PNG source", () => {
    expect(verifySiteSource(root, entry({}))).toMatchObject({
      ok: true,
      bytes: WEBP.length,
    });
    expect(
      verifySiteSource(
        root,
        entry({
          name: "craft",
          size: "1254",
          width: 1254,
          height: 1254,
          object_path: "site/craft-1254.webp",
          source_path: "assets/site/Craft.png",
          sha256: sha(PNG),
          encode: true,
        }),
      ),
    ).toMatchObject({ ok: true });
  });

  it.each([
    [
      "an absolute path",
      { source_path: "/etc/passwd" },
      /not a plain relative path/,
    ],
    [
      "a traversal",
      { source_path: "assets/../../outside.webp" },
      /not a plain relative path/,
    ],
    [
      "a missing file",
      { source_path: "assets/site/responsive/missing.webp" },
      /missing/,
    ],
    [
      "a symbolic link",
      { source_path: "assets/site/link.webp" },
      /symbolic link/,
    ],
    [
      "a wrong signature",
      { source_path: "assets/site/fake.webp", sha256: sha(PNG) },
      /not a WebP/,
    ],
    ["a wrong hash", { sha256: "0".repeat(64) }, /SHA-256 differs/],
  ])("refuses %s", (_, over, reason) => {
    expect(verifySiteSource(root, entry(over as Partial<Entry>))).toMatchObject(
      { ok: false, reason },
    );
  });

  it("entryProblem names the malformed field", () => {
    expect(entryProblem(entry({ object_path: "site/other-600.webp" }))).toBe(
      "object_path",
    );
    expect(entryProblem(entry({ sha256: "xyz" }))).toBe("sha256");
    expect(entryProblem(entry({ encode: true }))).toBe("encode flag");
    expect(entryProblem(entry({ width: 0 }))).toBe("dimensions");
    expect(entryProblem(entry({ name: "Bad Key" }))).toBe("name");
    expect(
      entryProblem(
        entry({
          size: "1254",
          width: 1200,
          object_path: "site/ok-1254.webp",
          source_path: "a/b.png",
          encode: true,
        }),
      ),
    ).toMatch(/named by its width/);
  });

  it("pngSize reads the IHDR dimensions and refuses anything else", () => {
    const ihdr = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(ihdr, 0);
    ihdr.write("IHDR", 12, "latin1");
    ihdr.writeUInt32BE(1254, 16);
    ihdr.writeUInt32BE(627, 20);
    expect(pngSize(ihdr)).toEqual({ width: 1254, height: 627 });
    expect(() => pngSize(WEBP)).toThrow(/not a PNG/);
    expect(() => pngSize(PNG)).toThrow(/IHDR/);
  });

  it("deliverySize scales as the prototype does, refuses an enlargement and a height that is not the scaled one", () => {
    const natural = { width: 1122, height: 1402 };
    const copy = (width: number, height: number) =>
      entry({
        name: "card",
        size: String(width),
        width,
        height,
        object_path: `site/card-${width}.webp`,
        source_path: "assets/site/Card.png",
        encode: true,
      });
    expect(deliverySize(natural, copy(800, 1000))).toEqual({
      width: 800,
      height: 1000,
    });
    expect(deliverySize(natural, copy(1122, 1402))).toEqual(natural);
    expect(() => deliverySize(natural, copy(1200, 1499))).toThrow(
      /never enlarged/,
    );
    expect(() => deliverySize(natural, copy(800, 999))).toThrow(
      /manifest says 800×999/,
    );
    expect(
      deliverySize(
        { width: 2084, height: 754 },
        entry({ size: "native", width: null, height: null, encode: true }),
      ),
    ).toEqual({ width: 2084, height: 754 });
  });
});
