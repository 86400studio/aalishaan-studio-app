import { describe, expect, it } from "vitest";

import {
  ARTWORK_STATUS_DISPLAY,
  FINISH_NAMES,
  OBJECT_PATH_PATTERN,
  PUBLIC_CATALOGUE_COLUMNS,
  artworkStatusSchema,
  finishCodeSchema,
  objectPathSchema,
  publicCatalogueRowSchema,
  publicCatalogueSchema,
  splitVariantCode,
  variantCodeSchema,
} from "@/lib/schemas/catalogue";
import { nullablePaiseSchema, paiseSchema } from "@/lib/schemas/money";
import {
  ORDER_ITEM_STAGES,
  addressInputSchema,
  businessRulesVersionSchema,
  confirmationTokenHashSchema,
  customerContactInputSchema,
  emailSchema,
  orderNumberSchema,
  orderTotalsSchema,
  pendingWorkInputSchema,
  providerEventInputSchema,
  staffRoleSchema,
} from "@/lib/schemas/orders";

/**
 * The Zod mirrors of 0001_catalogue and 0002_orders (S1.1): the enumerations, shapes and refinements the
 * database also enforces, and the exact shape of the one public projection.
 */

const B = (n: number | string) => BigInt(n);

function sampleRow(): Record<string, unknown> {
  const finishes = ["white", "black", "antique-gold"] as const;
  const prices = { white: 1900000, black: 2100000, "antique-gold": 2300000 };
  const slug = "the-bridge-of-blue-stone";
  return {
    slug,
    title: "The Bridge of Blue Stone",
    full_title: "The Bridge of Blue Stone · Blue-Gold Landscape Artwork",
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

describe("money schemas", () => {
  it("paiseSchema yields a bigint from the three representations and refuses the rest", () => {
    expect(paiseSchema.parse("1900000")).toBe(B(1900000));
    expect(paiseSchema.parse(1900000)).toBe(B(1900000));
    expect(paiseSchema.parse(B(1900000))).toBe(B(1900000));
    for (const bad of [
      1.5,
      -1,
      "x",
      2 ** 53,
      "100000000001",
      null,
      undefined,
      true,
    ])
      expect(paiseSchema.safeParse(bad).success, String(bad)).toBe(false);
    expect(nullablePaiseSchema.parse(null)).toBeNull();
    expect(nullablePaiseSchema.parse("7")).toBe(B(7));
  });
});

describe("catalogue schemas", () => {
  it("mirrors the stored statuses and their display labels (D-33)", () => {
    expect(artworkStatusSchema.options).toEqual([
      "Draft",
      "In review",
      "Active",
      "Hidden",
      "Retired",
    ]);
    expect(ARTWORK_STATUS_DISPLAY.Hidden).toBe("Paused");
    expect(ARTWORK_STATUS_DISPLAY.Retired).toBe("Archived");
    expect(artworkStatusSchema.safeParse("Paused").success).toBe(false);
  });

  it("mirrors the three finishes and the bag-key variant code", () => {
    expect(finishCodeSchema.options).toEqual([
      "white",
      "black",
      "antique-gold",
    ]);
    expect(FINISH_NAMES).toEqual({
      white: "White",
      black: "Black",
      "antique-gold": "Antique Gold",
    });
    expect(splitVariantCode("the-bridge-of-blue-stone:antique-gold")).toEqual({
      slug: "the-bridge-of-blue-stone",
      finish: "antique-gold",
    });
    for (const bad of [
      "the-bridge:gold",
      "The-Bridge:white",
      "bridge:white:black",
      ":white",
      "bridge:",
    ])
      expect(variantCodeSchema.safeParse(bad).success, bad).toBe(false);
  });

  it("mirrors the enumerated object-path contract", () => {
    expect(
      objectPathSchema.safeParse(
        "artworks/the-bridge-of-blue-stone/frame-white-480.webp",
      ).success,
    ).toBe(true);
    expect(
      objectPathSchema.safeParse(
        "artworks/the-bridge-of-blue-stone/artwork-full.webp",
      ).success,
    ).toBe(true);
    for (const bad of [
      "artworks/the-bridge/frame-white-720.webp",
      "artworks/the-bridge/master.png",
      "artworks/../x/frame-white-480.webp",
      "shared/size-guide.webp",
      "artworks/the-bridge/artwork-1200.webp",
    ])
      expect(OBJECT_PATH_PATTERN.test(bad), bad).toBe(false);
  });

  it("accepts a projection row with exactly the allow-listed columns and refuses an extra one", () => {
    const row = sampleRow();
    const parsed = publicCatalogueRowSchema.parse(row);
    expect(parsed.variants[0].price_paise).toBe(B(1900000));
    expect(Object.keys(row).sort()).toEqual(
      [...PUBLIC_CATALOGUE_COLUMNS].sort(),
    );
    expect(
      publicCatalogueRowSchema.safeParse({ ...row, id: "leak" }).success,
    ).toBe(false);
    expect(
      publicCatalogueRowSchema.safeParse({ ...row, status: "Active" }).success,
    ).toBe(false);
    expect(
      publicCatalogueRowSchema.safeParse({ ...row, source_row: 35 }).success,
    ).toBe(false);
    expect(
      publicCatalogueRowSchema.safeParse({
        ...row,
        variants: row.variants && [],
      }).success,
    ).toBe(false);
    expect(publicCatalogueSchema.safeParse([row, row]).success).toBe(true);
  });

  it("refuses a facet value outside the locked lists and an unsafe price", () => {
    const row = sampleRow();
    expect(
      publicCatalogueRowSchema.safeParse({ ...row, rooms: ["Garage"] }).success,
    ).toBe(false);
    expect(
      publicCatalogueRowSchema.safeParse({ ...row, orientation: "Square" })
        .success,
    ).toBe(false);
    const variants = (row.variants as Array<Record<string, unknown>>).map(
      (v, i) => (i === 0 ? { ...v, price_paise: 19000.5 } : v),
    );
    expect(
      publicCatalogueRowSchema.safeParse({ ...row, variants }).success,
    ).toBe(false);
  });
});

describe("order schemas", () => {
  it("mirrors roles, numbers, hashes and stages", () => {
    expect(staffRoleSchema.options).toEqual([
      "owner_admin",
      "operations",
      "support",
    ]);
    expect(orderNumberSchema.safeParse("AS-1001").success).toBe(true);
    expect(orderNumberSchema.safeParse("AS-PREVIEW-001").success).toBe(false);
    expect(orderNumberSchema.safeParse("as-1001").success).toBe(false);
    expect(confirmationTokenHashSchema.safeParse("a".repeat(64)).success).toBe(
      true,
    );
    expect(confirmationTokenHashSchema.safeParse("A".repeat(64)).success).toBe(
      false,
    );
    expect(confirmationTokenHashSchema.safeParse("a".repeat(63)).success).toBe(
      false,
    );
    expect(ORDER_ITEM_STAGES).toHaveLength(11);
    expect(ORDER_ITEM_STAGES[0]).toBe("Pending payment");
    expect(ORDER_ITEM_STAGES[10]).toBe("Delivered");
  });

  it("applies the checkout's contact rules", () => {
    expect(emailSchema.parse("Meera@Example.test")).toBe("meera@example.test");
    expect(
      customerContactInputSchema.safeParse({
        email: null,
        phone: null,
        name: "x",
      }).success,
    ).toBe(false);
    expect(
      customerContactInputSchema.safeParse({
        email: null,
        phone: "9137624394",
        name: null,
      }).success,
    ).toBe(true);
    expect(
      customerContactInputSchema.safeParse({
        email: null,
        phone: "5137624394",
        name: null,
      }).success,
    ).toBe(false);
    expect(
      addressInputSchema.safeParse({
        recipient_name: "M",
        line1: "1",
        line2: null,
        city: "Mumbai",
        state: "MH",
        pincode: "400001",
        country: "IN",
        phone: null,
      }).success,
    ).toBe(true);
    expect(
      addressInputSchema.safeParse({
        recipient_name: "M",
        line1: "1",
        line2: null,
        city: "Mumbai",
        state: "MH",
        pincode: "040001",
        country: "IN",
        phone: null,
      }).success,
    ).toBe(false);
  });

  it("requires totals to be the exact sum with unknown charges contributing nothing", () => {
    expect(
      orderTotalsSchema.safeParse({
        currency: "INR",
        subtotal_paise: "1900000",
        shipping_paise: null,
        tax_paise: null,
        total_paise: 1900000,
      }).success,
    ).toBe(true);
    expect(
      orderTotalsSchema.safeParse({
        currency: "INR",
        subtotal_paise: "1900000",
        shipping_paise: "0",
        tax_paise: null,
        total_paise: 1900001,
      }).success,
    ).toBe(false);
  });

  it("requires a closed store to carry its reason and an open one not to", () => {
    const base = {
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
      note: null,
    };
    expect(businessRulesVersionSchema.safeParse(base).success).toBe(true);
    expect(
      businessRulesVersionSchema.safeParse({ ...base, sales_open_reason: null })
        .success,
    ).toBe(false);
    expect(
      businessRulesVersionSchema.safeParse({ ...base, sales_open: true })
        .success,
    ).toBe(false);
    expect(
      businessRulesVersionSchema.safeParse({
        ...base,
        sales_open: true,
        sales_open_reason: null,
      }).success,
    ).toBe(true);
  });

  it("shapes ledger and outbox inserts", () => {
    expect(
      providerEventInputSchema.safeParse({
        provider: "razorpay",
        event_id: "evt_1",
        event_type: "payment.captured",
        signature_ok: true,
        payload: { a: 1 },
      }).success,
    ).toBe(true);
    expect(
      providerEventInputSchema.safeParse({
        provider: "stripe",
        event_id: "evt_1",
        event_type: "x",
        signature_ok: true,
        payload: {},
      }).success,
    ).toBe(false);
    expect(
      pendingWorkInputSchema.safeParse({
        kind: "send_confirmation",
        entity_type: "order",
        entity_id: null,
        dedupe_key: "order:1:confirmation",
        payload: {},
      }).success,
    ).toBe(true);
    expect(
      pendingWorkInputSchema.safeParse({
        kind: "Send Confirmation",
        entity_type: "order",
        entity_id: null,
        dedupe_key: "k",
        payload: {},
      }).success,
    ).toBe(false);
  });
});
