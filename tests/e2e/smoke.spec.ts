import { exactRequest } from "./harness/bypass";
import { expect, test } from "./harness/fixtures";

/**
 * The S0.2 smoke (docs/ROADMAP.md S0.2 acceptance): the deployed candidate serves the NS-17 holding page
 * through the application (not Vercel's login), with no runtime or console error and no horizontal
 * overflow, the seven headers and read-only health on every response, the S0.1 diagnostic route gone and
 * the proof route denied — on the desktop and mobile-390 projects. It performs no write: the bounded
 * Preview write is the separate `pnpm test:preview-proof` command. Direct HTTP checks go through Node
 * `fetch` (tests/e2e/harness/bypass.ts), never through Playwright's request context with the secret.
 */

const HOLDING_LINE =
  "This website is being built and is not taking orders yet.";
const SIX_HEADERS = [
  "content-security-policy",
  "strict-transport-security",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
] as const;

test.describe("S0.2 smoke — the deployed holding page", () => {
  test("renders the NS-17 holding page through the app with no errors and no overflow", async ({
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
      page.getByRole("heading", { level: 1, name: "Aalishaan Studio" }),
    ).toBeVisible();
    await expect(page.getByText(HOLDING_LINE, { exact: true })).toBeVisible();
    // The closed holding state (D-03): no link, form, control, price or payment surface.
    await expect(
      page.locator("a[href], form, input, button, select, textarea"),
    ).toHaveCount(0);

    const width = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(width.scroll, "no horizontal overflow").toBeLessThanOrEqual(
      width.client,
    );

    // The browser's automatic /favicon.ico probe answers 404 by design until the brand assets arrive (S1.3).
    expect(consoleErrors.filter((text) => !/favicon\.ico/.test(text))).toEqual(
      [],
    );
    expect(pageErrors).toEqual([]);
  });

  test("every response carries the six security headers and noindex", async ({
    target,
  }) => {
    const expected: Array<[string, number[]]> = [
      ["/", [200]],
      ["/s0-2-smoke-missing-path", [404]],
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

  test("the S0.1 diagnostic route is gone", async ({ target }) => {
    for (const method of ["POST", "GET"]) {
      const response = await exactRequest(target, "/api/sentry-test", {
        method,
      });
      expect(response.status, `${method} /api/sentry-test`).toBe(404);
    }
  });

  test("POST /api/setup-proof denies an unauthenticated call before any I/O", async ({
    target,
  }) => {
    const response = await exactRequest(target, "/api/setup-proof", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "read", marker: "s0-2-proof:smokecheck" }),
    });
    expect(response.status).toBe(404);
    expect(JSON.parse(response.body)).toEqual({ status: "not_found" });
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  test("without the bypass the deployment stays protected (local mode: the bare origin answers directly)", async ({
    playwright,
    target,
  }) => {
    // A fresh request context: no cookie, no header, no secret anywhere near it.
    const bare = await playwright.request.newContext();
    try {
      const response = await bare.get(`${target.origin}/`, { maxRedirects: 0 });
      if (target.mode === "local") {
        // No deployment protection exists locally; the check still runs and never skips.
        expect(response.status(), "local origin without protection").toBe(200);
        return;
      }
      const status = response.status();
      expect([302, 303, 307, 401], "protected without the bypass").toContain(
        status,
      );
      if (status === 401) {
        // Vercel's challenge for a non-browser client: no redirect, and the app is not reached.
        expect(response.headers()["location"]).toBeUndefined();
        expect(await response.text()).not.toContain(HOLDING_LINE);
      } else {
        const location = response.headers()["location"] ?? "";
        expect(
          new URL(location, target.origin).origin,
          "redirects to Vercel's login",
        ).toBe("https://vercel.com");
      }
    } finally {
      await bare.dispose();
    }
  });
});
