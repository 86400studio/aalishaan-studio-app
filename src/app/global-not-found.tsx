import type { Metadata, Viewport } from "next";

import { PublicPage } from "@/components/shell/public-page";
import { PublicShell } from "@/components/shell/public-shell";
import { Recovery } from "@/components/shell/recovery";
import { ReloadOnPathChange } from "@/components/shell/reload-on-path-change";
import { RECOVERY } from "@/content/public/pages";
import "@/styles/globals.css";
import "@/styles/not-found.css";

/**
 * The one 404 for every unmatched URL — S1.3: the designed recovery page (prototype/pages/404.html) in the public
 * shell, rendered on the server. The framework serves this file directly, outside the root layout, so it brings
 * its own document, styles and fonts; it also counts this file's styles among every route's assets, so they hold
 * no preloaded font: `not-found.css` carries the sheets and plain declarations of the shell's two families (a root
 * `not-found.tsx` sat in every route's tree and made every page — the Admin's included — preload the storefront's
 * fonts and stylesheets). Its own document has no slot for another page, so a client navigation away from it
 * loads the new address as a document (`ReloadOnPathChange`).
 */
export const metadata: Metadata = {
  title: RECOVERY["404"].title,
  description: RECOVERY["404"].description,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default function GlobalNotFound() {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <PublicShell fontVariables="not-found-fonts">
          <PublicPage variant="recovery">
            <Recovery kind="404" />
          </PublicPage>
        </PublicShell>
        <ReloadOnPathChange />
      </body>
    </html>
  );
}
