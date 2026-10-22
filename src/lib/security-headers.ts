/**
 * Response headers applied to every path by next.config.ts (S0.1; docs/SECURITY-CHECKLIST.md §6,
 * docs/TECH-ARCHITECTURE.md §9). The policy allows only what this scaffold loads: its own Next.js
 * runtime and, when configured, the Sentry ingest origin of the browser DSN. Provider origins are added
 * by the sprint that first loads them (Razorpay at S1.6), never speculatively.
 */

import { storageOriginFromUrl } from "./site-images";

export type HttpHeader = { key: string; value: string };

export type SecurityHeaderOptions = {
  /** The browser DSN (`NEXT_PUBLIC_SENTRY_DSN`); its origin is the only third-party `connect-src`. */
  sentryDsn?: string;
  /**
   * The project's API origin (`NEXT_PUBLIC_SUPABASE_URL`, exactly `https://<ref>.supabase.co`); its origin
   * is the only remote `img-src` — the public bucket the catalogue and site images are served from (S1.3,
   * D-48). TEST on Preview and locally, PROD in Production: the narrowest origin per environment.
   */
  supabaseUrl?: string;
  /** True only for `next dev`, which needs `'unsafe-eval'` for React's development tooling. */
  isDevelopment?: boolean;
};

/**
 * Every request path, including `/`, API routes, static files and paths that do not exist. (`/:path*` is not
 * enough: Next.js's strict matcher does not match it against `/`.)
 */
export const ALL_PATHS = "/(.*)";

/** The https origin a Sentry DSN sends events to, or null when the DSN is absent or unusable. */
export function sentryIngestOrigin(dsn: string | undefined): string | null {
  if (!dsn) return null;
  let url: URL;
  try {
    url = new URL(dsn);
  } catch {
    return null;
  }
  return url.protocol === "https:" && url.hostname !== "" ? url.origin : null;
}

/**
 * The https origin of the project's API URL, or null unless it is exactly `https://<ref>.supabase.co` — the
 * same validator the image registry renders its URLs with (src/lib/site-images.ts), so the pages and the
 * policy can never name different origins.
 */
export const storageOrigin = storageOriginFromUrl;

export function contentSecurityPolicy({
  sentryDsn,
  supabaseUrl,
  isDevelopment = false,
}: SecurityHeaderOptions = {}): string {
  const sentryOrigin = sentryIngestOrigin(sentryDsn);
  const imageOrigin = storageOrigin(supabaseUrl);
  const directives: [string, ...string[]][] = [
    ["default-src", "'self'"],
    // The App Router streams its React Server Components payload through inline <script> tags. Without a
    // per-request nonce (which needs a proxy and forces every page to render dynamically) the policy must
    // allow inline scripts; eval stays blocked outside `next dev`.
    [
      "script-src",
      "'self'",
      "'unsafe-inline'",
      ...(isDevelopment ? ["'unsafe-eval'"] : []),
    ],
    ["style-src", "'self'", "'unsafe-inline'"],
    // `data:` for one use: the TOTP enrolment QR (S1.2) is a `data:image/svg+xml` returned by Supabase Auth and
    // rendered through <img>, where an SVG cannot run script. The one remote origin (S1.3, D-48) is the
    // project's own Storage origin — the public bucket that serves the catalogue and site images — derived
    // from NEXT_PUBLIC_SUPABASE_URL per environment, never typed; no other scheme or origin.
    ["img-src", "'self'", "data:", ...(imageOrigin ? [imageOrigin] : [])],
    ["font-src", "'self'"],
    ["connect-src", "'self'", ...(sentryOrigin ? [sentryOrigin] : [])],
    ["object-src", "'none'"],
    ["base-uri", "'self'"],
    ["form-action", "'self'"],
    ["frame-ancestors", "'none'"],
    ["upgrade-insecure-requests"],
  ];
  return directives.map((directive) => directive.join(" ")).join("; ");
}

/** The six security headers required on every response (`curl -I` shows all six). */
export function securityHeaders(
  options: SecurityHeaderOptions = {},
): HttpHeader[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(options) },
    // Two years. `preload` waits for the production domain decision (D-04) at S3.4.
    {
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains",
    },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value:
        "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
    },
  ];
}

/**
 * Keeps every response out of search indexes while the site is a closed holding page (D-03). Removed
 * when sales open at S3.4, together with the page metadata and robots.txt rules.
 */
export const HOLDING_NOINDEX_HEADER: HttpHeader = {
  key: "X-Robots-Tag",
  value: "noindex, nofollow",
};
