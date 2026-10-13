"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  clientAddressOf,
  consumeCodeAttempt,
  consumeLoginAttempt,
  normaliseEmail,
} from "@/lib/server/login-throttle";
import { recordMfaEnrolled } from "@/lib/server/staff-access";
import {
  emailHashFor,
  recordStaffAudit,
  type StaffAuditEntry,
} from "@/lib/server/staff-audit";
import {
  forgetStaffSessionCookies,
  getStaffAccess,
  staffCookieClient,
} from "@/lib/server/staff-session";
import { createPrivilegedClient } from "@/lib/server/supabase";
import { classifyAuthFailure } from "@/lib/staff/access";
import { ADMIN_HOME, loginUrlFor, safeNextPath } from "@/lib/staff/next-path";

import type { SignInErrorCode, VerifyErrorCode } from "../_components/strings";
import type { EnrolConfirmState, EnrolStartState } from "./enrol/enrol-state";

/**
 * The staff sign-in, verification, enrolment and sign-out actions — S1.2 (docs/TECH-ARCHITECTURE.md §5;
 * docs/SECURITY-CHECKLIST.md §3, §5, §9 rule 1). `verifyTotp`, `startEnrolment` and `confirmEnrolment`
 * re-authorise on their own through the server guard's decision (`getStaffAccess`) before they do anything, and
 * act only on the one decision that fits them (`verify`, `enrol`). `signIn` runs before any session exists: it
 * throttles, asks the Auth server and then takes the same decision. `signOut` only ends the caller's own
 * session. No action writes a password, code, secret or address to a log or a record: a refused password's audit
 * row carries the e-mail's SHA-256 only, every other row the staff user's id. Redirect targets come from
 * `safeNextPath`.
 */

const MAX_EMAIL = 254;
const MAX_PASSWORD = 256;
const TOTP_CODE = /^[0-9]{6}$/;
/** A factor id is a UUID. It goes into the Auth API's path, so nothing else is accepted back from the form. */
const FACTOR_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function field(formData: FormData, name: string, max: number): string {
  const value = formData.get(name);
  if (typeof value !== "string") return "";
  return value.length > max ? "" : value;
}

function loginWithError(code: SignInErrorCode, next: string): never {
  const base = loginUrlFor(next);
  redirect(`${base}${base.includes("?") ? "&" : "?"}error=${code}`);
}

function verifyUrl(next: string, error?: VerifyErrorCode): string {
  const query = new URLSearchParams({ next });
  if (error) query.set("error", error);
  return `/admin/login/verify?${query.toString()}`;
}

function enrolUrl(next: string): string {
  return `/admin/login/enrol?${new URLSearchParams({ next }).toString()}`;
}

/**
 * Writes one audit row. Best-effort — a sign-in is not refused on the audit alone — and never silent:
 * `recordStaffAudit` logs an insert that failed, and this logs the one case it cannot see, no privileged client
 * to write with. The log line carries the action and a fixed reason code, nothing else.
 */
async function writeAudit(entry: StaffAuditEntry): Promise<void> {
  const privileged = createPrivilegedClient();
  if (!privileged.ok) {
    console.error(
      `[staff-audit] the audit row for ${entry.action} was not written (${privileged.reason})`,
    );
    return;
  }
  await recordStaffAudit(privileged.client, entry);
}

/** The audit reason of a refused password step: a closed vocabulary, never a string taken from the response. */
function refusalReason(code: string | undefined): string {
  if (code === "invalid_credentials") return "password_rejected";
  if (code === "user_banned") return "user_banned";
  if (code === "email_not_confirmed") return "email_not_confirmed";
  return "refused";
}

/** Step 1: e-mail and password. Throttled before the password is checked; the result is never "signed in". */
export async function signIn(formData: FormData): Promise<void> {
  const next = safeNextPath(formData.get("next"));
  // One spelling for every sink: the throttle key, the audit hash and the address the Auth server is asked about.
  const email = normaliseEmail(field(formData, "email", MAX_EMAIL));
  const password = field(formData, "password", MAX_PASSWORD);
  if (email === "" || password === "") loginWithError("credentials", next);

  const ip = clientAddressOf(await headers());
  const throttle = await consumeLoginAttempt({ email, ip });
  if (!throttle.ok)
    loginWithError(
      throttle.reason === "rate_limited" ? "throttled" : "unavailable",
      next,
    );

  const client = await staffCookieClient();
  if (!client.ok) loginWithError("unavailable", next);
  // Without a privileged client nothing about this attempt could be recorded or decided: refuse it.
  if (!createPrivilegedClient().ok) loginWithError("unavailable", next);

  const signedIn = await client.supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (signedIn.error) {
    // The Auth server not answering as itself — no connection, an unreadable answer, a 5xx, its own rate limit —
    // is not a refused password: nothing is recorded and the honest notice is shown.
    if (classifyAuthFailure(signedIn.error.status) === "unavailable")
      loginWithError("unavailable", next);
    // Refused. The page says one thing for every refusal, so it never tells a visitor whether an address is a
    // staff account, a revoked one (the Auth ban answers before the password is looked at) or neither. The audit
    // row — written before any session exists, and bounded by the throttle above — keeps the reason.
    await writeAudit({
      action: "staff.sign_in_failed",
      entityId: emailHashFor(email),
      actorId: null,
      reason: refusalReason(signedIn.error.code),
    });
    loginWithError("credentials", next);
  }

  // A password session exists now (aal1). Is this a staff account at all, and does it still have access?
  const { decision, supabase } = await getStaffAccess([]);
  switch (decision.kind) {
    case "not_staff":
      await supabase?.auth.signOut({ scope: "local" });
      await writeAudit({
        action: "staff.sign_in_failed",
        entityId: decision.userId,
        actorId: null,
        reason: "not_staff",
      });
      loginWithError("no_access", next);
    case "revoked":
      await supabase?.auth.signOut({ scope: "local" });
      await writeAudit({
        action: "staff.sign_in_failed",
        // The id of the staff row that is inactive; the e-mail hash when the Auth server refused the session itself.
        entityId: decision.userId ?? emailHashFor(email),
        actorId: null,
        reason: "access_revoked",
      });
      loginWithError("revoked", next);
    case "enrol":
      redirect(enrolUrl(next));
    case "verify":
      redirect(verifyUrl(next));
    case "allowed":
      // Already at aal2 (a verified session was still held in the cookies): nothing more to prove.
      redirect(next);
    case "unavailable":
      loginWithError("unavailable", next);
    case "login":
    case "forbidden":
      loginWithError("credentials", next);
  }
}

/**
 * Step 2: the TOTP code against the verified factor. Every well-formed code counts against the member before
 * the Auth server sees it; success promotes the session to aal2 and writes the audit row, a refused code writes
 * its own.
 */
export async function verifyTotp(formData: FormData): Promise<void> {
  const next = safeNextPath(formData.get("next"));
  const code = field(formData, "code", 16).replace(/\s+/g, "");

  const { decision, supabase } = await getStaffAccess([]);
  switch (decision.kind) {
    case "verify":
      break;
    case "allowed":
      redirect(next);
    case "enrol":
      redirect(enrolUrl(next));
    case "login":
      redirect(loginUrlFor(next));
    case "not_staff":
      await supabase?.auth.signOut({ scope: "local" });
      loginWithError("no_access", next);
    case "revoked":
      await supabase?.auth.signOut({ scope: "local" });
      loginWithError("revoked", next);
    case "forbidden":
      redirect(next);
    case "unavailable":
      redirect(verifyUrl(next, "unavailable"));
  }
  if (!supabase) redirect(verifyUrl(next, "unavailable"));
  if (!TOTP_CODE.test(code)) redirect(verifyUrl(next, "code"));

  // A stolen password must not buy an unbounded run of guesses: five codes per member per 15 minutes, counted
  // right or wrong, and refused when the counter cannot be consulted.
  const throttle = await consumeCodeAttempt(decision.userId);
  if (!throttle.ok)
    redirect(
      verifyUrl(
        next,
        throttle.reason === "rate_limited" ? "throttled" : "unavailable",
      ),
    );

  const factors = await supabase.auth.mfa.listFactors();
  if (factors.error) redirect(verifyUrl(next, "unavailable"));
  const factor = factors.data.totp[0];
  if (!factor) redirect(enrolUrl(next));

  const challenge = await supabase.auth.mfa.challenge({ factorId: factor.id });
  if (challenge.error) redirect(verifyUrl(next, "unavailable"));
  const verified = await supabase.auth.mfa.verify({
    factorId: factor.id,
    challengeId: challenge.data.id,
    code,
  });
  if (verified.error) {
    if (classifyAuthFailure(verified.error.status) === "unavailable")
      redirect(verifyUrl(next, "unavailable"));
    await writeAudit({
      action: "staff.sign_in_failed",
      entityId: decision.userId,
      actorId: decision.userId,
      reason: "code_rejected",
    });
    redirect(verifyUrl(next, "code"));
  }

  await writeAudit({
    action: "staff.sign_in",
    entityId: decision.userId,
    actorId: decision.userId,
    next: { aal: "aal2" },
  });
  redirect(next);
}

const QR_PLAIN_PREFIX = "data:image/svg+xml;utf-8,";

/**
 * The QR as a data URL an <img> can always decode. auth-js hands the Auth server's SVG back behind a plain
 * `data:image/svg+xml;utf-8,` prefix with the markup unescaped, where a `#` (a colour) would end the URL. The
 * markup is percent-encoded here, so the picture does not depend on what the SVG happens to contain; any other
 * form of data URL is passed through as it is.
 */
function qrDataUrl(qr: string): string {
  const svg = qr.startsWith(QR_PLAIN_PREFIX)
    ? qr.slice(QR_PLAIN_PREFIX.length)
    : qr;
  if (!svg.trimStart().startsWith("<")) return qr;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Enrolment, step 1: replaces any unverified TOTP factor with a fresh one and returns its QR and key to the
 * signed-in staff member's own browser — once; the form keeps them and nothing sends them back. Only a password
 * session of an active staff account that has no verified factor yet may enrol (the guard's `enrol` decision):
 * the first enrolment of an account is trust on first use (docs/THREAT-MODEL.md §5).
 */
export async function startEnrolment(
  nextValue: unknown,
): Promise<EnrolStartState> {
  const next = safeNextPath(nextValue);

  const { decision, supabase } = await getStaffAccess([]);
  switch (decision.kind) {
    case "enrol":
      break;
    case "allowed":
      redirect(next);
    case "verify":
      redirect(verifyUrl(next));
    case "login":
      redirect(loginUrlFor(next));
    case "not_staff":
      await supabase?.auth.signOut({ scope: "local" });
      loginWithError("no_access", next);
    case "revoked":
      await supabase?.auth.signOut({ scope: "local" });
      loginWithError("revoked", next);
    case "forbidden":
      redirect(next);
    case "unavailable":
      return { step: "start", error: "unavailable" };
  }
  if (!supabase) return { step: "start", error: "unavailable" };

  const factors = await supabase.auth.mfa.listFactors();
  if (factors.error) return { step: "start", error: "unavailable" };
  for (const stale of factors.data.all) {
    if (stale.factor_type === "totp" && stale.status === "unverified") {
      const removed = await supabase.auth.mfa.unenroll({ factorId: stale.id });
      if (removed.error) return { step: "start", error: "unavailable" };
    }
  }
  // The issuer is what the member's authenticator app shows beside the account: the studio's name — without it
  // the Auth server labels the entry with the host of the project's Site URL.
  const enrolled = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "Aalishaan Studio",
    issuer: "Aalishaan Studio",
  });
  if (enrolled.error) return { step: "start", error: "unavailable" };
  return {
    step: "verify",
    factorId: enrolled.data.id,
    qrCode: qrDataUrl(enrolled.data.totp.qr_code),
    secret: enrolled.data.totp.secret,
  };
}

/**
 * Enrolment, step 2: verifies the first code against the factor the start action created, which promotes the
 * session to aal2, records the enrolment and signs the member in. The form posts the factor's id and the code;
 * the Auth server accepts the id only for a factor of the signed-in member.
 */
export async function confirmEnrolment(
  _previous: EnrolConfirmState,
  formData: FormData,
): Promise<EnrolConfirmState> {
  const next = safeNextPath(formData.get("next"));
  const factorId = field(formData, "factorId", 64);
  const code = field(formData, "code", 16).replace(/\s+/g, "");

  const { decision, supabase } = await getStaffAccess([]);
  switch (decision.kind) {
    case "enrol":
      break;
    case "allowed":
      redirect(next);
    case "verify":
      redirect(verifyUrl(next));
    case "login":
      redirect(loginUrlFor(next));
    case "not_staff":
      await supabase?.auth.signOut({ scope: "local" });
      loginWithError("no_access", next);
    case "revoked":
      await supabase?.auth.signOut({ scope: "local" });
      loginWithError("revoked", next);
    case "forbidden":
      redirect(next);
    case "unavailable":
      return { error: "unavailable" };
  }
  if (!supabase) return { error: "unavailable" };
  if (!FACTOR_ID.test(factorId)) return { error: "unavailable" };
  if (!TOTP_CODE.test(code)) return { error: "code" };

  const challenge = await supabase.auth.mfa.challenge({ factorId });
  if (challenge.error) return { error: "unavailable" };
  const verified = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.data.id,
    code,
  });
  if (verified.error)
    return {
      error:
        classifyAuthFailure(verified.error.status) === "unavailable"
          ? "unavailable"
          : "code",
    };

  const privileged = createPrivilegedClient();
  if (privileged.ok) {
    await recordMfaEnrolled(privileged.client, decision.userId);
    await recordStaffAudit(privileged.client, {
      action: "staff.sign_in",
      entityId: decision.userId,
      actorId: decision.userId,
      next: { aal: "aal2" },
    });
  } else {
    console.error(
      `[staff-audit] the audit rows for staff.mfa_enrolled and staff.sign_in were not written (${privileged.reason})`,
    );
  }
  redirect(next);
}

/**
 * Ends this browser's session (the other sessions of the account are untouched) and returns to the sign-in. The
 * Auth server is asked first — the library reads the session's tokens from the cookies — and the cookies are then
 * deleted whatever it answered: the library keeps them when the session's token has expired and that server
 * cannot be reached. The deletion travels with this action's response, and while the Auth server does not answer
 * that response waits for the library's retries; what stays open then is docs/THREAT-MODEL.md §5 ("A sign-out
 * that cannot reach the Auth server"). A sign-out the Auth server did not confirm is logged, with no identifier.
 */
export async function signOut(): Promise<void> {
  const client = await staffCookieClient();
  if (client.ok) {
    let unconfirmed: string | null = null;
    try {
      const { error } = await client.supabase.auth.signOut({ scope: "local" });
      if (error && classifyAuthFailure(error.status) === "unavailable")
        unconfirmed = `status ${error.status ?? "none"}`;
    } catch {
      unconfirmed = "the call threw";
    }
    if (unconfirmed)
      console.error(
        `[staff-session] the Auth server did not confirm a sign-out (${unconfirmed}): the cookies are deleted, the session may still be valid there`,
      );
  }
  await forgetStaffSessionCookies();
  redirect(loginUrlFor(ADMIN_HOME));
}
