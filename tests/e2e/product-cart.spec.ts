import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./harness/fixtures";
import type { ResolvedTarget } from "./harness/target";

/**
 * The S1.5 artwork pages, bag and cart on the deployed candidate (docs/sprint-prompts/S1.5-artwork-bag-cart.md §E
 * "Required acceptance cases", §H.2), on the desktop and mobile-390 projects: each of the 22 artwork routes and
 * `/product` answers with its page in the product shell, and every finish maps to its variant, its images and its price
 * everywhere the page shows them; `/cart` answers in the commerce shell; an unknown artwork is the designed 404 from the
 * server and the legacy Fog Bell address answers 301 with its query. The bag: adding twice merges, finishes stay
 * distinct, a finish change merges into an existing row capped at 99, and every edit, remove and clear reaches the
 * drawer, the badge and the cart; reload, Back / Forward and another tab keep the bag, the finish and the PIN; corrupt,
 * blocked and full storage recover honestly; prices stored in the browser never reach the subtotal; an outage or a
 * late answer never empties the bag or brings a row back. `POST /api/bag` rejects tampered and malformed bodies and
 * every other method, and answers `no-store`. The PIN form validates syntax only and shows that the estimate is pending;
 * the checkout control is disabled and nothing links to a checkout. Keyboard: the drawer's focus trap with rows, the
 * lightbox and the thumbnails' roving tabindex; the phone purchase bar; reduced motion; no JavaScript.
 *
 * Data: the 22-artwork, 66-variant TEST catalogue as seeded (scripts/testing/seed.mjs: every variant made to order at
 * 1,900,000 / 2,100,000 / 2,300,000 paise for White / Black / Antique Gold), which a TEST-backed Preview reads and a
 * sealed local run's catalogue stub serves. No test here is skipped or guarded away without that data: a run against an
 * empty projection fails (it would show "This artwork is not available.") rather than passing quietly. The image checks
 * also need the TEST bucket to hold the catalogue copies (S1.1) and the S1.5 site keys (scripts/testing/site-images.json
 * — the size-guide sheets, the craft details, the FAQ illustration, the Lantern's views), whose upload is a step of the
 * S1.5 TEST plan; they load-check on the Preview only, and in local mode read the URLs the build renders.
 *
 * Not proved here (unit or integration tests, or the manual evidence of the record): hidden, draft and retired
 * variants and a changed price on the real projection (tests/integration/bag.test.ts — they need a TEST mutation);
 * axe (no axe package is installed and none is added); 200 % zoom; the checkout Back / Forward round-trip (S1.6, owner
 * amendment H.1 #4). No server write happens anywhere in this file — `POST /api/bag` reads only; the only state touched
 * is this browser context's storage. In local mode every request that leaves the target origin is aborted. Every test
 * runs on both projects (the required-projects reporter counts a skip as a failure).
 */

type Finish = "white" | "black" | "antique-gold";

/** The seeded finishes, in the frame picker's fixed order after the suggested one, with their seeded prices. */
const FINISHES: ReadonlyArray<{
  code: Finish;
  name: string;
  price: string;
  paise: string;
  craft: string;
}> = [
  {
    code: "white",
    name: "White",
    price: "₹19,000",
    paise: "1900000",
    craft: "gen-01-craft-detail-white-frame",
  },
  {
    code: "black",
    name: "Black",
    price: "₹21,000",
    paise: "2100000",
    craft: "gen-01-craft-detail-black-frame",
  },
  {
    code: "antique-gold",
    name: "Antique Gold",
    price: "₹23,000",
    paise: "2300000",
    craft: "gen-01-craft-detail-gold-frame",
  },
];

const finishOf = (code: Finish) =>
  FINISHES.find((finish) => finish.code === code)!;

type Artwork = {
  slug: string;
  title: string;
  orientation: "Portrait" | "Landscape";
  suggested: Finish;
  collection: "painted-in-gold" | "blossoms-in-ink" | "the-age-of-sail";
};

/** The 22 approved artworks as seeded (docs/TECH-ARCHITECTURE.md §3a), in the route allow-list's order. */
const ARTWORKS: readonly Artwork[] = (
  [
    [
      "the-bridge-of-blue-stone",
      "The Bridge of Blue Stone",
      "Portrait",
      "antique-gold",
      "painted-in-gold",
    ],
    [
      "the-moon-between-two-peaks",
      "The Moon Between Two Peaks",
      "Portrait",
      "antique-gold",
      "painted-in-gold",
    ],
    [
      "the-pine-that-holds-the-moon",
      "The Pine That Holds the Moon",
      "Portrait",
      "antique-gold",
      "painted-in-gold",
    ],
    [
      "willow-after-rain",
      "Willow After Rain",
      "Portrait",
      "antique-gold",
      "painted-in-gold",
    ],
    [
      "bamboo-after-the-storm",
      "Bamboo After the Storm",
      "Portrait",
      "white",
      "blossoms-in-ink",
    ],
    [
      "the-cup-beneath-the-plum",
      "The Cup Beneath the Plum",
      "Portrait",
      "white",
      "blossoms-in-ink",
    ],
    [
      "the-blossom-over-the-closed-window",
      "The Blossom Over the Closed Window",
      "Portrait",
      "white",
      "blossoms-in-ink",
    ],
    [
      "the-first-warm-wall",
      "The First Warm Wall",
      "Portrait",
      "white",
      "blossoms-in-ink",
    ],
    [
      "the-branch-above-dark-water",
      "The Branch Above Dark Water",
      "Portrait",
      "white",
      "blossoms-in-ink",
    ],
    [
      "the-window-after-midnight",
      "The Window After Midnight",
      "Portrait",
      "white",
      "blossoms-in-ink",
    ],
    [
      "the-teahouse-shutters-at-spring-dawn",
      "The Teahouse Shutters at Spring Dawn",
      "Landscape",
      "white",
      "blossoms-in-ink",
    ],
    [
      "the-bridge-under-falling-blossom",
      "The Bridge Under Falling Blossom",
      "Landscape",
      "white",
      "blossoms-in-ink",
    ],
    [
      "the-harbour-chain-opens",
      "The Harbour Chain Opens",
      "Landscape",
      "antique-gold",
      "the-age-of-sail",
    ],
    [
      "the-galley-beyond-the-breakwater",
      "The Galley Beyond the Breakwater",
      "Landscape",
      "antique-gold",
      "the-age-of-sail",
    ],
    [
      "the-lantern-that-outlasted-the-gale",
      "The Lantern That Outlasted the Gale",
      "Landscape",
      "black",
      "the-age-of-sail",
    ],
    [
      "the-ship-between-two-storms",
      "The Ship Between Two Storms",
      "Landscape",
      "black",
      "the-age-of-sail",
    ],
    [
      "the-last-mooring-in-the-mist",
      "The Last Mooring in the Mist",
      "Landscape",
      "black",
      "the-age-of-sail",
    ],
    [
      "the-ship-behind-the-fog-bell",
      "The Ship Behind the Fog Bell",
      "Landscape",
      "black",
      "the-age-of-sail",
    ],
    [
      "the-shipyard-at-low-tide",
      "The Shipyard at Low Tide",
      "Landscape",
      "black",
      "the-age-of-sail",
    ],
    [
      "the-clipper-in-a-grain-wind",
      "The Clipper in a Grain-Wind",
      "Landscape",
      "black",
      "the-age-of-sail",
    ],
    [
      "the-copper-citadel-at-the-sea-gate",
      "The Copper Citadel at the Sea Gate",
      "Portrait",
      "antique-gold",
      "the-age-of-sail",
    ],
    [
      "the-palace-above-the-dry-dock",
      "The Palace Above the Dry Dock",
      "Portrait",
      "antique-gold",
      "the-age-of-sail",
    ],
  ] as const
).map(([slug, title, orientation, suggested, collection]) => ({
  slug,
  title,
  orientation,
  suggested,
  collection,
}));

const artwork = (slug: string) => ARTWORKS.find((a) => a.slug === slug)!;
const LANTERN = artwork("the-lantern-that-outlasted-the-gale");
const WARM_WALL = artwork("the-first-warm-wall");
const code = (a: Artwork, finish: Finish) => `${a.slug}:${finish}`;

const BAG_KEY = "aalishaanProductBag";
const PIN_KEY = "aalishaanDeliveryCheck";
const NOT_AVAILABLE_TITLE = "Artwork not available | Aalishaan Studio";
const MEMORY_ONLY =
  "Your selection is kept on this page only. Enable browser storage before continuing to checkout.";
const PIN_PENDING = (pin: string) =>
  `Delivery to ${pin} is not confirmed yet. Delivery availability and estimates will be shown before orders open.`;
const PIN_INVALID =
  "Enter a six-digit Indian PIN code. It cannot start with 0.";

type StoredItem = { code: string; quantity: number };

// ---------------------------------------------------------------------------------------------------------------
// Helpers (the shared ones follow tests/e2e/catalogue.spec.ts).

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
 * As tests/e2e/catalogue.spec.ts: scroll so lazy images load, then report every rendered image in main that did not
 * decode. A horizontal strip is swiped through as well, as a person would: a lazy thumbnail past a strip's right edge
 * (the Lantern's last view at 390 — its strip holds more views than the other pages', lazy as on the prototype) loads only once the strip scrolls to it.
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
    for (const strip of Array.from(
      document.querySelectorAll<HTMLElement>("main *"),
    ).filter(
      (el) =>
        el.scrollWidth > el.clientWidth + 1 &&
        ["auto", "scroll"].includes(getComputedStyle(el).overflowX),
    )) {
      strip.scrollIntoView({ block: "center", behavior: "instant" });
      for (let x = 0; x < strip.scrollWidth; x += strip.clientWidth) {
        strip.scrollTo({ left: x, behavior: "instant" });
        await pause();
      }
      strip.scrollTo({ left: strip.scrollWidth, behavior: "instant" });
      await pause();
      strip.scrollTo({ left: 0, behavior: "instant" });
    }
    window.scrollTo({ top: 0, behavior: "instant" });
    return reached;
  });
  expect(reachedBottom, "the scroll reached the bottom of the page").toBe(true);
  await page.waitForLoadState("networkidle");
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

/**
 * The TEST project's Storage origin, as tests/e2e/smoke.spec.ts reads it: a Preview carries TEST's public values, so
 * the image origin it renders is TEST's own. The ref is the name the owner's local env file holds for the TEST tools
 * (preview mode loads that file); it identifies the project and is no secret.
 */
function testStorageOrigin(): string {
  const ref = process.env.SUPABASE_TEST_PROJECT_REF ?? "";
  expect(ref, "SUPABASE_TEST_PROJECT_REF is a project ref").toMatch(
    /^[a-z]{20}$/,
  );
  return `https://${ref}.supabase.co`;
}

const BUCKET_PATH = "/storage/v1/object/public/catalogue-public/";
/** A local build renders the Storage origin when it holds the public URL, the app's own path otherwise (smoke.spec.ts). */
const LOCAL_IMAGE =
  /^(https:\/\/[a-z]{20}\.supabase\.co)?\/storage\/v1\/object\/public\/catalogue-public\/(artworks|site)\/[a-z0-9/._-]+\.webp$/;

/** Every image URL under `root` (src and each srcset candidate) names the public bucket on the expected origin. */
async function expectStorageImages(
  page: Page,
  target: ResolvedTarget,
  root = "main",
): Promise<void> {
  const urls = await page.evaluate(
    (selector) =>
      Array.from(document.querySelectorAll(`${selector} img`)).flatMap(
        (img) => [
          img.getAttribute("src") ?? "",
          ...(img.getAttribute("srcset") ?? "")
            .split(",")
            .map((candidate) => candidate.trim().split(/\s+/)[0] ?? ""),
        ],
      ),
    root,
  );
  const named = urls.filter((url) => url !== "");
  expect(named.length, `images under ${root}`).toBeGreaterThan(0);
  const prefix =
    target.mode === "preview" ? `${testStorageOrigin()}${BUCKET_PATH}` : null;
  for (const url of named) {
    if (prefix) expect(url.startsWith(prefix), url).toBe(true);
    else expect(url).toMatch(LOCAL_IMAGE);
  }
}

/** Resolves once React has hydrated the element (catalogue.spec.ts): a click before that falls on the server's markup. */
async function hydrated(locator: Locator): Promise<void> {
  await expect
    .poll(() =>
      locator.evaluate((element) =>
        Object.keys(element).some((key) => key.startsWith("__reactProps")),
      ),
    )
    .toBe(true);
}

/** Page and console errors, the favicon probe excepted (catalogue.spec.ts). */
function watchErrors(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    if (/\/favicon\.ico$/.test(message.location().url)) return;
    consoleErrors.push(`${message.text()} (${message.location().url})`);
  });
  return { pageErrors, consoleErrors };
}

const h1 = (page: Page, name: string) =>
  page.getByRole("heading", { level: 1, name, exact: true });

const cartTrigger = (page: Page) =>
  page.locator('header.site-header button[aria-controls="cart-drawer"]');

/** The header's cart button counts the bag's units in its label and its badge (prototype/shared/bag.js:14). */
async function expectBadge(page: Page, count: number): Promise<void> {
  const trigger = cartTrigger(page);
  await expect(trigger).toHaveAttribute(
    "aria-label",
    `Open cart, ${count} items`,
  );
  await expect(trigger.locator(".cart-count")).toHaveText(String(count));
}

async function openCart(page: Page): Promise<Locator> {
  const trigger = cartTrigger(page);
  await hydrated(trigger);
  // A visitor's click: the button takes focus where it is, then clicks. Playwright's own click first scrolls the
  // sticky header's button "into view", which with the artwork page's `scroll-padding-top` moves the page — a test
  // artefact, not what a visitor's click does.
  await trigger.evaluate((el: HTMLElement) => {
    el.focus({ preventScroll: true });
    el.click();
  });
  const drawer = page.locator("#cart-drawer");
  await expect(drawer).toHaveAttribute("data-open", "true");
  return drawer;
}

/** The stored bag's rows, or null when nothing is stored. */
async function storedItems(page: Page): Promise<StoredItem[] | null> {
  const text = await page.evaluate(
    (key) => window.localStorage.getItem(key),
    BAG_KEY,
  );
  if (text === null) return null;
  const parsed = JSON.parse(text) as { v: number; items: StoredItem[] };
  expect(parsed.v, "the stored bag's version").toBe(1);
  return parsed.items;
}

/**
 * Writes a stored bag from a page of the site (its origin owns the storage), then loads `path` as a new document so
 * the store reads it — the store does not hear its own tab's writes.
 */
async function plantBag(
  page: Page,
  value: unknown,
  path: string,
): Promise<void> {
  // A same-origin page that runs no script: an app page's own bag store could hydrate after the value is planted
  // (a slow hydration under load) and clear or rewrite it before `path` loads.
  await page.goto("/robots.txt");
  await page.evaluate(
    ([key, text]) => window.localStorage.setItem(key, text),
    [BAG_KEY, typeof value === "string" ? value : JSON.stringify(value)],
  );
  await page.goto(path);
}

const frameRadio = (page: Page, finish: Finish) =>
  page.locator(`fieldset.pd-frames input[name="frame"][value="${finish}"]`);

async function chooseFinish(page: Page, finish: Finish): Promise<void> {
  const radio = frameRadio(page, finish);
  await hydrated(radio);
  await radio.check();
  await expect(radio).toBeChecked();
}

async function addSelected(page: Page): Promise<void> {
  const add = page.locator("#main-cta");
  await hydrated(add);
  await add.click();
}

const cartRows = (page: Page) =>
  page.locator("#cart-page-items article.bag-row");
const drawerRows = (page: Page) =>
  page.locator("#cart-drawer [data-bag-items] article.bag-row");
const cartRow = (page: Page, rowCode: string) =>
  page.locator(`#cart-page-items article.bag-row[data-code="${rowCode}"]`);
const subtotal = (page: Page) => page.locator("dd[data-subtotal]");

/** Sets a cart row's quantity as a person does: the field commits on `change` (Enter), as bag.js:17. */
async function setCartQuantity(
  page: Page,
  rowCode: string,
  value: string,
): Promise<void> {
  const field = cartRow(page, rowCode).locator(
    'input[data-control="quantity"]',
  );
  await hydrated(field);
  await field.fill(value);
  await field.press("Enter");
}

/** One POST to the bag endpoint through the browser context (the bypass cookie, never the secret header). */
async function postBag(
  page: Page,
  body: string,
  contentType = "application/json",
) {
  return page.request.post("/api/bag", {
    data: body,
    headers: { "content-type": contentType },
    maxRedirects: 0,
  });
}

test.beforeEach(async ({ context, target }) => {
  // A sealed local run: nothing the pages ask for leaves the loopback server. The Preview loads everything.
  if (target.mode === "local")
    await context.route(
      (url) => url.origin !== target.origin,
      (route) => route.abort(),
    );
});

// ---------------------------------------------------------------------------------------------------------------

/** The artwork page's shell, heading and head for one seeded artwork, as server-rendered with its suggested finish. */
async function expectArtworkPage(
  page: Page,
  art: Artwork,
  canonicalPath: string,
): Promise<void> {
  await expect(h1(page, art.title)).toBeVisible();
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("#main")).toHaveCount(1);
  // The product variant of PublicPage (owner amendment H.1 #1): the frozen page's body classes and `main.pd`.
  await expect(page.locator("#main")).toHaveAttribute("class", "pd");
  await expect(page.locator("div.page.browse-page.product-page")).toHaveCount(
    1,
  );
  await expect(page.locator("header.site-header")).toBeVisible();
  await expect(page.locator("footer.site-footer")).toBeVisible();
  await expect(page.locator("footer .footer-cta")).toHaveCount(1);
  // The projection's own row, never the not-available state; its canonical address.
  await expect(page).not.toHaveTitle(NOT_AVAILABLE_TITLE);
  await expect(page).toHaveTitle(/\S/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    new RegExp(`${canonicalPath.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}$`),
  );
  const suggested = finishOf(art.suggested);
  // The frame picker lists the suggested finish first, selected (build-products.cjs:54).
  const radios = page.locator('fieldset.pd-frames input[name="frame"]');
  await expect(radios).toHaveCount(3);
  await expect(radios.first()).toHaveAttribute("value", art.suggested);
  await expect(frameRadio(page, art.suggested)).toBeChecked();
  await expect(page.locator(".pd-recommendation")).toHaveText(
    `Recommended Frame: ${suggested.name}`,
  );
  await expect(page.locator("#product-price")).toHaveText(suggested.price);
}

/**
 * One finish selected: the frame choice, the price, the stage and the Frame detail view, the craft card and the phone
 * bar all name that finish and its variant's price, and the finish's add puts exactly `<slug>:<finish>` in the bag.
 */
async function expectFinishEverywhere(
  page: Page,
  art: Artwork,
  finish: Finish,
): Promise<void> {
  const option = finishOf(finish);
  await chooseFinish(page, finish);
  await expect(
    page.locator("fieldset.pd-frames label.is-selected"),
  ).toHaveCount(1);
  await expect(
    page.locator("fieldset.pd-frames label.is-selected"),
  ).toContainText(option.name);
  await expect(page.locator("#product-price")).toHaveText(option.price);
  await expect(page.locator("#stage-image")).toHaveAttribute(
    "src",
    new RegExp(
      `${BUCKET_PATH}artworks/${art.slug}/frame-${finish}-1200\\.webp$`,
    ),
  );
  await expect(
    page.locator('.pd-thumbs [role="tab"][data-view="closeup"] img'),
  ).toHaveAttribute(
    "src",
    new RegExp(
      `${BUCKET_PATH}artworks/${art.slug}/close-${finish}-1200\\.webp$`,
    ),
  );
  await expect(page.locator("#craft-name")).toHaveText(option.name);
  await expect(page.locator("#craft-image")).toHaveAttribute(
    "src",
    new RegExp(`${BUCKET_PATH}site/${option.craft}-\\d+\\.webp$`),
  );
  await expect(page.locator("#sticky-frame")).toHaveText(option.name);
  await expect(page.locator("#sticky-price")).toHaveText(option.price);
  await expect(page.locator("#pd-sticky strong")).toHaveText(art.title);
  // Every option keeps showing its own price.
  for (const other of FINISHES)
    await expect(
      page.locator(
        `fieldset.pd-frames label:has(input[value="${other.code}"]) .pd-frame-price`,
      ),
    ).toHaveText(other.price);
  const before = (await storedItems(page)) ?? [];
  await addSelected(page);
  await expect(page.locator("#pd-notice")).toHaveText(
    `Added to cart · ${art.title} · ${option.name} frame`,
  );
  await expect
    .poll(() => storedItems(page))
    .toEqual([...before, { code: code(art, finish), quantity: 1 }]);
}

test.describe("S1.5 — the 24 entries", () => {
  for (const art of ARTWORKS) {
    test(`/artworks/${art.slug}: the product shell, every finish mapped to its variant, image and price, images from Storage`, async ({
      page,
      target,
    }) => {
      // Twenty-odd images, three finishes and three adds: more than the suite's 30 seconds on a cold Preview function.
      test.setTimeout(90_000);
      const { pageErrors, consoleErrors } = watchErrors(page);
      const path = `/artworks/${art.slug}`;
      const response = await page.goto(path, { waitUntil: "load" });
      expect(response?.status()).toBe(200);
      await expectArtworkPage(page, art, path);
      await noOverflow(page);
      // More from this collection: three other public artworks of the same collection, never this one (D-56).
      const related = page.locator(".pd-related article.art-card");
      await expect(related).toHaveCount(3);
      const siblings = ARTWORKS.filter(
        (a) => a.collection === art.collection && a.slug !== art.slug,
      ).map((a) => a.slug);
      for (const slug of await related.evaluateAll((cards) =>
        cards.map((card) => card.getAttribute("data-product")),
      ))
        expect(siblings, `related ${slug}`).toContain(slug);
      await expectStorageImages(page, target);
      // Each finish, the suggested last so the page ends where it began; three distinct rows (finishes stay distinct).
      const order = [
        ...FINISHES.map((f) => f.code).filter((f) => f !== art.suggested),
        art.suggested,
      ];
      for (const finish of order)
        await expectFinishEverywhere(page, art, finish);
      await expectBadge(page, 3);
      if (target.mode === "preview") {
        expect(await brokenImages(page), "images that did not load").toEqual(
          [],
        );
        expect(consoleErrors, "console errors").toEqual([]);
      }
      expect(pageErrors).toEqual([]);
    });
  }

  test("/product serves the Lantern, canonical to its artwork page; its finishes add the Lantern's variants", async ({
    page,
    target,
  }) => {
    test.setTimeout(60_000);
    const { pageErrors } = watchErrors(page);
    const response = await page.goto("/product", { waitUntil: "load" });
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/product$/);
    await expectArtworkPage(page, LANTERN, `/artworks/${LANTERN.slug}`);
    await expectStorageImages(page, target);
    await expectFinishEverywhere(page, LANTERN, "white");
    await expectBadge(page, 1);
    expect(pageErrors).toEqual([]);
  });

  test("/cart answers in the commerce shell: no CTA band, the empty bag once hydrated, the checkout control hidden", async ({
    page,
  }) => {
    const { pageErrors } = watchErrors(page);
    const response = await page.goto("/cart", { waitUntil: "load" });
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle("Your bag | Aalishaan Studio");
    await expect(h1(page, "Your bag")).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("#main")).toHaveAttribute(
      "class",
      "container utility-main",
    );
    await expect(
      page.locator("div.page.browse-page.utility-page.commerce-page"),
    ).toHaveCount(1);
    await expect(page.locator("header.site-header")).toBeVisible();
    await expect(page.locator("footer.site-footer")).toBeVisible();
    await expect(page.locator("footer .footer-cta")).toHaveCount(0);
    const empty = page.locator("#cart-page-items");
    await expect(empty.getByRole("heading", { level: 2 })).toHaveText(
      "Your bag is empty.",
    );
    await expect(
      empty.getByText("Choose an artwork and its frame finish to add it here."),
    ).toBeVisible();
    await expect(
      empty.getByRole("link", { name: "Explore artworks" }),
    ).toHaveAttribute("href", "/shop");
    await expect(page.locator("#checkout-link")).toBeHidden();
    await expect(subtotal(page)).toHaveText("₹0");
    await expectBadge(page, 0);
    await noOverflow(page);
    expect(pageErrors).toEqual([]);
  });

  test("an unknown artwork slug is the designed 404, sent by the server with status 404", async ({
    page,
  }) => {
    for (const path of [
      "/artworks/nope",
      "/artworks/the-lantern-that-outlasted-the-gale-2",
      "/artworks/THE-LANTERN-THAT-OUTLASTED-THE-GALE",
    ]) {
      const response = await page.goto(path, { waitUntil: "load" });
      expect(response?.status(), path).toBe(404);
      // In the HTML the server sent (dynamicParams = false: the routing 404, never an error shell — §10 #23 (j)).
      expect(await response?.text(), path).toMatch(
        /<h1[^>]*>A little off the beaten path\.<\/h1>/,
      );
      await expect(h1(page, "A little off the beaten path.")).toBeVisible();
      await expect(page).toHaveTitle("404 — Page not found | Aalishaan Studio");
    }
  });

  test("the legacy Fog Bell address answers 301 to its artwork page with its query", async ({
    page,
    target,
  }) => {
    const legacy = "/collections/the-age-of-sail/the-ship-behind-the-fog-bell";
    const destination = "/artworks/the-ship-behind-the-fog-bell";
    for (const [source, expected] of [
      [legacy, destination],
      [`${legacy}?ref=x&utm_source=y`, `${destination}?ref=x&utm_source=y`],
    ] as const) {
      const response = await page.request.get(source, { maxRedirects: 0 });
      expect(response.status(), source).toBe(301);
      expect(
        new URL(response.headers()["location"] ?? "", target.origin).href,
        source,
      ).toBe(new URL(expected, target.origin).href);
    }
    await page.goto(`${legacy}?ref=x`);
    await expect(page).toHaveURL(
      /\/artworks\/the-ship-behind-the-fog-bell\?ref=x$/,
    );
    await expect(h1(page, "The Ship Behind the Fog Bell")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------------------------------------------

test.describe("S1.5 — POST /api/bag (read-only validation)", () => {
  const ALL_CODES = ARTWORKS.flatMap((a) =>
    FINISHES.map((f) => code(a, f.code)),
  );

  test("the 66 seeded variants: the projection's titles, finishes and exact paise; the subtotal; no-store", async ({
    page,
  }) => {
    const response = await postBag(
      page,
      JSON.stringify({
        items: ALL_CODES.map((variant_code) => ({ variant_code, quantity: 1 })),
      }),
    );
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(response.headers()["content-type"]).toMatch(/^application\/json/);
    const body = (await response.json()) as {
      status: string;
      items: Array<Record<string, unknown>>;
      removed: unknown[];
      subtotal_paise: string;
      item_count: number;
    };
    expect(body.status).toBe("ok");
    expect(body.removed).toEqual([]);
    expect(body.items.map((item) => item.variant_code)).toEqual(ALL_CODES);
    for (const item of body.items) {
      const [slug, finishCode] = String(item.variant_code).split(":") as [
        string,
        Finish,
      ];
      const art = artwork(slug);
      const finish = finishOf(finishCode);
      expect(item, String(item.variant_code)).toEqual({
        variant_code: code(art, finish.code),
        quantity: 1,
        slug,
        title: art.title,
        orientation: art.orientation,
        finish: finish.code,
        finish_name: finish.name,
        available: true,
        unit_price_paise: finish.paise,
        line_total_paise: finish.paise,
      });
    }
    // 22 × (19,000 + 21,000 + 23,000) rupees, in integer paise.
    expect(body.subtotal_paise).toBe("138600000");
    expect(body.item_count).toBe(66);
  });

  test("an unknown variant code is removed with not_found, never priced", async ({
    page,
  }) => {
    const response = await postBag(
      page,
      JSON.stringify({
        items: [
          { variant_code: "no-such-artwork:white", quantity: 3 },
          { variant_code: code(WARM_WALL, "black"), quantity: 2 },
        ],
      }),
    );
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");
    const body = await response.json();
    expect(body.removed).toEqual([
      { variant_code: "no-such-artwork:white", reason: "not_found" },
    ]);
    expect(
      body.items.map((item: { variant_code: string }) => item.variant_code),
    ).toEqual([code(WARM_WALL, "black")]);
    expect(body.subtotal_paise).toBe("4200000");
    expect(body.item_count).toBe(2);
  });

  test("tampered, malformed and oversized bodies are refused with one sanitised status; nothing changes", async ({
    page,
  }) => {
    const valid = JSON.stringify({
      items: [{ variant_code: code(LANTERN, "black"), quantity: 2 }],
    });
    const baseline = await postBag(page, valid);
    expect(baseline.status()).toBe(200);
    const before = await baseline.json();

    const item = (extra: Record<string, unknown> = {}) => ({
      variant_code: code(LANTERN, "black"),
      quantity: 2,
      ...extra,
    });
    const refused: Array<[label: string, body: string, contentType?: string]> =
      [
        // A supplied price, total or display field is an authority-bearing extra key.
        [
          "a unit price",
          JSON.stringify({ items: [item({ unit_price_paise: "100" })] }),
        ],
        [
          "a line total",
          JSON.stringify({ items: [item({ line_total_paise: "200" })] }),
        ],
        [
          "a title",
          JSON.stringify({ items: [item({ title: "Free artwork" })] }),
        ],
        [
          "a subtotal",
          JSON.stringify({ items: [item()], subtotal_paise: "1" }),
        ],
        [
          "a price beside the rows",
          JSON.stringify({ items: [item()], price: 1 }),
        ],
        // Quantities: integers 1–99 only.
        ["quantity 0", JSON.stringify({ items: [item({ quantity: 0 })] })],
        ["quantity -1", JSON.stringify({ items: [item({ quantity: -1 })] })],
        ["quantity 100", JSON.stringify({ items: [item({ quantity: 100 })] })],
        ["quantity 1.5", JSON.stringify({ items: [item({ quantity: 1.5 })] })],
        ['quantity "2"', JSON.stringify({ items: [item({ quantity: "2" })] })],
        [
          "quantity 1e21",
          '{"items":[{"variant_code":"the-lantern-that-outlasted-the-gale:black","quantity":1e21}]}',
        ],
        [
          "quantity null",
          JSON.stringify({ items: [item({ quantity: null })] }),
        ],
        [
          "no quantity",
          JSON.stringify({ items: [{ variant_code: code(LANTERN, "black") }] }),
        ],
        // Codes and shape.
        [
          "an unknown finish",
          JSON.stringify({
            items: [item({ variant_code: `${LANTERN.slug}:silver` })],
          }),
        ],
        [
          "an upper-case code",
          JSON.stringify({
            items: [
              item({ variant_code: `${LANTERN.slug.toUpperCase()}:black` }),
            ],
          }),
        ],
        [
          "a duplicate code",
          JSON.stringify({ items: [item(), item({ quantity: 1 })] }),
        ],
        [
          "67 rows",
          JSON.stringify({
            items: Array.from({ length: 67 }, (_, i) => ({
              variant_code: `bag-limit-${i}:white`,
              quantity: 1,
            })),
          }),
        ],
        ["rows that are not an array", JSON.stringify({ items: item() })],
        ["a bare array", JSON.stringify([item()])],
        ["no rows key", "{}"],
        ["text that is not JSON", "items=1"],
        ["an empty body", ""],
        ["a non-JSON content type", valid, "text/plain"],
        ["a form content type", valid, "application/x-www-form-urlencoded"],
      ];
    for (const [label, body, contentType] of refused) {
      const response = await postBag(page, body, contentType);
      expect(response.status(), label).toBe(400);
      expect(response.headers()["cache-control"], label).toContain("no-store");
      // One enumerated status: nothing of the request echoed, no upstream text.
      expect(await response.json(), label).toEqual({
        status: "invalid_request",
      });
    }

    const large = await postBag(
      page,
      JSON.stringify({ items: [], pad: "x".repeat(17_000) }),
    );
    expect(large.status(), "a body above 16 KiB").toBe(413);
    expect(large.headers()["cache-control"]).toContain("no-store");
    expect(await large.json()).toEqual({ status: "too_large" });

    // The endpoint wrote nothing: the same valid question has the same answer afterwards.
    const after = await postBag(page, valid);
    expect(after.status()).toBe(200);
    expect(await after.json()).toEqual(before);
    expect(before.subtotal_paise).toBe("4200000");
  });

  test("every other method answers 405 with Allow: POST and no-store", async ({
    page,
  }) => {
    for (const method of ["GET", "PUT", "PATCH", "DELETE"]) {
      const response = await page.request.fetch("/api/bag", {
        method,
        maxRedirects: 0,
        ...(method === "GET"
          ? {}
          : { data: "{}", headers: { "content-type": "application/json" } }),
      });
      expect(response.status(), method).toBe(405);
      expect(response.headers()["allow"], method).toBe("POST");
      expect(response.headers()["cache-control"], method).toContain("no-store");
      expect(await response.json(), method).toEqual({
        status: "method_not_allowed",
      });
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------

test.describe("S1.5 — adding, merging and editing the bag", () => {
  test("adding twice merges into one row of two; the add never opens the drawer; the drawer prices it from the server", async ({
    page,
    target,
  }) => {
    await page.goto(`/artworks/${LANTERN.slug}`);
    await addSelected(page);
    await expect(page.locator("#pd-notice")).toHaveText(
      `Added to cart · ${LANTERN.title} · Black frame`,
    );
    await page.locator("#main-cta").click();
    await expect
      .poll(() => storedItems(page))
      .toEqual([{ code: code(LANTERN, "black"), quantity: 2 }]);
    await expectBadge(page, 2);
    await expect(page.locator("#cart-drawer")).not.toHaveAttribute(
      "data-open",
      "true",
    );
    const answered = page.waitForResponse(
      (r) => r.url().endsWith("/api/bag") && r.request().method() === "POST",
    );
    const drawer = await openCart(page);
    expect((await answered).status()).toBe(200);
    const rows = drawerRows(page);
    await expect(rows).toHaveCount(1);
    await expect(rows.locator("h3")).toHaveText(LANTERN.title);
    await expect(rows).toContainText("A2 Landscape · Black frame");
    await expect(rows).toContainText("Quantity 2");
    await expect(rows.locator(".bag-price")).toHaveText(
      "₹42,000 (₹21,000 each)",
    );
    await expect(rows.locator("img")).toHaveAttribute(
      "src",
      new RegExp(
        `${BUCKET_PATH}artworks/${LANTERN.slug}/frame-black-1200\\.webp$`,
      ),
    );
    await expectStorageImages(page, target, "#cart-drawer");
    await expect(drawer.getByText("Your cart is quiet.")).toHaveCount(0);
  });

  test("an artwork already at 99 is not added again: the notice says so and the row stays at 99", async ({
    page,
  }) => {
    await plantBag(
      page,
      { v: 1, items: [{ code: code(LANTERN, "black"), quantity: 99 }] },
      `/artworks/${LANTERN.slug}`,
    );
    await expectBadge(page, 99);
    await addSelected(page);
    await expect(page.locator("#pd-notice")).toHaveText(
      "Your bag already has 99 of this artwork and frame. Edit the quantity in your bag.",
    );
    expect(await storedItems(page)).toEqual([
      { code: code(LANTERN, "black"), quantity: 99 },
    ]);
    await expectBadge(page, 99);
  });

  test("on the cart a finish change into an existing row merges, capped at 99, and the focus goes to the merged row's Frame", async ({
    page,
  }) => {
    await plantBag(
      page,
      {
        v: 1,
        items: [
          { code: code(LANTERN, "white"), quantity: 60 },
          { code: code(WARM_WALL, "white"), quantity: 1 },
          { code: code(LANTERN, "black"), quantity: 50 },
        ],
      },
      "/cart",
    );
    await expect(cartRows(page)).toHaveCount(3);
    await expectBadge(page, 111);
    const frame = cartRow(page, code(LANTERN, "white")).locator(
      'select[data-control="frame"]',
    );
    await hydrated(frame);
    await expect(frame).toHaveAccessibleName(`Frame for ${LANTERN.title}`);
    await frame.selectOption("black");
    // Merged at the earlier row's position, 60 + 50 capped at 99.
    await expect
      .poll(() => storedItems(page))
      .toEqual([
        { code: code(LANTERN, "black"), quantity: 99 },
        { code: code(WARM_WALL, "white"), quantity: 1 },
      ]);
    await expect(cartRows(page)).toHaveCount(2);
    await expect(cartRows(page).first()).toHaveAttribute(
      "data-code",
      code(LANTERN, "black"),
    );
    await expect(
      cartRow(page, code(LANTERN, "black")).locator(
        'select[data-control="frame"]',
      ),
    ).toBeFocused();
    await expectBadge(page, 100);
    // 99 × ₹21,000 + ₹19,000, from the server's answer for this bag.
    await expect(subtotal(page)).toHaveText("₹20,98,000");
    // A finish change into a finish the bag lacks keeps one row with a new code.
    await cartRow(page, code(WARM_WALL, "white"))
      .locator('select[data-control="frame"]')
      .selectOption("antique-gold");
    await expect
      .poll(() => storedItems(page))
      .toEqual([
        { code: code(LANTERN, "black"), quantity: 99 },
        { code: code(WARM_WALL, "antique-gold"), quantity: 1 },
      ]);
    await expect(subtotal(page)).toHaveText("₹21,02,000");
  });

  test("the cart's quantity field coerces zero, negatives, fractions and huge entries to 1–99", async ({
    page,
  }) => {
    await plantBag(
      page,
      { v: 1, items: [{ code: code(WARM_WALL, "white"), quantity: 1 }] },
      "/cart",
    );
    const rowCode = code(WARM_WALL, "white");
    await expect(cartRows(page)).toHaveCount(1);
    const field = cartRow(page, rowCode).locator(
      'input[data-control="quantity"]',
    );
    for (const [entry, quantity] of [
      ["3", 3],
      ["0", 1],
      ["-5", 1],
      ["2.7", 2],
      ["250", 99],
      ["1e9", 99],
      ["4", 4],
    ] as const) {
      await setCartQuantity(page, rowCode, entry);
      await expect(field, entry).toHaveValue(String(quantity));
      await expect
        .poll(() => storedItems(page), entry)
        .toEqual([{ code: rowCode, quantity }]);
      await expectBadge(page, quantity);
    }
    await expect(subtotal(page)).toHaveText("₹76,000");
    await expect(cartRow(page, rowCode).locator(".bag-price")).toHaveText(
      "₹76,000 (₹19,000 each)",
    );
  });

  test("edit, remove and clear reach the drawer, the badge and the cart page together", async ({
    page,
  }) => {
    await plantBag(
      page,
      {
        v: 1,
        items: [
          { code: code(WARM_WALL, "white"), quantity: 1 },
          { code: code(LANTERN, "antique-gold"), quantity: 1 },
        ],
      },
      "/cart",
    );
    await expect(cartRows(page)).toHaveCount(2);
    await expect(subtotal(page)).toHaveText("₹42,000");
    // Edit on the cart page: the drawer opened over it shows the new quantity.
    await setCartQuantity(page, code(WARM_WALL, "white"), "3");
    await expectBadge(page, 4);
    await expect(subtotal(page)).toHaveText("₹80,000");
    let drawer = await openCart(page);
    await expect(drawerRows(page)).toHaveCount(2);
    await expect(
      drawer.locator(
        `article.bag-row[data-code="${code(WARM_WALL, "white")}"]`,
      ),
    ).toContainText("Quantity 3");
    // Remove in the drawer: the cart page loses the row too, and the focus goes to the drawer's Close.
    const remove = drawer.getByRole("button", {
      name: `Remove ${LANTERN.title}`,
    });
    await hydrated(remove);
    await remove.click();
    await expect(drawerRows(page)).toHaveCount(1);
    await expect(
      drawer.getByRole("button", { name: "Close cart" }),
    ).toBeFocused();
    await expectBadge(page, 3);
    await page.keyboard.press("Escape");
    await expect(drawer).not.toHaveAttribute("data-open", "true");
    await expect(cartRows(page)).toHaveCount(1);
    await expect(subtotal(page)).toHaveText("₹57,000");
    // Remove on the cart page: the last row's Remove leaves the empty state, whose heading takes the focus.
    await cartRow(page, code(WARM_WALL, "white"))
      .getByRole("button", { name: `Remove ${WARM_WALL.title}` })
      .click();
    const emptyHeading = page.locator("#cart-page-items h2");
    await expect(emptyHeading).toHaveText("Your bag is empty.");
    await expect(emptyHeading).toBeFocused();
    await expectBadge(page, 0);
    expect(await storedItems(page)).toEqual([]);
    drawer = await openCart(page);
    await expect(drawer.getByText("Your cart is quiet.")).toBeVisible();
    await page.keyboard.press("Escape");
    // Clear from the Cookies page: the bag, the PIN and the chosen finishes go, every consumer follows.
    await page.goto(`/artworks/${LANTERN.slug}`);
    await chooseFinish(page, "white");
    await addSelected(page);
    await expectBadge(page, 1);
    await page.goto("/policies/cookies");
    await page.evaluate(
      ([key]) =>
        window.localStorage.setItem(
          key,
          JSON.stringify({ v: 1, pin: "560001" }),
        ),
      [PIN_KEY],
    );
    await expectBadge(page, 1);
    const clear = page.getByRole("button", {
      name: "Clear saved preview data",
    });
    await hydrated(clear);
    await clear.click();
    await expect(page.locator("#clear-status")).toHaveText(
      "Saved storefront selections cleared.",
    );
    await expectBadge(page, 0);
    expect(await storedItems(page)).toBeNull();
    expect(
      await page.evaluate(() => ({
        pin: window.localStorage.getItem("aalishaanDeliveryCheck"),
        finishes: Object.keys(window.sessionStorage).filter((key) =>
          key.startsWith("aalishaan-frame-"),
        ),
      })),
    ).toEqual({ pin: null, finishes: [] });
    await page.goto("/cart");
    await expect(page.locator("#cart-page-items h2")).toHaveText(
      "Your bag is empty.",
    );
    await page.goto(`/artworks/${LANTERN.slug}`);
    await hydrated(frameRadio(page, "black"));
    await expect(frameRadio(page, "black")).toBeChecked();
  });
});

// ---------------------------------------------------------------------------------------------------------------

test.describe("S1.5 — the bag across reloads, history and tabs", () => {
  test("reload and Back / Forward keep the bag, the chosen finish and the PIN", async ({
    page,
  }) => {
    const path = `/artworks/${LANTERN.slug}`;
    await page.goto(path);
    await chooseFinish(page, "white");
    const pin = page.locator("#delivery-pincode");
    await expect(pin).toBeEnabled();
    await pin.fill("560001");
    await page
      .locator("#delivery-check")
      .getByRole("button", { name: "Check" })
      .click();
    await expect(page.locator("#delivery-result")).toHaveText(
      PIN_PENDING("560001"),
    );
    await addSelected(page);
    await expectBadge(page, 1);
    // To the cart through the drawer's link (a client navigation).
    const drawer = await openCart(page);
    await expect(drawerRows(page)).toHaveCount(1);
    await drawer.getByRole("link", { name: "Edit your bag" }).click();
    await expect(page).toHaveURL(/\/cart$/);
    await expect(drawer).not.toHaveAttribute("data-open", "true");
    const row = cartRow(page, code(LANTERN, "white"));
    await expect(row).toBeVisible();
    await expect(row.locator('select[data-control="frame"]')).toHaveValue(
      "white",
    );
    await expect(page.locator("#cart-pincode")).toHaveValue("560001");
    await expect(page.locator("#cart-delivery-result")).toHaveText(
      PIN_PENDING("560001"),
    );
    const expectLanternState = async () => {
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(h1(page, LANTERN.title)).toBeVisible();
      await expect(frameRadio(page, "white")).toBeChecked();
      await expect(page.locator("#product-price")).toHaveText("₹19,000");
      await expect(page.locator("#stage-image")).toHaveAttribute(
        "src",
        /\/frame-white-1200\.webp$/,
      );
      await expect(page.locator("#delivery-pincode")).toHaveValue("560001");
      await expect(page.locator("#delivery-result")).toHaveText(
        PIN_PENDING("560001"),
      );
      await expectBadge(page, 1);
    };
    await page.goBack();
    await expectLanternState();
    await page.reload();
    await expectLanternState();
    await page.goForward();
    await expect(page).toHaveURL(/\/cart$/);
    await expect(cartRow(page, code(LANTERN, "white"))).toBeVisible();
    await expect(subtotal(page)).toHaveText("₹19,000");
    expect(await storedItems(page)).toEqual([
      { code: code(LANTERN, "white"), quantity: 1 },
    ]);
  });

  test("another tab's add and edit reach this tab's badge and cart (the storage event), without writing back", async ({
    page,
    context,
  }) => {
    await plantBag(
      page,
      { v: 1, items: [{ code: code(WARM_WALL, "white"), quantity: 1 }] },
      "/cart",
    );
    await expect(cartRows(page)).toHaveCount(1);
    const other = await context.newPage();
    await other.goto(`/artworks/${LANTERN.slug}`);
    await addSelected(other);
    await expectBadge(other, 2);
    await expectBadge(page, 2);
    await expect(cartRows(page)).toHaveCount(2);
    await expect(cartRow(page, code(LANTERN, "black"))).toBeVisible();
    await expect(subtotal(page)).toHaveText("₹40,000");
    await other.locator("#main-cta").click();
    await expect(
      cartRow(page, code(LANTERN, "black")).locator(
        'input[data-control="quantity"]',
      ),
    ).toHaveValue("2");
    await expectBadge(page, 3);
    // Both tabs agree on one stored bag; neither rewrote the other's change.
    const expected = [
      { code: code(WARM_WALL, "white"), quantity: 1 },
      { code: code(LANTERN, "black"), quantity: 2 },
    ];
    expect(await storedItems(page)).toEqual(expected);
    expect(await storedItems(other)).toEqual(expected);
    await other.close();
  });

  test("a clear in another tab empties this cart and cancels its pending check: the late answer brings nothing back", async ({
    page,
    context,
  }) => {
    await plantBag(
      page,
      { v: 1, items: [{ code: code(WARM_WALL, "white"), quantity: 1 }] },
      "/cart",
    );
    await expect(subtotal(page)).toHaveText("₹19,000");
    // From now on this tab's checks answer late.
    await page.route("**/api/bag", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      await route.continue().catch(() => {});
    });
    await setCartQuantity(page, code(WARM_WALL, "white"), "2");
    await expect(subtotal(page)).toHaveText("Checking…");
    const other = await context.newPage();
    await other.goto("/policies/cookies");
    const clear = other.getByRole("button", {
      name: "Clear saved preview data",
    });
    await hydrated(clear);
    await clear.click();
    await expect(other.locator("#clear-status")).toHaveText(
      "Saved storefront selections cleared.",
    );
    await expect(page.locator("#cart-page-items h2")).toHaveText(
      "Your bag is empty.",
    );
    await expectBadge(page, 0);
    await page.waitForTimeout(3500);
    await expect(cartRows(page)).toHaveCount(0);
    await expect(page.locator("#cart-page-items h2")).toHaveText(
      "Your bag is empty.",
    );
    expect(await storedItems(page)).toBeNull();
    await other.close();
  });
});

// ---------------------------------------------------------------------------------------------------------------

test.describe("S1.5 — honest storage and validation states", () => {
  test("a corrupt stored bag is cleared with the notice; the cart stays usable", async ({
    page,
  }) => {
    const { pageErrors } = watchErrors(page);
    await plantBag(page, "{not json", "/cart");
    await expect(page.locator("#bag-status")).toHaveText(
      "Your saved bag could not be read in this browser, so it was cleared. Choose your artworks again.",
    );
    await expect(page.locator("#cart-page-items h2")).toHaveText(
      "Your bag is empty.",
    );
    expect(await storedItems(page)).toBeNull();
    await expectBadge(page, 0);
    // Another version is corrupt too; the prototype's legacy array is read and rewritten in the v1 shape.
    await plantBag(page, { v: 2, items: [] }, "/cart");
    await expect(page.locator("#bag-status")).toContainText(
      "Your saved bag could not be read in this browser",
    );
    await plantBag(
      page,
      [
        {
          slug: WARM_WALL.slug,
          frame: "black",
          quantity: 2,
          title: "x",
          image: "x",
        },
      ],
      "/cart",
    );
    await expect(cartRow(page, code(WARM_WALL, "black"))).toBeVisible();
    expect(await storedItems(page)).toEqual([
      { code: code(WARM_WALL, "black"), quantity: 2 },
    ]);
    await expect(page.locator("#bag-status")).toHaveText("");
    expect(pageErrors).toEqual([]);
  });

  test("blocked storage keeps the bag on this page only and says so, on the artwork page, the drawer and the cart", async ({
    page,
  }) => {
    const { pageErrors } = watchErrors(page);
    // Before any of the page's scripts: reading window.localStorage throws, as when the browser blocks site data.
    await page.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        get() {
          throw new DOMException("The operation is insecure.", "SecurityError");
        },
      });
    });
    await page.goto(`/artworks/${LANTERN.slug}`);
    await addSelected(page);
    await expect(page.locator("#pd-notice")).toHaveText(MEMORY_ONLY);
    await expectBadge(page, 1);
    const drawer = await openCart(page);
    await expect(drawerRows(page)).toHaveCount(1);
    await expect(drawer.locator('[role="status"]').first()).toContainText(
      MEMORY_ONLY,
    );
    // A client navigation keeps the page's memory bag.
    await drawer.getByRole("link", { name: "Edit your bag" }).click();
    await expect(page).toHaveURL(/\/cart$/);
    await expect(cartRow(page, code(LANTERN, "black"))).toBeVisible();
    await expect(page.locator("#bag-status")).toContainText(MEMORY_ONLY);
    await expect(subtotal(page)).toHaveText("₹21,000");
    expect(pageErrors).toEqual([]);
  });

  test("a full storage (writes refused) also keeps the bag in memory with the disclosure", async ({
    page,
  }) => {
    const { pageErrors } = watchErrors(page);
    await page.addInitScript((key) => {
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (name: string, value: string) {
        if (this === window.localStorage && name === key)
          throw new DOMException(
            "The quota has been exceeded.",
            "QuotaExceededError",
          );
        return setItem.call(this, name, value);
      };
    }, BAG_KEY);
    await page.goto(`/artworks/${LANTERN.slug}`);
    await addSelected(page);
    await expect(page.locator("#pd-notice")).toHaveText(MEMORY_ONLY);
    await expectBadge(page, 1);
    expect(await storedItems(page)).toBeNull();
    expect(pageErrors).toEqual([]);
  });

  test("prices, totals and titles planted in storage never reach the request or the subtotal", async ({
    page,
  }) => {
    const planted = {
      v: 1,
      items: [
        {
          code: code(WARM_WALL, "white"),
          quantity: 2,
          price: 1,
          unit_price_paise: "100",
          line_total_paise: "200",
          title: "A free artwork",
        },
      ],
      subtotal_paise: "1",
    };
    await page.goto("/about");
    await page.evaluate(
      ([key, text]) => window.localStorage.setItem(key, text),
      [BAG_KEY, JSON.stringify(planted)],
    );
    const request = page.waitForRequest(
      (r) => r.url().endsWith("/api/bag") && r.method() === "POST",
    );
    await page.goto("/cart");
    // The request carries variant codes and quantities only (src/lib/bag/validate.ts).
    expect((await request).postDataJSON()).toEqual({
      items: [{ variant_code: code(WARM_WALL, "white"), quantity: 2 }],
    });
    await expect(subtotal(page)).toHaveText("₹38,000");
    const row = cartRow(page, code(WARM_WALL, "white"));
    await expect(row.locator("h3")).toHaveText(WARM_WALL.title);
    await expect(row.locator(".bag-price")).toHaveText(
      "₹38,000 (₹19,000 each)",
    );
    await expect(page.locator("#cart-page-items")).not.toContainText(
      "A free artwork",
    );
  });

  test("an unknown variant planted in storage is removed with the notice; the rest is priced", async ({
    page,
  }) => {
    await plantBag(
      page,
      {
        v: 1,
        items: [
          { code: "a-retired-artwork:white", quantity: 4 },
          { code: code(WARM_WALL, "white"), quantity: 1 },
        ],
      },
      "/cart",
    );
    await expect(page.locator("#bag-status")).toHaveText(
      "An artwork in your bag is no longer available and was removed.",
    );
    await expect(cartRows(page)).toHaveCount(1);
    await expect(cartRow(page, code(WARM_WALL, "white"))).toBeVisible();
    await expect(subtotal(page)).toHaveText("₹19,000");
    await expectBadge(page, 1);
    expect(await storedItems(page)).toEqual([
      { code: code(WARM_WALL, "white"), quantity: 1 },
    ]);
  });

  test("a catalogue outage is no empty bag: the rows stay stored, nothing claims a total, Try again recovers", async ({
    page,
  }) => {
    await page.route("**/api/bag", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        headers: { "cache-control": "no-store" },
        body: JSON.stringify({ status: "unavailable" }),
      }),
    );
    await plantBag(
      page,
      { v: 1, items: [{ code: code(WARM_WALL, "white"), quantity: 2 }] },
      "/cart",
    );
    await expect(page.locator("#bag-status")).toHaveText(
      "Your bag could not be checked right now. Your selections are kept.",
    );
    await expect(subtotal(page)).toHaveText("Not available right now");
    await expect(page.getByText("Your bag is empty.")).toHaveCount(0);
    await expectBadge(page, 2);
    expect(await storedItems(page)).toEqual([
      { code: code(WARM_WALL, "white"), quantity: 2 },
    ]);
    // An answer that does not answer this bag (a forged subtotal, no rows) is a failure too, never a total.
    await page.unroute("**/api/bag");
    await page.route("**/api/bag", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "ok",
          items: [],
          removed: [],
          subtotal_paise: "1",
          item_count: 0,
        }),
      }),
    );
    // The cart's own button: the closed drawer is `inert` (out of the accessibility tree), but Playwright's role
    // engine still counts the button inside it.
    const retry = page
      .locator("#main")
      .getByRole("button", { name: "Try again" });
    await hydrated(retry);
    // By keyboard: the button unmounts as the check restarts, and the focus goes to the status line, never <body>.
    await retry.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#bag-status")).toBeFocused();
    await expect(page.locator("#bag-status")).toHaveText(
      "Your bag could not be checked right now. Your selections are kept.",
    );
    await expect(subtotal(page)).toHaveText("Not available right now");
    expect(await storedItems(page)).toEqual([
      { code: code(WARM_WALL, "white"), quantity: 2 },
    ]);
    // The real endpoint again.
    await page.unroute("**/api/bag");
    await retry.click();
    await expect(cartRow(page, code(WARM_WALL, "white"))).toBeVisible();
    await expect(subtotal(page)).toHaveText("₹38,000");
    await expect(page.locator("#bag-status")).toHaveText("");
    await expect(retry).toHaveCount(0);
  });

  test("a late answer for a superseded bag never brings back a removed row or an older quantity", async ({
    page,
  }) => {
    await plantBag(
      page,
      {
        v: 1,
        items: [
          { code: code(WARM_WALL, "white"), quantity: 1 },
          { code: code(LANTERN, "black"), quantity: 1 },
        ],
      },
      "/cart",
    );
    await expect(subtotal(page)).toHaveText("₹40,000");
    await page.route("**/api/bag", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.continue().catch(() => {});
    });
    await setCartQuantity(page, code(WARM_WALL, "white"), "3");
    await expect(subtotal(page)).toHaveText("Checking…");
    await cartRow(page, code(LANTERN, "black"))
      .getByRole("button", { name: `Remove ${LANTERN.title}` })
      .click();
    await expect(cartRows(page)).toHaveCount(1);
    await expect(subtotal(page)).toHaveText("₹57,000", { timeout: 15_000 });
    // Long after every answer has had time to arrive: still the newest bag.
    await page.waitForTimeout(3000);
    await expect(cartRows(page)).toHaveCount(1);
    await expect(
      cartRow(page, code(WARM_WALL, "white")).locator(
        'input[data-control="quantity"]',
      ),
    ).toHaveValue("3");
    await expect(subtotal(page)).toHaveText("₹57,000");
    expect(await storedItems(page)).toEqual([
      { code: code(WARM_WALL, "white"), quantity: 3 },
    ]);
  });
});

// ---------------------------------------------------------------------------------------------------------------

test.describe("S1.5 — delivery PIN and checkout (no estimate, no checkout yet)", () => {
  test("the PIN form checks syntax only and shows the estimate pending, never a date; the PIN never leaves the browser", async ({
    page,
  }) => {
    const sent: string[] = [];
    page.on("request", (request) =>
      sent.push(`${request.url()} ${request.postData() ?? ""}`),
    );
    await page.goto(`/artworks/${LANTERN.slug}`);
    const form = page.locator("#delivery-check");
    const field = page.locator("#delivery-pincode");
    const result = page.locator("#delivery-result");
    await expect(field).toBeEnabled();
    const check = form.getByRole("button", { name: "Check" });
    for (const entry of ["012345", "56000", ""]) {
      await field.fill(entry);
      await check.click();
      await expect(result, entry).toHaveText(PIN_INVALID);
      await expect(field, entry).toHaveAttribute("aria-invalid", "true");
      await expect(field, entry).toBeFocused();
      expect(
        await page.evaluate((key) => window.localStorage.getItem(key), PIN_KEY),
        entry,
      ).toBeNull();
    }
    // Typing keeps digits only, at most six.
    await field.fill("");
    await field.pressSequentially("56a00-01 9");
    await expect(field).toHaveValue("560001");
    await expect(result).toHaveText("");
    await check.click();
    await expect(result).toHaveText(PIN_PENDING("560001"));
    await expect(field).not.toHaveAttribute("aria-invalid");
    await expect(form).not.toContainText(
      /\b\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)|\b\d+\s*(–|-|to)\s*\d+\s*(business\s+)?days\b|serviceable|we deliver to/i,
    );
    expect(
      await page.evaluate((key) => window.localStorage.getItem(key), PIN_KEY),
    ).toBe(JSON.stringify({ v: 1, pin: "560001" }));
    // The cart's form shows the saved PIN; changing it forgets the saved one.
    await page.goto("/cart");
    await expect(page.locator("#cart-pincode")).toHaveValue("560001");
    await expect(page.locator("#cart-delivery-result")).toHaveText(
      PIN_PENDING("560001"),
    );
    await page.locator("#cart-pincode").fill("56000");
    await expect(page.locator("#cart-delivery-result")).toHaveText("");
    expect(
      await page.evaluate((key) => window.localStorage.getItem(key), PIN_KEY),
    ).toBeNull();
    expect(
      sent.filter((line) => line.includes("560001")),
      "no request carries the PIN",
    ).toEqual([]);
  });

  test("a prototype delivery check left in storage gives back its PIN only, as pending", async ({
    page,
  }) => {
    await page.goto("/about");
    await page.evaluate(
      (key) =>
        window.localStorage.setItem(
          key,
          JSON.stringify({
            status: "available",
            pincode: "110001",
            zone: "North",
            estimate: "3-5 business days",
          }),
        ),
      PIN_KEY,
    );
    await page.goto("/cart");
    await expect(page.locator("#cart-pincode")).toHaveValue("110001");
    await expect(page.locator("#cart-delivery-result")).toHaveText(
      PIN_PENDING("110001"),
    );
    await expect(page.locator("body")).not.toContainText("3-5 business days");
    expect(
      await page.evaluate((key) => window.localStorage.getItem(key), PIN_KEY),
    ).toBe(JSON.stringify({ v: 1, pin: "110001" }));
  });

  test("the checkout control is disabled with its line in the drawer and on the cart; nothing links to a checkout", async ({
    page,
  }) => {
    await page.goto(`/artworks/${LANTERN.slug}`);
    await addSelected(page);
    // The prototype's "Continue to Checkout" link after an add is not rendered (H.2 "Checkout handoff").
    await expect(page.getByRole("link", { name: /checkout/i })).toHaveCount(0);
    await expect(page.locator('a[href*="checkout"]')).toHaveCount(0);
    const drawer = await openCart(page);
    await expect(drawerRows(page)).toHaveCount(1);
    const drawerButton = drawer.getByRole("button", {
      name: "Continue to checkout",
      exact: true,
    });
    await expect(drawerButton).toBeDisabled();
    await expect(drawerButton).toHaveAccessibleDescription(
      "Checkout is not yet available.",
    );
    await expect(drawer.locator('a[href*="checkout"]')).toHaveCount(0);
    await drawer.getByRole("link", { name: "Edit your bag" }).click();
    await expect(page).toHaveURL(/\/cart$/);
    const control = page.locator("#checkout-link");
    await expect(control).toBeVisible();
    const cartButton = control.getByRole("button", {
      name: "Continue to checkout →",
    });
    await expect(cartButton).toBeDisabled();
    await expect(cartButton).toHaveAccessibleDescription(
      "Checkout is not yet available.",
    );
    await cartButton.dispatchEvent("click");
    await page.waitForTimeout(300);
    await expect(page).toHaveURL(/\/cart$/);
    await expect(page.locator('a[href*="checkout"]')).toHaveCount(0);
    // The pending terms, never an invented charge.
    await expect(page.locator(".flow-totals")).toContainText("Delivery charge");
    await expect(page.locator(".flow-totals")).toContainText("To be confirmed");
  });
});

// ---------------------------------------------------------------------------------------------------------------

test.describe("S1.5 — keyboard, dialogs and the phone bar", () => {
  test("the cart drawer with rows: focus on Close, Tab wraps both ways, Escape closes and returns focus; a row's title opens its page", async ({
    page,
  }) => {
    await plantBag(
      page,
      { v: 1, items: [{ code: code(WARM_WALL, "white"), quantity: 1 }] },
      `/artworks/${LANTERN.slug}`,
    );
    const trigger = cartTrigger(page);
    const drawer = await openCart(page);
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(".site > .page")).toHaveAttribute("inert", "");
    const close = drawer.getByRole("button", { name: "Close cart" });
    await expect(close).toBeFocused();
    await expect(drawerRows(page)).toHaveCount(1);
    const last = drawer.getByRole("link", {
      name: "Saved artworks",
      exact: true,
    });
    await page.keyboard.press("Shift+Tab");
    await expect(last).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      drawer.getByRole("link", { name: WARM_WALL.title }),
    ).toBeFocused();
    // The disabled checkout button is skipped; every focus stays in the drawer.
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press("Tab");
      expect(
        await drawer.evaluate((el) => el.contains(document.activeElement)),
        `Tab ${i + 1}`,
      ).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(drawer).not.toHaveAttribute("data-open", "true");
    await expect(page.locator(".site > .page")).not.toHaveAttribute("inert");
    await expect(trigger).toBeFocused();
    await openCart(page);
    await drawer.getByRole("link", { name: WARM_WALL.title }).click();
    await expect(page).toHaveURL(new RegExp(`/artworks/${WARM_WALL.slug}$`));
    await expect(h1(page, WARM_WALL.title)).toBeVisible();
    await expect(drawer).not.toHaveAttribute("data-open", "true");
  });

  test("the lightbox: opened from the stage with the keyboard, focus on Close, arrows wrap, Escape returns focus; a single image has no arrows", async ({
    page,
    target,
  }) => {
    await page.goto(`/artworks/${LANTERN.slug}`);
    const stage = page.locator("#stage-button");
    await hydrated(stage);
    const views = await page.locator('.pd-thumbs [role="tab"]').count();
    expect(views).toBeGreaterThanOrEqual(3);
    await stage.focus();
    await page.keyboard.press("Enter");
    const dialog = page.locator("dialog#lightbox");
    await expect(dialog).toHaveAttribute("open", "");
    await expect(dialog).toHaveAccessibleName("Enlarged image");
    // The overlay buttons keep their own type inside main.pd (r3.css:7 undone): 1.5rem arrows, a 600 'Close'.
    await expect(page.locator("#lightbox-next")).toHaveCSS("font-size", "24px");
    await expect(page.locator("#lightbox-close")).toHaveCSS(
      "font-weight",
      "600",
    );
    await expect(page.locator("#lightbox-close")).toBeFocused();
    const caption = page.locator("#lightbox-caption");
    await expect(caption).toHaveText(`Framed in Black · 1 of ${views}`);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe(
      "hidden",
    );
    const image = page.locator("#lightbox-image");
    await expect(image).toHaveAttribute(
      "src",
      new RegExp(
        `${BUCKET_PATH}artworks/${LANTERN.slug}/frame-black-1200\\.webp$`,
      ),
    );
    if (target.mode === "preview") {
      expect(
        ((await image.getAttribute("src")) ?? "").startsWith(
          `${testStorageOrigin()}${BUCKET_PATH}`,
        ),
        "the enlarged image comes from the TEST project's public bucket",
      ).toBe(true);
      await expect
        .poll(() =>
          image.evaluate(
            (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
          ),
        )
        .toBe(true);
    }
    await page.keyboard.press("ArrowRight");
    await expect(caption).toHaveText(`Black frame, close up · 2 of ${views}`);
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect(caption).toHaveText(new RegExp(` · ${views} of ${views}$`));
    await page.getByRole("button", { name: "Next image" }).click();
    await expect(caption).toHaveText(`Framed in Black · 1 of ${views}`);
    // The native modal dialog (the prototype's `showModal()`, r3.js:100) makes the page behind inert: from Close, Tab
    // reaches the two arrows; past the last control focus may leave for the browser itself, never for the page.
    await page.locator("#lightbox-close").focus();
    for (const id of ["lightbox-prev", "lightbox-next"]) {
      await page.keyboard.press("Tab");
      await expect(page.locator(`#${id}`)).toBeFocused();
    }
    for (let i = 0; i < 3; i += 1) {
      await page.keyboard.press("Tab");
      expect(
        await dialog.evaluate(
          (el) =>
            el.contains(document.activeElement) ||
            document.activeElement === null ||
            document.activeElement === document.body,
        ),
      ).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).not.toHaveAttribute("open", "");
    await expect(stage).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
    // One picture: the A2 comparison, no arrows; Close returns the focus to its button.
    const compare = page.getByRole("button", {
      name: "Compare A2 portrait and landscape",
    });
    await compare.click();
    await expect(dialog).toHaveAttribute("open", "");
    await expect(caption).toHaveText("A2 size comparison · 1 of 1");
    await expect(page.locator("#lightbox-prev")).toBeHidden();
    await expect(page.locator("#lightbox-next")).toBeHidden();
    await page.locator("#lightbox-close").click();
    await expect(dialog).not.toHaveAttribute("open", "");
    await expect(compare).toBeFocused();
    // A moodboard tile opens all six at its own picture.
    const tiles = page.locator("#wall-grid button");
    await expect(tiles).toHaveCount(6);
    await tiles.nth(2).click();
    await expect(caption).toHaveText(/ · 3 of 6$/);
    await page.keyboard.press("Escape");
    await expect(tiles.nth(2)).toBeFocused();
  });

  test("the thumbnails are tabs with a roving tabindex: arrows wrap, Home and End, and the stage follows the view and the finish", async ({
    page,
  }) => {
    await page.goto(`/artworks/${LANTERN.slug}`);
    const tabs = page.locator('.pd-thumbs[role="tablist"] [role="tab"]');
    await hydrated(tabs.first());
    await expect(page.locator(".pd-thumbs")).toHaveAccessibleName(
      "Artwork views",
    );
    const count = await tabs.count();
    expect(count).toBeGreaterThanOrEqual(3);
    const expectSelected = async (index: number) => {
      for (let i = 0; i < count; i += 1) {
        await expect(tabs.nth(i)).toHaveAttribute(
          "aria-selected",
          String(i === index),
        );
        await expect(tabs.nth(i)).toHaveAttribute(
          "tabindex",
          i === index ? "0" : "-1",
        );
      }
      await expect(tabs.nth(index)).toBeFocused();
    };
    await tabs.first().focus();
    await expectSelected(0);
    await page.keyboard.press("ArrowRight");
    await expectSelected(1);
    const stageImage = page.locator("#stage-image");
    await expect(stageImage).toHaveAttribute(
      "src",
      /\/close-black-1200\.webp$/,
    );
    await page.keyboard.press("End");
    await expectSelected(count - 1);
    await page.keyboard.press("ArrowRight");
    await expectSelected(0);
    await expect(stageImage).toHaveAttribute(
      "src",
      /\/frame-black-1200\.webp$/,
    );
    await page.keyboard.press("ArrowLeft");
    await expectSelected(count - 1);
    await page.keyboard.press("Home");
    await expectSelected(0);
    // Tab leaves the tablist: one stop for all the views.
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(
        () => document.activeElement?.getAttribute("role") ?? null,
      ),
    ).not.toBe("tab");
    // A click selects a view; a finish change keeps the view and changes its picture.
    await page.locator('.pd-thumbs [data-view="closeup"]').click();
    await expect(stageImage).toHaveAttribute(
      "src",
      /\/close-black-1200\.webp$/,
    );
    await chooseFinish(page, "white");
    await expect(stageImage).toHaveAttribute(
      "src",
      /\/close-white-1200\.webp$/,
    );
    await page.locator('.pd-thumbs [data-view="paper"]').click();
    await expect(stageImage).toHaveAttribute(
      "src",
      new RegExp(`/artworks/${LANTERN.slug}/paper-1200\\.webp$`),
    );
  });

  test("the phone purchase bar: shown at 900 px and below once Add to cart scrolls away, hidden by the footer and by an open drawer or dialog", async ({
    page,
  }) => {
    await page.goto(`/artworks/${LANTERN.slug}`);
    const bar = page.locator("#pd-sticky");
    // A CSS selector: while the bar is hidden its button is not in the accessibility tree.
    await hydrated(bar.locator("button[data-add]"));
    await expect(bar).toHaveAttribute("data-visible", "false");
    await expect(bar).toBeHidden();
    // Just below the main Add to cart.
    await page.evaluate(() => {
      const cta = document.getElementById("main-cta")!;
      window.scrollTo({
        top: window.scrollY + cta.getBoundingClientRect().bottom + 80,
        behavior: "instant",
      });
    });
    const phone = (page.viewportSize()?.width ?? 0) <= 900;
    if (!phone) {
      // Desktop: never shown.
      await page.waitForTimeout(300);
      await expect(bar).toHaveAttribute("data-visible", "false");
      await expect(bar).toBeHidden();
      return;
    }
    await expect(bar).toHaveAttribute("data-visible", "true");
    await expect(bar).toBeVisible();
    await expect(bar.locator("strong")).toHaveText(LANTERN.title);
    await expect(bar.locator("small")).toHaveText("A2 · Black · ₹21,000");
    // Its button adds the selected variant.
    await bar.getByRole("button", { name: "Add to cart" }).click();
    await expect
      .poll(() => storedItems(page))
      .toEqual([{ code: code(LANTERN, "black"), quantity: 1 }]);
    await expect(page.locator("#pd-notice")).toHaveText(
      `Added to cart · ${LANTERN.title} · Black frame`,
    );
    // Hidden under an open drawer, back when it closes.
    const drawer = await openCart(page);
    await expect(bar).toBeHidden();
    await page.keyboard.press("Escape");
    await expect(drawer).not.toHaveAttribute("data-open", "true");
    await expect(bar).toBeVisible();
    // Hidden under an open dialog.
    const tile = page.locator("#wall-grid button").first();
    await tile.click();
    await expect(page.locator("dialog#lightbox")).toHaveAttribute("open", "");
    await expect(bar).toBeHidden();
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog#lightbox")).not.toHaveAttribute(
      "open",
      "",
    );
    // Above the main Add to cart again, or at the footer: hidden.
    await page.evaluate(() =>
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: "instant",
      }),
    );
    await expect(bar).toHaveAttribute("data-visible", "false");
    await expect(bar).toBeHidden();
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await expect(bar).toHaveAttribute("data-visible", "false");
  });

  test("with reduced motion the page's transitions and smooth scrolling are off", async ({
    page,
  }) => {
    const motion = () =>
      page.evaluate(() => ({
        stage: getComputedStyle(document.querySelector("#stage-image")!)
          .transitionDuration,
        scroll: getComputedStyle(document.documentElement).scrollBehavior,
      }));
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(`/artworks/${LANTERN.slug}`);
    expect(await motion()).toEqual({ stage: "0.4s", scroll: "smooth" });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    expect(await motion()).toEqual({ stage: "0s", scroll: "auto" });
  });

  test("a heart saved on an artwork page's related card is in Shop's Saved view", async ({
    page,
  }) => {
    await page.goto(`/artworks/${LANTERN.slug}`);
    const card = page.locator(".pd-related article.art-card").first();
    const slug = (await card.getAttribute("data-product")) ?? "";
    const related = artwork(slug);
    const heart = card.getByRole("button", {
      name: `Save ${related.title} to wishlist`,
    });
    await hydrated(heart);
    await heart.scrollIntoViewIfNeeded();
    await heart.click();
    await expect(
      card.getByRole("button", {
        name: `Remove ${related.title} from wishlist`,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.goto("/shop?saved=1");
    await expect(page.locator("[data-catalogue-label]")).toHaveText(
      "Saved artworks",
    );
    await expect(
      page.locator(".catalogue-grid > article.art-card:visible"),
    ).toHaveCount(1);
    await expect(
      page.locator(".catalogue-grid > article.art-card:visible"),
    ).toHaveAttribute("data-product", slug);
  });
});

// ---------------------------------------------------------------------------------------------------------------

test.describe("S1.5 — without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("an artwork page is readable: every section, the seven FAQs and the line that names what needs JavaScript", async ({
    page,
  }) => {
    const response = await page.goto(`/artworks/${LANTERN.slug}`);
    expect(response?.status()).toBe(200);
    await expect(h1(page, LANTERN.title)).toBeVisible();
    await expect(page.locator("#product-price")).toHaveText("₹21,000");
    for (const heading of [
      "Size guide",
      "The artwork, the frame and the paper.",
      "What you’ll receive",
      "The artwork’s story",
      "FAQs",
      "More from this collection.",
    ])
      await expect(
        page.getByRole("heading", { level: 2, name: heading, exact: true }),
      ).toBeVisible();
    await expect(page.locator(".pd-faq details")).toHaveCount(7);
    await expect(page.locator(".pd-noscript")).toHaveText(
      "Frame switching, image enlargement and the cart need JavaScript. All artwork details are shown above.",
    );
    await expect(page.locator("#delivery-pincode")).toBeDisabled();
    await expect(page.locator(".pd-related .wishlist")).toHaveCount(3);
    await expect(page.locator(".wishlist:visible")).toHaveCount(0);
  });

  test("the cart says the bag needs JavaScript; its PIN field and checkout control are disabled", async ({
    page,
  }) => {
    const response = await page.goto("/cart");
    expect(response?.status()).toBe(200);
    await expect(h1(page, "Your bag")).toBeVisible();
    // CSS locators: Playwright's text and role engines skip <noscript> content, which a browser without JavaScript
    // renders.
    const line = page.locator("main noscript p");
    await expect(line).toBeVisible();
    await expect(line).toHaveText(
      "Your bag needs JavaScript. You can still browse the artworks.",
    );
    await expect(line.locator("a")).toHaveText("browse the artworks");
    await expect(line.locator("a")).toHaveAttribute("href", "/shop");
    await expect(page.locator("#cart-page-items article")).toHaveCount(0);
    await expect(page.getByText("Your bag is empty.")).toHaveCount(0);
    await expect(page.locator("#cart-pincode")).toBeDisabled();
    await expect(
      page.locator("#checkout-link").getByRole("button", {
        name: "Continue to checkout →",
      }),
    ).toBeDisabled();
  });
});
