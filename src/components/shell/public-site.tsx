import localFont from "next/font/local";
import type { ReactNode } from "react";

import { SKIP_LINK } from "@/content/public/shell";

import { OverlayProvider } from "./overlays";

/**
 * The public shell's root — S1.3: the `.site` wrapper every storefront rule is scoped to, carrying the two
 * self-hosted font families as CSS variables (docs/DESIGN.md §2 "Fonts"), the skip link first in the DOM
 * (§6), then the page, then the overlays. Used by the `(public)` layout and by the root 404 page; never by
 * the Admin, which loads neither font (the Admin shell is S1.9).
 *
 * Charsen: one face, weight 400, `font-display: swap`, fallback Georgia — prototype/assets/fonts/charsen.otf
 * copied unchanged with its licence text ("Demo for Personal Use": D-13 — every deployment is protected until
 * S3.4; the owner resolves the licence before launch, S3.1 applies the outcome). Instrument Sans: SIL OFL 1.1,
 * weights 400 / 500 / 600 / 700, latin and latin-ext, from @fontsource/instrument-sans 5.3.0 (the Google
 * Fonts build) with its LICENSE beside the files — D-14, every public page.
 */
const charsen = localFont({
  src: "../../app/(public)/fonts/charsen.otf",
  weight: "400",
  style: "normal",
  display: "swap",
  variable: "--font-charsen",
  fallback: ["Georgia", "Times New Roman", "serif"],
  preload: true,
});

const instrumentSans = localFont({
  src: [
    {
      path: "../../app/(public)/fonts/instrument-sans/instrument-sans-latin-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../app/(public)/fonts/instrument-sans/instrument-sans-latin-500-normal.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../app/(public)/fonts/instrument-sans/instrument-sans-latin-600-normal.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../../app/(public)/fonts/instrument-sans/instrument-sans-latin-700-normal.woff2",
      weight: "700",
      style: "normal",
    },
    {
      path: "../../app/(public)/fonts/instrument-sans/instrument-sans-latin-ext-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../app/(public)/fonts/instrument-sans/instrument-sans-latin-ext-500-normal.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../app/(public)/fonts/instrument-sans/instrument-sans-latin-ext-600-normal.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../../app/(public)/fonts/instrument-sans/instrument-sans-latin-ext-700-normal.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  display: "swap",
  variable: "--font-instrument-sans",
  fallback: ["Helvetica Neue", "Arial", "sans-serif"],
  preload: true,
});

export function PublicSite({ children }: { children: ReactNode }) {
  return (
    <div className={`site ${charsen.variable} ${instrumentSans.variable}`}>
      <a className="skip-link" href="#main">
        {SKIP_LINK}
      </a>
      <OverlayProvider>{children}</OverlayProvider>
    </div>
  );
}
