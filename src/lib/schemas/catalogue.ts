import { z } from "zod";

import {
  nullablePaiseSchema,
  currencySchema,
  paiseSchema,
} from "@/lib/schemas/money";

/**
 * Zod mirrors of 0001_catalogue (S1.1). They mirror the database's own constraints — the enumerations, the
 * slug and code shapes, the locked facet lists, the bounded lengths — and the shape of the one public
 * projection, `public_catalogue`, so a storefront page (S1.4, S1.5) validates every row it renders and a
 * server action (S1.6) validates every variant code it receives before it recomputes a price from the
 * database. Browser values are display only.
 */

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const artworkStatusSchema = z.enum([
  "Draft",
  "In review",
  "Active",
  "Hidden",
  "Retired",
]);
export type ArtworkStatus = z.infer<typeof artworkStatusSchema>;

/** The final Admin's display labels for two stored statuses (D-33) — never stored values. */
export const ARTWORK_STATUS_DISPLAY: Readonly<Record<ArtworkStatus, string>> = {
  Draft: "Draft",
  "In review": "In review",
  Active: "Active",
  Hidden: "Paused",
  Retired: "Archived",
};

export const finishCodeSchema = z.enum(["white", "black", "antique-gold"]);
export type FinishCode = z.infer<typeof finishCodeSchema>;

export const FINISH_NAMES: Readonly<Record<FinishCode, string>> = {
  white: "White",
  black: "Black",
  "antique-gold": "Antique Gold",
};

export const orientationSchema = z.enum(["Portrait", "Landscape"]);

export const ROOMS = [
  "Living Room",
  "Bedroom",
  "Dining Room",
  "Study & Office",
] as const;
export const MOODS = [
  "Full of wonder",
  "Bold",
  "Calm",
  "Grounded",
  "Warm",
  "Nostalgic",
] as const;
export const PALETTES = [
  "Gold & Gilded",
  "Blues & Indigo",
  "Greens & Teals",
  "Ink & Monochrome",
  "Reds & Blush",
  "Sepia & Cream",
  "Earth & Terracotta",
  "Jewel & Deep Tones",
] as const;

export const slugSchema = z.string().min(1).max(120).regex(SLUG_PATTERN);

/** "<artwork slug>:<finish code>" — the storefront's bag key and the variants.variant_code contract. */
export const variantCodeSchema = z
  .string()
  .max(140)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*:(?:white|black|antique-gold)$/);

export function splitVariantCode(code: string): {
  slug: string;
  finish: FinishCode;
} {
  const parsed = variantCodeSchema.parse(code);
  const at = parsed.lastIndexOf(":");
  return {
    slug: parsed.slice(0, at),
    finish: finishCodeSchema.parse(parsed.slice(at + 1)),
  };
}

export const availabilitySchema = z.enum(["made_to_order", "unavailable"]);

export const imageSlotSchema = z.enum([
  "frame-white",
  "close-white",
  "frame-black",
  "close-black",
  "frame-antique-gold",
  "close-antique-gold",
  "paper",
  "artwork",
]);
export const imageSizeSchema = z.enum(["480", "1200", "full"]);

/** The enumerated object-path contract of the public bucket. */
export const OBJECT_PATH_PATTERN =
  /^artworks\/[a-z0-9]+(?:-[a-z0-9]+)*\/(?:(?:frame|close)-(?:white|black|antique-gold)|paper)-(?:480|1200)\.webp$|^artworks\/[a-z0-9]+(?:-[a-z0-9]+)*\/artwork-full\.webp$/;
export const objectPathSchema = z.string().regex(OBJECT_PATH_PATTERN);

export const publicVariantSchema = z
  .object({
    finish: finishCodeSchema,
    finish_name: z.string().min(1).max(40),
    variant_code: variantCodeSchema,
    price_paise: paiseSchema,
    currency: currencySchema,
    availability: availabilitySchema,
    lead_time: z.string().min(1).max(80).nullable(),
  })
  .strict();

export const publicImageSchema = z
  .object({
    slot: imageSlotSchema,
    size: imageSizeSchema,
    path: objectPathSchema,
  })
  .strict();

/**
 * One row of `public_catalogue` — exactly the allow-listed columns, nothing more (`.strict()` refuses an
 * unexpected key, so a widened view is caught by the projection test, never rendered blindly).
 */
export const publicCatalogueRowSchema = z
  .object({
    slug: slugSchema,
    title: z.string().min(1).max(160),
    full_title: z.string().min(1).max(220),
    hook: z.string().min(1).max(300),
    description: z.string().min(1).max(4000),
    collection_slug: slugSchema,
    collection_name: z.string().min(1).max(120),
    collection_intro: z.string().max(600),
    collection_sort_order: z.number().int().min(1),
    style_slug: slugSchema,
    style_name: z.string().min(1).max(120),
    style_full_name: z.string().min(1).max(200),
    style_intro: z.string().max(600),
    style_sort_order: z.number().int().min(1),
    orientation: orientationSchema,
    rooms: z.array(z.enum(ROOMS)),
    moods: z.array(z.enum(MOODS)),
    palettes: z.array(z.enum(PALETTES)),
    palette_hues: z.array(z.string().min(1).max(60)).max(4),
    suggested_frame: finishCodeSchema,
    featured: z.boolean(),
    lead_time: z.string().min(1).max(80).nullable(),
    seo_title: z.string().min(1).max(200),
    seo_description: z.string().min(1).max(400),
    default_alt: z.string().min(1).max(300),
    image_alt_text: z.string().min(1).max(300),
    published_at: z.iso.datetime({ offset: true }),
    variants: z.array(publicVariantSchema).length(3),
    images: z.array(publicImageSchema).length(15),
  })
  .strict();

export type PublicCatalogueRow = z.infer<typeof publicCatalogueRowSchema>;

/** The exact column list of the projection — the parity test compares the live view against it. */
export const PUBLIC_CATALOGUE_COLUMNS = Object.freeze(
  Object.keys(publicCatalogueRowSchema.shape) as ReadonlyArray<
    keyof PublicCatalogueRow
  >,
);

export const publicCatalogueSchema = z.array(publicCatalogueRowSchema);

export { nullablePaiseSchema };
