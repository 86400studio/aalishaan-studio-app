import { guardAdminPage } from "@/lib/server/staff-session";
import { requiredAreasFor } from "@/lib/staff/permissions";

import { AccessState, SignOutForm } from "../_components/access-state";
import { ADMIN_LABELS, ARRIVES_IN } from "../_components/strings";

/**
 * Staff & Access — owner-only (`settings`; docs/TECH-ARCHITECTURE.md §3b, D-35). S1.2 lays the guarded route so
 * the owner-only boundary is a real page with allowed and denied tests; the section itself (directory,
 * invitations, presets, backup status) is S2.1. Until then the page states that honestly (NS-10) and holds no data.
 */
export default async function StaffAccessPage() {
  const gate = await guardAdminPage({
    required: requiredAreasFor("/admin/staff") ?? ["settings"],
    returnTo: "/admin/staff",
  });
  if (!gate.ok) return <AccessState gate={gate} />;
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-12 text-center">
      <div>
        <h1>{ADMIN_LABELS.staffAndAccess}</h1>
        <p className="mt-6">{ARRIVES_IN.staff}</p>
        <p className="mt-6">
          <a href="/admin">{ADMIN_LABELS.brand}</a>
        </p>
        <SignOutForm />
      </div>
    </main>
  );
}
