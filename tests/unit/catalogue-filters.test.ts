import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  ART_CARD,
  COLLECTION_ROUTES,
  STYLE_ROUTES,
} from "@/content/public/browse";
import { CART_DRAWER, FOOTER_CTA, MENU_DRAWER } from "@/content/public/shell";
import {
  CATALOGUE_PAGE_PATHS,
  browseCard,
  collectionCards,
  collectionRoute,
  filterOptions,
  sortForDisplay,
  styleCards,
  styleRoute,
  type BrowseCard,
} from "@/lib/catalogue/browse-model";
import {
  EMPTY_FILTERS,
  FILTER_KEYS,
  SELECT_KEYS,
  activeFilters,
  filterUrl,
  matchesFilters,
  readFilterUrl,
  type FilterKey,
  type FilterOptions,
  type FilterValues,
  type SelectKey,
} from "@/lib/catalogue/filters";
import {
  publicCatalogueRowSchema,
  type PublicCatalogueRow,
} from "@/lib/schemas/catalogue";
import { catalogueImage } from "@/lib/site-images";
import { buildSeedPlan } from "../../scripts/testing/lib/catalogue.mjs";

/**
 * The S1.4 browse pages' filters (src/lib/catalogue/filters.ts) and their model (src/lib/catalogue/browse-model.ts),
 * hermetically, against the frozen prototype they port. The fixtures are the 22 seeded artworks as `public_catalogue`
 * returns them, built from the TEST seed plan and parsed by the reader's own schema. The oracles are the prototype's
 * own: its runtime lines (prototype/shared/browse.js — read the URL, filter, write the URL) run here on stand-ins
 * for the form, `location` and `history`, over the Shop's own data (prototype/data/catalogue.json), so every count,
 * alias and URL is compared with what the prototype computes, never with a transcription of it; the cards, options,
 * hubs and pictures are compared with the pages it generated. No browser, no network, no database.
 */

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (relative: string) =>
  readFileSync(path.join(ROOT, relative), "utf8");
/** The five entities the prototype's `esc` writes (build-browse.cjs:10), `&amp;` last. */
const decode = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
const sorted = (values: readonly string[]) => [...values].sort();
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/** Any origin: the page URLs below only lend `filterUrl` and the prototype an absolute address. */
const BASE = "https://aalishaan.test";

// The fixtures: the seeded catalogue as the projection returns it.

const plan = buildSeedPlan();
const PUBLISHED_AT = "2026-10-05T10:00:00+00:00";

/**
 * The 22 seeded artworks as `public_catalogue` returns them (supabase/migrations/0001_catalogue.sql, the view): the
 * artwork's columns; its collection's and style's slug, name, intro and sort order; its three variants in the
 * finishes' order, each with its finish name and the price as the JSON number PostgREST sends; its 15 images in the
 * view's (slot, size) order; one publication time. Each row is parsed by the reader's schema, so a fixture is typed
 * and shaped exactly like the reader's output (prices become bigint paise).
 */
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

/** A row with some columns changed, re-validated by the same schema: a row the reader could return. */
function changed(
  row: PublicCatalogueRow,
  changes: Partial<PublicCatalogueRow>,
): PublicCatalogueRow {
  return publicCatalogueRowSchema.parse({ ...row, ...changes });
}

/** Another artwork made from a row: a new slug and title, with variant codes and object paths to match. */
function another(
  row: PublicCatalogueRow,
  slug: string,
  title: string,
  changes: Partial<PublicCatalogueRow> = {},
): PublicCatalogueRow {
  return changed(row, {
    slug,
    title,
    variants: row.variants.map((v) => ({
      ...v,
      variant_code: `${slug}:${v.finish}`,
    })),
    images: row.images.map((image) => ({
      ...image,
      path: image.path.replace(`artworks/${row.slug}/`, `artworks/${slug}/`),
    })),
    ...changes,
  });
}

const ROWS = seededRows();
const SHOWN = sortForDisplay(ROWS);
const CARDS = SHOWN.map(browseCard);
const SHOP_OPTIONS = filterOptions(CARDS);

function rowOf(slug: string): PublicCatalogueRow {
  const row = ROWS.find((r) => r.slug === slug);
  if (!row) throw new Error(`no seeded row ${slug}`);
  return row;
}

/** The rows a collection or style page lists, in display order. */
const pageRows = (kind: "collection" | "style", slug: string) =>
  SHOWN.filter(
    (row) =>
      (kind === "collection" ? row.collection_slug : row.style_slug) === slug,
  );

/**
 * The public bucket's URL prefix as the image registry renders it: the project's Storage origin when this run's
 * environment holds the public URL, else the app's own (src/lib/site-images.ts).
 */
const BUCKET_URL = catalogueImage("x", "paper", "480").slice(
  0,
  -"artworks/x/paper-480.webp".length,
);
const objectUrl = (objectPath: string) => `${BUCKET_URL}${objectPath}`;

/** The E10 development baseline: the SHA-256 of every file of the prototype workspace (D-07). */
const BASELINE = (
  JSON.parse(read("prototype/data/development-baseline.json")) as {
    files: Record<string, string>;
  }
).files;

/** The SHA-256 of a prototype file, which the baseline must know. */
function baselineHash(file: string): string {
  const sha = BASELINE[file];
  if (!sha || !/^[0-9a-f]{64}$/.test(sha))
    throw new Error(`no baseline hash for ${file}`);
  return sha;
}

/** The seed manifest's entry for a catalogue object: the prototype file it is uploaded from, with that file's hash. */
function uploadOf(objectPath: string) {
  const entry = plan.images.find((image) => image.object_path === objectPath);
  if (!entry) throw new Error(`no seeded object ${objectPath}`);
  return entry;
}

// The pages the prototype generated (prototype/scripts/build-browse.cjs).

type PrototypeCard = {
  slug: string;
  title: string;
  hook: string;
  /** The price line's label, "<finish name> frame". */
  frame: string;
  price: string;
  alt: string;
  /** The picture's 1200 and 480 copies, as paths from the prototype root. */
  src: string;
  small: string;
};

/** The art cards of a generated listing page (build-browse.cjs:61; the <img> rewritten to the web copies at :97–100). */
function prototypeCards(relative: string): PrototypeCard[] {
  const html = read(relative);
  const dir = path.posix.dirname(relative.replace(/^prototype\//, ""));
  return [
    ...html.matchAll(
      /<article class="art-card" data-product="([^"]+)">([\s\S]*?)<\/article>/g,
    ),
  ].map(([, slug, body]) => {
    const image =
      /<img src="([^"]+)" srcset="(\S+) 480w, (\S+) 1200w"[^>]* alt="([^"]*)"/.exec(
        body,
      );
    const title = /<h3><a [^>]*>([^<]*)<\/a><\/h3>/.exec(body);
    const hook = /<p class="art-card__hook">([^<]*)<\/p>/.exec(body);
    const price =
      /<p class="art-card__price"><span>([^<]*)<\/span>([^<]*)<\/p>/.exec(body);
    if (!image || !title || !hook || !price)
      throw new Error(`unexpected card markup for ${slug} in ${relative}`);
    return {
      slug,
      title: decode(title[1]),
      hook: decode(hook[1]),
      frame: decode(price[1]),
      price: decode(price[2]),
      alt: decode(image[4]),
      src: path.posix.join(dir, image[1]),
      small: path.posix.join(dir, image[2]),
    };
  });
}

/** A generated listing page's six selects (build-browse.cjs:70): "All …" first with the empty value, then each value as its own text. */
function prototypeOptions(relative: string): FilterOptions {
  const html = read(relative);
  const selects = [
    ...html.matchAll(/<select name="([^"]+)">([\s\S]*?)<\/select>/g),
  ].map(([, name, body]) => {
    const options = [
      ...body.matchAll(/<option(?: value="([^"]*)")?>([^<]*)<\/option>/g),
    ];
    if (
      options[0]?.[1] !== "" ||
      options.slice(1).some((option) => option[1] !== undefined)
    )
      throw new Error(`unexpected options for ${name} in ${relative}`);
    return [name, options.slice(1).map((option) => decode(option[2]))] as const;
  });
  if (selects.map(([name]) => name).join() !== SELECT_KEYS.join())
    throw new Error(`unexpected selects in ${relative}`);
  const byName = new Map(selects);
  const list = (key: SelectKey) => byName.get(key) ?? [];
  return {
    collection: list("collection"),
    style: list("style"),
    rooms: list("rooms"),
    moods: list("moods"),
    palettes: list("palettes"),
    orientation: list("orientation"),
  };
}

type PrototypeHubCard = {
  slug: string;
  name: string;
  intro: string;
  src: string;
  small: string;
};

/** The cards of a generated hub (build-browse.cjs:80–81), in page order. */
function prototypeHub(relative: string, article: RegExp): PrototypeHubCard[] {
  const html = read(relative);
  const dir = path.posix.dirname(relative.replace(/^prototype\//, ""));
  return [...html.matchAll(article)].map(([, body]) => {
    const href =
      /href="[^"]*pages\/(?:collections|art-styles)\/([a-z0-9-]+)\/index\.html"/.exec(
        body,
      );
    const image = /<img src="([^"]+)" srcset="(\S+) 480w, (\S+) 1200w"/.exec(
      body,
    );
    const text = /<h2>([^<]*)<\/h2><p>([^<]*)<\/p>/.exec(body);
    if (!href || !image || !text)
      throw new Error(`unexpected hub markup in ${relative}`);
    return {
      slug: href[1],
      name: decode(text[1]),
      intro: decode(text[2]),
      src: path.posix.join(dir, image[1]),
      small: path.posix.join(dir, image[2]),
    };
  });
}

const SHOP_PAGE = "prototype/shop-all/index.html";
const SHOP_CARDS = prototypeCards(SHOP_PAGE);
const detailPage = (kind: "collection" | "style", slug: string) =>
  `prototype/pages/${kind === "collection" ? "collections" : "art-styles"}/${slug}/index.html`;

/** The Shop's `browse-data` (build-browse.cjs:40 writes it to prototype/data/catalogue.json): what browse.js filters. */
type PrototypeProduct = {
  slug: string;
  title: string;
  hook: string;
  collection: string;
  style: string;
  orientation: string;
  rooms: string[];
  moods: string[];
  palettes: string[];
};
const PRODUCTS = JSON.parse(
  read("prototype/data/catalogue.json"),
) as PrototypeProduct[];

// The prototype's own runtime lines (prototype/shared/browse.js), run on stand-ins for the DOM.

const BROWSE_JS = read("prototype/shared/browse.js")
  .split(/\r?\n/)
  .map((line) => line.trim());

/** A statement of browse.js exactly as the frozen file has it, found on its line by a pattern (group 1, else the match). */
function browseJs(line: number, pattern: RegExp): string {
  const match = pattern.exec(BROWSE_JS[line - 1] ?? "");
  if (!match)
    throw new Error(
      `prototype/shared/browse.js:${line} no longer matches ${pattern}`,
    );
  return match[1] ?? match[0];
}

const KEYS = browseJs(5, /^const keys=\[[^\]]+\];$/);
const NORMALIZE = browseJs(
  6,
  /^const normalize=s=>String\(s\)\.toLowerCase\(\)\.trim\(\);$/,
);
const READ_URL = browseJs(8, /^function readURL\(\)\{.+\}$/);
const FILTERS = browseJs(
  10,
  /(const filters=Object\.fromEntries\(keys\.map\(k=>\[k,form\.elements\[k\]\.value\]\)\);)/,
);
const SHOW = browseJs(11, /const show=(.+?);card\.hidden=!show;/);
const CHIP_LOOP = browseJs(
  15,
  /^(for\(const \[k,v\] of Object\.entries\(filters\)\)\{if\(!v\)continue;)/,
);
const WRITE = browseJs(16, /^if\(write\)\{(.+)\}$/);

/** `new Option(text, value)`, as browse.js:8 adds an option for a value its select does not list. */
class PrototypeOption {
  text: string;
  value: string;
  constructor(text: string, value: string) {
    this.text = text;
    this.value = value;
  }
}

/**
 * A `<select>` as browse.js uses one: its options (build-browse.cjs:70 — "All …" first with the empty value, then
 * one per value, its text as its value), `value` — the selected option's, "" when none is — and `add`.
 */
class PrototypeSelect {
  readonly tagName = "SELECT";
  readonly options: Array<{ value: string }>;
  private selected = 0;
  constructor(values: readonly string[]) {
    this.options = [{ value: "" }, ...values.map((value) => ({ value }))];
  }
  get value(): string {
    return this.options[this.selected]?.value ?? "";
  }
  set value(value: string) {
    // A value no option has selects none, and the select's value is then the empty string (HTML).
    this.selected = this.options.findIndex((option) => option.value === value);
  }
  add(option: { value: string }): void {
    this.options.push(option);
  }
}

type PrototypeForm = { elements: Record<string, { value: string }> };

const runReadUrl = new Function(
  "form",
  "location",
  "Option",
  `${KEYS}${NORMALIZE}let savedOnly=false;${READ_URL}readURL();return savedOnly;`,
) as (
  form: PrototypeForm,
  location: { search: string },
  Option: typeof PrototypeOption,
) => boolean;

const runShow = new Function(
  "p",
  "filters",
  "savedOnly",
  "saved",
  `${KEYS}${NORMALIZE}return ${SHOW};`,
) as (
  p: PrototypeProduct,
  filters: FilterValues,
  savedOnly: boolean,
  saved: boolean,
) => boolean;

const runFilters = new Function("form", `${KEYS}${FILTERS}return filters;`) as (
  form: PrototypeForm,
) => Record<string, string>;

const runWrite = new Function(
  "form",
  "location",
  "history",
  "savedOnly",
  `${KEYS}${FILTERS}${WRITE}`,
) as (
  form: PrototypeForm,
  location: { href: string },
  history: { replaceState(state: null, unused: string, url: URL): void },
  savedOnly: boolean,
) => void;

/** The form browse.js:10 reads its filters from, holding these values. */
const formOf = (values: FilterValues): PrototypeForm => ({
  elements: Object.fromEntries(
    FILTER_KEYS.map((key) => [key, { value: values[key] }]),
  ),
});

type Reading = {
  values: FilterValues;
  savedOnly: boolean;
  /** Per select, the options the prototype adds for a value it does not list. */
  added: Partial<Record<SelectKey, string[]>>;
};

/** What browse.js:8 reads from a URL on a page with these options. */
function prototypeRead(search: string, options: FilterOptions): Reading {
  const q = { tagName: "INPUT", value: "" };
  const selects = SELECT_KEYS.map(
    (key) => [key, new PrototypeSelect(options[key])] as const,
  );
  const savedOnly = runReadUrl(
    { elements: { q, ...Object.fromEntries(selects) } },
    { search },
    PrototypeOption,
  );
  const values: Record<FilterKey, string> = { ...EMPTY_FILTERS, q: q.value };
  const added: Partial<Record<SelectKey, string[]>> = {};
  for (const [key, select] of selects) {
    values[key] = select.value;
    const extra = select.options
      .slice(options[key].length + 1)
      .map((option) => option.value);
    if (extra.length > 0) added[key] = extra;
  }
  return { values, savedOnly, added };
}

/** The port's reading in the same terms: an unlisted value is the one option the prototype would add. */
function portRead(search: string, options: FilterOptions): Reading {
  const reading = readFilterUrl(search, options);
  return {
    values: reading.values,
    savedOnly: reading.savedOnly,
    added: Object.fromEntries(
      Object.entries(reading.unlisted).map(([key, value]) => [key, [value]]),
    ),
  };
}

/** The path browse.js:16 writes (`history.replaceState`) for a page URL and a filter state. */
function prototypeUrl(
  href: string,
  values: FilterValues,
  savedOnly: boolean,
): string {
  const written: URL[] = [];
  runWrite(
    formOf(values),
    { href },
    {
      replaceState: (_state, _unused, url) => {
        written.push(url);
      },
    },
    savedOnly,
  );
  if (written.length !== 1)
    throw new Error("browse.js did not write exactly one URL");
  return `${written[0].pathname}${written[0].search}${written[0].hash}`;
}

type Picked = Partial<Record<FilterKey, string>>;

/** The artworks browse.js:11 shows on Shop All for a filter state; `saved` stands in for each card's pressed heart. */
const theirs = (
  values: Picked,
  savedOnly = false,
  saved: ReadonlySet<string> = new Set<string>(),
) =>
  sorted(
    PRODUCTS.filter((p) =>
      runShow(p, { ...EMPTY_FILTERS, ...values }, savedOnly, saved.has(p.slug)),
    ).map((p) => p.slug),
  );

/** The artworks the port shows among the given cards (Shop All's by default) for the same state. */
const ours = (
  values: Picked,
  savedOnly = false,
  saved: ReadonlySet<string> = new Set<string>(),
  cards: readonly BrowseCard[] = CARDS,
) =>
  sorted(
    cards
      .filter((card) =>
        matchesFilters(card, { ...EMPTY_FILTERS, ...values }, savedOnly, saved),
      )
      .map((card) => card.slug),
  );

/** The prototype's counts on Shop All (browse.js:11 over prototype/data/catalogue.json); the tests below recompute each. */
const FACET_ORACLE: Record<SelectKey, Record<string, number>> = {
  collection: {
    "Blossoms in Ink": 8,
    "Painted in Gold": 4,
    "The Age of Sail": 10,
  },
  style: {
    "Corsair Chronicles": 2,
    "Four Gentlemen": 2,
    "Ghostly Armada": 2,
    "Gilded Peaks": 2,
    "Hand-Printed Ukiyo-e": 2,
    "Marquetry Voyage": 2,
    "Moonlit Blossom": 2,
    "Mythic Voyage": 2,
    "Neo-Classical Fantasy": 2,
    "Rinpa Moon": 2,
    "Scarlet Blossom": 2,
  },
  rooms: {
    Bedroom: 7,
    "Dining Room": 1,
    "Living Room": 4,
    "Study & Office": 10,
  },
  moods: {
    Bold: 6,
    Calm: 3,
    "Full of wonder": 3,
    Grounded: 4,
    Nostalgic: 3,
    Warm: 3,
  },
  palettes: {
    "Blues & Indigo": 12,
    "Earth & Terracotta": 2,
    "Gold & Gilded": 8,
    "Greens & Teals": 2,
    "Ink & Monochrome": 10,
    "Jewel & Deep Tones": 2,
    "Reds & Blush": 4,
    "Sepia & Cream": 2,
  },
  orientation: { Landscape: 10, Portrait: 12 },
};
const SEARCH_ORACLE: ReadonlyArray<readonly [string, number]> = [
  ["Lantern", 1],
  ["moon", 5],
  ["gold", 4],
  ["sail", 10],
  ["ukiyo-e", 2],
  ["ukiyo e", 0],
  ["bedroom", 0],
  ["giclée", 0],
  ["mist", 1],
  ["stone Painted", 0],
  ["nothing-matches-this", 0],
];
const COMBINATION_ORACLE: ReadonlyArray<readonly [Picked, string[]]> = [
  [
    { collection: "Painted in Gold", moods: "Bold" },
    ["the-moon-between-two-peaks", "the-pine-that-holds-the-moon"],
  ],
  [
    { rooms: "Bedroom", orientation: "Landscape" },
    ["the-bridge-under-falling-blossom"],
  ],
  [
    { rooms: "Study & Office", palettes: "Gold & Gilded" },
    [
      "the-copper-citadel-at-the-sea-gate",
      "the-galley-beyond-the-breakwater",
      "the-harbour-chain-opens",
      "the-palace-above-the-dry-dock",
    ],
  ],
  [{ collection: "The Age of Sail", rooms: "Bedroom" }, []],
];

/** Every filter set: the prototype's full URL example plus a style and a room. */
const FULL: FilterValues = {
  q: "blue bridge",
  collection: "Painted in Gold",
  style: "Gilded Peaks",
  rooms: "Living Room",
  moods: "Full of wonder",
  palettes: "Gold & Gilded",
  orientation: "Portrait",
};

describe("readFilterUrl — the filters a URL asks for (browse.js:8 readURL)", () => {
  it("reads every key, and `saved=1` as the Saved view", () => {
    const reading = readFilterUrl(
      "?q=blue+bridge&collection=Painted+in+Gold&style=Gilded+Peaks&rooms=Living+Room&moods=Full+of+wonder&palettes=Gold+%26+Gilded&orientation=Portrait&saved=1",
      SHOP_OPTIONS,
    );
    expect(reading).toEqual({ values: FULL, savedOnly: true, unlisted: {} });
    expect(
      ours(
        reading.values,
        true,
        new Set(["the-bridge-of-blue-stone", "the-moon-between-two-peaks"]),
      ),
    ).toEqual(["the-bridge-of-blue-stone"]);
    for (const empty of ["", "?"])
      expect(readFilterUrl(empty, SHOP_OPTIONS)).toEqual({
        values: EMPTY_FILTERS,
        savedOnly: false,
        unlisted: {},
      });
  });

  it("reads the legacy singulars room, mood and palette only when the plural is absent or empty — no other key has one", () => {
    const value = (search: string, key: SelectKey) =>
      readFilterUrl(search, SHOP_OPTIONS).values[key];
    expect(value("?room=Bedroom", "rooms")).toBe("Bedroom");
    expect(value("?rooms=&room=Bedroom", "rooms")).toBe("Bedroom");
    expect(value("?rooms=Dining%20Room&room=Bedroom", "rooms")).toBe(
      "Dining Room",
    );
    expect(value("?room=Bedroom&rooms=Dining%20Room", "rooms")).toBe(
      "Dining Room",
    );
    expect(value("?mood=Calm", "moods")).toBe("Calm");
    expect(value("?moods=Bold&mood=Calm", "moods")).toBe("Bold");
    expect(value("?palette=Sepia%20%26%20Cream", "palettes")).toBe(
      "Sepia & Cream",
    );
    expect(value("?palettes=&palette=Sepia%20%26%20Cream", "palettes")).toBe(
      "Sepia & Cream",
    );
    expect(
      readFilterUrl(
        "?collections=Painted%20in%20Gold&styles=Rinpa%20Moon&orientations=Portrait&query=moon&search=moon",
        SHOP_OPTIONS,
      ),
    ).toEqual({ values: EMPTY_FILTERS, savedOnly: false, unlisted: {} });
  });

  it("turns a room that is exactly “study” or “office” (any case, spaces around) into Study & Office, and nothing else", () => {
    for (const search of [
      "?room=Study",
      "?room=office",
      "?room=%20STUDY%20",
      "?rooms=Office",
      "?rooms=study+%26+office",
    ])
      expect(readFilterUrl(search, SHOP_OPTIONS), search).toEqual({
        values: { ...EMPTY_FILTERS, rooms: "Study & Office" },
        savedOnly: false,
        unlisted: {},
      });
    for (const [search, value] of [
      ["?rooms=Study%20and%20Office", "Study and Office"],
      ["?rooms=study-office", "study-office"],
      ["?rooms=studio", "studio"],
    ])
      expect(readFilterUrl(search, SHOP_OPTIONS).unlisted, search).toEqual({
        rooms: value,
      });
    // The rule is the Room select's only.
    expect(readFilterUrl("?moods=study", SHOP_OPTIONS)).toEqual({
      values: { ...EMPTY_FILTERS, moods: "study" },
      savedOnly: false,
      unlisted: { moods: "study" },
    });
  });

  it("matches a select value to its option ignoring case and surrounding spaces, and takes the option's own text", () => {
    const cases: ReadonlyArray<readonly [string, SelectKey, string]> = [
      ["?room=Living%20room", "rooms", "Living Room"],
      ["?room=Living+room", "rooms", "Living Room"],
      ["?room=Dining%20room", "rooms", "Dining Room"],
      ["?mood=calm", "moods", "Calm"],
      ["?moods=FULL%20OF%20WONDER", "moods", "Full of wonder"],
      ["?palette=gold%20%26%20gilded", "palettes", "Gold & Gilded"],
      ["?orientation=landscape", "orientation", "Landscape"],
      [
        "?collection=%20painted%20IN%20gold%20",
        "collection",
        "Painted in Gold",
      ],
      ["?style=hand-printed%20ukiyo-E", "style", "Hand-Printed Ukiyo-e"],
    ];
    for (const [search, key, option] of cases)
      expect(readFilterUrl(search, SHOP_OPTIONS), search).toEqual({
        values: { ...EMPTY_FILTERS, [key]: option },
        savedOnly: false,
        unlisted: {},
      });
  });

  it("keeps a value the page does not list as given, reports it as unlisted, and it matches nothing", () => {
    const cases: ReadonlyArray<readonly [string, SelectKey, string]> = [
      // A slug is not a name; a comma is not a list; an unencoded & ends the value.
      ["?collection=painted-in-gold", "collection", "painted-in-gold"],
      ["?rooms=Bedroom,Dining%20Room", "rooms", "Bedroom,Dining Room"],
      ["?palette=Gold+&+Gilded", "palettes", "Gold "],
      ["?style=Rinpa%20Moonlight", "style", "Rinpa Moonlight"],
      ["?orientation=Square", "orientation", "Square"],
      // Untrusted text stays text: it is rendered only through React's escaping.
      ["?collection=%3Cb%3EGold%3C%2Fb%3E", "collection", "<b>Gold</b>"],
    ];
    for (const [search, key, value] of cases) {
      const reading = readFilterUrl(search, SHOP_OPTIONS);
      expect(reading, search).toEqual({
        values: { ...EMPTY_FILTERS, [key]: value },
        savedOnly: false,
        unlisted: { [key]: value },
      });
      expect(ours(reading.values), search).toEqual([]);
    }
    // A page lists only its own artworks' values: on Painted in Gold the footer's Study link is unlisted.
    const gold = filterOptions(
      pageRows("collection", "painted-in-gold").map(browseCard),
    );
    expect(readFilterUrl("?room=Study", gold)).toEqual({
      values: { ...EMPTY_FILTERS, rooms: "Study & Office" },
      savedOnly: false,
      unlisted: { rooms: "Study & Office" },
    });
  });

  it("keeps the search exactly as given — not trimmed, never unlisted", () => {
    expect(readFilterUrl("?q=%20Lantern%20", SHOP_OPTIONS)).toEqual({
      values: { ...EMPTY_FILTERS, q: " Lantern " },
      savedOnly: false,
      unlisted: {},
    });
    expect(
      readFilterUrl("?q=nothing-matches-this", SHOP_OPTIONS).unlisted,
    ).toEqual({});
    expect(ours({ q: " Lantern " })).toEqual([
      "the-lantern-that-outlasted-the-gale",
    ]);
  });

  it("opens the Saved view for exactly `saved=1` and nothing else", () => {
    const savedOnly = (search: string) =>
      readFilterUrl(search, SHOP_OPTIONS).savedOnly;
    expect(savedOnly("?saved=1")).toBe(true);
    expect(savedOnly("?saved=1&saved=0")).toBe(true);
    for (const off of [
      "",
      "?saved=true",
      "?saved=0",
      "?saved=",
      "?saved=01",
      "?saved=%201",
      "?saved=yes",
      "?Saved=1",
      "?saved=0&saved=1",
    ])
      expect(savedOnly(off), off).toBe(false);
  });

  it("takes the first value of a repeated parameter", () => {
    expect(
      readFilterUrl("?rooms=Bedroom&rooms=Dining%20Room", SHOP_OPTIONS).values
        .rooms,
    ).toBe("Bedroom");
    expect(readFilterUrl("?q=moon&q=sail", SHOP_OPTIONS).values.q).toBe("moon");
    expect(
      readFilterUrl(
        "?collection=The+Age+of+Sail&collection=Painted+in+Gold",
        SHOP_OPTIONS,
      ).values.collection,
    ).toBe("The Age of Sail");
  });

  it("does not port the prototype's `params.get(undefined)` quirk: a parameter named “undefined” sets nothing", () => {
    // browse.js:8 looks a key without a singular up as `params.get({…}[key])`, which is `params.get(undefined)`: a
    // parameter named "undefined" fills the search, the collection, the style and the orientation.
    expect(prototypeRead("?undefined=Bedroom", SHOP_OPTIONS)).toEqual({
      values: {
        ...EMPTY_FILTERS,
        q: "Bedroom",
        collection: "Bedroom",
        style: "Bedroom",
        orientation: "Bedroom",
      },
      savedOnly: false,
      added: {
        collection: ["Bedroom"],
        style: ["Bedroom"],
        orientation: ["Bedroom"],
      },
    });
    expect(readFilterUrl("?undefined=Bedroom", SHOP_OPTIONS)).toEqual({
      values: EMPTY_FILTERS,
      savedOnly: false,
      unlisted: {},
    });
  });

  it("resolves the shell's four “Shop by room” links to Room options with the prototype's counts 4 / 7 / 1 / 10, and its Saved links to the Saved view", () => {
    const expected: Record<string, readonly [string, number]> = {
      "Living room": ["Living Room", 4],
      Bedroom: ["Bedroom", 7],
      "Dining room": ["Dining Room", 1],
      "Study & office": ["Study & Office", 10],
    };
    expect(FOOTER_CTA.rooms.map((link) => link.label)).toEqual(
      Object.keys(expected),
    );
    for (const link of FOOTER_CTA.rooms) {
      const reading = readFilterUrl(
        new URL(link.href, BASE).search,
        SHOP_OPTIONS,
      );
      const [option, count] = expected[link.label];
      expect(reading, link.href).toEqual({
        values: { ...EMPTY_FILTERS, rooms: option },
        savedOnly: false,
        unlisted: {},
      });
      expect(SHOP_OPTIONS.rooms).toContain(option);
      expect(ours(reading.values), link.href).toHaveLength(count);
      expect(ours(reading.values), link.href).toEqual(theirs(reading.values));
    }
    const savedLinks = [
      MENU_DRAWER.items.find((item) => item.label === "Saved artworks")?.href,
      CART_DRAWER.footerAction.href,
    ];
    for (const href of savedLinks) {
      expect(href).toBe("/shop?saved=1#artworks");
      expect(
        readFilterUrl(new URL(href ?? "", BASE).search, SHOP_OPTIONS),
      ).toEqual({ values: EMPTY_FILTERS, savedOnly: true, unlisted: {} });
    }
  });

  it("reads every URL exactly as the prototype's own readURL does, on Shop All and on a detail page", () => {
    const searches = [
      "",
      "?",
      "?room=Bedroom",
      "?rooms=&room=Bedroom",
      "?rooms=Dining%20Room&room=Bedroom",
      "?room=Study",
      "?room=office",
      "?room=%20STUDY%20",
      "?rooms=study+%26+office",
      "?rooms=Study%20and%20Office",
      "?room=Living%20room",
      "?room=Living+room",
      "?room=Dining%20room",
      "?mood=calm",
      "?moods=CALM&mood=Bold",
      "?palette=gold%20%26%20gilded",
      "?palette=Gold+&+Gilded",
      "?palettes=Ink%20%26%20Monochrome&palette=Gold%20%26%20Gilded",
      "?orientation=landscape",
      "?collection=painted-in-gold",
      "?collection=Painted%20in%20Gold",
      "?style=hand-printed%20ukiyo-e",
      "?rooms=Bedroom&rooms=Dining%20Room",
      "?rooms=Bedroom,Dining%20Room",
      "?q=%20Lantern%20",
      "?q=moon&saved=1",
      "?saved=true",
      "?saved=0&saved=1",
      "?saved=1&saved=0",
      "?moods=study",
      "?rooms=Garage",
      "?collection=%3Cb%3EGold%3C%2Fb%3E",
      "?utm_source=x&room=Bedroom&restore=1",
      "?q=blue+bridge&collection=Painted+in+Gold&moods=Full+of+wonder&palettes=Gold+%26+Gilded&orientation=Portrait&saved=1",
      ...FOOTER_CTA.rooms.map((link) => new URL(link.href, BASE).search),
    ];
    const gold = filterOptions(
      pageRows("collection", "painted-in-gold").map(browseCard),
    );
    const disagreements: string[] = [];
    for (const options of [SHOP_OPTIONS, gold])
      for (const search of searches) {
        const port = portRead(search, options);
        const prototype = prototypeRead(search, options);
        if (JSON.stringify(port) !== JSON.stringify(prototype))
          disagreements.push(
            `${search}: ${JSON.stringify(port)} ≠ ${JSON.stringify(prototype)}`,
          );
      }
    expect(disagreements).toEqual([]);
  });

  // A select value of spaces only: the prototype's first option, "All …", has the empty value, which the trimmed value
  // equals, so the prototype selects it — no filter, no chip, no added option.
  const SPACES_ONLY = ["?rooms=%20", "?collection=+++", "?orientation=%C2%A0"];

  it("the prototype itself reads a select value of spaces only as its “All …” option (the control for the next case)", () => {
    for (const search of SPACES_ONLY)
      expect(prototypeRead(search, SHOP_OPTIONS), search).toEqual({
        values: EMPTY_FILTERS,
        savedOnly: false,
        added: {},
      });
  });

  // Found by this suite at S1.4 and fixed the same day: readFilterUrl first matched the page's values only, without the
  // empty "All …" option, so it kept such a value as an unlisted filter that matched nothing (zero results, a blank
  // chip, a blank extra option).
  it("reads a select value of spaces only as no filter, as the prototype does", () => {
    for (const search of SPACES_ONLY)
      expect(readFilterUrl(search, SHOP_OPTIONS), search).toEqual({
        values: EMPTY_FILTERS,
        savedOnly: false,
        unlisted: {},
      });
  });
});

describe("filterUrl — the URL a change writes (browse.js:16)", () => {
  it("writes the prototype's own examples", () => {
    expect(
      filterUrl(
        `${BASE}/shop?room=Study#artworks`,
        { ...EMPTY_FILTERS, rooms: "Study & Office" },
        false,
      ),
    ).toBe("/shop?rooms=Study+%26+Office#artworks");
    expect(
      filterUrl(
        `${BASE}/shop#artworks`,
        { ...FULL, style: "", rooms: "" },
        true,
      ),
    ).toBe(
      "/shop?q=blue+bridge&collection=Painted+in+Gold&moods=Full+of+wonder&palettes=Gold+%26+Gilded&orientation=Portrait&saved=1#artworks",
    );
    expect(
      filterUrl(
        `${BASE}/shop?utm_source=x&room=Bedroom&restore=1`,
        EMPTY_FILTERS,
        false,
      ),
    ).toBe("/shop?utm_source=x");
  });

  it("removes every filter name, the three singulars, `saved` and `restore`, and keeps every other parameter and the fragment", () => {
    const href = `${BASE}/shop?q=old&collection=a&keep=1&style=b&rooms=c&moods=d&palettes=e&orientation=f&saved=1&room=g&room=h&mood=i&palette=j&restore=1&also=2#top`;
    expect(filterUrl(href, EMPTY_FILTERS, false)).toBe(
      "/shop?keep=1&also=2#top",
    );
    expect(filterUrl(`${BASE}/shop?saved=1`, EMPTY_FILTERS, false)).toBe(
      "/shop",
    );
  });

  it("sets the non-empty filters in the form's order, after the parameters it keeps, and `saved=1` last", () => {
    const reversed = Object.fromEntries(
      [...FILTER_KEYS].reverse().map((key) => [key, EMPTY_FILTERS[key]]),
    ) as Record<FilterKey, string>;
    reversed.orientation = "Portrait";
    reversed.collection = "Painted in Gold";
    reversed.q = "moon";
    expect(
      filterUrl(`${BASE}/shop?a=1&rooms=Bedroom&b=2`, reversed, true),
    ).toBe(
      "/shop?a=1&b=2&q=moon&collection=Painted+in+Gold&orientation=Portrait&saved=1",
    );
  });

  it("encodes as URLSearchParams does: a space as +, and &, = and + escaped; the search exactly as typed", () => {
    expect(
      filterUrl(`${BASE}/shop`, { ...EMPTY_FILTERS, q: " a&b=c+d " }, false),
    ).toBe("/shop?q=+a%26b%3Dc%2Bd+");
    expect(
      filterUrl(
        `${BASE}/shop`,
        { ...EMPTY_FILTERS, palettes: "Gold & Gilded" },
        false,
      ),
    ).toBe("/shop?palettes=Gold+%26+Gilded");
  });

  it("returns a same-origin path for history.replaceState — on a detail page too", () => {
    const written = filterUrl(
      `${BASE}/collections/painted-in-gold?moods=Bold#artworks`,
      { ...EMPTY_FILTERS, moods: "Calm" },
      false,
    );
    expect(written).toBe("/collections/painted-in-gold?moods=Calm#artworks");
    expect(written.startsWith("/")).toBe(true);
    expect(written).not.toContain(BASE);
  });

  it("writes exactly the path the prototype's own lines write, for every page URL, filter state and view", () => {
    const hrefs = [
      `${BASE}/shop`,
      `${BASE}/shop?room=Study#artworks`,
      `${BASE}/shop?utm_source=x&room=Bedroom&restore=1`,
      `${BASE}/shop?q=old&collection=a&keep=1&saved=1&room=g&mood=i&palette=j&restore=1#top`,
      `${BASE}/shop?a=1&rooms=Bedroom&b=2`,
      `${BASE}/shop?keep=a%20b&x=1+2`,
      `${BASE}/shop?#artworks`,
      `${BASE}/collections/painted-in-gold?moods=Bold`,
      `${BASE}/art-styles/rinpa-moon?saved=1#artworks`,
    ];
    const states: FilterValues[] = [
      EMPTY_FILTERS,
      FULL,
      { ...EMPTY_FILTERS, rooms: "Study & Office" },
      { ...EMPTY_FILTERS, q: " a&b=c+d " },
      {
        ...EMPTY_FILTERS,
        orientation: "Portrait",
        collection: "Painted in Gold",
      },
      { ...EMPTY_FILTERS, style: "<b>Gold</b>", palettes: "Gold " },
    ];
    const disagreements: string[] = [];
    for (const href of hrefs)
      for (const values of states)
        for (const savedOnly of [false, true]) {
          const port = filterUrl(href, values, savedOnly);
          const prototype = prototypeUrl(href, values, savedOnly);
          if (port !== prototype)
            disagreements.push(
              `${href} ${JSON.stringify(values)} ${savedOnly}: ${port} ≠ ${prototype}`,
            );
        }
    expect(disagreements).toEqual([]);
  });

  it("round-trips: what it writes reads back as the same filters and view", () => {
    const states: FilterValues[] = [
      EMPTY_FILTERS,
      FULL,
      ...SELECT_KEYS.flatMap((key) =>
        SHOP_OPTIONS[key].map((value) => ({ ...EMPTY_FILTERS, [key]: value })),
      ),
      ...SEARCH_ORACLE.map(([q]) => ({ ...EMPTY_FILTERS, q })),
      ...COMBINATION_ORACLE.map(([values]) => ({
        ...EMPTY_FILTERS,
        ...values,
      })),
    ];
    for (const values of states)
      for (const savedOnly of [false, true]) {
        const href = `${BASE}/shop?room=Bedroom&utm_source=x#artworks`;
        const written = new URL(filterUrl(href, values, savedOnly), href);
        expect(
          readFilterUrl(written.search, SHOP_OPTIONS),
          written.search,
        ).toEqual({ values, savedOnly, unlisted: {} });
        expect(written.searchParams.get("utm_source")).toBe("x");
      }
  });
});

describe("matchesFilters — browse.js:11 over the 22 seeded artworks", () => {
  it("filters the very data the prototype filters: each seeded card carries its browse-data fields unchanged", () => {
    expect(sorted(CARDS.map((card) => card.slug))).toEqual(
      sorted(PRODUCTS.map((p) => p.slug)),
    );
    for (const p of PRODUCTS) {
      const card = CARDS.find((c) => c.slug === p.slug);
      expect(
        card && {
          title: card.title,
          hook: card.hook,
          collection: card.collection,
          style: card.style,
          orientation: card.orientation,
          rooms: card.rooms,
          moods: card.moods,
          palettes: card.palettes,
        },
        p.slug,
      ).toEqual({
        title: p.title,
        hook: p.hook,
        collection: p.collection,
        style: p.style,
        orientation: p.orientation,
        rooms: p.rooms,
        moods: p.moods,
        palettes: p.palettes,
      });
    }
  });

  it("shows, for every value of every facet, exactly the artworks the prototype shows, in the counts of its oracle", () => {
    for (const key of SELECT_KEYS) {
      expect(Object.keys(FACET_ORACLE[key]).sort(), key).toEqual([
        ...SHOP_OPTIONS[key],
      ]);
      for (const value of SHOP_OPTIONS[key]) {
        const label = `${key}=${value}`;
        expect(ours({ [key]: value }), label).toEqual(theirs({ [key]: value }));
        expect(ours({ [key]: value }), label).toHaveLength(
          FACET_ORACLE[key][value],
        );
      }
    }
  });

  it("searches the title, hook, collection and style as one case-insensitive substring — the prototype's search oracles", () => {
    for (const [q, count] of SEARCH_ORACLE) {
      expect(ours({ q }), q).toEqual(theirs({ q }));
      expect(ours({ q }), q).toHaveLength(count);
    }
    expect(ours({ q: "Lantern" })).toEqual([
      "the-lantern-that-outlasted-the-gale",
    ]);
    expect(ours({})).toHaveLength(22);
  });

  it("combines the filters with AND — the prototype's combination oracles", () => {
    for (const [values, slugs] of COMBINATION_ORACLE) {
      const label = JSON.stringify(values);
      expect(ours(values), label).toEqual(theirs(values));
      expect(ours(values), label).toEqual(sorted(slugs));
    }
  });

  it("agrees with the prototype on every pair of facet values and on every word, title and hook a search can meet", () => {
    const disagreements: string[] = [];
    const compare = (values: Picked) => {
      const port = ours(values);
      const prototype = theirs(values);
      if (port.join() !== prototype.join())
        disagreements.push(
          `${JSON.stringify(values)}: ${port.length} ≠ ${prototype.length}`,
        );
    };
    for (const [i, first] of SELECT_KEYS.entries())
      for (const second of SELECT_KEYS.slice(i + 1))
        for (const a of ["", ...SHOP_OPTIONS[first]])
          for (const b of ["", ...SHOP_OPTIONS[second]])
            compare({ [first]: a, [second]: b });
    const words = new Set(
      PRODUCTS.flatMap((p) =>
        [p.title, p.hook, p.collection, p.style].join(" ").split(/\s+/),
      ),
    );
    for (const word of words)
      for (const q of [
        word,
        word.toUpperCase(),
        ` ${word.toLowerCase()} `,
        word.slice(1, -1),
      ])
        compare({ q });
    for (const p of PRODUCTS)
      for (const q of [p.title, p.hook, `${p.title} ${p.hook}`]) compare({ q });
    expect(disagreements).toEqual([]);
  });

  it("ignores case and surrounding spaces in every filter, but not inner spaces or punctuation", () => {
    const cases: Picked[] = [
      { rooms: "bedroom" },
      { rooms: "  BEDROOM " },
      { collection: "the age of sail" },
      { palettes: "GOLD & GILDED" },
      { orientation: " portrait" },
      { style: "HAND-PRINTED UKIYO-E" },
      { q: "LANTERN" },
      { q: "  Ukiyo-E  " },
      { rooms: "Living  Room" },
      { q: "ukiyo e" },
    ];
    for (const values of cases)
      expect(ours(values), JSON.stringify(values)).toEqual(theirs(values));
    expect(ours({ rooms: "  BEDROOM " })).toEqual(ours({ rooms: "Bedroom" }));
    expect(ours({ rooms: "  BEDROOM " })).toHaveLength(7);
    expect(ours({ q: "  Ukiyo-E  " })).toHaveLength(2);
    expect(ours({ rooms: "Living  Room" })).toEqual([]);
  });

  it("in the Saved view shows only saved artworks, filters still applying, and a saved slug that is not on the page shows nothing", () => {
    const saved = new Set([
      "the-bridge-of-blue-stone",
      "the-lantern-that-outlasted-the-gale",
      "an-artwork-no-longer-public",
    ]);
    expect(ours({}, true, saved)).toEqual([
      "the-bridge-of-blue-stone",
      "the-lantern-that-outlasted-the-gale",
    ]);
    expect(ours({}, true, saved)).toEqual(theirs({}, true, saved));
    expect(ours({ rooms: "Study & Office" }, true, saved)).toEqual([
      "the-lantern-that-outlasted-the-gale",
    ]);
    expect(ours({ rooms: "Study & Office" }, true, saved)).toEqual(
      theirs({ rooms: "Study & Office" }, true, saved),
    );
    expect(ours({}, true, new Set())).toEqual([]);
    expect(ours({}, false, saved)).toHaveLength(22);
    // A detail page shows only its own cards: a heart saved elsewhere, or for a retired artwork, shows nothing here.
    const gold = pageRows("collection", "painted-in-gold").map(browseCard);
    expect(
      ours(
        {},
        true,
        new Set([
          "the-lantern-that-outlasted-the-gale",
          "an-artwork-no-longer-public",
        ]),
        gold,
      ),
    ).toEqual([]);
    expect(ours({}, true, saved, gold)).toEqual(["the-bridge-of-blue-stone"]);
  });
});

describe("activeFilters — the chips (browse.js:15)", () => {
  it("is one chip per non-empty filter, in the form's order, with its value as given — the prototype's loop over its filters", () => {
    expect(CHIP_LOOP).toContain("if(!v)continue;");
    const reversed = Object.fromEntries(
      [...FILTER_KEYS].reverse().map((key) => [key, ""]),
    ) as Record<FilterKey, string>;
    reversed.orientation = "Portrait";
    reversed.q = " moon ";
    const states: FilterValues[] = [
      EMPTY_FILTERS,
      FULL,
      reversed,
      { ...EMPTY_FILTERS, q: "   " },
    ];
    for (const values of states)
      expect(activeFilters(values), JSON.stringify(values)).toEqual(
        Object.entries(runFilters(formOf(values)))
          .filter(([, value]) => value)
          .map(([key, value]) => ({ key, value })),
      );
    expect(activeFilters(EMPTY_FILTERS)).toEqual([]);
    expect(activeFilters(reversed)).toEqual([
      { key: "q", value: " moon " },
      { key: "orientation", value: "Portrait" },
    ]);
    expect(activeFilters(FULL).map((chip) => chip.key)).toEqual([
      ...FILTER_KEYS,
    ]);
  });
});

describe("browse-model — the routes and the paths the projection renders", () => {
  it("lists the 17 browse paths: Shop, the Collections hub and its 3 pages, the Art Styles hub and its 11 pages", () => {
    expect(CATALOGUE_PAGE_PATHS).toEqual([
      "/shop",
      "/collections",
      "/collections/painted-in-gold",
      "/collections/blossoms-in-ink",
      "/collections/the-age-of-sail",
      "/art-styles",
      "/art-styles/gilded-peaks",
      "/art-styles/rinpa-moon",
      "/art-styles/four-gentlemen",
      "/art-styles/scarlet-blossom",
      "/art-styles/moonlit-blossom",
      "/art-styles/hand-printed-ukiyo-e",
      "/art-styles/mythic-voyage",
      "/art-styles/corsair-chronicles",
      "/art-styles/ghostly-armada",
      "/art-styles/marquetry-voyage",
      "/art-styles/neo-classical-fantasy",
    ]);
    expect(new Set(CATALOGUE_PAGE_PATHS).size).toBe(17);
  });

  it("has a route for each of the prototype's detail pages, named and ordered as the seeded collections and styles", () => {
    const folders = (relative: string) =>
      readdirSync(path.join(ROOT, relative), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
    expect(sorted(COLLECTION_ROUTES.map((r) => r.slug))).toEqual(
      folders("prototype/pages/collections"),
    );
    expect(sorted(STYLE_ROUTES.map((r) => r.slug))).toEqual(
      folders("prototype/pages/art-styles"),
    );
    expect(COLLECTION_ROUTES.map((r) => [r.slug, r.name])).toEqual(
      plan.collections.map((c) => [c.slug, c.name]),
    );
    expect(STYLE_ROUTES.map((r) => [r.slug, r.name])).toEqual(
      plan.art_styles.map((s) => [s.slug, s.name]),
    );
  });

  it("finds a route by its exact slug and nothing else", () => {
    for (const route of COLLECTION_ROUTES)
      expect(collectionRoute(route.slug)).toBe(route);
    for (const route of STYLE_ROUTES)
      expect(styleRoute(route.slug)).toBe(route);
    for (const slug of [
      "",
      "Painted-In-Gold",
      "painted-in-gold/",
      "painted in gold",
      "gilded-peaks",
      "toString",
      "__proto__",
    ])
      expect(collectionRoute(slug), slug).toBeUndefined();
    for (const slug of [
      "",
      "Gilded-Peaks",
      "gilded-peaks ",
      "painted-in-gold",
      "constructor",
    ])
      expect(styleRoute(slug), slug).toBeUndefined();
  });
});

describe("sortForDisplay — collection, then style, then slug", () => {
  const ORDER = [
    "the-bridge-of-blue-stone",
    "the-moon-between-two-peaks",
    "the-pine-that-holds-the-moon",
    "willow-after-rain",
    "bamboo-after-the-storm",
    "the-cup-beneath-the-plum",
    "the-blossom-over-the-closed-window",
    "the-first-warm-wall",
    "the-branch-above-dark-water",
    "the-window-after-midnight",
    "the-bridge-under-falling-blossom",
    "the-teahouse-shutters-at-spring-dawn",
    "the-galley-beyond-the-breakwater",
    "the-harbour-chain-opens",
    "the-lantern-that-outlasted-the-gale",
    "the-ship-between-two-storms",
    "the-last-mooring-in-the-mist",
    "the-ship-behind-the-fog-bell",
    "the-clipper-in-a-grain-wind",
    "the-shipyard-at-low-tide",
    "the-copper-citadel-at-the-sea-gate",
    "the-palace-above-the-dry-dock",
  ];

  it("orders by the projection's collection and style orders, then by slug, whatever order the rows arrive in, without changing them", () => {
    const before = ROWS.map((row) => row.slug);
    expect(sortForDisplay(ROWS).map((row) => row.slug)).toEqual(ORDER);
    expect(sortForDisplay([...ROWS].reverse()).map((row) => row.slug)).toEqual(
      ORDER,
    );
    expect(
      sortForDisplay([...ROWS.slice(7), ...ROWS.slice(0, 7)]).map(
        (row) => row.slug,
      ),
    ).toEqual(ORDER);
    expect(ROWS.map((row) => row.slug)).toEqual(before);
    expect(sortForDisplay(ROWS)).not.toBe(ROWS);
    expect(sortForDisplay([])).toEqual([]);
  });

  it("follows the projection's sort orders, not the route lists", () => {
    const reordered = ROWS.map((row) =>
      row.collection_slug === "the-age-of-sail"
        ? changed(row, { collection_sort_order: 1 })
        : row.collection_slug === "painted-in-gold"
          ? changed(row, { collection_sort_order: 3 })
          : row,
    );
    const slugs = sortForDisplay(reordered).map((row) => row.slug);
    expect(slugs.slice(0, 10)).toEqual(ORDER.slice(12));
    expect(slugs.slice(-4)).toEqual(ORDER.slice(0, 4));
  });

  it("documents the one difference from the prototype's workbook order: inside three styles the two artworks change places", () => {
    const ours = sortForDisplay(ROWS).map((row) => row.slug);
    const prototype = SHOP_CARDS.map((card) => card.slug);
    const styleOf = new Map(ROWS.map((row) => [row.slug, row.style_slug]));
    expect(sorted(ours)).toEqual(sorted(prototype));
    // The same collections and styles, in the same order…
    expect(ours.map((slug) => styleOf.get(slug))).toEqual(
      prototype.map((slug) => styleOf.get(slug)),
    );
    // …but the projection has no artwork order, and by slug three pairs read the other way round (S1.4 record →
    // "Ordering"; the prototype's order is its workbook rows').
    const differing = [
      ...new Set(
        ours.flatMap((slug, i) =>
          slug === prototype[i] ? [] : [styleOf.get(slug)],
        ),
      ),
    ];
    expect(differing).toEqual([
      "hand-printed-ukiyo-e",
      "mythic-voyage",
      "marquetry-voyage",
    ]);
    for (const style of differing)
      expect(
        ours.filter((slug) => styleOf.get(slug) === style),
        style,
      ).toEqual(
        prototype.filter((slug) => styleOf.get(slug) === style).reverse(),
      );
  });
});

describe("browseCard — one card of the grid, as the browser receives it", () => {
  it("reproduces each of the prototype's 22 Shop cards: title, hook, the “<finish> frame” line, its price, and the alt rule (“in a antique gold frame” kept)", () => {
    const prototype = new Map(SHOP_CARDS.map((card) => [card.slug, card]));
    expect(sorted(CARDS.map((card) => card.slug))).toEqual(
      sorted([...prototype.keys()]),
    );
    for (const card of CARDS) {
      const theirs = prototype.get(card.slug);
      expect(
        {
          title: card.title,
          hook: card.hook,
          frame: ART_CARD.frame(card.finishName),
          price: card.price,
          alt: card.alt,
        },
        card.slug,
      ).toEqual({
        title: theirs?.title,
        hook: theirs?.hook,
        frame: theirs?.frame,
        price: theirs?.price,
        alt: theirs?.alt,
      });
    }
    expect(
      CARDS.filter((card) => card.alt.endsWith(" in a antique gold frame")),
    ).toHaveLength(8);
  });

  it("takes the suggested frame's variant: its finish name and its price from integer paise — ₹19,000, ₹21,000, ₹23,000", () => {
    const expected = {
      white: ["White", "₹19,000"],
      black: ["Black", "₹21,000"],
      "antique-gold": ["Antique Gold", "₹23,000"],
    } as const;
    const count = { white: 0, black: 0, "antique-gold": 0 };
    for (const row of SHOWN) {
      const card = browseCard(row);
      expect([card.finishName, card.price], row.slug).toEqual(
        expected[row.suggested_frame],
      );
      count[row.suggested_frame] += 1;
    }
    expect(count).toEqual({ white: 8, black: 6, "antique-gold": 8 });
  });

  it("follows the database: the variant's own finish name and paise, and no price when that variant is not available to order", () => {
    const row = rowOf("the-ship-between-two-storms");
    expect(row.suggested_frame).toBe("black");
    const withVariant = (finish: string, change: object) =>
      changed(row, {
        variants: row.variants.map((v) =>
          v.finish === finish ? { ...v, ...change } : v,
        ),
      });
    expect(
      browseCard(withVariant("black", { availability: "unavailable" })),
    ).toMatchObject({ finishName: "Black", price: null });
    // Another finish being unavailable changes nothing on the card.
    expect(
      browseCard(withVariant("white", { availability: "unavailable" })).price,
    ).toBe("₹21,000");
    expect(
      browseCard(withVariant("black", { price_paise: BigInt(1950050) })).price,
    ).toBe("₹19,500.50");
    expect(
      browseCard(withVariant("black", { price_paise: BigInt(123456700) }))
        .price,
    ).toBe("₹12,34,567");
    expect(
      browseCard(withVariant("black", { finish_name: "Ebony" })).finishName,
    ).toBe("Ebony");
  });

  it("refuses a row without its suggested frame's variant (the reader has already left such a row out)", () => {
    const row = rowOf("the-moon-between-two-peaks");
    const broken = {
      ...row,
      variants: row.variants.filter((v) => v.finish !== "antique-gold"),
    };
    expect(() => browseCard(broken)).toThrow(
      "no antique-gold variant for the-moon-between-two-peaks",
    );
  });

  it("writes the alt from the title and the frame's words, never the projection's default alt", () => {
    for (const row of SHOWN) {
      const words = row.suggested_frame.replace(/-/g, " ");
      expect(browseCard(row).alt).toBe(`${row.title} in a ${words} frame`);
      expect(browseCard(row).alt).not.toBe(row.default_alt);
    }
  });

  it("draws the suggested frame's S1.1 catalogue objects at 480 and 1200 — byte for byte the pictures of the prototype's Shop cards", () => {
    expect(BUCKET_URL).toMatch(
      /^(?:https:\/\/[a-z]{20}\.supabase\.co)?\/storage\/v1\/object\/public\/catalogue-public\/$/,
    );
    const prototype = new Map(SHOP_CARDS.map((card) => [card.slug, card]));
    for (const row of SHOWN) {
      const object = (size: string) =>
        `artworks/${row.slug}/frame-${row.suggested_frame}-${size}.webp`;
      expect(browseCard(row).image, row.slug).toEqual({
        src: objectUrl(object("1200")),
        srcSet: `${objectUrl(object("480"))} 480w, ${objectUrl(object("1200"))} 1200w`,
      });
      // The seed uploads each object from a prototype file (scripts/testing/lib/catalogue.mjs); the prototype's card
      // shows a file with the same SHA-256.
      const theirs = prototype.get(row.slug);
      expect(uploadOf(object("1200")).sha256, row.slug).toBe(
        baselineHash(theirs?.src ?? ""),
      );
      expect(uploadOf(object("480")).sha256, row.slug).toBe(
        baselineHash(theirs?.small ?? ""),
      );
    }
  });

  it("is plain JSON for the browser: no bigint, no paise, no variant code, no description — only what the card shows and filters on", () => {
    for (const row of SHOWN) {
      const card = browseCard(row);
      const json = JSON.stringify(card);
      expect(JSON.parse(json), row.slug).toEqual(card);
      expect(Object.keys(card).sort()).toEqual([
        "alt",
        "collection",
        "finishName",
        "hook",
        "image",
        "moods",
        "orientation",
        "palettes",
        "price",
        "rooms",
        "slug",
        "style",
        "title",
      ]);
      expect(json, row.slug).not.toMatch(
        /paise|variant|:(?:white|black|antique-gold)"|1900000|2100000|2300000|INR/,
      );
      expect(json, row.slug).not.toContain(row.description);
      expect(json, row.slug).not.toContain(row.default_alt);
    }
  });
});

describe("filterOptions — each select lists its page's own values (build-browse.cjs:70)", () => {
  it("lists Shop All's options exactly as the prototype's Shop page does", () => {
    expect(SHOP_OPTIONS).toEqual(prototypeOptions(SHOP_PAGE));
  });

  it("lists each detail page's options from its own artworks, as each of the prototype's 14 detail pages does", () => {
    const pages = [
      ...COLLECTION_ROUTES.map((r) => ["collection", r.slug] as const),
      ...STYLE_ROUTES.map((r) => ["style", r.slug] as const),
    ];
    expect(pages).toHaveLength(14);
    for (const [kind, slug] of pages) {
      const rows = pageRows(kind, slug);
      const page = detailPage(kind, slug);
      expect(sorted(rows.map((row) => row.slug)), page).toEqual(
        sorted(prototypeCards(page).map((card) => card.slug)),
      );
      expect(filterOptions(rows.map(browseCard)), page).toEqual(
        prototypeOptions(page),
      );
    }
    expect(
      filterOptions(pageRows("collection", "painted-in-gold").map(browseCard)),
    ).toEqual({
      collection: ["Painted in Gold"],
      style: ["Gilded Peaks", "Rinpa Moon"],
      rooms: ["Living Room"],
      moods: ["Bold", "Calm", "Full of wonder"],
      palettes: ["Blues & Indigo", "Gold & Gilded", "Greens & Teals"],
      orientation: ["Portrait"],
    });
  });

  it("keeps each value once, in JavaScript's default (UTF-16) order — not a locale's", () => {
    const card = (style: string, rooms: string[]): BrowseCard => ({
      ...CARDS[0],
      style,
      rooms,
    });
    const options = filterOptions([
      card("Zeta", ["Study & Office", "Bedroom"]),
      card("alpha", ["Bedroom"]),
      card("Émile", ["Bedroom", "Study & Office"]),
      card("Zeta", []),
    ]);
    expect(options.style).toEqual(["Zeta", "alpha", "Émile"]);
    expect(options.rooms).toEqual(["Bedroom", "Study & Office"]);
    expect(options.collection).toEqual([CARDS[0].collection]);
  });

  it("lists nothing for a page with no artworks", () => {
    expect(filterOptions([])).toEqual({
      collection: [],
      style: [],
      rooms: [],
      moods: [],
      palettes: [],
      orientation: [],
    });
  });
});

describe("collectionCards — the Collections hub", () => {
  const COLLECTION_HUB = prototypeHub(
    "prototype/pages/collections/index.html",
    /<article class="collection-card">([\s\S]*?)<\/article>/g,
  );

  it("shows the three collections in the projection's order, with the names and intros their rows carry — the prototype's hub, card for card", () => {
    const cards = collectionCards(ROWS);
    expect(
      cards.map((card) => ({
        slug: card.route.slug,
        name: card.name,
        intro: card.intro,
      })),
    ).toEqual(
      COLLECTION_HUB.map(({ slug, name, intro }) => ({ slug, name, intro })),
    );
    cards.forEach((card, i) => expect(card.route).toBe(COLLECTION_ROUTES[i]));
    expect(collectionCards([...ROWS].reverse())).toEqual(cards);
  });

  it("leaves out a collection with no public artwork, and shows nothing for no rows", () => {
    expect(
      collectionCards(
        ROWS.filter((row) => row.collection_slug !== "blossoms-in-ink"),
      ).map((card) => card.route.slug),
    ).toEqual(["painted-in-gold", "the-age-of-sail"]);
    expect(
      collectionCards(
        ROWS.filter((row) => row.slug === "the-ship-behind-the-fog-bell"),
      ).map((card) => card.route.slug),
    ).toEqual(["the-age-of-sail"]);
    expect(collectionCards([])).toEqual([]);
  });

  it("shows only collections with an approved route, in the projection's sort order, under the names and intros the rows carry", () => {
    const stray = changed(rowOf("willow-after-rain"), {
      collection_slug: "a-new-collection",
      collection_name: "A New Collection",
      collection_sort_order: 1,
    });
    const reordered = [
      ...ROWS.map((row) =>
        row.collection_slug === "painted-in-gold"
          ? changed(row, {
              collection_sort_order: 4,
              collection_name: "Painted in Gold Leaf",
              collection_intro: "A new intro.",
            })
          : row,
      ),
      stray,
    ];
    const cards = collectionCards(reordered);
    expect(cards.map((card) => card.route.slug)).toEqual([
      "blossoms-in-ink",
      "the-age-of-sail",
      "painted-in-gold",
    ]);
    expect(cards[2]).toMatchObject({
      name: "Painted in Gold Leaf",
      intro: "A new intro.",
    });
    expect(cards[2].route.name).toBe("Painted in Gold");
    // Equal sort orders fall back to the route slug.
    expect(
      collectionCards(
        ROWS.map((row) => changed(row, { collection_sort_order: 1 })),
      ).map((card) => card.route.slug),
    ).toEqual(["blossoms-in-ink", "painted-in-gold", "the-age-of-sail"]);
  });
});

describe("styleCards — the Art Styles hub", () => {
  const STYLE_HUB = prototypeHub(
    "prototype/pages/art-styles/index.html",
    /<article class="browse-story">([\s\S]*?)<\/article>/g,
  );
  // The close-ups are 4:5 portraits, 384 × 480 and 960 × 1200 (every close-* object in catalogue-images.json): the
  // descriptors are their true widths, where the prototype's generic rewrite wrote 480w / 1200w (D-54).
  const close = (artwork: string, finish: string) => {
    const object = (size: string) =>
      `artworks/${artwork}/close-${finish}-${size}.webp`;
    return {
      src: objectUrl(object("1200")),
      srcSet: `${objectUrl(object("480"))} 384w, ${objectUrl(object("1200"))} 960w`,
    };
  };

  it("shows the eleven styles in the projection's order with their rows' names and intros, each with the prototype hub's own picture, byte for byte", () => {
    const cards = styleCards(ROWS);
    expect(cards.map((card) => card.route.slug)).toEqual(
      STYLE_HUB.map((card) => card.slug),
    );
    cards.forEach((card, i) => expect(card.route).toBe(STYLE_ROUTES[i]));
    for (const [i, card] of cards.entries()) {
      const theirs = STYLE_HUB[i];
      expect({ name: card.name, intro: card.intro }, theirs.slug).toEqual({
        name: theirs.name,
        intro: theirs.intro,
      });
      // The hub's picture is a close-up web copy, `<artwork>-close-<finish>-<hash>-1200.webp`.
      const chosen =
        /^assets\/web-artworks\/([a-z0-9-]+)-close-(white|black|antique-gold)-[0-9a-f]{8}-1200\.webp$/.exec(
          theirs.src,
        );
      expect(chosen, theirs.src).not.toBeNull();
      const [, artwork, finish] = chosen ?? [];
      expect(card.route.cover, theirs.slug).toEqual({ artwork, finish });
      expect(card.image, theirs.slug).toEqual(close(artwork, finish));
      // The picture is that artwork in its own suggested frame…
      expect(rowOf(artwork).suggested_frame, artwork).toBe(finish);
      // …and the catalogue objects hold the very files the hub shows (the seed manifest, the baseline's SHA-256).
      expect(
        uploadOf(`artworks/${artwork}/close-${finish}-1200.webp`).sha256,
      ).toBe(baselineHash(theirs.src));
      expect(
        uploadOf(`artworks/${artwork}/close-${finish}-480.webp`).sha256,
      ).toBe(baselineHash(theirs.small));
    }
    // Gilded Peaks shows its second artwork: the choice is the prototype's, not the display order's.
    expect(cards[0].route.cover.artwork).toBe("the-moon-between-two-peaks");
    expect(pageRows("style", "gilded-peaks")[0].slug).toBe(
      "the-bridge-of-blue-stone",
    );
  });

  it("falls back, while the prototype's cover artwork is not public, to the style's first remaining artwork in its own suggested frame", () => {
    const without = ROWS.filter(
      (row) => row.slug !== "the-moon-between-two-peaks",
    );
    const gilded = (rows: readonly PublicCatalogueRow[]) =>
      styleCards(rows).find((card) => card.route.slug === "gilded-peaks");
    expect(gilded(without)?.image).toEqual(
      close("the-bridge-of-blue-stone", "antique-gold"),
    );
    // "First" is the display order (by slug inside the style), and the frame is read from that artwork's row.
    const quiet = another(
      rowOf("the-bridge-of-blue-stone"),
      "a-quiet-peak",
      "A Quiet Peak",
      { suggested_frame: "black" },
    );
    expect(gilded([...without, quiet])?.image).toEqual(
      close("a-quiet-peak", "black"),
    );
    // The other ten keep the prototype's choice; the cover returns once its artwork is public again.
    const others = (rows: readonly PublicCatalogueRow[]) =>
      styleCards(rows).filter((card) => card.route.slug !== "gilded-peaks");
    expect(others(without)).toEqual(others(ROWS));
    expect(gilded([...ROWS, quiet])?.image).toEqual(
      close("the-moon-between-two-peaks", "antique-gold"),
    );
  });

  it("leaves out a style with no public artwork or without an approved route, and shows nothing for no rows", () => {
    const cards = styleCards(
      ROWS.filter((row) => row.style_slug !== "ghostly-armada"),
    );
    expect(cards).toHaveLength(10);
    expect(cards.map((card) => card.route.slug)).not.toContain(
      "ghostly-armada",
    );
    const stray = changed(rowOf("willow-after-rain"), {
      style_slug: "a-new-style",
      style_name: "A New Style",
    });
    expect(styleCards([...ROWS, stray]).map((card) => card.route.slug)).toEqual(
      STYLE_ROUTES.map((route) => route.slug),
    );
    expect(styleCards([])).toEqual([]);
  });

  it("follows the projection's style order and takes the name and intro from the style's rows", () => {
    const reordered = ROWS.map((row) =>
      row.style_slug === "gilded-peaks"
        ? changed(row, {
            style_sort_order: 12,
            style_name: "Gilded Peaks Renamed",
            style_intro: "A new intro.",
          })
        : row,
    );
    const cards = styleCards(reordered);
    expect(cards.map((card) => card.route.slug)).toEqual([
      ...STYLE_ROUTES.slice(1).map((route) => route.slug),
      "gilded-peaks",
    ]);
    expect(cards[10]).toMatchObject({
      name: "Gilded Peaks Renamed",
      intro: "A new intro.",
    });
    expect(cards[10].route.name).toBe("Gilded Peaks");
    expect(styleCards([...reordered].reverse())).toEqual(cards);
  });
});
