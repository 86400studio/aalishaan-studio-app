import Link from "next/link";

/** The help breadcrumb (about-hub.css:11–12): About › the current page. */
export function HelpBreadcrumb({
  parent,
  current,
}: {
  parent: string;
  current: string;
}) {
  return (
    <nav className="help-breadcrumb" aria-label="Breadcrumb">
      <Link href="/about" prefetch={false}>
        {parent}
      </Link>
      <span aria-hidden="true">›</span>
      <span aria-current="page">{current}</span>
    </nav>
  );
}
