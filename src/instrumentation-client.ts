import * as Sentry from "@sentry/nextjs";

// Keep in step with the server copy in src/instrumentation.ts.
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
    // Request breadcrumbs may keep the query and fragment in separate fields.
    delete data["http.query"];
    delete data["http.fragment"];
  }
  return breadcrumb;
}

/** No cookies, query strings, user data or headers other than the user agent (the referrer is dropped). */
function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
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

Sentry.init({
  // Public values inlined at build time. Without a DSN the SDK stays disabled.
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Set by next.config.ts from VERCEL_ENV at build time: development, preview or production.
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
  sendDefaultPii: false,
  beforeSend: scrubEvent,
  beforeBreadcrumb: scrubBreadcrumb,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
