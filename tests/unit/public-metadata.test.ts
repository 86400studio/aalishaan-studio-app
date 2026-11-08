import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

// The artwork pages read the projection; the reader is replaced by the read each test sets (no network, no env).
const projection = vi.hoisted(() => ({
  read: { status: "unavailable", reason: "not_configured" } as unknown,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/catalogue", () => ({
  getPublicCatalogue: async () => projection.read,
}));

import { metadata as aboutMetadata } from "@/app/(public)/about/page";
import * as artworkPage from "@/app/(public)/artworks/[slug]/page";
import * as productPage from "@/app/(public)/product/page";
import { metadata as studioMetadata } from "@/app/(public)/about/studio/page";
import { metadata as contactMetadata } from "@/app/(public)/contact/page";
import { metadata as helpMetadata } from "@/app/(public)/help/page";
import { metadata as homeMetadata } from "@/app/(public)/page";
import { metadata as notFoundMetadata } from "@/app/global-not-found";
import {
  dynamicParams,
  generateMetadata,
  generateStaticParams,
} from "@/app/(public)/policies/[slug]/page";
import { metadata as trackMetadata } from "@/app/(public)/track/page";
import { metadata as rootMetadata, viewport } from "@/app/layout";
import { POLICY_SLUGS } from "@/content/public/policies";
import {
  ARTWORK_NOT_AVAILABLE,
  ARTWORK_ROUTES,
  LANTERN,
} from "@/content/public/product";
import {
  publicCatalogueRowSchema,
  type PublicCatalogueRow,
} from "@/lib/schemas/catalogue";
import { buildSeedPlan } from "../../scripts/testing/lib/catalogue.mjs";

/**
 * Every S1.3 page's document title and description are the prototype page's own `<title>` and
 * `<meta name="description">` (docs/APPROVED-INPUTS.md §2), the storefront stays noindex until S3.4 (D-03),
 * and the one theme-color is the build's (docs/DESIGN.md §2). From S1.5 the 22 artwork pages and `/product` take
 * theirs from the projection's row (seo_title / seo_description — build-products.cjs:170), which with the seeded
 * catalogue gives the frozen pages' heads, and carry the frozen canonical link. Hermetic: the page modules' metadata
 * exports; the artwork pages' projection read is a fake.
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

// The 22 seeded artworks as the projection returns them (the fixture of tests/unit/product-model.test.ts).
const plan = buildSeedPlan();
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
function seededRows(): PublicCatalogueRow[] {
  const finishes = [...plan.frame_finishes].sort(
    (a, b) => a.sort_order - b.sort_order,
  );
  return plan.artworks.map((artwork) => {
    const collection = plan.collections.find(
      (c) => c.slug === artwork.collection_slug,
    )!;
    const style = plan.art_styles.find((s) => s.slug === artwork.style_slug)!;
    return publicCatalogueRowSchema.parse({
      slug: artwork.slug,
      title: artwork.title,
      hook: artwork.hook,
      description: artwork.description,
      collection_slug: collection.slug,
      collection_name: collection.name,
      collection_intro: collection.intro,
      collection_sort_order: collection.sort_order,
      style_slug: style.slug,
      style_name: style.name,
      style_full_name: style.full_name,
      style_intro: style.intro,
      style_sort_order: style.sort_order,
      orientation: artwork.orientation,
      rooms: artwork.rooms,
      moods: artwork.moods,
      palettes: artwork.palettes,
      palette_hues: artwork.palette_hues,
      suggested_frame: artwork.suggested_frame,
      featured: artwork.featured,
      lead_time: artwork.lead_time,
      seo_title: artwork.seo_title,
      seo_description: artwork.seo_description,
      default_alt: artwork.default_alt,
      image_alt_text: artwork.image_alt_text,
      published_at: "2026-10-05T10:00:00+00:00",
      variants: finishes.map((finish) => {
        const variant = plan.variants.find(
          (v) => v.variant_code === `${artwork.slug}:${finish.code}`,
        )!;
        return {
          finish: variant.finish_code,
          finish_name: finish.name,
          variant_code: variant.variant_code,
          price_paise: Number(variant.price_paise),
          currency: variant.currency,
          availability: variant.availability,
          lead_time: variant.lead_time,
        };
      }),
      images: plan.images
        .filter((image) => image.slug === artwork.slug)
        .map((image) => ({
          slot: image.slot,
          size: image.size,
          path: image.object_path,
        }))
        .sort((a, b) => byText(a.slot, b.slot) || byText(a.size, b.size)),
    });
  });
}

/** The frozen page's canonical link, as the route it names (`../../../pages/artworks/<slug>/index.html`). */
function canonicalRoute(relative: string): string {
  const html = readFileSync(path.join(ROOT, "prototype", relative), "utf8");
  const href = /rel="canonical" href="([^"]*)"/.exec(html)?.[1] ?? "";
  const slug = /pages\/artworks\/([a-z0-9-]+)\/index\.html$/.exec(href)?.[1];
  return slug ? `/artworks/${slug}` : href;
}

const manifest = JSON.parse(
  readFileSync(path.join(ROOT, "prototype/site-manifest.json"), "utf8"),
) as { aliases: Record<string, string> };

describe("artwork page metadata — S1.5, from the projection's row", () => {
  afterEach(() => {
    projection.read = { status: "unavailable", reason: "not_configured" };
  });

  it("the 22 approved routes, statically generated, with no other slug; both entries are hourly ISR", () => {
    expect(artworkPage.dynamicParams).toBe(false);
    expect(artworkPage.revalidate).toBe(3600);
    expect(productPage.revalidate).toBe(3600);
    expect(artworkPage.generateStaticParams()).toEqual(
      ARTWORK_ROUTES.map(({ slug }) => ({ slug })),
    );
    expect(
      artworkPage.generateStaticParams().map(({ slug }) => `/artworks/${slug}`),
    ).toEqual(
      Object.keys(manifest.aliases).filter((alias) =>
        /^\/artworks\/[^/]+$/.test(alias),
      ),
    );
  });

  it("with the seeded catalogue, each artwork's head is its frozen page's: title, description and canonical link", async () => {
    projection.read = { status: "ok", rows: seededRows(), omitted: 0 };
    for (const { slug } of ARTWORK_ROUTES) {
      const relative = `pages/artworks/${slug}/index.html`;
      const expected = head(relative);
      const metadata = await artworkPage.generateMetadata({
        params: Promise.resolve({ slug }),
      });
      expect(metadata.title, slug).toBe(expected.title);
      expect(metadata.description, slug).toBe(expected.description);
      expect(metadata.alternates?.canonical, slug).toBe(
        canonicalRoute(relative),
      );
      expect(metadata.alternates?.canonical, slug).toBe(`/artworks/${slug}`);
    }
  });

  it("/product has the Lantern's frozen head and its canonical link names the Lantern's artwork route", async () => {
    projection.read = { status: "ok", rows: seededRows(), omitted: 0 };
    const expected = head("product/index.html");
    const metadata = await productPage.generateMetadata();
    expect(metadata.title).toBe(expected.title);
    expect(metadata.description).toBe(expected.description);
    expect(canonicalRoute("product/index.html")).toBe(LANTERN.canonicalPath);
    expect(metadata.alternates?.canonical).toBe(LANTERN.canonicalPath);
  });

  it("an approved artwork the projection does not hold (an empty Production projection, a hidden artwork) says so — no TEST or fallback head", async () => {
    projection.read = { status: "ok", rows: [], omitted: 0 };
    const empty = await artworkPage.generateMetadata({
      params: Promise.resolve({ slug: "willow-after-rain" }),
    });
    expect(empty).toEqual({
      title: ARTWORK_NOT_AVAILABLE.title,
      description: "",
      alternates: { canonical: "/artworks/willow-after-rain" },
    });
    projection.read = {
      status: "ok",
      rows: seededRows().filter((row) => row.slug !== LANTERN.slug),
      omitted: 0,
    };
    expect(await productPage.generateMetadata()).toEqual({
      title: ARTWORK_NOT_AVAILABLE.title,
      description: "",
      alternates: { canonical: LANTERN.canonicalPath },
    });
  });

  it("a build without the catalogue's configuration gives the same honest head; an unknown slug gives none", async () => {
    projection.read = { status: "unavailable", reason: "not_configured" };
    expect(
      (
        await artworkPage.generateMetadata({
          params: Promise.resolve({ slug: "the-ship-behind-the-fog-bell" }),
        })
      ).title,
    ).toBe(ARTWORK_NOT_AVAILABLE.title);
    expect(
      await artworkPage.generateMetadata({
        params: Promise.resolve({ slug: "nope" }),
      }),
    ).toEqual({});
  });
});
