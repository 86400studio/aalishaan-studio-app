import type { ReactNode } from "react";

import { PublicSite } from "@/components/shell/public-site";
// The storefront's component sheets, in the prototype's cascade order, after the root layout's globals.css: they
// load with the public shell only, so no Admin page downloads them (docs/DESIGN.md §2).
import "@/styles/storefront.css";
import "@/styles/home.css";
import "@/styles/utility.css";

/** The public shell for every storefront route (docs/TECH-ARCHITECTURE.md §3: the Public shell). */
export default function PublicLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return <PublicSite>{children}</PublicSite>;
}
