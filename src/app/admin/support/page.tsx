import { guardAdminPage } from "@/lib/server/staff-session";
import {
  SUPPORT_REFUNDS_VIEW,
  requiredAreasFor,
} from "@/lib/staff/permissions";

import { AccessState, SignOutForm } from "../_components/access-state";
import { ADMIN_LABELS, ARRIVES_IN } from "../_components/strings";

/**
 * Support — `support` area (Owner, Customer support); `?view=refunds` is Support › Refunds, the finance area
 * (owner-only; docs/TECH-ARCHITECTURE.md §3b, D-30, D-35). S1.2 lays the guarded route and its finance view so
 * the finance boundary is a real page with allowed and denied tests; the requests table, the tabs and the refund
 * record are S2.4 / S2.13. Until then each view states that honestly (NS-10) and holds no data.
 */
export default async function SupportPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ view?: string | string[] }> }>) {
  const { view: rawView } = await searchParams;
  const view = rawView === SUPPORT_REFUNDS_VIEW ? SUPPORT_REFUNDS_VIEW : null;
  const gate = await guardAdminPage({
    required: requiredAreasFor("/admin/support", view) ?? ["settings"],
    returnTo: view ? `/admin/support?view=${view}` : "/admin/support",
  });
  if (!gate.ok) return <AccessState gate={gate} />;
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-12 text-center">
      <div>
        <h1>{view ? ADMIN_LABELS.refunds : ADMIN_LABELS.support}</h1>
        <p className="mt-6">{view ? ARRIVES_IN.refunds : ARRIVES_IN.support}</p>
        <p className="mt-6">
          <a href="/admin">{ADMIN_LABELS.brand}</a>
        </p>
        <SignOutForm />
      </div>
    </main>
  );
}
