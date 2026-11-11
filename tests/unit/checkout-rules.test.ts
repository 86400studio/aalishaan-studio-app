import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  ATTEMPT_KEY_PATTERN,
  canonicalCheckoutPayload,
  checkoutResumeSchema,
  checkoutSubmissionSchema,
  cleanText,
  EMPTY_CHECKOUT_FIELDS,
  normaliseCheckoutFields,
  normaliseMobile,
  type CheckoutFieldValues,
} from "@/lib/schemas/checkout";
import {
  checkoutPageConfig,
  deploymentHostnames,
  salesGate,
  type SalesGateEnv,
} from "@/lib/server/checkout/gate";
import {
  attemptHash,
  confirmationTokenHash,
  deriveConfirmationToken,
  issueConfirmationToken,
  payloadMac,
  providerReceipt,
} from "@/lib/server/checkout/tokens";

import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ATTEMPT_KEY_BYTES,
  ATTEMPT_STORAGE_KEY,
  base64Url,
  createAttemptKeys,
  holdExpired,
  launchDeadline,
  millisecondsToDeadline,
  mintAttemptKey,
} from "@/components/checkout/attempt-key";
import { Checkout } from "@/components/checkout/checkout-form";
import { createFormMemory } from "@/components/checkout/form-memory";
import {
  fieldMessage,
  firstRefusedField,
  isNeutralNotice,
  noticeText,
  RESUME_POLL_LIMIT,
  RESUME_POLL_MS,
  resumeStep,
  settleResume,
  settleSubmit,
  submitStep,
  UNAVAILABLE_STEP,
} from "@/components/checkout/outcome";
import {
  PAYMENT_WINDOW_NAME,
  paymentWindowOptions,
  RAZORPAY_CHECKOUT_SRC,
} from "@/components/checkout/razorpay";
import {
  TURNSTILE_ACTION as TURNSTILE_WIDGET_ACTION,
  TURNSTILE_SRC,
} from "@/components/checkout/turnstile-widget";
import { BagProvider } from "@/components/commerce/bag-provider";
import {
  CHECKOUT_CLOSED,
  CHECKOUT_FIELD_MESSAGES,
  CHECKOUT_NOTICES,
  CHECKOUT_PAY,
  CHECKOUT_TEST_MODE,
} from "@/content/public/checkout";
import type { CheckoutActionResult } from "@/lib/schemas/checkout";

/**
 * The checkout's rules that need no network — S1.6: the sales gate (src/lib/server/checkout/gate.ts), the wire
 * contract and its one normalisation (src/lib/schemas/checkout.ts) and the hashes and derived values
 * (src/lib/server/checkout/tokens.ts). Placeholder values only: nothing here is a real key.
 */

const TEST_REF = "abcdefghijklmnopqrst";
const PROD_REF = "tsrqponmlkjihgfedcba";

const OPEN_ENV: SalesGateEnv = {
  SALES_MODE: "test",
  VERCEL_ENV: "preview",
  NEXT_PUBLIC_SUPABASE_URL: `https://${TEST_REF}.supabase.co`,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_placeholder",
  SUPABASE_SECRET_KEY: "sb_secret_placeholder",
  SUPABASE_TEST_PROJECT_REF: TEST_REF,
  SUPABASE_PROD_PROJECT_REF: PROD_REF,
  NEXT_PUBLIC_RAZORPAY_KEY_ID: "rzp_test_PLACEHOLDER0001",
  RAZORPAY_KEY_SECRET: "placeholder-key-secret",
  ORDER_TOKEN_SECRET: "A".repeat(43),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
  TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
  UPSTASH_REDIS_REST_URL: "https://example-redis.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "placeholder-token",
  VERCEL_URL: "aalishaan-studio-app-abc123.vercel.app",
};

describe("salesGate — open only for the explicitly configured TEST flow", () => {
  it("opens on the Preview with every value in place, and hands the page nothing but the site key", () => {
    const gate = salesGate(OPEN_ENV);
    expect(gate.open).toBe(true);
    if (!gate.open) return;
    expect(gate.config.context).toBe("preview");
    expect(gate.config.projectRef).toBe(TEST_REF);
    expect(gate.config.turnstileHostnames).toEqual([
      "aalishaan-studio-app-abc123.vercel.app",
    ]);
    expect(checkoutPageConfig(OPEN_ENV)).toEqual({
      open: true,
      turnstileSiteKey: "1x00000000000000000000AA",
    });
  });

  it("opens for a local process (no VERCEL_ENV) pointed at TEST, with the loopback hostnames", () => {
    const gate = salesGate({
      ...OPEN_ENV,
      VERCEL_ENV: undefined,
      VERCEL_URL: undefined,
    });
    expect(gate.open && gate.config.context).toBe("development");
    expect(gate.open && gate.config.turnstileHostnames).toEqual([
      "localhost",
      "127.0.0.1",
    ]);
  });

  it.each([
    [undefined, "mode_off"],
    ["", "mode_off"],
    ["off", "mode_off"],
    ["live", "mode_live_not_open"],
    ["TEST", "mode_invalid"],
    ["test ", "mode_invalid"],
    ["true", "mode_invalid"],
    ["on", "mode_invalid"],
  ])("SALES_MODE=%j is closed (%s)", (mode, reason) => {
    expect(salesGate({ ...OPEN_ENV, SALES_MODE: mode })).toEqual({
      open: false,
      reason,
    });
    expect(checkoutPageConfig({ ...OPEN_ENV, SALES_MODE: mode })).toEqual({
      open: false,
    });
  });

  it("stays closed in Production whatever SALES_MODE says — even with a consistent PROD identity", () => {
    for (const mode of ["test", "live", "off", undefined]) {
      const gate = salesGate({
        ...OPEN_ENV,
        SALES_MODE: mode,
        VERCEL_ENV: "production",
        NEXT_PUBLIC_SUPABASE_URL: `https://${PROD_REF}.supabase.co`,
      });
      expect(gate.open).toBe(false);
    }
    expect(
      salesGate({
        ...OPEN_ENV,
        VERCEL_ENV: "production",
        NEXT_PUBLIC_SUPABASE_URL: `https://${PROD_REF}.supabase.co`,
      }),
    ).toEqual({ open: false, reason: "production" });
    // Production mistakenly pointed at TEST is closed as well.
    expect(salesGate({ ...OPEN_ENV, VERCEL_ENV: "production" })).toEqual({
      open: false,
      reason: "production",
    });
  });

  it.each([
    ["an unknown deployment context", { VERCEL_ENV: "staging" }],
    [
      "a Preview pointed at the PROD project",
      { NEXT_PUBLIC_SUPABASE_URL: `https://${PROD_REF}.supabase.co` },
    ],
    ["equal project refs", { SUPABASE_PROD_PROJECT_REF: TEST_REF }],
    ["a missing secret key", { SUPABASE_SECRET_KEY: undefined }],
    ["a missing TEST ref", { SUPABASE_TEST_PROJECT_REF: undefined }],
  ])("is closed for %s (identity)", (_label, change) => {
    expect(salesGate({ ...OPEN_ENV, ...change })).toEqual({
      open: false,
      reason: "identity",
    });
  });

  it.each([
    [
      "a Live key id",
      { NEXT_PUBLIC_RAZORPAY_KEY_ID: "rzp_live_PLACEHOLDER0001" },
      "razorpay_key",
    ],
    [
      "a missing key id",
      { NEXT_PUBLIC_RAZORPAY_KEY_ID: undefined },
      "razorpay_key",
    ],
    [
      "a malformed key id",
      { NEXT_PUBLIC_RAZORPAY_KEY_ID: "rzp_test_" },
      "razorpay_key",
    ],
    [
      "a missing key secret",
      { RAZORPAY_KEY_SECRET: undefined },
      "razorpay_secret",
    ],
    ["a blank key secret", { RAZORPAY_KEY_SECRET: "   " }, "razorpay_secret"],
    [
      "a missing order-link secret",
      { ORDER_TOKEN_SECRET: undefined },
      "token_secret",
    ],
    [
      "a short order-link secret",
      { ORDER_TOKEN_SECRET: "A".repeat(42) },
      "token_secret",
    ],
    [
      "an order-link secret with other characters",
      { ORDER_TOKEN_SECRET: `${"A".repeat(42)}+` },
      "token_secret",
    ],
    [
      "a missing Turnstile site key",
      { NEXT_PUBLIC_TURNSTILE_SITE_KEY: undefined },
      "turnstile",
    ],
    ["a missing Turnstile secret", { TURNSTILE_SECRET_KEY: "" }, "turnstile"],
    [
      "a missing Upstash URL",
      { UPSTASH_REDIS_REST_URL: undefined },
      "throttle",
    ],
    [
      "an Upstash URL with a path",
      { UPSTASH_REDIS_REST_URL: "https://example-redis.upstash.io/x" },
      "throttle",
    ],
    ["a missing Upstash token", { UPSTASH_REDIS_REST_TOKEN: " " }, "throttle"],
  ] as const)("is closed for %s", (_label, change, reason) => {
    expect(salesGate({ ...OPEN_ENV, ...change })).toEqual({
      open: false,
      reason,
    });
  });

  it("never puts a secret in the page's projection", () => {
    const text = JSON.stringify(checkoutPageConfig(OPEN_ENV));
    for (const secret of [
      OPEN_ENV.RAZORPAY_KEY_SECRET,
      OPEN_ENV.ORDER_TOKEN_SECRET,
      OPEN_ENV.TURNSTILE_SECRET_KEY,
      OPEN_ENV.SUPABASE_SECRET_KEY,
      OPEN_ENV.UPSTASH_REDIS_REST_TOKEN,
    ])
      expect(text).not.toContain(secret);
  });

  it("takes the deployment's hostnames from Vercel's system values only, lower-cased and de-duplicated", () => {
    expect(
      deploymentHostnames({
        VERCEL_ENV: "preview",
        VERCEL_URL: "Deploy-1.vercel.app",
        VERCEL_BRANCH_URL: "deploy-1.vercel.app",
        VERCEL_PROJECT_PRODUCTION_URL: "https://not-a-bare-host.example",
      }),
    ).toEqual(["deploy-1.vercel.app"]);
    // A deployed context with no usable value names no hostname: a real key's answer can then never match.
    expect(deploymentHostnames({ VERCEL_ENV: "preview" })).toEqual([]);
  });
});

const VALID_FIELDS: CheckoutFieldValues = {
  name: "  Asha   Rao ",
  email: "Asha.Rao@Example.com",
  phone: "+91 (98765) 43-210",
  pin: "400001",
  address: "12, Marine Drive",
  address2: "",
  city: "Mumbai",
  state: "Maharashtra",
};

describe("normaliseCheckoutFields — the one normalisation, browser and server alike", () => {
  it("trims and collapses text, lower-cases the email and reduces the mobile number to ten digits", () => {
    expect(normaliseCheckoutFields(VALID_FIELDS)).toEqual({
      ok: true,
      fields: {
        name: "Asha Rao",
        email: "asha.rao@example.com",
        phone: "9876543210",
        pincode: "400001",
        line1: "12, Marine Drive",
        line2: null,
        city: "Mumbai",
        state: "Maharashtra",
      },
    });
    expect(normaliseMobile("0091 98765 43210")).toBe("009198765432" + "10");
    expect(normaliseMobile("919876543210")).toBe("9876543210");
    expect(normaliseMobile("9876543210")).toBe("9876543210");
    expect(cleanText(" a \n\t b ")).toBe("a b");
  });

  it("requires every field the approved form requires, and reports them in the form's order", () => {
    const result = normaliseCheckoutFields(EMPTY_CHECKOUT_FIELDS);
    expect(result).toEqual({
      ok: false,
      errors: {
        name: "required",
        email: "required",
        phone: "required",
        pin: "required",
        address: "required",
        city: "required",
        state: "required",
      },
    });
    if (!result.ok)
      expect(Object.keys(result.errors)).toEqual([
        "name",
        "email",
        "phone",
        "pin",
        "address",
        "city",
        "state",
      ]);
  });

  it.each([
    ["email", "not-an-email"],
    ["email", "a@b"],
    ["phone", "12345"],
    ["phone", "5876543210"],
    ["phone", "98765432101"],
    ["pin", "012345"],
    ["pin", "40000"],
    ["pin", "4000011"],
    ["pin", "40000a"],
  ] as const)("refuses %s = %j as invalid", (field, value) => {
    const result = normaliseCheckoutFields({ ...VALID_FIELDS, [field]: value });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toEqual({ [field]: "invalid" });
  });

  it("refuses over-long text and control or direction-override characters", () => {
    const long = normaliseCheckoutFields({
      ...VALID_FIELDS,
      name: "x".repeat(121),
      city: "y".repeat(101),
    });
    expect(long).toEqual({
      ok: false,
      errors: { name: "too_long", city: "too_long" },
    });
    for (const character of [
      String.fromCharCode(0),
      String.fromCharCode(0x1b),
      String.fromCharCode(0x202e),
      String.fromCharCode(0x2028),
      // An unpaired surrogate (a high one and a low one): not valid Unicode, and the database cannot store it.
      String.fromCharCode(0xd83d),
      String.fromCharCode(0xdc00),
    ]) {
      const result = normaliseCheckoutFields({
        ...VALID_FIELDS,
        address: `12${character}Marine Drive`,
      });
      expect(result).toEqual({ ok: false, errors: { address: "invalid" } });
    }
  });

  it("refuses an unpaired surrogate in every text field and in the email, and keeps a real astral character", () => {
    const lone = String.fromCharCode(0xd83d);
    for (const field of [
      "name",
      "address",
      "address2",
      "city",
      "state",
    ] as const) {
      const result = normaliseCheckoutFields({
        ...VALID_FIELDS,
        [field]: `Text${lone}`,
      });
      expect(result).toEqual({ ok: false, errors: { [field]: "invalid" } });
    }
    expect(
      normaliseCheckoutFields({
        ...VALID_FIELDS,
        email: `a${lone}@example.com`,
      }),
    ).toEqual({ ok: false, errors: { email: "invalid" } });
    // A valid pair is one character above the Basic Multilingual Plane and is kept as typed.
    const astral = String.fromCodePoint(0x1f3a8);
    const kept = normaliseCheckoutFields({
      ...VALID_FIELDS,
      address2: `Near the gallery ${astral}`,
    });
    expect(kept.ok && kept.fields.line2).toBe(`Near the gallery ${astral}`);
    // What the server would send to the database is valid JSON text for every accepted value.
    if (kept.ok)
      expect(JSON.parse(JSON.stringify(kept.fields))).toEqual(kept.fields);
  });
});

const KEY = "k".repeat(43);

const SUBMISSION = {
  attempt_key: KEY,
  items: [{ variant_code: "the-moon-between-two-peaks:black", quantity: 2 }],
  shown_total_paise: "4200000",
  fields: VALID_FIELDS,
  payment_method: "upi",
  turnstile_token: "token",
};

describe("checkoutSubmissionSchema — strict and bounded", () => {
  it("accepts exactly the contract", () => {
    expect(checkoutSubmissionSchema.safeParse(SUBMISSION).success).toBe(true);
    expect(checkoutResumeSchema.safeParse({ attempt_key: KEY }).success).toBe(
      true,
    );
  });

  it.each([
    [
      "a client price on an item",
      { items: [{ ...SUBMISSION.items[0], price_paise: 1 }] },
    ],
    ["a customer id", { customer_id: "00000000-0000-0000-0000-000000000000" }],
    ["an order id", { order_id: "AS-1001" }],
    ["a sales flag", { sales_open: true }],
    ["a synthetic flag", { synthetic: false }],
    ["a policy version choice", { policy_version_ids: [] }],
    ["a provider order id", { provider_order_id: "order_ABCDEFGH" }],
    ["an amount", { amount_paise: "100" }],
    ["an extra field", { fields: { ...VALID_FIELDS, country: "IN" } }],
    ["no items", { items: [] }],
    [
      "a repeated variant",
      { items: [SUBMISSION.items[0], SUBMISSION.items[0]] },
    ],
    [
      "a quantity of zero",
      { items: [{ ...SUBMISSION.items[0], quantity: 0 }] },
    ],
    [
      "a quantity of 100",
      { items: [{ ...SUBMISSION.items[0], quantity: 100 }] },
    ],
    [
      "a fractional quantity",
      { items: [{ ...SUBMISSION.items[0], quantity: 1.5 }] },
    ],
    [
      "a string quantity",
      { items: [{ ...SUBMISSION.items[0], quantity: "2" }] },
    ],
    [
      "a malformed variant code",
      { items: [{ variant_code: "x:blue", quantity: 1 }] },
    ],
    ["a negative shown total", { shown_total_paise: "-1" }],
    ["a numeric shown total", { shown_total_paise: 4200000 }],
    ["a fractional shown total", { shown_total_paise: "42.5" }],
    ["an unknown payment method", { payment_method: "cod" }],
    ["an empty token", { turnstile_token: "" }],
    ["an over-long token", { turnstile_token: "t".repeat(2049) }],
    [
      "an over-long raw field",
      { fields: { ...VALID_FIELDS, name: "n".repeat(601) } },
    ],
    ["a short attempt key", { attempt_key: "k".repeat(42) }],
    [
      "an attempt key with other characters",
      { attempt_key: `${"k".repeat(42)}=` },
    ],
  ])("refuses %s", (_label, change) => {
    expect(
      checkoutSubmissionSchema.safeParse({ ...SUBMISSION, ...change }).success,
    ).toBe(false);
  });

  it("refuses more rows than a bag can hold", () => {
    const items = Array.from({ length: 67 }, (_, index) => ({
      variant_code: `artwork-${index}:white`,
      quantity: 1,
    }));
    expect(
      checkoutSubmissionSchema.safeParse({ ...SUBMISSION, items }).success,
    ).toBe(false);
  });

  it("refuses a resume that carries anything but the key", () => {
    expect(
      checkoutResumeSchema.safeParse({
        attempt_key: KEY,
        order_number: "AS-1001",
      }).success,
    ).toBe(false);
    expect(checkoutResumeSchema.safeParse({ email: "a@b.co" }).success).toBe(
      false,
    );
  });
});

describe("canonicalCheckoutPayload — what an attempt is bound to", () => {
  const fields = normaliseCheckoutFields(VALID_FIELDS);
  if (!fields.ok) throw new Error("fixture");

  it("is the same for the same bag in another order, and different for any changed detail", () => {
    const a = { variant_code: "a:white", quantity: 1 };
    const b = { variant_code: "b:black", quantity: 2 };
    const base = canonicalCheckoutPayload([a, b], fields.fields);
    expect(canonicalCheckoutPayload([b, a], fields.fields)).toBe(base);
    expect(
      canonicalCheckoutPayload([a, { ...b, quantity: 3 }], fields.fields),
    ).not.toBe(base);
    expect(
      canonicalCheckoutPayload([a, b], { ...fields.fields, line1: "13" }),
    ).not.toBe(base);
    expect(
      canonicalCheckoutPayload([a, b], { ...fields.fields, line2: "Near X" }),
    ).not.toBe(base);
  });
});

describe("tokens — hashes and the derived confirmation link (D-61)", () => {
  const secret = "S".repeat(43);

  it("stores only the SHA-256 of the attempt key and binds the payload with the key itself", () => {
    expect(ATTEMPT_KEY_PATTERN.test(KEY)).toBe(true);
    expect(attemptHash(KEY)).toMatch(/^[0-9a-f]{64}$/);
    expect(attemptHash(KEY)).toBe(attemptHash(KEY));
    expect(attemptHash(`${KEY.slice(0, 42)}j`)).not.toBe(attemptHash(KEY));
    const mac = payloadMac(KEY, "payload");
    expect(mac).toMatch(/^[0-9a-f]{64}$/);
    expect(payloadMac(KEY, "payload")).toBe(mac);
    expect(payloadMac(KEY, "payload2")).not.toBe(mac);
    expect(payloadMac(`${KEY.slice(0, 42)}j`, "payload")).not.toBe(mac);
    // The MAC is keyed: it is not the plain digest of the payload.
    expect(mac).not.toBe(attemptHash("payload"));
  });

  it("issues a salt and a token hash, never the token; the token derives again from the salt and the secret", () => {
    const issued = issueConfirmationToken(secret);
    expect(Object.keys(issued).sort()).toEqual(["hash", "salt"]);
    expect(issued.salt).toMatch(/^[0-9a-f]{64}$/);
    expect(issued.hash).toMatch(/^[0-9a-f]{64}$/);
    const token = deriveConfirmationToken(secret, issued.salt);
    // 32 bytes of HMAC output as base64url: 43 characters, at least 256 bits (D-09).
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(confirmationTokenHash(token)).toBe(issued.hash);
    expect(deriveConfirmationToken(secret, issued.salt)).toBe(token);
    // Another salt or another secret gives another token.
    expect(issueConfirmationToken(secret).salt).not.toBe(issued.salt);
    expect(deriveConfirmationToken("T".repeat(43), issued.salt)).not.toBe(
      token,
    );
    expect(JSON.stringify(issued)).not.toContain(token);
  });

  it("refuses a malformed salt and builds a receipt Razorpay accepts", () => {
    expect(() => deriveConfirmationToken(secret, "xyz")).toThrow(RangeError);
    const receipt = providerReceipt("3F2504E0-4F89-41D3-9A0C-0305E82C3301");
    expect(receipt).toBe("pa_3f2504e04f8941d39a0c0305e82c3301");
    expect(receipt.length).toBeLessThanOrEqual(40);
    expect(() => providerReceipt("not-a-uuid")).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The page's own rules (src/components/checkout/) — framework-free modules and the server render. What the page
// does in a real browser (hydration, the two provider scripts, the payment window) is tests/e2e/checkout.spec.ts.

const LAUNCH = {
  key_id: "rzp_test_PLACEHOLDER0001",
  provider_order_id: "order_PLACEHOLDER001",
  amount_paise: "4200000",
  currency: "INR" as const,
  order_number: "AS-1001",
  expires_at: "2026-11-11T11:00:00.000Z",
  expires_in_ms: 3_600_000,
};

/** A Storage double that records every write. */
function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const writes: Array<[string, string]> = [];
  const storage = {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => [...data.keys()][index] ?? null,
    removeItem: (key: string) => {
      data.delete(key);
    },
    setItem: (key: string, value: string) => {
      writes.push([key, value]);
      data.set(key, value);
    },
  } satisfies Storage;
  return { storage, data, writes };
}

/** Deterministic "random" bytes: each mint fills with the next counter value. */
function counterRandom() {
  let next = 0;
  return (bytes: Uint8Array) => {
    next += 1;
    bytes.fill(next);
  };
}

describe("the attempt key in the browser (src/components/checkout/attempt-key.ts)", () => {
  it("mints 32 bytes as 43 base64url characters", () => {
    const key = mintAttemptKey((bytes) => {
      expect(bytes).toHaveLength(ATTEMPT_KEY_BYTES);
      bytes.fill(255);
    });
    expect(key).toMatch(ATTEMPT_KEY_PATTERN);
    expect(key).toBe("_".repeat(42) + "8");
    expect(base64Url(new Uint8Array([251, 255, 190]))).toBe("-_--");
  });

  it("the same bag and details reuse the key; anything changed mints a new one; storage holds the key alone", () => {
    const { storage, writes } = fakeStorage();
    const keys = createAttemptKeys({
      storage: () => storage,
      fillRandom: counterRandom(),
    });
    const first = keys.keyFor("payload-a");
    expect(keys.keyFor("payload-a")).toBe(first);
    expect(keys.slot()).toEqual({ key: first, canonical: "payload-a" });
    const second = keys.keyFor("payload-b");
    expect(second).not.toBe(first);
    expect(keys.keyFor("payload-b")).toBe(second);
    // Two mints, two writes — each the key under the one name, never the payload.
    expect(writes).toEqual([
      [ATTEMPT_STORAGE_KEY, first],
      [ATTEMPT_STORAGE_KEY, second],
    ]);
    expect(ATTEMPT_STORAGE_KEY).toBe("aalishaanCheckoutAttempt");
    expect(JSON.stringify(writes)).not.toContain("payload");
  });

  it("a key read from storage is resume-only: a planted key never reaches the submit slot", () => {
    const planted = "p".repeat(43);
    const { storage, data } = fakeStorage({ [ATTEMPT_STORAGE_KEY]: planted });
    const keys = createAttemptKeys({
      storage: () => storage,
      fillRandom: counterRandom(),
    });
    expect(keys.storedKey()).toBe(planted);
    // Reading it changed nothing: there is still no submit slot.
    expect(keys.slot()).toBeNull();
    // A pay press mints its own key — never the planted one — and replaces the stored copy.
    const minted = keys.keyFor("payload");
    expect(minted).not.toBe(planted);
    expect(keys.slot()?.key).toBe(minted);
    expect(data.get(ATTEMPT_STORAGE_KEY)).toBe(minted);
  });

  it.each([
    "short",
    "p".repeat(44),
    `${"p".repeat(42)}=`,
    `${"p".repeat(42)} `,
    "",
  ])("ignores the malformed stored value %j", (value) => {
    const { storage } = fakeStorage({ [ATTEMPT_STORAGE_KEY]: value });
    const keys = createAttemptKeys({
      storage: () => storage,
      fillRandom: counterRandom(),
    });
    expect(keys.storedKey()).toBeNull();
  });

  it("blocked storage loses only the reload-resume", () => {
    for (const storage of [
      () => null,
      () => {
        throw new Error("blocked");
      },
    ]) {
      const keys = createAttemptKeys({ storage, fillRandom: counterRandom() });
      expect(keys.storedKey()).toBeNull();
      const key = keys.keyFor("payload");
      expect(key).toMatch(ATTEMPT_KEY_PATTERN);
      expect(keys.keyFor("payload")).toBe(key);
      expect(() => keys.forget()).not.toThrow();
      expect(() => keys.dropStored(key)).not.toThrow();
    }
  });

  it("dropStored removes only the key it was asked about; forget clears the slot, the hold and the stored key", () => {
    const other = "o".repeat(43);
    const { storage, data } = fakeStorage({ [ATTEMPT_STORAGE_KEY]: other });
    const keys = createAttemptKeys({
      storage: () => storage,
      fillRandom: counterRandom(),
    });
    keys.dropStored("x".repeat(43));
    expect(data.get(ATTEMPT_STORAGE_KEY)).toBe(other);
    keys.dropStored(other);
    expect(data.has(ATTEMPT_STORAGE_KEY)).toBe(false);

    keys.keyFor("payload");
    keys.hold(LAUNCH, null, 1_000);
    expect(keys.held()).toEqual({
      launch: LAUNCH,
      prefill: null,
      reported: false,
      deadlineMs: 3_601_000,
    });
    keys.markReported();
    expect(keys.held()?.reported).toBe(true);
    keys.forget();
    expect(keys.slot()).toBeNull();
    expect(keys.held()).toBeNull();
    expect(data.has(ATTEMPT_STORAGE_KEY)).toBe(false);
  });

  it("times the deadline from the receipt of the launch plus the server's remaining time — never the device clock against expires_at", () => {
    // A device clock years ahead of the launch's own expires_at: the server has just said the order is payable
    // for another hour, and that verdict stands on this device.
    const received = Date.parse("2031-01-01T00:00:00.000Z");
    expect(received).toBeGreaterThan(Date.parse(LAUNCH.expires_at));
    expect(launchDeadline(LAUNCH, received)).toBe(received + 3_600_000);
    const keys = createAttemptKeys({
      storage: () => null,
      fillRandom: counterRandom(),
    });
    keys.hold(LAUNCH, null, received);
    const held = keys.held()!;
    expect(holdExpired(held, received)).toBe(false);
    expect(holdExpired(held, received + 3_600_000 - 1)).toBe(false);
    expect(holdExpired(held, received + 3_600_000)).toBe(true);
    expect(millisecondsToDeadline(held, received + 3_595_000)).toBe(5000);
    expect(millisecondsToDeadline(held, received + 4_000_000)).toBe(0);
    // A device clock far behind does not extend the hold either: it still ends one hour after the receipt.
    const early = Date.parse("2001-01-01T00:00:00.000Z");
    keys.hold(LAUNCH, null, early);
    expect(holdExpired(keys.held()!, early + 3_600_000)).toBe(true);
    // A remaining time that cannot be read counts as none: the hold ends at once, it is never open-ended.
    for (const bad of [Number.NaN, -1, 0, Number.POSITIVE_INFINITY])
      expect(launchDeadline({ ...LAUNCH, expires_in_ms: bad }, 10)).toBe(10);
  });
});

describe("what the page does with each answer (src/components/checkout/outcome.ts)", () => {
  const plain = (
    id: string,
    options: { forget?: boolean; recheckBag?: boolean; block?: boolean } = {},
  ) => ({
    do: "notice",
    notice: { id },
    forget: options.forget ?? false,
    recheckBag: options.recheckBag ?? false,
    block: options.block ?? false,
  });

  it("maps every answer to a pay press", () => {
    expect(submitStep({ status: "launch", launch: LAUNCH })).toEqual({
      do: "launch",
      launch: LAUNCH,
    });
    expect(submitStep({ status: "closed" })).toEqual({ do: "close" });
    expect(
      submitStep({ status: "invalid", fields: { email: "invalid" } }),
    ).toEqual({ do: "fields", errors: { email: "invalid" } });
    expect(submitStep({ status: "invalid", fields: {} })).toEqual(
      plain("unavailable"),
    );
    expect(submitStep({ status: "bag_changed" })).toEqual(
      plain("bagChanged", { recheckBag: true }),
    );
    expect(submitStep({ status: "challenge_failed" })).toEqual(
      plain("challengeFailed"),
    );
    expect(submitStep({ status: "throttled" })).toEqual(plain("throttled"));
    expect(submitStep({ status: "unavailable" })).toEqual(plain("unavailable"));
    expect(submitStep({ status: "in_progress" })).toEqual({ do: "poll" });
    // The attempt is over for this browser: the next press is a new order under a new key.
    expect(submitStep({ status: "start_failed" })).toEqual(
      plain("startFailed", { forget: true }),
    );
    expect(submitStep({ status: "start_unknown" })).toEqual(
      plain("startUnknown", { forget: true }),
    );
    expect(submitStep({ status: "expired" })).toEqual(
      plain("expired", { forget: true }),
    );
    // Not payable from here: no pay button, and the attempt is kept (it is not the browser's to end).
    expect(submitStep({ status: "held" })).toEqual(
      plain("held", { block: true }),
    );
    expect(submitStep({ status: "not_found" })).toEqual(
      plain("unavailable", { forget: true }),
    );
  });

  it("is quieter about a key found in storage: one that leads nowhere is dropped without a word", () => {
    expect(resumeStep({ status: "launch", launch: LAUNCH })).toEqual({
      do: "launch",
      launch: LAUNCH,
    });
    expect(resumeStep({ status: "closed" })).toEqual({ do: "close" });
    expect(resumeStep({ status: "in_progress" })).toEqual({ do: "poll" });
    for (const status of [
      "not_found",
      "start_failed",
      "start_unknown",
    ] as const)
      expect(resumeStep({ status })).toEqual({
        do: "nothing",
        dropStored: true,
      });
    expect(resumeStep({ status: "expired" })).toEqual(
      plain("expired", { forget: true }),
    );
    expect(resumeStep({ status: "held" })).toEqual(plain("held"));
    // A control that could not be reached keeps the key: the customer has asked for nothing yet.
    for (const status of [
      "bag_changed",
      "challenge_failed",
      "throttled",
      "unavailable",
    ] as const)
      expect(resumeStep({ status })).toEqual({
        do: "nothing",
        dropStored: false,
      });
    expect(resumeStep({ status: "invalid", fields: {} })).toEqual({
      do: "nothing",
      dropStored: false,
    });
  });

  it("a pay press is exactly one submission; in_progress is asked about again at most five times, two seconds apart", async () => {
    const submit = vi.fn(async () => ({ status: "in_progress" }) as const);
    const resume = vi.fn(async () => ({ status: "in_progress" }) as const);
    const pauses: number[] = [];
    const step = await settleSubmit(submit, resume, async (ms) => {
      pauses.push(ms);
    });
    expect(step).toEqual(UNAVAILABLE_STEP);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(resume).toHaveBeenCalledTimes(RESUME_POLL_LIMIT);
    expect(pauses).toEqual(Array(RESUME_POLL_LIMIT).fill(RESUME_POLL_MS));
    expect(RESUME_POLL_LIMIT).toBe(5);
    expect(RESUME_POLL_MS).toBe(2000);

    // The wait ends as soon as the attempt settles — and never by submitting again.
    const settling = vi
      .fn<() => Promise<CheckoutActionResult>>()
      .mockResolvedValueOnce({ status: "in_progress" })
      .mockResolvedValueOnce({ status: "launch", launch: LAUNCH });
    const again = vi.fn(async () => ({ status: "in_progress" }) as const);
    expect(await settleSubmit(again, settling, async () => {})).toEqual({
      do: "launch",
      launch: LAUNCH,
    });
    expect(again).toHaveBeenCalledTimes(1);
    expect(settling).toHaveBeenCalledTimes(2);
  });

  it("an action that throws is 'temporarily unavailable' — never a retry of the submission", async () => {
    const submit = vi.fn(async () => {
      throw new Error("network");
    });
    const resume = vi.fn(async () => ({ status: "unavailable" }) as const);
    expect(await settleSubmit(submit, resume, async () => {})).toEqual(
      UNAVAILABLE_STEP,
    );
    expect(submit).toHaveBeenCalledTimes(1);
    expect(resume).not.toHaveBeenCalled();
    const throwingResume = vi.fn(async () => {
      throw new Error("network");
    });
    expect(
      await settleSubmit(
        async () => ({ status: "in_progress" }),
        throwingResume,
        async () => {},
      ),
    ).toEqual(UNAVAILABLE_STEP);
    expect(throwingResume).toHaveBeenCalledTimes(1);
  });

  it("the load-time question says nothing when it throws, runs out or the page was left", async () => {
    expect(
      await settleResume(
        async () => {
          throw new Error("network");
        },
        () => false,
        async () => {},
      ),
    ).toBeNull();
    const polling = vi.fn(async () => ({ status: "in_progress" }) as const);
    expect(
      await settleResume(
        polling,
        () => false,
        async () => {},
      ),
    ).toBeNull();
    expect(polling).toHaveBeenCalledTimes(RESUME_POLL_LIMIT + 1);
    const never = vi.fn(
      async () => ({ status: "launch", launch: LAUNCH }) as const,
    );
    expect(
      await settleResume(
        never,
        () => true,
        async () => {},
      ),
    ).toBeNull();
    expect(never).not.toHaveBeenCalled();
    expect(
      await settleResume(
        async () => ({ status: "launch", launch: LAUNCH }),
        () => false,
        async () => {},
      ),
    ).toEqual({ do: "launch", launch: LAUNCH });
  });

  it("names the field's own rule, as the frozen page does", () => {
    expect(fieldMessage("email", "invalid")).toBe(
      "Enter a valid email address.",
    );
    expect(fieldMessage("phone", "invalid")).toBe(
      "Enter a valid 10-digit Indian mobile number.",
    );
    expect(fieldMessage("pin", "invalid")).toBe("Enter a six-digit PIN code.");
    expect(fieldMessage("name", "required")).toBe(
      "Please complete this field.",
    );
    expect(fieldMessage("address", "invalid")).toBe(
      "Please complete this field.",
    );
    expect(fieldMessage("city", "too_long")).toBe(
      CHECKOUT_FIELD_MESSAGES.tooLong,
    );
    expect(noticeText({ id: "checkDetails" })).toBe(
      "Please check the highlighted details.",
    );
    expect(firstRefusedField({ state: "required", email: "invalid" })).toBe(
      "email",
    );
    expect(firstRefusedField({})).toBeNull();
  });

  it("no line claims a payment was taken, received or confirmed — a browser cannot know", () => {
    const lines = [
      ...Object.values(CHECKOUT_NOTICES).map((value) =>
        typeof value === "function"
          ? value("AS-1001")
          : typeof value === "string"
            ? value
            : `${value.before}${value.link.label}${value.after}`,
      ),
      ...Object.values(CHECKOUT_TEST_MODE),
      ...Object.values(CHECKOUT_PAY),
      CHECKOUT_CLOSED.heading,
      CHECKOUT_CLOSED.body,
    ];
    for (const line of lines) {
      expect(line, line).not.toMatch(
        /successful|payment received|payment (is|was) confirmed|order (is|was) confirmed|thank you for your order|we have received/i,
      );
      expect(line, line).not.toMatch(
        /\b(is|was|has been|have been) paid\b|payment (was|has been) taken/i,
      );
      // "already paid" appears only in the warning not to pay twice.
      if (/already paid/i.test(line)) expect(line).toMatch(/do not pay again/);
    }
    // NS-05 says the opposite of success, with the order number.
    expect(noticeText({ id: "unverified", orderNumber: "AS-1001" })).toBe(
      "Order AS-1001: your payment is not confirmed yet. The order stays pending until the payment provider confirms it. Please do not pay again.",
    );
    expect(isNeutralNotice({ id: "unverified", orderNumber: "AS-1001" })).toBe(
      true,
    );
    expect(isNeutralNotice({ id: "startFailed" })).toBe(false);
    // The test checkout says what it is.
    expect(CHECKOUT_TEST_MODE.disclosure).toMatch(
      /Test Mode: no real payment is taken/,
    );
  });
});

describe("form memory and the payment window (src/components/checkout/)", () => {
  it("keeps what was typed in memory only, and forgets it on clear", () => {
    const memory = createFormMemory();
    expect(memory.get()).toEqual({ fields: {}, payment: null });
    memory.setField("name", "Asha Rao");
    memory.setField("pin", "400001");
    memory.setPayment("card");
    expect(memory.get()).toEqual({
      fields: { name: "Asha Rao", pin: "400001" },
      payment: "card",
    });
    const same = memory.get();
    memory.setField("name", "Asha Rao");
    expect(memory.get()).toBe(same);
    memory.clear();
    expect(memory.get()).toEqual({ fields: {}, payment: null });
  });

  it("opens the payment window with the server's launch only; the callback's payment id and signature are never received", () => {
    const events = {
      onReported: vi.fn(),
      onFailed: vi.fn(),
      onDismissed: vi.fn(),
    };
    const prefill = {
      name: "Asha Rao",
      email: "asha.rao@example.com",
      contact: "9876543210",
      method: "upi",
    };
    const options = paymentWindowOptions(LAUNCH, prefill, events);
    expect(options).toMatchObject({
      key: LAUNCH.key_id,
      order_id: LAUNCH.provider_order_id,
      amount: 4200000,
      currency: "INR",
      name: PAYMENT_WINDOW_NAME,
      description: "AS-1001",
      prefill,
    });
    expect(Object.keys(options).sort()).toEqual([
      "amount",
      "currency",
      "description",
      "handler",
      "key",
      "modal",
      "name",
      "order_id",
      "prefill",
    ]);
    // The handler takes no argument: whatever the provider passes is dropped.
    expect(options.handler.length).toBe(0);
    (options.handler as (...args: unknown[]) => void)({
      razorpay_payment_id: "pay_PLACEHOLDER",
      razorpay_signature: "sig",
    });
    expect(events.onReported).toHaveBeenCalledWith();
    options.modal?.ondismiss?.();
    expect(events.onDismissed).toHaveBeenCalledTimes(1);
    // After a reload nothing was typed in the page: nothing is prefilled.
    expect(paymentWindowOptions(LAUNCH, null, events)).not.toHaveProperty(
      "prefill",
    );
    expect(RAZORPAY_CHECKOUT_SRC).toBe(
      "https://checkout.razorpay.com/v1/checkout.js",
    );
    expect(TURNSTILE_SRC).toBe(
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
    );
    expect(TURNSTILE_WIDGET_ACTION).toBe("checkout");
  });
});

describe("the checkout page's sources — what is stored, loaded and left out", () => {
  const ROOT = fileURLToPath(new URL("../../", import.meta.url));
  const read = (relative: string) =>
    readFileSync(path.join(ROOT, relative), "utf8").replace(/\r\n/g, "\n");
  const checkoutFiles = readdirSync(
    path.join(ROOT, "src", "components", "checkout"),
  )
    .filter((name) => /\.tsx?$/.test(name))
    .map((name) => `src/components/checkout/${name}`);
  const pageFiles = [
    ...checkoutFiles,
    "src/app/(public)/checkout/page.tsx",
    "src/content/public/checkout.ts",
  ];
  /** The code without its comments, so a rule stated in words never satisfies or fails a check on the statements. */
  const codeOf = (relative: string) =>
    read(relative)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

  it("writes exactly one thing to browser storage — the attempt key — and nothing to localStorage or a cookie", () => {
    const writers = checkoutFiles.filter((file) =>
      /\.setItem\(|document\.cookie/.test(codeOf(file)),
    );
    expect(writers).toEqual(["src/components/checkout/attempt-key.ts"]);
    const attempt = codeOf("src/components/checkout/attempt-key.ts");
    expect(attempt.match(/\.setItem\(/g)).toHaveLength(1);
    expect(attempt).toContain("setItem(ATTEMPT_STORAGE_KEY, key)");
    for (const file of pageFiles)
      expect(codeOf(file), file).not.toMatch(/localStorage|indexedDB/);
    // The one reader of sessionStorage is the attempt key's own module.
    expect(
      pageFiles.filter((file) => /sessionStorage/.test(codeOf(file))),
    ).toEqual(["src/components/checkout/attempt-key.ts"]);
  });

  it("loads exactly two provider scripts, by fixed address, and no other remote address", () => {
    const remote = new Set<string>();
    for (const file of pageFiles)
      for (const match of codeOf(file).matchAll(/https?:\/\/[^\s"'`)]+/g))
        remote.add(match[0]);
    expect([...remote].sort()).toEqual([
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
      "https://checkout.razorpay.com/v1/checkout.js",
    ]);
  });

  it("leaves out the unapproved payment-policy line (NS-15) and everything the prototype simulated", () => {
    for (const file of pageFiles) {
      const code = codeOf(file);
      expect(code, file).not.toMatch(/wa\.me|whatsapp/i);
      expect(code, file).not.toMatch(
        /Use sample details|Place sample order|Design preview|data-intake-slot|aalishaanOrderPreview|AS-PREVIEW/,
      );
      expect(code, file).not.toMatch(/cash on delivery|\bCOD\b/i);
    }
  });

  it("the window's callbacks reach no server action, storage, bag or navigation", () => {
    const form = codeOf("src/components/checkout/checkout-form.tsx");
    const callbacks = form.slice(
      form.indexOf("const opened = openPaymentWindow("),
      form.indexOf("if (opened) setNotice(null);"),
    );
    expect(callbacks).toContain("onReported");
    expect(callbacks).toContain("onFailed");
    expect(callbacks).toContain("onDismissed");
    expect(callbacks).not.toMatch(
      /actions\.|submitCheckoutAction|resumeCheckoutAction|fetch\(|setItem|bagStore|\.clear\(|router|location|forget\(/,
    );
    // The bag is never emptied by the checkout at all: no file reaches the bag's writer, and the page takes neither
    // `clear` nor `remove` from the bag (form memory has its own `clear`, which empties the typed fields only).
    for (const file of checkoutFiles)
      expect(codeOf(file), file).not.toMatch(/bagStore|removeCodes/);
    expect(form).not.toMatch(/\bclear\b|\bremove\b|setQuantity|changeFinish/);
  });

  it("without JavaScript the form is hidden behind the no-JavaScript line, as the frozen page's <noscript> style does", () => {
    const page = codeOf("src/app/(public)/checkout/page.tsx");
    expect(page).toContain(
      'const NO_SCRIPT_CSS = "#checkout-form{display:none}";',
    );
    expect(page).toMatch(
      /<noscript>\s*<style>\{NO_SCRIPT_CSS\}<\/style>\s*<p>\s*\{noscript\.before\}/,
    );
    // The frozen page's own list, of which only the form exists here.
    expect(
      read("prototype/pages/checkout/index.html").replace(/\s+/g, " "),
    ).toContain("<noscript><style>#checkout-form,");
  });
});

describe("the checkout page's server render", () => {
  const Bag = BagProvider as ComponentType<{ children?: ReactNode }>;
  const render = (props: Parameters<typeof Checkout>[0]) =>
    renderToStaticMarkup(
      createElement(Bag, null, createElement(Checkout, props)),
    );

  it("closed: the heading and the closed panel — no form, no field, no pay button", () => {
    const html = render({ open: false });
    expect(html).toContain("<h1>Checkout</h1>");
    expect(html).toContain('<section id="checkout-closed" class="flow-panel">');
    expect(html).toContain(CHECKOUT_CLOSED.heading);
    expect(html).toContain(CHECKOUT_CLOSED.body);
    expect(html).toContain('href="/shop"');
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("data-checkout-next");
    expect(html).not.toContain(CHECKOUT_TEST_MODE.disclosure);
  });

  it("open, before the bag is read: the frozen form with its eight fields, the test disclosure and a disabled pay button", () => {
    const html = render({ open: true, turnstileSiteKey: "example-site-key" });
    expect(html).toMatch(/<form id="checkout-form" novalidate="">/i);
    expect(html).toContain(CHECKOUT_TEST_MODE.disclosure);
    expect(html).toContain("Guest checkout · Your artwork, made for you.");
    for (const [name, autocomplete] of [
      ["name", "shipping name"],
      ["email", "shipping email"],
      ["phone", "shipping tel"],
      ["pin", "shipping postal-code"],
      ["address", "shipping address-line1"],
      ["address2", "shipping address-line2"],
      ["city", "shipping address-level2"],
      ["state", "shipping address-level1"],
    ]) {
      const input = new RegExp(`<input[^>]*name="${name}"[^>]*>`).exec(html);
      expect(input, name).not.toBeNull();
      expect(input![0]).toMatch(
        new RegExp(`autocomplete="${autocomplete}"`, "i"),
      );
      expect(input![0]).toContain(`aria-describedby="error-${name}"`);
      expect(html).toContain(
        `<span id="error-${name}" class="field-error"></span>`,
      );
    }
    expect(
      html.match(/<input[^>]*type="radio"[^>]*name="payment"/g),
    ).toHaveLength(4);
    for (const label of [
      "Full name",
      "Email",
      "Mobile number",
      "PIN code",
      "Address",
      "Landmark (optional)",
      "City",
      "State / Union territory",
      "Contact &amp; delivery",
      "India · All fields required unless marked optional.",
      "Your order",
      "Edit bag",
      "Artwork subtotal",
      "To be confirmed",
      "Test total",
      "Final shipping and tax details will appear before live payment.",
      "Handcrafted frame · Ready to hang",
      "Need help?",
    ])
      expect(html, label).toContain(label);
    // The pay button is there and disabled: nothing can be sent before the bag has been checked.
    expect(html).toMatch(
      /<button type="submit" class="button button--primary" data-checkout-next=""[^>]*disabled="">Continue to payment →<\/button>/,
    );
    // The site key reaches the page's props only; no secret-shaped value is rendered.
    expect(html).not.toContain("example-site-key");
    expect(html).not.toMatch(/Use sample details|Place sample order|WhatsApp/);
  });
});
