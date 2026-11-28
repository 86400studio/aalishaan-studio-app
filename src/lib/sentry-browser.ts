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

/**
 * S1.7: `/order/<token>` is a private link — its address is the capability (D-09), so the token never leaves in an
 * address: every `/order/<segment>` becomes `/order/[token]`. Keep in step with src/instrumentation.ts.
 */
const ORDER_TOKEN_SEGMENT = /(\/order\/)[^/?#\s"'<>]+/g;

export function withoutOrderToken(text: string): string {
  return text.replace(ORDER_TOKEN_SEGMENT, "$1[token]");
}

/** An address as it may leave: no query, no fragment, no order token. */
function safeAddress(url: string): string {
  return withoutOrderToken(withoutQuery(url));
}

/** Sentry normalises an event's data three levels deep before it is sent; nothing it sends is nested this far. */
const REDACTION_DEPTH = 16;
const TOO_DEEP = "[too deep]";

/**
 * The last pass over anything about to leave: a copy of plain data (objects and arrays, however nested) in which no
 * string and no key carries an order token — a console breadcrumb's arguments, a stack frame's address, a context,
 * a field a later SDK adds. Anything that is not plain data is left as it is (Sentry has made an event plain data
 * before this runs), and data nested deeper than anything it sends is dropped, not passed. Keep in step with
 * src/instrumentation.ts.
 */
function withoutOrderTokens(
  value: unknown,
  copies: Map<object, unknown>,
  depth: number,
): unknown {
  if (typeof value === "string") return withoutOrderToken(value);
  if (value === null || typeof value !== "object") return value;
  const copied = copies.get(value);
  if (copied !== undefined) return copied;
  if (Array.isArray(value)) {
    if (depth >= REDACTION_DEPTH) return TOO_DEEP;
    const copy: unknown[] = [];
    copies.set(value, copy);
    for (const member of value)
      copy.push(withoutOrderTokens(member, copies, depth + 1));
    return copy;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  if (depth >= REDACTION_DEPTH) return TOO_DEEP;
  const copy: Record<string, unknown> = {};
  copies.set(value, copy);
  for (const [name, member] of Object.entries(value))
    copy[withoutOrderToken(name)] = withoutOrderTokens(
      member,
      copies,
      depth + 1,
    );
  return copy;
}

export function scrubBreadcrumb(
  breadcrumb: Sentry.Breadcrumb,
): Sentry.Breadcrumb {
  const data = breadcrumb.data;
  if (data) {
    for (const key of ["url", "from", "to"]) {
      if (typeof data[key] === "string") data[key] = safeAddress(data[key]);
    }
    // Request breadcrumbs may keep the query and fragment in separate fields.
    delete data["http.query"];
    delete data["http.fragment"];
  }
  // And no order token anywhere in it: its message, and what a console call was given (`data.arguments`).
  return withoutOrderTokens(breadcrumb, new Map(), 0) as Sentry.Breadcrumb;
}

/**
 * No cookies, query strings, user data or headers other than the user agent (the referrer is dropped) — and no
 * order token anywhere in what leaves: not in the page's address, the transaction's name, a tag, a message, a
 * stack frame's address (an inline script's frame is the page's own address), a context or the trail.
 */
export function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  delete event.user;
  const request = event.request;
  if (request) {
    delete request.cookies;
    delete request.data;
    delete request.query_string;
    if (request.url) request.url = safeAddress(request.url);
    if (request.headers) {
      request.headers = Object.fromEntries(
        Object.entries(request.headers).filter(([name]) =>
          KEPT_REQUEST_HEADERS.has(name.toLowerCase()),
        ),
      );
    }
  }
  // The server's onRequestError records the request path, query string included, in this context; the browser
  // never fills it, and the two copies treat it alike.
  const nextjs = event.contexts?.nextjs;
  if (nextjs && typeof nextjs.request_path === "string") {
    nextjs.request_path = safeAddress(nextjs.request_path);
  }
  event.breadcrumbs = event.breadcrumbs?.map(scrubBreadcrumb);
  // The last pass, over every field that is sent. `sdkProcessingMetadata` is the SDK's own working data: it is
  // removed before the event is sent and is not plain data.
  const fields = event as unknown as Record<string, unknown>;
  const copies = new Map<object, unknown>();
  for (const name of Object.keys(fields)) {
    if (name !== "sdkProcessingMetadata")
      fields[name] = withoutOrderTokens(fields[name], copies, 1);
  }
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
