import { HelpBreadcrumb } from "@/components/ui/breadcrumb";
import { HelpSearchForm } from "@/components/ui/help-search-form";
import { CONTACT_DETAILS } from "@/content/public/pages";

/** The banner with the help search and the breadcrumb that open every help-variant page (D-11). */
export function HelpPageHead({ current }: { current: string }) {
  return (
    <>
      <section className="help-banner">
        <HelpSearchForm />
      </section>
      <HelpBreadcrumb parent="About" current={current} />
    </>
  );
}

/** The studio's email and phone, as the help pages print them (locked-facts §7). */
export function ContactLines() {
  return (
    <p>
      <a href={`mailto:${CONTACT_DETAILS.email}`}>{CONTACT_DETAILS.email}</a>
      <br />
      <a href={CONTACT_DETAILS.phoneHref}>{CONTACT_DETAILS.phoneDisplay}</a>
    </p>
  );
}
