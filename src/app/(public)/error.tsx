"use client";

import { PublicPage } from "@/components/shell/public-page";
import { Recovery } from "@/components/shell/recovery";
import { RECOVERY } from "@/content/public/pages";

/**
 * The designed 500 (prototype/500.html) for a render error on a public route: the recovery layout with the
 * "temporary interruption" copy. Nothing of the error reaches the page (SECURITY-CHECKLIST §6: error
 * responses expose no internals); the title is set from the component because an error boundary cannot
 * export metadata.
 */
export default function PublicError() {
  return (
    <>
      <title>{RECOVERY["500"].title}</title>
      <meta name="description" content={RECOVERY["500"].description} />
      <PublicPage variant="recovery">
        <Recovery kind="500" />
      </PublicPage>
    </>
  );
}
