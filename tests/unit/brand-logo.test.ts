import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { BRAND } from "@/content/public/shell";
import {
  LOGO_BASELINE_KEY,
  LOGO_SOURCE,
  LOGO_WIDTHS,
  logoCopyPath,
  webpInfo,
} from "../../scripts/assets/encode-brand-logo.mjs";

/**
 * The brand logo's delivery copies (S1.3b, D-19), hermetically: the PNG they are encoded from is the approved
 * E8 logo (its SHA-256 is the E10 baseline's); each committed copy is a lossless WebP of the logo's proportions
 * at the width the header and the footer need; the shell offers exactly those copies and keeps the PNG as `src`.
 * No browser, no network.
 */

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (relative: string) => readFileSync(path.join(ROOT, relative));
const baseline = JSON.parse(
  read("prototype/data/development-baseline.json").toString("utf8"),
) as { files: Record<string, string> };

describe("public/brand — the logo copies", () => {
  it("are encoded from the approved logo (the E10 baseline's SHA-256, 2172 × 724)", () => {
    const png = read(LOGO_SOURCE);
    expect(createHash("sha256").update(png).digest("hex")).toBe(
      baseline.files[LOGO_BASELINE_KEY],
    );
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([2172, 724]);
  });

  it.each(LOGO_WIDTHS.map((w) => [w]))(
    "the %i px copy is a lossless WebP of exactly the logo's proportions",
    (width) => {
      const info = webpInfo(read(logoCopyPath(width)));
      expect(info.chunks).toContain("VP8L");
      expect(info.chunks).not.toContain("VP8 ");
      expect(info.width).toBe(width);
      // Exactly 3 : 1, not rounded: a loaded copy's own proportions size an image whose CSS sets one side only.
      expect(info.height * 2172).toBe(info.width * 724);
    },
  );

  it("webpInfo refuses a file that is not WebP", () => {
    expect(() => webpInfo(read(LOGO_SOURCE))).toThrow(/not a WebP/);
  });
});

describe("the shell offers the copies", () => {
  it("BRAND.logo keeps the PNG as src and lists the three copies with their widths", () => {
    expect(BRAND.logo.src).toBe("/brand/aalishaan-studio.png");
    expect(BRAND.logo.srcSet).toBe(
      LOGO_WIDTHS.map(
        (w) => `/${logoCopyPath(w).replace(/^public\//, "")} ${w}w`,
      ).join(", "),
    );
  });

  it("the header and the footer pass the srcset with sizes from their CSS boxes", () => {
    const header = read("src/components/shell/site-header.tsx").toString();
    const footer = read("src/components/shell/site-footer.tsx").toString();
    expect(header).toContain("srcSet={BRAND.logo.srcSet}");
    expect(header).toContain(
      '"(min-width: 75rem) 120px, (max-width: 47.9375rem) 82px, 99px"',
    );
    expect(footer).toContain("srcSet={BRAND.logo.srcSet}");
    expect(footer).toContain('sizes="220px"');
  });
});
