import { exactRequest } from "./harness/bypass";
import { expect, test } from "./harness/fixtures";

/**
 * The deployment smoke (S0.2, rewritten at S1.3 for the storefront): the deployed candidate serves Home
 * through the application (not Vercel's login), with no runtime or console error and no horizontal overflow;
 * the six headers, noindex and read-only health hold on every response; the retired routes stay gone; and
 * the CSP's img-src names the project's Storage origin and nothing else remote (D-48). Desktop and mobile-390
 * projects both run it. It performs no write. Direct HTTP checks go through Node `fetch`
 * (tests/e2e/harness/bypass.ts), never through Playwright's request context with the secret.
 */

const SIX_HEADERS = [
  "content-security-policy",
  "strict-transport-security",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
] as const;

test.describe("smoke — the deployed storefront", () => {
  test("renders Home through the app with no errors and no overflow", async ({
    page,
    target,
  }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));

    const response = await page.goto("/", { waitUntil: "load" });
    expect(response, "navigation response").not.toBeNull();
    expect(
      new URL(page.url()).origin,
      "stayed on the validated origin (the app, not the Vercel login)",
    ).toBe(target.origin);
    expect(response?.status()).toBe(200);

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Bring beauty into everyday life.",
      }),
    ).toBeVisible();
    await expect(page).toHaveTitle(
      "Aalishaan Studio | Museum-Grade Giclée Wall Art",
    );
    // Closed to sales (D-03): no price-bearing purchase control; the hearts and drawers are the only buttons
    // besides the carousel dots, and no form on Home accepts input (NS-02 newsletter is disabled).
    await expect(page.locator("form input:not([disabled])")).toHaveCount(0);
    await expect(
      page.locator('button[type="submit"]:not([disabled])'),
    ).toHaveCount(0);

    // The Home images come from the public bucket on the project's Storage origin (D-48) and load.
    const hero = page.locator("img.hero-scene__room");
    await expect(hero).toHaveAttribute(
      "src",
      /\.supabase\.co\/storage\/v1\/object\/public\/catalogue-public\/site\//,
    );
    expect(
      await hero.evaluate(
        (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
      ),
      "the hero room image decoded",
    ).toBe(true);

    const width = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(width.scroll, "no horizontal overflow").toBeLessThanOrEqual(
      width.client,
    );

    // The browser's automatic /favicon.ico probe answers 404 by design until the brand icon lands (S3.2).
    expect(consoleErrors.filter((text) => !/favicon\.ico/.test(text))).toEqual(
      [],
    );
    expect(pageErrors).toEqual([]);
  });

  test("every response carries the six security headers and noindex; img-src names the Storage origin only", async ({
    target,
  }) => {
    const expected: Array<[string, number[]]> = [
      ["/", [200]],
      ["/s1-3-smoke-missing-path", [404]],
      ["/api/health", [200, 503]],
    ];
    for (const [path, statuses] of expected) {
      const response = await exactRequest(target, path);
      expect(statuses, `${path} status`).toContain(response.status);
      for (const name of SIX_HEADERS)
        expect(response.headers[name], `${path} ${name}`).toBeTruthy();
      expect(response.headers["x-robots-tag"], `${path} x-robots-tag`).toMatch(
        /noindex/,
      );
      expect(response.headers["strict-transport-security"]).toMatch(
        /max-age=63072000/,
      );
      expect(response.headers["x-frame-options"]).toBe("DENY");
      const imgSrc = /img-src ([^;]+)/.exec(
        response.headers["content-security-policy"] ?? "",
      )?.[1];
      expect(imgSrc, `${path} img-src`).toMatch(
        /^'self' data: https:\/\/[a-z]{20}\.supabase\.co$/,
      );
    }
  });

  test("GET /api/health is read-only, uncached and status-only", async ({
    target,
  }) => {
    const response = await exactRequest(target, "/api/health");
    expect(response.headers["cache-control"]).toBe("no-store");
    const body = JSON.parse(response.body) as Record<string, unknown>;
    expect(typeof body.status).toBe("string");
    // Never rows, refs, keys or upstream bodies.
    expect(response.body).not.toMatch(
      /supabase\.co|sb_secret|sb_publishable|eyJ|check_key/,
    );
    if (target.mode === "preview") {
      expect(
        response.status,
        "Preview health must be ok: TEST wired and 0000_init applied",
      ).toBe(200);
      expect(body).toEqual({ status: "ok" });
    } else {
      expect([200, 503]).toContain(response.status);
      expect(["ok", "unavailable"]).toContain(body.status);
    }
    const post = await exactRequest(target, "/api/health", { method: "POST" });
    expect(post.status, "GET-only route").toBe(405);
  });

  test("the S0.1 diagnostic route and the S0.2 proof route stay gone", async ({
    target,
  }) => {
    for (const path of ["/api/sentry-test", "/api/setup-proof"]) {
      for (const method of ["POST", "GET"]) {
        const response = await exactRequest(target, path, {
          method,
          headers: { "content-type": "application/json" },
          body:
            method === "POST" ? JSON.stringify({ action: "read" }) : undefined,
        });
        expect(response.status, `${method} ${path}`).toBe(404);
      }
    }
  });
});
