import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CartPage, { metadata as cartMetadata } from "@/app/(public)/cart/page";
import {
  bagLines,
  bagStatusMessages,
  currentAnswer,
  rememberArtworks,
  subtotalText,
  validationFailed,
  type ArtworkFacts,
} from "@/components/commerce/bag-lines";
import {
  CART_ROW_SIZES,
  DRAWER_ROW_SIZES,
} from "@/components/commerce/bag-row";
import { BagProvider } from "@/components/commerce/bag-provider";
import { CheckoutAvailabilityProvider } from "@/components/commerce/checkout-availability";
import { CheckoutControl } from "@/components/commerce/checkout-control";
import { OverlayErrorBoundary } from "@/components/shell/overlay-error-boundary";
import { PublicShell } from "@/components/shell/public-shell";
import { loadPlan } from "@/components/shell/reload-on-path-change";
import {
  BAG_ROW,
  BAG_STATUS,
  BAG_STORAGE_NOTICES,
  CART_HEAD,
  CART_PAGE,
  CHECKOUT_CONTROL,
} from "@/content/public/cart";
import { CATALOGUE_STATES } from "@/content/public/browse";
import { RECOVERY } from "@/content/public/pages";
import { CART_DRAWER, HEADER } from "@/content/public/shell";
import { catalogueImage } from "@/lib/site-images";
import {
  requestBagValidation,
  type BagRow,
  BAG_STORAGE_KEY,
  createBagStore,
  createBagValidationController,
  EMPTY_BAG_RESULT,
  IDLE_VALIDATION,
  quantityFromInput,
  UNHYDRATED_BAG,
  type BagSnapshot,
  type BagValidationOutcome,
  type BagValidationState,
  type BagValidator,
} from "@/lib/bag";
import {
  BAG_MAX_BODY_BYTES,
  BAG_MAX_QUANTITY,
  BAG_MAX_ROWS,
  bagErrorResponseSchema,
  bagOkResponseSchema,
  bagRequestSchema,
  type BagValidationResult,
} from "@/lib/schemas/bag";
import {
  FINISH_NAMES,
  publicCatalogueRowSchema,
  type PublicCatalogueRow,
} from "@/lib/schemas/catalogue";
import {
  handleBagRequest,
  validateBag,
  type BagRequestDependencies,
} from "@/lib/server/bag";
import type {
  CatalogueRead,
  CatalogueUnavailableReason,
} from "@/lib/server/catalogue";
import type { ThrottleOutcome } from "@/lib/server/login-throttle";

/**
 * Bag validation — S1.5 (src/lib/server/bag.ts, src/lib/schemas/bag.ts, src/lib/bag/validate.ts; docs/sprint-prompts/
 * S1.5-artwork-bag-cart.md §H.2 "POST /api/bag and validateBag()"): the one public, read-only validation endpoint.
 * Allowed: a strict body of variant codes and quantities answered with the projection's own titles, availability and
 * exact paise. Denied: every other method, content type, shape, size and value — each before the projection is read
 * (the read is a recording fake and must not be called), and the endpoint has no write path at all. A catalogue that
 * cannot be read is a 503, never an empty successful bag. Every answer is `no-store`. Hermetic: the read is injected;
 * the default path's fresh read is exercised with a stubbed global fetch, so nothing reaches a network.
 */

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

const SLUG = "the-bridge-of-blue-stone";
const OTHER = "the-moon-between-two-peaks";
const PRICES = { white: 1900000, black: 2100000, "antique-gold": 2300000 };
const URL_ = "https://studio.example.invalid/api/bag";

type Finish = keyof typeof PRICES;

/** A complete, valid projection row (the shape of tests/unit/catalogue-reader.test.ts → sampleRow()). */
function sampleRow(
  slug = SLUG,
  title = "The Bridge of Blue Stone",
  availability: Partial<Record<Finish, "made_to_order" | "unavailable">> = {},
): Record<string, unknown> {
  const finishes = ["white", "black", "antique-gold"] as const;
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
    orientation: slug === OTHER ? "Landscape" : "Portrait",
    rooms: ["Living Room"],
    moods: ["Full of wonder"],
    palettes: ["Gold & Gilded"],
    palette_hues: ["Azurite blue"],
    suggested_frame: "antique-gold",
    featured: false,
    lead_time: null,
    seo_title: "Blue and Gold Wall Art | Aalishaan Studio",
    seo_description: "A mineral-blue bridge crosses a burnished river.",
    default_alt: "The Bridge of Blue Stone in a antique gold frame",
    image_alt_text: "The Bridge of Blue Stone, portrait A2",
    published_at: "2026-10-05T10:00:00+00:00",
    variants: finishes.map((finish) => ({
      finish,
      finish_name: FINISH_NAMES[finish],
      variant_code: `${slug}:${finish}`,
      price_paise: PRICES[finish],
      currency: "INR",
      availability: availability[finish] ?? "made_to_order",
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

const parsedRow = (row: Record<string, unknown>): PublicCatalogueRow =>
  publicCatalogueRowSchema.parse(row);

const CATALOGUE: CatalogueRead = {
  status: "ok",
  rows: [
    parsedRow(sampleRow()),
    parsedRow(
      sampleRow(OTHER, "The Moon Between Two Peaks", { black: "unavailable" }),
    ),
  ],
  omitted: 0,
};

function deps(
  read: CatalogueRead | (() => Promise<CatalogueRead>) = CATALOGUE,
) {
  return {
    read: vi.fn(typeof read === "function" ? read : async () => read),
    report: vi.fn<(message: string) => void>(),
    // S1.6 (D-58 #3): the rate limit, allowing by default; tests/unit/bag-throttle.test.ts covers the limiter itself.
    limit: vi.fn<(address: string) => Promise<ThrottleOutcome>>(async () => ({
      ok: true,
    })),
  } satisfies BagRequestDependencies;
}

type RequestOptions = {
  method?: string;
  contentType?: string | null;
  headers?: Record<string, string>;
  body?: BodyInit | null;
};

const item = (variant_code: string, quantity: number) => ({
  variant_code,
  quantity,
});

function bagRequest(
  payload: unknown = { items: [item(`${SLUG}:white`, 1)] },
  options: RequestOptions = {},
): Request {
  const headers = new Headers(options.headers);
  const contentType =
    options.contentType === undefined
      ? "application/json"
      : options.contentType;
  if (contentType !== null) headers.set("content-type", contentType);
  const init: RequestInit & { duplex: "half" } = {
    method: options.method ?? "POST",
    headers,
    duplex: "half",
  };
  const body =
    options.body === undefined ? JSON.stringify(payload) : options.body;
  if (body !== null) init.body = body;
  return new Request(URL_, init);
}

async function answer(response: Response) {
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("content-type")).toMatch(/^application\/json/);
  return (await response.json()) as Record<string, unknown>;
}

/** A denial before any read: the status, the one enumerated body, no read, nothing reported. */
async function expectDenied(
  response: Response,
  dependencies: ReturnType<typeof deps>,
  status: number,
  body: string,
) {
  expect(response.status).toBe(status);
  const json = await answer(response);
  expect(json).toEqual({ status: body });
  expect(bagErrorResponseSchema.safeParse(json).success).toBe(true);
  expect(dependencies.read).not.toHaveBeenCalled();
  expect(dependencies.report).not.toHaveBeenCalled();
  // A request refused for its shape or size never reaches the rate limiter either (no Redis call).
  expect(dependencies.limit).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /api/bag — allowed", () => {
  it("answers the projection's own facts and exact paise for each row, in order", async () => {
    const d = deps();
    const response = await handleBagRequest(
      bagRequest({
        items: [item(`${SLUG}:antique-gold`, 3), item(`${OTHER}:white`, 99)],
      }),
      d,
    );
    expect(response.status).toBe(200);
    const json = await answer(response);
    expect(json).toEqual({
      status: "ok",
      items: [
        {
          variant_code: `${SLUG}:antique-gold`,
          quantity: 3,
          slug: SLUG,
          title: "The Bridge of Blue Stone",
          orientation: "Portrait",
          finish: "antique-gold",
          finish_name: "Antique Gold",
          available: true,
          unit_price_paise: "2300000",
          line_total_paise: "6900000",
        },
        {
          variant_code: `${OTHER}:white`,
          quantity: 99,
          slug: OTHER,
          title: "The Moon Between Two Peaks",
          orientation: "Landscape",
          finish: "white",
          finish_name: "White",
          available: true,
          unit_price_paise: "1900000",
          line_total_paise: "188100000",
        },
      ],
      removed: [],
      // 3 × 2,300,000 + 99 × 1,900,000 paise, exactly.
      subtotal_paise: "195000000",
      item_count: 102,
    });
    expect(d.read).toHaveBeenCalledTimes(1);
    expect(d.report).not.toHaveBeenCalled();
    const parsed = bagOkResponseSchema.parse(json);
    expect(parsed.subtotal_paise).toBe(BigInt(195000000));
  });

  it("removes a code the projection does not hold (unknown, draft, hidden, retired) — it never becomes an item", async () => {
    const d = deps();
    const json = await answer(
      await handleBagRequest(
        bagRequest({
          items: [
            item("the-ship-behind-the-fog-bell:white", 2),
            item(`${SLUG}:black`, 1),
            item("no-such-artwork:antique-gold", 5),
          ],
        }),
        d,
      ),
    );
    expect(json.items).toEqual([
      expect.objectContaining({ variant_code: `${SLUG}:black`, quantity: 1 }),
    ]);
    expect(json.removed).toEqual([
      {
        variant_code: "the-ship-behind-the-fog-bell:white",
        reason: "not_found",
      },
      { variant_code: "no-such-artwork:antique-gold", reason: "not_found" },
    ]);
    expect(json.subtotal_paise).toBe("2100000");
    expect(json.item_count).toBe(1);
  });

  it("keeps an unavailable variant, marked, out of the subtotal but in the count", async () => {
    const json = await answer(
      await handleBagRequest(
        bagRequest({
          items: [item(`${OTHER}:black`, 2), item(`${OTHER}:white`, 1)],
        }),
        deps(),
      ),
    );
    expect(json.items).toEqual([
      expect.objectContaining({
        variant_code: `${OTHER}:black`,
        available: false,
        unit_price_paise: "2100000",
        line_total_paise: "4200000",
      }),
      expect.objectContaining({
        variant_code: `${OTHER}:white`,
        available: true,
      }),
    ]);
    expect(json.subtotal_paise).toBe("1900000");
    expect(json.item_count).toBe(3);
    expect(bagOkResponseSchema.safeParse(json).success).toBe(true);
  });

  it("an empty projection (Production until S3.3) removes every row; nothing is invented", async () => {
    const json = await answer(
      await handleBagRequest(
        bagRequest({ items: [item(`${SLUG}:white`, 1)] }),
        deps({ status: "ok", rows: [], omitted: 0 }),
      ),
    );
    expect(json).toEqual({
      status: "ok",
      items: [],
      removed: [{ variant_code: `${SLUG}:white`, reason: "not_found" }],
      subtotal_paise: "0",
      item_count: 0,
    });
  });

  it("an empty bag is answered without reading the projection", async () => {
    const d = deps();
    const json = await answer(
      await handleBagRequest(bagRequest({ items: [] }), d),
    );
    expect(json).toEqual({
      status: "ok",
      items: [],
      removed: [],
      subtotal_paise: "0",
      item_count: 0,
    });
    expect(d.read).not.toHaveBeenCalled();
  });

  it("accepts the largest bag (66 rows at 99) and a body of exactly 16 KiB", async () => {
    const rows = [SLUG, OTHER].flatMap((slug) =>
      (["white", "black", "antique-gold"] as const).map((finish) =>
        item(`${slug}:${finish}`, BAG_MAX_QUANTITY),
      ),
    );
    const padded = JSON.stringify({ items: rows }).padEnd(
      BAG_MAX_BODY_BYTES,
      " ",
    );
    expect(new TextEncoder().encode(padded).byteLength).toBe(
      BAG_MAX_BODY_BYTES,
    );
    const response = await handleBagRequest(
      bagRequest(undefined, { body: padded }),
      deps(),
    );
    expect(response.status).toBe(200);
    const many = Array.from({ length: BAG_MAX_ROWS }, (_, index) =>
      item(`artwork-${index}:white`, BAG_MAX_QUANTITY),
    );
    expect(bagRequestSchema.safeParse({ items: many }).success).toBe(true);
  });

  it("accepts a JSON content type with parameters", async () => {
    const response = await handleBagRequest(
      bagRequest(undefined, { contentType: "application/json; charset=utf-8" }),
      deps(),
    );
    expect(response.status).toBe(200);
  });
});

describe("POST /api/bag — tampered or invalid bodies are refused before any read", () => {
  it.each([
    [
      "a supplied unit price",
      { items: [{ ...item(`${SLUG}:white`, 1), price_paise: 1 }] },
    ],
    [
      "a supplied line total",
      { items: [{ ...item(`${SLUG}:white`, 1), line_total_paise: "1" }] },
    ],
    [
      "a supplied title",
      { items: [{ ...item(`${SLUG}:white`, 1), title: "Free art" }] },
    ],
    [
      "a supplied image",
      { items: [{ ...item(`${SLUG}:white`, 1), image: "x.webp" }] },
    ],
    [
      "a supplied subtotal",
      { items: [item(`${SLUG}:white`, 1)], subtotal_paise: "1" },
    ],
    ["a supplied total", { items: [item(`${SLUG}:white`, 1)], total: 0 }],
    ["a currency", { items: [item(`${SLUG}:white`, 1)], currency: "USD" }],
    [
      "a duplicate code",
      { items: [item(`${SLUG}:white`, 1), item(`${SLUG}:white`, 2)] },
    ],
    ["a zero quantity", { items: [item(`${SLUG}:white`, 0)] }],
    ["a negative quantity", { items: [item(`${SLUG}:white`, -1)] }],
    ["a fractional quantity", { items: [item(`${SLUG}:white`, 1.5)] }],
    ["a quantity of 100", { items: [item(`${SLUG}:white`, 100)] }],
    ["a huge quantity", { items: [item(`${SLUG}:white`, 1e21)] }],
    ["an unsafe integer", { items: [item(`${SLUG}:white`, 2 ** 53 + 2)] }],
    [
      "a string quantity",
      { items: [{ variant_code: `${SLUG}:white`, quantity: "2" }] },
    ],
    [
      "a null quantity",
      { items: [{ variant_code: `${SLUG}:white`, quantity: null }] },
    ],
    ["a missing quantity", { items: [{ variant_code: `${SLUG}:white` }] }],
    ["an invalid finish", { items: [item(`${SLUG}:gold`, 1)] }],
    ["an upper-case code", { items: [item(`THE-BRIDGE:white`, 1)] }],
    [
      "a code that is not a string",
      { items: [{ variant_code: 7, quantity: 1 }] },
    ],
    ["an over-long code", { items: [item(`${"a".repeat(140)}:white`, 1)] }],
    [
      "67 rows",
      {
        items: Array.from({ length: BAG_MAX_ROWS + 1 }, (_, index) =>
          item(`artwork-${index}:white`, 1),
        ),
      },
    ],
    [
      "items not an array",
      { items: { variant_code: `${SLUG}:white`, quantity: 1 } },
    ],
    ["no items", {}],
    ["an array body", [item(`${SLUG}:white`, 1)]],
    ["null", null],
    ["a string", "items"],
  ])("refuses %s with 400", async (_label, payload) => {
    const d = deps();
    await expectDenied(
      await handleBagRequest(bagRequest(payload), d),
      d,
      400,
      "invalid_request",
    );
  });

  it.each([
    ["not JSON", "{items:"],
    ["an empty body", ""],
    [
      "a non-finite quantity",
      `{"items":[{"variant_code":"${SLUG}:white","quantity":1e400}]}`,
    ],
  ])("refuses %s with 400", async (_label, body) => {
    const d = deps();
    await expectDenied(
      await handleBagRequest(bagRequest(undefined, { body }), d),
      d,
      400,
      "invalid_request",
    );
  });

  it("refuses invalid UTF-8 with 400", async () => {
    const d = deps();
    await expectDenied(
      await handleBagRequest(
        bagRequest(undefined, { body: new Uint8Array([0x7b, 0xff, 0x7d]) }),
        d,
      ),
      d,
      400,
      "invalid_request",
    );
  });

  it("never echoes the request in a refusal", async () => {
    const marker = "zz-echo-marker-zz";
    const response = await handleBagRequest(
      bagRequest({ items: [{ variant_code: marker, quantity: 1 }] }),
      deps(),
    );
    const text = await response.text();
    expect(text).toBe('{"status":"invalid_request"}');
    expect(text).not.toContain(marker);
  });
});

describe("POST /api/bag — content type, size and method", () => {
  it.each([
    ["text/plain", "text/plain"],
    ["form data", "application/x-www-form-urlencoded"],
    ["a JSON look-alike", "application/jsonp"],
    ["none", null],
  ])("refuses the content type %s with 400", async (_label, contentType) => {
    const d = deps();
    await expectDenied(
      await handleBagRequest(bagRequest(undefined, { contentType }), d),
      d,
      400,
      "invalid_request",
    );
  });

  it("refuses a declared length above 16 KiB with 413 without reading the body", async () => {
    const d = deps();
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          pulls += 1;
          controller.close();
        },
      },
      { highWaterMark: 0 },
    );
    const request = bagRequest(undefined, {
      body: stream,
      headers: { "content-length": String(BAG_MAX_BODY_BYTES + 1) },
    });
    expect(request.headers.get("content-length")).toBe("16385");
    await expectDenied(await handleBagRequest(request, d), d, 413, "too_large");
    expect(pulls).toBe(0);
  });

  it.each(["abc", "-1", "1e2", "1.5"])(
    "refuses the declared length %j with 400",
    async (length) => {
      const d = deps();
      await expectDenied(
        await handleBagRequest(
          bagRequest(undefined, { headers: { "content-length": length } }),
          d,
        ),
        d,
        400,
        "invalid_request",
      );
    },
  );

  it("refuses an actual body above 16 KiB with 413, cancelling the stream (no declared length)", async () => {
    const d = deps();
    const encoder = new TextEncoder();
    let pulls = 0;
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          pulls += 1;
          controller.enqueue(encoder.encode(" ".repeat(4096)));
        },
        cancel() {
          cancelled = true;
        },
      },
      { highWaterMark: 0 },
    );
    const request = bagRequest(undefined, { body: stream });
    expect(request.headers.get("content-length")).toBeNull();
    await expectDenied(await handleBagRequest(request, d), d, 413, "too_large");
    expect(pulls).toBe(5);
    expect(cancelled).toBe(true);
  });

  it("bounds the bytes actually read when a declared length understates the body", async () => {
    const d = deps();
    await expectDenied(
      await handleBagRequest(
        bagRequest(undefined, {
          body: " ".repeat(BAG_MAX_BODY_BYTES + 1),
          headers: { "content-length": "10" },
        }),
        d,
      ),
      d,
      413,
      "too_large",
    );
  });

  it.each(["GET", "HEAD", "PUT", "PATCH", "DELETE", "OPTIONS"])(
    "refuses %s with 405 and Allow: POST",
    async (method) => {
      const d = deps();
      const response = await handleBagRequest(
        bagRequest(undefined, { method, body: null }),
        d,
      );
      expect(response.headers.get("allow")).toBe("POST");
      await expectDenied(response, d, 405, "method_not_allowed");
    },
  );
});

describe("POST /api/bag — a catalogue that cannot be read is 503, never an empty successful bag", () => {
  it.each<CatalogueUnavailableReason>([
    "not_configured",
    "identity_mismatch",
    "query_failed",
    "malformed",
  ])("answers 503 for %s and reports the reason code only", async (reason) => {
    const d = deps({ status: "unavailable", reason });
    const response = await handleBagRequest(
      bagRequest({ items: [item(`${SLUG}:white`, 3)] }),
      d,
    );
    expect(response.status).toBe(503);
    expect(await answer(response)).toEqual({ status: "unavailable" });
    expect(d.read).toHaveBeenCalledTimes(1);
    expect(d.report).toHaveBeenCalledTimes(1);
    expect(d.report).toHaveBeenCalledWith(
      `[bag] validation unavailable (${reason})`,
    );
    expect(d.report.mock.calls[0][0]).not.toContain(SLUG);
  });

  it("answers 503 when the read itself throws", async () => {
    const d = deps(async () => {
      throw new Error(`upstream ${SLUG} secret text`);
    });
    const response = await handleBagRequest(bagRequest(), d);
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(text).toBe('{"status":"unavailable"}');
    expect(d.report).toHaveBeenCalledWith(
      "[bag] validation unavailable (query_failed)",
    );
  });
});

describe("validateBag — server-derived amounts", () => {
  it("multiplies and sums in exact bigint paise", async () => {
    const result = await validateBag(
      [item(`${SLUG}:white`, 7), item(`${SLUG}:black`, 1)],
      async () => CATALOGUE,
    );
    expect(result).toMatchObject({
      status: "ok",
      subtotal_paise: BigInt(7 * 1900000 + 2100000),
      item_count: 8,
    });
    if (result.status !== "ok") return;
    expect(result.items.map((entry) => entry.line_total_paise)).toEqual([
      BigInt(13300000),
      BigInt(2100000),
    ]);
  });

  it("the endpoint's source has no write, no secret-key client and no service-role read", () => {
    const source = readFileSync(
      path.join(ROOT, "src", "lib", "server", "bag.ts"),
      "utf8",
    );
    expect(source).not.toMatch(
      /\.(insert|update|upsert|delete|rpc)\(|createPrivilegedClient|SUPABASE_SECRET_KEY|revalidate(Tag|Path)/,
    );
    const route = readFileSync(
      path.join(ROOT, "src", "app", "api", "bag", "route.ts"),
      "utf8",
    );
    expect(route).toMatch(/export const runtime = "nodejs";/);
    expect(route).toMatch(/export const dynamic = "force-dynamic";/);
  });
});

describe("the default path reads the projection afresh — no-store, no data-cache tag", () => {
  const TEST_REF = "abcdefghijklmnopqrst";
  const PROD_REF = "tsrqponmlkjihgfedcba";

  it("handleBagRequest's default read fetches public_catalogue with cache no-store and without next tags or revalidate", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", `https://${TEST_REF}.supabase.co`);
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      `sb_publishable_${"p".repeat(30)}`,
    );
    vi.stubEnv("SUPABASE_TEST_PROJECT_REF", TEST_REF);
    vi.stubEnv("SUPABASE_PROD_PROJECT_REF", PROD_REF);
    vi.stubEnv("VERCEL_ENV", "preview");
    // S1.6 (D-58 #3): the default path counts the check first, in Upstash (placeholder names; the pipeline answers
    // "first request in the window"), and only then reads the projection.
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example-redis.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "placeholder-token");
    const limiterCalls: Array<{ url: string; body: string }> = [];
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === "https://example-redis.upstash.io/pipeline") {
          // The limiter is asked before the projection is read.
          expect(calls).toHaveLength(0);
          limiterCalls.push({ url: String(input), body: String(init?.body) });
          return Response.json([{ result: 1 }, { result: 1 }]);
        }
        calls.push({ url: String(input), init });
        return new Response(JSON.stringify([sampleRow()]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await handleBagRequest(
        bagRequest({ items: [item(`${SLUG}:black`, 2)] }),
      );
      expect(response.status).toBe(200);
      expect((await answer(response)).subtotal_paise).toBe("4200000");
    } finally {
      log.mockRestore();
    }
    // One limiter request in the bag's own namespace, the address only as a hash …
    expect(limiterCalls).toHaveLength(1);
    expect(limiterCalls[0].body).toMatch(/\["INCR","bag:ip:[0-9a-f]{64}"\]/);
    // … then exactly one read of the projection.
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain(
      `https://${TEST_REF}.supabase.co/rest/v1/public_catalogue`,
    );
    expect(calls[0].init?.cache).toBe("no-store");
    expect(calls[0].init).not.toHaveProperty("next");
    expect(calls[0].init?.method ?? "GET").toBe("GET");
  });
});

describe("the browser's validation call (src/lib/bag/validate.ts)", () => {
  const ROWS: BagRow[] = [
    { code: `${SLUG}:white`, quantity: 2 },
    { code: "gone-artwork:black", quantity: 1 },
  ];

  /** The server's own answer for ROWS, so the client parses what the handler really sends. */
  async function serverAnswer(): Promise<string> {
    const response = await handleBagRequest(
      bagRequest({
        items: ROWS.map((entry) => item(entry.code, entry.quantity)),
      }),
      deps(),
    );
    return response.text();
  }

  function fakeFetch(respond: () => Response | Promise<Response>) {
    return vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async () => respond());
  }

  it("posts codes and quantities only, uncached, and parses the answer into exact paise", async () => {
    const text = await serverAnswer();
    const fetcher = fakeFetch(() => new Response(text, { status: 200 }));
    const outcome = await requestBagValidation(ROWS, {
      fetch: fetcher as unknown as typeof fetch,
    });
    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    expect(outcome.result.subtotal_paise).toBe(BigInt(3800000));
    expect(outcome.result.removed).toEqual([
      { variant_code: "gone-artwork:black", reason: "not_found" },
    ]);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("/api/bag");
    expect(init).toMatchObject({ method: "POST", cache: "no-store" });
    expect(new Headers(init?.headers).get("content-type")).toBe(
      "application/json",
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      items: [
        { variant_code: `${SLUG}:white`, quantity: 2 },
        { variant_code: "gone-artwork:black", quantity: 1 },
      ],
    });
  });

  it.each([
    [503, "unavailable"],
    [400, "rejected"],
    [413, "rejected"],
    [500, "rejected"],
  ])(
    "an answer of %i is failed (%s), never a total",
    async (status, reason) => {
      const outcome = await requestBagValidation(ROWS, {
        fetch: fakeFetch(
          () => new Response('{"status":"unavailable"}', { status }),
        ) as unknown as typeof fetch,
      });
      expect(outcome).toEqual({ status: "failed", reason });
    },
  );

  it("a network error is failed; an aborted request is aborted", async () => {
    const network = await requestBagValidation(ROWS, {
      fetch: (async () => {
        throw new TypeError("offline");
      }) as unknown as typeof fetch,
    });
    expect(network).toEqual({ status: "failed", reason: "network" });
    const controller = new AbortController();
    controller.abort();
    const aborted = await requestBagValidation(ROWS, {
      signal: controller.signal,
      fetch: (async () => {
        throw new DOMException("aborted", "AbortError");
      }) as unknown as typeof fetch,
    });
    expect(aborted).toEqual({ status: "aborted" });
  });

  it.each([
    ["not JSON", () => "<html>"],
    ["an error body with 200", () => '{"status":"unavailable"}'],
    [
      "a tampered line total",
      (text: string) =>
        text.replace('"line_total_paise":"3800000"', '"line_total_paise":"1"'),
    ],
    [
      "a tampered subtotal",
      (text: string) =>
        text.replace('"subtotal_paise":"3800000"', '"subtotal_paise":"0"'),
    ],
    [
      "a fractional amount",
      (text: string) =>
        text.replace(
          '"subtotal_paise":"3800000"',
          '"subtotal_paise":"3800000.5"',
        ),
    ],
    [
      "an extra key",
      (text: string) =>
        text.replace('"status":"ok"', '"status":"ok","checkout":true'),
    ],
    [
      "a wrong item count",
      (text: string) => text.replace('"item_count":2', '"item_count":3'),
    ],
    [
      "an answer for another bag",
      (text: string) =>
        text
          .replace('"quantity":2', '"quantity":3')
          .replace(
            '"line_total_paise":"3800000"',
            '"line_total_paise":"5700000"',
          )
          .replace('"subtotal_paise":"3800000"', '"subtotal_paise":"5700000"')
          .replace('"item_count":2', '"item_count":3'),
    ],
  ])("%s is invalid_response", async (_label, edit) => {
    const text = edit(await serverAnswer());
    const outcome = await requestBagValidation(ROWS, {
      fetch: fakeFetch(
        () => new Response(text, { status: 200 }),
      ) as unknown as typeof fetch,
    });
    expect(outcome).toEqual({ status: "failed", reason: "invalid_response" });
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The shared commerce UI (merged here so the S1.5 test files stay inside the sprint allowance). Its fixtures are
// scoped to this block.

describe("the shared commerce UI", () => {
  /**
   * The shared commerce UI — S1.5 (docs/sprint-prompts/S1.5-artwork-bag-cart.md §H.2; src/components/commerce/,
   * src/components/shell/): what the drawer and the cart draw from the bag and the server's answer (prices and the
   * subtotal only from the current revision's answer, never the browser's), the status sentences, the honest disabled
   * checkout control, the error boundary's reset, the global 404's load plan, the Cookies control's route through the
   * bag API, and the cart page's server render (before hydration: no bag, nothing claimed). Hermetic: pure functions,
   * injected fakes and React's server renderer.
   */

  const ROOT = fileURLToPath(new URL("../../", import.meta.url));
  const source = (relative: string) =>
    readFileSync(path.join(ROOT, relative), "utf8").replace(/\r\n/g, "\n");

  const SLUG = "the-bridge-of-blue-stone";
  const OTHER = "the-moon-between-two-peaks";
  const WHITE = `${SLUG}:white`;
  const BLACK = `${SLUG}:black`;
  const OTHER_GOLD = `${OTHER}:antique-gold`;

  const row = (code: string, quantity: number): BagRow => ({ code, quantity });

  const PRICES = {
    white: BigInt(1_900_000),
    black: BigInt(2_100_000),
    "antique-gold": BigInt(2_300_000),
  } as const;
  const NAMES = {
    white: "White",
    black: "Black",
    "antique-gold": "Antique Gold",
  } as const;
  const TITLES: Record<string, string> = {
    [SLUG]: "The Bridge of Blue Stone",
    [OTHER]: "The Moon Between Two Peaks",
  };

  /** A 200 answer for some rows, as the schema parses it (exact paise as bigint); `unavailable` codes are kept unpriced. */
  function answer(
    rows: readonly BagRow[],
    { unavailable = [] as string[], removed = [] as string[] } = {},
  ): BagValidationResult {
    const items = rows
      .filter((r) => !removed.includes(r.code))
      .map((r) => {
        const [slug, finish] = r.code.split(":") as [
          string,
          keyof typeof PRICES,
        ];
        const unit = PRICES[finish];
        return {
          variant_code: r.code,
          quantity: r.quantity,
          slug,
          title: TITLES[slug]!,
          orientation: "Portrait" as const,
          finish,
          finish_name: NAMES[finish],
          available: !unavailable.includes(r.code),
          unit_price_paise: unit,
          line_total_paise: unit * BigInt(r.quantity),
        };
      });
    return {
      status: "ok",
      items,
      removed: removed.map((variant_code) => ({
        variant_code,
        reason: "not_found" as const,
      })),
      subtotal_paise: items
        .filter((item) => item.available)
        .reduce((sum, item) => sum + item.line_total_paise, BigInt(0)),
      item_count: items.reduce((sum, item) => sum + item.quantity, 0),
    };
  }

  const snapshot = (
    rows: readonly BagRow[],
    overrides: Partial<BagSnapshot> = {},
  ): BagSnapshot => ({
    hydrated: true,
    rows,
    revision: 5,
    persistence: "local",
    notice: null,
    ...overrides,
  });
  const state = (
    overrides: Partial<BagValidationState> = {},
  ): BagValidationState => ({
    status: "pending",
    revision: 5,
    result: null,
    removedCount: 0,
    ...overrides,
  });

  describe("bag lines — prices only from the current revision's answer", () => {
    const rows = [row(WHITE, 2), row(OTHER_GOLD, 1)];

    it("an answer for the current revision draws every row: title, spec, image, link and the server's line and unit prices", () => {
      const { lines, undrawn } = bagLines(rows, answer(rows), new Map());
      expect(undrawn).toBe(0);
      expect(lines.map((line) => line.code)).toEqual([WHITE, OTHER_GOLD]);
      const [first, second] = lines;
      expect(first).toMatchObject({
        slug: SLUG,
        finish: "white",
        finishName: "White",
        quantity: 2,
        title: TITLES[SLUG],
        href: `/artworks/${SLUG}`,
        spec: "A2 Portrait · White frame",
        alt: `${TITLES[SLUG]} in a White frame`,
        price: { status: "priced", line: "₹38,000", each: "₹19,000" },
      });
      expect(first!.image).toEqual({
        src: catalogueImage(SLUG, "frame-white", "1200"),
        srcSet: `${catalogueImage(SLUG, "frame-white", "480")} 480w, ${catalogueImage(SLUG, "frame-white", "1200")} 1200w`,
      });
      // One unit: no "each" price (bag.js:13).
      expect(second!.price).toEqual({
        status: "priced",
        line: "₹23,000",
        each: null,
      });
      expect(second!.spec).toBe("A2 Portrait · Antique Gold frame");
    });

    it("an unavailable variant is drawn with no price (NS-29 in the row), never a stale or browser price", () => {
      const { lines } = bagLines(
        rows,
        answer(rows, { unavailable: [OTHER_GOLD] }),
        new Map(),
      );
      expect(lines[1]!.price).toEqual({ status: "unavailable" });
      expect(CATALOGUE_STATES.notAvailable).toBe("Not available to order");
    });

    it("denied: with no answer and no artwork this page has seen, nothing is drawn — the bag itself carries no title", () => {
      const { lines, undrawn } = bagLines(rows, null, new Map());
      expect(lines).toEqual([]);
      expect(undrawn).toBe(2);
    });

    it("while a newer revision is pending, rows keep their earlier answer's title but show no price", () => {
      const known = new Map<string, ArtworkFacts>();
      rememberArtworks(known, answer(rows));
      // The finish changed (a new code) and the quantity changed: both drawn, neither priced.
      const edited = [row(BLACK, 3), row(OTHER_GOLD, 1)];
      const { lines, undrawn } = bagLines(edited, null, known);
      expect(undrawn).toBe(0);
      expect(lines.map((line) => [line.code, line.price.status])).toEqual([
        [BLACK, "pending"],
        [OTHER_GOLD, "pending"],
      ]);
      expect(lines[0]!.spec).toBe("A2 Portrait · Black frame");
      expect(lines[0]!.alt).toBe(`${TITLES[SLUG]} in a Black frame`);
      // The facts cache holds catalogue facts only: no price, availability or quantity.
      expect([...known.values()][0]).toEqual({
        title: TITLES[SLUG],
        orientation: "Portrait",
      });
    });

    it("an answer for an older revision, a failed or an unhydrated state is not the current answer", () => {
      const result = answer(rows);
      expect(
        currentAnswer(snapshot(rows), state({ status: "ok", result })),
      ).toBe(result);
      expect(
        currentAnswer(
          snapshot(rows),
          state({ status: "ok", revision: 4, result }),
        ),
      ).toBeNull();
      expect(currentAnswer(snapshot(rows), state({ status: "failed" }))).toBe(
        null,
      );
      expect(currentAnswer(UNHYDRATED_BAG, IDLE_VALIDATION)).toBeNull();
    });
  });

  describe("the status line and the cart's subtotal", () => {
    const rows = [row(WHITE, 2)];

    it("before hydration nothing is said and the subtotal is empty — the server cannot know the bag", () => {
      expect(bagStatusMessages(UNHYDRATED_BAG, IDLE_VALIDATION)).toEqual([]);
      expect(subtotalText(UNHYDRATED_BAG, IDLE_VALIDATION)).toBe("");
      expect(validationFailed(UNHYDRATED_BAG, IDLE_VALIDATION)).toBe(false);
    });

    it("pending: 'Checking your bag…' and a pending subtotal, never a total", () => {
      expect(bagStatusMessages(snapshot(rows), state())).toEqual([
        BAG_STATUS.pending,
      ]);
      expect(subtotalText(snapshot(rows), state())).toBe(
        BAG_STATUS.subtotalPending,
      );
      // An ok answer for an older revision is still pending for this one.
      const stale = state({
        status: "ok",
        revision: 4,
        result: answer([row(WHITE, 1)]),
      });
      expect(subtotalText(snapshot(rows), stale)).toBe(
        BAG_STATUS.subtotalPending,
      );
    });

    it("failed: the honest failure, 'Try again', and the selections kept", () => {
      const failed = state({ status: "failed" });
      expect(bagStatusMessages(snapshot(rows), failed)).toEqual([
        BAG_STATUS.failed,
      ]);
      expect(validationFailed(snapshot(rows), failed)).toBe(true);
      expect(subtotalText(snapshot(rows), failed)).toBe(
        BAG_STATUS.subtotalFailed,
      );
      expect(BAG_STATUS.failed).toContain("Your selections are kept.");
    });

    it("ok: the server's exact subtotal of the available lines, formatted from paise", () => {
      const both = [row(WHITE, 2), row(OTHER_GOLD, 1)];
      const ok = state({
        status: "ok",
        result: answer(both, { unavailable: [OTHER_GOLD] }),
      });
      expect(subtotalText(snapshot(both), ok)).toBe("₹38,000");
      expect(bagStatusMessages(snapshot(both), ok)).toEqual([]);
      // The empty bag's own answer.
      expect(
        subtotalText(
          snapshot([]),
          state({ status: "ok", result: EMPTY_BAG_RESULT }),
        ),
      ).toBe("₹0");
    });

    it("the removal notice (singular and plural) and the two storage notices", () => {
      expect(
        bagStatusMessages(
          snapshot([]),
          state({ status: "ok", result: EMPTY_BAG_RESULT, removedCount: 1 }),
        ),
      ).toEqual([
        "An artwork in your bag is no longer available and was removed.",
      ]);
      expect(BAG_STATUS.removed(3)).toBe(
        "3 artworks in your bag are no longer available and were removed.",
      );
      expect(
        bagStatusMessages(
          snapshot([], { notice: "memory_only", persistence: "memory" }),
          state({ status: "ok", result: EMPTY_BAG_RESULT }),
        ),
      ).toEqual([BAG_STORAGE_NOTICES.memoryOnly]);
      expect(
        bagStatusMessages(
          snapshot([], { notice: "corrupt_cleared" }),
          state({ status: "ok", result: EMPTY_BAG_RESULT }),
        ),
      ).toEqual([BAG_STORAGE_NOTICES.corruptCleared]);
    });

    it("the cart's quantity field uses the prototype's coercion (bag.js:17)", () => {
      expect(
        ["0", "", "abc", "-5", "2.7", "1e9", "99", "100", "7"].map(
          quantityFromInput,
        ),
      ).toEqual([1, 1, 1, 1, 2, 99, 99, 99, 7]);
    });
  });

  /** A Map-backed Storage that records writes. */
  class FakeStorage implements Storage {
    readonly data = new Map<string, string>();
    writes = 0;
    get length(): number {
      return this.data.size;
    }
    key(index: number): string | null {
      return [...this.data.keys()][index] ?? null;
    }
    getItem(key: string): string | null {
      return this.data.get(key) ?? null;
    }
    setItem(key: string, value: string): void {
      this.writes += 1;
      this.data.set(key, value);
    }
    removeItem(key: string): void {
      this.data.delete(key);
    }
    clear(): void {
      this.data.clear();
    }
  }

  describe("clearing the bag (the Cookies control's route) cancels its validation", () => {
    it("clear aborts the request in flight; its late answer neither brings a row back nor writes anything", async () => {
      const storage = new FakeStorage();
      const store = createBagStore({
        storage: () => storage,
        events: () => new EventTarget(),
      });
      let signal: AbortSignal | undefined;
      let answerLate!: (outcome: BagValidationOutcome) => void;
      const validate: BagValidator = (rows, options) => {
        signal = options.signal;
        return new Promise((resolve) => {
          answerLate = resolve;
        });
      };
      const controller = createBagValidationController(store, validate);
      const release = controller.subscribe(() => {});
      controller.demand();
      store.add(WHITE, 2);
      await Promise.resolve();
      expect(controller.getState().status).toBe("pending");
      expect(signal?.aborted).toBe(false);

      store.clear();
      expect(signal?.aborted).toBe(true);
      expect(storage.data.has(BAG_STORAGE_KEY)).toBe(false);
      const writes = storage.writes;

      answerLate({ status: "ok", result: answer([row(WHITE, 2)]) });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(store.getSnapshot().rows).toEqual([]);
      expect(controller.getState()).toMatchObject({
        status: "ok",
        result: EMPTY_BAG_RESULT,
      });
      expect(storage.writes).toBe(writes);
      release();
    });

    it("the control clears through the bag API — never by removing the bag's, the PIN's or the finishes' keys itself", () => {
      const control = source("src/components/help/clear-preview-control.tsx");
      expect(control).toMatch(
        /import \{ bagStore, clearDeliveryPin, clearFinishSelections \} from "@\/lib\/bag";/,
      );
      expect(control).toContain("bagStore.clear();");
      expect(control).toContain("clearDeliveryPin();");
      expect(control).toContain("clearFinishSelections();");
      expect(control).not.toMatch(
        /aalishaanProductBag|aalishaanDeliveryCheck|aalishaan-frame-/,
      );
      // The wishlist part and its notification stay.
      expect(control).toContain("key.startsWith(WISHLIST_KEY_PREFIX)");
      expect(control).toContain('new Event("wishlistchange")');
    });
  });

  describe("the checkout control — guarded navigation since S1.6", () => {
    const commerceSources = () => {
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const entry of readdirSync(path.join(ROOT, dir), {
          withFileTypes: true,
        })) {
          const relative = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(relative);
          else if (/\.tsx?$/.test(entry.name)) files.push(relative);
        }
      };
      walk("src/components/commerce");
      walk("src/components/shell");
      walk("src/app/(public)/cart");
      return files;
    };

    it("the one path to /checkout in the bag, shell and cart code is the control's own guarded link", () => {
      const naming = commerceSources()
        .filter((file) => /["'`]\/checkout/.test(source(file)))
        .map((file) => file.split(path.sep).join("/"));
      expect(naming).toEqual(["src/components/commerce/checkout-control.tsx"]);
    });

    it("is a link only when checkout is open and the bag's current answer says every item can be bought; otherwise the disabled button with its line", () => {
      const control = source("src/components/commerce/checkout-control.tsx");
      // The link's four conditions, together: open here, an answer for the bag as it is, rows, every item available.
      expect(control).toMatch(
        /const ready =\s*open &&\s*answer !== null &&\s*answer\.items\.length > 0 &&\s*answer\.items\.every\(\(item\) => item\.available\);/,
      );
      // One link, to the checkout route, never prefetched (a prefetch would be a request nobody asked for).
      expect(control.match(/<Link\b/g)).toHaveLength(1);
      expect(control).toMatch(
        /<Link\s+className="button button--primary"\s+href=\{CHECKOUT_HREF\}\s+prefetch=\{false\}\s*>/,
      );
      expect(control).toContain('const CHECKOUT_HREF = "/checkout";');
      // Every other case is the disabled button, described by a line.
      expect(control).toMatch(
        /<button[\s\S]*?disabled[\s\S]*?aria-describedby/,
      );
      // Closed keeps the approved line; nothing navigates by script.
      expect(control).toContain(
        "{ text: CHECKOUT_CONTROL.unavailable, visible: true }",
      );
      expect(control).not.toMatch(
        /useRouter|router\.push|location\.(assign|href|replace)|window\.open/,
      );
      expect(CHECKOUT_CONTROL).toEqual({
        drawer: "Continue to checkout",
        cart: "Continue to checkout →",
        unavailable: "Checkout is not yet available.",
      });
    });

    it("renders the disabled button on the server whatever the deployment says: closed shows the approved line, open waits for the bag's check", () => {
      const Availability = CheckoutAvailabilityProvider as ComponentType<{
        open: boolean;
        children?: ReactNode;
      }>;
      const Bag = BagProvider as ComponentType<{ children?: ReactNode }>;
      const render = (open: boolean, placement: "drawer" | "cart") =>
        renderToStaticMarkup(
          createElement(
            Availability,
            { open },
            createElement(
              Bag,
              null,
              createElement(CheckoutControl, { placement }),
            ),
          ),
        );
      for (const placement of ["drawer", "cart"] as const) {
        const closed = render(false, placement);
        expect(closed).toMatch(
          /<button type="button" class="button button--primary" disabled="" aria-describedby="[^"]+">Continue to checkout/,
        );
        expect(closed).toContain(CHECKOUT_CONTROL.unavailable);
        expect(closed).not.toContain("<a ");
        // Open, but the bag is not read yet (the server render and no JavaScript): still no link — the bag's
        // "checking" line describes the button for assistive technology only.
        const open = render(true, placement);
        expect(open).toMatch(
          /<button type="button" class="button button--primary" disabled="" aria-describedby="[^"]+">Continue to checkout/,
        );
        expect(open).not.toContain("<a ");
        expect(open).not.toContain('href="/checkout');
        expect(open).not.toContain(CHECKOUT_CONTROL.unavailable);
        expect(open).toMatch(
          new RegExp(
            `<p class="visually-hidden" id="[^"]+">${BAG_STATUS.pending}</p>`,
          ),
        );
      }
    });

    it("outside the provider the answer is closed", () => {
      const Bag = BagProvider as ComponentType<{ children?: ReactNode }>;
      const html = renderToStaticMarkup(
        createElement(
          Bag,
          null,
          createElement(CheckoutControl, { placement: "cart" }),
        ),
      );
      expect(html).toContain(CHECKOUT_CONTROL.unavailable);
      expect(html).not.toContain("<a ");
    });
  });

  /** The two wrappers with their children passed as `createElement`'s arguments (react/no-children-prop). */
  const Shell = PublicShell as ComponentType<{
    fontVariables: string;
    children?: ReactNode;
  }>;
  const Boundary = OverlayErrorBoundary as unknown as ComponentType<{
    resetKey: unknown;
    children?: ReactNode;
  }>;

  describe("the cart page's server render (before hydration)", () => {
    const html = renderToStaticMarkup(
      createElement(
        Shell,
        { fontVariables: "test-fonts" },
        createElement(CartPage),
      ),
    );

    it("the head is the prototype's", () => {
      expect(cartMetadata.title).toBe(CART_HEAD.title);
      expect(cartMetadata.description).toBe(CART_HEAD.description);
    });

    it("draws the prototype's structure with no bag claimed: no rows, no false empty bag, an empty subtotal", () => {
      expect(html).toContain(
        `<h1 class="checkout-heading">${CART_PAGE.heading}</h1>`,
      );
      expect(html).toContain('<div id="cart-page-items"></div>');
      expect(html).not.toContain(CART_PAGE.empty.heading);
      expect(html).toMatch(/<dd data-subtotal="">\s*<\/dd>/);
      expect(html).toContain(`<dd>${CART_PAGE.summary.deliveryValue}</dd>`);
      expect(html).toContain('id="bag-status"');
      expect(html).not.toMatch(/Add a sample artwork|data-intake-slot/);
      // The prototype's order: totals, fine print, the PIN form, the checkout control, the guest line, help.
      const order = [
        CART_PAGE.summary.subtotal,
        CART_PAGE.summary.fine,
        'id="cart-delivery"',
        'id="checkout-link"',
        CART_PAGE.summary.guest,
        CART_PAGE.summary.helpBefore.trim(),
      ].map((needle) => html.indexOf(needle));
      expect(order.every((at) => at >= 0)).toBe(true);
      expect([...order].sort((a, b) => a - b)).toEqual(order);
    });

    it("the checkout control is shown disabled with its line, and nothing links to /checkout", () => {
      const button =
        /<button type="button" class="button button--primary" disabled="" aria-describedby="([^"]+)">Continue to checkout →<\/button>/.exec(
          html,
        );
      expect(button).not.toBeNull();
      expect(html).toContain(
        `<p class="flow-fine" id="${button![1]}">${CHECKOUT_CONTROL.unavailable}</p>`,
      );
      expect(html).not.toContain('href="/checkout');
    });

    it("the PIN form is disabled until hydration (no PIN in an address without JavaScript)", () => {
      expect(html).toMatch(/<input id="cart-pincode"[^>]*disabled=""/);
    });

    it("the shell: the badge counts 0 and the drawer shows the approved S1.3 empty state", () => {
      expect(html).toContain(`aria-label="${HEADER.cartOpen(0)}"`);
      expect(html).toContain(
        '<span class="cart-count" aria-hidden="true">0</span>',
      );
      expect(html).toContain(`<h3>${CART_DRAWER.empty.heading}</h3>`);
      expect(html).toContain(`>${CART_DRAWER.empty.secondary.label}</a>`);
      expect(html).toContain('data-close=""');
    });

    it("the no-JavaScript line links the artworks, without the prototype's preview wording", () => {
      expect(html).toContain(
        `<noscript><p>${CART_PAGE.noscript.before}<a href="/shop">${CART_PAGE.noscript.link.label}</a>.</p></noscript>`,
      );
    });
  });

  describe("the drawer's error boundary and the bag rows' image slots", () => {
    it("a failure is caught, and a change of the reset key (the drawer opening or closing) tries the content again", () => {
      expect(OverlayErrorBoundary.getDerivedStateFromError()).toEqual({
        failed: true,
      });
      expect(
        OverlayErrorBoundary.getDerivedStateFromProps(
          { resetKey: true, children: null },
          { failed: true, resetKey: true },
        ),
      ).toBeNull();
      expect(
        OverlayErrorBoundary.getDerivedStateFromProps(
          { resetKey: false, children: null },
          { failed: true, resetKey: true },
        ),
      ).toEqual({ failed: false, resetKey: false });
    });

    it("the fallback is the designed 500's copy, inside the drawer's body — the Close button is outside the boundary", () => {
      const fallback = renderToStaticMarkup(
        createElement(
          Boundary,
          { resetKey: true },
          createElement("p", null, "rows"),
        ),
      );
      expect(fallback).toBe("<p>rows</p>");
      const boundary = source(
        "src/components/shell/overlay-error-boundary.tsx",
      );
      expect(boundary).toContain('RECOVERY["500"]');
      expect(RECOVERY["500"].heading).toBe("Let’s try that again.");
      const overlays = source("src/components/shell/overlays.tsx");
      const body = overlays.indexOf(
        '<div className="drawer__body">\n        <OverlayErrorBoundary',
      );
      expect(body).toBeGreaterThan(
        overlays.indexOf("aria-label={CART_DRAWER.close}"),
      );
    });

    it("each picture slot is its own, never Home's swatch sizes", () => {
      expect(DRAWER_ROW_SIZES).toBe("72px");
      expect(CART_ROW_SIZES).toBe(
        "(max-width: 599px) 76px, (max-width: 900px) 90px, 125px",
      );
    });
  });

  describe("the global 404's load plan (§10 #26 (c))", () => {
    it("a destination on another path is loaded anew, so its #fragment is scrolled to", () => {
      expect(
        loadPlan(
          "https://example.test/missing",
          "https://example.test/shop?saved=1#artworks",
        ),
      ).toBe("replace");
      expect(
        loadPlan("https://example.test/missing", "https://example.test/about"),
      ).toBe("replace");
    });

    it("falls back to the S1.3 reload when the 404's address is unknown or equal but for the fragment", () => {
      expect(loadPlan(null, "https://example.test/shop#artworks")).toBe(
        "reload",
      );
      expect(
        loadPlan(
          "https://example.test/shop",
          "https://example.test/shop#artworks",
        ),
      ).toBe("reload");
    });
  });

  describe("the row strings", () => {
    it("are the prototype's commerce-row templates (bag.js:13)", () => {
      const bag = source("prototype/shared/bag.js");
      expect(bag).toContain(
        'alt="${safe(i.title)} in a ${names[i.frame]} frame"',
      );
      expect(BAG_ROW.alt("T", "White")).toBe("T in a White frame");
      expect(bag).toContain(
        "<p>A2 ${safe(i.orientation)} &middot; ${names[i.frame]} frame</p>",
      );
      expect(BAG_ROW.spec("Landscape", "Black")).toBe(
        "A2 Landscape · Black frame",
      );
      expect(bag).toContain("<p>Quantity ${i.quantity}</p>");
      expect(BAG_ROW.quantity(4)).toBe("Quantity 4");
      expect(bag).toContain(
        "<small>(${money(data.prices[i.frame])} each)</small>",
      );
      expect(BAG_ROW.each("₹19,000")).toBe("(₹19,000 each)");
      expect(bag).toContain('aria-label="Frame for ${safe(i.title)}"');
      expect(BAG_ROW.frameFor("T")).toBe("Frame for T");
      expect(bag).toContain('aria-label="Quantity for ${safe(i.title)}"');
      expect(BAG_ROW.quantityFor("T")).toBe("Quantity for T");
      expect(bag).toContain('aria-label="Remove ${safe(i.title)}"');
      expect(BAG_ROW.removeFor("T")).toBe("Remove T");
      expect(bag).toContain(`<label>${BAG_ROW.frame}<select`);
      expect(bag).toContain(`<label>${BAG_ROW.quantityLabel}<input`);
      expect(bag).toContain(`>${BAG_ROW.remove}</button>`);
    });
  });
});
