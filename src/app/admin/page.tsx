import { guardAdminPage } from "@/lib/server/staff-session";
import { requiredAreasFor } from "@/lib/staff/permissions";

import { AccessState, SignOutForm } from "./_components/access-state";
import { ADMIN_LABELS, SHELL } from "./_components/strings";

/**
 * The blank protected shell — S1.2 (docs/ROADMAP.md S1.2 "a blank protected /admin shell"). The guard runs
 * before anything is rendered; the page shows who is signed in and nothing else. The seven-section shell with
 * Orders as the landing page is S1.9 (docs/TECH-ARCHITECTURE.md §3b).
 */
export default async function AdminHome() {
  const gate = await guardAdminPage({
    required: requiredAreasFor("/admin") ?? ["settings"],
    returnTo: "/admin",
  });
  if (!gate.ok) return <AccessState gate={gate} />;
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-12 text-center">
      <div>
        <h1>{ADMIN_LABELS.brand}</h1>
        <p className="mt-6">
          {SHELL.signedInAs} {gate.staff.displayName} · {gate.staff.roleLabel}
        </p>
        <SignOutForm />
      </div>
    </main>
  );
}
