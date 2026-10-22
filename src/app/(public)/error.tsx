"use client";

import { useEffect } from "react";

import { PublicPage } from "@/components/shell/public-page";
import { Recovery } from "@/components/shell/recovery";
import { RECOVERY } from "@/content/public/pages";
import { reportToSentry } from "@/lib/report-error";

/**
 * The designed 500 (prototype/500.html) for a render error on a public route: the recovery layout with the
 * "temporary interruption" copy. The error is reported to Sentry exactly as global-error.tsx reports a
 * root-layout failure (Next sends an explicit boundary's error to the console only); nothing of it reaches the
 * page (SECURITY-CHECKLIST §6: error responses expose no internals). The title is set from the component
 * because an error boundary cannot export metadata.
 */
export default function PublicError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    reportToSentry(error);
  }, [error]);

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
