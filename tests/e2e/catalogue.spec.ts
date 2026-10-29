import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./harness/fixtures";

/**
 * The S1.4 browse pages on the deployed candidate (docs/ROADMAP.md S1.4 acceptance), on the desktop and mobile-390
 * projects: each of the seventeen routes answers with its page — its heading, title and cards, its hero picture, no
 * error and no overflow, and on the Preview every image and the hero's CSS background loaded and decoded; Shop All's
 * search and filters count as the prototype counts (prototype/shared/browse.js run over the seeded catalogue), write
 * the URL in place (`history.replaceState`, no new history entry) and move focus where the listing says; a direct URL,
 * a legacy name and an unknown value are read on load, and Back and Forward bring the filters back from the URL;
 * `/shop-all` answers 301 with its query; the Saved artworks view shows what this browser saved — from Shop, from
 * Home, from another tab — says so honestly when storage is blocked, and opens from the cart drawer and the Menu; the
 * hubs list their cards in order and each detail page its own artworks; an unknown slug is the designed 404 from the
 * server; and without JavaScript Shop All shows every artwork and no heart. No server write happens anywhere in this
 * file; the only state touched is this browser context's localStorage. In local mode every request that leaves the
 * target origin is aborted (the sealed build's Storage URLs name a placeholder project), so the run stays on the
 * loopback server. Every test runs on both projects (the required-projects reporter counts a skip as a failure).
 */

/**
 * The three collections with their artworks, then the eleven styles (two artworks each), in
 * docs/TECH-ARCHITECTURE.md §3a's order.
 */
const COLLECTIONS: ReadonlyArray<
  [slug: string, name: string, artworks: number]
> = [
  ["painted-in-gold", "Painted in Gold", 4],
  ["blossoms-in-ink", "Blossoms in Ink", 8],
  ["the-age-of-sail", "The Age of Sail", 10],
];

const STYLES: ReadonlyArray<[slug: string, name: string]> = [
  ["gilded-peaks", "Gilded Peaks"],
  ["rinpa-moon", "Rinpa Moon"],
  ["four-gentlemen", "Four Gentlemen"],
  ["scarlet-blossom", "Scarlet Blossom"],
  ["moonlit-blossom", "Moonlit Blossom"],
  ["hand-printed-ukiyo-e", "Hand-Printed Ukiyo-e"],
  ["mythic-voyage", "Mythic Voyage"],
  ["corsair-chronicles", "Corsair Chronicles"],
  ["ghostly-armada", "Ghostly Armada"],
  ["marquetry-voyage", "Marquetry Voyage"],
  ["neo-classical-fantasy", "Neo-Classical Fantasy"],
];

/** Every art card of a listing, and those the filters leave showing (a hidden card carries `hidden`). */
const ART_CARDS = ".catalogue-grid > article.art-card";
const VISIBLE_CARDS = `${ART_CARDS}:visible`;

type BrowseRoute = {
  path: string;
  heading: string;
  /** What the page lists: its artworks, or a hub's cards. */
  cards: { selector: string; count: number };
  /** The R9 hero's picture (a CSS background); null on a collection page, whose cover is an <img> in main. */
  hero: string | null;
};

const ROUTES: BrowseRoute[] = [
  {
    path: "/shop",
    heading: "Shop All",
    cards: { selector: ART_CARDS, count: 22 },
    hero: "shop-all-page-hero",
  },
  {
    path: "/collections",
    heading: "Collections",
    cards: {
      selector: "section.collection-grid > article.collection-card",
      count: 3,
    },
    hero: "collections-page-hero",
  },
  ...COLLECTIONS.map(([slug, name, count]) => ({
    path: `/collections/${slug}`,
    heading: name,
    cards: { selector: ART_CARDS, count },
    hero: null,
  })),
  {
    path: "/art-styles",
    heading: "Art Styles",
    cards: {
      selector: "section.browse-stories > article.browse-story",
      count: 11,
    },
    hero: "art-styles-page-hero",
  },
  ...STYLES.map(([slug, name]) => ({
    path: `/art-styles/${slug}`,
    heading: name,
    cards: { selector: ART_CARDS, count: 2 },
    hero: "art-styles-page-hero",
  })),
];

async function noOverflow(page: Page) {
  const width = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(width.scroll, "no horizontal overflow").toBeLessThanOrEqual(
    width.client,
  );
}

/**
 * Scroll through the page so lazy images load, then report every rendered image in main that did not decode. The
 * scroll is instant: the storefront scrolls smoothly, and a scripted smooth scroll restarted every few milliseconds
 * never leaves the top of the page.
 */
async function brokenImages(page: Page): Promise<string[]> {
  const reachedBottom = await page.evaluate(async () => {
    const pause = () => new Promise((resolve) => setTimeout(resolve, 60));
    for (let y = 0; y < document.documentElement.scrollHeight; y += 600) {
      window.scrollTo({ top: y, behavior: "instant" });
      await pause();
    }
    const bottom = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: bottom, behavior: "instant" });
    await pause();
    const reached = Math.abs(window.scrollY - bottom) <= 2;
    window.scrollTo({ top: 0, behavior: "instant" });
    return reached;
  });
  expect(reachedBottom, "the scroll reached the bottom of the page").toBe(true);
  await page.waitForLoadState("networkidle");
  // An image the scroll reached late may still be decoding: wait for it, within bounds.
  await page.evaluate(() =>
    Promise.race([
      Promise.all(
        Array.from(document.querySelectorAll<HTMLImageElement>("main img"))
          .filter((img) => img.getClientRects().length > 0 && !img.complete)
          .map((img) => img.decode().catch(() => null)),
      ),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]),
  );
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLImageElement>("main img"))
      .filter((img) => img.getClientRects().length > 0)
      .filter((img) => !(img.complete && img.naturalWidth > 0))
      .map((img) => img.currentSrc || img.src),
  );
}

/** The URL of the R9 hero's picture, as the cascade resolved its custom property at this width. */
async function heroPicture(hero: Locator): Promise<string> {
  const value = await hero.evaluate(
    (element) => getComputedStyle(element).backgroundImage,
  );
  const url = /^url\("(.+)"\)$/.exec(value)?.[1] ?? "";
  expect(url, `the hero's background (${value})`).toMatch(/^https?:\/\//);
  return url;
}

/** A picture the page does not draw as an <img>: it answers 200 and decodes in the page. */
async function expectPictureLoads(page: Page, url: string): Promise<void> {
  const response = await page.request.get(url);
  expect(response.status(), url).toBe(200);
  const width = await page.evaluate(async (src) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    return image.naturalWidth;
  }, url);
  expect(width, url).toBeGreaterThan(0);
}

/**
 * Resolves once React has hydrated the element — its props are attached, so a click or a change reaches its handler.
 * Before that a click falls on the server's markup: a button does nothing, a link loads its page as a document.
 */
async function hydrated(locator: Locator): Promise<void> {
  await expect
    .poll(() =>
      locator.evaluate((element) =>
        Object.keys(element).some((key) => key.startsWith("__reactProps")),
      ),
    )
    .toBe(true);
}

/**
 * The filter form once it can be used: hydrated and open. At 767 px and below the listing closes the panel once after
 * it mounts (browse.js:19), so on the phone the summary is pressed only after that.
 */
async function filterForm(page: Page): Promise<Locator> {
  const panel = page.locator("details.filters");
  const form = panel.locator("#filter-form");
  await hydrated(form.locator("select[name=rooms]"));
  if ((page.viewportSize()?.width ?? 0) <= 767) {
    await expect(panel).not.toHaveAttribute("open");
    await panel.locator("summary").click();
  }
  await expect(panel).toHaveAttribute("open", "");
  return form;
}

/** One of the header's four links: the centred navigation on a wide screen, the Menu drawer at 1199 px and below. */
async function headerLink(page: Page, name: string): Promise<Locator> {
  if ((page.viewportSize()?.width ?? 0) > 1199) {
    const link = page
      .locator("nav.primary-nav")
      .getByRole("link", { name, exact: true });
    await hydrated(link);
    return link;
  }
  const menu = page.getByRole("button", { name: "Open menu" });
  await hydrated(menu);
  await menu.click();
  const drawer = page.locator("#mobile-nav");
  await expect(drawer).toHaveAttribute("data-open", "true");
  return drawer.getByRole("link", { name, exact: true });
}

/** The listing shows `count` artworks and says so (browse.js:12 — "1 artwork", "0 artworks", "22 artworks"). */
async function expectArtworks(page: Page, count: number): Promise<void> {
  await expect(page.locator(VISIBLE_CARDS)).toHaveCount(count);
  await expect(page.locator("#artwork-count")).toHaveText(
    `${count} artwork${count === 1 ? "" : "s"}`,
  );
}

/** The Saved artworks view, showing exactly these artworks in this order. */
async function expectSavedView(
  page: Page,
  slugs: readonly string[],
): Promise<void> {
  await expect(page.locator("[data-catalogue-label]")).toHaveText(
    "Saved artworks",
  );
  await expect(page.locator("[data-saved-note]")).toBeVisible();
  await expectArtworks(page, slugs.length);
  for (const [i, slug] of slugs.entries())
    await expect(page.locator(VISIBLE_CARDS).nth(i)).toHaveAttribute(
      "data-product",
      slug,
    );
}

/**
 * Saves artworks as the hearts do — the prototype's key `aalishaan-wishlist-<slug>` set to "true" — from a page of
 * the site, whose origin owns the storage.
 */
async function saveInThisBrowser(page: Page, ...slugs: string[]) {
  await page.evaluate(
    (keys) => {
      for (const key of keys) window.localStorage.setItem(key, "true");
    },
    slugs.map((slug) => `aalishaan-wishlist-${slug}`),
  );
}

const historyLength = (page: Page) =>
  page.evaluate(() => window.history.length);

const h1 = (page: Page, name: string) =>
  page.getByRole("heading", { level: 1, name, exact: true });

test.beforeEach(async ({ context, target }) => {
  // A sealed local run: nothing the pages ask for leaves the loopback server. The Preview loads everything.
  if (target.mode === "local")
    await context.route(
      (url) => url.origin !== target.origin,
      (route) => route.abort(),
    );
});

test.describe("S1.4 — the seventeen browse routes", () => {
  for (const route of ROUTES) {
    test(`${route.path} renders ${route.heading}: heading, title, cards and hero, no error and no overflow`, async ({
      page,
      target,
    }) => {
      const pageErrors: string[] = [];
      const consoleErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      page.on("console", (message) => {
        if (message.type() !== "error") return;
        // The automatic /favicon.ico probe answers 404 until the brand icon lands (S3.2); Chromium's text
        // for a failed load has no URL, so the filter reads the message's location.
        if (/\/favicon\.ico$/.test(message.location().url)) return;
        consoleErrors.push(`${message.text()} (${message.location().url})`);
      });
      const response = await page.goto(route.path, { waitUntil: "load" });
      expect(response?.status()).toBe(200);
      await expect(h1(page, route.heading)).toBeVisible();
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("#main")).toHaveCount(1);
      await expect(page).toHaveTitle(`${route.heading} | Aalishaan Studio`);
      await expect(page.locator("header.site-header")).toBeVisible();
      await expect(page.locator("footer.site-footer")).toBeVisible();
      // The footer's CTA band, as on every frozen browse page (§5 #37 (a)).
      const band = page.locator("footer .footer-cta");
      await expect(band).toHaveCount(1);
      await expect(band.getByRole("heading", { level: 2 })).toHaveText(
        "Find a piece that feels at home.",
      );
      if (route.cards.selector === ART_CARDS)
        await expectArtworks(page, route.cards.count);
      else
        await expect(page.locator(route.cards.selector)).toHaveCount(
          route.cards.count,
        );
      await noOverflow(page);
      // The R9 hero names its picture's 1600 copy, and the 600 copy at 700 px and below (src/styles/browse.css).
      const hero = page.locator("section.browse-hero--r9");
      if (route.hero === null) await expect(hero).toHaveCount(0);
      else {
        const picture = await heroPicture(hero);
        const copy = (page.viewportSize()?.width ?? 0) <= 700 ? "600" : "1600";
        expect(
          new URL(picture).pathname.endsWith(`/${route.hero}-${copy}.webp`),
          picture,
        ).toBe(true);
        if (target.mode === "preview") await expectPictureLoads(page, picture);
      }
      // On the Preview every Storage object exists (the TEST bucket holds the site and catalogue images); a sealed
      // local build names a placeholder Storage origin, which this file never reaches.
      if (target.mode === "preview") {
        expect(await brokenImages(page), "images that did not load").toEqual(
          [],
        );
        expect(consoleErrors, "console errors").toEqual([]);
      }
      expect(pageErrors).toEqual([]);
    });
  }

  test("an unknown collection or style slug is the designed 404, sent by the server with status 404", async ({
    page,
  }) => {
    for (const path of ["/collections/nope", "/art-styles/nope"]) {
      const response = await page.goto(path, { waitUntil: "load" });
      expect(response?.status(), path).toBe(404);
      // In the HTML the server sent, not only drawn by the browser (dynamicParams = false: the routing 404).
      expect(await response?.text(), path).toMatch(
        /<h1[^>]*>A little off the beaten path\.<\/h1>/,
      );
      await expect(h1(page, "A little off the beaten path.")).toBeVisible();
      await expect(page).toHaveTitle("404 — Page not found | Aalishaan Studio");
    }
  });
});

test.describe("S1.4 — Shop All's search and filters (prototype/shared/browse.js)", () => {
  test("Room: Bedroom shows its 7 artworks and writes the URL in place; its chip clears it and focuses the Room select", async ({
    page,
  }) => {
    await page.goto("/shop");
    await expectArtworks(page, 22);
    await expect(page.locator("[data-catalogue-label]")).toHaveText(
      "All Artworks",
    );
    const form = await filterForm(page);
    const room = form.locator("select[name=rooms]");
    const entries = await historyLength(page);
    await room.selectOption("Bedroom");
    await expectArtworks(page, 7);
    await expect(page).toHaveURL(/\/shop\?rooms=Bedroom$/);
    expect(await historyLength(page), "replaceState: no new entry").toBe(
      entries,
    );
    const chips = page
      .getByRole("group", { name: "Active filters" })
      .getByRole("button");
    const chip = page.getByRole("button", { name: "Remove Bedroom filter" });
    await expect(chips).toHaveCount(1);
    await expect(chip).toHaveText("Bedroom ×");
    await chip.click();
    await expectArtworks(page, 22);
    await expect(room).toHaveValue("");
    await expect(room).toBeFocused();
    await expect(chips).toHaveCount(0);
    await expect(page).toHaveURL(/\/shop$/);
    expect(await historyLength(page), "replaceState: no new entry").toBe(
      entries,
    );
  });

  test("with the filter panel closed — as it starts on a phone — removing a chip focuses the heading, never the page", async ({
    page,
  }) => {
    // The shell's "Shop by room" links name the room the legacy way (src/content/public/shell.ts).
    await page.goto("/shop?room=Bedroom");
    const panel = page.locator("details.filters");
    await hydrated(panel.locator("select[name=rooms]"));
    if ((page.viewportSize()?.width ?? 0) > 767) {
      await expect(panel).toHaveAttribute("open", "");
      await panel.locator("summary").click();
    }
    await expect(panel).not.toHaveAttribute("open");
    await expectArtworks(page, 7);
    const chip = page.getByRole("button", { name: "Remove Bedroom filter" });
    await chip.focus();
    await page.keyboard.press("Enter");
    await expectArtworks(page, 22);
    await expect(page.locator("select[name=rooms]")).toHaveValue("");
    await expect(page.locator("h2[data-catalogue-title]")).toBeFocused();
    await expect(panel).not.toHaveAttribute("open");
    await expect(page).toHaveURL(/\/shop$/);
  });

  test("search: Lantern finds 1 artwork; no match shows the empty state, whose Clear all filters brings back 22 and focuses the heading", async ({
    page,
  }) => {
    await page.goto("/shop");
    const form = await filterForm(page);
    const search = form.locator("input[name=q]");
    await search.fill("Lantern");
    await expectArtworks(page, 1);
    await expect(page.locator(VISIBLE_CARDS)).toHaveAttribute(
      "data-product",
      "the-lantern-that-outlasted-the-gale",
    );
    await expect(page).toHaveURL(/\/shop\?q=Lantern$/);
    await search.fill("nothing-matches-this");
    await expectArtworks(page, 0);
    const empty = page.locator(".empty-results");
    await expect(empty).toBeVisible();
    await expect(empty.locator("h3")).toHaveText(
      "No artworks match these filters.",
    );
    await expect(empty.locator("p")).toHaveText(
      "Try a different colour, room or search term.",
    );
    await empty.getByRole("button", { name: "Clear all filters" }).click();
    await expectArtworks(page, 22);
    await expect(empty).toBeHidden();
    await expect(search).toHaveValue("");
    await expect(page.locator("h2[data-catalogue-title]")).toBeFocused();
    await expect(page).toHaveURL(/\/shop$/);
  });

  test("the form's Clear all resets every control, the chips and the URL", async ({
    page,
  }) => {
    await page.goto("/shop");
    const form = await filterForm(page);
    const selects: Array<[name: string, value: string]> = [
      ["collection", "Painted in Gold"],
      ["style", "Rinpa Moon"],
      ["rooms", "Living Room"],
      ["moods", "Bold"],
      ["palettes", "Gold & Gilded"],
      ["orientation", "Portrait"],
    ];
    await form.locator("input[name=q]").fill("moon");
    for (const [name, value] of selects)
      await form.locator(`select[name=${name}]`).selectOption(value);
    await expectArtworks(page, 1);
    await expect(page.locator(VISIBLE_CARDS)).toHaveAttribute(
      "data-product",
      "the-pine-that-holds-the-moon",
    );
    const chips = page
      .getByRole("group", { name: "Active filters" })
      .getByRole("button");
    await expect(chips).toHaveText([
      "moon ×",
      ...selects.map(([, value]) => `${value} ×`),
    ]);
    // Every filter in the form's order (browse.js:16).
    await expect
      .poll(() => [...new URL(page.url()).searchParams])
      .toEqual([["q", "moon"], ...selects]);
    const clear = form.getByRole("button", { name: "Clear all", exact: true });
    await clear.click();
    await expectArtworks(page, 22);
    await expect(form.locator("input[name=q]")).toHaveValue("");
    for (const [name] of selects)
      await expect(form.locator(`select[name=${name}]`), name).toHaveValue("");
    await expect(chips).toHaveCount(0);
    await expect(page).toHaveURL(/\/shop$/);
    // The prototype moves no focus here: the button keeps it (browse.js:19).
    await expect(clear).toBeFocused();
  });
});

test.describe("S1.4 — filter state in the URL", () => {
  test("a direct URL sets the filters: the legacy room name, case-insensitive, and Study for Study & Office", async ({
    page,
  }) => {
    const cases: Array<[query: string, room: string, count: number]> = [
      ["?room=Living%20room", "Living Room", 4],
      ["?room=Study", "Study & Office", 10],
      ["?rooms=&room=Bedroom", "Bedroom", 7],
    ];
    for (const [query, room, count] of cases) {
      await page.goto(`/shop${query}`);
      await expect(page.locator("select[name=rooms]"), query).toHaveValue(room);
      await expectArtworks(page, count);
      await expect(
        page.getByRole("button", { name: `Remove ${room} filter` }),
        query,
      ).toBeVisible();
      // A direct load reads the URL and leaves it as it was (browse.js:19).
      expect(new URL(page.url()).search, query).toBe(query);
    }
  });

  test("an unknown value is kept: offered and selected, shown as a chip, and nothing matches", async ({
    page,
  }) => {
    await page.goto("/shop?moods=Sleepy");
    const moods = page.locator("select[name=moods]");
    await expect(moods).toHaveValue("Sleepy");
    await expect(moods.locator("option")).toHaveText([
      "All moods",
      "Bold",
      "Calm",
      "Full of wonder",
      "Grounded",
      "Nostalgic",
      "Warm",
      "Sleepy",
    ]);
    await expect(
      page.getByRole("button", { name: "Remove Sleepy filter" }),
    ).toHaveText("Sleepy ×");
    await expectArtworks(page, 0);
    const empty = page.locator(".empty-results");
    await expect(empty).toBeVisible();
    await expect(empty.locator("h3")).toHaveText(
      "No artworks match these filters.",
    );
    await expect(empty.locator("p")).toHaveText(
      "Try a different colour, room or search term.",
    );
    // Kept exactly, spaces included, as the option's value (browse.js:8 — `new Option(value, value)`).
    await page.goto("/shop?moods=%20Sleepy%20%20Owl%20");
    await expect(moods).toHaveValue(" Sleepy  Owl ");
    await expect(moods.locator("option").last()).toHaveAttribute(
      "value",
      " Sleepy  Owl ",
    );
    await expect(
      page.getByRole("group", { name: "Active filters" }).getByRole("button"),
    ).toHaveCount(1);
    await expectArtworks(page, 0);
  });

  test("Back and Forward: the filters come back from the URL, as loaded and as the listing replaced it", async ({
    page,
  }) => {
    const rooms = page.locator("select[name=rooms]");
    // As loaded.
    await page.goto("/shop?rooms=Bedroom");
    await expectArtworks(page, 7);
    await (await headerLink(page, "Collections")).click();
    await expect(page).toHaveURL(/\/collections$/);
    await expect(h1(page, "Collections")).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/shop\?rooms=Bedroom$/);
    await expect(rooms).toHaveValue("Bedroom");
    await expectArtworks(page, 7);
    await expect(
      page.getByRole("button", { name: "Remove Bedroom filter" }),
    ).toBeVisible();
    await page.goForward();
    await expect(page).toHaveURL(/\/collections$/);
    await expect(h1(page, "Collections")).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/shop\?rooms=Bedroom$/);
    await expectArtworks(page, 7);
    // As the listing replaced it.
    const form = await filterForm(page);
    await form.locator("select[name=rooms]").selectOption("Living Room");
    await expectArtworks(page, 4);
    await expect(page).toHaveURL(/\/shop\?rooms=Living\+Room$/);
    await (await headerLink(page, "Collections")).click();
    await expect(h1(page, "Collections")).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/shop\?rooms=Living\+Room$/);
    await expect(rooms).toHaveValue("Living Room");
    await expectArtworks(page, 4);
  });

  test("/shop-all answers 301 to /shop with its query", async ({
    page,
    target,
  }) => {
    const aliases: Array<[string, string]> = [
      ["/shop-all", "/shop"],
      ["/shop-all?rooms=Bedroom", "/shop?rooms=Bedroom"],
      ["/shop-all?room=Bedroom&saved=1", "/shop?room=Bedroom&saved=1"],
    ];
    for (const [source, destination] of aliases) {
      // The browser context's own request (the bypass cookie, never the secret header), redirect not followed.
      const response = await page.request.get(source, { maxRedirects: 0 });
      expect(response.status(), source).toBe(301);
      expect(
        new URL(response.headers()["location"] ?? "", target.origin).href,
        source,
      ).toBe(new URL(destination, target.origin).href);
    }
    await page.goto("/shop-all?rooms=Bedroom");
    await expect(page).toHaveURL(/\/shop\?rooms=Bedroom$/);
    await expectArtworks(page, 7);
  });
});

test.describe("S1.4 — Saved artworks (this browser only)", () => {
  test("?saved=1 shows exactly what this browser saved; its heart removes it and the heading takes focus; the note leads to every artwork", async ({
    page,
  }) => {
    await page.goto("/shop");
    await saveInThisBrowser(page, "the-first-warm-wall");
    await page.goto("/shop?saved=1");
    await expectSavedView(page, ["the-first-warm-wall"]);
    const note = page.locator("[data-saved-note]");
    await expect(note).toHaveText(
      "Explore all artworks Saved on this browser.",
    );
    const heart = page.getByRole("button", {
      name: "Remove The First Warm Wall from wishlist",
    });
    await expect(heart).toHaveAttribute("aria-pressed", "true");
    await heart.click();
    await expectArtworks(page, 0);
    const empty = page.locator(".empty-results");
    await expect(empty).toBeVisible();
    await expect(empty.locator("h3")).toHaveText(
      "No saved artworks match these filters.",
    );
    await expect(empty.locator("p")).toHaveText(
      "Save an artwork using its heart, or clear the filters to keep exploring.",
    );
    await expect(page.locator("h2[data-catalogue-title]")).toBeFocused();
    expect(
      await page.evaluate(() =>
        localStorage.getItem("aalishaan-wishlist-the-first-warm-wall"),
      ),
    ).toBe("false");
    // Clear all filters keeps the Saved view (prototype/PAGE-TRACKER.md:29); the note's link leaves it.
    await empty.getByRole("button", { name: "Clear all filters" }).click();
    await expect(empty).toBeVisible();
    await expect(page.locator("[data-catalogue-label]")).toHaveText(
      "Saved artworks",
    );
    await expect(page).toHaveURL(/\/shop\?saved=1$/);
    await note.getByRole("link", { name: "Explore all artworks" }).click();
    await expect(page).toHaveURL(/\/shop#artworks$/);
    await expect(page.locator("[data-catalogue-label]")).toHaveText(
      "All Artworks",
    );
    await expectArtworks(page, 22);
    await expect(note).toBeHidden();
    await expect(empty).toBeHidden();
  });

  test("a storage change that leaves this page's saved set as it was never moves focus later: the Collection select keeps it", async ({
    page,
    context,
  }) => {
    await page.goto("/shop");
    await saveInThisBrowser(
      page,
      "the-bridge-of-blue-stone",
      "bamboo-after-the-storm",
    );
    await page.goto("/shop?saved=1");
    await expectArtworks(page, 2);
    const form = await filterForm(page);
    const heart = page.locator(
      'article.art-card[data-product="the-bridge-of-blue-stone"] .wishlist',
    );
    await hydrated(heart);
    await heart.focus();
    // Another tab writes a key this page does not read: a storage event that changes nothing here.
    await page.evaluate(() => {
      (window as unknown as { storageSeen: Promise<void> }).storageSeen =
        new Promise((resolve) =>
          window.addEventListener("storage", () => resolve(), { once: true }),
        );
    });
    const other = await context.newPage();
    await other.goto("/shop");
    await other.evaluate(() =>
      localStorage.setItem("aalishaan-e2e-unrelated", "1"),
    );
    await page.evaluate(
      () => (window as unknown as { storageSeen: Promise<void> }).storageSeen,
    );
    await other.close();
    await expect(heart).toBeFocused();
    // Choosing Blossoms in Ink hides the Bridge's card, which held focus when the event came.
    const collection = form.locator("select[name=collection]");
    await collection.focus();
    await collection.selectOption("Blossoms in Ink");
    await expectArtworks(page, 1);
    await expect(collection).toBeFocused();
  });

  test("an artwork saved on Home is in Shop's Saved view", async ({ page }) => {
    await page.goto("/");
    const heart = page.getByRole("button", {
      name: "Save The Ship Between Two Storms to wishlist",
    });
    await hydrated(heart);
    await heart.scrollIntoViewIfNeeded();
    await heart.click();
    await expect(
      page.getByRole("button", {
        name: "Remove The Ship Between Two Storms from wishlist",
      }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.goto("/shop?saved=1");
    await expectSavedView(page, ["the-ship-between-two-storms"]);
    await expect(
      page.getByRole("button", {
        name: "Remove The Ship Between Two Storms from wishlist",
      }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("a heart pressed in another tab of this browser updates an open Saved view (the storage event)", async ({
    page,
    context,
  }) => {
    await page.goto("/shop?saved=1");
    await expect(page.locator("[data-catalogue-label]")).toHaveText(
      "Saved artworks",
    );
    await expectArtworks(page, 0);
    const other = await context.newPage();
    await other.goto("/shop");
    const save = other.getByRole("button", {
      name: "Save The Lantern That Outlasted the Gale to wishlist",
    });
    await hydrated(save);
    await save.click();
    const remove = other.getByRole("button", {
      name: "Remove The Lantern That Outlasted the Gale from wishlist",
    });
    await expect(remove).toHaveAttribute("aria-pressed", "true");
    await expectSavedView(page, ["the-lantern-that-outlasted-the-gale"]);
    await expect(
      page.getByRole("button", {
        name: "Remove The Lantern That Outlasted the Gale from wishlist",
      }),
    ).toHaveAttribute("aria-pressed", "true");
    await remove.click();
    await expectArtworks(page, 0);
    await expect(page.locator(".empty-results h3")).toHaveText(
      "No saved artworks match these filters.",
    );
    await other.close();
  });

  test("with storage blocked the Saved view says it cannot show them, and offers no Clear all filters", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    // Before any of the page's scripts: reading window.localStorage throws, as when the browser blocks site data.
    await page.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        get() {
          throw new DOMException("The operation is insecure.", "SecurityError");
        },
      });
    });
    await page.goto("/shop?saved=1");
    await expect(page.locator("[data-catalogue-label]")).toHaveText(
      "Saved artworks",
    );
    const empty = page.locator(".empty-results");
    await expect(empty).toBeVisible();
    await expect(empty.locator("h3")).toHaveText(
      "Saved artworks cannot be shown.",
    );
    await expect(empty.locator("p")).toHaveText(
      "Your browser could not read your saved artworks. Enable browser storage to keep a wishlist.",
    );
    await expect(empty.getByRole("button")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Clear all filters" }),
    ).toHaveCount(0);
    await expectArtworks(page, 0);
    expect(pageErrors).toEqual([]);
  });

  test("the cart drawer's Saved artworks — and the Menu's, at 1199 px and below — open Shop's Saved view, from another page and from Shop itself", async ({
    page,
  }) => {
    await page.goto("/shop");
    await saveInThisBrowser(page, "the-first-warm-wall");
    const drawers: Array<[id: string, opener: RegExp]> = [
      ["#cart-drawer", /^Open cart/],
    ];
    if ((page.viewportSize()?.width ?? 0) <= 1199)
      drawers.push(["#mobile-nav", /^Open menu$/]);
    for (const [id, opener] of drawers) {
      for (const from of ["/collections", "/shop"]) {
        await page.goto(from);
        const button = page.getByRole("button", { name: opener });
        await hydrated(button);
        await button.click();
        const drawer = page.locator(id);
        await expect(drawer, `${id} on ${from}`).toHaveAttribute(
          "data-open",
          "true",
        );
        await drawer
          .getByRole("link", { name: "Saved artworks", exact: true })
          .click();
        await expect(page, `${id} on ${from}`).toHaveURL(
          /\/shop\?saved=1#artworks$/,
        );
        await expectSavedView(page, ["the-first-warm-wall"]);
        await expect(drawer).not.toHaveAttribute("data-open", "true");
      }
    }
  });
});

test.describe("S1.4 — the hubs and the detail pages", () => {
  test("Collections: three cards in the projection's order, each leading to its collection", async ({
    page,
  }) => {
    await page.goto("/collections");
    const cards = page.locator(
      "section.collection-grid > article.collection-card",
    );
    await expect(cards.locator("h2")).toHaveText(
      COLLECTIONS.map(([, name]) => name),
    );
    for (const [i, [slug, name]] of COLLECTIONS.entries()) {
      const image = cards.nth(i).locator("a.collection-card__image");
      await expect(image).toHaveAttribute(
        "aria-label",
        `Open the ${name} collection`,
      );
      await expect(image).toHaveAttribute("href", `/collections/${slug}`);
      await expect(
        cards
          .nth(i)
          .getByRole("link", { name: "Open the collection", exact: true }),
      ).toHaveAttribute("href", `/collections/${slug}`);
    }
    // The prototype's verbatim name for the third (build-browse.cjs:80), and the page it opens.
    await cards
      .nth(2)
      .getByRole("link", { name: "Open the The Age of Sail collection" })
      .click();
    await expect(page).toHaveURL(/\/collections\/the-age-of-sail$/);
    await expect(h1(page, "The Age of Sail")).toBeVisible();
    await expectArtworks(page, 10);
  });

  test("Art Styles: eleven cards in docs/TECH-ARCHITECTURE.md §3a's order, each leading to its style", async ({
    page,
  }) => {
    await page.goto("/art-styles");
    const cards = page.locator("section.browse-stories > article.browse-story");
    await expect(cards.locator("h2")).toHaveText(
      STYLES.map(([, name]) => name),
    );
    for (const [i, [slug, name]] of STYLES.entries()) {
      const image = cards.nth(i).locator("a.browse-story__image");
      await expect(image).toHaveAttribute(
        "aria-label",
        `See the ${name} artworks`,
      );
      await expect(image).toHaveAttribute("href", `/art-styles/${slug}`);
      await expect(
        cards
          .nth(i)
          .getByRole("link", { name: "See the artworks", exact: true }),
      ).toHaveAttribute("href", `/art-styles/${slug}`);
    }
    await cards
      .nth(1)
      .getByRole("link", { name: "See the artworks", exact: true })
      .click();
    await expect(page).toHaveURL(/\/art-styles\/rinpa-moon$/);
    await expect(h1(page, "Rinpa Moon")).toBeVisible();
    await expectArtworks(page, 2);
  });

  test("a collection page lists its 4 artworks with the filters scoped to them; its back link leads to the hub", async ({
    page,
  }) => {
    await page.goto("/collections/painted-in-gold");
    await expectArtworks(page, 4);
    expect(
      (
        await page
          .locator(ART_CARDS)
          .evaluateAll((cards) =>
            cards.map((card) => card.getAttribute("data-product")),
          )
      ).sort(),
    ).toEqual([
      "the-bridge-of-blue-stone",
      "the-moon-between-two-peaks",
      "the-pine-that-holds-the-moon",
      "willow-after-rain",
    ]);
    await expect(page.locator("select[name=collection] option")).toHaveText([
      "All collections",
      "Painted in Gold",
    ]);
    // Painted in Gold + Bold: 2 (the prototype's oracle).
    const form = await filterForm(page);
    await form.locator("select[name=moods]").selectOption("Bold");
    await expectArtworks(page, 2);
    await expect(page).toHaveURL(/\/collections\/painted-in-gold\?moods=Bold$/);
    const back = page.locator(".browse-hero a.back-link");
    await expect(back).toHaveAccessibleName("All collections");
    await back.click();
    await expect(page).toHaveURL(/\/collections$/);
    await expect(h1(page, "Collections")).toBeVisible();
  });

  test("a style page lists its 2 artworks with the filters scoped to them; its back link leads to the hub", async ({
    page,
  }) => {
    await page.goto("/art-styles/rinpa-moon");
    await expectArtworks(page, 2);
    expect(
      (
        await page
          .locator(ART_CARDS)
          .evaluateAll((cards) =>
            cards.map((card) => card.getAttribute("data-product")),
          )
      ).sort(),
    ).toEqual(["the-pine-that-holds-the-moon", "willow-after-rain"]);
    await expect(page.locator("select[name=style] option")).toHaveText([
      "All art styles",
      "Rinpa Moon",
    ]);
    const back = page.locator(".browse-hero a.back-link");
    await expect(back).toHaveAccessibleName("All art styles");
    await back.click();
    await expect(page).toHaveURL(/\/art-styles$/);
    await expect(h1(page, "Art Styles")).toBeVisible();
  });
});

test.describe("S1.4 — without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("Shop All shows all 22 artworks, the count and the open filter panel whatever the query, and no heart", async ({
    page,
  }) => {
    for (const path of ["/shop", "/shop?rooms=Bedroom&saved=1"]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      await expect(page.locator(VISIBLE_CARDS), path).toHaveCount(22);
      await expect(page.locator("#artwork-count")).toHaveText("22 artworks");
      await expect(page.locator("[data-catalogue-label]")).toHaveText(
        "All Artworks",
      );
      await expect(page.locator("details.filters")).toHaveAttribute("open", "");
      await expect(page.locator("#filter-form")).toBeVisible();
      // The hearts cannot save without JavaScript, so they are hidden (the <noscript> rule, as on Home).
      await expect(page.locator(".wishlist")).toHaveCount(22);
      await expect(page.locator(".wishlist:visible")).toHaveCount(0);
      await expect(page.locator("[data-saved-note]")).toBeHidden();
      await expect(page.locator(".empty-results")).toBeHidden();
    }
  });
});
