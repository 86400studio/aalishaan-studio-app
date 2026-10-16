import type { Metadata } from "next";
import type { ReactNode } from "react";

// Every /admin page reads the request's cookies through the server guard, so nothing here is ever static or
// cached (S1.2). The staff pages stay out of search indexes regardless of the public site's state.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Aalishaan Studio",
  robots: { index: false, follow: false },
};

export default function AdminLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
