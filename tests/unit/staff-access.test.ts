import { describe, expect, it } from "vitest";

import {
  decideAccess,
  type SessionFacts,
  type StaffProfileRow,
} from "@/lib/staff/access";
import type { PermissionArea } from "@/lib/staff/permissions";

/**
 * The guard's decision table, row by row (src/lib/staff/access.ts). Every S1.2 acceptance denial is here as a
 * pure case: Customer support and Operations each denied a finance route and the owner-only section; a revoked
 * member denied; aal1 never a staff session; an Auth account without a staff row never staff; a failure to
 * establish the facts never a pass.
 */

const USER = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "owner@example.test",
};

function profile(overrides: Partial<StaffProfileRow> = {}): StaffProfileRow {
  return {
    user_id: USER.id,
    role: "owner_admin",
    display_name: "Owner (TEST)",
    active: true,
    mfa_enrolled_at: "2026-10-12T00:00:00Z",
    revoked_at: null,
    ...overrides,
  };
}

function facts(overrides: Partial<SessionFacts> = {}): SessionFacts {
  return {
    available: true,
    user: USER,
    aal: "aal2",
    hasVerifiedTotp: true,
    profile: profile(),
    required: [],
    ...overrides,
  };
}

const SETTINGS: PermissionArea[] = ["settings"];
const REFUNDS: PermissionArea[] = ["support", "finance"];

describe("decideAccess — the decision table", () => {
  it("never passes when the facts could not be established, whatever else is present", () => {
    expect(decideAccess(facts({ available: false }))).toEqual({
      kind: "unavailable",
    });
    expect(
      decideAccess(facts({ available: false, user: null, profile: null })),
    ).toEqual({ kind: "unavailable" });
  });

  it("sends a request without a verified user to the sign-in", () => {
    expect(decideAccess(facts({ user: null }))).toEqual({ kind: "login" });
    expect(
      decideAccess(facts({ user: null, aal: null, profile: null })),
    ).toEqual({
      kind: "login",
    });
  });

  it("treats an Auth account without a staff row — or with someone else's row, or an unknown role — as no staff account", () => {
    expect(decideAccess(facts({ profile: null }))).toEqual({
      kind: "not_staff",
      userId: USER.id,
    });
    expect(
      decideAccess(facts({ profile: profile({ user_id: "other" }) })),
    ).toEqual({ kind: "not_staff", userId: USER.id });
    expect(
      decideAccess(facts({ profile: profile({ role: "admin" }) })),
    ).toEqual({
      kind: "not_staff",
      userId: USER.id,
    });
  });

  it("denies an inactive or revoked member before anything else about the session is considered", () => {
    expect(
      decideAccess(facts({ profile: profile({ active: false }) })),
    ).toEqual({
      kind: "revoked",
      userId: USER.id,
    });
    expect(
      decideAccess(
        facts({
          profile: profile({
            active: false,
            revoked_at: "2026-10-12T01:00:00Z",
          }),
        }),
      ),
    ).toEqual({ kind: "revoked", userId: USER.id });
    // A revoked row is denied even when the token still says aal2 and the factor is verified.
    expect(
      decideAccess(
        facts({
          aal: "aal2",
          hasVerifiedTotp: true,
          profile: profile({ active: false }),
        }),
      ).kind,
    ).toBe("revoked");
  });

  it("forces enrolment when the member has no verified TOTP factor, whatever the assurance level claims", () => {
    expect(
      decideAccess(facts({ hasVerifiedTotp: false, aal: "aal1" })),
    ).toEqual({
      kind: "enrol",
      userId: USER.id,
    });
    expect(
      decideAccess(facts({ hasVerifiedTotp: false, aal: "aal2" })),
    ).toEqual({
      kind: "enrol",
      userId: USER.id,
    });
  });

  it("requires aal2: a password-only session with a verified factor must verify", () => {
    expect(decideAccess(facts({ aal: "aal1" }))).toEqual({
      kind: "verify",
      userId: USER.id,
    });
    expect(decideAccess(facts({ aal: null }))).toEqual({
      kind: "verify",
      userId: USER.id,
    });
  });

  it("allows an active owner at aal2 everywhere", () => {
    for (const required of [
      [],
      SETTINGS,
      REFUNDS,
      ["export"] as PermissionArea[],
    ]) {
      const decision = decideAccess(facts({ required }));
      expect(decision.kind, required.join(",")).toBe("allowed");
      if (decision.kind === "allowed") {
        expect(decision.staff).toEqual({
          userId: USER.id,
          email: USER.email,
          role: "owner_admin",
          roleLabel: "Owner",
          displayName: "Owner (TEST)",
          areas: [
            "work",
            "support",
            "finance",
            "catalogue",
            "settings",
            "export",
          ],
        });
      }
    }
  });

  it("denies Operations the owner-only section and the finance route but allows the shell", () => {
    const ops = profile({
      role: "operations",
      display_name: "Operations (TEST)",
    });
    expect(decideAccess(facts({ profile: ops, required: [] })).kind).toBe(
      "allowed",
    );
    const staff = decideAccess(facts({ profile: ops, required: SETTINGS }));
    expect(staff.kind).toBe("forbidden");
    if (staff.kind === "forbidden") expect(staff.missing).toEqual(["settings"]);
    const refunds = decideAccess(facts({ profile: ops, required: REFUNDS }));
    expect(refunds.kind).toBe("forbidden");
    if (refunds.kind === "forbidden")
      expect(refunds.missing).toEqual(["support", "finance"]);
  });

  it("denies Customer support the owner-only section and the finance route but allows the shell and Support", () => {
    const support = profile({
      role: "support",
      display_name: "Support (TEST)",
    });
    expect(decideAccess(facts({ profile: support, required: [] })).kind).toBe(
      "allowed",
    );
    expect(
      decideAccess(facts({ profile: support, required: ["support"] })).kind,
    ).toBe("allowed");
    const staff = decideAccess(facts({ profile: support, required: SETTINGS }));
    expect(staff.kind).toBe("forbidden");
    const refunds = decideAccess(
      facts({ profile: support, required: REFUNDS }),
    );
    expect(refunds.kind).toBe("forbidden");
    if (refunds.kind === "forbidden")
      expect(refunds.missing).toEqual(["finance"]);
  });

  it("carries the staff identity on a forbidden decision so the page can say who was refused, and nothing more", () => {
    const decision = decideAccess(
      facts({ profile: profile({ role: "support" }), required: SETTINGS }),
    );
    expect(decision.kind).toBe("forbidden");
    if (decision.kind === "forbidden") {
      expect(decision.staff.role).toBe("support");
      expect(decision.staff.roleLabel).toBe("Customer support");
      expect(Object.keys(decision.staff).sort()).toEqual([
        "areas",
        "displayName",
        "email",
        "role",
        "roleLabel",
        "userId",
      ]);
    }
  });
});
