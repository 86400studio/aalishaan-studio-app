import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The storefront button as a link (docs/DESIGN.md §3 "Button"): primary = the conversion colour only,
 * secondary = outlined; 48 px, 4 px radius (gallery-r8.css:10). Internal routes go through the framework's
 * link without prefetch — the catalogue routes it points at arrive with S1.4 / S1.5.
 */
export function ButtonLink({
  href,
  variant = "primary",
  full = false,
  className = "",
  children,
}: {
  href: string;
  variant?: "primary" | "secondary";
  full?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const classes = [
    "button",
    `button--${variant}`,
    full ? "button--full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  if (href.startsWith("#"))
    return (
      <a className={classes} href={href}>
        {children}
      </a>
    );
  return (
    <Link className={classes} href={href} prefetch={false}>
      {children}
    </Link>
  );
}
