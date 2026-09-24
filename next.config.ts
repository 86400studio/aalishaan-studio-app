import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

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
            isDevelopment: process.env.NODE_ENV === "development",
          }),
          HOLDING_NOINDEX_HEADER,
        ],
      },
    ];
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
