import { expect, test } from "./harness/fixtures";
import { ROLE_LABELS, fixtureFor, storageStatePath } from "./harness/staff";

/**
 * S1.2 — the owner (all six permission areas) opens the shell, the owner-only section and the finance route
 * (docs/TECH-ARCHITECTURE.md §5 matrix). Storage state from the auth-setup project.
 */

test.use({ storageState: storageStatePath("owner_admin") });

test.describe("S1.2 — the owner", () => {
  test("sees the shell with their name and role", async ({ page }) => {
    const fixture = fixtureFor("owner_admin");
    await page.goto("/admin", { waitUntil: "load" });
    expect(new URL(page.url()).pathname).toBe("/admin");
    await expect(
      page.getByText(
        `Signed in as ${fixture.displayName} · ${ROLE_LABELS.owner_admin}`,
      ),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  });

  test("opens Staff & Access (owner-only)", async ({ page }) => {
    await page.goto("/admin/staff", { waitUntil: "load" });
    expect(new URL(page.url()).pathname).toBe("/admin/staff");
    await expect(
      page.getByRole("heading", { level: 1, name: "Staff & Access" }),
    ).toBeVisible();
    await expect(page.getByText("Access restricted")).toHaveCount(0);
  });

  test("opens Support and its Refunds view (finance)", async ({ page }) => {
    await page.goto("/admin/support", { waitUntil: "load" });
    await expect(
      page.getByRole("heading", { level: 1, name: "Support" }),
    ).toBeVisible();
    await page.goto("/admin/support?view=refunds", { waitUntil: "load" });
    await expect(
      page.getByRole("heading", { level: 1, name: "Refunds" }),
    ).toBeVisible();
    await expect(page.getByText("Access restricted")).toHaveCount(0);
  });
});
