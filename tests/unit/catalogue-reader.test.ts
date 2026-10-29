import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";

// The real reader, validation and factories run; only the SDK constructor is replaced, so nothing reaches a network.
const sdk = vi.hoisted(() => ({
  createClient: vi.fn((): unknown => ({ kind: "fake-client" })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient: sdk.createClient }));

import {
  FINISH_NAMES,
  PUBLIC_CATALOGUE_COLUMNS,
  publicCatalogueRowSchema,
} from "@/lib/schemas/catalogue";
import {
  CATALOGUE_CLIENT_OPTIONS,
  CATALOGUE_QUERY_TIMEOUT_MS,
  CATALOGUE_REVALIDATE_SECONDS,
  CATALOGUE_TAG,
  CatalogueUnavailableError,
  catalogueForRender,
  catalogueRequestInit,
  defaultCatalogueReaderDependencies,
  getPublicCatalogue,
  isBuildPhase,
  isVercelDeployment,
  readPublicCatalogue,
  validateCatalogueRows,
  type CatalogueRead,
  type CatalogueUnavailableReason,
} from "@/lib/server/catalogue";
import type { BrowserClientResult } from "@/lib/supabase/browser";
import type { PublicReadEnv } from "@/lib/supabase/config";

/**
 * The storefront's catalogue read — S1.4 (src/lib/server/catalogue.ts): the identity is decided before any client
 * exists, one bounded read of the `public_catalogue` projection runs through this build's public client, each row is
 * validated on its own with a sanitised report, every request is tagged for ISR, and an unavailable read renders only
 * while building outside Vercel without the catalogue's configuration, and throws otherwise. Hermetic: the client is
 * injected (a recording thenable) or built by a fake SDK constructor; nothing reaches a network.
 */

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

const TEST_REF = "abcdefghijklmnopqrst";
const PROD_REF = "tsrqponmlkjihgfedcba";
const TEST_URL = `https://${TEST_REF}.supabase.co`;
const PROD_URL = `https://${PROD_REF}.supabase.co`;
// Low-entropy stand-ins built at run time; no credential-like literal is committed.
const PUBLISHABLE = `sb_publishable_${"p".repeat(30)}`;
const SECRET = `sb_secret_${"s".repeat(30)}`;
// The shape of a legacy JWT key (three dot-separated segments starting "eyJ"); not a token.
const LEGACY_JWT = `eyJ${"a".repeat(20)}.eyJ${"b".repeat(20)}.${"c".repeat(20)}`;

/** Two real artwork slugs (prototype/data/products.json). */
const SLUG = "the-bridge-of-blue-stone";
const OTHER_SLUG = "the-moon-between-two-peaks";

const B = (n: number | string) => BigInt(n);

const PUBLIC_READ_NAMES = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_TEST_PROJECT_REF",
  "SUPABASE_PROD_PROJECT_REF",
  "VERCEL_ENV",
] as const;

function previewEnv(overrides: Partial<PublicReadEnv> = {}): PublicReadEnv {
  return {
    NEXT_PUBLIC_SUPABASE_URL: TEST_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE,
    SUPABASE_TEST_PROJECT_REF: TEST_REF,
    SUPABASE_PROD_PROJECT_REF: PROD_REF,
    VERCEL_ENV: "preview",
    ...overrides,
  };
}

/** Sets the process environment the default dependencies read: a configured Preview on TEST, plus the secret. */
function stubPreviewEnvironment(): void {
  for (const [name, value] of Object.entries(previewEnv()))
    vi.stubEnv(name, value);
  vi.stubEnv("SUPABASE_SECRET_KEY", SECRET);
}

/** Removes every Supabase name from the process environment (a build or process without its environment). */
function stubEmptyEnvironment(): void {
  for (const name of [...PUBLIC_READ_NAMES, "SUPABASE_SECRET_KEY"])
    vi.stubEnv(name, undefined);
}

type Row = Record<string, unknown>;
type Variant = Record<string, unknown>;
type Image = { slot: string; size: string; path: string };

/** A complete, valid projection row for a real slug — the shape of tests/unit/schemas.test.ts → sampleRow(). */
function sampleRow(slug = SLUG, title = "The Bridge of Blue Stone"): Row {
  const finishes = ["white", "black", "antique-gold"] as const;
  const prices = { white: 1900000, black: 2100000, "antique-gold": 2300000 };
  return {
    slug,
    title,
    hook: "A blue bridge crosses a river of real gold.",
    description: "A blue bridge crosses a river of evening gold.",
    collection_slug: "painted-in-gold",
    collection_name: "Painted in Gold",
    collection_intro: "Some evenings deserve to last forever.",
    collection_sort_order: 1,
    style_slug: "gilded-peaks",
    style_name: "Gilded Peaks",
    style_full_name: "Gilded Peaks — Blue-Green Mineral Landscape on Gold",
    style_intro: "Azurite and malachite.",
    style_sort_order: 1,
    orientation: "Portrait",
    rooms: ["Living Room"],
    moods: ["Full of wonder"],
    palettes: ["Gold & Gilded", "Blues & Indigo"],
    palette_hues: [
      "Azurite blue",
      "Malachite green",
      "Ink black",
      "Radiant gold",
    ],
    suggested_frame: "antique-gold",
    featured: false,
    lead_time: null,
    seo_title: "Blue and Gold Wall Art: The Blue Bridge | Aalishaan Studio",
    seo_description:
      "A mineral-blue bridge crosses a burnished river between layered peaks.",
    default_alt:
      "The Bridge of Blue Stone · Blue-Gold Landscape Artwork in a antique gold frame",
    image_alt_text:
      "The Bridge of Blue Stone — blue and gold wall art, portrait A2",
    published_at: "2026-10-05T10:00:00+00:00",
    variants: finishes.map((finish) => ({
      finish,
      finish_name: FINISH_NAMES[finish],
      variant_code: `${slug}:${finish}`,
      price_paise: prices[finish],
      currency: "INR",
      availability: "made_to_order",
      lead_time: null,
    })),
    images: [
      ...finishes.flatMap((finish) =>
        ["frame", "close"].flatMap((kind) =>
          ["480", "1200"].map((size) => ({
            slot: `${kind}-${finish}`,
            size,
            path: `artworks/${slug}/${kind}-${finish}-${size}.webp`,
          })),
        ),
      ),
      { slot: "paper", size: "480", path: `artworks/${slug}/paper-480.webp` },
      { slot: "paper", size: "1200", path: `artworks/${slug}/paper-1200.webp` },
      {
        slot: "artwork",
        size: "full",
        path: `artworks/${slug}/artwork-full.webp`,
      },
    ],
  };
}

const OTHER_ROW = () => sampleRow(OTHER_SLUG, "The Moon Between Two Peaks");

function withVariants(edit: (variants: Variant[]) => unknown): Row {
  const row = sampleRow();
  return { ...row, variants: edit(row.variants as Variant[]) };
}

function withImages(edit: (images: Image[]) => unknown): Row {
  const row = sampleRow();
  return { ...row, images: edit(row.images as Image[]) };
}

/** The row as the reader returns it: the schema's output (integer paise as bigint). */
const parsed = (row: Row) => publicCatalogueRowSchema.parse(row);

type Call = { method: string; args: unknown[] };
type Outcome = {
  data: unknown;
  error: { code?: string; message: string } | null;
  status?: number;
};

/** A thenable query chain that records every call; the same object is returned at every step (tests/unit/health.test.ts). */
function fakeClient(outcome: Outcome | (() => Promise<Outcome>)): {
  client: SupabaseClient;
  calls: Call[];
} {
  const calls: Call[] = [];
  const chain: Record<string, unknown> = {};
  for (const method of [
    "from",
    "select",
    "insert",
    "update",
    "upsert",
    "delete",
    "eq",
    "in",
    "like",
    "ilike",
    "or",
    "order",
    "range",
    "limit",
    "abortSignal",
  ]) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    };
  }
  chain.then = (
    resolve: (value: unknown) => unknown,
    reject: (reason: unknown) => unknown,
  ) =>
    (typeof outcome === "function" ? outcome() : Promise.resolve(outcome)).then(
      resolve,
      reject,
    );
  return { client: chain as unknown as SupabaseClient, calls };
}

type ReaderDeps = {
  env: Mock<() => PublicReadEnv>;
  createPublicClient: Mock<() => BrowserClientResult>;
  report: Mock<(message: string) => void>;
};

/** Injected dependencies: the given environment, a public client on TEST answering `outcome`, a recording report. */
function readerDeps(
  outcome: Outcome | (() => Promise<Outcome>) = { data: [], error: null },
  {
    env = previewEnv(),
    created,
  }: { env?: PublicReadEnv; created?: BrowserClientResult } = {},
): { deps: ReaderDeps; calls: Call[] } {
  const fake = fakeClient(outcome);
  const result: BrowserClientResult = created ?? {
    ok: true,
    client: fake.client,
    projectRef: TEST_REF,
  };
  return {
    deps: {
      env: vi.fn(() => env),
      createPublicClient: vi.fn(() => result),
      report: vi.fn<(message: string) => void>(),
    },
    calls: fake.calls,
  };
}

/** A read of the given rows through a configured Preview. */
async function readRows(
  data: unknown[],
): Promise<{ result: CatalogueRead; deps: ReaderDeps }> {
  const { deps } = readerDeps({ data, error: null, status: 200 });
  return { result: await readPublicCatalogue(deps), deps };
}

const REASONS: readonly CatalogueUnavailableReason[] = [
  "not_configured",
  "identity_mismatch",
  "query_failed",
  "malformed",
];

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("readPublicCatalogue — the identity is decided before any client exists", () => {
  it.each([
    [
      "no TEST ref",
      previewEnv({ SUPABASE_TEST_PROJECT_REF: undefined }),
      "not_configured",
    ],
    [
      "no PROD ref",
      previewEnv({ SUPABASE_PROD_PROJECT_REF: undefined }),
      "not_configured",
    ],
    [
      "a malformed ref",
      previewEnv({ SUPABASE_PROD_PROJECT_REF: "ABCDEFGHIJKLMNOPQRST" }),
      "not_configured",
    ],
    [
      "no API URL",
      previewEnv({ NEXT_PUBLIC_SUPABASE_URL: undefined }),
      "not_configured",
    ],
    [
      "no publishable key",
      previewEnv({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "  " }),
      "not_configured",
    ],
    [
      "an invalid URL (a path)",
      previewEnv({ NEXT_PUBLIC_SUPABASE_URL: `${TEST_URL}/rest/v1` }),
      "not_configured",
    ],
    [
      "an invalid URL (http)",
      previewEnv({
        NEXT_PUBLIC_SUPABASE_URL: `http://${TEST_REF}.supabase.co`,
      }),
      "not_configured",
    ],
    [
      "a secret key behind the publishable name",
      previewEnv({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: SECRET }),
      "not_configured",
    ],
    [
      "a legacy JWT behind the publishable name",
      previewEnv({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: LEGACY_JWT }),
      "not_configured",
    ],
    [
      "an unknown VERCEL_ENV",
      previewEnv({ VERCEL_ENV: "staging" }),
      "not_configured",
    ],
    [
      "refs that are not distinct",
      previewEnv({ SUPABASE_PROD_PROJECT_REF: TEST_REF }),
      "identity_mismatch",
    ],
    [
      "the PROD URL in a Preview",
      previewEnv({ NEXT_PUBLIC_SUPABASE_URL: PROD_URL }),
      "identity_mismatch",
    ],
    [
      "the TEST URL in Production",
      previewEnv({ VERCEL_ENV: "production" }),
      "identity_mismatch",
    ],
    [
      "the PROD URL in a local process",
      previewEnv({ VERCEL_ENV: undefined, NEXT_PUBLIC_SUPABASE_URL: PROD_URL }),
      "identity_mismatch",
    ],
    [
      "a third project's URL",
      previewEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://zzzzzzzzzzzzzzzzzzzz.supabase.co",
      }),
      "identity_mismatch",
    ],
  ] as const)(
    "is unavailable with %s (%s) and never calls the client factory",
    async (_label, env, reason) => {
      const { deps, calls } = readerDeps(
        { data: [sampleRow()], error: null },
        { env },
      );
      expect(await readPublicCatalogue(deps)).toEqual({
        status: "unavailable",
        reason,
      });
      expect(deps.env).toHaveBeenCalledTimes(1);
      expect(deps.createPublicClient).not.toHaveBeenCalled();
      expect(deps.report).not.toHaveBeenCalled();
      expect(calls).toEqual([]);
    },
  );

  it("refuses a created client whose ref is not the configured one: identity_mismatch, and no query runs", async () => {
    const { client, calls } = fakeClient({ data: [sampleRow()], error: null });
    const { deps } = readerDeps(undefined, {
      created: { ok: true, client, projectRef: PROD_REF },
    });
    expect(await readPublicCatalogue(deps)).toEqual({
      status: "unavailable",
      reason: "identity_mismatch",
    });
    expect(deps.createPublicClient).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([]);
  });

  it.each([["not_configured"], ["invalid_url"], ["invalid_key"]] as const)(
    "reports not_configured when the client factory itself reports %s, and no query runs",
    async (reason) => {
      const { deps, calls } = readerDeps(undefined, {
        created: { ok: false, reason },
      });
      expect(await readPublicCatalogue(deps)).toEqual({
        status: "unavailable",
        reason: "not_configured",
      });
      expect(calls).toEqual([]);
    },
  );

  it("reads PROD in Production through a client on PROD", async () => {
    const { client, calls } = fakeClient({ data: [], error: null });
    const { deps } = readerDeps(undefined, {
      env: previewEnv({
        VERCEL_ENV: "production",
        NEXT_PUBLIC_SUPABASE_URL: PROD_URL,
      }),
      created: { ok: true, client, projectRef: PROD_REF },
    });
    expect(await readPublicCatalogue(deps)).toEqual({
      status: "ok",
      rows: [],
      omitted: 0,
    });
    expect(calls.map((call) => call.method)).toEqual([
      "from",
      "select",
      "abortSignal",
    ]);
  });
});

describe("readPublicCatalogue — one bounded read of the projection", () => {
  it("selects exactly the projection's columns from public_catalogue, bounded by the timeout, with no filter", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    try {
      const { deps, calls } = readerDeps({ data: [], error: null });
      await readPublicCatalogue(deps);
      expect(calls.map((call) => call.method)).toEqual([
        "from",
        "select",
        "abortSignal",
      ]);
      expect(calls[0].args).toEqual(["public_catalogue"]);
      expect(calls[1].args).toEqual([PUBLIC_CATALOGUE_COLUMNS.join(",")]);
      expect(calls[1].args[0]).not.toContain("*");
      const signal = calls[2].args[0];
      expect(signal).toBeInstanceOf(AbortSignal);
      expect((signal as AbortSignal).aborted).toBe(false);
      expect(timeout).toHaveBeenCalledTimes(1);
      expect(timeout).toHaveBeenCalledWith(CATALOGUE_QUERY_TIMEOUT_MS);
      expect(signal).toBe(timeout.mock.results[0]?.value);
      expect(CATALOGUE_QUERY_TIMEOUT_MS).toBeLessThanOrEqual(5000);
    } finally {
      timeout.mockRestore();
    }
  });

  it("reads an empty projection as an empty catalogue — ok with no rows, distinct from unavailable", async () => {
    const { result, deps } = await readRows([]);
    expect(result).toEqual({ status: "ok", rows: [], omitted: 0 });
    expect(deps.report).not.toHaveBeenCalled();
  });

  it.each([
    [
      "a permission error",
      {
        data: null,
        error: {
          code: "42501",
          message: "permission denied for view public_catalogue",
        },
        status: 401,
      },
    ],
    [
      "an error beside data",
      {
        data: [sampleRow()],
        error: { code: "PGRST000", message: "upstream text" },
        status: 503,
      },
    ],
    [
      "an aborted read (postgrest-js reports a timeout as an empty code, status 0)",
      {
        data: null,
        error: { code: "", message: "AbortError: The operation was aborted" },
        status: 0,
      },
    ],
  ])(
    "reports query_failed for %s, never the upstream text",
    async (_label, outcome) => {
      const { deps } = readerDeps(outcome);
      const result = await readPublicCatalogue(deps);
      expect(result).toEqual({ status: "unavailable", reason: "query_failed" });
      expect(JSON.stringify(result)).not.toContain("permission denied");
      expect(deps.report).not.toHaveBeenCalled();
    },
  );

  it("reports query_failed when the query rejects", async () => {
    const { deps } = readerDeps(() => Promise.reject(new Error("AbortError")));
    expect(await readPublicCatalogue(deps)).toEqual({
      status: "unavailable",
      reason: "query_failed",
    });
  });

  it("reports query_failed when the client throws while the query is built", async () => {
    const client = {
      from: () => {
        throw new Error("boom");
      },
    } as unknown as SupabaseClient;
    const { deps } = readerDeps(undefined, {
      created: { ok: true, client, projectRef: TEST_REF },
    });
    expect(await readPublicCatalogue(deps)).toEqual({
      status: "unavailable",
      reason: "query_failed",
    });
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["an object", { rows: [sampleRow()] }],
    ["a string", "[]"],
  ])(
    "reports malformed, never an empty catalogue, for a success whose data is %s",
    async (_label, data) => {
      const { deps } = readerDeps({ data, error: null, status: 200 });
      expect(await readPublicCatalogue(deps)).toEqual({
        status: "unavailable",
        reason: "malformed",
      });
      expect(deps.report).not.toHaveBeenCalled();
    },
  );
});

/** [label, the reported problem, the invalid row] — each a breach of the mirror or of the S1.1 contract. */
const BAD_ROWS: ReadonlyArray<[string, string, () => Row]> = [
  [
    "variants null",
    "variants:invalid_type",
    () => ({ ...sampleRow(), variants: null }),
  ],
  [
    "images null",
    "images:invalid_type",
    () => ({ ...sampleRow(), images: null }),
  ],
  [
    "a missing variant (two of three)",
    "variants:too_small",
    () => withVariants((variants) => variants.slice(0, 2)),
  ],
  [
    "a duplicate finish",
    "variants:contract",
    () =>
      withVariants((variants) => [
        variants[0],
        variants[1],
        { ...variants[0] },
      ]),
  ],
  [
    "a variant_code naming another slug",
    "variants:contract",
    () =>
      withVariants((variants) =>
        variants.map((variant, index) =>
          index === 0
            ? { ...variant, variant_code: `${OTHER_SLUG}:white` }
            : variant,
        ),
      ),
  ],
  [
    "fourteen images",
    "images:too_small",
    () => withImages((images) => images.slice(0, 14)),
  ],
  [
    "an image path for another slug",
    "images:path",
    () =>
      withImages((images) =>
        images.map((image, index) =>
          index === 0
            ? { ...image, path: `artworks/${OTHER_SLUG}/frame-white-480.webp` }
            : image,
        ),
      ),
  ],
  [
    "a missing (slot, size) pair replaced by a duplicate",
    "images:contract",
    () =>
      withImages((images) =>
        images.map((image) =>
          image.slot === "paper" && image.size === "1200"
            ? {
                slot: "paper",
                size: "480",
                path: `artworks/${SLUG}/paper-480.webp`,
              }
            : image,
        ),
      ),
  ],
  [
    "a palette hue longer than 60 characters",
    "palette_hues.0:too_big",
    () => ({ ...sampleRow(), palette_hues: ["h".repeat(61)] }),
  ],
  [
    "an unexpected extra column",
    ":unrecognized_keys",
    () => ({ ...sampleRow(), status: "Active" }),
  ],
];

describe("validateCatalogueRows — each row on its own", () => {
  it("keeps every valid row as parsed (integer paise as bigint), in order, and reports nothing", async () => {
    const { result, deps } = await readRows([sampleRow(), OTHER_ROW()]);
    expect(result).toEqual({
      status: "ok",
      rows: [parsed(sampleRow()), parsed(OTHER_ROW())],
      omitted: 0,
    });
    if (result.status === "ok")
      expect(result.rows[0].variants[0].price_paise).toBe(B(1900000));
    expect(deps.report).not.toHaveBeenCalled();
  });

  it("the fixtures are sound: the sample rows are valid, and each bad row alone is invalid", () => {
    for (const row of [sampleRow(), OTHER_ROW()])
      expect(publicCatalogueRowSchema.safeParse(row).success).toBe(true);
    for (const [, , build] of BAD_ROWS)
      expect(validateCatalogueRows([build()], () => {})).toEqual({
        status: "unavailable",
        reason: "malformed",
      });
  });

  it.each(BAD_ROWS)(
    "leaves out a row with %s (%s), keeps the valid one and reports it",
    async (_label, problem, build) => {
      const { result, deps } = await readRows([sampleRow(), build()]);
      expect(result).toEqual({
        status: "ok",
        rows: [parsed(sampleRow())],
        omitted: 1,
      });
      expect(deps.report).toHaveBeenCalledTimes(1);
      expect(deps.report).toHaveBeenCalledWith(
        `[catalogue] 1 of 2 public_catalogue rows left out (${problem})`,
      );
    },
  );

  it("is unavailable (malformed), never an empty catalogue, when every row is invalid", async () => {
    const { result, deps } = await readRows([
      BAD_ROWS[0][2](),
      BAD_ROWS[6][2](),
    ]);
    expect(result).toEqual({ status: "unavailable", reason: "malformed" });
    expect(deps.report).toHaveBeenCalledWith(
      "[catalogue] 2 of 2 public_catalogue rows left out (variants:invalid_type; images:path)",
    );
  });

  it("keeps the valid rows of a mixed read and counts every row left out", async () => {
    const { result, deps } = await readRows([
      sampleRow(),
      BAD_ROWS[2][2](),
      OTHER_ROW(),
      BAD_ROWS[5][2](),
      BAD_ROWS[9][2](),
    ]);
    expect(result).toEqual({
      status: "ok",
      rows: [parsed(sampleRow()), parsed(OTHER_ROW())],
      omitted: 3,
    });
    expect(deps.report).toHaveBeenCalledTimes(1);
    expect(deps.report).toHaveBeenCalledWith(
      "[catalogue] 3 of 5 public_catalogue rows left out (variants:too_small; images:too_small; :unrecognized_keys)",
    );
  });

  it("names at most three issues of one row", async () => {
    const { deps } = await readRows([
      sampleRow(),
      {
        ...sampleRow(),
        title: "",
        hook: "",
        description: "",
        seo_title: "",
        default_alt: "",
      },
    ]);
    expect(deps.report).toHaveBeenCalledWith(
      "[catalogue] 1 of 2 public_catalogue rows left out (title:too_small,hook:too_small,description:too_small)",
    );
  });

  it("the report is sanitised: counts, field paths and issue codes only — never a value, a row, a path, a slug or a key", async () => {
    const longHue = `Leaked hue ${"h".repeat(60)}`;
    const longTitle = `Leaked title ${"t".repeat(160)}`;
    const foreignPath = `artworks/${OTHER_SLUG}/frame-white-480.webp`;
    const { result, deps } = await readRows([
      OTHER_ROW(),
      { ...sampleRow(), palette_hues: [longHue] },
      { ...sampleRow(), title: longTitle },
      withImages((images) =>
        images.map((image, index) =>
          index === 0 ? { ...image, path: foreignPath } : image,
        ),
      ),
      { ...sampleRow(), api_key: SECRET, publishable: PUBLISHABLE },
      "not a row",
    ]);
    expect(result).toMatchObject({ status: "ok", omitted: 5 });
    expect(deps.report).toHaveBeenCalledTimes(1);
    const [message] = deps.report.mock.calls[0];
    expect(message).toBe(
      "[catalogue] 5 of 6 public_catalogue rows left out (palette_hues.0:too_big; title:too_big; images:path; :unrecognized_keys; :invalid_type)",
    );
    for (const leak of [
      longHue,
      "Leaked",
      longTitle,
      "The Bridge of Blue Stone",
      "The Moon Between Two Peaks",
      SLUG,
      OTHER_SLUG,
      foreignPath,
      "artworks/",
      ".webp",
      "api_key",
      "publishable",
      SECRET,
      PUBLISHABLE,
      "sb_",
      "not a row",
      TEST_REF,
      "supabase.co",
    ])
      expect(message, leak).not.toContain(leak);
    // Inside the parentheses: lower-case field names, indices, issue codes and separators — no hyphen, slash or capital.
    expect(message).toMatch(
      /^\[catalogue\] \d+ of \d+ public_catalogue rows left out \([a-z0-9_.:,; ]+\)$/,
    );
  });

  it("an empty list is an empty catalogue and reports nothing", () => {
    const report = vi.fn();
    expect(validateCatalogueRows([], report)).toEqual({
      status: "ok",
      rows: [],
      omitted: 0,
    });
    expect(report).not.toHaveBeenCalled();
  });
});

describe("the tagged, session-less public client", () => {
  it("catalogueRequestInit keeps the request's method, headers, body and signal and adds the one tag and the ISR window", () => {
    const signal = new AbortController().signal;
    const headers = { apikey: PUBLISHABLE, accept: "application/json" };
    const init: RequestInit = {
      method: "POST",
      headers,
      body: '{"a":1}',
      signal,
    };
    const tagged = catalogueRequestInit(init);
    expect(tagged).toEqual({
      method: "POST",
      headers,
      body: '{"a":1}',
      signal,
      next: { tags: ["public-catalogue"], revalidate: 3600 },
    });
    expect(tagged.headers).toBe(headers);
    expect(tagged.signal).toBe(signal);
    // The caller's options are not changed.
    expect(init).not.toHaveProperty("next");
    expect(CATALOGUE_TAG).toBe("public-catalogue");
    expect(CATALOGUE_REVALIDATE_SECONDS).toBe(3600);
  });

  it("catalogueRequestInit tags a request without options, and a caller's own data-cache options cannot replace the catalogue's", () => {
    const expected = {
      tags: [CATALOGUE_TAG],
      revalidate: CATALOGUE_REVALIDATE_SECONDS,
    };
    expect(catalogueRequestInit()).toEqual({ next: expected });
    expect(
      catalogueRequestInit({ next: { tags: ["other"], revalidate: 0 } }),
    ).toEqual({ next: expected });
  });

  it("CATALOGUE_CLIENT_OPTIONS is session-less and carries the tagging fetch", () => {
    expect(CATALOGUE_CLIENT_OPTIONS).toEqual({
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: { fetch: expect.any(Function) },
    });
  });

  it("the client's fetch hands each request to the global fetch with the tagged options", async () => {
    const response = new Response("[]", { status: 200 });
    const globalFetch = vi.fn(async () => response);
    vi.stubGlobal("fetch", globalFetch);
    const fetchOption = CATALOGUE_CLIENT_OPTIONS.global?.fetch;
    if (!fetchOption) throw new Error("the client options carry no fetch");
    const url = `${TEST_URL}/rest/v1/public_catalogue?select=slug`;
    const signal = new AbortController().signal;
    const init: RequestInit = {
      method: "GET",
      headers: { apikey: PUBLISHABLE },
      signal,
    };
    expect(await fetchOption(url, init)).toBe(response);
    expect(globalFetch).toHaveBeenCalledTimes(1);
    expect(globalFetch).toHaveBeenCalledWith(url, {
      ...init,
      next: {
        tags: [CATALOGUE_TAG],
        revalidate: CATALOGUE_REVALIDATE_SECONDS,
      },
    });
  });
});

describe("catalogueForRender — unavailable renders only while building outside Vercel unconfigured; otherwise it throws", () => {
  async function rejection(promise: Promise<unknown>): Promise<unknown> {
    return promise.then(
      () => null,
      (error: unknown) => error,
    );
  }

  it("returns an ok read as is, without asking for the phase or the platform", async () => {
    const ok: CatalogueRead = { status: "ok", rows: [], omitted: 0 };
    const read = vi.fn(async () => ok);
    const building = vi.fn(() => false);
    const deployment = vi.fn(() => false);
    expect(await catalogueForRender(read, building, deployment)).toBe(ok);
    expect(read).toHaveBeenCalledTimes(1);
    expect(building).not.toHaveBeenCalled();
    expect(deployment).not.toHaveBeenCalled();
  });

  it("returns the not_configured read as is while building outside Vercel — the honest state of a build that cannot be deployed", async () => {
    const unavailable: CatalogueRead = {
      status: "unavailable",
      reason: "not_configured",
    };
    expect(
      await catalogueForRender(
        async () => unavailable,
        () => true,
        () => false,
      ),
    ).toBe(unavailable);
  });

  it("throws not_configured while building on Vercel — a deployment never ships the unavailable state", async () => {
    const error = await rejection(
      catalogueForRender(
        async () => ({ status: "unavailable", reason: "not_configured" }),
        () => true,
        () => true,
      ),
    );
    expect(error).toBeInstanceOf(CatalogueUnavailableError);
    expect(error).toMatchObject({ reason: "not_configured" });
  });

  it.each(REASONS.filter((reason) => reason !== "not_configured"))(
    "throws CatalogueUnavailableError (%s) while building too — a configured build stops, so the previous deployment keeps serving",
    async (reason) => {
      const error = await rejection(
        catalogueForRender(
          async () => ({ status: "unavailable", reason }),
          () => true,
          () => false,
        ),
      );
      expect(error).toBeInstanceOf(CatalogueUnavailableError);
      if (!(error instanceof CatalogueUnavailableError)) return;
      expect(error.reason).toBe(reason);
      expect(error.message).toBe(`public catalogue unavailable (${reason})`);
    },
  );

  it.each(REASONS)(
    "throws CatalogueUnavailableError (%s) at run time, carrying the reason only",
    async (reason) => {
      const error = await rejection(
        catalogueForRender(
          async () => ({ status: "unavailable", reason }),
          () => false,
        ),
      );
      expect(error).toBeInstanceOf(CatalogueUnavailableError);
      expect(error).toBeInstanceOf(Error);
      if (!(error instanceof CatalogueUnavailableError)) return;
      expect(error.reason).toBe(reason);
      expect(error.name).toBe("CatalogueUnavailableError");
      expect(error.message).toBe(`public catalogue unavailable (${reason})`);
    },
  );

  it("the run-time error of a failed real read names no URL, ref, key or upstream text", async () => {
    const { deps } = readerDeps({
      data: null,
      error: {
        code: "42501",
        message: `permission denied at ${TEST_URL} for ${PUBLISHABLE}`,
      },
    });
    const error = await rejection(
      catalogueForRender(
        () => readPublicCatalogue(deps),
        () => false,
      ),
    );
    expect(error).toBeInstanceOf(CatalogueUnavailableError);
    if (!(error instanceof CatalogueUnavailableError)) return;
    expect(error.reason).toBe("query_failed");
    expect(error.cause).toBeUndefined();
    const visible = `${error.message} ${String(error)} ${JSON.stringify(error)}`;
    for (const leak of [
      TEST_URL,
      TEST_REF,
      PROD_REF,
      "supabase.co",
      PUBLISHABLE,
      SECRET,
      "sb_",
      "permission denied",
    ])
      expect(visible, leak).not.toContain(leak);
  });

  it.each([
    ["phase-production-build", true],
    [undefined, false],
    ["", false],
    ["phase-production-server", false],
    ["phase-development-server", false],
    ["phase-export", false],
    ["PHASE-PRODUCTION-BUILD", false],
  ])("isBuildPhase: NEXT_PHASE=%j is the build: %s", (phase, expected) => {
    vi.stubEnv("NEXT_PHASE", phase);
    expect(isBuildPhase()).toBe(expected);
  });

  it.each([
    ["1", true],
    [undefined, false],
    ["", false],
    ["0", false],
    ["true", false],
  ])("isVercelDeployment: VERCEL=%j is Vercel: %s", (value, expected) => {
    vi.stubEnv("VERCEL", value);
    expect(isVercelDeployment()).toBe(expected);
  });

  it("getPublicCatalogue, unconfigured at run time, throws not_configured and builds no client", async () => {
    stubEmptyEnvironment();
    vi.stubEnv("NEXT_PHASE", undefined);
    const error = await rejection(getPublicCatalogue());
    expect(error).toBeInstanceOf(CatalogueUnavailableError);
    expect(error).toMatchObject({ reason: "not_configured" });
    expect(sdk.createClient).not.toHaveBeenCalled();
  });

  it("getPublicCatalogue, unconfigured while building outside Vercel, renders the honest unavailable state", async () => {
    stubEmptyEnvironment();
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    vi.stubEnv("VERCEL", undefined);
    expect(await getPublicCatalogue()).toEqual({
      status: "unavailable",
      reason: "not_configured",
    });
    expect(sdk.createClient).not.toHaveBeenCalled();
  });

  it("getPublicCatalogue on a Vercel build with a missing ref throws not_configured — the build stops", async () => {
    stubPreviewEnvironment();
    vi.stubEnv("SUPABASE_PROD_PROJECT_REF", undefined);
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    vi.stubEnv("VERCEL", "1");
    const error = await rejection(getPublicCatalogue());
    expect(error).toBeInstanceOf(CatalogueUnavailableError);
    expect(error).toMatchObject({ reason: "not_configured" });
    expect(sdk.createClient).not.toHaveBeenCalled();
  });

  it("getPublicCatalogue, configured while building, throws query_failed when the read fails — the build stops", async () => {
    stubPreviewEnvironment();
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    const { client } = fakeClient({
      data: null,
      error: { code: "PGRST002", message: "upstream unavailable" },
    });
    sdk.createClient.mockReturnValueOnce(client);
    const error = await rejection(getPublicCatalogue());
    expect(error).toBeInstanceOf(CatalogueUnavailableError);
    expect(error).toMatchObject({ reason: "query_failed" });
    expect(sdk.createClient).toHaveBeenCalledTimes(1);
  });
});

describe("defaultCatalogueReaderDependencies — the public pair and the identity facts, never the secret", () => {
  it("env() returns exactly the five public and identity names, never SUPABASE_SECRET_KEY", () => {
    stubPreviewEnvironment();
    const env = defaultCatalogueReaderDependencies().env();
    expect(env).toEqual(previewEnv());
    expect(Object.keys(env).sort()).toEqual([...PUBLIC_READ_NAMES].sort());
    expect(env).not.toHaveProperty("SUPABASE_SECRET_KEY");
    expect(JSON.stringify(env)).not.toContain(SECRET);
  });

  it("createPublicClient builds this build's public client through the browser factory with the catalogue options", () => {
    stubPreviewEnvironment();
    const result = defaultCatalogueReaderDependencies().createPublicClient();
    expect(result).toEqual({
      ok: true,
      projectRef: TEST_REF,
      client: { kind: "fake-client" },
    });
    expect(sdk.createClient).toHaveBeenCalledTimes(1);
    const [url, key, options] = sdk.createClient.mock.calls[0] as unknown[];
    expect(url).toBe(TEST_URL);
    expect(key).toBe(PUBLISHABLE);
    expect(options).toBe(CATALOGUE_CLIENT_OPTIONS);
  });

  it("createPublicClient builds nothing without the public pair", () => {
    stubEmptyEnvironment();
    expect(defaultCatalogueReaderDependencies().createPublicClient()).toEqual({
      ok: false,
      reason: "not_configured",
    });
    expect(sdk.createClient).not.toHaveBeenCalled();
  });

  it("report writes the sanitised line to the server log", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      defaultCatalogueReaderDependencies().report("[catalogue] a line");
      expect(log).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledWith("[catalogue] a line");
    } finally {
      log.mockRestore();
    }
  });

  it("readPublicCatalogue() on a configured Preview reads the projection through the default dependencies", async () => {
    stubPreviewEnvironment();
    const { client, calls } = fakeClient({ data: [sampleRow()], error: null });
    sdk.createClient.mockReturnValueOnce(client);
    expect(await readPublicCatalogue()).toEqual({
      status: "ok",
      rows: [parsed(sampleRow())],
      omitted: 0,
    });
    expect(sdk.createClient).toHaveBeenCalledWith(
      TEST_URL,
      PUBLISHABLE,
      CATALOGUE_CLIENT_OPTIONS,
    );
    expect(calls.map((call) => call.method)).toEqual([
      "from",
      "select",
      "abortSignal",
    ]);
  });

  it("readPublicCatalogue() from an empty environment is not_configured and builds no client", async () => {
    stubEmptyEnvironment();
    expect(await readPublicCatalogue()).toEqual({
      status: "unavailable",
      reason: "not_configured",
    });
    expect(sdk.createClient).not.toHaveBeenCalled();
  });
});

describe("the five browse pages — ISR at the catalogue's window, nothing read per request", () => {
  const PAGES = [
    "src/app/(public)/shop/page.tsx",
    "src/app/(public)/collections/page.tsx",
    "src/app/(public)/collections/[slug]/page.tsx",
    "src/app/(public)/art-styles/page.tsx",
    "src/app/(public)/art-styles/[slug]/page.tsx",
  ];
  const DETAIL_PAGES = PAGES.filter((page) => page.includes("[slug]"));
  const source = (page: string) =>
    readFileSync(path.join(ROOT, page), "utf8").replace(/\r\n/g, "\n");

  it("covers the two detail pages", () => {
    expect(DETAIL_PAGES).toHaveLength(2);
  });

  it.each(PAGES)(
    "%s declares the window as the literal the build needs and reads the catalogue reader",
    (page) => {
      const text = source(page);
      const declared = [
        ...text.matchAll(/^export const revalidate = (\d+);$/gm),
      ].map((match) => Number(match[1]));
      expect(declared).toEqual([CATALOGUE_REVALIDATE_SECONDS]);
      expect(text).toContain(
        `export const revalidate = ${CATALOGUE_REVALIDATE_SECONDS};`,
      );
      expect(text).toContain('from "@/lib/server/catalogue"');
    },
  );

  it.each(DETAIL_PAGES)(
    "%s is generated for its approved slugs only",
    (page) => {
      const text = source(page);
      expect(text).toMatch(/^export const dynamicParams = false;$/m);
      expect(text).toMatch(
        /^export (?:async )?function generateStaticParams\(/m,
      );
    },
  );

  it.each(PAGES)("%s reads no request-time value", (page) => {
    const text = source(page);
    expect(text).not.toContain("searchParams");
    expect(text).not.toMatch(/\bcookies\s*\(/);
    expect(text).not.toMatch(/\bheaders\s*\(/);
    expect(text).not.toMatch(/\bconnection\s*\(/);
    expect(text).not.toContain('from "next/headers"');
    expect(text).not.toMatch(/force-dynamic|force-no-store|fetchCache/);
  });
});
