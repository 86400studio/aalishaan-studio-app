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
import { LOGO_WIDTHS } from "../../scripts/assets/encode-brand-logo.mjs";
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

/**
 * The widest picture each changed image draws on Home, CSS px, at the widths S1.3b audited: [viewport width, hero
 * artwork, route cards 1–2, route card 3, craft swatch, header logo]. Each value is the maximum over 4–7 viewport
 * heights and both motion modes, every instance included (the wall, travelling and landed hero frames; the desktop
 * and phone-card swatches), with every image loaded and object-fit applied from the loaded copy's own proportions
 * (cards 1–2 are square copies in a 1122 × 1402 box). Measured on a local build of the head with Playwright's
 * Chromium 1248 (the sprint record → "Cloud execution", the audit; commit 5031782); the footer logo is 220 px at
 * every width. Rows sit on each `sizes` breakpoint and one pixel past it, and every 5–50 px where a slot runs close
 * to the picture (601–900, 901–1199 and 1412–2560 px). All at the browser's default 16 px font size; the S1.3b VS
 * Code leg re-measured rows on Windows (Chromium 1248) to within 0.1 px, and DRAWN_20 below holds its measurements
 * at 20 px.
 */
const DRAWN: ReadonlyArray<
  readonly [number, number, number, number, number, number]
> = [
  [280, 331.7, 165.5, 241.3, 168.2, 81.6],
  [290, 345.3, 172.5, 251.3, 168.2, 81.6],
  [300, 359, 179.4, 261.3, 145.1, 81.6],
  [310, 372.6, 186.2, 271.3, 145.1, 81.6],
  [320, 386.2, 193.2, 281.3, 145.1, 81.6],
  [360, 414.6, 220.7, 321.3, 112, 81.6],
  [375, 414.6, 231.1, 336.3, 112, 81.6],
  [390, 414.6, 241.5, 351.3, 112, 81.6],
  [412, 414.6, 256.6, 373.3, 112, 81.6],
  [414, 414.6, 258, 375.3, 112, 81.6],
  [430, 414.6, 269, 391.3, 112, 81.6],
  [480, 414.6, 284.8, 414, 112, 81.6],
  [540, 414.6, 284.8, 414, 112, 81.6],
  [600, 414.6, 120.5, 176, 112, 81.6],
  [601, 414.6, 336.4, 488.9, 112, 81.6],
  [617, 415.7, 346.2, 503, 112, 81.6],
  [618, 416.3, 346.8, 503.9, 112, 81.6],
  [620, 417.7, 348, 505.7, 112, 81.6],
  [625, 421, 351, 510.1, 112, 81.6],
  [630, 424.4, 354.1, 514.5, 112, 81.6],
  [635, 427.8, 357.1, 518.9, 112, 81.6],
  [640, 431.1, 360.1, 523.3, 112, 81.6],
  [660, 444.6, 372.3, 540.9, 112, 81.6],
  [680, 458.1, 384.4, 558.5, 112, 81.6],
  [700, 471.6, 396.6, 576.1, 112, 81.6],
  [720, 485, 545.2, 593.7, 112, 81.6],
  [740, 498.5, 561.4, 611.3, 112, 81.6],
  [750, 505.2, 569.5, 620.1, 112, 81.6],
  [760, 512, 577.6, 628.9, 112, 81.6],
  [767, 516.7, 583.3, 635, 112, 81.6],
  [768, 517.4, 200.9, 219.4, 112, 98.4],
  [800, 538.9, 210.7, 230, 112, 98.4],
  [820, 552.4, 216.9, 236.7, 112, 98.4],
  [834, 561.8, 221.1, 241.4, 112, 98.4],
  [850, 572.6, 226.1, 246.7, 112, 98.4],
  [880, 592.8, 235.2, 256.7, 112, 98.4],
  [900, 606.3, 241.4, 263.4, 112, 98.4],
  [901, 451.2, 241.7, 263.7, 84, 98.4],
  [920, 461.8, 247.5, 270, 84, 98.4],
  [960, 484.3, 259.8, 283.4, 84, 98.4],
  [980, 495.5, 265.9, 290, 84, 98.4],
  [1000, 506.7, 272.1, 296.7, 84, 98.4],
  [1024, 520.2, 279.4, 304.7, 84, 98.4],
  [1050, 534.8, 287.4, 313.4, 84, 98.4],
  [1070, 546, 293.5, 320, 84, 98.4],
  [1100, 562.9, 302.7, 330, 84, 98.4],
  [1120, 574.1, 308.9, 336.7, 84, 98.4],
  [1150, 591, 318.1, 346.7, 84, 98.4],
  [1170, 602.2, 324.2, 353.4, 84, 98.4],
  [1180, 607.8, 327.2, 356.7, 84, 98.4],
  [1190, 613.4, 330.3, 360, 84, 98.4],
  [1199, 618.5, 333.1, 363, 84, 98.4],
  [1200, 414.6, 326, 355.4, 84, 120],
  [1280, 429.3, 335.8, 366, 84, 120],
  [1300, 436, 335.8, 366, 84, 120],
  [1366, 458.1, 335.8, 366, 84, 120],
  [1400, 469.5, 335.8, 366, 84, 120],
  [1411, 473.2, 335.8, 366, 84, 120],
  [1412, 473.5, 335.8, 366, 84, 120],
  [1420, 476.2, 335.8, 366, 84, 120],
  [1440, 482.9, 335.8, 366, 84, 120],
  [1500, 503, 335.8, 366, 84, 120],
  [1536, 515.1, 335.8, 366, 84, 120],
  [1600, 536.6, 335.8, 366, 84, 120],
  [1707, 572.5, 335.8, 366, 84, 120],
  [1800, 603.6, 335.8, 366, 84, 120],
  [1920, 643.9, 335.8, 366, 84, 120],
  [2048, 686.8, 335.8, 366, 84, 120],
  [2200, 737.8, 335.8, 366, 84, 120],
  [2560, 858.5, 335.8, 366, 84, 120],
  [3000, 860.2, 335.8, 366, 84, 120],
  [3840, 860.2, 335.8, 366, 84, 120],
];
/**
 * The same columns at a 20 px default font size (Chrome's "Large"), measured in the S1.3b VS Code leg on a local
 * build with Playwright's Chromium 1248 on Windows (the default font size set to 20 through the DevTools protocol; four
 * viewport heights, both motion modes, every image loaded). The hero column is kept from 901 px only: below it the
 * measurement did not follow the phone lift's travelling frame (at 16 px it read 473.2 at 768 px, against 517.4
 * above), so those cells are null.
 */
const DRAWN_20: ReadonlyArray<
  readonly [number, number | null, number, number, number, number]
> = [
  [280, null, 159.2, 232, 229.6, 102],
  [290, null, 166, 242, 206.5, 102],
  [300, null, 173, 252, 180.2, 102],
  [310, null, 179.9, 262, 157.1, 102],
  [320, null, 186.8, 272, 157.1, 102],
  [386, null, 232.3, 338, 134, 102],
  [387, null, 233, 339, 134, 102],
  [412, null, 250.2, 364, 112, 102],
  [500, null, 311, 452, 112, 102],
  [600, null, 151, 220.1, 112, 102],
  [700, null, 389.9, 566.5, 112, 102],
  [768, null, 575.3, 626.3, 112, 102],
  [850, null, 641.7, 698.5, 112, 102],
  [900, null, 682.1, 742.5, 112, 102],
  [901, 518.2, 683, 743.4, 105, 102],
  [1000, 518.2, 264, 288, 105, 123],
  [1100, 518.2, 294.7, 321.3, 105, 123],
  [1125, 518.2, 302.4, 329.7, 105, 123],
  [1126, 563.8, 302.7, 330, 105, 123],
  [1200, 605.3, 325.4, 354.7, 105, 123],
  [1300, 661.4, 356, 388, 105, 123],
  [1499, 518.2, 407.9, 444.3, 105, 123],
  [1500, 518.2, 408.2, 444.7, 105, 150],
  [1600, 536.5, 420.4, 458, 105, 150],
  [1920, 575.2, 420.4, 458, 105, 150],
];
/** Every pixel ratio from 1 to 3 in steps of 0.01 — an undercount shows only in narrow bands of ratios. */
const DPRS = Array.from({ length: 201 }, (_, i) => 1 + i / 100);

/** The `sizes` slot at a viewport width: the media conditions and lengths these components use. `root` is the
 * browser's default font size, which rem follows in `sizes` as in the CSS (the pages set no root font size). */
function sizesSlot(sizes: string, vw: number, root = 16): number {
  for (const part of sizes.split(/,(?![^(]*\))/).map((p) => p.trim())) {
    const m = part.match(/^\((max|min)-width:\s*([\d.]+)(px|rem)\)\s+(.+)$/);
    if (m) {
      const bound = Number(m[2]) * (m[3] === "rem" ? root : 1);
      if (m[1] === "max" ? vw > bound : vw < bound) continue;
    }
    const len = m ? m[4]! : part;
    let n: RegExpMatchArray | null;
    if ((n = len.match(/^([\d.]+)px$/))) return Number(n[1]);
    if ((n = len.match(/^([\d.]+)rem$/))) return Number(n[1]) * root;
    if ((n = len.match(/^([\d.]+)vw$/))) return (Number(n[1]) * vw) / 100;
    if ((n = len.match(/^calc\(([\d.]+)vw - ([\d.]+)(px|rem)\)$/)))
      return (
        (Number(n[1]) * vw) / 100 - Number(n[2]) * (n[3] === "rem" ? root : 1)
      );
    throw new Error(`unsupported sizes length: ${len}`);
  }
  throw new Error(`no default slot in: ${sizes}`);
}

/** The candidate Chromium picks: the narrowest whose density reaches the DPR, else the widest (it matched
 * Chromium 1248 on all 28,990 picks of the S1.3b audit). */
function pick(
  widths: number[],
  sizes: string,
  vw: number,
  dpr: number,
  root = 16,
) {
  const slot = sizesSlot(sizes, vw, root);
  const sorted = [...widths].sort((a, b) => a - b);
  return sorted.find((w) => w / slot >= dpr) ?? sorted[sorted.length - 1]!;
}

describe("the S1.3b delivery copies — no picture is drawn from a narrower copy than S1.3 sent", () => {
  const source = (relative: string) =>
    readFileSync(
      fileURLToPath(new URL(`../../${relative}`, import.meta.url)),
      "utf8",
    );
  const sizesIn = (relative: string, pattern: RegExp) => {
    const m = source(relative).match(pattern);
    expect(m, `sizes in ${relative}`).not.toBeNull();
    return m![1]!;
  };
  const widthOf = (objectPath: string) =>
    manifest.entries.find((e) => e.object_path === objectPath)!.width!;
  const S13_HERO_SIZES = "(max-width: 900px) 420px, 480px";
  const S13_CARD_SIZES =
    "(max-width: 600px) calc(100vw - 36px), (max-width: 900px) 70vw, 33vw";
  const heroSizes = sizesIn(
    "src/components/home/opening.tsx",
    /sizes:\s*"([^"]+)"/,
  );
  const cardSizes = sizesIn(
    "src/components/catalogue/route-card.tsx",
    /const SIZES =\s*"([^"]+)"/,
  );
  const swatchSizes = sizesIn(
    "src/components/product/spec-card.tsx",
    /const SWATCH_SIZES =\s*"([^"]+)"/,
  );
  const headerSizes = sizesIn(
    "src/components/shell/site-header.tsx",
    /const HEADER_LOGO_SIZES =\s*"([^"]+)"/,
  );
  const hero = ["600", "817", "1200"].map((s) =>
    widthOf(`site/hero-artwork-${s}.webp`),
  );
  const card12 = ["600", "800", "1200"].map((s) =>
    widthOf(`site/card-1-shop-all-${s}.webp`),
  );
  const card3 = ["600", "800", "1200"].map((s) =>
    widthOf(`site/card-3-artstyle-${s}.webp`),
  );
  const swatch = [160, 320, 480, 1254];
  const logo = [...LOGO_WIDTHS];

  const cases: Array<{
    name: string;
    column: number;
    sizes: string;
    now: (vw: number, dpr: number) => number;
    before: (vw: number, dpr: number) => number;
  }> = [
    {
      name: "hero artwork",
      column: 1,
      sizes: heroSizes,
      now: (vw, dpr) => pick(hero, heroSizes, vw, dpr),
      before: (vw, dpr) => pick([hero[0]!, hero[2]!], S13_HERO_SIZES, vw, dpr),
    },
    {
      name: "route cards 1–2",
      column: 2,
      sizes: cardSizes,
      now: (vw, dpr) => pick(card12, cardSizes, vw, dpr),
      before: (vw, dpr) =>
        pick([card12[0]!, card12[2]!], S13_CARD_SIZES, vw, dpr),
    },
    {
      name: "route card 3",
      column: 3,
      sizes: cardSizes,
      now: (vw, dpr) => pick(card3, cardSizes, vw, dpr),
      before: (vw, dpr) =>
        pick([card3[0]!, card3[2]!], S13_CARD_SIZES, vw, dpr),
    },
    // S1.3 sent the full pictures (1254 px swatches, the 2172 px logo), so these copies must cover the picture outright.
    {
      name: "craft swatch",
      column: 4,
      sizes: swatchSizes,
      now: (vw, dpr) => pick(swatch, swatchSizes, vw, dpr),
      before: () => 1254,
    },
    {
      name: "header logo",
      column: 5,
      sizes: headerSizes,
      now: (vw, dpr) => pick(logo, headerSizes, vw, dpr),
      before: () => 2172,
    },
  ];

  it.each(cases.map((c) => [c.name, c]))(
    "%s: its sizes slot is never narrower than the picture it draws, at every audited width",
    (_name, c) => {
      const short = DRAWN.filter(
        (row) => sizesSlot(c.sizes, row[0]) < row[c.column]!,
      ).map(
        (row) =>
          `${row[0]}px: slot ${sizesSlot(c.sizes, row[0])}, drawn ${row[c.column]}`,
      );
      expect(short).toEqual([]);
    },
  );

  it.each(cases.map((c) => [c.name, c]))(
    "%s: no copy narrower than the picture where S1.3 sent a wider one, at every audited width and DPR 1–3 (0.01 steps)",
    (_name, c) => {
      const regressions: string[] = [];
      for (const row of DRAWN)
        for (const dpr of DPRS) {
          const need = row[c.column]! * dpr;
          const now = c.now(row[0], dpr);
          if (now < need && now < c.before(row[0], dpr))
            regressions.push(
              `${row[0]}px @${dpr}: needs ${Math.round(need)}, gets ${now}`,
            );
        }
      expect(regressions).toEqual([]);
    },
  );

  it("the components offer exactly the copies evaluated here, each described by its own width", () => {
    expect(source("src/components/home/opening.tsx")).toMatch(
      /siteImageSrcSet\("hero-artwork", \[\s*\["600", "600w"\],\s*\["817", "817w"\],\s*\["1200", "1199w"\],\s*\]\)/,
    );
    expect(source("src/components/catalogue/route-card.tsx")).toMatch(
      /siteImageSrcSet\(image, \[\s*\["600", "600w"\],\s*\["800", "800w"\],\s*\["1200", largeWidth\],\s*\]\)/,
    );
    expect(source("src/components/home/routes.tsx")).toMatch(
      /"card-1-shop-all": "1200w",\s*"card-2-collection": "1200w",\s*"card-3-artstyle": "1122w",/,
    );
    expect(source("src/components/product/spec-card.tsx")).toMatch(
      /siteImageSrcSet\(spec\.image, \[\s*\["160", "160w"\],\s*\["320", "320w"\],\s*\["480", "480w"\],\s*\[CRAFT\.size, `\$\{CRAFT\.width\}w`\],\s*\]\)/,
    );
    expect(source("src/components/product/spec-card.tsx")).toMatch(
      /const CRAFT = \{ size: "1254", width: 1254, height: 1254 \};/,
    );
    expect(hero).toEqual([600, 817, 1199]);
    expect(card12).toEqual([600, 800, 1200]);
    expect(
      ["600", "800", "1200"].map((s) =>
        widthOf(`site/card-2-collection-${s}.webp`),
      ),
    ).toEqual(card12);
    expect(card3).toEqual([600, 800, 1122]);
    for (const key of [
      "gen-01-craft-detail-gold-frame",
      "gen-02-paper-closeup",
      "gen-03-acrylic-glazing",
      "gen-03-back-of-frame-and-hanging-system",
      "gen-04-print-closeup",
    ])
      expect(
        ["160", "320", "480", "1254"].map((s) =>
          widthOf(`site/${key}-${s}.webp`),
        ),
      ).toEqual(swatch);
  });

  it.each(cases.map((c) => [c.name, c]))(
    '%s: at a 20 px default font size (Chrome\'s "Large") its slot still covers the picture',
    (_name, c) => {
      const short = DRAWN_20.filter((row) => row[c.column] !== null)
        .filter((row) => sizesSlot(c.sizes, row[0], 20) < row[c.column]!)
        .map(
          (row) =>
            `${row[0]}px: slot ${sizesSlot(c.sizes, row[0], 20)}, drawn ${row[c.column]}`,
        );
      expect(short).toEqual([]);
    },
  );

  it("the earlier slots in px would not: in rem the slot grows with the box at 20 px", () => {
    const fails = (sizes: string, column: number) =>
      DRAWN_20.some(
        (row) =>
          row[column] !== null && sizesSlot(sizes, row[0], 20) < row[column]!,
      );
    expect(
      fails(
        "(max-width: 617px) 420px, (max-width: 900px) 68vw, (max-width: 74.9375rem) calc(56.2vw - 54px), (max-width: 1411px) 480px, 34vw",
        1,
      ),
    ).toBe(true);
    expect(
      fails("(max-width: 309px) 190px, (max-width: 900px) 146px, 84px", 4),
    ).toBe(true);
    expect(
      fails("(min-width: 75rem) 120px, (max-width: 47.9375rem) 82px, 99px", 5),
    ).toBe(true);
  });

  it("the footer logo's 450 / 660 copies cover its 220 px at every DPR up to 3", () => {
    for (const dpr of DPRS)
      expect(pick(logo, "220px", 1440, dpr)).toBeGreaterThanOrEqual(220 * dpr);
  });

  it("Lighthouse's phone (412 px at 1.75×) still takes the small copies", () => {
    expect(pick(hero, heroSizes, 412, 1.75)).toBe(817);
    expect(pick(card12, cardSizes, 412, 1.75)).toBe(800);
    expect(pick(card3, cardSizes, 412, 1.75)).toBe(800);
    expect(pick(swatch, swatchSizes, 412, 1.75)).toBe(320);
    expect(pick(logo, headerSizes, 412, 1.75)).toBe(240);
  });

  it("the prototype's sizes would have let the 817 hero copy be drawn enlarged (the audit's finding, kept as a guard)", () => {
    // 2560 px at 1.5×: the wall frame draws 858.5 px, needing 1288 device px; S1.3's markup sent the 1199 px copy.
    expect(pick(hero, S13_HERO_SIZES, 2560, 1.5)).toBe(817);
    expect(pick(hero, heroSizes, 2560, 1.5)).toBe(1199);
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
