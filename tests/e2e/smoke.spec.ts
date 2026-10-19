import { exactRequest } from "./harness/bypass";
import { expect, test } from "./harness/fixtures";

/**
 * The deployment smoke (S0.2, rewritten at S1.3 for the storefront): the deployed candidate serves Home
 * through the application (not Vercel's login), with no runtime or console error and no horizontal overflow;
 * the six headers, noindex and read-only health hold on every response; the retired routes stay gone; the
 * deployment stays protected without the bypass; the hero image and the CSP's img-src name the TEST project's
 * Storage origin and nothing else remote (D-48, P1); and the Admin downloads none of the storefront's fonts or
 * stylesheets, while a public page fetches each font once. Desktop and mobile-390
 * projects both run it. It performs no write. Direct HTTP checks go through Node `fetch`
 * (tests/e2e/harness/bypass.ts), never through Playwright's request context with the secret. In local mode
 * (a build with or without the public Storage URL, nothing behind it) the image checks read what the build
 * renders instead of requiring the images to load.
 */

const SIX_HEADERS = [
  "content-security-policy",
  "strict-transport-security",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
] as const;

const HOME_HEADING = "Bring beauty into everyday life.";

/**
 * The TEST project's Storage origin. A Preview carries TEST's public values (P1, P12), so the image origin it
 * renders and allows is TEST's own — never another project's. The ref is the name the owner's local env file
 * holds for the TEST tools (preview mode loads that file); it identifies the project and is no secret.
 */
function testStorageOrigin(): string {
  const ref = process.env.SUPABASE_TEST_PROJECT_REF ?? "";
  expect(ref, "SUPABASE_TEST_PROJECT_REF is a project ref").toMatch(
    /^[a-z]{20}$/,
  );
  return `https://${ref}.supabase.co`;
}

test.describe("smoke — the deployed storefront", () => {
  test("renders Home through the app with no errors and no overflow", async ({
    page,
    target,
  }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      // The browser's automatic /favicon.ico probe answers 404 by design until the brand icon lands (S3.2).
      // Chromium's text for a failed load carries no URL, so the filter reads the message's location.
      if (/\/favicon\.ico$/.test(message.location().url)) return;
      consoleErrors.push(`${message.text()} (${message.location().url})`);
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
      page.getByRole("heading", { level: 1, name: HOME_HEADING }),
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
    const src = (await hero.getAttribute("src")) ?? "";
    if (target.mode === "preview") {
      expect(
        src.startsWith(
          `${testStorageOrigin()}/storage/v1/object/public/catalogue-public/site/`,
        ),
        "the hero comes from the TEST project's public bucket",
      ).toBe(true);
      expect(
        await hero.evaluate(
          (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
        ),
        "the hero room image decoded",
      ).toBe(true);
    } else {
      // A local build renders the Storage origin when it holds the public URL, the app's own path otherwise.
      expect(src).toMatch(
        /^(https:\/\/[a-z]{20}\.supabase\.co)?\/storage\/v1\/object\/public\/catalogue-public\/site\//,
      );
    }

    const width = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(width.scroll, "no horizontal overflow").toBeLessThanOrEqual(
      width.client,
    );

    if (target.mode === "preview") expect(consoleErrors).toEqual([]);
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
      // Preview: exactly the TEST project's Storage origin. Local: an origin only when the build holds the URL.
      if (target.mode === "preview")
        expect(imgSrc, `${path} img-src`).toBe(
          `'self' data: ${testStorageOrigin()}`,
        );
      else
        expect(imgSrc, `${path} img-src`).toMatch(
          /^'self' data:( https:\/\/[a-z]{20}\.supabase\.co)?$/,
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
        // A removed route answers with the framework's 404, never the route's old JSON shape.
        expect(response.body).not.toContain('"status":"not_found"');
      }
    }
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
        expect(await response.text()).not.toContain(HOME_HEADING);
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

  test("the Admin downloads no storefront font or stylesheet", async ({
    page,
  }) => {
    // What the browser fetches, not only what the HTML says: a dynamic page sends its preloads in the Link
    // response header (S1.3 — a root not-found once took the storefront's fonts and sheets to every route).
    const fonts: string[] = [];
    const sheets: string[] = [];
    page.on("request", (request) => {
      if (request.resourceType() === "font")
        fonts.push(new URL(request.url()).pathname);
      if (request.resourceType() === "stylesheet") sheets.push(request.url());
    });
    const response = await page.goto("/admin/login", {
      waitUntil: "networkidle",
    });
    expect(response?.status(), "/admin/login").toBe(200);
    expect(
      response?.headers()["link"] ?? "",
      "no font preload in the Link header",
    ).not.toMatch(/as="?font/);
    expect(fonts, "no font file fetched").toEqual([]);
    expect(sheets.length, "the Admin's own stylesheet").toBeGreaterThan(0);
    const storefront = await page.evaluate(async (urls) => {
      const hits: string[] = [];
      for (const url of urls)
        if ((await (await fetch(url)).text()).includes(":where(.site)"))
          hits.push(url);
      return hits;
    }, sheets);
    expect(storefront, "no storefront stylesheet fetched").toEqual([]);
  });

  test("a public page fetches each storefront font once: the preloaded copy", async ({
    page,
  }) => {
    // The global 404 declares the same files under names of its own; a public page fetches only the shell's
    // preloaded copies (S1.3).
    const fetched: string[] = [];
    page.on("request", (request) => {
      if (request.resourceType() === "font")
        fetched.push(new URL(request.url()).pathname);
    });
    await page.goto("/about", { waitUntil: "networkidle" });
    const preloaded = await page
      .locator('link[rel="preload"][as="font"]')
      .evaluateAll((links) =>
        links.map((link) => new URL((link as HTMLLinkElement).href).pathname),
      );
    expect(
      preloaded,
      "Charsen and the four Instrument Sans weights",
    ).toHaveLength(5);
    expect([...fetched].sort()).toEqual([...preloaded].sort());
  });
});
