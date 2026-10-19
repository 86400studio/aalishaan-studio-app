import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "Aalishaan Studio",
  // Closed to sales (D-03): every deployment stays out of search indexes until sales open at S3.4.
  robots: { index: false, follow: false },
};

// The one theme-color of the build (docs/DESIGN.md §2 — the page background is white; Home's #faf7f0 was the
// predevelopment ivory); `color-scheme: light` only, no dark theme (§6).
export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light",
};

/**
 * The root layout holds `html` and `body` only. The public shell (fonts, the `.site` wrapper, the drawers)
 * lives in the `(public)` route group's layout and in the global 404 (`global-not-found.tsx`, which brings its
 * own document); the Admin (S1.2, plain pages; the Admin shell is S1.9) inherits from the storefront only
 * globals.css's universal reduced-motion override (no Admin rule animates), this document's viewport and
 * `data-scroll-behavior` (the smooth scrolling itself is public-only), and — the global 404's styles being counted
 * among every route's assets — a same-origin `preconnect` and a `next-size-adjust` meta (no font, preload or sheet).
 */
export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    // `data-scroll-behavior`: the storefront's smooth scrolling (globals.css) is for in-page anchors; the
    // framework turns it off while it scrolls a client navigation to the top.
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
