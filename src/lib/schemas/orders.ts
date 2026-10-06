import { z } from "zod";

import { finishCodeSchema, variantCodeSchema } from "@/lib/schemas/catalogue";
import {
  currencySchema,
  nullablePaiseSchema,
  paiseSchema,
  positivePaiseSchema,
} from "@/lib/schemas/money";

/**
 * Zod mirrors of 0002_orders (S1.1): the status enumerations, the order-number and token-hash shapes (D-09),
 * the storefront's contact rules (locked-facts §6) and the row shapes later sprints write and read.
 * Nothing here issues a token, allocates a number or opens a public write — S1.6 and S1.7 do, through these
 * schemas, server-side.
 */

export const staffRoleSchema = z.enum(["owner_admin", "operations", "support"]);
export type StaffRole = z.infer<typeof staffRoleSchema>;

/** "AS-" + the gapless number from the locked counter (from AS-1001). */
export const ORDER_NUMBER_PATTERN = /^AS-\d{4,12}$/;
export const orderNumberSchema = z.string().regex(ORDER_NUMBER_PATTERN);

/** Lower-case hex SHA-256 of the opaque confirmation token (≥ 256 random bits) — never the token itself. */
export const CONFIRMATION_TOKEN_HASH_PATTERN = /^[0-9a-f]{64}$/;
export const confirmationTokenHashSchema = z
  .string()
  .regex(CONFIRMATION_TOKEN_HASH_PATTERN);

export const paymentStatusSchema = z.enum([
  "pending",
  "captured",
  "failed",
  "expired",
]);
export const fulfilmentStatusSchema = z.enum([
  "pending_payment",
  "confirmed",
  "in_production",
  "shipped",
  "delivered",
  "part_delivered",
  "on_hold",
  "cancelled",
]);
export const supportStatusSchema = z.enum(["none", "open", "resolved"]);
export const refundStatusSchema = z.enum([
  "none",
  "requested",
  "partial",
  "refunded",
]);
export const settlementStatusSchema = z.enum([
  "not_settled",
  "provider_settled",
  "bank_matched",
  "disputed",
]);

/** The eleven Admin order stages of an item, 0 Pending payment … 10 Delivered (locked-facts §9). */
export const ORDER_ITEM_STAGES = [
  "Pending payment",
  "Paid & confirmed",
  "Ready to make",
  "Printing",
  "Framing",
  "Quality checked",
  "Packed",
  "Pickup booked",
  "Shipped",
  "Out for delivery",
  "Delivered",
] as const;
export const orderItemStageSchema = z.number().int().min(0).max(10);

export const salesOpenReasonSchema = z.enum(["prelaunch", "capacity"]);

/**
 * The checkout's own contact rules (locked-facts §6). The length cap aborts: without it the pattern still runs
 * on an over-long value, and on a crafted one it takes quadratic time.
 */
export const emailSchema = z
  .string()
  .max(254, { abort: true })
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
  .transform((value) => value.toLowerCase());
/**
 * The stored form — ten digits, as the database checks them. The approved checkout first strips spaces,
 * brackets, `+`, `-` and a leading `91` (locked-facts §6); S1.6 normalises the form value that way before
 * this schema sees it.
 */
export const indianMobileSchema = z.string().regex(/^[6-9]\d{9}$/);
export const pincodeSchema = z.string().regex(/^[1-9][0-9]{5}$/);

export const quantitySchema = z.number().int().min(1).max(99);

export const customerContactInputSchema = z
  .object({
    email: emailSchema.nullable(),
    phone: indianMobileSchema.nullable(),
    name: z.string().min(1).max(120).nullable(),
  })
  .strict()
  .refine((c) => c.email !== null || c.phone !== null, {
    message: "an email address or a mobile number is required",
  });

export const addressInputSchema = z
  .object({
    recipient_name: z.string().min(1).max(120),
    line1: z.string().min(1).max(200),
    line2: z.string().max(200).nullable(),
    city: z.string().min(1).max(100),
    state: z.string().min(1).max(100),
    pincode: pincodeSchema,
    country: z.literal("IN"),
    phone: indianMobileSchema.nullable(),
  })
  .strict();

export const orderItemInputSchema = z
  .object({
    variant_code: variantCodeSchema,
    finish_code: finishCodeSchema,
    quantity: quantitySchema,
    unit_price_paise: positivePaiseSchema,
  })
  .strict();

export const orderTotalsSchema = z
  .object({
    currency: currencySchema,
    subtotal_paise: paiseSchema,
    shipping_paise: nullablePaiseSchema,
    tax_paise: nullablePaiseSchema,
    total_paise: paiseSchema,
  })
  .strict()
  .refine(
    (t) =>
      t.total_paise ===
      t.subtotal_paise +
        (t.shipping_paise ?? BigInt(0)) +
        (t.tax_paise ?? BigInt(0)),
    {
      message:
        "total_paise must equal subtotal + shipping + tax (unknown charges contribute nothing)",
    },
  );

export const businessRulesVersionSchema = z
  .object({
    version: z.number().int().min(1),
    effective_from: z.iso.datetime({ offset: true }),
    approver_name: z.string().min(1).max(120),
    approver_staff_id: z.uuid().nullable(),
    synthetic: z.boolean(),
    sales_open: z.boolean(),
    sales_open_reason: salesOpenReasonSchema.nullable(),
    pending_order_expiry_minutes: z.number().int().min(1).max(1440),
    shipping_paise: nullablePaiseSchema,
    tax_treatment: z.enum(["inclusive", "exclusive"]).nullable(),
    note: z.string().max(500).nullable(),
  })
  .strict()
  .refine((r) => r.sales_open === (r.sales_open_reason === null), {
    message: "a closed store carries its reason; an open one never does",
  });

export const providerSchema = z.enum(["razorpay", "shiprocket", "email"]);

export const providerEventInputSchema = z
  .object({
    provider: providerSchema,
    event_id: z.string().min(1).max(200),
    event_type: z.string().min(1).max(120),
    signature_ok: z.boolean(),
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();

export const pendingWorkInputSchema = z
  .object({
    kind: z.string().regex(/^[a-z][a-z0-9_]{1,60}$/),
    entity_type: z.string().min(1).max(60),
    entity_id: z.uuid().nullable(),
    dedupe_key: z.string().min(1).max(200),
    payload: z.record(z.string(), z.unknown()),
    run_after: z.iso.datetime({ offset: true }).optional(),
    max_attempts: z.number().int().min(1).max(50).optional(),
  })
  .strict();

export const auditLogInputSchema = z
  .object({
    actor_type: z.enum(["staff", "system", "customer"]),
    actor_id: z.uuid().nullable(),
    action: z.string().min(1).max(120),
    entity_type: z.string().min(1).max(60),
    entity_id: z.string().max(120).nullable(),
    previous: z.record(z.string(), z.unknown()).nullable(),
    next: z.record(z.string(), z.unknown()).nullable(),
    reason: z.string().max(1000).nullable(),
    external_ref: z.string().max(200).nullable(),
  })
  .strict();
