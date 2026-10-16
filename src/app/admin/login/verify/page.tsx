import { redirect } from "next/navigation";

import { getStaffAccess } from "@/lib/server/staff-session";
import { loginUrlFor, safeNextPath } from "@/lib/staff/next-path";

import { AccessState, SignOutForm } from "../../_components/access-state";
import {
  ADMIN_LABELS,
  VERIFY,
  isVerifyErrorCode,
} from "../../_components/strings";
import { verifyTotp } from "../actions";

/**
 * The second step of the staff sign-in — S1.2: the code from the authenticator app against the member's verified
 * TOTP factor. Reachable only with a password session of an active staff account that holds a verified factor
 * (the guard's `verify` decision); every other state is sent where it belongs.
 */
export default async function VerifyPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{
    next?: string | string[];
    error?: string | string[];
  }>;
}>) {
  const params = await searchParams;
  const next = safeNextPath(
    Array.isArray(params.next) ? params.next[0] : params.next,
  );
  const error = Array.isArray(params.error) ? params.error[0] : params.error;

  const { decision } = await getStaffAccess([]);
  switch (decision.kind) {
    case "verify":
      break;
    case "allowed":
    case "forbidden":
      redirect(next);
    case "enrol":
      redirect(`/admin/login/enrol?next=${encodeURIComponent(next)}`);
    case "login":
      redirect(loginUrlFor(next));
    case "revoked":
      return (
        <AccessState gate={{ ok: false, state: "revoked", staff: null }} />
      );
    case "not_staff":
      return (
        <AccessState gate={{ ok: false, state: "not_staff", staff: null }} />
      );
    case "unavailable":
      return (
        <AccessState gate={{ ok: false, state: "unavailable", staff: null }} />
      );
  }

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-12 text-center">
      <div>
        <p>{ADMIN_LABELS.brand}</p>
        <h1 className="mt-2">{VERIFY.heading}</h1>
        {isVerifyErrorCode(error) ? (
          <p className="mt-6" role="alert">
            {VERIFY.errors[error]}
          </p>
        ) : null}
        <form action={verifyTotp} className="mt-6 grid gap-4 text-left">
          <input type="hidden" name="next" value={next} />
          <label className="grid gap-1">
            <span>{VERIFY.code}</span>
            <input
              className="border px-3 py-2"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              required
              maxLength={6}
            />
          </label>
          <button type="submit" className="border px-4 py-2">
            {VERIFY.submit}
          </button>
        </form>
        {/* The way out of a password-only session: the wrong account, or an authenticator that is not at hand. */}
        <SignOutForm />
      </div>
    </main>
  );
}
