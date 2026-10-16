import { expect, test } from "./harness/fixtures";

/**
 * The S1.3 public shell and pages on the deployed candidate (docs/ROADMAP.md S1.3 exit gate), on the desktop
 * and mobile-390 projects: every route of the group answers with its page, the four aliases redirect with
 * 301, the designed 404 answers an unknown path, the three disabled forms accept nothing and submit nowhere,
 * the drawers behave (focus, inert, Escape, focus return), the About search and the FAQ filter work from
 * the URL and the keyboard, and the wishlist heart writes only the browser's own storage. No server write
 * happens anywhere in this file; the only state touched is this browser context's localStorage.
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

async function noOverflow(page: import("@playwright/test").Page) {
  const width = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(width.scroll, "no horizontal overflow").toBeLessThanOrEqual(
    width.client,
  );
}

test.describe("S1.3 — routes, redirects and the 404", () => {
  for (const [path, heading] of ROUTES) {
    test(`${path} renders its page with no error and no overflow`, async ({
      page,
    }) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      const response = await page.goto(path, { waitUntil: "load" });
      expect(response?.status()).toBe(200);
      await expect(
        page.getByRole("heading", { level: 1, name: heading }),
      ).toBeVisible();
      await expect(page.locator("#main")).toHaveCount(1);
      await expect(page.locator("header.site-header")).toBeVisible();
      await expect(page.locator("footer.site-footer")).toBeVisible();
      await noOverflow(page);
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

  test("an unknown path and an unknown policy slug answer the designed 404 with status 404", async ({
    page,
  }) => {
    for (const path of ["/s1-3-no-such-page", "/policies/no-such-policy"]) {
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
});

test.describe("S1.3 — the disabled forms accept nothing (NS-01–NS-03; D-PRE-20)", () => {
  test("Contact: every control disabled, the NS-01 notice shown, nothing submits", async ({
    page,
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
    const requests: string[] = [];
    page.on("request", (request) => {
      if (request.method() !== "GET")
        requests.push(`${request.method()} ${request.url()}`);
    });
    await form.evaluate((el: HTMLFormElement) => el.requestSubmit?.());
    await page.waitForTimeout(300);
    expect(requests, "no non-GET request left the page").toEqual([]);
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

  test("Track: the tabs swap the field, the input and submit stay disabled, the NS-03 notice shown twice", async ({
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
    await expect(form.locator("input[name=reference]")).toBeDisabled();
    await expect(page.locator("body")).not.toContainText("AS-PREVIEW");
  });
});

test.describe("S1.3 — the shell's drawers, the search, the filter and the heart", () => {
  test("the menu drawer: opens from the trigger, inerts the page, traps focus, closes on Escape and returns focus", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "mobile-390",
      "the menu trigger renders on the phone layout",
    );
    await page.goto("/");
    const trigger = page.getByRole("button", { name: "Open menu" });
    await trigger.click();
    const drawer = page.locator("#mobile-nav");
    await expect(drawer).toHaveAttribute("data-open", "true");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#main")).toHaveAttribute("inert", "");
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
    await expect(page.locator("#main")).not.toHaveAttribute("inert", "");
    await expect(trigger).toBeFocused();
  });

  test("the cart drawer shows the approved empty state and closes from the backdrop", async ({
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

  test("the Help filter: eleven answers, a word narrows them, a topic narrows them, Reset restores", async ({
    page,
  }) => {
    await page.goto("/help");
    await expect(page.locator("#faq-status")).toHaveText("11 answers");
    await expect(page.locator("#questions details:visible")).toHaveCount(11);
    await page.locator("#faq-search").fill("paper");
    await expect(page.locator("#faq-status")).not.toHaveText("11 answers");
    await expect(
      page.locator("#questions details:visible").first(),
    ).toBeVisible();
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
