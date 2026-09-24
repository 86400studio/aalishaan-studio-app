"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

import "@/styles/globals.css";

// Minimal technical fallback for React render errors, reported to Sentry. The words are the approved
// prototype 500 copy (prototype/pages/500.html), registered as NS-18; the designed 404/500 pages arrive in S1.3.
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <title>Aalishaan Studio</title>
        <main className="grid min-h-dvh place-items-center px-4 py-12 text-center">
          <div>
            <h1>Let’s try that again.</h1>
            <p className="mt-6">
              Something interrupted this page. Return home and try opening it
              again.
            </p>
            <p className="mt-6">
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a same-path client navigation cannot clear the root error boundary; a full page load does */}
              <a className="underline" href="/">
                Return home
              </a>
            </p>
          </div>
        </main>
      </body>
    </html>
  );
}
