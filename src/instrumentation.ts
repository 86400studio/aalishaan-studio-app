import * as Sentry from "@sentry/nextjs";

type SentryEnvironment = "production" | "preview" | "development";

/** From Vercel's deployment context (VERCEL_ENV), never NODE_ENV: both Preview and Production run production builds. */
function sentryEnvironment(vercelEnv: string | undefined): SentryEnvironment {
  return vercelEnv === "production" || vercelEnv === "preview"
    ? vercelEnv
    : "development";
}

// Keep in step with the browser copy in src/instrumentation-client.ts.
const KEPT_REQUEST_HEADERS = new Set(["user-agent"]);

function withoutQuery(url: string): string {
  const end = url.search(/[?#]/);
  return end === -1 ? url : url.slice(0, end);
}

function scrubBreadcrumb(breadcrumb: Sentry.Breadcrumb): Sentry.Breadcrumb {
  const data = breadcrumb.data;
  if (data) {
    for (const key of ["url", "from", "to"]) {
      if (typeof data[key] === "string") data[key] = withoutQuery(data[key]);
    }
    // Outgoing-request breadcrumbs keep the query and fragment in separate fields.
    delete data["http.query"];
    delete data["http.fragment"];
  }
  return breadcrumb;
}

/** No cookies, bodies, query strings, user data or headers other than the user agent leave the server. */
function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  delete event.user;
  const request = event.request;
  if (request) {
    delete request.cookies;
    delete request.data;
    delete request.query_string;
    delete request.env;
    if (request.url) request.url = withoutQuery(request.url);
    if (request.headers) {
      request.headers = Object.fromEntries(
        Object.entries(request.headers).filter(([name]) =>
          KEPT_REQUEST_HEADERS.has(name.toLowerCase()),
        ),
      );
    }
  }
  // onRequestError (captureRequestError) records the request path, query string included, in this context.
  const nextjs = event.contexts?.nextjs;
  if (nextjs && typeof nextjs.request_path === "string") {
    nextjs.request_path = withoutQuery(nextjs.request_path);
  }
  event.breadcrumbs = event.breadcrumbs?.map(scrubBreadcrumb);
  return event;
}

export function register(): void {
  if (
    process.env.NEXT_RUNTIME !== "nodejs" &&
    process.env.NEXT_RUNTIME !== "edge"
  )
    return;
  Sentry.init({
    // Without a DSN the SDK stays disabled: monitoring is optional and never blocks a request.
    dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: sentryEnvironment(process.env.VERCEL_ENV),
    sendDefaultPii: false,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  });
}

export const onRequestError = Sentry.captureRequestError;
