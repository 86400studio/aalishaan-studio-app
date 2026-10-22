import * as Sentry from "@sentry/nextjs";

/**
 * The Sentry browser SDK and its options (S1.3b, D-19). Imported only through `src/lib/report-error.ts`,
 * which loads it as a separate chunk after the page has loaded — never statically from a client module. The
 * options and scrubbers are the ones `src/instrumentation-client.ts` passed at S0.1, moved unchanged.
 */

// Keep in step with the server copy in src/instrumentation.ts.
const KEPT_REQUEST_HEADERS = new Set(["user-agent"]);

function withoutQuery(url: string): string {
  const end = url.search(/[?#]/);
  return end === -1 ? url : url.slice(0, end);
}

export function scrubBreadcrumb(
  breadcrumb: Sentry.Breadcrumb,
): Sentry.Breadcrumb {
  const data = breadcrumb.data;
  if (data) {
    for (const key of ["url", "from", "to"]) {
      if (typeof data[key] === "string") data[key] = withoutQuery(data[key]);
    }
    // Request breadcrumbs may keep the query and fragment in separate fields.
    delete data["http.query"];
    delete data["http.fragment"];
  }
  return breadcrumb;
}

/** No cookies, query strings, user data or headers other than the user agent (the referrer is dropped). */
export function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  delete event.user;
  const request = event.request;
  if (request) {
    delete request.cookies;
    delete request.data;
    delete request.query_string;
    if (request.url) request.url = withoutQuery(request.url);
    if (request.headers) {
      request.headers = Object.fromEntries(
        Object.entries(request.headers).filter(([name]) =>
          KEPT_REQUEST_HEADERS.has(name.toLowerCase()),
        ),
      );
    }
  }
  event.breadcrumbs = event.breadcrumbs?.map(scrubBreadcrumb);
  return event;
}

let initialised = false;

/** Initialises the browser SDK once. */
export function initBrowserSentry(): void {
  if (initialised) return;
  initialised = true;
  Sentry.init({
    // Public values inlined at build time. Without a DSN the SDK stays disabled.
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    // Set by next.config.ts from VERCEL_ENV at build time: development, preview or production.
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
    sendDefaultPii: false,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  });
}

export const captureException = Sentry.captureException;
export const captureRouterTransitionStart = Sentry.captureRouterTransitionStart;
