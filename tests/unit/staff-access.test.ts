import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// The session module's edges, replaced so `collectStaffFacts` and `guardAdminPage` run without a request, a
// network or a redirect: the cookie store, the redirect (thrown, so the target can be read), the SSR client
// factory and the privileged factory. `mocks` is filled by each test.
const mocks = vi.hoisted(() => ({
  cookieClient: null as unknown,
  identity: null as unknown,
  privileged: null as unknown,
  cookieOptions: null as unknown,
  cookieStore: null as unknown,
}));
vi.mock("next/headers", () => ({
  cookies: async () =>
    mocks.cookieStore ?? { getAll: () => [], set: () => undefined },
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _key: string,
    options: { cookieOptions: unknown },
  ) => {
    mocks.cookieOptions = options.cookieOptions;
    return mocks.cookieClient;
  },
}));
vi.mock("@/lib/server/supabase", () => ({
  resolveServerIdentity: () => mocks.identity,
  createPrivilegedClient: () => mocks.privileged,
}));

import { signOut } from "@/app/admin/login/actions";
import { auditLogInputSchema } from "@/lib/schemas/orders";
import {
  REVOCATION_BAN_DURATION,
  changeStaffRole,
  recordMfaEnrolled,
  revokeStaffAccess,
} from "@/lib/server/staff-access";
import {
  STAFF_AUDIT_ACTIONS,
  emailHashFor,
  recordStaffAudit,
  staffAuditRow,
  type PrivilegedClient,
} from "@/lib/server/staff-audit";
import {
  STAFF_COOKIE_OPTIONS,
  collectStaffFacts,
  forgetStaffSessionCookies,
  guardAction,
  guardAdminPage,
  hasVerifiedTotp,
} from "@/lib/server/staff-session";
import {
  classifyAuthFailure,
  decideAccess,
  type SessionFacts,
  type StaffProfileRow,
} from "@/lib/staff/access";
import type { PermissionArea } from "@/lib/staff/permissions";

/**
 * The guard's decision table, row by row (src/lib/staff/access.ts), and the server modules around it. Every
 * S1.2 acceptance denial is here as a pure case: Customer support and Operations each denied a finance route
 * and the owner-only section; a revoked member denied; aal1 never a staff session; an Auth account without a
 * staff row never staff; a failure to establish the facts never a pass. Below the table: how a failed Auth
 * answer is classified, how the session module gathers the facts and acts on the decision, and what the
 * access-change functions and the audit writer write — against a recording fake client, with no network.
 */

const USER = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "owner@example.test",
};
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";

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
    revokedByAuth: false,
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

  it("keeps the order of the table: the staff row is judged before the second factor is asked for", () => {
    // A revoked member is never sent to the verification page …
    expect(
      decideAccess(facts({ aal: "aal1", profile: profile({ active: false }) }))
        .kind,
    ).toBe("revoked");
    // … and can never enrol a factor.
    expect(
      decideAccess(
        facts({
          aal: "aal1",
          hasVerifiedTotp: false,
          profile: profile({ active: false }),
        }),
      ).kind,
    ).toBe("revoked");
    // An Auth account with no staff row can neither enrol nor verify: only an active staff account may.
    expect(
      decideAccess(
        facts({ aal: "aal1", hasVerifiedTotp: false, profile: null }),
      ).kind,
    ).toBe("not_staff");
    expect(decideAccess(facts({ aal: "aal1", profile: null })).kind).toBe(
      "not_staff",
    );
    // A row that says active but carries a revocation time is still revoked (the database forbids the pair;
    // the decision does not rely on that).
    expect(
      decideAccess(
        facts({
          profile: profile({
            active: true,
            revoked_at: "2026-10-12T01:00:00Z",
          }),
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

describe("classifyAuthFailure — an Auth failure is no user only when the Auth server said so", () => {
  it.each([
    ["no connection (auth-js reports 0)", 0],
    ["an answer that is not JSON (no status)", undefined],
    ["a 500", 500],
    ["a 503", 503],
    ["a 524 from the edge", 524],
    ["the Auth server's own rate limit", 429],
  ])("treats %s as unavailable", (_label, status) => {
    expect(classifyAuthFailure(status)).toBe("unavailable");
  });

  it.each([
    ["no session (400)", 400],
    ["a rejected token (401)", 401],
    ["a deleted session or a banned user (403)", 403],
    ["a user that no longer exists (404)", 404],
    ["a refused request (422)", 422],
  ])("treats %s as no user", (_label, status) => {
    expect(classifyAuthFailure(status)).toBe("no_user");
  });
});

// --- the session module: the facts and what the guard does with the decision -------------------------------------

const TEST_REF = "abcdefghijklmnopqrst";
const OTHER_REF = "tsrqponmlkjihgfedcba";

type AuthAnswer = {
  user?: unknown;
  userError?: { status?: number; code?: string } | null;
  /** The call throws instead of answering (a cookie that is not a session, a failed request). */
  userThrows?: boolean;
  aal?: unknown;
  aalError?: { status?: number } | null;
  aalThrows?: boolean;
};

/** A cookie client whose two Auth calls answer as told, and which records that they were made, in order. */
function cookieClient(answer: AuthAnswer) {
  const calls: string[] = [];
  return {
    calls,
    client: {
      auth: {
        getUser: async () => {
          calls.push("getUser");
          if (answer.userThrows) throw new SyntaxError("Unexpected token");
          return answer.userError
            ? { data: { user: null }, error: answer.userError }
            : { data: { user: answer.user ?? null }, error: null };
        },
        mfa: {
          getAuthenticatorAssuranceLevel: async () => {
            calls.push("getAuthenticatorAssuranceLevel");
            if (answer.aalThrows)
              throw new TypeError("Cannot read properties of undefined");
            return answer.aalError
              ? { data: null, error: answer.aalError }
              : { data: { currentLevel: answer.aal ?? null }, error: null };
          },
        },
      },
    },
  };
}

function profileReader(result: {
  data: unknown;
  error: { code?: string } | null;
}) {
  const calls: string[] = [];
  const chain = {
    select: (columns: string) => {
      calls.push(`select ${columns}`);
      return chain;
    },
    eq: (column: string, value: string) => {
      calls.push(`eq ${column} ${value}`);
      return chain;
    },
    maybeSingle: async () => result,
  };
  return {
    calls,
    result: {
      ok: true,
      client: {
        from: (table: string) => {
          calls.push(`from ${table}`);
          return chain;
        },
      },
    },
  };
}

const AUTH_USER = {
  id: USER.id,
  email: USER.email,
  factors: [{ factor_type: "totp", status: "verified" }],
};

function arrange(options: {
  auth: AuthAnswer;
  profile?: { data: unknown; error: { code?: string } | null };
  privilegedOk?: boolean;
  identityRef?: string;
}) {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", `https://${TEST_REF}.supabase.co`);
  vi.stubEnv(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    `sb_publishable_${"p".repeat(30)}`,
  );
  const cookie = cookieClient(options.auth);
  const reader = profileReader(
    options.profile ?? { data: profile(), error: null },
  );
  mocks.cookieClient = cookie.client;
  mocks.identity = {
    ok: true,
    identity: { projectRef: options.identityRef ?? TEST_REF },
  };
  mocks.privileged =
    options.privilegedOk === false
      ? { ok: false, reason: "not_configured" }
      : reader.result;
  return { cookie, reader };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  mocks.cookieStore = null;
});

describe("collectStaffFacts — every fact from the server, and no pass without them", () => {
  it("gathers the user, the assurance level, the factor and the staff row, asking the Auth server first", async () => {
    const { cookie, reader } = arrange({
      auth: { user: AUTH_USER, aal: "aal2" },
    });
    const { facts: gathered } = await collectStaffFacts(SETTINGS);
    expect(gathered).toEqual({
      available: true,
      user: USER,
      revokedByAuth: false,
      aal: "aal2",
      hasVerifiedTotp: true,
      profile: profile(),
      required: SETTINGS,
    });
    // The level is read only after the Auth server has validated the token it is decoded from.
    expect(cookie.calls).toEqual(["getUser", "getAuthenticatorAssuranceLevel"]);
    expect(reader.calls).toEqual([
      "from staff_profiles",
      "select user_id, role, display_name, active, mfa_enrolled_at, revoked_at",
      `eq user_id ${USER.id}`,
    ]);
    expect(decideAccess(gathered).kind).toBe("allowed");
  });

  it("builds the cookie client with the staff cookie attributes", async () => {
    arrange({ auth: { user: AUTH_USER, aal: "aal2" } });
    await collectStaffFacts([]);
    expect(mocks.cookieOptions).toEqual(STAFF_COOKIE_OPTIONS);
    expect(STAFF_COOKIE_OPTIONS).toEqual({
      name: "aalishaan-staff",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/admin",
    });
  });

  it.each([
    ["no connection", { status: 0 }],
    ["an unreadable answer", {}],
    ["a 503", { status: 503 }],
  ])(
    "is unavailable — not a sign-in redirect — when the Auth server fails with %s",
    async (_label, userError) => {
      const { reader } = arrange({ auth: { userError } });
      const { facts: gathered } = await collectStaffFacts([]);
      expect(gathered.available).toBe(false);
      expect(decideAccess(gathered)).toEqual({ kind: "unavailable" });
      expect(reader.calls).toEqual([]);
    },
  );

  it.each([
    ["no session", { status: 400 }],
    ["a rejected token", { status: 401 }],
    ["a deleted session", { status: 403 }],
  ])(
    "is no user — the sign-in — when the Auth server answers %s, and reads no staff row",
    async (_label, userError) => {
      const { reader } = arrange({ auth: { userError } });
      const { facts: gathered } = await collectStaffFacts([]);
      expect(gathered).toMatchObject({ available: true, user: null });
      expect(decideAccess(gathered)).toEqual({ kind: "login" });
      expect(reader.calls).toEqual([]);
    },
  );

  it("is unavailable when the assurance level, the privileged client or the staff row cannot be read", async () => {
    arrange({ auth: { user: AUTH_USER, aalError: { status: 500 } } });
    expect((await collectStaffFacts([])).facts.available).toBe(false);

    arrange({ auth: { user: AUTH_USER, aal: "aal2" }, privilegedOk: false });
    expect((await collectStaffFacts([])).facts.available).toBe(false);

    arrange({
      auth: { user: AUTH_USER, aal: "aal2" },
      profile: { data: null, error: { code: "42703" } },
    });
    expect((await collectStaffFacts([])).facts.available).toBe(false);
  });

  it("is the revoked state — not the sign-in — when the Auth server refuses a banned member's own token", async () => {
    // Revocation bans the Auth user; the Auth server then answers the member's still-valid token with user_banned.
    const { reader } = arrange({
      auth: { userError: { status: 403, code: "user_banned" } },
    });
    const { facts: gathered } = await collectStaffFacts(SETTINGS);
    expect(gathered).toMatchObject({
      available: true,
      user: null,
      revokedByAuth: true,
    });
    expect(decideAccess(gathered)).toEqual({ kind: "revoked", userId: null });
    // No staff row is read for a session the Auth server refused.
    expect(reader.calls).toEqual([]);

    arrange({ auth: { userError: { status: 403, code: "user_banned" } } });
    expect(await guardAdminPage({ required: [], returnTo: "/admin" })).toEqual({
      ok: false,
      state: "revoked",
      staff: null,
    });

    // Any other refusal with the same status stays "no user": only the Auth server's own word for a ban counts.
    arrange({
      auth: { userError: { status: 403, code: "session_not_found" } },
    });
    expect(decideAccess((await collectStaffFacts([])).facts)).toEqual({
      kind: "login",
    });
    // And a ban can never outrank a failure to establish the facts.
    expect(
      decideAccess(facts({ available: false, revokedByAuth: true })),
    ).toEqual({ kind: "unavailable" });
  });

  it("is unavailable — not an unhandled error — when a library call throws instead of answering", async () => {
    // A hand-edited cookie can make auth-js throw while it decodes the stored session, before any request.
    const first = arrange({ auth: { userThrows: true } });
    const thrownAtUser = await collectStaffFacts(SETTINGS);
    expect(thrownAtUser.facts).toMatchObject({ available: false, user: null });
    expect(decideAccess(thrownAtUser.facts)).toEqual({ kind: "unavailable" });
    expect(first.reader.calls).toEqual([]);

    const second = arrange({ auth: { user: AUTH_USER, aalThrows: true } });
    const thrownAtLevel = await collectStaffFacts(SETTINGS);
    expect(decideAccess(thrownAtLevel.facts)).toEqual({ kind: "unavailable" });
    // Nothing is read with the privileged client once a fact could not be established.
    expect(second.reader.calls).toEqual([]);

    arrange({ auth: { userThrows: true } });
    expect(await guardAdminPage({ required: [], returnTo: "/admin" })).toEqual({
      ok: false,
      state: "unavailable",
      staff: null,
    });
  });

  it("is unavailable, with no cookie client at all, when the public values point at another project than the server's", async () => {
    const { cookie } = arrange({
      auth: { user: AUTH_USER, aal: "aal2" },
      identityRef: OTHER_REF,
    });
    const gathered = await collectStaffFacts([]);
    expect(gathered.supabase).toBeNull();
    expect(gathered.facts.available).toBe(false);
    expect(cookie.calls).toEqual([]);
  });

  it("takes an unknown assurance value as no level, and counts only a verified TOTP factor", async () => {
    arrange({ auth: { user: AUTH_USER, aal: "aal3" } });
    expect((await collectStaffFacts([])).facts.aal).toBeNull();
    expect(hasVerifiedTotp({ id: "x" })).toBe(false);
    expect(
      hasVerifiedTotp({
        id: "x",
        factors: [{ factor_type: "totp", status: "unverified" }],
      }),
    ).toBe(false);
    expect(
      hasVerifiedTotp({
        id: "x",
        factors: [{ factor_type: "phone", status: "verified" }],
      }),
    ).toBe(false);
    expect(
      hasVerifiedTotp({
        id: "x",
        factors: [
          { factor_type: "totp", status: "unverified" },
          { factor_type: "totp", status: "verified" },
        ],
      }),
    ).toBe(true);
  });
});

describe("guardAdminPage and guardAction — what is done with the decision", () => {
  const redirectOf = async (run: () => Promise<unknown>) => {
    try {
      await run();
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
    return "no redirect";
  };

  it("sends a request without a session to the sign-in with the validated return path", async () => {
    arrange({ auth: { userError: { status: 400 } } });
    expect(
      await redirectOf(() =>
        guardAdminPage({ required: SETTINGS, returnTo: "/admin/staff" }),
      ),
    ).toBe("REDIRECT /admin/login?next=%2Fadmin%2Fstaff");
    arrange({ auth: { userError: { status: 400 } } });
    expect(
      await redirectOf(() =>
        guardAdminPage({ required: [], returnTo: "https://evil.example/" }),
      ),
    ).toBe("REDIRECT /admin/login");
  });

  it("sends a password-only session to the second step, or to enrolment when no factor is verified", async () => {
    arrange({ auth: { user: AUTH_USER, aal: "aal1" } });
    expect(
      await redirectOf(() =>
        guardAdminPage({ required: [], returnTo: "/admin" }),
      ),
    ).toBe("REDIRECT /admin/login/verify?next=%2Fadmin");
    arrange({ auth: { user: { ...AUTH_USER, factors: [] }, aal: "aal1" } });
    expect(
      await redirectOf(() =>
        guardAdminPage({ required: [], returnTo: "/admin" }),
      ),
    ).toBe("REDIRECT /admin/login/enrol?next=%2Fadmin");
  });

  it("returns the honest state — never the page — for a missing area, a revoked member, no staff row and an outage", async () => {
    arrange({
      auth: { user: AUTH_USER, aal: "aal2" },
      profile: { data: profile({ role: "support" }), error: null },
    });
    expect(
      await guardAdminPage({ required: SETTINGS, returnTo: "/admin/staff" }),
    ).toMatchObject({ ok: false, state: "forbidden" });

    arrange({
      auth: { user: AUTH_USER, aal: "aal2" },
      profile: { data: profile({ active: false }), error: null },
    });
    expect(await guardAdminPage({ required: [], returnTo: "/admin" })).toEqual({
      ok: false,
      state: "revoked",
      staff: null,
    });

    arrange({
      auth: { user: AUTH_USER, aal: "aal2" },
      profile: { data: null, error: null },
    });
    expect(await guardAdminPage({ required: [], returnTo: "/admin" })).toEqual({
      ok: false,
      state: "not_staff",
      staff: null,
    });

    arrange({ auth: { userError: { status: 0 } } });
    expect(await guardAdminPage({ required: [], returnTo: "/admin" })).toEqual({
      ok: false,
      state: "unavailable",
      staff: null,
    });
  });

  it("lets an active member at aal2 through with their staff identity, and refuses an action the same way as a page", async () => {
    arrange({ auth: { user: AUTH_USER, aal: "aal2" } });
    const page = await guardAdminPage({
      required: SETTINGS,
      returnTo: "/admin/staff",
    });
    expect(page).toMatchObject({
      ok: true,
      staff: { userId: USER.id, role: "owner_admin" },
    });

    arrange({ auth: { user: AUTH_USER, aal: "aal2" } });
    expect(await guardAction(SETTINGS)).toMatchObject({
      ok: true,
      staff: { userId: USER.id },
    });

    arrange({
      auth: { user: AUTH_USER, aal: "aal2" },
      profile: { data: profile({ role: "operations" }), error: null },
    });
    expect(await guardAction(SETTINGS)).toMatchObject({
      ok: false,
      decision: { kind: "forbidden" },
    });

    arrange({ auth: { user: AUTH_USER, aal: "aal1" } });
    expect(await guardAction([])).toEqual({
      ok: false,
      decision: { kind: "verify", userId: USER.id },
    });
  });
});

// --- signing out: this browser forgets the session whatever the Auth server answered ----------------------------

type CookieWrite = { name: string; value: string; options: unknown };

/** A cookie store that holds the named cookies and records every write made to it. */
function cookieJar(names: string[]): CookieWrite[] {
  const writes: CookieWrite[] = [];
  mocks.cookieStore = {
    getAll: () => names.map((name) => ({ name, value: "held" })),
    set: (name: string, value: string, options?: unknown) => {
      writes.push({ name, value, options });
    },
  };
  return writes;
}

describe("signing out — this browser forgets the session whatever the Auth server answered", () => {
  const SESSION_COOKIES = [
    "aalishaan-staff",
    "aalishaan-staff.0",
    "aalishaan-staff.1",
    "aalishaan-staff-code-verifier",
  ];
  const OTHER_COOKIES = ["aalishaan-staffing", "staff", "_vercel_jwt"];
  // A cookie is only deleted by the path it was set with: these are the session cookie's own attributes.
  const DELETED = {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/admin",
    maxAge: 0,
  };
  const deletions = SESSION_COOKIES.map((name) => ({
    name,
    value: "",
    options: DELETED,
  }));

  /** Runs the sign-out action against a library sign-out that answers as told. */
  async function signOutWith(librarySignOut: () => Promise<unknown>) {
    arrange({ auth: {} });
    const asked: unknown[] = [];
    mocks.cookieClient = {
      auth: {
        signOut: async (options: unknown) => {
          asked.push(options);
          return librarySignOut();
        },
      },
    };
    const writes = cookieJar([...SESSION_COOKIES, ...OTHER_COOKIES]);
    let redirected = "no redirect";
    try {
      await signOut();
    } catch (error) {
      redirected = error instanceof Error ? error.message : String(error);
    }
    return { asked, writes, redirected };
  }

  it("deletes the session value, its chunks and the library's keys with their own attributes, and no other cookie", async () => {
    const writes = cookieJar([...SESSION_COOKIES, ...OTHER_COOKIES]);
    await forgetStaffSessionCookies();
    expect(writes).toEqual(deletions);
    expect(DELETED.path).toBe(STAFF_COOKIE_OPTIONS.path);
    expect(DELETED.sameSite).toBe(STAFF_COOKIE_OPTIONS.sameSite);
  });

  it("asks the Auth server to end this session only, then deletes the cookies and returns to the sign-in", async () => {
    const { asked, writes, redirected } = await signOutWith(async () => ({
      error: null,
    }));
    expect(asked).toEqual([{ scope: "local" }]);
    expect(writes).toEqual(deletions);
    expect(redirected).toBe("REDIRECT /admin/login");
  });

  it("deletes the cookies when the Auth server could not be reached and the library kept them", async () => {
    // What auth-js answers when the session's token has expired and cannot be renewed: an error, no cookie write.
    const { asked, writes, redirected } = await signOutWith(async () => ({
      error: { name: "AuthRetryableFetchError", status: 0 },
    }));
    expect(asked).toHaveLength(1);
    expect(writes).toEqual(deletions);
    expect(redirected).toBe("REDIRECT /admin/login");
  });

  it("deletes the cookies when the library's sign-out throws instead of answering", async () => {
    const { writes, redirected } = await signOutWith(async () => {
      throw new TypeError("fetch failed");
    });
    expect(writes).toEqual(deletions);
    expect(redirected).toBe("REDIRECT /admin/login");
  });

  it("deletes the cookies when no session client can be built at all", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    let asked = 0;
    mocks.cookieClient = {
      auth: {
        signOut: async () => {
          asked += 1;
          return { error: null };
        },
      },
    };
    const writes = cookieJar(SESSION_COOKIES);
    let redirected = "no redirect";
    try {
      await signOut();
    } catch (error) {
      redirected = error instanceof Error ? error.message : String(error);
    }
    expect(asked).toBe(0);
    expect(writes).toEqual(deletions);
    expect(redirected).toBe("REDIRECT /admin/login");
  });
});

// --- the access changes and the audit writer, against a recording fake client ----------------------------------

type Outcome = { error: { code?: string } | null };

function fakePrivileged(
  script: {
    read?: { data: unknown; error: { code?: string } | null };
    update?: Outcome;
    insert?: Outcome | "throw";
    ban?: Outcome;
  } = {},
) {
  const calls: string[] = [];
  const inserted: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
  const bans: unknown[] = [];
  const client = {
    from(table: string) {
      let kind: "read" | "update" = "read";
      const chain = {
        select(columns: string) {
          calls.push(`select ${table} ${columns}`);
          return chain;
        },
        update(values: Record<string, unknown>) {
          kind = "update";
          updates.push(values);
          calls.push(`update ${table} ${Object.keys(values).join(",")}`);
          return chain;
        },
        insert(row: Record<string, unknown>) {
          calls.push(`insert ${table}`);
          if (script.insert === "throw")
            return Promise.reject(new Error("fetch failed"));
          inserted.push(row);
          return Promise.resolve(script.insert ?? { error: null });
        },
        eq() {
          return chain;
        },
        maybeSingle() {
          return Promise.resolve(script.read ?? { data: null, error: null });
        },
        then(
          resolve: (value: unknown) => unknown,
          reject: (reason: unknown) => unknown,
        ) {
          return Promise.resolve(
            kind === "update"
              ? (script.update ?? { error: null })
              : (script.read ?? { data: null, error: null }),
          ).then(resolve, reject);
        },
      };
      return chain;
    },
    auth: {
      admin: {
        updateUserById(userId: string, attributes: unknown) {
          calls.push(`ban ${userId}`);
          bans.push(attributes);
          return Promise.resolve(script.ban ?? { data: {}, error: null });
        },
      },
    },
  };
  return {
    client: client as unknown as PrivilegedClient,
    calls,
    inserted,
    updates,
    bans,
  };
}

describe("the audit writer", () => {
  it("builds a row the audit_log mirror accepts for every staff action, with the table's own actor vocabulary", () => {
    for (const action of STAFF_AUDIT_ACTIONS) {
      const row = staffAuditRow({
        action,
        entityId: USER.id,
        actorId: OTHER_USER_ID,
        previous: { active: true },
        next: { active: false },
        reason: "a reason",
      });
      expect(auditLogInputSchema.safeParse(row).success, action).toBe(true);
      expect(row).toMatchObject({
        actor_type: "staff",
        actor_id: OTHER_USER_ID,
        action,
        entity_type: "staff_profile",
        entity_id: USER.id,
        external_ref: null,
      });
    }
  });

  it("records a refused sign-in with nobody as the actor and the address only as a hash", () => {
    const hash = emailHashFor(" Owner@Example.test ");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(emailHashFor("owner@example.test"));
    const row = staffAuditRow({
      action: "staff.sign_in_failed",
      entityId: hash,
      actorId: null,
      reason: "password_rejected",
    });
    expect(auditLogInputSchema.safeParse(row).success).toBe(true);
    expect(row).toEqual({
      actor_type: "system",
      actor_id: null,
      action: "staff.sign_in_failed",
      entity_type: "staff_profile",
      entity_id: hash,
      previous: null,
      next: null,
      reason: "password_rejected",
      external_ref: null,
    });
    expect(JSON.stringify(row)).not.toContain("example.test");
  });

  it("inserts one row into audit_log and says so", async () => {
    const fake = fakePrivileged();
    const result = await recordStaffAudit(fake.client, {
      action: "staff.sign_in",
      entityId: USER.id,
      actorId: USER.id,
      next: { aal: "aal2" },
    });
    expect(result).toEqual({ ok: true });
    expect(fake.calls).toEqual(["insert audit_log"]);
    expect(fake.inserted).toHaveLength(1);
    expect(fake.inserted[0]).toMatchObject({
      action: "staff.sign_in",
      next: { aal: "aal2" },
    });
  });

  it.each([
    ["the database refuses the row", { error: { code: "42501" } }, "42501"],
    ["the request itself fails", "throw", "request_failed"],
    ["the error carries no code", { error: { code: "" } }, "unknown"],
  ] as const)(
    "reports a failed write and logs the action and the code only when %s",
    async (_label, insert, code) => {
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      const fake = fakePrivileged({ insert });
      const result = await recordStaffAudit(fake.client, {
        action: "staff.sign_in_failed",
        entityId: emailHashFor("owner@example.test"),
        actorId: null,
        reason: "password_rejected",
      });
      expect(result).toEqual({ ok: false, code });
      expect(logged).toHaveBeenCalledTimes(1);
      const line = String(logged.mock.calls[0]?.[0]);
      expect(line).toBe(
        `[staff-audit] the audit row for staff.sign_in_failed was not written (${code})`,
      );
      expect(line).not.toContain(emailHashFor("owner@example.test"));
    },
  );
});

describe("revokeStaffAccess", () => {
  const change = { userId: USER.id, actorId: OTHER_USER_ID, reason: " left " };

  it.each([
    ["an empty reason", ""],
    ["a blank reason", "   "],
    ["a reason over 500 characters", "x".repeat(501)],
  ])("refuses %s before any request", async (_label, reason) => {
    const fake = fakePrivileged();
    expect(await revokeStaffAccess(fake.client, { ...change, reason })).toEqual(
      { ok: false, step: "validation", code: "reason_length" },
    );
    expect(fake.calls).toEqual([]);
  });

  it("reads the row, deactivates it, bans the Auth user and writes the audit row — in that order", async () => {
    const fake = fakePrivileged({
      read: { data: { active: true, revoked_at: null }, error: null },
    });
    const result = await revokeStaffAccess(fake.client, change);
    expect(result).toEqual({ ok: true, audit: { ok: true } });
    expect(fake.calls).toEqual([
      "select staff_profiles active, revoked_at",
      "update staff_profiles active,revoked_at,revoked_reason",
      `ban ${USER.id}`,
      "insert audit_log",
    ]);
    expect(fake.updates[0]).toEqual({
      active: false,
      revoked_at: expect.any(String),
      revoked_reason: "left",
    });
    expect(fake.bans).toEqual([{ ban_duration: REVOCATION_BAN_DURATION }]);
    expect(REVOCATION_BAN_DURATION).toBe("876600h");
    const row = fake.inserted[0];
    expect(auditLogInputSchema.safeParse(row).success).toBe(true);
    expect(row).toMatchObject({
      actor_type: "staff",
      actor_id: OTHER_USER_ID,
      action: "staff.access_revoked",
      entity_id: USER.id,
      previous: { active: true, revoked_at: null },
      next: { active: false, auth_ban: "set" },
      reason: "left",
    });
    expect((row?.next as { revoked_at: string }).revoked_at).toBe(
      fake.updates[0]?.revoked_at,
    );
  });

  it("records what the row really said before — a second revocation does not claim the member was active", async () => {
    const fake = fakePrivileged({
      read: {
        data: { active: false, revoked_at: "2026-10-01T00:00:00Z" },
        error: null,
      },
    });
    await revokeStaffAccess(fake.client, change);
    expect(fake.inserted[0]?.previous).toEqual({
      active: false,
      revoked_at: "2026-10-01T00:00:00Z",
    });
  });

  it("still writes the audit row when the Auth ban fails, says so in it, and reports the failed step", async () => {
    const fake = fakePrivileged({
      read: { data: { active: true, revoked_at: null }, error: null },
      ban: { error: { code: "unexpected_failure" } },
    });
    const result = await revokeStaffAccess(fake.client, change);
    expect(result).toEqual({
      ok: false,
      step: "auth",
      code: "unexpected_failure",
      audit: { ok: true },
    });
    expect(fake.calls.at(-1)).toBe("insert audit_log");
    expect(fake.inserted[0]?.next).toMatchObject({
      active: false,
      auth_ban: "failed",
    });
  });

  it("changes nothing when the member is not found or the row cannot be read or written", async () => {
    const missing = fakePrivileged({ read: { data: null, error: null } });
    expect(await revokeStaffAccess(missing.client, change)).toEqual({
      ok: false,
      step: "profile",
      code: "not_found",
    });
    expect(missing.calls).toEqual(["select staff_profiles active, revoked_at"]);

    const unreadable = fakePrivileged({
      read: { data: null, error: { code: "42501" } },
    });
    expect(await revokeStaffAccess(unreadable.client, change)).toEqual({
      ok: false,
      step: "profile",
      code: "42501",
    });
    expect(unreadable.calls).toHaveLength(1);

    const unwritable = fakePrivileged({
      read: { data: { active: true, revoked_at: null }, error: null },
      update: { error: { code: "23514" } },
    });
    expect(await revokeStaffAccess(unwritable.client, change)).toEqual({
      ok: false,
      step: "profile",
      code: "23514",
    });
    // No ban and no audit row for a change that was not made.
    expect(unwritable.calls).toEqual([
      "select staff_profiles active, revoked_at",
      "update staff_profiles active,revoked_at,revoked_reason",
    ]);
    expect(unwritable.inserted).toEqual([]);
  });
});

describe("changeStaffRole", () => {
  const change = {
    userId: USER.id,
    actorId: OTHER_USER_ID,
    role: "support" as const,
    reason: "moved teams",
  };

  it("refuses an unknown role or a missing reason before any request", async () => {
    const fake = fakePrivileged();
    expect(
      await changeStaffRole(fake.client, {
        ...change,
        role: "admin" as unknown as "support",
      }),
    ).toEqual({ ok: false, step: "validation", code: "role" });
    expect(
      await changeStaffRole(fake.client, { ...change, reason: "" }),
    ).toEqual({ ok: false, step: "validation", code: "reason_length" });
    expect(fake.calls).toEqual([]);
  });

  it("reads the old role, writes the new one and audits both", async () => {
    const fake = fakePrivileged({
      read: { data: { role: "operations" }, error: null },
    });
    expect(await changeStaffRole(fake.client, change)).toEqual({
      ok: true,
      audit: { ok: true },
    });
    expect(fake.calls).toEqual([
      "select staff_profiles role",
      "update staff_profiles role",
      "insert audit_log",
    ]);
    expect(fake.updates[0]).toEqual({ role: "support" });
    expect(fake.inserted[0]).toMatchObject({
      action: "staff.role_changed",
      previous: { role: "operations" },
      next: { role: "support" },
      reason: "moved teams",
      actor_id: OTHER_USER_ID,
      entity_id: USER.id,
    });
  });

  it("writes no audit row for a member that does not exist", async () => {
    const fake = fakePrivileged({ read: { data: null, error: null } });
    expect(await changeStaffRole(fake.client, change)).toEqual({
      ok: false,
      step: "profile",
      code: "not_found",
    });
    expect(fake.inserted).toEqual([]);
  });
});

describe("recordMfaEnrolled", () => {
  it("sets the informational column and writes the enrolment's audit row", async () => {
    const fake = fakePrivileged();
    expect(await recordMfaEnrolled(fake.client, USER.id)).toEqual({
      ok: true,
      audit: { ok: true },
    });
    expect(fake.calls).toEqual([
      "update staff_profiles mfa_enrolled_at",
      "insert audit_log",
    ]);
    expect(fake.inserted[0]).toMatchObject({
      action: "staff.mfa_enrolled",
      actor_id: USER.id,
      entity_id: USER.id,
      next: { mfa_enrolled_at: fake.updates[0]?.mfa_enrolled_at },
    });
  });

  it("writes the audit row even when the column could not be set — the factor exists either way", async () => {
    const fake = fakePrivileged({ update: { error: { code: "42703" } } });
    expect(await recordMfaEnrolled(fake.client, USER.id)).toEqual({
      ok: false,
      step: "profile",
      code: "42703",
      audit: { ok: true },
    });
    expect(fake.inserted).toHaveLength(1);
    expect(fake.inserted[0]).toMatchObject({
      action: "staff.mfa_enrolled",
      next: { mfa_enrolled_at: null },
    });
  });
});
