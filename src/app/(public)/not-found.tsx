import type { Metadata } from "next";

import { PublicPage } from "@/components/shell/public-page";
import { Recovery } from "@/components/shell/recovery";
import { RECOVERY } from "@/content/public/pages";

/** The designed 404 inside the public shell (prototype/404.html; docs/TECH-ARCHITECTURE.md §3a). */
export const metadata: Metadata = {
  title: RECOVERY["404"].title,
  description: RECOVERY["404"].description,
};

export default function PublicNotFound() {
  return (
    <PublicPage variant="recovery">
      <Recovery kind="404" />
    </PublicPage>
  );
}
