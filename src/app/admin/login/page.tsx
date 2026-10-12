import { redirect } from "next/navigation";

import { getStaffAccess } from "@/lib/server/staff-session";
import { safeNextPath } from "@/lib/staff/next-path";

import {
  ADMIN_LABELS,
  SIGN_IN,
  isSignInErrorCode,
} from "../_components/strings";
import { signIn } from "./actions";

/**
 * The staff sign-in — S1.2 (docs/TECH-ARCHITECTURE.md §3b `/admin/login`; D-32e: the prototype's sample access
 * code and owner-only sample session are not built). E-mail and password; the server action throttles, signs
 * in and routes to verification or enrolment. A browser that already holds a verified staff session is sent on.
 */
export default async function SignInPage({
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
  if (decision.kind === "allowed") redirect(next);

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-12 text-center">
      <div>
        <p>{ADMIN_LABELS.brand}</p>
        <h1 className="mt-2">{SIGN_IN.heading}</h1>
        {isSignInErrorCode(error) ? (
          <p className="mt-6" role="alert">
            {SIGN_IN.errors[error]}
          </p>
        ) : null}
        <form action={signIn} className="mt-6 grid gap-4 text-left">
          <input type="hidden" name="next" value={next} />
          <label className="grid gap-1">
            <span>{SIGN_IN.email}</span>
            <input
              className="border px-3 py-2"
              name="email"
              type="email"
              autoComplete="username"
              required
              maxLength={254}
            />
          </label>
          <label className="grid gap-1">
            <span>{SIGN_IN.password}</span>
            <input
              className="border px-3 py-2"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={256}
            />
          </label>
          <button type="submit" className="border px-4 py-2">
            {SIGN_IN.submit}
          </button>
        </form>
      </div>
    </main>
  );
}
