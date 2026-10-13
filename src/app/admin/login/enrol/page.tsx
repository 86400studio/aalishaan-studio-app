import { redirect } from "next/navigation";

import { getStaffAccess } from "@/lib/server/staff-session";
import { loginUrlFor, safeNextPath } from "@/lib/staff/next-path";

import { AccessState, SignOutForm } from "../../_components/access-state";
import { ADMIN_LABELS, ENROL } from "../../_components/strings";
import { EnrolForm } from "./enrol-form";

/**
 * TOTP enrolment — S1.2 (MFA is mandatory: an active staff account without a verified factor lands here after
 * its password sign-in and nowhere else). The form is a client component only because the QR and the key come
 * back from the start action and must be shown before the confirm action runs; it imports the two actions,
 * never a server module or the SDK.
 */
export default async function EnrolPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ next?: string | string[] }> }>) {
  const params = await searchParams;
  const next = safeNextPath(
    Array.isArray(params.next) ? params.next[0] : params.next,
  );

  const { decision } = await getStaffAccess([]);
  switch (decision.kind) {
    case "enrol":
      break;
    case "allowed":
    case "forbidden":
      redirect(next);
    case "verify":
      redirect(`/admin/login/verify?next=${encodeURIComponent(next)}`);
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
        <h1 className="mt-2">{ENROL.heading}</h1>
        <p className="mt-6">{ENROL.intro}</p>
        <EnrolForm next={next} />
        {/* The way out of a password-only session, for a member who signed in with the wrong account. */}
        <SignOutForm />
      </div>
    </main>
  );
}
