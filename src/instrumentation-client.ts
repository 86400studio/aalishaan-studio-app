import {
  loadSentry,
  queueEarlyErrors,
  startedSentry,
} from "@/lib/report-error";

// The Sentry browser SDK loads off the critical path (S1.3b, D-19): uncaught errors are queued from this first
// script, and the SDK — its options and scrubbers in src/lib/sentry-browser.ts — is imported once the page has
// loaded and the main thread is idle, or at once when an error is queued (src/lib/report-error.ts).
queueEarlyErrors();

function loadWhenIdle(): void {
  const load = () => void loadSentry().catch(() => {});
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(load, { timeout: 5000 });
  } else {
    window.setTimeout(load, 2000);
  }
}

if (document.readyState === "complete") loadWhenIdle();
else window.addEventListener("load", loadWhenIdle, { once: true });

/** Navigation instrumentation, forwarded once the SDK is loading (it is never started from here). */
export function onRouterTransitionStart(
  href: string,
  navigationType: string,
): void {
  startedSentry()
    ?.then((sentry) =>
      sentry.captureRouterTransitionStart(href, navigationType),
    )
    .catch(() => {});
}
