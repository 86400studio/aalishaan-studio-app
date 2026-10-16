import type { Metadata } from "next";
import type { CSSProperties } from "react";

import { AboutHub } from "@/components/help/about-hub";
import { PublicPage } from "@/components/shell/public-page";
import { ABOUT_HEAD } from "@/content/public/pages";
import { siteImage } from "@/lib/site-images";

/** The About hub — S1.3 (docs/TECH-ARCHITECTURE.md §3a `/about`; prototype/pages/about/index.html). */
export const metadata: Metadata = {
  title: ABOUT_HEAD.title,
  description: ABOUT_HEAD.description,
};

const BANNER_STYLE = {
  "--site-image-about-page-hero-1600": `url("${siteImage("about-page-hero", "1600")}")`,
  "--site-image-about-page-hero-600": `url("${siteImage("about-page-hero", "600")}")`,
} as CSSProperties;

export default function AboutPage() {
  return (
    <PublicPage variant="help-hub" style={BANNER_STYLE}>
      <AboutHub />
    </PublicPage>
  );
}
