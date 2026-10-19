import { expect, test } from "./harness/fixtures";

/**
 * The S1.3 public shell and pages on the deployed candidate (docs/ROADMAP.md S1.3 exit gate), on the desktop
 * and mobile-390 projects: every route of the group answers with its page, no console error and every
 * rendered image loaded; the four aliases redirect with 301; the designed 404 answers an unknown path, and its
 * links lead off it; the
 * policy tabs; the three disabled forms accept nothing and send nothing; the header arrangement and the
 * drawers (focus, inert, Escape, focus return); the About search and the FAQ filter as the prototype counts;
 * the Track hint; the Home handoff's mode; and the wishlist heart writes only the browser's own storage. No
 * server write happens anywhere in this file; the only state touched is this browser context's localStorage.
 * Every test runs on both projects (the required-projects reporter counts a skip as a failure).
 */

const ROUTES: Array<[string, string]> = [
  ["/", "Bring beauty into everyday life."],
  ["/about", "About Aalishaan Studio"],
  ["/about/studio", "Bring beauty into everyday life."],
  ["/help", "Frequently asked questions"],
  ["/contact", "Contact & Support"],
  ["/track", "Track your artwork"],
  ["/policies/cancellation", "Cancellation Policy"],
  ["/policies/cookies", "Cookie Policy"],
  ["/policies/privacy", "Privacy Policy"],
  ["/policies/refunds", "Refund Policy"],
  ["/policies/returns", "Returns & Replacements Policy"],
  ["/policies/shipping", "Shipping & Delivery Policy"],
  ["/policies/terms", "Terms & Conditions"],
];

type Page = import("@playwright/test").Page;

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
 * Scroll through the page so lazy images load, then report every rendered image that did not decode. The scroll
 * is instant: the storefront scrolls smoothly, and a scripted smooth scroll restarted every few milliseconds
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
        Array.from(document.images)
          .filter((img) => img.getClientRects().length > 0 && !img.complete)
          .map((img) => img.decode().catch(() => null)),
      ),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]),
  );
  return page.evaluate(() =>
    Array.from(document.images)
      .filter((img) => img.getClientRects().length > 0)
      .filter((img) => !(img.complete && img.naturalWidth > 0))
      .map((img) => img.currentSrc || img.src),
  );
}

test.describe("S1.3 — routes, redirects and the 404", () => {
  for (const [path, heading] of ROUTES) {
    test(`${path} renders its page with no error, every image loaded and no overflow`, async ({
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
      const response = await page.goto(path, { waitUntil: "load" });
      expect(response?.status()).toBe(200);
      await expect(
        page.getByRole("heading", { level: 1, name: heading }),
      ).toBeVisible();
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("#main")).toHaveCount(1);
      await expect(page.locator("header.site-header")).toBeVisible();
      await expect(page.locator("footer.site-footer")).toBeVisible();
      await noOverflow(page);
      // On the Preview every Storage object exists (the TEST bucket holds the site and catalogue images); a
      // local build without the public URL renders the app's own paths, which answer 404 by design.
      if (target.mode === "preview") {
        expect(await brokenImages(page), "images that did not load").toEqual(
          [],
        );
        expect(consoleErrors, "console errors").toEqual([]);
      }
      expect(pageErrors).toEqual([]);
    });
  }

  test("the four aliases answer 301 to their canonical routes, query preserved", async ({
    page,
    target,
  }) => {
    const aliases: Array<[string, string]> = [
      ["/home", "/"],
      ["/about-us", "/about"],
      ["/track-order", "/track"],
      ["/order/demo", "/track"],
      ["/home?ref=x", "/?ref=x"],
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
  });

  test("an unknown path, an unknown policy slug and an Admin miss answer the designed 404 with status 404", async ({
    page,
  }) => {
    for (const path of [
      "/s1-3-no-such-page",
      "/policies/no-such-policy",
      "/admin/s1-3-no-such-page",
    ]) {
      const response = await page.goto(path, { waitUntil: "load" });
      expect(response?.status(), path).toBe(404);
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "A little off the beaten path.",
        }),
      ).toBeVisible();
      await expect(page).toHaveTitle("404 — Page not found | Aalishaan Studio");
      await expect(
        page.getByRole("link", { name: "Return home" }),
      ).toBeVisible();
    }
  });

  test("the 404's links lead off it: Return home shows Home, a header link shows its page, a footer link opens at the top", async ({
    page,
  }) => {
    // The global 404 brings its own document, so a client navigation away from it has nowhere to draw the next
    // page unless the 404 loads it as a document (src/components/shell/reload-on-path-change.tsx), and a reload
    // would bring back the 404's scroll position. Each click waits for hydration, so it goes through the router
    // rather than the browser's own link handling.
    const hydrated = (text: string) =>
      page.waitForFunction(
        (name) =>
          Array.from(document.querySelectorAll("a")).some(
            (link) =>
              link.textContent?.trim() === name &&
              Object.keys(link).some((key) => key.startsWith("__reactProps")),
          ),
        text,
      );
    await page.goto("/s1-3-no-such-page");
    await hydrated("Return home");
    await page.getByRole("link", { name: "Return home" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Bring beauty into everyday life.",
      }),
    ).toBeVisible();

    await page.goto("/s1-3-no-such-page");
    await hydrated("About us");
    const phone = (page.viewportSize()?.width ?? 0) <= 900;
    if (phone) await page.getByRole("button", { name: "Open menu" }).click();
    await page
      .locator(phone ? "#mobile-nav" : "nav.primary-nav")
      .getByRole("link", { name: "About us" })
      .click();
    await expect(page).toHaveURL(/\/about$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "About Aalishaan Studio" }),
    ).toBeVisible();

    // From the bottom of the 404, a footer link: the destination opens at its top, its heading below the header.
    // A reload restores a scroll position as the document loads, so the position is read once the destination's
    // document has loaded (an event registered before the click: the page in hand is loaded already).
    await page.goto("/s1-3-no-such-page");
    await hydrated("Refunds");
    await page.evaluate(() =>
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: "instant",
      }),
    );
    const loaded = page.waitForEvent("load");
    await page.locator('footer a[href="/policies/refunds"]:visible').click();
    await loaded;
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    await expect(page).toHaveURL(/\/policies\/refunds$/);
    const heading = page.getByRole("heading", {
      level: 1,
      name: "Refund Policy",
    });
    await expect(heading).toBeInViewport();
    const headingTop = (await heading.boundingBox())?.y ?? -1;
    const headerBottom = await page
      .locator("header.site-header")
      .evaluate((header) => header.getBoundingClientRect().bottom);
    expect(
      headingTop,
      "the heading sits below the header",
    ).toBeGreaterThanOrEqual(headerBottom);
  });

  test("the policy tabs: two groups in the prototype's order, the current page marked, none on Shipping", async ({
    page,
  }) => {
    const groups: Array<[string, Array<[string, string]>]> = [
      [
        "Cancellations, returns & refunds",
        [
          ["cancellation", "Cancellation Policy"],
          ["returns", "Returns & Replacements Policy"],
          ["refunds", "Refund Policy"],
        ],
      ],
      [
        "Privacy & terms",
        [
          ["privacy", "Privacy Policy"],
          ["terms", "Terms & Conditions"],
          ["cookies", "Cookie Policy"],
        ],
      ],
    ];
    for (const [label, tabs] of groups) {
      for (const [slug] of tabs) {
        await page.goto(`/policies/${slug}`);
        const nav = page.locator("nav.policy-tabs");
        await expect(nav, slug).toHaveAttribute("aria-label", label);
        const links = nav.getByRole("link");
        await expect(links).toHaveText(tabs.map(([, name]) => name));
        for (const [i, [other]] of tabs.entries()) {
          await expect(links.nth(i)).toHaveAttribute(
            "href",
            `/policies/${other}`,
          );
          if (other === slug)
            await expect(links.nth(i)).toHaveAttribute("aria-current", "page");
          else await expect(links.nth(i)).not.toHaveAttribute("aria-current");
        }
      }
    }
    await page.goto("/policies/shipping");
    await expect(page.locator("nav.policy-tabs")).toHaveCount(0);
  });
});

test.describe("S1.3 — the disabled forms accept nothing (NS-01–NS-03; D-PRE-20)", () => {
  test("Contact: every control disabled, the NS-01 notice shown, nothing is sent", async ({
    page,
    target,
  }) => {
    await page.goto("/contact");
    const form = page.locator("#contact-form");
    await expect(form.locator("input, select, textarea, button")).toHaveCount(
      5,
    );
    for (const control of await form
      .locator("input, select, textarea, button")
      .all())
      await expect(control).toBeDisabled();
    await expect(
      form.getByText("This form is not connected yet.", { exact: false }),
    ).toBeVisible();
    await expect(
      form.getByRole("button", { name: "Send enquiry" }),
    ).toBeDisabled();
    // Requests to the app itself: every document request and anything that is not a GET (a monitoring
    // envelope to its own ingest origin is not the form's).
    const sent: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).origin !== target.origin) return;
      if (request.isNavigationRequest() || request.method() !== "GET")
        sent.push(`${request.method()} ${request.url()}`);
    });
    // A click on the disabled button does nothing at all.
    await form
      .getByRole("button", { name: "Send enquiry" })
      .dispatchEvent("click");
    await page.waitForTimeout(300);
    expect(sent, "a click on the disabled button sends nothing").toEqual([]);
    // A scripted submission of this form (no action, no handler) can only reload the page by GET, and every
    // control is disabled, so nothing of the form travels with it. The navigation starts after the call returns:
    // wait for it and read it, rather than reading the list before it exists, and wait for the document it loads
    // (the page in hand is loaded already, so only an event registered first can see the next one).
    const submitted = page.waitForRequest(
      (request) =>
        request.isNavigationRequest() &&
        new URL(request.url()).pathname === "/contact",
    );
    const reloaded = page.waitForEvent("load");
    await form.evaluate((el: HTMLFormElement) => el.requestSubmit?.());
    const submission = await submitted;
    expect(submission.method(), "the scripted submission").toBe("GET");
    expect(
      new URL(submission.url()).search.replace(/^\?/, ""),
      "nothing of the form travels with it",
    ).toBe("");
    expect(
      (await submission.response())?.status(),
      "the submission's answer: the Contact page again",
    ).toBe(200);
    await reloaded;
    expect(sent.length, "the submission was observed").toBeGreaterThan(0);
    for (const line of sent) {
      const [method, url] = line.split(" ");
      expect(method, line).toBe("GET");
      expect(new URL(url!).search.replace(/^\?/, ""), line).toBe("");
    }
    await expect(page.locator("#contact-status")).toHaveText("");
  });

  test("Newsletter (every page): input and button disabled, the NS-02 note shown", async ({
    page,
  }) => {
    await page.goto("/help");
    const form = page.locator("form.newsletter-form");
    await expect(form.locator("input[name=subscriber]")).toBeDisabled();
    await expect(
      form.getByRole("button", { name: "Newsletter signup" }),
    ).toBeDisabled();
    await expect(
      form.getByText(
        "Newsletter signup is not open yet. No subscription is created.",
      ),
    ).toBeVisible();
  });

  test("Track: the tabs swap the field and the hint, the input and submit stay disabled, the NS-03 notice shown twice", async ({
    page,
  }) => {
    await page.goto("/track");
    const form = page.locator("#track-form");
    await expect(form.locator("input[name=reference]")).toBeDisabled();
    await expect(
      form.getByRole("button", { name: "Track artwork →" }),
    ).toBeDisabled();
    await expect(
      page.getByText(
        "Order tracking is not available yet. Nothing is looked up from this page.",
      ),
    ).toHaveCount(2);
    await expect(page.locator("#track-label")).toHaveText("Order reference");
    // The page loads with the static first hint; any tab choice writes that tab's own hint (commerce-r9.js).
    await expect(page.locator("#track-hint")).toHaveText(
      "Find your order ID in your confirmation email. Your AWB is available once a courier is assigned.",
    );
    await page.getByRole("tab", { name: "AWB" }).click();
    await expect(page.locator("#track-label")).toHaveText(
      "Airway Bill number (AWB)",
    );
    await expect(form.locator("input[name=reference]")).toHaveAttribute(
      "placeholder",
      "Airway Bill number (AWB)",
    );
    await page.keyboard.press("ArrowRight");
    await expect(
      page.getByRole("tab", { name: "Mobile number" }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(form.locator("input[name=reference]")).toHaveAttribute(
      "placeholder",
      "10-digit mobile number",
    );
    await page.getByRole("tab", { name: "Order ID" }).click();
    await expect(page.locator("#track-hint")).toHaveText(
      "Find your order ID in your confirmation email.",
    );
    await expect(form.locator("input[name=reference]")).toBeDisabled();
    await expect(page.locator("body")).not.toContainText("AS-PREVIEW");
  });
});

test.describe("S1.3 — the shell, the search, the filter, the handoff and the heart", () => {
  test("the header arrangement; on the phone layout the menu drawer opens, inerts the page, traps focus, closes on Escape and returns focus", async ({
    page,
  }) => {
    await page.goto("/");
    const trigger = page.getByRole("button", { name: "Open menu" });
    const phone = (page.viewportSize()?.width ?? 0) <= 900;
    if (!phone) {
      // Desktop (D-PRE-04): the plain links centred and the "Track order" call to action in the header.
      await expect(trigger).toBeHidden();
      await expect(page.locator("nav.primary-nav")).toBeVisible();
      await expect(
        page.locator("header.site-header a.nav-cta", {
          hasText: "Track order",
        }),
      ).toBeVisible();
      return;
    }
    // Phone: menu left, Track inside the menu.
    await expect(page.locator("nav.primary-nav")).toBeHidden();
    await trigger.click();
    const drawer = page.locator("#mobile-nav");
    await expect(drawer).toHaveAttribute("data-open", "true");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    // Every other child of the shell is inert: the skip link and the page wrapper that holds #main.
    await expect(page.locator(".site > .page")).toHaveAttribute("inert", "");
    await expect(page.locator(".site > .skip-link")).toHaveAttribute(
      "inert",
      "",
    );
    await expect(
      drawer.getByRole("button", { name: "Close menu" }),
    ).toBeFocused();
    await expect(
      drawer.getByRole("link", { name: "Track order" }),
    ).toBeVisible();
    await page.keyboard.press("Shift+Tab");
    await expect(
      drawer.getByRole("link", { name: "Track order" }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(drawer).not.toHaveAttribute("data-open", "true");
    await expect(page.locator(".site > .page")).not.toHaveAttribute("inert");
    await expect(trigger).toBeFocused();
  });

  test("the cart drawer shows the approved empty state, closes from the backdrop and on any navigation", async ({
    page,
  }) => {
    await page.goto("/about");
    await page.getByRole("button", { name: /Open cart/ }).click();
    const drawer = page.locator("#cart-drawer");
    await expect(drawer).toHaveAttribute("data-open", "true");
    await expect(drawer.getByText("Your cart is quiet.")).toBeVisible();
    await page
      .locator(".backdrop")
      .click({ position: { x: 10, y: 10 }, force: true });
    await expect(drawer).not.toHaveAttribute("data-open", "true");
    // A client-side navigation (the hub's FAQ card), the drawer opened there, then the browser's Back: the
    // shell outlives the navigation, and the drawer is closed on the page that shows, which is not inert.
    await page.locator('a.help-category[href="/help"]').click();
    await expect(page).toHaveURL(/\/help$/);
    await page.getByRole("button", { name: /Open cart/ }).click();
    await expect(drawer).toHaveAttribute("data-open", "true");
    await page.goBack();
    await expect(page).toHaveURL(/\/about$/);
    await expect(page.locator(".help-category").first()).toBeVisible();
    await expect(drawer).not.toHaveAttribute("data-open", "true");
    await expect(page.locator(".site > .page")).not.toHaveAttribute("inert");
  });

  test("the About search reads ?q= from the help-search form of another page and filters the index", async ({
    page,
  }) => {
    await page.goto("/help");
    await page.locator("form.help-search input").fill("refund");
    await page.locator("form.help-search button").click();
    await expect(page).toHaveURL(/\/about\?q=refund$/);
    await expect(page.locator("#help-result-status")).toHaveText(
      /\d+ articles? found/,
    );
    await expect(page.locator("#help-home")).toBeHidden();
    await expect(page.locator("#help-results .help-row").first()).toBeVisible();
    await page.locator("form.help-search input").fill("zzzz-no-match");
    await expect(page.locator("#help-result-status")).toHaveText(
      "0 articles found",
    );
    await expect(page.locator("#help-no-results")).toBeVisible();
    await page.locator("form.help-search input").fill("");
    await expect(page.locator("#help-home")).toBeVisible();
    await expect(page.locator(".help-category")).toHaveCount(6);
  });

  test("the Help filter counts as the prototype: a topic word matches the first question of its topic only", async ({
    page,
  }) => {
    await page.goto("/help");
    await expect(page.locator("#faq-status")).toHaveText("11 answers");
    await expect(page.locator("#questions details:visible")).toHaveCount(11);
    // prototype/shared/pending.js reads each block's text, where the topic heading sits in the first one.
    for (const [word, count] of [
      ["support", 1],
      ["delivery", 2],
      ["size", 1],
    ] as const) {
      await page.locator("#faq-search").fill(word);
      await expect(page.locator("#faq-status"), word).toHaveText(
        `${count} answers`,
      );
      await expect(page.locator("#questions details:visible")).toHaveCount(
        count,
      );
    }
    await page.locator("#faq-search").fill("zzzz-no-match");
    await expect(page.locator("#faq-status")).toHaveText("0 answers");
    await expect(page.locator("#faq-empty")).toBeVisible();
    await page.locator("#faq-reset").click();
    await expect(page.locator("#faq-status")).toHaveText("11 answers");
    await expect(page.locator("#faq-search")).toBeFocused();
    await page.locator("#faq-topic").selectOption("Support");
    await expect(page.locator("#faq-status")).toHaveText("3 answers");
    await expect(page.locator("body")).not.toContainText("cash on delivery");
  });

  test("the Home handoff runs on desktop, the lift on the phone, and neither with reduced motion", async ({
    page,
    target,
  }) => {
    await page.goto("/");
    const opening = page.locator("[data-handoff]").first();
    const phone = (page.viewportSize()?.width ?? 0) <= 900;
    // Enabled once the wall images have decoded and the fonts are ready (the prototype's own conditions); a
    // local build whose images cannot load keeps the static layout.
    if (target.mode === "preview")
      await expect(opening).toHaveAttribute(
        "data-handoff",
        phone ? "mobile" : "on",
        { timeout: 15_000 },
      );
    else
      await expect(opening).toHaveAttribute(
        "data-handoff",
        /^(on|mobile|off)$/,
      );
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.locator("[data-handoff]").first()).toHaveAttribute(
      "data-handoff",
      "off",
    );
  });

  test("the wishlist heart writes the prototype's key in this browser only and announces", async ({
    page,
  }) => {
    await page.goto("/");
    const heart = page.getByRole("button", {
      name: "Save The Ship Between Two Storms to wishlist",
    });
    await heart.scrollIntoViewIfNeeded();
    await heart.click();
    await expect(
      page.getByRole("button", {
        name: "Remove The Ship Between Two Storms from wishlist",
      }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".toast")).toHaveText(
      "Artwork saved. Find your saved artworks in Shop.",
    );
    expect(
      await page.evaluate(() =>
        localStorage.getItem("aalishaan-wishlist-the-ship-between-two-storms"),
      ),
    ).toBe("true");
    await page
      .getByRole("button", {
        name: "Remove The Ship Between Two Storms from wishlist",
      })
      .click();
    await expect(page.locator(".toast")).toHaveText(
      "Artwork removed from your wishlist.",
    );
    await page.goto("/policies/cookies");
    await page
      .getByRole("button", { name: "Clear saved preview data" })
      .click();
    await expect(page.locator("#clear-status")).toHaveText(
      "Saved storefront selections cleared.",
    );
    expect(
      await page.evaluate(() =>
        Object.keys(localStorage).filter((k) =>
          k.startsWith("aalishaan-wishlist-"),
        ),
      ),
    ).toEqual([]);
  });
});
