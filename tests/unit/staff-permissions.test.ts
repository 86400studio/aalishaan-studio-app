import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  ADMIN_ROUTES,
  PERMISSION_AREAS,
  ROLE_AREAS,
  ROLE_LABELS,
  STAFF_ROLES,
  SUPPORT_REFUNDS_VIEW,
  areasOf,
  holdsAreas,
  isAdminRoutePath,
  isPermissionArea,
  isStaffRole,
  requiredAreasFor,
} from "@/lib/staff/permissions";

/**
 * The permission model is one statement in two places — the SQL function in 0003_staff_auth and the TypeScript
 * map — and the section access of the final Admin as data (D-35; docs/TECH-ARCHITECTURE.md §5). These tests pin
 * the two to each other and to the architecture's matrix.
 */

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const migration = readFileSync(
  path.join(ROOT, "supabase/migrations/0003_staff_auth.sql"),
  "utf8",
);

/** The arrays the SQL function returns per role, read from the migration text. */
function sqlAreasFor(role: string): string[] {
  const match = new RegExp(
    `when '${role}'\\s+then array\\[([^\\]]+)\\]::public\\.permission_area\\[\\]`,
  ).exec(migration);
  expect(match, `${role} in the SQL function`).not.toBeNull();
  return match![1].split(",").map((part) => part.trim().replace(/^'|'$/g, ""));
}

describe("src/lib/staff/permissions.ts — the D-35 model", () => {
  it("knows exactly the three S1.1 roles and the six areas of the final Admin", () => {
    expect([...STAFF_ROLES]).toEqual(["owner_admin", "operations", "support"]);
    expect([...PERMISSION_AREAS]).toEqual([
      "work",
      "support",
      "finance",
      "catalogue",
      "settings",
      "export",
    ]);
    const enumLine =
      /create type public\.permission_area as enum \(([^)]+)\)/.exec(migration);
    expect(enumLine).not.toBeNull();
    expect(
      enumLine![1].split(",").map((part) => part.trim().replace(/^'|'$/g, "")),
    ).toEqual([...PERMISSION_AREAS]);
  });

  it.each([...STAFF_ROLES])(
    "maps %s to the same areas as staff_permission_areas() in 0003_staff_auth",
    (role) => {
      expect([...ROLE_AREAS[role]]).toEqual(sqlAreasFor(role));
      expect(areasOf(role)).toBe(ROLE_AREAS[role]);
    },
  );

  it("gives the owner all six areas, Operations work + catalogue, Customer support support only", () => {
    expect([...ROLE_AREAS.owner_admin]).toEqual([...PERMISSION_AREAS]);
    expect([...ROLE_AREAS.operations]).toEqual(["work", "catalogue"]);
    expect([...ROLE_AREAS.support]).toEqual(["support"]);
    for (const area of ["finance", "settings", "export"] as const) {
      expect(holdsAreas("operations", [area]), area).toBe(false);
      expect(holdsAreas("support", [area]), area).toBe(false);
      expect(holdsAreas("owner_admin", [area]), area).toBe(true);
    }
    expect(holdsAreas("support", ["catalogue"])).toBe(false);
    expect(holdsAreas("operations", ["support"])).toBe(false);
  });

  it("requires every listed area at once and accepts an empty requirement for any role", () => {
    expect(holdsAreas("owner_admin", ["support", "finance"])).toBe(true);
    expect(holdsAreas("support", ["support", "finance"])).toBe(false);
    expect(holdsAreas("operations", ["work", "catalogue"])).toBe(true);
    for (const role of STAFF_ROLES) expect(holdsAreas(role, [])).toBe(true);
  });

  it("uses the final Admin's labels for the owner and the two presets", () => {
    expect(ROLE_LABELS).toEqual({
      owner_admin: "Owner",
      operations: "Operations",
      support: "Customer support",
    });
  });

  it("recognises roles and areas strictly", () => {
    expect(isStaffRole("owner_admin")).toBe(true);
    expect(isStaffRole("owner")).toBe(false);
    expect(isStaffRole("")).toBe(false);
    expect(isStaffRole(null)).toBe(false);
    expect(isPermissionArea("finance")).toBe(true);
    expect(isPermissionArea("admin")).toBe(false);
  });
});

describe("the S1.2 routes and the areas they require", () => {
  it("lists exactly the three S1.2 routes", () => {
    expect(Object.keys(ADMIN_ROUTES).sort()).toEqual([
      "/admin",
      "/admin/staff",
      "/admin/support",
    ]);
    expect(isAdminRoutePath("/admin/orders")).toBe(false);
    expect(isAdminRoutePath("/admin/")).toBe(false);
  });

  it("requires nothing beyond a staff session for the shell, settings for Staff & Access, support for Support, support + finance for Refunds", () => {
    expect(requiredAreasFor("/admin")).toEqual([]);
    expect(requiredAreasFor("/admin/staff")).toEqual(["settings"]);
    expect(requiredAreasFor("/admin/support")).toEqual(["support"]);
    expect(requiredAreasFor("/admin/support", null)).toEqual(["support"]);
    expect(requiredAreasFor("/admin/support", "all")).toEqual(["support"]);
    expect(requiredAreasFor("/admin/support", SUPPORT_REFUNDS_VIEW)).toEqual([
      "support",
      "finance",
    ]);
  });

  it("answers null for an unknown path, which the guard treats as forbidden", () => {
    expect(requiredAreasFor("/admin/orders")).toBeNull();
    expect(requiredAreasFor("/")).toBeNull();
    expect(requiredAreasFor("/adminx")).toBeNull();
  });

  it("mirrors the architecture's matrix: the owner opens all three, Operations only the shell, Customer support the shell and Support but not Refunds", () => {
    const refunds = requiredAreasFor("/admin/support", SUPPORT_REFUNDS_VIEW)!;
    const staff = requiredAreasFor("/admin/staff")!;
    const support = requiredAreasFor("/admin/support")!;
    expect(holdsAreas("owner_admin", refunds)).toBe(true);
    expect(holdsAreas("owner_admin", staff)).toBe(true);
    expect(holdsAreas("owner_admin", support)).toBe(true);
    expect(holdsAreas("operations", staff)).toBe(false);
    expect(holdsAreas("operations", support)).toBe(false);
    expect(holdsAreas("operations", refunds)).toBe(false);
    expect(holdsAreas("support", support)).toBe(true);
    expect(holdsAreas("support", refunds)).toBe(false);
    expect(holdsAreas("support", staff)).toBe(false);
  });
});
