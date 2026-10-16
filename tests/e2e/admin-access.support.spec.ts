import { bootstrapBypassCookie } from "./harness/bypass";
import { expect, test } from "./harness/fixtures";
import { ROLE_LABELS, fixtureFor, storageStatePath } from "./harness/staff";

/**
 * S1.2 — Customer support (support) opens the shell and Support, and is denied the Refunds view (finance) and the
 * owner-only section (docs/ROADMAP.md S1.2 acceptance; TECH-ARCHITECTURE §5).
 *
 * The last test signs out. Signing out ends that session on the Auth server, and both required projects replay
 * the one saved Customer-support session — so the test carries `@sign-out` in its title, the two required
 * projects leave it out (`grepInvert`) and the `auth-teardown` project runs it once, after both
 * (playwright.config.ts).
 */

test.use({ storageState: storageStatePath("support") });
test.describe.configure({ mode: "serial" });

test.describe("S1.2 — Customer support", () => {
  test("sees the shell with their name and role", async ({ page }) => {
    const fixture = fixtureFor("support");
    await page.goto("/admin", { waitUntil: "load" });
    await expect(
      page.getByText(
        `Signed in as ${fixture.displayName} · ${ROLE_LABELS.support}`,
      ),
    ).toBeVisible();
  });

  test("opens Support", async ({ page }) => {
    await page.goto("/admin/support", { waitUntil: "load" });
    await expect(
      page.getByRole("heading", { level: 1, name: "Support" }),
    ).toBeVisible();
    await expect(page.getByText("Access restricted")).toHaveCount(0);
  });

  for (const path of ["/admin/support?view=refunds", "/admin/staff"]) {
    test(`is denied ${path} server-side`, async ({ page }) => {
      await page.goto(path, { waitUntil: "load" });
      await expect(
        page.getByRole("heading", { level: 1, name: "Access restricted" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { level: 1, name: "Refunds" }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("heading", { level: 1, name: "Staff & Access" }),
      ).toHaveCount(0);
      // "arrives" (Staff & Access, Support) and "arrive" (Refunds): neither placeholder line may show.
      await expect(page.getByText(/arrives? with sprint/)).toHaveCount(0);
    });
  }

  test("signs out: the session is ended on the server and the next request is sent to the sign-in @sign-out", async ({
    page,
    browser,
    target,
  }) => {
    await page.goto("/admin", { waitUntil: "load" });
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL(/\/admin\/login(\?|$)/);
    await page.goto("/admin/support", { waitUntil: "load" });
    expect(new URL(page.url()).pathname).toBe("/admin/login");
    await expect(page.getByText("Signed in as")).toHaveCount(0);

    // Clearing this browser's cookies would give the same result. A second browser that replays the saved
    // cookies proves the session itself is gone: the Auth server no longer vouches for them.
    const replay = await browser.newContext({
      storageState: storageStatePath("support"),
    });
    try {
      await bootstrapBypassCookie(replay, target);
      const replayPage = await replay.newPage();
      await replayPage.goto(new URL("/admin", target.origin).toString(), {
        waitUntil: "load",
      });
      expect(new URL(replayPage.url()).pathname).toBe("/admin/login");
      await expect(replayPage.getByText("Signed in as")).toHaveCount(0);
    } finally {
      await replay.close();
    }
  });
});
