// @ts-check
/**
 * The three TEST staff fixtures of S1.2 (docs/ROADMAP.md S1.2 "TEST staff users (owner, Operations, Customer
 * support) for the Playwright auth-setup project"; docs/testing-setup/SETUP-CHECKLIST.md Part 2). Pure helpers
 * shared by `pnpm db:test:staff-users`, the integration suite and the Playwright harness: the roles, the env names
 * that hold each fixture's address and password (values never printed), the fake-address rule and the plan.
 *
 * Every address must end in `@example.test` — a reserved domain that can never reach a real person (RFC 2606) —
 * so a mis-set name can never create a real account or send mail to someone. Nothing here touches a network.
 */

export const STAFF_FIXTURES = Object.freeze([
  Object.freeze({
    role: "owner_admin",
    key: "OWNER",
    displayName: "Owner (TEST)",
  }),
  Object.freeze({
    role: "operations",
    key: "OPERATIONS",
    displayName: "Operations (TEST)",
  }),
  Object.freeze({
    role: "support",
    key: "SUPPORT",
    displayName: "Customer support (TEST)",
  }),
]);

export const STAFF_ROLES = Object.freeze(STAFF_FIXTURES.map((f) => f.role));

/**
 * @param {unknown} value
 * @returns {value is "owner_admin" | "operations" | "support"}
 */
export function isFixtureRole(value) {
  return (
    typeof value === "string" &&
    /** @type {readonly string[]} */ (STAFF_ROLES).includes(value)
  );
}

/** The only domain a fixture address may use. */
export const FIXTURE_ADDRESS_SUFFIX = "@example.test";
export const MIN_FIXTURE_PASSWORD = 12;

/** The reason the tool writes when it revokes and restores a fixture (also the audit row's reason). */
export const REVOCATION_EXERCISE_REASON =
  "S1.2 TEST revocation exercise (pnpm db:test:staff-users --revoke)";
export const REVOCATION_BAN_DURATION = "876600h";

/**
 * @param {string} key
 * @returns {{ email: string, password: string }}
 */
export function staffEnvNames(key) {
  return {
    email: `E2E_STAFF_${key}_EMAIL`,
    password: `E2E_STAFF_${key}_PASSWORD`,
  };
}

/** Every name the harness needs, in a fixed order. */
export const STAFF_ENV_NAMES = Object.freeze(
  STAFF_FIXTURES.flatMap((f) => {
    const names = staffEnvNames(f.key);
    return [names.email, names.password];
  }),
);

/**
 * @typedef {{ role: string, key: string, displayName: string, email: string, password: string }} StaffFixture
 */

/**
 * Reads the six names and refuses, names only, anything missing, a password shorter than 12 characters or an
 * address outside the reserved fixture domain. The password values never leave the returned object.
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @returns {{ ok: true, fixtures: StaffFixture[] } | { ok: false, reasons: string[] }}
 */
export function readStaffFixtures(env) {
  /** @type {string[]} */
  const reasons = [];
  /** @type {StaffFixture[]} */
  const fixtures = [];
  const seen = new Set();
  for (const fixture of STAFF_FIXTURES) {
    const names = staffEnvNames(fixture.key);
    const email = env[names.email];
    const password = env[names.password];
    if (typeof email !== "string" || email.trim() === "")
      reasons.push(`${names.email} is not set`);
    else {
      const normalised = email.trim().toLowerCase();
      if (
        !normalised.endsWith(FIXTURE_ADDRESS_SUFFIX) ||
        !/^[a-z0-9._+-]+@/.test(normalised)
      )
        reasons.push(
          `${names.email} must be an obviously fake address ending in ${FIXTURE_ADDRESS_SUFFIX} (a reserved domain)`,
        );
      else if (seen.has(normalised))
        reasons.push(`${names.email} repeats another fixture's address`);
      seen.add(normalised);
    }
    if (typeof password !== "string" || password.trim() === "")
      reasons.push(`${names.password} is not set`);
    else if (password.length < MIN_FIXTURE_PASSWORD)
      reasons.push(
        `${names.password} is shorter than ${MIN_FIXTURE_PASSWORD} characters`,
      );
    if (typeof email === "string" && typeof password === "string")
      fixtures.push({
        ...fixture,
        email: email.trim().toLowerCase(),
        password,
      });
  }
  return reasons.length > 0 ? { ok: false, reasons } : { ok: true, fixtures };
}

/**
 * The command line of `pnpm db:test:staff-users`. Nothing is written without `--apply`; `--revoke` and
 * `--restore` name one fixture role and exclude each other.
 * @param {readonly string[]} argv
 * @returns {{ apply: boolean, resetMfa: boolean, revoke: string | null, restore: string | null, errors: string[] }}
 */
export function parseStaffArgs(argv) {
  /** @type {string[]} */
  const errors = [];
  let revoke = null;
  let restore = null;
  let resetMfa = false;
  let apply = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") apply = true;
    else if (arg === "--reset-mfa") resetMfa = true;
    else if (arg === "--revoke" || arg === "--restore") {
      const role = argv[i + 1];
      if (!isFixtureRole(role)) {
        errors.push(`${arg} needs one of: ${STAFF_ROLES.join(", ")}`);
      } else if (arg === "--revoke") revoke = role;
      else restore = role;
      i += 1;
    } else if (arg.startsWith("--revoke=") || arg.startsWith("--restore=")) {
      const [flag, role] = arg.split("=");
      if (!isFixtureRole(role))
        errors.push(`${flag} needs one of: ${STAFF_ROLES.join(", ")}`);
      else if (flag === "--revoke") revoke = role;
      else restore = role;
    } else errors.push(`unknown argument ${arg}`);
  }
  if (revoke && restore)
    errors.push("--revoke and --restore exclude each other");
  if (revoke === "owner_admin" || restore === "owner_admin")
    errors.push(
      "the owner fixture is never revoked by the tool (the recovery route is exercised by hand)",
    );
  return { apply, resetMfa, revoke, restore, errors };
}

/**
 * @typedef {{ id: string, email: string }} ExistingUser
 * @typedef {{ user_id: string, role: string, display_name: string, active: boolean, mfa_enrolled_at?: string | null, revoked_at?: string | null }} ExistingProfile
 */

/**
 * What the tool would do per fixture, from the users and profiles it read: create the Auth user or keep it;
 * insert the profile, keep an identical one, or report a differing one and leave it alone (a role or name on
 * TEST is never overwritten blindly, as the seed does for the catalogue).
 * @param {StaffFixture[]} fixtures
 * @param {ExistingUser[]} users
 * @param {ExistingProfile[]} profiles
 */
export function planStaffUsers(fixtures, users, profiles) {
  const byEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));
  const byId = new Map(profiles.map((p) => [p.user_id, p]));
  return fixtures.map((fixture) => {
    const user = byEmail.get(fixture.email) ?? null;
    const profile = user ? (byId.get(user.id) ?? null) : null;
    /** @type {"create" | "exists"} */
    const userAction = user ? "exists" : "create";
    /** @type {"insert" | "unchanged" | "differs"} */
    let profileAction = "insert";
    if (profile) {
      profileAction =
        profile.role === fixture.role &&
        profile.display_name === fixture.displayName
          ? "unchanged"
          : "differs";
    }
    return {
      fixture,
      userId: user?.id ?? null,
      userAction,
      profile,
      profileAction,
    };
  });
}
