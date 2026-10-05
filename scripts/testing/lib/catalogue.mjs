// @ts-check
/**
 * The S1.1 catalogue seed plan — pure functions over the approved prototype sources (docs/APPROVED-INPUTS.md
 * §2, D-08): prototype/data/products.json, pricing.json, workbook-source.json and web-artwork-map.json, the
 * seven generated policy pages under prototype/pages/policies/, and the E10 development baseline
 * (prototype/data/development-baseline.json) for the SHA-256 of every image in the pinned checkout (D-07).
 *
 * Nothing here performs I/O against a database or a network: `buildSeedPlan()` reads the repository's own
 * files once and returns deterministic rows; `seed.mjs`, `reset.mjs` and `upload-catalogue.mjs` apply them
 * under the owner's scoped TEST authorisation. Stable identity is natural: slugs, finish codes,
 * "<slug>:<finish>" variant codes, object paths, (policy_key, version) and the rule version — the tools
 * upsert on those keys and never on generated ids, so a second run preserves ids.
 *
 * Money: the prototype's rupee prices are read once here and converted to exact integer paise
 * (docs/TECH-ARCHITECTURE.md → Money; locked-facts §2). Nothing downstream ever sees a rupee value.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const PROTOTYPE = path.join(REPO_ROOT, "prototype");

/** The published public prototype commit (E8) the image upload reads from — D-07, locked-facts header. */
export const PINNED_PROTOTYPE_COMMIT =
  "b24dce1bf498a5c8131694fef5fb1602139e1653";
/** The local prototype revision the text sources carry (E10 = E8 + the Admin package + the E10 additions). */
export const PROTOTYPE_REVISION = "E10";

export const BUCKET = "catalogue-public";

/** The approved finish order (locked-facts §3: "White, Black and Antique Gold"). */
export const FINISHES = Object.freeze([
  { code: "white", name: "White", sort_order: 1 },
  { code: "black", name: "Black", sort_order: 2 },
  { code: "antique-gold", name: "Antique Gold", sort_order: 3 },
]);
const FINISH_CODES = FINISHES.map((f) => f.code);

export const ARTWORK_COUNT = 22;
export const VARIANT_COUNT = 66;
export const IMAGES_PER_ARTWORK = 15; // 6 frame/close-up × 2 sizes + paper × 2 sizes + the artwork itself
export const IMAGE_COUNT = ARTWORK_COUNT * IMAGES_PER_ARTWORK;

/** The seven policy pages (locked-facts §8) and their rendered titles. */
export const POLICY_KEYS = Object.freeze([
  "shipping",
  "cancellation",
  "returns",
  "refunds",
  "privacy",
  "terms",
  "cookies",
]);

/**
 * The E10 additions to the privacy and cookies pages are drafts, not approved copy (D-08 carve-out, NS-15).
 * The seed stores the page text without them. Each entry names the policy, the section and the exact
 * sentence removed; the remaining text is the E10 page verbatim. The cookies "Clear your preview" sentence
 * also mentions the waiting-list preview, but its pre-E10 wording is not recoverable from this repository —
 * it is stored as rendered and listed for verification against the pinned checkout (the sprint record).
 */
export const POLICY_CARVE_OUTS = Object.freeze([
  {
    policy_key: "privacy",
    heading: "Browser storage",
    sentence:
      " If you try the waiting-list preview shown while ordering is paused, the details you enter are kept only in this browser; nothing is sent.",
  },
  {
    policy_key: "cookies",
    heading: "What is remembered",
    sentence:
      " It also keeps any waiting-list preview entry you submit while ordering is paused.",
  },
]);

/** The initial rule version (D-03, D-20, D-37): closed for prelaunch, synthetic, 60-minute expiry. */
export const INITIAL_BUSINESS_RULES = Object.freeze({
  version: 1,
  effective_from: "2026-10-05T00:00:00Z",
  approver_name: "Delivery lead (86400 Studio)",
  approver_staff_id: null,
  synthetic: true,
  sales_open: false,
  sales_open_reason: "prelaunch",
  pending_order_expiry_minutes: 60,
  shipping_paise: null,
  tax_treatment: null,
  note: "S1.1 initial version: sales closed until S3.4 (prelaunch); shipping and tax unknown until the owner's inputs (OI-02, OI-03); the D-20 expiry as a rule, not a code constant.",
});

/** @param {string} relative */
function readJson(relative) {
  const text = readFileSync(path.join(PROTOTYPE, relative), "utf8").replace(
    /^﻿/,
    "",
  );
  return JSON.parse(text);
}

/**
 * Exact rupees → paise. The prototype's pricing.json holds whole rupees; a fractional, negative or unsafe
 * value is refused rather than rounded.
 * @param {unknown} rupees
 * @returns {bigint}
 */
export function rupeesToPaise(rupees) {
  if (
    typeof rupees !== "number" ||
    !Number.isSafeInteger(rupees) ||
    rupees <= 0
  )
    throw new Error(
      `pricing.json must hold positive whole rupees; got ${String(rupees)}`,
    );
  return BigInt(rupees) * BigInt(100);
}

/**
 * The rendered policy page (build-pending.cjs → shell()): the utility hero (h1 + intro, which may be empty),
 * an optional preview note ("Commercial terms are not yet effective…" — pending-terms copy, kept as the first
 * body entry with an empty heading), and the article's sections. The policy-tabs nav, the "help-meta" date
 * line, the related articles and the assistance block are page chrome, not policy text.
 * @param {string} html
 * @returns {{ title: string, intro: string, sections: Array<{ heading: string, text: string }> }}
 */
export function extractPolicyPage(html) {
  const main = html.slice(html.indexOf("<main"), html.indexOf("</main>"));
  const hero =
    /<section class="utility-hero">[\s\S]*?<h1>([^<]*)<\/h1><p>([^<]*)<\/p><\/section>/.exec(
      main,
    );
  const article = /<article class="help-article">([\s\S]*?)<\/article>/.exec(
    main,
  );
  if (!hero || !article) throw new Error("policy page shape changed");
  /** @type {Array<{ heading: string, text: string }>} */
  const sections = [];
  const note = /<p class="preview-note">([^<]*)<\/p>/.exec(main);
  if (note) sections.push({ heading: "", text: decode(note[1]) });
  const sectionPattern =
    /<section id="section-\d+"><h2>([^<]*)<\/h2>([\s\S]*?)<\/section>/g;
  let card;
  while ((card = sectionPattern.exec(article[1])) !== null) {
    const [, heading, inner] = card;
    const paragraphs = [...inner.matchAll(/<p>([\s\S]*?)<\/p>/g)]
      .map((m) => decode(m[1].replace(/<[^>]+>/g, "")))
      .filter((t) => t !== "");
    sections.push({ heading: decode(heading), text: paragraphs.join("\n") });
  }
  if (sections.length === 0) throw new Error("policy page has no sections");
  return { title: decode(hero[1]), intro: decode(hero[2]), sections };
}

/** @param {string} s */
function decode(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "’")
    .trim();
}

/**
 * @typedef {{ slug: string, slot: string, size: "480" | "1200" | "full", object_path: string, source_path: string, sha256: string }} ImageEntry
 */

/**
 * The enumerated image manifest: for each artwork the frame and close-up of every finish at 480 and 1200,
 * the paper detail at 480 and 1200, and the artwork itself (one optimised file). Object paths follow the
 * 0001_catalogue contract artworks/<slug>/<slot>-<size>.webp; source paths are prototype-relative; the
 * SHA-256 comes from the E10 development baseline, which hashed every file of the full-asset workspace.
 * @returns {ImageEntry[]}
 */
export function buildImageManifest() {
  /** @type {any[]} */
  const products = readJson("data/products.json");
  /** @type {Record<string, { "480": string, "1200": string }>} */
  const webMap = readJson("data/web-artwork-map.json");
  /** @type {{ files: Record<string, string> }} */
  const baseline = readJson("data/development-baseline.json");
  /** @type {ImageEntry[]} */
  const entries = [];
  /** @param {string} src */
  const small = (src) => {
    const found = Object.values(webMap).find((v) => v["1200"] === src);
    if (found) return found["480"];
    if (!/-1200\.webp$/.test(src)) throw new Error(`no 480 variant for ${src}`);
    return src.replace(/-1200\.webp$/, "-480.webp");
  };
  /** @param {string} sourcePath */
  const hashOf = (sourcePath) => {
    const sha = baseline.files[sourcePath];
    if (typeof sha !== "string" || !/^[0-9a-f]{64}$/.test(sha))
      throw new Error(`no baseline hash for ${sourcePath}`);
    return sha;
  };
  for (const p of products) {
    /** @param {string} slot @param {"480"|"1200"|"full"} size @param {string} sourcePath */
    const add = (slot, size, sourcePath) =>
      entries.push({
        slug: p.slug,
        slot,
        size,
        object_path: `artworks/${p.slug}/${slot}-${size}.webp`,
        source_path: sourcePath,
        sha256: hashOf(sourcePath),
      });
    for (const finish of FINISH_CODES) {
      const frame = p.frames[finish];
      add(`frame-${finish}`, "1200", frame.image.src);
      add(`frame-${finish}`, "480", small(frame.image.src));
      add(`close-${finish}`, "1200", frame.closeup.src);
      add(`close-${finish}`, "480", small(frame.closeup.src));
    }
    add("paper", "1200", p.paper.src);
    add("paper", "480", small(p.paper.src));
    add("artwork", "full", p.artwork.src);
  }
  return entries;
}

/**
 * @typedef {{
 *   slug: string, title: string, full_title: string, hook: string, description: string,
 *   collection_slug: string, style_slug: string, orientation: string,
 *   rooms: string[], moods: string[], palettes: string[], palette_hues: string[],
 *   suggested_frame: string, featured: boolean, lead_time: null,
 *   seo_title: string, seo_description: string, default_alt: string, image_alt_text: string,
 *   status: "Active", source_row: number,
 * }} SeedArtwork
 */

/**
 * @typedef {{
 *   collections: Array<{ slug: string, name: string, intro: string, sort_order: number }>,
 *   art_styles: Array<{ slug: string, name: string, full_name: string, intro: string, collection_slug: string, sort_order: number }>,
 *   frame_finishes: Array<{ code: string, name: string, sort_order: number }>,
 *   artworks: SeedArtwork[],
 *   variants: Array<{ variant_code: string, slug: string, finish_code: string, price_paise: bigint, currency: "INR", availability: "made_to_order", lead_time: null }>,
 *   images: ImageEntry[],
 *   policy_versions: Array<{ policy_key: string, version: number, title: string, intro: string, body: Array<{ heading: string, text: string }>, terms_status: "pending", source: string, effective_from: null }>,
 *   business_rules: typeof INITIAL_BUSINESS_RULES,
 *   fingerprint: string,
 * }} SeedPlan
 */

/** @returns {SeedPlan} */
export function buildSeedPlan() {
  /** @type {any[]} */
  const products = readJson("data/products.json");
  /** @type {Record<string, number>} */
  const pricing = readJson("data/pricing.json");
  /** @type {{ rows: Array<{ row: number, cells: Record<string, string> }> }} */
  const workbook = readJson("data/workbook-source.json")[0];
  if (products.length !== ARTWORK_COUNT)
    throw new Error(
      `products.json holds ${products.length} artworks, expected ${ARTWORK_COUNT}`,
    );

  /** @type {Map<string, { slug: string, name: string, intro: string, sort_order: number }>} */
  const collections = new Map();
  /** @type {Map<string, { slug: string, name: string, full_name: string, intro: string, collection_slug: string, sort_order: number }>} */
  const styles = new Map();
  for (const p of products) {
    if (!collections.has(p.collectionSlug))
      collections.set(p.collectionSlug, {
        slug: p.collectionSlug,
        name: p.collection,
        intro: p.collectionIntro,
        sort_order: collections.size + 1,
      });
    if (!styles.has(p.styleSlug))
      styles.set(p.styleSlug, {
        slug: p.styleSlug,
        name: p.style,
        full_name: p.styleFull,
        intro: p.styleIntro,
        collection_slug: p.collectionSlug,
        sort_order: styles.size + 1,
      });
    else if (styles.get(p.styleSlug)?.collection_slug !== p.collectionSlug)
      throw new Error(`style ${p.styleSlug} spans two collections`);
  }

  /** @type {SeedArtwork[]} */
  const artworks = products.map((p) => {
    const row = workbook.rows.find((r) => r.row === p.sourceRow);
    if (!row)
      throw new Error(`workbook row ${p.sourceRow} missing for ${p.slug}`);
    /** @param {string} column */
    const cell = (column) => String(row.cells[column + row.row] || "");
    // build-products.cjs: the <title> is the workbook's Meta Title (R), the meta description its Meta
    // Description (S), the stage-image alt its Image Alt Text (T), each with the build's fallback; the
    // palette hues are the first four of column AJ.
    const hues = cell("AJ")
      .split(/\s*·\s*/)
      .filter(Boolean)
      .slice(0, 4);
    if (!FINISH_CODES.includes(p.suggestedFrame))
      throw new Error(`unknown suggested frame for ${p.slug}`);
    return {
      slug: p.slug,
      title: p.title,
      full_title: p.fullTitle,
      hook: p.hook,
      description: p.description,
      collection_slug: p.collectionSlug,
      style_slug: p.styleSlug,
      orientation: p.orientation,
      rooms: [...p.rooms],
      moods: [...p.moods],
      palettes: [...p.palettes],
      palette_hues: hues,
      suggested_frame: p.suggestedFrame,
      featured: false,
      lead_time: null,
      seo_title: cell("R") || `${p.title} | Aalishaan Studio`,
      seo_description: cell("S") || p.hook,
      default_alt: p.alt,
      image_alt_text: cell("T") || p.alt,
      status: "Active",
      source_row: p.sourceRow,
    };
  });

  const variants = products.flatMap((p) =>
    FINISHES.map((f) => ({
      variant_code: `${p.slug}:${f.code}`,
      slug: p.slug,
      finish_code: f.code,
      price_paise: rupeesToPaise(pricing[f.code]),
      currency: /** @type {const} */ ("INR"),
      availability: /** @type {const} */ ("made_to_order"),
      lead_time: null,
    })),
  );

  const policy_versions = POLICY_KEYS.map((key) => {
    const html = readFileSync(
      path.join(PROTOTYPE, "pages", "policies", key, "index.html"),
      "utf8",
    );
    const page = extractPolicyPage(html);
    for (const carve of POLICY_CARVE_OUTS) {
      if (carve.policy_key !== key) continue;
      const section = page.sections.find((s) => s.heading === carve.heading);
      if (!section || !section.text.includes(carve.sentence))
        throw new Error(
          `carve-out sentence not found in ${key} › ${carve.heading}`,
        );
      section.text = section.text.replace(carve.sentence, "");
    }
    return {
      policy_key: key,
      version: 1,
      title: page.title,
      intro: page.intro,
      body: page.sections,
      terms_status: /** @type {const} */ ("pending"),
      source: `prototype/pages/policies/${key}/index.html @ ${PROTOTYPE_REVISION} (public E8 ${PINNED_PROTOTYPE_COMMIT.slice(0, 8)}); D-08 carve-out applied`,
      effective_from: null,
    };
  });

  const plan = {
    collections: [...collections.values()],
    art_styles: [...styles.values()],
    frame_finishes: FINISHES.map((f) => ({ ...f })),
    artworks,
    variants,
    images: buildImageManifest(),
    policy_versions,
    business_rules: INITIAL_BUSINESS_RULES,
    fingerprint: "",
  };
  plan.fingerprint = createHash("sha256")
    .update(
      JSON.stringify(plan, (_, v) => (typeof v === "bigint" ? `${v}n` : v)),
    )
    .digest("hex");
  return plan;
}

/** The manifest file the upload tool and the unit tests pin, regenerated by `node scripts/testing/lib/catalogue.mjs --write-manifest`. */
export const MANIFEST_PATH = path.join(
  REPO_ROOT,
  "scripts",
  "testing",
  "catalogue-images.json",
);

/** @returns {{ commit: string, bucket: string, entries: ImageEntry[] }} */
export function manifestDocument() {
  return {
    commit: PINNED_PROTOTYPE_COMMIT,
    bucket: BUCKET,
    entries: buildImageManifest(),
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) &&
  process.argv.includes("--write-manifest")
) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(
    MANIFEST_PATH,
    JSON.stringify(manifestDocument(), null, 2) + "\n",
  );
  console.log(`wrote ${MANIFEST_PATH}`);
}
