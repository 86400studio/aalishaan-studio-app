import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

import { ALIAS_REDIRECTS } from "./src/lib/redirects";
import {
  ALL_PATHS,
  HOLDING_NOINDEX_HEADER,
  securityHeaders,
} from "./src/lib/security-headers";

/** Sentry environment from Vercel's deployment context (VERCEL_ENV), never NODE_ENV alone. */
function sentryEnvironment(
  vercelEnv: string | undefined,
): "production" | "preview" | "development" {
  return vercelEnv === "production" || vercelEnv === "preview"
    ? vercelEnv
    : "development";
}

const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;

const nextConfig: NextConfig = {
  // Stop `next dev` writing its agent block into the governing AGENTS.md / CLAUDE.md.
  agentRules: false,
  poweredByHeader: false,
  // S1.6: `next dev` prints every Server Function call with its arguments by default. The checkout's actions
  // carry the attempt key and what the customer typed, and the staff sign-in carries a password — none of it
  // belongs in a terminal or a pasted log. (Development only; `next start` and Vercel never log arguments.)
  logging: { serverFunctions: false },
  experimental: {
    // S1.3: one designed 404 for every unmatched URL, served by src/app/global-not-found.tsx with its own document;
    // there is no root not-found.tsx, which would sit in every route's tree and take its fonts and sheets there.
    globalNotFound: true,
  },
  env: {
    // Inlined into the browser bundle so client events carry the same environment as the server's.
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: sentryEnvironment(process.env.VERCEL_ENV),
  },
  async headers() {
    return [
      {
        source: ALL_PATHS,
        headers: [
          ...securityHeaders({
            sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
            supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
            isDevelopment: process.env.NODE_ENV === "development",
            // S1.6: the two public checkout values. Where they are configured (the Preview and local), the
            // policy names Turnstile's and Razorpay's origins; Production has neither until S3.3.
            turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
            razorpayKeyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
          }),
          HOLDING_NOINDEX_HEADER,
        ],
      },
    ];
  },
  // The manifest aliases of the S1.3 routes (docs/TECH-ARCHITECTURE.md §3d): duplicates → 301 to the
  // canonical route, query strings preserved by the framework; /order/demo → /track (D-09). The S1.4 and
  // S1.5 route groups add theirs; the whole map is verified on the live domain at S3.4.
  async redirects() {
    return ALIAS_REDIRECTS.map(({ source, destination }) => ({
      source,
      destination,
      statusCode: 301,
    }));
  },
};

export default withSentryConfig(nextConfig, {
  // Build-only values: source maps are generated and uploaded only when the build holds SENTRY_AUTH_TOKEN
  // (the Vercel builds), then deleted so no map is served. Without it (local, Code Check) nothing is uploaded.
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: sentryAuthToken,
  release: {
    name: process.env.VERCEL_GIT_COMMIT_SHA,
    create: Boolean(sentryAuthToken),
  },
  sourcemaps: { disable: !sentryAuthToken, deleteSourcemapsAfterUpload: true },
  telemetry: false,
  silent: !process.env.CI,
});
