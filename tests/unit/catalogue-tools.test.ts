import { spawnSync } from "node:child_process";
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

import { describe, expect, it } from "vitest";

import {
  OBJECT_PATH_PATTERN,
  PALETTES,
  MOODS,
  ROOMS,
} from "@/lib/schemas/catalogue";
import {
  ARTWORK_COUNT,
  FINISHES,
  IMAGE_COUNT,
  INITIAL_BUSINESS_RULES,
  MANIFEST_PATH,
  PINNED_PROTOTYPE_COMMIT,
  POLICY_CARVE_OUTS,
  POLICY_KEYS,
  VARIANT_COUNT,
  buildSeedPlan,
  canonicalJson,
  extractPolicyPage,
  manifestDocument,
  rupeesToPaise,
  sameInstant,
} from "../../scripts/testing/lib/catalogue.mjs";
import {
  checkoutCommit,
  verifySourceFile,
} from "../../scripts/testing/upload-catalogue.mjs";

/**
 * The S1.1 seed plan and the bounded upload tool, hermetically: exact counts, exact paise, copy parity with
 * the approved sources and the locked facts, the D-08 carve-out, determinism, the pinned manifest, and the
 * upload's path, link, type and hash refusals on a scratch directory. No network, no database.
 */

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (relative: string) =>
  readFileSync(path.join(ROOT, relative), "utf8");
const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "’");
const norm = (s: string) => decode(s).replace(/\s+/g, " ").trim();

const plan = buildSeedPlan();
const products = JSON.parse(read("prototype/data/products.json")) as Array<
  Record<string, unknown>
>;

describe("the seed plan — counts, identities and exact money", () => {
  it("holds 3 collections, 11 art styles, 3 finishes, 22 Active artworks, 66 variants, 330 image rows, 7 policies and rule version 1", () => {
    expect(plan.collections).toHaveLength(3);
    expect(plan.art_styles).toHaveLength(11);
    expect(plan.frame_finishes).toHaveLength(3);
    expect(plan.artworks).toHaveLength(ARTWORK_COUNT);
    expect(plan.variants).toHaveLength(VARIANT_COUNT);
    expect(plan.images).toHaveLength(IMAGE_COUNT);
    expect(plan.policy_versions).toHaveLength(7);
    expect(plan.business_rules.version).toBe(1);
    expect(plan.artworks.every((a) => a.status === "Active")).toBe(true);
  });

  it("matches the locked catalogue facts: collection sizes 4 / 8 / 10, two artworks per style, Portrait 12 / Landscape 10, finishes 8 / 8 / 6", () => {
    const byCollection = Object.fromEntries(
      plan.collections.map((c) => [
        c.slug,
        plan.artworks.filter((a) => a.collection_slug === c.slug).length,
      ]),
    );
    expect(byCollection).toEqual({
      "painted-in-gold": 4,
      "blossoms-in-ink": 8,
      "the-age-of-sail": 10,
    });
    for (const style of plan.art_styles)
      expect(
        plan.artworks.filter((a) => a.style_slug === style.slug),
        style.slug,
      ).toHaveLength(2);
    expect(
      plan.artworks.filter((a) => a.orientation === "Portrait"),
    ).toHaveLength(12);
    expect(
      plan.artworks.filter((a) => a.orientation === "Landscape"),
    ).toHaveLength(10);
    const byFrame = Object.fromEntries(
      FINISHES.map((f) => [
        f.code,
        plan.artworks.filter((a) => a.suggested_frame === f.code).length,
      ]),
    );
    expect(byFrame).toEqual({ "antique-gold": 8, white: 8, black: 6 });
    expect(plan.frame_finishes.map((f) => f.name)).toEqual([
      "White",
      "Black",
      "Antique Gold",
    ]);
    expect(plan.art_styles.map((s) => s.slug)).toEqual([
      "gilded-peaks",
      "rinpa-moon",
      "four-gentlemen",
      "scarlet-blossom",
      "moonlit-blossom",
      "hand-printed-ukiyo-e",
      "mythic-voyage",
      "corsair-chronicles",
      "ghostly-armada",
      "marquetry-voyage",
      "neo-classical-fantasy",
    ]);
  });

  it("prices every variant at exactly 1,900,000 / 2,100,000 / 2,300,000 paise as bigint, INR, made to order, no lead-time promise", () => {
    const expected = {
      white: BigInt(1900000),
      black: BigInt(2100000),
      "antique-gold": BigInt(2300000),
    };
    for (const v of plan.variants) {
      expect(typeof v.price_paise).toBe("bigint");
      expect(v.price_paise, v.variant_code).toBe(
        expected[v.finish_code as keyof typeof expected],
      );
      expect(v.currency).toBe("INR");
      expect(v.availability).toBe("made_to_order");
      expect(v.lead_time).toBeNull();
      expect(v.variant_code).toBe(`${v.slug}:${v.finish_code}`);
    }
    for (const a of plan.artworks) expect(a.lead_time, a.slug).toBeNull();
    expect(rupeesToPaise(19000)).toBe(BigInt(1900000));
    expect(() => rupeesToPaise(19000.5)).toThrow(/whole rupees/);
    expect(() => rupeesToPaise(-1)).toThrow(/whole rupees/);
  });

  it("keeps the approved copy verbatim: titles, hooks, descriptions, alt, facets and the four hues", () => {
    for (const p of products) {
      const a = plan.artworks.find((x) => x.slug === p.slug);
      expect(a, String(p.slug)).toBeDefined();
      expect(a?.title).toBe(p.title);
      expect(a?.hook).toBe(p.hook);
      expect(a?.description).toBe(p.description);
      expect(a?.default_alt).toBe(p.alt);
      expect(a?.rooms).toEqual(p.rooms);
      expect(a?.moods).toEqual(p.moods);
      expect(a?.palettes).toEqual(p.palettes);
      expect(a?.suggested_frame).toBe(p.suggestedFrame);
      expect(a?.palette_hues.length).toBeLessThanOrEqual(4);
      expect(a?.palette_hues.length).toBeGreaterThan(0);
      for (const r of a?.rooms ?? []) expect(ROOMS).toContain(r);
      for (const m of a?.moods ?? []) expect(MOODS).toContain(m);
      for (const pal of a?.palettes ?? []) expect(PALETTES).toContain(pal);
    }
  });

  it("keeps every artwork page's approved <title> and meta description verbatim (the workbook's Meta Title / Meta Description, as build-products.cjs renders them)", () => {
    for (const a of plan.artworks) {
      const html = read(`prototype/pages/artworks/${a.slug}/index.html`);
      const title = decode(/<title>([^<]*)<\/title>/.exec(html)?.[1] ?? "");
      const description = decode(
        /<meta name="description" content="([^"]*)"/.exec(html)?.[1] ?? "",
      );
      expect(a.seo_title, a.slug).toBe(title);
      expect(a.seo_description, a.slug).toBe(description);
      expect(html, a.slug).toContain(
        `alt="${a.image_alt_text.replace(/&/g, "&amp;").replace(/"/g, "&quot;")} — `,
      );
    }
  });

  it("stores the seven policy pages verbatim with the D-08 carve-out applied", () => {
    expect(plan.policy_versions.map((p) => p.policy_key)).toEqual([
      ...POLICY_KEYS,
    ]);
    for (const pv of plan.policy_versions) {
      const html = read(`prototype/pages/policies/${pv.policy_key}/index.html`);
      const page = extractPolicyPage(html);
      expect(pv.title).toBe(page.title);
      expect(decode(/<h1>([^<]*)<\/h1>/.exec(html)?.[1] ?? "")).toBe(pv.title);
      expect(pv.version).toBe(1);
      expect(pv.terms_status).toBe("pending");
      expect(pv.source).toContain(
        `prototype/pages/policies/${pv.policy_key}/index.html`,
      );
      const pageText = norm(html.replace(/<[^>]+>/g, " "));
      const carves = POLICY_CARVE_OUTS.filter(
        (c) => c.policy_key === pv.policy_key,
      );
      // A reworded sentence is stored in its approved, pre-E10 form, which the E10 page no longer carries.
      const restored = new Set(
        carves
          .filter((c) => c.replacement !== "")
          .map((c) => norm(c.replacement)),
      );
      for (const section of pv.body) {
        expect(section.text.length).toBeGreaterThan(0);
        // Sentence by sentence: a carve-out removes or rewords a sentence in the middle of a paragraph, so the
        // paragraph as a whole is no longer contiguous on the page while every other sentence it keeps still is.
        for (const sentence of section.text.split(/(?<=[.!?])\s+/)) {
          if (restored.has(norm(sentence))) continue;
          expect(pageText, `${pv.policy_key} › ${section.heading}`).toContain(
            norm(sentence),
          );
        }
      }
      for (const carve of carves) {
        const section = pv.body.find((s) => s.heading === carve.heading);
        expect(section, carve.heading).toBeDefined();
        expect(norm(section?.text ?? "")).not.toContain(norm(carve.sentence));
        expect(pageText).toContain(norm(carve.sentence));
        if (carve.replacement !== "")
          expect(section?.text ?? "").toContain(carve.replacement);
      }
    }
    expect(
      plan.policy_versions
        .find((p) => p.policy_key === "terms")
        ?.body.some((s) => /₹19,000, ₹21,000 and ₹23,000/.test(s.text)),
    ).toBe(true);
  });

  it("stores the three sections E10 touched in the wording of the pinned public commit", () => {
    // Read on 2026-10-06 from pages/policies/privacy and pages/policies/cookies at PINNED_PROTOTYPE_COMMIT. Those
    // pages are not in this repository (D-07), so the approved wording is pinned here; every other section of
    // the seven policies is the same text in both revisions.
    const text = (key: string, heading: string) =>
      plan.policy_versions
        .find((p) => p.policy_key === key)
        ?.body.find((s) => s.heading === heading)?.text;
    expect(text("privacy", "Browser storage")).toBe(
      "Your selected artworks, wishlist and the PIN code you check for delivery can be remembered in this browser. The order preview is stored for the browser session and contains artwork selections, a payment-method label and that PIN code, not personal details.",
    );
    expect(text("cookies", "What is remembered")).toBe(
      "The prototype uses browser storage for the bag, wishlist, the PIN code you check for delivery and a session order preview. These let you revisit your selection while exploring the site.",
    );
    expect(text("cookies", "Clear your preview")).toBe(
      "Clear the saved bag, wishlist and order preview using the control below. Your browser also provides storage controls.",
    );
    expect(POLICY_CARVE_OUTS).toHaveLength(3);
    // The waiting list is an E10 draft (NS-12–NS-15): no seeded policy mentions it.
    for (const pv of plan.policy_versions)
      expect(JSON.stringify(pv.body), pv.policy_key).not.toMatch(
        /waiting[- ]list/i,
      );
  });

  it("seeds the initial rule version closed for prelaunch, synthetic, with the D-20 expiry and no guessed charge", () => {
    expect(plan.business_rules).toBe(INITIAL_BUSINESS_RULES);
    expect(plan.business_rules).toMatchObject({
      version: 1,
      synthetic: true,
      sales_open: false,
      sales_open_reason: "prelaunch",
      pending_order_expiry_minutes: 60,
      shipping_paise: null,
      tax_treatment: null,
      approver_staff_id: null,
    });
    expect(plan.business_rules.approver_name).toBe(
      "Delivery lead (86400 Studio)",
    );
  });

  it("is deterministic: two builds produce the same fingerprint, and it is the recorded one", () => {
    expect(buildSeedPlan().fingerprint).toBe(plan.fingerprint);
    // The plan the S1.1 records quote. It is pinned so that the value in a record can be checked, on every
    // platform the tests run on; a deliberate change to the plan or its sources changes it — update the value
    // here and in docs/sprint-prompts/S1.1-core-schema.md together.
    expect(plan.fingerprint).toBe(
      "e8492943d8cd9aca7588a6fd7c49c1c95ddb2ab531b517bac1702f245a997bcc",
    );
  });
});

describe("the seed's compare-before-write rule", () => {
  it("reads a jsonb body in the database's key order and a timestamptz with an offset as unchanged", () => {
    const planned = plan.policy_versions[0].body;
    // Postgres stores jsonb keys shortest first, so a section comes back as { text, heading }.
    const returned = planned.map(({ heading, text }) => ({ text, heading }));
    expect(JSON.stringify(returned)).not.toBe(JSON.stringify(planned));
    expect(canonicalJson(returned)).toBe(canonicalJson(planned));
    expect(canonicalJson({ b: [{ d: 1, c: BigInt(2) }], a: null })).toBe(
      '{"a":null,"b":[{"c":"2","d":1}]}',
    );
    expect(canonicalJson([2, 1])).not.toBe(canonicalJson([1, 2]));
    expect(canonicalJson({ a: 1 })).not.toBe(canonicalJson({ a: 2 }));

    const planInstant = INITIAL_BUSINESS_RULES.effective_from;
    expect(sameInstant("2026-10-05T00:00:00+00:00", planInstant)).toBe(true);
    expect(sameInstant("2026-10-05T05:30:00+05:30", planInstant)).toBe(true);
    expect(sameInstant("2026-10-05T00:00:01+00:00", planInstant)).toBe(false);
    expect(sameInstant(null, null)).toBe(true);
    expect(sameInstant(null, planInstant)).toBe(false);
    expect(sameInstant("not a date", "not a date")).toBe(false);
  });
});

describe("the image manifest — enumerated, hashed, pinned", () => {
  it("enumerates 15 objects per artwork under the bucket path contract with unique paths and baseline hashes", () => {
    const paths = new Set(plan.images.map((i) => i.object_path));
    expect(paths.size).toBe(IMAGE_COUNT);
    for (const i of plan.images) {
      expect(OBJECT_PATH_PATTERN.test(i.object_path), i.object_path).toBe(true);
      expect(i.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(i.source_path).toMatch(
        /^assets\/(web-artworks|artwork-originals)\/[^/]+\.webp$/,
      );
      expect(i.source_path.includes("..")).toBe(false);
    }
    for (const a of plan.artworks) {
      const mine = plan.images.filter((i) => i.slug === a.slug);
      expect(mine, a.slug).toHaveLength(15);
      expect(mine.filter((i) => i.size === "full")).toHaveLength(1);
      expect(mine.filter((i) => i.slot === "artwork")[0].object_path).toBe(
        `artworks/${a.slug}/artwork-full.webp`,
      );
    }
  });

  it("the committed manifest file equals the generated document (regenerate with --write-manifest)", () => {
    const committed = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
    expect(committed).toEqual(JSON.parse(JSON.stringify(manifestDocument())));
    expect(committed.commit).toBe(PINNED_PROTOTYPE_COMMIT);
    expect(committed.bucket).toBe("catalogue-public");
  });
});

describe("the upload tool — bounded source verification", () => {
  const webp = Buffer.concat([
    Buffer.from("RIFF"),
    Buffer.from([16, 0, 0, 0]),
    Buffer.from("WEBPVP8 "),
    Buffer.alloc(8),
  ]);
  const sha = createHash("sha256").update(webp).digest("hex");
  const root = mkdtempSync(path.join(tmpdir(), "aalishaan-upload-"));
  mkdirSync(path.join(root, "assets", "web-artworks"), { recursive: true });
  writeFileSync(path.join(root, "assets", "web-artworks", "good.webp"), webp);
  writeFileSync(
    path.join(root, "assets", "web-artworks", "wrong-hash.webp"),
    Buffer.concat([webp, Buffer.from([1])]),
  );
  writeFileSync(
    path.join(root, "assets", "web-artworks", "not-webp.webp"),
    Buffer.from("PNG....not a webp at all"),
  );
  const outside = mkdtempSync(path.join(tmpdir(), "aalishaan-outside-"));
  writeFileSync(path.join(outside, "escaped.webp"), webp);
  const link = path.join(root, "assets", "web-artworks", "link.webp");
  try {
    symlinkSync(path.join(outside, "escaped.webp"), link);
  } catch (error) {
    // Windows grants a file symbolic link only in Developer Mode or to an administrator. A directory junction
    // needs no privilege and is a symbolic link to lstat all the same, so the refusal is exercised either way.
    if ((error as NodeJS.ErrnoException).code !== "EPERM") throw error;
    symlinkSync(outside, link, "junction");
  }
  // A linked directory: the file inside it is a regular file whose real path lies outside the root.
  symlinkSync(outside, path.join(root, "assets", "linked"), "junction");
  const entry = (source_path: string, sha256 = sha) => ({
    slug: "x",
    slot: "frame-white",
    size: "480",
    object_path: "artworks/x/frame-white-480.webp",
    source_path,
    sha256,
  });

  it("accepts a regular WebP file inside the root whose SHA-256 matches", () => {
    const result = verifySourceFile(
      root,
      entry("assets/web-artworks/good.webp"),
    );
    expect(result).toMatchObject({ ok: true, bytes: webp.length });
  });

  it.each([
    ["assets/web-artworks/missing.webp", /missing/],
    ["../escaped.webp", /not a plain relative path/],
    ["assets/../../escaped.webp", /not a plain relative path/],
    ["/etc/passwd", /not a plain relative path/],
    ["assets\\web-artworks\\good.webp", /not a plain relative path/],
    ["assets/web-artworks/link.webp", /symbolic link/],
    ["assets/linked/escaped.webp", /resolves outside the source root/],
    ["assets/web-artworks/wrong-hash.webp", /SHA-256 differs/],
    ["assets/web-artworks/not-webp.webp", /not a WebP/],
  ])("refuses %s", (source_path, reason) => {
    const result = verifySourceFile(root, entry(source_path));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(reason);
  });

  it("runs as a command: without --source-root it refuses aloud and exits 2, never a silent exit 0", () => {
    // The entry-point guard once compared a Windows path with a URL pathname, so on Windows the tool printed
    // nothing, uploaded nothing and exited 0. This run stops at the missing argument, before any environment
    // file is read or any request is made.
    const run = spawnSync(
      process.execPath,
      [path.join(ROOT, "scripts", "testing", "upload-catalogue.mjs")],
      { encoding: "utf8" },
    );
    expect(run.status).toBe(2);
    expect(run.stderr).toContain("Refused: --source-root");
  });

  it("refuses an unlisted file by construction (only manifest entries are ever considered) and reads no commit from a plain directory", () => {
    expect(checkoutCommit(root)).toBeNull();
    expect(
      JSON.parse(readFileSync(MANIFEST_PATH, "utf8")).entries.some(
        (e: { source_path: string }) =>
          /master|originals\/.*\.png/.test(e.source_path),
      ),
    ).toBe(false);
  });
});
