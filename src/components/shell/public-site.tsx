import localFont from "next/font/local";
import type { ReactNode } from "react";

import { PublicShell } from "./public-shell";

/**
 * The public shell with its two self-hosted font families, preloaded — S1.3 (docs/DESIGN.md §2 "Fonts"). Used
 * by the `(public)` route group's layout only: the global 404 declares the same files itself
 * (`src/styles/not-found.css`), never preloaded, so no other route — the Admin's included — carries a storefront
 * font, font preload or sheet (the Admin shell is S1.9).
 *
 * Charsen: one face, weight 400, `font-display: swap`, fallback Georgia — prototype/assets/fonts/charsen.otf
 * copied unchanged with its licence text ("Demo for Personal Use": D-13 — the owner decided on 2026-10-19 to keep
 * it as is on every deployment, Production included). Instrument Sans: SIL OFL 1.1,
 * weights 400 / 500 / 600 / 700, the latin subset (every character of the copy but the ₹, → and ↗), from
 * @fontsource/instrument-sans 5.3.0 (the Google Fonts build) with its LICENSE beside the files — D-14, every
 * public page. `adjustFontFallback: false` keeps the prototype's own stacks: without it the framework puts a
 * size-adjusted Arial before them, which then draws every glyph the faces lack (the ₹ beside Charsen digits,
 * the arrows) smaller and in a sans face.
 */
const charsen = localFont({
  src: "../../app/(public)/fonts/charsen.otf",
  weight: "400",
  style: "normal",
  display: "swap",
  variable: "--font-charsen",
  fallback: ["Georgia", "Times New Roman", "serif"],
  adjustFontFallback: false,
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
  ],
  display: "swap",
  variable: "--font-instrument-sans",
  fallback: ["Helvetica Neue", "Arial", "sans-serif"],
  adjustFontFallback: false,
  preload: true,
});

export function PublicSite({ children }: { children: ReactNode }) {
  return (
    <PublicShell
      fontVariables={`${charsen.variable} ${instrumentSans.variable}`}
    >
      {children}
    </PublicShell>
  );
}
