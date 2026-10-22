/**
 * The lazy path to the Sentry browser SDK (S1.3b, D-19). The SDK is about 55 KB of compressed script that every
 * public page ran before it became interactive; it now loads as a separate chunk, once, when
 * `src/instrumentation-client.ts` schedules it after the page has loaded — or at once when there is an error to
 * send. Until then the window's `error` and `unhandledrejection` events are listened to from the first script
 * and each is sent as soon as the SDK is initialised, so nothing captured before is lost; once initialised, the
 * SDK's own global handlers take over and the early listeners are removed. The error boundaries report through
 * `reportToSentry` too. No client module imports `@sentry/nextjs` statically.
 */
type SentryBrowser = typeof import("./sentry-browser");
type Mechanism = { type: string; handled: boolean };

let sdk: Promise<SentryBrowser> | undefined;

/** Imports the SDK, initialises it once and stops the early queue. A failed load is retried by the next call. */
export function loadSentry(): Promise<SentryBrowser> {
  sdk ??= import("./sentry-browser")
    .then((sentry) => {
      sentry.initBrowserSentry();
      stopQueueingEarlyErrors();
      return sentry;
    })
    .catch((error: unknown) => {
      // An offline moment or a chunk replaced by a newer deployment: the next report tries again.
      sdk = undefined;
      throw error;
    });
  return sdk;
}

/** The SDK once its load has started (for the router hook, which never starts it), otherwise undefined. */
export function startedSentry(): Promise<SentryBrowser> | undefined {
  return sdk;
}

/** Sends one error to Sentry, loading the SDK first if needed. Never throws. */
export function reportToSentry(error: unknown, mechanism?: Mechanism): void {
  loadSentry()
    .then((sentry) => {
      sentry.captureException(error, mechanism ? { mechanism } : undefined);
    })
    .catch(() => {});
}

// The mechanism the SDK's own global handlers give these events, so a queued event reads as one they caught.
const ON_ERROR: Mechanism = {
  type: "auto.browser.global_handlers.onerror",
  handled: false,
};
const ON_UNHANDLED_REJECTION: Mechanism = {
  type: "auto.browser.global_handlers.onunhandledrejection",
  handled: false,
};

function onError(event: ErrorEvent): void {
  // Without an Error object (a cross-origin script) the message is sent, as the SDK does.
  reportToSentry(event.error ?? event.message, ON_ERROR);
}

function onUnhandledRejection(event: PromiseRejectionEvent): void {
  reportToSentry(event.reason, ON_UNHANDLED_REJECTION);
}

let queueing = false;

/** Listens for uncaught errors until the SDK is initialised. Called once, from the first client script. */
export function queueEarlyErrors(): void {
  if (queueing || sdk) return;
  queueing = true;
  // The SDK's global handlers raise V8's stack depth to 50 at init; it ran in this first script before S1.3b, so the
  // errors queued until the deferred load keep the same depth.
  Error.stackTraceLimit = 50;
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);
}

function stopQueueingEarlyErrors(): void {
  if (!queueing) return;
  queueing = false;
  window.removeEventListener("error", onError);
  window.removeEventListener("unhandledrejection", onUnhandledRejection);
}
