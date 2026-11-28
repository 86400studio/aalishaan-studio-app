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

/**
 * S1.7: `/order/<token>` is a private link — its address is the capability (D-09), so the token never leaves in an
 * address: every `/order/<segment>` becomes `/order/[token]`. Keep in step with src/lib/sentry-browser.ts.
 */
const ORDER_TOKEN_SEGMENT = /(\/order\/)[^/?#\s"'<>]+/g;

function withoutOrderToken(text: string): string {
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
 * src/lib/sentry-browser.ts.
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

function scrubBreadcrumb(breadcrumb: Sentry.Breadcrumb): Sentry.Breadcrumb {
  const data = breadcrumb.data;
  if (data) {
    for (const key of ["url", "from", "to"]) {
      if (typeof data[key] === "string") data[key] = safeAddress(data[key]);
    }
    // Outgoing-request breadcrumbs keep the query and fragment in separate fields.
    delete data["http.query"];
    delete data["http.fragment"];
  }
  // And no order token anywhere in it: its message, and what a console call was given (`data.arguments`).
  return withoutOrderTokens(breadcrumb, new Map(), 0) as Sentry.Breadcrumb;
}

/**
 * No cookies, bodies, query strings, user data or headers other than the user agent leave the server — and no
 * order token anywhere in what leaves: not in the request's address, the transaction's name, the request path, a
 * tag, a message, a stack frame's address, a context or the trail.
 */
function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  delete event.user;
  const request = event.request;
  if (request) {
    delete request.cookies;
    delete request.data;
    delete request.query_string;
    delete request.env;
    if (request.url) request.url = safeAddress(request.url);
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
