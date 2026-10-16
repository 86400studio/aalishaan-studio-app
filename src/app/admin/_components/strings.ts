/**
 * The staff-facing strings of S1.2 (docs/content/new-strings.md, rows NS-10 and NS-19–NS-25; decision D-24 —
 * honest technical states, which ship on the delivery lead's approval with owner review at the next check-in;
 * the register's §4 records the approval). Labels the final Admin contains are quoted exactly from it
 * (docs/content/locked-facts.md §9a); everything else is registered in the register before it is used here.
 * Nothing is invented inline in a page.
 */

/** Labels the final Admin contains (quoted exactly). */
export const ADMIN_LABELS = {
  brand: "Aalishaan Studio",
  staffAndAccess: "Staff & Access",
  support: "Support",
  refunds: "Refunds",
  accessRestricted: "Access restricted",
} as const;

/** NS-19 — the sign-in page. */
export const SIGN_IN = {
  heading: "Sign in",
  email: "Email",
  password: "Password",
  submit: "Sign in",
  errors: {
    credentials: "Check your email address and password.",
    throttled: "Too many sign-in attempts. Wait 15 minutes and try again.",
    unavailable:
      "Sign-in is not available right now. Try again in a few minutes.",
    no_access: "This account has no studio access.",
    revoked: "Your studio access has been revoked.",
  },
} as const;

export type SignInErrorCode = keyof typeof SIGN_IN.errors;

export function isSignInErrorCode(value: unknown): value is SignInErrorCode {
  return typeof value === "string" && Object.hasOwn(SIGN_IN.errors, value);
}

/** NS-20 — the two-step verification page. */
export const VERIFY = {
  heading: "Two-step verification",
  code: "Code from your authenticator app",
  submit: "Verify",
  errors: {
    code: "That code did not work. Enter the current code from your authenticator app.",
    throttled: "Too many codes tried. Wait 15 minutes and try again.",
    unavailable:
      "Verification is not available right now. Try again in a few minutes.",
  },
} as const;

export type VerifyErrorCode = keyof typeof VERIFY.errors;

export function isVerifyErrorCode(value: unknown): value is VerifyErrorCode {
  return typeof value === "string" && Object.hasOwn(VERIFY.errors, value);
}

/** NS-21 — the enrolment page. */
export const ENROL = {
  heading: "Set up two-step verification",
  intro:
    "Every studio account uses an authenticator app. Scan the code with the app, or enter the key by hand, then enter the six-digit code the app shows.",
  start: "Start setup",
  qrAlt: "QR code for your authenticator app",
  secretLabel: "Key for manual entry",
  code: "Code from your authenticator app",
  confirm: "Confirm",
  errors: {
    code: "That code did not work. Enter the current code from your authenticator app.",
    unavailable:
      "Setup is not available right now. Try again in a few minutes.",
  },
} as const;

/** NS-22 — the blank shell. */
export const SHELL = {
  signedInAs: "Signed in as",
  signOut: "Sign out",
} as const;

/** NS-23 — the denied state (heading from the final Admin: "Access restricted"). */
export const DENIED = {
  body: "Your role cannot open this page.",
  back: "Return to your workspace",
} as const;

/** NS-24 — the revoked state. */
export const REVOKED = {
  heading: "Access revoked",
  body: "Your studio access has been revoked. Sign out, and contact the owner if you think this is a mistake.",
} as const;

/** NS-19 (no_access) rendered as a page state for a signed-in Auth account that is not a staff account. */
export const NOT_STAFF = {
  heading: "No studio access",
  body: "This account has no studio access. Sign out, and contact the owner if you expected access.",
} as const;

/** NS-25 — a dependency the guard could not consult. */
export const UNAVAILABLE = {
  heading: "Not available right now",
  body: "The studio workspace is not available right now. Try again in a few minutes.",
} as const;

/** NS-10 — the honest state of a section whose sprint has not merged (drafted here for the two S1.2 routes). */
export const ARRIVES_IN = {
  staff: "This section arrives with sprint S2.1.",
  support: "This section arrives with sprint S2.13.",
  refunds: "Refunds arrive with sprint S2.4.",
} as const;
