import { expect, test } from "./harness/fixtures";
import { ROLE_LABELS, fixtureFor, storageStatePath } from "./harness/staff";

/**
 * S1.2 — Operations (work + catalogue) opens the shell and is denied the owner-only section and the Support route,
 * including its finance view (docs/ROADMAP.md S1.2 acceptance; TECH-ARCHITECTURE §5). A denied page shows the
 * final Admin's "Access restricted" and no section content.
 */

test.use({ storageState: storageStatePath("operations") });

test.describe("S1.2 — Operations", () => {
  test("sees the shell with their name and role", async ({ page }) => {
    const fixture = fixtureFor("operations");
    await page.goto("/admin", { waitUntil: "load" });
    await expect(
      page.getByText(
        `Signed in as ${fixture.displayName} · ${ROLE_LABELS.operations}`,
      ),
    ).toBeVisible();
  });

  for (const path of [
    "/admin/staff",
    "/admin/support",
    "/admin/support?view=refunds",
  ]) {
    test(`is denied ${path} server-side`, async ({ page }) => {
      await page.goto(path, { waitUntil: "load" });
      await expect(
        page.getByRole("heading", { level: 1, name: "Access restricted" }),
      ).toBeVisible();
      await expect(
        page.getByText("Your role cannot open this page."),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { level: 1, name: "Staff & Access" }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("heading", { level: 1, name: "Support" }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("heading", { level: 1, name: "Refunds" }),
      ).toHaveCount(0);
      // "arrives" (Staff & Access, Support) and "arrive" (Refunds): neither placeholder line may show.
      await expect(page.getByText(/arrives? with sprint/)).toHaveCount(0);
      await expect(
        page.getByRole("link", { name: "Return to your workspace" }),
      ).toHaveAttribute("href", "/admin");
    });
  }
});
