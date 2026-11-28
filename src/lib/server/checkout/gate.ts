import "server-only";

import type { ServerSupabaseEnv } from "@/lib/supabase/config";

import {
  readUpstashEnv,
  upstashOrigin,
  type UpstashEnv,
} from "../login-throttle";
import { readServerSupabaseEnv, resolveServerIdentity } from "../supabase";

/**
 * The sales gate — S1.6 (docs/sprint-prompts/S1.6-checkout-pending-order.md §H.3 "Sales gate"; D-03). The first
 * step of every checkout action and of the checkout page, and it uses no network: configured facts only.
 *
 * Checkout is open only when ALL of these hold:
 *   1. `SALES_MODE` is exactly `test` — absent, empty or `off` is closed; `live` is closed too (live sales open at
 *      S3.4, by their own change); any other value is closed;
 *   2. the deployment context is not Production — Production stays closed whatever `SALES_MODE` says, and an unknown
 *      context is closed;
 *   3. the server's database identity resolves, and to the TEST project (src/lib/supabase/config.ts `serverConfig`:
 *      outside Production the API URL's ref must be the configured TEST ref);
 *   4. the public Razorpay key id is a Test Mode key (`rzp_test_…`) and its secret is present;
 *   5. the webhook secret is present (S1.7): a deployment that could not verify a payment's webhook takes none;
 *   6. the order-link secret, both Turnstile keys and both Upstash names are present and well formed.
 * Anything else is closed, with a reason code for the server's log only — the browser learns "closed" (NS-04) and
 * nothing else. A closed gate means zero business writes and zero calls to Upstash, Turnstile or Razorpay.
 *
 * The database function re-checks the effective business rule inside its own transaction (0004_checkout); this
 * gate is the deployment's half of the decision, never the only one.
 *
 * `providerGate()` is conditions 2–5 and the order-link secret alone — S1.7 (src/lib/server/payments/config.ts).
 * The webhook, the verified return and the order page stand on it and NOT on `SALES_MODE`, Turnstile, Upstash or
 * the business rule: a payment already made is processed whether or not new orders are being taken.
 *
 * The secrets read here never leave the server: the returned configuration is handed to the server-only checkout
 * and payment modules and is never serialised, logged or returned by an action. `checkoutPageConfig()` is the one
 * projection a page may receive — whether checkout is open and the public Turnstile site key.
 */

export type SalesGateEnv = ServerSupabaseEnv &
  UpstashEnv & {
    SALES_MODE?: string;
    NEXT_PUBLIC_RAZORPAY_KEY_ID?: string;
    RAZORPAY_KEY_SECRET?: string;
    RAZORPAY_WEBHOOK_SECRET?: string;
    ORDER_TOKEN_SECRET?: string;
    NEXT_PUBLIC_TURNSTILE_SITE_KEY?: string;
    TURNSTILE_SECRET_KEY?: string;
    VERCEL_URL?: string;
    VERCEL_BRANCH_URL?: string;
    VERCEL_PROJECT_PRODUCTION_URL?: string;
  };

/** Why the deployment's provider half is closed (S1.7 `providerGate`). */
export type ProviderGateClosedReason =
  | "production"
  | "identity"
  | "razorpay_key"
  | "razorpay_secret"
  | "razorpay_webhook_secret"
  | "token_secret";

export type SalesGateClosedReason =
  | "mode_off"
  | "mode_live_not_open"
  | "mode_invalid"
  | ProviderGateClosedReason
  | "turnstile"
  | "throttle";

/** What the payment modules need of the deployment: the verified TEST identity and the three provider secrets. */
export type ProviderConfig = {
  context: "preview" | "development";
  /** The TEST project's ref: the identity the gate verified. */
  projectRef: string;
  razorpayKeyId: string;
  razorpayKeySecret: string;
  razorpayWebhookSecret: string;
  orderTokenSecret: string;
};

export type ProviderGate =
  | { open: true; provider: ProviderConfig }
  | { open: false; reason: ProviderGateClosedReason };

export type CheckoutConfig = {
  context: "preview" | "development";
  /** The TEST project's ref: the identity the gate verified. */
  projectRef: string;
  razorpayKeyId: string;
  razorpayKeySecret: string;
  orderTokenSecret: string;
  turnstileSiteKey: string;
  turnstileSecret: string;
  /**
   * The hostnames a real Turnstile answer may name: this deployment's own (Vercel's system values), or the loopback
   * names for a local process. Never taken from a request.
   */
  turnstileHostnames: readonly string[];
};

export type SalesGate =
  | { open: true; config: CheckoutConfig }
  | { open: false; reason: SalesGateClosedReason };

/** A Razorpay Test Mode key id. A Live key (`rzp_live_…`) never opens this gate. */
export const RAZORPAY_TEST_KEY_ID_PATTERN = /^rzp_test_[A-Za-z0-9]{8,40}$/;
/** At least 32 random bytes as base64url (43 characters or more). */
export const ORDER_TOKEN_SECRET_PATTERN = /^[A-Za-z0-9_-]{43,200}$/;
/**
 * The webhook secret the owner sets in the Razorpay dashboard and in Vercel (S1.7): at least 16 characters, no
 * whitespace. It is its own value — never the API key secret (docs/ENV-VARS-SAFETY.md).
 */
export const RAZORPAY_WEBHOOK_SECRET_PATTERN = /^\S{16,300}$/;
const TURNSTILE_SITE_KEY_PATTERN = /^[A-Za-z0-9_-]{10,100}$/;
const OPAQUE_SECRET_PATTERN = /^\S{8,300}$/;

/** The names the gate reads, here and nowhere else in `src/` (the eslint server-only names rule). */
export function readSalesGateEnv(): SalesGateEnv {
  return {
    ...readServerSupabaseEnv(),
    ...readUpstashEnv(),
    SALES_MODE: process.env.SALES_MODE,
    NEXT_PUBLIC_RAZORPAY_KEY_ID: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
    RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET,
    ORDER_TOKEN_SECRET: process.env.ORDER_TOKEN_SECRET,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
    VERCEL_URL: process.env.VERCEL_URL,
    VERCEL_BRANCH_URL: process.env.VERCEL_BRANCH_URL,
    VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  };
}

const HOSTNAME_PATTERN = /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/;

/** The deployment's own hostnames from Vercel's system values (bare hostnames, no scheme); loopback when local. */
export function deploymentHostnames(env: SalesGateEnv): string[] {
  const names = [
    env.VERCEL_URL,
    env.VERCEL_BRANCH_URL,
    env.VERCEL_PROJECT_PRODUCTION_URL,
  ]
    .map((value) => (value ?? "").trim().toLowerCase())
    .filter((value) => HOSTNAME_PATTERN.test(value));
  if (names.length > 0) return [...new Set(names)];
  return env.VERCEL_ENV === undefined || env.VERCEL_ENV === ""
    ? ["localhost", "127.0.0.1"]
    : [];
}

function closed(reason: SalesGateClosedReason): SalesGate {
  return { open: false, reason };
}

/**
 * The deployment's provider half, with no word about whether new orders are taken: not Production, the server's
 * identity resolved to the TEST project, a Razorpay Test Mode key with its secret, the webhook secret and the
 * order-link secret. Reads configuration only — no network.
 */
export function providerGate(
  env: SalesGateEnv = readSalesGateEnv(),
): ProviderGate {
  const shut = (reason: ProviderGateClosedReason): ProviderGate => ({
    open: false,
    reason,
  });
  // Production is decided from the trusted deployment context before anything else is looked at.
  if (env.VERCEL_ENV === "production") return shut("production");
  const identity = resolveServerIdentity(env);
  if (!identity.ok) return shut("identity");
  const { context, projectRef, testRef } = identity.identity;
  if (context === "production") return shut("production");
  if (projectRef !== testRef) return shut("identity");

  const keyId = env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? "";
  if (!RAZORPAY_TEST_KEY_ID_PATTERN.test(keyId)) return shut("razorpay_key");
  const keySecret = env.RAZORPAY_KEY_SECRET ?? "";
  if (!OPAQUE_SECRET_PATTERN.test(keySecret)) return shut("razorpay_secret");
  const webhookSecret = env.RAZORPAY_WEBHOOK_SECRET ?? "";
  if (!RAZORPAY_WEBHOOK_SECRET_PATTERN.test(webhookSecret))
    return shut("razorpay_webhook_secret");
  const tokenSecret = env.ORDER_TOKEN_SECRET ?? "";
  if (!ORDER_TOKEN_SECRET_PATTERN.test(tokenSecret))
    return shut("token_secret");

  return {
    open: true,
    provider: {
      context,
      projectRef,
      razorpayKeyId: keyId,
      razorpayKeySecret: keySecret,
      razorpayWebhookSecret: webhookSecret,
      orderTokenSecret: tokenSecret,
    },
  };
}

export function salesGate(env: SalesGateEnv = readSalesGateEnv()): SalesGate {
  const mode = env.SALES_MODE;
  if (mode === undefined || mode === "" || mode === "off")
    return closed("mode_off");
  if (mode === "live") return closed("mode_live_not_open");
  if (mode !== "test") return closed("mode_invalid");

  const provider = providerGate(env);
  if (!provider.open) return closed(provider.reason);
  const {
    context,
    projectRef,
    razorpayKeyId: keyId,
    razorpayKeySecret: keySecret,
    orderTokenSecret: tokenSecret,
  } = provider.provider;
  const siteKey = env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
  const turnstileSecret = env.TURNSTILE_SECRET_KEY ?? "";
  if (
    !TURNSTILE_SITE_KEY_PATTERN.test(siteKey) ||
    !OPAQUE_SECRET_PATTERN.test(turnstileSecret)
  )
    return closed("turnstile");
  const upstashToken = env.UPSTASH_REDIS_REST_TOKEN ?? "";
  if (
    upstashOrigin(env.UPSTASH_REDIS_REST_URL) === null ||
    upstashToken.trim() === ""
  )
    return closed("throttle");

  return {
    open: true,
    config: {
      context,
      projectRef,
      razorpayKeyId: keyId,
      razorpayKeySecret: keySecret,
      orderTokenSecret: tokenSecret,
      turnstileSiteKey: siteKey,
      turnstileSecret,
      turnstileHostnames: deploymentHostnames(env),
    },
  };
}

/** What a page may know: whether checkout is open here, and the public Turnstile site key when it is. */
export type CheckoutPageConfig =
  { open: true; turnstileSiteKey: string } | { open: false };

/** The page's projection of the gate — no secret, no reason. Reads configuration only; safe at build time. */
export function checkoutPageConfig(
  env: SalesGateEnv = readSalesGateEnv(),
): CheckoutPageConfig {
  const gate = salesGate(env);
  return gate.open
    ? { open: true, turnstileSiteKey: gate.config.turnstileSiteKey }
    : { open: false };
}
