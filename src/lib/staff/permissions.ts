/**
 * The staff permission model — S1.2 (docs/TECH-ARCHITECTURE.md §5; decision D-35). Pure constants and functions,
 * safe in any bundle: no I/O, no secret, no session. The mapping below is the server's statement of what the
 * database states in `public.staff_permission_areas()` (supabase/migrations/0003_staff_auth.sql); a hermetic test
 * keeps the two equal, so a change to either without the other fails the Code Check.
 *
 * Roles are the S1.1 enum: the owner plus the two presets of the final Admin — Operations and Customer support.
 * The six areas are the final Admin's own guards (`guard()` in prototype/admin/state.js); finance, settings and
 * export are owner-only at launch. Section access mirrors `isAllowed` in prototype/admin/app.js — but only as
 * data: the prototype's browser-side checks are presentation and are never ported as access control (D-32e;
 * SECURITY-CHECKLIST §9 rule 1). The server decides, for every request.
 */

export const STAFF_ROLES = ["owner_admin", "operations", "support"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const PERMISSION_AREAS = [
  "work",
  "support",
  "finance",
  "catalogue",
  "settings",
  "export",
] as const;
export type PermissionArea = (typeof PERMISSION_AREAS)[number];

/** The areas each role holds (D-35) — equal to `staff_permission_areas()` in 0003_staff_auth. */
export const ROLE_AREAS: Readonly<
  Record<StaffRole, readonly PermissionArea[]>
> = {
  owner_admin: [
    "work",
    "support",
    "finance",
    "catalogue",
    "settings",
    "export",
  ],
  operations: ["work", "catalogue"],
  support: ["support"],
};

/** The final Admin's labels for the owner and the two presets (docs/content/locked-facts.md §9a). */
export const ROLE_LABELS: Readonly<Record<StaffRole, string>> = {
  owner_admin: "Owner",
  operations: "Operations",
  support: "Customer support",
};

export function isStaffRole(value: unknown): value is StaffRole {
  return (
    typeof value === "string" &&
    (STAFF_ROLES as readonly string[]).includes(value)
  );
}

export function isPermissionArea(value: unknown): value is PermissionArea {
  return (
    typeof value === "string" &&
    (PERMISSION_AREAS as readonly string[]).includes(value)
  );
}

export function areasOf(role: StaffRole): readonly PermissionArea[] {
  return ROLE_AREAS[role];
}

/** True only when the role holds every required area (an empty requirement needs a staff session alone). */
export function holdsAreas(
  role: StaffRole,
  required: readonly PermissionArea[],
): boolean {
  const held = ROLE_AREAS[role];
  return required.every((area) => held.includes(area));
}

/**
 * The S1.2 routes and the areas each requires beyond an active staff session at aal2. Every later sprint adds
 * its routes here (and nowhere else), so the guard and the tests read one table. `null` means the path is not
 * an Admin route this model knows — the guard treats it as forbidden, never as open.
 *
 * - `/admin` — the blank shell: any active staff member (the final Admin's Orders landing page is S1.9).
 * - `/admin/staff` — Staff & Access: owner-only (`settings`; TECH-ARCHITECTURE §3b).
 * - `/admin/support` — Support: `support` (Owner, Customer support); `?view=refunds` — Support › Refunds —
 *   adds `finance` (owner-only; Customer support can open Support but not this tab — D-30, D-35).
 */
export const ADMIN_ROUTES = {
  "/admin": { label: "Aalishaan Studio", areas: [] },
  "/admin/staff": { label: "Staff & Access", areas: ["settings"] },
  "/admin/support": { label: "Support", areas: ["support"] },
} as const satisfies Record<
  string,
  { label: string; areas: readonly PermissionArea[] }
>;

export type AdminRoutePath = keyof typeof ADMIN_ROUTES;

export const SUPPORT_REFUNDS_VIEW = "refunds";

export function isAdminRoutePath(value: string): value is AdminRoutePath {
  return Object.hasOwn(ADMIN_ROUTES, value);
}

/**
 * The areas a request to `pathname` (with its `view` query value, if any) requires. The refunds view of Support
 * requires `support` and `finance` together, so Operations (no `support`) and Customer support (no `finance`)
 * are both refused there while the owner passes.
 */
export function requiredAreasFor(
  pathname: string,
  view: string | null | undefined = null,
): readonly PermissionArea[] | null {
  if (!isAdminRoutePath(pathname)) return null;
  const base: readonly PermissionArea[] = ADMIN_ROUTES[pathname].areas;
  if (pathname === "/admin/support" && view === SUPPORT_REFUNDS_VIEW)
    return [...base, "finance"];
  return base;
}
