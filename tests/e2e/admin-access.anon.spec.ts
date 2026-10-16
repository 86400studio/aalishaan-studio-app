import { exactRequest } from "./harness/bypass";
import { expect, test } from "./harness/fixtures";

/**
 * S1.2 — nothing under /admin is reachable without a session (docs/ROADMAP.md S1.2 goal; SECURITY-CHECKLIST §3,
 * §9 rule 1). An anonymous browser is sent to the sign-in with a validated return path and sees no staff content;
 * a forged `next` is replaced; the sign-in page itself carries the six headers and noindex like every response.
 */

const PROTECTED = [
  "/admin",
  "/admin/staff",
  "/admin/support",
  "/admin/support?view=refunds",
];

test.describe("S1.2 — anonymous access to /admin", () => {
  for (const path of PROTECTED) {
    test(`redirects ${path} to the sign-in and shows no staff content`, async ({
      page,
      target,
    }) => {
      const response = await page.goto(path, { waitUntil: "load" });
      expect(response?.status()).toBe(200);
      const url = new URL(page.url());
      expect(url.origin).toBe(target.origin);
      expect(url.pathname).toBe("/admin/login");
      if (path !== "/admin") expect(url.searchParams.get("next")).toBe(path);
      else expect(url.searchParams.has("next")).toBe(false);
      await expect(
        page.getByRole("heading", { level: 1, name: "Sign in" }),
      ).toBeVisible();
      await expect(page.getByText("Signed in as")).toHaveCount(0);
      await expect(page.getByText("Staff & Access")).toHaveCount(0);
      await expect(page.getByText("Access restricted")).toHaveCount(0);
      await expect(page.getByLabel("Email")).toBeVisible();
      await expect(page.getByLabel("Password")).toBeVisible();
    });
  }

  test("replaces a forged return path with /admin", async ({ page }) => {
    await page.goto("/admin/login?next=https%3A%2F%2Fevil.example%2Fadmin", {
      waitUntil: "load",
    });
    await expect(page.locator('input[name="next"]')).toHaveValue("/admin");
    await page.goto("/admin/login?next=%2F%2Fevil.example", {
      waitUntil: "load",
    });
    await expect(page.locator('input[name="next"]')).toHaveValue("/admin");
    await page.goto("/admin/login?next=%2Fadmin%2Fstaff", {
      waitUntil: "load",
    });
    await expect(page.locator('input[name="next"]')).toHaveValue(
      "/admin/staff",
    );
  });

  test("the sign-in and verification pages answer with the six headers and noindex; the verification page without a session returns to the sign-in", async ({
    page,
    target,
  }) => {
    const SIX_HEADERS = [
      "content-security-policy",
      "strict-transport-security",
      "x-frame-options",
      "x-content-type-options",
      "referrer-policy",
      "permissions-policy",
    ];
    const login = await exactRequest(target, "/admin/login");
    expect(login.status).toBe(200);
    for (const name of SIX_HEADERS)
      expect(login.headers[name], name).toBeTruthy();
    expect(login.headers["x-robots-tag"]).toContain("noindex");
    expect(login.headers["content-security-policy"]).toContain(
      "img-src 'self' data:",
    );
    const verify = await exactRequest(target, "/admin/login/verify");
    expect([302, 303, 307, 308]).toContain(verify.status);
    for (const name of SIX_HEADERS)
      expect(verify.headers[name], `verify ${name}`).toBeTruthy();
    expect(verify.headers["x-robots-tag"]).toContain("noindex");
    // The harness never keeps a Location value (it could carry a token) — only its origin; the browser proves
    // the path the redirect leads to.
    expect(verify.locationOrigin).toBe(target.origin);
    await page.goto("/admin/login/verify", { waitUntil: "load" });
    expect(new URL(page.url()).pathname).toBe("/admin/login");
    await expect(
      page.getByRole("heading", { level: 1, name: "Sign in" }),
    ).toBeVisible();
  });
});
