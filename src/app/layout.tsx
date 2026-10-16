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
 * lives in the `(public)` route group's layout and the root 404 page; the Admin (S1.2, plain pages; the
 * Admin shell is S1.9) inherits nothing from the storefront.
 */
export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
