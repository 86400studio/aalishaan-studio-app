import type { Metadata } from "next";

import { PublicPage } from "@/components/shell/public-page";
import { PublicSite } from "@/components/shell/public-site";
import { Recovery } from "@/components/shell/recovery";
import { RECOVERY } from "@/content/public/pages";

/**
 * The root 404 — every unknown path outside the `(public)` group (the root layout has no shell of its own)
 * renders the designed recovery page inside the public shell, so the storefront's 404 is one page wherever
 * the miss happens. `/admin/**` misses render here too (the Admin shell is S1.9).
 */
export const metadata: Metadata = {
  title: RECOVERY["404"].title,
  description: RECOVERY["404"].description,
};

export default function RootNotFound() {
  return (
    <PublicSite>
      <PublicPage variant="recovery">
        <Recovery kind="404" />
      </PublicPage>
    </PublicSite>
  );
}
