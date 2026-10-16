import type { PageGate } from "@/lib/server/staff-session";

import { signOut } from "../login/actions";
import {
  ADMIN_LABELS,
  DENIED,
  NOT_STAFF,
  REVOKED,
  SHELL,
  UNAVAILABLE,
} from "./strings";

/**
 * The honest states a protected page renders instead of its content — S1.2 (docs/TECH-ARCHITECTURE.md §3b
 * "Access restricted" row; docs/content/new-strings.md NS-23–NS-25). Nothing protected is read or shown; the
 * denied state names no record. The sign-out form posts to the server action, which ends the cookie session.
 */
export function AccessState({
  gate,
}: Readonly<{ gate: Extract<PageGate, { ok: false }> }>) {
  switch (gate.state) {
    case "forbidden":
      return (
        <main className="grid min-h-dvh place-items-center px-4 py-12 text-center">
          <div>
            <h1>{ADMIN_LABELS.accessRestricted}</h1>
            <p className="mt-6">{DENIED.body}</p>
            <p className="mt-6">
              <a href="/admin" className="underline">
                {DENIED.back}
              </a>
            </p>
          </div>
        </main>
      );
    case "revoked":
      return (
        <main className="grid min-h-dvh place-items-center px-4 py-12 text-center">
          <div>
            <h1>{REVOKED.heading}</h1>
            <p className="mt-6">{REVOKED.body}</p>
            <SignOutForm />
          </div>
        </main>
      );
    case "not_staff":
      return (
        <main className="grid min-h-dvh place-items-center px-4 py-12 text-center">
          <div>
            <h1>{NOT_STAFF.heading}</h1>
            <p className="mt-6">{NOT_STAFF.body}</p>
            <SignOutForm />
          </div>
        </main>
      );
    case "unavailable":
      return (
        <main className="grid min-h-dvh place-items-center px-4 py-12 text-center">
          <div>
            <h1>{UNAVAILABLE.heading}</h1>
            <p className="mt-6">{UNAVAILABLE.body}</p>
            {/* The way out while nothing can be checked: a member on a shared device can still end the session. */}
            <SignOutForm />
          </div>
        </main>
      );
  }
}

export function SignOutForm() {
  return (
    <form action={signOut} className="mt-6">
      <button type="submit" className="border px-4 py-2">
        {SHELL.signOut}
      </button>
    </form>
  );
}
