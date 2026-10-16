import type { ReactNode } from "react";

import { PublicSite } from "@/components/shell/public-site";

/** The public shell for every storefront route (docs/TECH-ARCHITECTURE.md §3: the Public shell). */
export default function PublicLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return <PublicSite>{children}</PublicSite>;
}
