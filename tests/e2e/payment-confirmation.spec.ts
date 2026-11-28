import { randomBytes } from "node:crypto";

import { fetchExact } from "../../scripts/testing/lib/http.mjs";

import { exactRequest } from "./harness/bypass";
import { expect, test } from "./harness/fixtures";

/**
 * S1.7 — the order page's address and the webhook's door on the deployed candidate (docs/sprint-prompts/
 * S1.7-razorpay-verification.md §E "Required automated/Preview matrix", §H), on the desktop and mobile-390 projects.
 *
 * What this file proves needs no order and no payment, so it writes nothing anywhere:
 *
 * - **An address that is not an order's is the designed 404** — a token of another shape, a path under `/order`
 *   that is not an order page's, and (on the Preview, where the database answers) a well-formed token no order
 *   has: status 404 and the designed page in the HTML the SERVER sent, not only drawn by the browser. A page's
 *   own `notFound()` cannot do that while the global 404 is on (docs/PROJECT-STATUS.md §10 #23 (j)); src/proxy.ts
 *   answers it before the page.
 * - **An order that cannot be read is not a missing order** — a sealed local run has no database: a well-formed
 *   token there is the temporary-error page with status 500, never the 404 and never an order.
 * - **The address is private**: every answer under `/order` carries `Referrer-Policy: no-referrer`, the route's
 *   own noindex and no-store; no title and no metadata carries the token.
 * - **The webhook's door (P6)**: with the sanctioned bypass a delivery reaches THIS deployment's handler — a
 *   signature that is not Razorpay's is refused by the handler itself (`400 invalid_signature`), other methods are
 *   `405`; without the bypass the Preview's protection answers, not the handler. A sealed local run, where no
 *   provider value exists, answers `503 unavailable`. A refused signature proves the door only: that a real Test
 *   Mode payment reaches "confirmed" is the journey recorded in the sprint record (P5).
 *
 * Tokens here are random and never an order's; none is printed. Every test runs on both projects and in both modes
 * (the required-projects reporter counts a skip as a failure).
 */

const NOT_FOUND_HEADING = "A little off the beaten path.";
const NOT_FOUND_TITLE = "404 — Page not found | Aalishaan Studio";
const INTERRUPTION_HEADING = "Let’s try that again.";
const INTERRUPTION_TITLE = "500 — Something went wrong | Aalishaan Studio";
/** The order page's own title (NS-43) — also what an order that cannot be read keeps (its error page is drawn by the
 *  browser's error boundary, under the page's metadata). */
const ORDER_TITLE = "Your order | Aalishaan Studio";
const WEBHOOK_PATH = "/api/webhooks/razorpay";

/** A token of the right shape (32 random bytes as base64url) that no order has. */
const unknownToken = () => randomBytes(32).toString("base64url");

/** Paths under `/order` that can never be an order's page, whatever the database holds. */
const NEVER_AN_ORDER = [
  "/order/not-a-token",
  "/order/1001",
  "/order/AS-1001",
  `/order/${"A".repeat(42)}`,
  `/order/${"A".repeat(44)}`,
  `/order/${"A".repeat(42)}%2B`,
  "/order/a/b",
];

test.describe("S1.7 — an address that is not an order's", () => {
  test("a token of another shape and a path that is not an order page's answer the designed 404, in the server's HTML", async ({
    page,
    target,
  }) => {
    for (const path of NEVER_AN_ORDER) {
      // The HTML the server sent — no script has run on it.
      const raw = await exactRequest(target, path);
      expect(raw.status, path).toBe(404);
      expect(raw.body, path).toMatch(
        /<h1[^>]*>A little off the beaten path\.<\/h1>/,
      );
      expect(raw.body, path).toContain(`<title>${NOT_FOUND_TITLE}</title>`);
      expect(raw.headers["referrer-policy"], path).toBe("no-referrer");
      expect(raw.headers["x-robots-tag"], path).toBe("noindex, nofollow");
      expect(raw.headers["cache-control"] ?? "", path).toContain("no-store");
    }
    // And in the browser: the same page, the same status, its links working.
    const response = await page.goto(NEVER_AN_ORDER[0], { waitUntil: "load" });
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { level: 1, name: NOT_FOUND_HEADING }),
    ).toBeVisible();
    await expect(page).toHaveTitle(NOT_FOUND_TITLE);
    await expect(page.getByRole("link", { name: "Return home" })).toBeVisible();
  });

  test("`/order` itself is no page", async ({ target }) => {
    const raw = await exactRequest(target, "/order");
    expect(raw.status).toBe(404);
    expect(raw.body).toMatch(/<h1[^>]*>A little off the beaten path\.<\/h1>/);
  });

  test("a well-formed token no order has: the designed 404 where the database answers, the temporary error where there is none — never an order", async ({
    page,
    target,
  }) => {
    const token = unknownToken();
    const path = `/order/${token}`;
    const raw = await exactRequest(target, path);
    expect(raw.headers["referrer-policy"]).toBe("no-referrer");
    expect(raw.headers["x-robots-tag"]).toBe("noindex, nofollow");
    expect(raw.headers["cache-control"] ?? "").toContain("no-store");
    // No answer says anything of an order.
    for (const never of [
      "A beautiful choice.",
      "is confirmed",
      "Your order receipt",
    ])
      expect(raw.body, never).not.toContain(never);

    if (target.mode === "preview") {
      // The Preview reads TEST: the token is unknown there, and that is a 404 — in the server's own HTML.
      expect(raw.status).toBe(404);
      expect(raw.body).toMatch(/<h1[^>]*>A little off the beaten path\.<\/h1>/);
      expect(raw.body).toContain(`<title>${NOT_FOUND_TITLE}</title>`);
      const response = await page.goto(path, { waitUntil: "load" });
      expect(response?.status()).toBe(404);
      await expect(
        page.getByRole("heading", { level: 1, name: NOT_FOUND_HEADING }),
      ).toBeVisible();
    } else {
      // A sealed local run has no database: the order cannot be read, and that is NOT a missing order.
      expect(raw.status).toBe(500);
      expect(raw.body).not.toContain(NOT_FOUND_HEADING);
      const response = await page.goto(path, { waitUntil: "load" });
      expect(response?.status()).toBe(500);
      await expect(
        page.getByRole("heading", { level: 1, name: INTERRUPTION_HEADING }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { level: 1, name: NOT_FOUND_HEADING }),
      ).toHaveCount(0);
    }
  });

  test("an address that is not an order's puts its path in no title or metadata, and nothing of it in browser storage", async ({
    page,
    target,
  }) => {
    const token = unknownToken();
    await page.goto(`/order/${token}`, { waitUntil: "load" });
    const title = await page.title();
    expect(title).not.toContain(token);
    // No order exists for a random token: the 404 on the Preview; locally, where nothing can be read, the temporary
    // error — which keeps the order page's own title. A real order's page is the manual P5 journey's (no test can
    // hold an order's link: it is given only after Razorpay's signature).
    expect(
      target.mode === "preview"
        ? [NOT_FOUND_TITLE]
        : [ORDER_TITLE, INTERRUPTION_TITLE],
    ).toContain(title);
    const head = await page.evaluate(() =>
      [...document.head.querySelectorAll("meta, link")]
        .map((node) => node.outerHTML)
        .join("\n"),
    );
    expect(head).not.toContain(token);
    const stored = await page.evaluate(() =>
      JSON.stringify([
        Object.entries(window.localStorage),
        Object.entries(window.sessionStorage),
        document.cookie,
      ]),
    );
    expect(stored).not.toContain(token);
    // The page's own noindex holds whatever the site's becomes.
    if (target.mode === "preview")
      expect(head).toMatch(/<meta name="robots" content="noindex/);
  });

  test("Back from an address that is not an order's returns to the page before it", async ({
    page,
  }) => {
    await page.goto("/track", { waitUntil: "load" });
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    const before = page.url();
    const response = await page.goto("/order/not-a-token", {
      waitUntil: "load",
    });
    expect(response?.status()).toBe(404);
    await page.goBack({ waitUntil: "load" });
    // The traversal may still be committing when goBack resolves under load: wait for the address, never read it once.
    await expect(page).toHaveURL(before);
    await expect(
      page.getByRole("heading", { level: 1, name: NOT_FOUND_HEADING }),
    ).toHaveCount(0);
    await page.goForward({ waitUntil: "load" });
    await expect(page).toHaveURL(/\/order\/not-a-token$/);
    await expect(
      page.getByRole("heading", { level: 1, name: NOT_FOUND_HEADING }),
    ).toBeVisible();
  });
});

test.describe("S1.7 — the webhook's door (P6)", () => {
  const FORGED = "0".repeat(64);
  const BODY = JSON.stringify({
    entity: "event",
    event: "payment.captured",
    payload: {},
  });

  test("a delivery whose signature is not Razorpay's reaches this deployment's handler and is refused by it; nothing else is said", async ({
    target,
  }) => {
    const response = await exactRequest(target, WEBHOOK_PATH, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-razorpay-signature": FORGED,
        "x-razorpay-event-id": `evt_e2e_${randomBytes(6).toString("hex")}`,
      },
      body: BODY,
    });
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["content-type"] ?? "").toContain(
      "application/json",
    );
    if (target.mode === "preview") {
      // The handler's own answer: the request passed the Preview's protection and reached the candidate's code.
      expect(response.status).toBe(400);
      expect(JSON.parse(response.body)).toEqual({
        status: "invalid_signature",
      });
    } else {
      // A sealed local run holds no provider value: the payment gate is closed before anything is read.
      expect(response.status).toBe(503);
      expect(JSON.parse(response.body)).toEqual({ status: "unavailable" });
    }
  });

  test("a delivery with no signature is refused the same way, and no other method is answered", async ({
    target,
  }) => {
    const unsigned = await exactRequest(target, WEBHOOK_PATH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: BODY,
    });
    expect(unsigned.status).toBe(target.mode === "preview" ? 400 : 503);
    expect(JSON.parse(unsigned.body)).toEqual({
      status: target.mode === "preview" ? "invalid_signature" : "unavailable",
    });
    for (const method of ["GET", "PUT", "DELETE"]) {
      const response = await exactRequest(target, WEBHOOK_PATH, { method });
      expect(response.status, method).toBe(405);
      expect(response.headers["allow"], method).toBe("POST");
      expect(response.headers["cache-control"], method).toBe("no-store");
      expect(JSON.parse(response.body), method).toEqual({
        status: "method_not_allowed",
      });
    }
  });

  test("without the sanctioned bypass the Preview's protection answers — not the handler", async ({
    target,
  }) => {
    // The same request, to the same validated origin, with no bypass: what a caller without it gets.
    const response = await fetchExact(
      new URL(WEBHOOK_PATH, target.origin).toString(),
      {
        origin: target.origin,
        bypassSecret: null,
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-razorpay-signature": FORGED,
        },
        body: BODY,
      },
    );
    if (target.mode === "preview") {
      // Vercel's Deployment Protection: its sign-in, never the application's JSON.
      expect([301, 302, 303, 307, 308, 401, 403]).toContain(response.status);
      expect(response.body).not.toContain('"status"');
      expect(response.body).not.toContain("invalid_signature");
    } else {
      // A local run has no protection in front of it: the handler answers, closed.
      expect(response.status).toBe(503);
      expect(JSON.parse(response.body)).toEqual({ status: "unavailable" });
    }
  });
});
