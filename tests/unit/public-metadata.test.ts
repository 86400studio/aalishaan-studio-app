import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { metadata as aboutMetadata } from "@/app/(public)/about/page";
import { metadata as studioMetadata } from "@/app/(public)/about/studio/page";
import { metadata as contactMetadata } from "@/app/(public)/contact/page";
import { metadata as helpMetadata } from "@/app/(public)/help/page";
import { metadata as notFoundMetadata } from "@/app/(public)/not-found";
import { metadata as homeMetadata } from "@/app/(public)/page";
import {
  dynamicParams,
  generateMetadata,
  generateStaticParams,
} from "@/app/(public)/policies/[slug]/page";
import { metadata as trackMetadata } from "@/app/(public)/track/page";
import { metadata as rootMetadata, viewport } from "@/app/layout";
import { POLICY_SLUGS } from "@/content/public/policies";

/**
 * Every S1.3 page's document title and description are the prototype page's own `<title>` and
 * `<meta name="description">` (docs/APPROVED-INPUTS.md §2), the storefront stays noindex until S3.4 (D-03),
 * and the one theme-color is the build's (docs/DESIGN.md §2). Hermetic: the page modules' metadata exports.
 */
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
function head(relative: string): { title: string; description: string } {
  const html = readFileSync(path.join(ROOT, "prototype", relative), "utf8")
    .replace(/&eacute;/g, "é")
    .replace(/&uuml;/g, "ü")
    .replace(/&amp;/g, "&")
    .replace(/&mdash;/g, "—");
  return {
    title: /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? "",
    description: /name="description" content="([^"]*)"/.exec(html)?.[1] ?? "",
  };
}

describe("page metadata — the prototype's head, verbatim", () => {
  it.each([
    ["index.html", homeMetadata],
    ["pages/about/index.html", aboutMetadata],
    ["pages/about/studio/index.html", studioMetadata],
    ["pages/help/index.html", helpMetadata],
    ["pages/contact/index.html", contactMetadata],
    ["pages/track/index.html", trackMetadata],
    ["pages/404.html", notFoundMetadata],
  ])("%s", (relative, metadata) => {
    const expected = head(relative);
    expect(metadata.title).toBe(expected.title);
    expect(metadata.description).toBe(expected.description);
  });

  it("the seven policies, statically generated, with no other slug", async () => {
    expect(dynamicParams).toBe(false);
    expect(
      generateStaticParams()
        .map((p) => p.slug)
        .sort(),
    ).toEqual([...POLICY_SLUGS].sort());
    for (const slug of POLICY_SLUGS) {
      const expected = head(`pages/policies/${slug}/index.html`);
      const metadata = await generateMetadata({
        params: Promise.resolve({ slug }),
      });
      expect(metadata.title, slug).toBe(expected.title);
      expect(metadata.description, slug).toBe(expected.description);
    }
    expect(
      await generateMetadata({ params: Promise.resolve({ slug: "nope" }) }),
    ).toEqual({});
  });

  it("the root layout keeps every deployment noindex (D-03) and the one theme-color (DESIGN §2)", () => {
    expect(rootMetadata.robots).toEqual({ index: false, follow: false });
    expect(viewport.themeColor).toBe("#ffffff");
    expect(viewport.colorScheme).toBe("light");
  });
});
