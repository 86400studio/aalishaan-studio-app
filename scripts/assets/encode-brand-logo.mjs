#!/usr/bin/env node
// @ts-check
/**
 * `node scripts/assets/encode-brand-logo.mjs [--write]` — the brand logo's delivery copies (S1.3b, D-19).
 *
 * The approved E8 logo `public/brand/aalishaan-studio.png` (2172 × 724, D-PRE-07; its SHA-256 is the E10
 * development baseline's for `assets/brand/aalishaan-studio.png`) is drawn 82–120 CSS px wide in the header and
 * 220 px wide in the footer, yet every public page sent the full 417 KB file and React preloaded it. This tool
 * encodes the same picture at 240, 450 and 660 px wide — the header's and the footer's boxes at 2× and 3× — as
 * **lossless** WebP through Playwright's Chromium, the prototype's own encoding method
 * (prototype/scripts/prepare-mobile-site.cjs: decode, draw scaled by `min(1, width / naturalWidth)`, rounded, on
 * a canvas, export) with quality 1, which Chromium encodes losslessly: the logo is blended with `multiply` over
 * the hero, so a lossy copy could show compression specks on the room behind it. No creative edit: the picture,
 * its proportions and its colours are the PNG's.
 *
 * Without `--write` it verifies the source and prints what it would write; with `--write` it writes the three
 * copies beside the PNG (`public/brand/aalishaan-studio-<width>.webp`). Offline — no network, no secret.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const LOGO_SOURCE = "public/brand/aalishaan-studio.png";
export const LOGO_BASELINE_KEY = "assets/brand/aalishaan-studio.png";
// Multiples of 3, so each copy is exactly 3 : 1 like the PNG (2172 : 724): a loaded copy's own proportions size an
// image whose CSS sets only one side, and a rounded height (440 × 147) would move the footer by a fraction of a pixel.
export const LOGO_WIDTHS = /** @type {const} */ ([240, 450, 660]);

/** @param {number} width */
export const logoCopyPath = (width) =>
  `public/brand/aalishaan-studio-${width}.webp`;

/**
 * The chunks of a WebP file (RIFF container), and its canvas size: from the VP8X chunk when the file has one
 * (Chromium writes it with the ICC profile), otherwise from the lossless VP8L header. Pure; used by the unit
 * suite to check the committed copies.
 * @param {Buffer} bytes
 * @returns {{ chunks: string[], width: number, height: number }}
 */
export function webpInfo(bytes) {
  if (
    bytes.length < 20 ||
    bytes.toString("latin1", 0, 4) !== "RIFF" ||
    bytes.toString("latin1", 8, 12) !== "WEBP"
  )
    throw new Error("not a WebP file");
  /** @type {string[]} */
  const chunks = [];
  let width = 0;
  let height = 0;
  for (let at = 12; at + 8 <= bytes.length;) {
    const type = bytes.toString("latin1", at, at + 4);
    const size = bytes.readUInt32LE(at + 4);
    const data = at + 8;
    chunks.push(type);
    if (type === "VP8X") {
      width = 1 + bytes.readUIntLE(data + 4, 3);
      height = 1 + bytes.readUIntLE(data + 7, 3);
    } else if (type === "VP8L" && width === 0) {
      const bits = bytes.readUInt32LE(data + 1);
      width = 1 + (bits & 0x3fff);
      height = 1 + ((bits >>> 14) & 0x3fff);
    }
    at = data + size + (size & 1);
  }
  return { chunks, width, height };
}

async function main() {
  const write = process.argv.includes("--write");
  const source = readFileSync(path.join(ROOT, LOGO_SOURCE));
  const baseline = JSON.parse(
    readFileSync(
      path.join(ROOT, "prototype/data/development-baseline.json"),
      "utf8",
    ),
  );
  const sha = createHash("sha256").update(source).digest("hex");
  if (sha !== baseline.files[LOGO_BASELINE_KEY]) {
    console.error(
      `Refused: ${LOGO_SOURCE} is not the approved logo (its SHA-256 differs from the E10 baseline's).`,
    );
    process.exitCode = 1;
    return;
  }
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent("<!doctype html><title>encode</title>");
    for (const width of LOGO_WIDTHS) {
      const encoded = await page.evaluate(
        async ({ src, width }) => {
          const image = new Image();
          image.src = src;
          await image.decode();
          const scale = Math.min(1, width / image.naturalWidth);
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(image.naturalWidth * scale);
          canvas.height = Math.round(image.naturalHeight * scale);
          const context = canvas.getContext("2d");
          if (!context) throw new Error("no 2d context");
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          return {
            width: canvas.width,
            height: canvas.height,
            data: canvas.toDataURL("image/webp", 1).split(",")[1],
          };
        },
        { src: `data:image/png;base64,${source.toString("base64")}`, width },
      );
      if (encoded.width * 724 !== encoded.height * 2172)
        throw new Error(
          `${width}: ${encoded.width}×${encoded.height} is not the logo's 3 : 1`,
        );
      const bytes = Buffer.from(encoded.data, "base64");
      if (!webpInfo(bytes).chunks.includes("VP8L"))
        throw new Error(`${width}: the browser did not encode losslessly`);
      const target = logoCopyPath(width);
      if (write) writeFileSync(path.join(ROOT, target), bytes);
      console.log(
        `${write ? "Wrote" : "Would write"} ${target}: ${encoded.width}×${encoded.height}, ${bytes.length} bytes, lossless.`,
      );
    }
  } finally {
    await browser.close();
  }
}

// Run only as the entry point (the unit suite imports this file).
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
