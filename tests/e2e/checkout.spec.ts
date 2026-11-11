import type { Page, Response } from "@playwright/test";

import { expect, test } from "./harness/fixtures";
import type { ResolvedTarget } from "./harness/target";

/**
 * S1.6 — the checkout on the deployed candidate (docs/sprint-prompts/S1.6-checkout-pending-order.md §E "Required
 * automated and Preview cases", §H), on the desktop and mobile-390 projects.
 *
 * Two states, and each test proves the one its target must be in:
 *
 * - **The verified Preview** (`preview` mode): checkout must be OPEN — `SALES_MODE=test` there, the TEST project, a
 *   Razorpay Test Mode key, the open synthetic rule on TEST. A Preview that shows the closed state fails these tests:
 *   it is never accepted as "closed, so nothing to prove". Proved: the frozen form and its test-checkout disclosure;
 *   the two provider scripts loading under the Content-Security-Policy with no violation; field validation and
 *   focus; the bag → checkout → "Edit bag" → Back / Forward round-trip keeping what was typed (in memory only); one
 *   real submission that reaches the server, commits the pending order, creates the Razorpay Test Mode order and
 *   only then opens Razorpay's window; a reload that finds the same order by the attempt key alone and offers the
 *   same payment again — never a new order; nothing personal in browser storage; the bag untouched; and a
 *   submission whose security token was removed in transit refused by the server with no payment window.
 * - **A sealed local run** (`local` mode): the build is made without the checkout's public values, so checkout is
 *   CLOSED, as on Production — the NS-04 panel, no form, no field, no provider script requested, the cart's control
 *   disabled with its approved line. Every request that leaves the loopback server is aborted.
 *
 * Effects on the Preview, per project and run: one synthetic pending order on TEST (an `@example.test` address, the
 * test number 9000000000, `synthetic = true`) with its Razorpay **Test Mode** order — no money, retained by design
 * (docs/database-changes/S1.6-0004-checkout.md → "Fixture lifecycle"); rate-limit counters under `checkout:` and
 * `bag:` that expire by themselves; Turnstile test verifications. No payment is attempted inside Razorpay's window:
 * what a real Test Mode payment, its dismissal and its failure do to the page is the manual evidence of the sprint
 * record, because the window is Razorpay's own frame. What the database holds for the order (every row, the
 * snapshot, the link, the deadline) is tests/integration/checkout.test.ts and the record's read-only checks: this
 * harness has no database access. The rate limit's refusal is proved once, after the suite, by the record's own
 * step — inside the suite it would throttle the other project's order for ten minutes.
 *
 * Every test runs on both projects and in both modes (the required-projects reporter counts a skip as a failure).
 */

const BAG_KEY = "aalishaanProductBag";
const ATTEMPT_KEY = "aalishaanCheckoutAttempt";
const VARIANT = "the-first-warm-wall:white";
const TITLE = "The First Warm Wall";
/** The seeded White price (scripts/testing/seed.mjs: 1,900,000 paise). */
const UNIT = "₹19,000";

const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";
const RAZORPAY_SCRIPT_ORIGIN = "https://checkout.razorpay.com";
const RAZORPAY_FRAME_ORIGIN = "https://api.razorpay.com";

const CLOSED_HEADING = "Orders are not open yet.";
const CLOSED_BODY =
  "Nothing can be ordered or paid for here at the moment. Your bag is kept in this browser.";
const TEST_DISCLOSURE =
  "Test checkout. Payment runs in Razorpay Test Mode: no real payment is taken, and no order is made or shipped.";
const CHECK_DETAILS = "Please check the highlighted details.";
const UNAVAILABLE =
  "Checkout is temporarily unavailable. Nothing was charged. Please try again shortly.";

const FIELDS = [
  ["name", "Full name", "shipping name"],
  ["email", "Email", "shipping email"],
  ["phone", "Mobile number", "shipping tel"],
  ["pin", "PIN code", "shipping postal-code"],
  ["address", "Address", "shipping address-line1"],
  ["address2", "Landmark (optional)", "shipping address-line2"],
  ["city", "City", "shipping address-level2"],
  ["state", "State / Union territory", "shipping address-level1"],
] as const;

type Details = Record<(typeof FIELDS)[number][0], string>;

/** Synthetic details, unique per run and project; never a real person's. */
function details(project: string): Details {
  const run = `${Date.now().toString(36)}-${project.replace(/[^a-z0-9]/gi, "")}`;
  return {
    name: `E2E Checkout ${run}`,
    email: `e2e-checkout-${run}@example.test`,
    phone: "9000000000",
    pin: "400001",
    address: `${run} Test Lane`,
    address2: "",
    city: "Mumbai",
    state: "Maharashtra",
  };
}

const field = (page: Page, name: string) =>
  page.locator(`#checkout-form input[name="${name}"]`);
const payButton = (page: Page) => page.locator("button[data-checkout-next]");
const status = (page: Page) => page.locator("#checkout-status");
const razorpayFrame = (page: Page) =>
  page.locator("iframe.razorpay-checkout-frame");

function parsePolicy(value: string): Map<string, string[]> {
  const parsed = new Map<string, string[]>();
  for (const part of value.split(";")) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) parsed.set(name, sources);
  }
  return parsed;
}

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

/** Writes a stored bag from a page that runs no script, then loads `path` as a new document. */
async function plantBag(page: Page, path: string, quantity = 1): Promise<void> {
  await page.goto("/robots.txt");
  await page.evaluate(([key, text]) => window.localStorage.setItem(key, text), [
    BAG_KEY,
    JSON.stringify({ v: 1, items: [{ code: VARIANT, quantity }] }),
  ] as const);
  await page.goto(path);
}

/**
 * Whether this target's checkout is open. The Preview's must be — a closed Preview fails here, with the reason —
 * and a sealed local run is whatever its build renders (closed, unless the run was built with the checkout values).
 */
async function checkoutIsOpen(
  page: Page,
  target: ResolvedTarget,
): Promise<boolean> {
  const form = page.locator("#checkout-form, #checkout-empty");
  const closed = page.locator("#checkout-closed");
  await expect(form.or(closed).first()).toBeVisible();
  const open = (await closed.count()) === 0;
  if (target.mode === "preview")
    expect(
      open,
      "the Preview's checkout must be open (SALES_MODE=test in the Preview scope, the Razorpay Test Mode key pair, ORDER_TOKEN_SECRET, the Turnstile pair and the Upstash pair) — a closed Preview proves nothing here",
    ).toBe(true);
  return open;
}

/** Fills the eight fields the way a person does. */
async function fill(page: Page, values: Details): Promise<void> {
  for (const [name] of FIELDS) await field(page, name).fill(values[name]);
}

/** The summary shows the checked bag: the row and the test total. */
async function expectBagChecked(page: Page, total = UNIT): Promise<void> {
  await expect(page.locator("#checkout-items article.bag-row")).toHaveCount(1);
  await expect(page.locator("dd[data-test-total]")).toHaveText(total);
}

/** Turnstile has produced a token (its widget writes it into a hidden field of the container). */
async function expectChallengePassed(page: Page): Promise<void> {
  await expect(
    page.locator('#checkout-challenge input[name="cf-turnstile-response"]'),
  ).toHaveValue(/.+/, { timeout: 30_000 });
}

test.beforeEach(async ({ context, target }) => {
  // A sealed local run: nothing the pages ask for leaves the loopback server. The Preview loads everything.
  if (target.mode === "local")
    await context.route(
      (url) => url.origin !== target.origin,
      (route) => route.abort(),
    );
});

test.describe("S1.6 — the checkout page", () => {
  test("/checkout answers in the commerce shell with the security headers, and names provider origins only where it is open", async ({
    page,
    target,
  }) => {
    const providerRequests: string[] = [];
    page.on("request", (request) => {
      const { origin } = new URL(request.url());
      if (
        origin === TURNSTILE_ORIGIN ||
        origin === RAZORPAY_SCRIPT_ORIGIN ||
        origin === RAZORPAY_FRAME_ORIGIN
      )
        providerRequests.push(request.url());
    });
    const response = (await page.goto("/checkout")) as Response;
    expect(response.status()).toBe(200);
    await expect(page).toHaveTitle("Checkout | Aalishaan Studio");
    await expect(
      page.getByRole("heading", { level: 1, name: "Checkout", exact: true }),
    ).toBeVisible();
    // The commerce shell: the shared header and footer, no CTA band.
    await expect(page.locator(".site > .page")).toBeVisible();
    await expect(page.locator("#main")).toHaveCount(1);

    const headers = response.headers();
    expect(headers["x-robots-tag"]).toBe("noindex, nofollow");
    expect(headers["x-frame-options"]).toBe("DENY");
    const policy = parsePolicy(headers["content-security-policy"] ?? "");
    expect(policy.get("frame-ancestors")).toEqual(["'none'"]);
    expect(policy.get("object-src")).toEqual(["'none'"]);
    expect(policy.get("form-action")).toEqual(["'self'"]);
    for (const [name, sources] of policy)
      for (const source of sources)
        expect(source, `${name} ${source}`).not.toContain("*");
    expect(policy.get("script-src")).not.toContain("'unsafe-eval'");

    const open = await checkoutIsOpen(page, target);
    if (open) {
      // Exactly the three provider origins, each on its own directive.
      expect(policy.get("script-src")).toEqual(
        expect.arrayContaining([TURNSTILE_ORIGIN, RAZORPAY_SCRIPT_ORIGIN]),
      );
      expect(policy.get("frame-src")).toEqual([
        TURNSTILE_ORIGIN,
        RAZORPAY_FRAME_ORIGIN,
      ]);
      await expect(page.locator(".checkout-heading")).toContainText(
        TEST_DISCLOSURE,
      );
    } else {
      await expect(page.locator("#checkout-closed h2")).toHaveText(
        CLOSED_HEADING,
      );
      await expect(page.locator("#checkout-closed")).toContainText(CLOSED_BODY);
      await expect(
        page.locator("#checkout-closed").getByRole("link", {
          name: "Explore artworks",
        }),
      ).toHaveAttribute("href", "/shop");
      // No form, no field, no pay button — and no provider script was even asked for.
      // (The shared footer has the newsletter form; the page's own content has none.)
      await expect(page.locator("#main form")).toHaveCount(0);
      await expect(page.locator("#main input")).toHaveCount(0);
      await expect(payButton(page)).toHaveCount(0);
      await expect(page.locator("#main")).not.toContainText(TEST_DISCLOSURE);
      await page.waitForTimeout(500);
      expect(providerRequests).toEqual([]);
    }
    const overflow = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(overflow.scroll, "no horizontal overflow").toBeLessThanOrEqual(
      overflow.client,
    );
  });

  test("open: the frozen form, its eight fields and the order summary with the test total; closed: the cart's control stays disabled with its approved line", async ({
    page,
    target,
  }) => {
    const { pageErrors, consoleErrors } = watchErrors(page);
    await plantBag(page, "/checkout");
    const open = await checkoutIsOpen(page, target);
    if (!open) {
      await page.goto("/cart");
      const control = page.locator("#checkout-link");
      await expect(control).toBeVisible();
      const button = control.getByRole("button", {
        name: "Continue to checkout →",
      });
      await expect(button).toBeDisabled();
      await expect(button).toHaveAccessibleDescription(
        "Checkout is not yet available.",
      );
      await expect(page.locator('a[href*="checkout"]')).toHaveCount(0);
      return;
    }
    await expect(page.locator(".checkout-heading")).toContainText(
      "Guest checkout · Your artwork, made for you.",
    );
    for (const [name, label, autocomplete] of FIELDS) {
      const input = field(page, name);
      await expect(input, label).toBeVisible();
      await expect(input).toHaveAttribute("autocomplete", autocomplete);
      await expect(input).toHaveAttribute("aria-describedby", `error-${name}`);
      await expect(
        page.locator("#checkout-form label", { hasText: label }).first(),
      ).toBeVisible();
    }
    await expect(
      page.locator('#checkout-form input[name="payment"]'),
    ).toHaveCount(4);
    await expect(
      page.locator('#checkout-form input[name="payment"][value="upi"]'),
    ).toBeChecked();
    // The summary: the bag's row, read-only, and the totals — unknown charges stay "To be confirmed".
    await expectBagChecked(page);
    const row = page.locator("#checkout-items article.bag-row");
    await expect(row).toContainText(TITLE);
    await expect(row).toContainText("White frame");
    await expect(row.locator("input, select, button")).toHaveCount(0);
    const totals = page.locator(".flow-totals");
    await expect(totals).toContainText("Artwork subtotal");
    await expect(totals.locator("dd[data-subtotal]")).toHaveText(UNIT);
    await expect(totals).toContainText("Shipping");
    await expect(totals).toContainText("To be confirmed");
    await expect(totals).toContainText("Test total");
    await expect(page.locator(".flow-summary")).toContainText(
      "The test total is the artwork subtotal. Shipping and tax are not included because they are not confirmed yet.",
    );
    // Nothing the prototype simulated, and no unapproved payment line.
    const main = page.locator("#main");
    for (const never of [
      "Use sample details",
      "Place sample order",
      "Design preview",
      "WhatsApp",
      "cash on delivery",
    ])
      await expect(main).not.toContainText(never, { ignoreCase: true });
    await expect(page.locator('a[href*="wa.me"]')).toHaveCount(0);
    // Both provider scripts are on the page and the policy refused nothing.
    await expectChallengePassed(page);
    await expect(payButton(page)).toBeEnabled();
    await expect
      .poll(
        () =>
          page.evaluate(
            () => typeof (window as { Razorpay?: unknown }).Razorpay,
          ),
        { timeout: 20_000 },
      )
      .toBe("function");
    expect(pageErrors).toEqual([]);
    expect(
      consoleErrors.filter((text) => /Content Security Policy/i.test(text)),
    ).toEqual([]);
  });

  test("an empty bag: the empty panel where checkout is open, the closed panel where it is not — never a form", async ({
    page,
    target,
  }) => {
    await page.goto("/checkout");
    const open = await checkoutIsOpen(page, target);
    if (!open) {
      await expect(page.locator("#checkout-closed")).toBeVisible();
      return;
    }
    const empty = page.locator("#checkout-empty");
    await expect(empty).toBeVisible();
    await expect(empty.locator("h2")).toHaveText("Your bag is empty.");
    await expect(
      empty.getByRole("link", { name: "Explore artworks" }),
    ).toHaveAttribute("href", "/shop");
    await expect(page.locator("#checkout-form")).toHaveCount(0);
    await expect(payButton(page)).toHaveCount(0);
  });

  test("refused fields show the frozen page's messages, mark the fields and move the focus; nothing is sent", async ({
    page,
    target,
  }) => {
    await plantBag(page, "/checkout");
    const open = await checkoutIsOpen(page, target);
    if (!open) {
      await expect(page.locator("#checkout-form")).toHaveCount(0);
      return;
    }
    const actionRequests: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && request.headers()["next-action"])
        actionRequests.push(request.url());
    });
    await expectBagChecked(page);
    await expectChallengePassed(page);
    await payButton(page).click();
    await expect(status(page)).toHaveText(CHECK_DETAILS);
    await expect(field(page, "name")).toBeFocused();
    for (const [name] of FIELDS) {
      const error = page.locator(`#error-${name}`);
      if (name === "address2") {
        await expect(error).toHaveText("");
        await expect(field(page, name)).not.toHaveAttribute("aria-invalid");
      } else {
        await expect(error).toHaveText("Please complete this field.");
        await expect(field(page, name)).toHaveAttribute("aria-invalid", "true");
      }
    }
    // Each field names its own rule; typing clears that field's message only.
    await field(page, "name").fill("E2E Validation");
    await expect(page.locator("#error-name")).toHaveText("");
    await field(page, "email").fill("not-an-email");
    await field(page, "phone").fill("12345");
    await field(page, "pin").fill("012345");
    await field(page, "address").fill("1 Test Lane");
    await field(page, "city").fill("Mumbai");
    await field(page, "state").fill("Maharashtra");
    await payButton(page).click();
    await expect(page.locator("#error-email")).toHaveText(
      "Enter a valid email address.",
    );
    await expect(page.locator("#error-phone")).toHaveText(
      "Enter a valid 10-digit Indian mobile number.",
    );
    await expect(page.locator("#error-pin")).toHaveText(
      "Enter a six-digit PIN code.",
    );
    await expect(field(page, "email")).toBeFocused();
    await expect(status(page)).toHaveText(CHECK_DETAILS);
    // The PIN field takes digits only, six at most.
    // Typed key by key, as a person does: fill() inserts the whole text in one step, and the browser's maxlength
    // then cuts the insert before the page's own filter sees it.
    await field(page, "pin").fill("");
    await field(page, "pin").pressSequentially("4000a01999");
    await expect(field(page, "pin")).toHaveValue("400001");
    await expect(razorpayFrame(page)).toBeHidden();
    expect(actionRequests, "no server action was called").toEqual([]);
  });

  test("bag → checkout → Edit bag → Back / Forward keeps what was typed, in memory only, and the summary follows the bag", async ({
    page,
    target,
  }) => {
    await plantBag(page, "/cart");
    const control = page.locator("#checkout-link");
    await expect(control).toBeVisible();
    if (target.mode === "local") {
      // Closed: no path into the checkout from the cart; the address itself shows the closed panel.
      await page.goto("/checkout");
      if (!(await checkoutIsOpen(page, target))) {
        await expect(page.locator("#checkout-closed")).toBeVisible();
        return;
      }
      await page.goto("/cart");
    }
    test.setTimeout(60_000);
    // The control is a link only once the bag's check has answered.
    const link = control.getByRole("link", { name: "Continue to checkout →" });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/checkout");
    await expect(control).not.toContainText("Checkout is not yet available.");
    await link.click();
    await expect(page).toHaveURL(/\/checkout$/);
    await checkoutIsOpen(page, target);
    await expectBagChecked(page);
    await field(page, "name").fill("E2E Round Trip");
    await field(page, "email").fill("e2e-round-trip@example.test");
    await field(page, "city").fill("Pune");
    await page
      .locator('#checkout-form input[name="payment"][value="card"]')
      .check();
    await page
      .locator(".flow-summary")
      .getByRole("link", { name: "Edit bag" })
      .click();
    await expect(page).toHaveURL(/\/cart$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/checkout$/);
    await expect(field(page, "name")).toHaveValue("E2E Round Trip");
    await expect(field(page, "email")).toHaveValue(
      "e2e-round-trip@example.test",
    );
    await expect(field(page, "city")).toHaveValue("Pune");
    await expect(
      page.locator('#checkout-form input[name="payment"][value="card"]'),
    ).toBeChecked();
    await page.goForward();
    await expect(page).toHaveURL(/\/cart$/);
    // A changed bag is checked again and the summary shows the new total.
    const quantity = page
      .locator("#cart-page-items article.bag-row")
      .getByLabel(/Quantity/)
      .first();
    await quantity.fill("2");
    await quantity.press("Tab");
    await expect(page.locator("dd[data-subtotal]")).toHaveText("₹38,000");
    await control.getByRole("link", { name: "Continue to checkout →" }).click();
    await expect(page).toHaveURL(/\/checkout$/);
    await expectBagChecked(page, "₹38,000");
    await expect(field(page, "name")).toHaveValue("E2E Round Trip");
    // What was typed lives in memory only: no browser storage holds it.
    const stored = await page.evaluate(() =>
      JSON.stringify([
        Object.entries(window.localStorage),
        Object.entries(window.sessionStorage),
      ]),
    );
    expect(stored).not.toContain("E2E Round Trip");
    expect(stored).not.toContain("e2e-round-trip@example.test");
    // A new document starts empty.
    await page.reload();
    await checkoutIsOpen(page, target);
    await expect(field(page, "name")).toHaveValue("");
  });

  test("one order: the server answers before Razorpay's window opens; a reload finds the same order by its key and offers the same payment, never a new one", async ({
    page,
    target,
  }, testInfo) => {
    await plantBag(page, "/checkout");
    const open = await checkoutIsOpen(page, target);
    if (target.mode === "local" || !open) {
      // A sealed local run reaches no provider: nothing here is a payment path.
      await expect(razorpayFrame(page)).toBeHidden();
      return;
    }
    // One submission, two reloads with their resume calls and two openings of the provider's window: more than the
    // suite's 30 seconds on a cold Preview function.
    test.setTimeout(120_000);
    const { pageErrors, consoleErrors } = watchErrors(page);
    const values = details(testInfo.project.name);
    await expectBagChecked(page);
    await fill(page, values);
    await expectChallengePassed(page);

    // The order of events, held still: the server action's answer is kept back for a moment, and while it is
    // held the payment window is looked at — it must not be showing. Only then is the answer handed to the page.
    await expect(razorpayFrame(page)).toBeHidden();
    const answers: Array<{ status: number; windowShowing: boolean }> = [];
    await page.route("**/checkout", async (route) => {
      const request = route.request();
      if (request.method() !== "POST" || !request.headers()["next-action"])
        return route.continue();
      const response = await route.fetch();
      answers.push({
        status: response.status(),
        windowShowing: await razorpayFrame(page).isVisible(),
      });
      await route.fulfill({ response });
    });
    await payButton(page).click();
    await expect(razorpayFrame(page)).toBeVisible({ timeout: 45_000 });
    await page.unroute("**/checkout");
    // Exactly one submission was made, the server answered it, and no payment window was showing before it did.
    expect(answers).toEqual([{ status: 200, windowShowing: false }]);

    // The attempt key — and nothing personal — is what the browser keeps; the bag is untouched.
    const stored = await page.evaluate(
      ([bagKey, attemptKey]) => ({
        attempt: window.sessionStorage.getItem(attemptKey),
        bag: window.localStorage.getItem(bagKey),
        all: JSON.stringify([
          Object.entries(window.localStorage),
          Object.entries(window.sessionStorage),
        ]),
        cookies: document.cookie,
      }),
      [BAG_KEY, ATTEMPT_KEY] as const,
    );
    expect(stored.attempt).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.parse(stored.bag ?? "null")).toEqual({
      v: 1,
      items: [{ code: VARIANT, quantity: 1 }],
    });
    for (const secret of [values.name, values.email, values.address])
      expect(stored.all + stored.cookies).not.toContain(secret);
    expect(stored.all).not.toMatch(/order_[A-Za-z0-9]{6,}/);
    expect(new URL(page.url()).search, "no state in the address").toBe("");

    // A reload asks where the attempt stands — by the key alone — and the page offers the same order again.
    await page.reload();
    await checkoutIsOpen(page, target);
    await expect(status(page)).toHaveText(
      /^A payment window is waiting for order AS-\d{4,12}\. If you have already paid, please do not pay again: the payment still has to be confirmed\.$/,
      { timeout: 30_000 },
    );
    const waiting = await status(page).innerText();
    const orderNumber = /AS-\d{4,12}/.exec(waiting)?.[0];
    expect(orderNumber).toBeTruthy();
    // No window opens by itself; the fields are empty (nothing was stored) and cannot be edited.
    await expect(razorpayFrame(page)).toBeHidden();
    await expect(field(page, "name")).toHaveValue("");
    await expect(field(page, "name")).toHaveAttribute("readonly", "");
    await expect(payButton(page)).toHaveText("Continue to payment");
    await expect(page.locator("dd[data-test-total]")).toHaveText(UNIT);
    // The page never says paid, received or confirmed.
    await expect(page.locator("#main")).not.toContainText(
      /successful|payment received|order confirmed|thank you for your order/i,
    );
    // "Continue to payment" re-opens the SAME order: no new submission is made (a resume answered, not a submit).
    const submissions: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && request.headers()["next-action"])
        submissions.push(request.postData() ?? "");
    });
    await payButton(page).click();
    await expect(razorpayFrame(page)).toBeVisible({ timeout: 45_000 });
    expect(submissions, "re-opening sends nothing to the server").toEqual([]);
    expect(
      await page.evaluate(
        (key) => window.sessionStorage.getItem(key),
        ATTEMPT_KEY,
      ),
    ).toBe(stored.attempt);
    // Another reload names the same order.
    await page.reload();
    await expect(status(page)).toContainText(`order ${orderNumber}`, {
      timeout: 30_000,
    });
    expect(pageErrors).toEqual([]);
    expect(
      consoleErrors.filter((text) => /Content Security Policy/i.test(text)),
    ).toEqual([]);
  });

  test("a submission whose security token was removed in transit is refused by the server: no payment window, no order to resume", async ({
    page,
    target,
  }, testInfo) => {
    await plantBag(page, "/checkout");
    const open = await checkoutIsOpen(page, target);
    if (target.mode === "local" || !open) {
      await expect(razorpayFrame(page)).toBeHidden();
      return;
    }
    test.setTimeout(60_000);
    await expectBagChecked(page);
    await fill(page, details(`${testInfo.project.name}-notoken`));
    await expectChallengePassed(page);
    // The page's own check cannot be skipped from the page, so the request is changed on its way to the server.
    let tampered = 0;
    await page.route("**/checkout", async (route) => {
      const request = route.request();
      const body = request.postData();
      if (
        request.method() !== "POST" ||
        !request.headers()["next-action"] ||
        body === null
      )
        return route.continue();
      const parsed: unknown = JSON.parse(body);
      if (
        Array.isArray(parsed) &&
        typeof parsed[0] === "object" &&
        parsed[0] !== null &&
        "turnstile_token" in parsed[0]
      ) {
        tampered += 1;
        (parsed[0] as { turnstile_token: string }).turnstile_token = "";
        return route.continue({ postData: JSON.stringify(parsed) });
      }
      return route.continue();
    });
    await payButton(page).click();
    await expect(status(page)).toHaveText(UNAVAILABLE, { timeout: 30_000 });
    expect(tampered, "the submission was intercepted once").toBe(1);
    await expect(razorpayFrame(page)).toBeHidden();
    await page.unroute("**/checkout");
    // Nothing was created under that key: a reload finds no order waiting.
    await page.reload();
    await checkoutIsOpen(page, target);
    await expectBagChecked(page);
    await expect(status(page)).not.toContainText("A payment window is waiting");
    await expect(payButton(page)).toHaveText("Continue to payment →");
    await expect(field(page, "name")).not.toHaveAttribute("readonly", "");
  });
});

test.describe("S1.6 — without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("the checkout says it needs JavaScript and offers no way to send anything", async ({
    page,
  }) => {
    const response = await page.goto("/checkout");
    expect(response?.status()).toBe(200);
    // CSS locators: Playwright's text and role engines skip <noscript> content.
    const line = page.locator("main noscript p");
    await expect(line).toBeVisible();
    await expect(line).toHaveText(
      "Checkout needs JavaScript. You can still browse the artworks.",
    );
    await expect(line.locator("a")).toHaveAttribute("href", "/shop");
    // Open: the pay button is rendered disabled. Closed: there is none.
    const pay = payButton(page);
    if ((await pay.count()) > 0) await expect(pay).toBeDisabled();
    else await expect(page.locator("#checkout-closed")).toBeVisible();
    await expect(page.locator("#checkout-items article")).toHaveCount(0);
  });
});
