import Link from "next/link";
import type { ReactNode } from "react";

/** The crimson text link (docs/DESIGN.md §3 "Text link"); the arrow is CSS on Home and written into the copy elsewhere. */
export function TextLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link className="text-link" href={href} prefetch={false}>
      {children}
    </Link>
  );
}
