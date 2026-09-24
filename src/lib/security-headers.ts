/**
 * Response headers applied to every path by next.config.ts (S0.1; docs/SECURITY-CHECKLIST.md §6,
 * docs/TECH-ARCHITECTURE.md §9). The policy allows only what this scaffold loads: its own Next.js
 * runtime and, when configured, the Sentry ingest origin of the browser DSN. Provider origins are added
 * by the sprint that first loads them (Razorpay at S1.6), never speculatively.
 */

export type HttpHeader = { key: string; value: string };

export type SecurityHeaderOptions = {
  /** The browser DSN (`NEXT_PUBLIC_SENTRY_DSN`); its origin is the only third-party `connect-src`. */
  sentryDsn?: string;
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

export function contentSecurityPolicy({
  sentryDsn,
  isDevelopment = false,
}: SecurityHeaderOptions = {}): string {
  const sentryOrigin = sentryIngestOrigin(sentryDsn);
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
    ["img-src", "'self'"],
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
