import Link from "next/link";

/** One row of a help list (about-hub.css:21–24): a title, an optional line and the chevron. */
export function HelpRow({
  href,
  title,
  line,
}: {
  href: string;
  title: string;
  line?: string;
}) {
  return (
    <Link className="help-row" href={href} prefetch={false}>
      <span>
        <strong>{title}</strong>
        {line ? <small>{line}</small> : null}
      </span>
      <span aria-hidden="true">›</span>
    </Link>
  );
}
