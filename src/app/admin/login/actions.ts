"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  clientAddressOf,
  consumeLoginAttempt,
} from "@/lib/server/login-throttle";
import { recordMfaEnrolled } from "@/lib/server/staff-access";
import { emailHashFor, recordStaffAudit } from "@/lib/server/staff-audit";
import { getStaffAccess, staffCookieClient } from "@/lib/server/staff-session";
import { createPrivilegedClient } from "@/lib/server/supabase";
import { ADMIN_HOME, loginUrlFor, safeNextPath } from "@/lib/staff/next-path";

import type { SignInErrorCode, VerifyErrorCode } from "../_components/strings";
import type { EnrolState } from "./enrol/enrol-state";

/**
 * The staff sign-in, verification, enrolment and sign-out actions — S1.2 (docs/TECH-ARCHITECTURE.md §5;
 * docs/SECURITY-CHECKLIST.md §3, §5, §9 rule 1). Every action re-authorises on its own through the server guard
 * (`getStaffAccess`) before it does anything, refuses with an honest code when it cannot, and never writes a
 * password, code, secret or address to a log or a record (a failed sign-in's audit row carries the e-mail's
 * SHA-256 only). Redirect targets come from `safeNextPath`.
 */

const MAX_EMAIL = 254;
const MAX_PASSWORD = 256;
const TOTP_CODE = /^[0-9]{6}$/;

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

/** Step 1: e-mail and password. Throttled before the password is checked; the result is never "signed in". */
export async function signIn(formData: FormData): Promise<void> {
  const next = safeNextPath(formData.get("next"));
  const email = field(formData, "email", MAX_EMAIL).trim();
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
  const privileged = createPrivilegedClient();
  if (!privileged.ok) loginWithError("unavailable", next);

  const signedIn = await client.supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (signedIn.error) {
    const status = signedIn.error.status ?? 0;
    if (status >= 500 || status === 0) loginWithError("unavailable", next);
    await recordStaffAudit(privileged.client, {
      action: "staff.sign_in_failed",
      entityId: emailHashFor(email),
      actorId: null,
      reason: "password_rejected",
    });
    loginWithError("credentials", next);
  }

  // A password session exists now (aal1). Is this a staff account at all, and does it still have access?
  const { decision, supabase } = await getStaffAccess([]);
  switch (decision.kind) {
    case "not_staff":
      await supabase?.auth.signOut({ scope: "local" });
      loginWithError("no_access", next);
    case "revoked":
      await supabase?.auth.signOut({ scope: "local" });
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

/** Step 2: the TOTP code against the verified factor. Success promotes the session to aal2 and writes the audit row. */
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
    const status = verified.error.status ?? 0;
    redirect(
      verifyUrl(next, status >= 500 || status === 0 ? "unavailable" : "code"),
    );
  }

  const privileged = createPrivilegedClient();
  if (privileged.ok)
    await recordStaffAudit(privileged.client, {
      action: "staff.sign_in",
      entityId: decision.userId,
      actorId: decision.userId,
      next: { aal: "aal2" },
    });
  redirect(next);
}

const QR_PREFIX = "data:image/svg+xml;utf-8,";

/**
 * Enrolment, in two intents of one form: `start` replaces any unverified TOTP factor with a fresh one and returns
 * its QR and key to the signed-in staff member's own browser; `confirm` verifies the first code, which promotes
 * the session to aal2, records the enrolment and signs the member in. Only a password session of an active staff
 * account that has no verified factor yet may enrol (the guard's `enrol` decision).
 */
export async function enrol(
  previous: EnrolState,
  formData: FormData,
): Promise<EnrolState> {
  const next = safeNextPath(formData.get("next"));
  const intent = formData.get("intent");

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
      return { ...previous, error: "unavailable" };
  }
  if (!supabase) return { ...previous, error: "unavailable" };

  if (intent === "start") {
    const factors = await supabase.auth.mfa.listFactors();
    if (factors.error) return { step: "start", error: "unavailable" };
    for (const stale of factors.data.all) {
      if (stale.factor_type === "totp" && stale.status === "unverified") {
        const removed = await supabase.auth.mfa.unenroll({
          factorId: stale.id,
        });
        if (removed.error) return { step: "start", error: "unavailable" };
      }
    }
    const enrolled = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Aalishaan Studio",
    });
    if (enrolled.error) return { step: "start", error: "unavailable" };
    const qr = enrolled.data.totp.qr_code;
    return {
      step: "verify",
      factorId: enrolled.data.id,
      qrCode: qr.startsWith("data:") ? qr : `${QR_PREFIX}${qr}`,
      secret: enrolled.data.totp.secret,
      error: null,
    };
  }

  if (intent === "confirm" && previous.step === "verify") {
    const code = field(formData, "code", 16).replace(/\s+/g, "");
    if (!TOTP_CODE.test(code)) return { ...previous, error: "code" };
    const challenge = await supabase.auth.mfa.challenge({
      factorId: previous.factorId,
    });
    if (challenge.error) return { ...previous, error: "unavailable" };
    const verified = await supabase.auth.mfa.verify({
      factorId: previous.factorId,
      challengeId: challenge.data.id,
      code,
    });
    if (verified.error) {
      const status = verified.error.status ?? 0;
      return {
        ...previous,
        error: status >= 500 || status === 0 ? "unavailable" : "code",
      };
    }
    const privileged = createPrivilegedClient();
    if (privileged.ok) {
      await recordMfaEnrolled(privileged.client, decision.userId);
      await recordStaffAudit(privileged.client, {
        action: "staff.sign_in",
        entityId: decision.userId,
        actorId: decision.userId,
        next: { aal: "aal2", first_enrolment: true },
      });
    }
    redirect(next);
  }

  return { step: "start", error: null };
}

/** Ends this browser's session (the other sessions of the account are untouched) and returns to the sign-in. */
export async function signOut(): Promise<void> {
  const client = await staffCookieClient();
  if (client.ok) await client.supabase.auth.signOut({ scope: "local" });
  redirect(loginUrlFor(ADMIN_HOME));
}
