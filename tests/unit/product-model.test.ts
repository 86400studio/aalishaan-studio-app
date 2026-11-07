import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  ARTWORK_NOT_AVAILABLE,
  ARTWORK_ROUTES,
  LANTERN,
  PALETTE_FALLBACK,
  PRODUCT_VIEWS,
  SIZE_GUIDE_SHEETS,
} from "@/content/public/product";
import { browseCard } from "@/lib/catalogue/browse-model";
import {
  artworkPageState,
  artworkPath,
  artworkRoute,
  artworkStaticParams,
  finishOrder,
  heroHook,
  lanternPageState,
  paletteSwatches,
  productView,
  relatedRows,
  sizeGuideSheet,
  splitStory,
  type ProductView,
} from "@/lib/catalogue/product-model";
import {
  publicCatalogueRowSchema,
  type FinishCode,
  type PublicCatalogueRow,
} from "@/lib/schemas/catalogue";
import { catalogueImage, siteImage } from "@/lib/site-images";
import { buildSeedPlan } from "../../scripts/testing/lib/catalogue.mjs";

/**
 * The S1.5 artwork pages' model (src/lib/catalogue/product-model.ts) and its editorial content
 * (src/content/public/product.ts), hermetically, against the frozen pages it ports. The fixtures are the 22 seeded
 * artworks as `public_catalogue` returns them, built from the TEST seed plan and parsed by the reader's own schema (the
 * S1.4 fixtures of tests/unit/catalogue-filters.test.ts); the oracles are the 22 generated pages
 * (prototype/pages/artworks/<slug>/index.html) and prototype/data/products.json. No browser, no network, no database.
 */

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (relative: string) =>
  readFileSync(path.join(ROOT, relative), "utf8");
/** The five entities the generator's `esc` writes (build-products.cjs:13), `&amp;` last. */
const decode = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const FINISHES = ["white", "black", "antique-gold"] as const;

const plan = buildSeedPlan();
const PUBLISHED_AT = "2026-10-05T10:00:00+00:00";

/** The 22 seeded artworks as the projection returns them (the S1.4 fixture, tests/unit/catalogue-filters.test.ts). */
function seededRows(): PublicCatalogueRow[] {
  const finishes = [...plan.frame_finishes].sort(
    (a, b) => a.sort_order - b.sort_order,
  );
  return plan.artworks.map((artwork) => {
    const collection = plan.collections.find(
      (c) => c.slug === artwork.collection_slug,
    );
    const style = plan.art_styles.find((s) => s.slug === artwork.style_slug);
    if (!collection || !style)
      throw new Error(`no collection or style for ${artwork.slug}`);
    return publicCatalogueRowSchema.parse({
      slug: artwork.slug,
      title: artwork.title,
      hook: artwork.hook,
      description: artwork.description,
      collection_slug: collection.slug,
      collection_name: collection.name,
      collection_intro: collection.intro,
      collection_sort_order: collection.sort_order,
      style_slug: style.slug,
      style_name: style.name,
      style_full_name: style.full_name,
      style_intro: style.intro,
      style_sort_order: style.sort_order,
      orientation: artwork.orientation,
      rooms: artwork.rooms,
      moods: artwork.moods,
      palettes: artwork.palettes,
      palette_hues: artwork.palette_hues,
      suggested_frame: artwork.suggested_frame,
      featured: artwork.featured,
      lead_time: artwork.lead_time,
      seo_title: artwork.seo_title,
      seo_description: artwork.seo_description,
      default_alt: artwork.default_alt,
      image_alt_text: artwork.image_alt_text,
      published_at: PUBLISHED_AT,
      variants: finishes.map((finish) => {
        const variant = plan.variants.find(
          (v) => v.variant_code === `${artwork.slug}:${finish.code}`,
        );
        if (!variant)
          throw new Error(`no ${finish.code} variant for ${artwork.slug}`);
        return {
          finish: variant.finish_code,
          finish_name: finish.name,
          variant_code: variant.variant_code,
          price_paise: Number(variant.price_paise),
          currency: variant.currency,
          availability: variant.availability,
          lead_time: variant.lead_time,
        };
      }),
      images: plan.images
        .filter((image) => image.slug === artwork.slug)
        .map((image) => ({
          slot: image.slot,
          size: image.size,
          path: image.object_path,
        }))
        .sort((a, b) => byText(a.slot, b.slot) || byText(a.size, b.size)),
    });
  });
}

/** A row with some columns changed, re-validated by the same schema. */
function changed(
  row: PublicCatalogueRow,
  changes: Partial<PublicCatalogueRow>,
): PublicCatalogueRow {
  return publicCatalogueRowSchema.parse({ ...row, ...changes });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

const ROWS = seededRows();
const row = (slug: string) => ROWS.find((r) => r.slug === slug)!;
const LANTERN_ROW = row(LANTERN.slug);
const WILLOW = row("willow-after-rain");

type Product = {
  slug: string;
  orientation: "Portrait" | "Landscape";
  rooms: string[];
  scale: { src: string };
  master?: unknown;
  roomImages?: unknown;
};
const PRODUCTS = JSON.parse(read("prototype/data/products.json")) as Product[];

/** The frozen page's rendered values, read with the generator's own markup (build-products.cjs). */
function frozen(slug: string) {
  const html = read(`prototype/pages/artworks/${slug}/index.html`);
  const one = (re: RegExp) => {
    const m = html.match(re);
    expect(m, `${slug}: ${re}`).not.toBeNull();
    return decode(m![1]!);
  };
  const all = (re: RegExp) => [...html.matchAll(re)].map((m) => m.slice(1));
  const story = html.match(
    /<p class="pd-story-lead">(.*?)<\/p>((?:<p>.*?<\/p>)+)<\/div>/,
  )!;
  return {
    title: one(/<title>(.*?)<\/title>/),
    description: one(/<meta name="description" content="([^"]*)">/),
    h1: one(/<h1>(.*?)<\/h1>/),
    hook: one(/<p class="pd-hook">(.*?)<\/p>/),
    price: one(/<strong id="product-price" aria-live="polite">(.*?)<\/strong>/),
    picker: all(/<input type="radio" name="frame" value="([^"]+)"/g).map(
      ([v]) => v!,
    ),
    pickerPrices: all(/<span class="pd-frame-price">([^<]+)<\/span>/g).map(
      ([v]) => v!,
    ),
    recommendation: one(/<p class="pd-recommendation">(.*?)<\/p>/),
    ratio: one(/style="--stage-ratio:([^"]+)"/),
    stage: html.match(
      /alt="([^"]*)" fetchpriority="high" decoding="async" id="stage-image" width="(\d+)" height="(\d+)"/,
    )!,
    thumbs: all(
      /data-view="(\w+)" data-fit="(\w+)"[^>]*><img[^>]*><span>([^<]+)<\/span>/g,
    ),
    roomAlt: one(
      /alt="([^"]*)" loading="lazy" decoding="async" id="room-image"/,
    ),
    roomCaption: one(/<figcaption id="room-caption">(.*?)<\/figcaption>/),
    roomIsPhoto: /pd-space__visual--room/.test(html),
    size: html.match(
      /<div class="pd-size"><strong>A2<\/strong><div><span>(.*?)<\/span><small>(.*?)<\/small>/,
    )!,
    wall: all(/aria-label="Enlarge: ([^"]+)"/g).map(([v]) => decode(v!)),
    craftAlt: one(
      /alt="([^"]*)" loading="lazy" decoding="async" id="craft-image"/,
    ),
    craftName: one(/<span id="craft-name">([^<]+)<\/span>/),
    lead: decode(story[1]!),
    paragraphs: [...story[2]!.matchAll(/<p>(.*?)<\/p>/g)].map((m) =>
      decode(m[1]!),
    ),
    styleName: one(/<h3 id="style-title">(.*?)<\/h3>/),
    styleIntro: one(/<h3 id="style-title">.*?<\/h3><p>(.*?)<\/p>/),
    palette: all(
      /<i style="background:([^"]+)" aria-hidden="true"><\/i><span>([^<]+)<\/span>/g,
    ).map(([colour, name]) => ({ name: decode(name!), colour: colour! })),
    meta: all(/<dt>([^<]+)<\/dt><dd>([^<]*)<\/dd>/g).map(([label, value]) => ({
      label: label!,
      value: decode(value!),
    })),
    seeAll: html.match(
      /<a class="text-link" href="[^"]*pages\/art-styles\/([^/]+)\/index\.html">(See all [^<]+)<\/a>/,
    )!,
    relatedEyebrow: one(
      /<span class="eyebrow">([^<]+)<\/span><h2 id="related-title">/,
    ),
    relatedHref: one(
      /<h2 id="related-title">.*?<a class="text-link" href="[^"]*pages\/collections\/([^/]+)\/index\.html">Open the collection<\/a>/,
    ),
    related: all(/<article class="art-card" data-product="([^"]+)"/g).map(
      ([v]) => v!,
    ),
  };
}

describe("src/content/public/product.ts — the route identities", () => {
  it("lists the 22 approved slugs: the manifest's /artworks aliases, in its order, once each", () => {
    const aliases = Object.keys(
      (
        JSON.parse(read("prototype/site-manifest.json")) as {
          aliases: Record<string, string>;
        }
      ).aliases,
    )
      .filter((route) => route.startsWith("/artworks/"))
      .map((route) => route.slice("/artworks/".length));
    expect(ARTWORK_ROUTES.map((r) => r.slug)).toEqual(aliases);
    expect(new Set(aliases).size).toBe(22);
    expect(ARTWORK_ROUTES.map((r) => r.slug)).toEqual(
      PRODUCTS.map((p) => p.slug),
    );
    expect(artworkStaticParams()).toEqual(
      ARTWORK_ROUTES.map(({ slug }) => ({ slug })),
    );
  });

  it("/product is the Lantern's page with the Lantern's canonical URL (the only product with a master)", () => {
    expect(PRODUCTS.filter((p) => p.master).map((p) => p.slug)).toEqual([
      LANTERN.slug,
    ]);
    const product = read("prototype/product/index.html");
    expect(product).toContain(
      `<link rel="canonical" href="../pages/artworks/${LANTERN.slug}/index.html">`,
    );
    expect(LANTERN.canonicalPath).toBe(artworkPath(LANTERN.slug));
    expect(LANTERN.compatibilityPath).toBe("/product");
  });

  it("an unknown slug is no approved route", () => {
    expect(artworkRoute("willow-after-rain")).toEqual({
      slug: "willow-after-rain",
    });
    for (const slug of [
      "",
      "Willow-After-Rain",
      "willow",
      "../shop",
      "product",
    ])
      expect(artworkRoute(slug)).toBeUndefined();
  });
});

describe("the size-guide sheet rule", () => {
  it("is products.json's `scale` for all 22: the sheet of the first room and the orientation", () => {
    for (const p of PRODUCTS) {
      const key = sizeGuideSheet(p.rooms[0]!, p.orientation);
      expect(key, p.slug).not.toBeNull();
      expect(`assets/product-references/${key}.webp`, p.slug).toBe(p.scale.src);
    }
  });

  it("a room and orientation without a sheet get none — never another room's", () => {
    expect(sizeGuideSheet("Living Room", "Landscape")).toBeNull();
    expect(sizeGuideSheet("Dining Room", "Portrait")).toBeNull();
    expect(sizeGuideSheet("Garage", "Portrait")).toBeNull();
    expect(
      Object.values(SIZE_GUIDE_SHEETS).flatMap((o) => Object.values(o)),
    ).toHaveLength(6);
  });
});

describe("splitStory — build-products.cjs:36–48, word for word", () => {
  it("splits the Lantern's description into its lead and four paragraphs", () => {
    expect(splitStory(LANTERN_ROW.description)).toEqual({
      lead: "The storm moves on; one lantern is still burning.",
      paragraphs: [
        "The gale has moved ahead of the ship. Rain still runs from the rigging, but the sea is beginning to flatten.",
        "Stand close and it keeps giving: eraser-lifted rain threads along the rigging, charcoal grain changing across soaked sailcloth, and a tiny gold pigment edge on the lantern cage.",
        "You receive an archival giclée print of an artwork in the charcoal-and-ink maritime tradition, on Hahnemühle Museum Etching 350 gsm paper at A2 (42 × 59.4 cm), with a handcrafted wooden frame in antique gold, black or white.",
        "It gives a study or office cabin quiet resolve, and makes a lasting retirement or farewell gift.",
      ],
    });
  });

  it("every approved description gives a lead and exactly four paragraphs, and loses no word", () => {
    for (const r of ROWS) {
      const story = splitStory(r.description);
      expect(story.paragraphs, r.slug).toHaveLength(4);
      expect([story.lead, ...story.paragraphs].join(" "), r.slug).toBe(
        r.description.trim().replace(/\s+/g, " "),
      );
    }
  });

  it("a description without the markers keeps every word: the first sentence, then the rest as one paragraph", () => {
    expect(splitStory("  One line. Then another! And more  ")).toEqual({
      lead: "One line.",
      paragraphs: ["Then another! And more"],
    });
    expect(splitStory("No full stop")).toEqual({
      lead: "No full stop",
      paragraphs: [],
    });
  });
});

describe("productView — all 22 artworks against their frozen pages", () => {
  it.each(ARTWORK_ROUTES.map((r) => r.slug))("%s", (slug) => {
    const page = frozen(slug);
    const view = productView(row(slug), ROWS);
    const suggested = view.finishes[view.suggestedFinish];

    expect(view.seo).toEqual({
      title: page.title,
      description: page.description,
    });
    expect(view.title).toBe(page.h1);
    expect(view.hook).toBe(page.hook);
    expect(suggested.price).toBe(page.price);
    expect(view.finishOrder).toEqual(page.picker);
    expect(view.finishOrder.map((f) => view.finishes[f].price)).toEqual(
      page.pickerPrices,
    );
    expect(view.recommendation).toBe(page.recommendation);
    expect(view.stage.ratio).toBe(page.ratio);
    expect(suggested.views[0]!.alt).toBe(decode(page.stage[1]!));
    expect([view.stage.width, view.stage.height]).toEqual([
      Number(page.stage[2]),
      Number(page.stage[3]),
    ]);
    expect(suggested.views.map((v) => [v.key, v.fit, v.label])).toEqual(
      page.thumbs,
    );
    expect(suggested.sizeGuide).toMatchObject({
      room: page.roomIsPhoto,
      alt: page.roomAlt,
      caption: page.roomCaption,
    });
    expect([view.dimensions.print, view.dimensions.detail]).toEqual([
      page.size[1],
      page.size[2],
    ]);
    expect(view.wall.map((t) => t.caption)).toEqual(page.wall);
    expect(view.wall.map((t) => t.enlargeLabel)).toEqual(
      page.wall.map((c) => `Enlarge: ${c}`),
    );
    expect(suggested.craft.alt).toBe(page.craftAlt);
    expect(suggested.name).toBe(page.craftName);
    expect(view.story).toEqual({
      lead: page.lead,
      paragraphs: page.paragraphs,
    });
    expect(view.style.name).toBe(page.styleName);
    expect(view.style.intro).toBe(page.styleIntro);
    expect(view.style.palette).toEqual(page.palette);
    expect(view.style.meta).toEqual(page.meta);
    expect(view.style.href).toBe(`/art-styles/${page.seeAll[1]}`);
    expect(view.style.seeAll).toBe(decode(page.seeAll[2]!));
    expect(view.related.eyebrow).toBe(page.relatedEyebrow);
    expect(view.related.href).toBe(`/collections/${page.relatedHref}`);
    // D-56: the projection's order, not the workbook's — the same three cards and the same first (same-style) card.
    const related = view.related.cards.map((c) => c.slug);
    expect([...related].sort()).toEqual([...page.related].sort());
    expect(related[0]).toBe(page.related[0]);
  });
});

describe("productView — finishes, variants and images", () => {
  const view = productView(WILLOW, ROWS);

  it("each finish is its own database variant, price and pictures", () => {
    const prices: Record<FinishCode, string> = {
      white: "₹19,000",
      black: "₹21,000",
      "antique-gold": "₹23,000",
    };
    for (const finish of FINISHES) {
      const option = view.finishes[finish];
      expect(option.variantCode).toBe(`willow-after-rain:${finish}`);
      expect(option.available).toBe(true);
      expect(option.price).toBe(prices[finish]);
      const [framed, closeup, paper, scale] = option.views;
      expect(framed!.image).toEqual({
        src: catalogueImage(WILLOW.slug, `frame-${finish}`, "1200"),
        srcSet: `${catalogueImage(WILLOW.slug, `frame-${finish}`, "480")} 480w, ${catalogueImage(WILLOW.slug, `frame-${finish}`, "1200")} 1200w`,
      });
      expect(closeup!.image).toEqual({
        src: catalogueImage(WILLOW.slug, `close-${finish}`, "1200"),
        srcSet: `${catalogueImage(WILLOW.slug, `close-${finish}`, "480")} 384w, ${catalogueImage(WILLOW.slug, `close-${finish}`, "1200")} 960w`,
      });
      expect(paper!.image.src).toBe(
        catalogueImage(WILLOW.slug, "paper", "1200"),
      );
      expect(scale!.image.src).toBe(
        siteImage("sizeguide-living-room-portrait", "1120"),
      );
      // The lightbox shows the largest Storage copy (H.1 #2).
      for (const v of option.views) expect(v.zoom).toBe(v.image.src);
      expect(framed!.caption).toBe(PRODUCT_VIEWS.framed.caption(option.name));
    }
    expect(view.finishes.black.swatch.src).toBe(
      siteImage("gen-01-craft-detail-black-frame", "1254"),
    );
    expect(view.finishes.white.craft.image.srcSet).toContain(
      siteImage("gen-01-craft-detail-white-frame", "160"),
    );
    expect(view.finishes["antique-gold"].craft.image.src).toBe(
      siteImage("gen-01-craft-detail-gold-frame", "1254"),
    );
  });

  it("the moodboard is finish-independent: the artwork, the suggested close-up, the paper, then White, Black, Antique Gold", () => {
    expect(view.wall.map((t) => t.zoom)).toEqual([
      catalogueImage(WILLOW.slug, "artwork", "full"),
      catalogueImage(WILLOW.slug, "close-antique-gold", "1200"),
      catalogueImage(WILLOW.slug, "paper", "1200"),
      ...FINISHES.map((f) => catalogueImage(WILLOW.slug, `frame-${f}`, "1200")),
    ]);
    expect(view.wall.map((t) => t.alt)).toEqual([
      "Willow After Rain",
      "Antique Gold frame detail",
      "Paper and print detail",
      "Willow After Rain in a White frame",
      "Willow After Rain in a Black frame",
      "Willow After Rain in a Antique Gold frame",
    ]);
    expect(view.wall.map((t) => t.large)).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it("the Lantern has the Artwork and In a room views and a room photo per finish as its size guide", () => {
    const lantern = productView(LANTERN_ROW, ROWS);
    for (const finish of FINISHES) {
      const option = lantern.finishes[finish];
      expect(option.views.map((v) => v.key)).toEqual([
        "framed",
        "closeup",
        "paper",
        "artwork",
        "room",
        "scale",
      ]);
      const room = siteImage(`lantern-room-${finish}`, "1122");
      expect(option.views[4]!.image.src).toBe(room);
      expect(option.views[3]!.image.src).toBe(
        siteImage("lantern-artwork-master", "1499"),
      );
      expect(option.sizeGuide).toEqual({
        room: true,
        image: { src: room, srcSet: null },
        width: 1122,
        height: 1402,
        alt: `The Lantern That Outlasted the Gale in a study & office — ${option.name} frame`,
        caption: `${option.name} frame · illustrative study & office setting.`,
        zoom: room,
      });
      expect(option.views[4]!.caption).toBe(
        `In a study & office · ${option.name} frame`,
      );
    }
    expect(productView(WILLOW, ROWS).finishes.black.views).toHaveLength(4);
  });

  it("an unavailable variant has no price line and is not available; the others keep theirs", () => {
    const r = changed(WILLOW, {
      variants: WILLOW.variants.map((v) =>
        v.finish === "black" ? { ...v, availability: "unavailable" } : v,
      ),
    });
    const v = productView(r, ROWS);
    expect(v.finishes.black).toMatchObject({ available: false, price: null });
    expect(v.finishes.white).toMatchObject({
      available: true,
      price: "₹19,000",
    });
  });

  it("prices come from the projection's paise, never from the content", () => {
    const r = changed(WILLOW, {
      variants: WILLOW.variants.map((v) =>
        v.finish === "white" ? { ...v, price_paise: BigInt(1234550) } : v,
      ),
    });
    expect(productView(r, ROWS).finishes.white.price).toBe("₹12,345.50");
  });

  it("the browser receives display values only: the model is plain JSON (no bigint, no row) and leaves its input unchanged", () => {
    const rows = deepFreeze(seededRows());
    const before = JSON.stringify(rows, (_, v: unknown) =>
      typeof v === "bigint" ? v.toString() : v,
    );
    const result: ProductView = productView(rows[3]!, rows);
    expect(() => JSON.stringify(result)).not.toThrow();
    expect(JSON.stringify(result)).not.toMatch(/price_paise|_paise|"images"/);
    expect(
      JSON.stringify(rows, (_, v: unknown) =>
        typeof v === "bigint" ? v.toString() : v,
      ),
    ).toBe(before);
  });
});

describe("the editorial rules", () => {
  it("the hook override applies to the closed window only (build-products.cjs:137)", () => {
    const blossom = row("the-blossom-over-the-closed-window");
    expect(heroHook(blossom)).toBe(
      "A quiet study of scarlet blossom against an aged architectural surface.",
    );
    expect(blossom.hook).toBe("Spring reaches the closed window first.");
    expect(splitStory(blossom.description).lead).toBe(blossom.hook);
    expect(heroHook(WILLOW)).toBe(WILLOW.hook);
  });

  it("a hue name without a colour gets the generator's fallback; at most four swatches", () => {
    expect(paletteSwatches(["Gold", "Unknown hue"])).toEqual([
      { name: "Gold", colour: "#b4934b" },
      { name: "Unknown hue", colour: PALETTE_FALLBACK },
    ]);
    expect(paletteSwatches(["a", "b", "c", "d", "e"])).toHaveLength(4);
  });

  it("the picker puts the suggested frame first, then black, antique gold, white", () => {
    expect(finishOrder("white")).toEqual(["white", "black", "antique-gold"]);
    expect(finishOrder("black")).toEqual(["black", "antique-gold", "white"]);
    expect(finishOrder("antique-gold")).toEqual([
      "antique-gold",
      "black",
      "white",
    ]);
  });

  it("an artwork without rooms falls back to the generator's Living Room", () => {
    const v = productView(changed(WILLOW, { rooms: [] }), ROWS);
    expect(v.finishes.white.sizeGuide?.caption).toBe(
      "Illustrative A2 portrait scale in a living room. The reference shows a plain A2 sheet, not this artwork.",
    );
    expect(v.style.meta[1]).toEqual({ label: "Suggested room", value: "" });
  });

  it("no sheet for the room and orientation: no scale view and no figure", () => {
    const v = productView(changed(WILLOW, { orientation: "Landscape" }), ROWS);
    expect(v.finishes.white.views.map((x) => x.key)).toEqual([
      "framed",
      "closeup",
      "paper",
    ]);
    expect(v.finishes.white.sizeGuide).toBeNull();
  });
});

describe("related artworks — only eligible public artworks of the same collection", () => {
  it("never the artwork itself; same style first; at most three; the projection's order otherwise", () => {
    const related = relatedRows(LANTERN_ROW, ROWS).map((r) => r.slug);
    expect(related).toEqual([
      "the-ship-between-two-storms",
      "the-galley-beyond-the-breakwater",
      "the-harbour-chain-opens",
    ]);
    for (const r of ROWS) {
      const own = relatedRows(r, ROWS);
      expect(own.length).toBeLessThanOrEqual(3);
      expect(own.map((x) => x.slug)).not.toContain(r.slug);
      for (const x of own) expect(x.collection_slug).toBe(r.collection_slug);
    }
  });

  it("an artwork the projection no longer returns (hidden, retired) is never linked", () => {
    const rows = ROWS.filter((r) => r.slug !== "the-ship-between-two-storms");
    const cards = productView(LANTERN_ROW, rows).related.cards;
    expect(cards.map((c) => c.slug)).not.toContain(
      "the-ship-between-two-storms",
    );
    expect(cards).toHaveLength(3);
    expect(productView(LANTERN_ROW, [LANTERN_ROW]).related.cards).toEqual([]);
    expect(productView(LANTERN_ROW, []).related.cards).toEqual([]);
  });

  it("the cards are the browse pages' cards (browseCard)", () => {
    const view = productView(WILLOW, ROWS);
    expect(view.related.cards).toEqual(
      relatedRows(WILLOW, ROWS).map(browseCard),
    );
  });
});

describe("artworkPageState — honest states for every approved route", () => {
  it("ok when the projection holds the artwork", () => {
    const state = artworkPageState(ROWS, "willow-after-rain");
    expect(state.status).toBe("ok");
    if (state.status === "ok")
      expect(state.product.canonicalPath).toBe("/artworks/willow-after-rain");
  });

  it("not_available when the projection answered without it (Production's empty catalogue, a hidden artwork)", () => {
    expect(artworkPageState([], "willow-after-rain")).toEqual({
      status: "not_available",
    });
    expect(
      artworkPageState(
        ROWS.filter((r) => r.slug !== "willow-after-rain"),
        "willow-after-rain",
      ),
    ).toEqual({ status: "not_available" });
    expect(ARTWORK_NOT_AVAILABLE.action.href).toBe("/shop");
  });

  it("unavailable when the catalogue could not be read at build", () => {
    expect(artworkPageState(null, "willow-after-rain")).toEqual({
      status: "unavailable",
    });
  });

  it("refuses a slug outside the approved routes", () => {
    expect(() => artworkPageState(ROWS, "not-an-artwork")).toThrow();
    expect(() => artworkPageState(null, "")).toThrow();
  });

  it("/product renders the Lantern with the Lantern's canonical URL", () => {
    const state = lanternPageState(ROWS);
    expect(state.status).toBe("ok");
    if (state.status === "ok") {
      expect(state.product.slug).toBe(LANTERN.slug);
      expect(state.product.canonicalPath).toBe(LANTERN.canonicalPath);
    }
    expect(lanternPageState([])).toEqual({ status: "not_available" });
  });
});
