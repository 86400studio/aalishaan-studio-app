import type { Metadata } from "next";

import { FaqFilter } from "@/components/help/faq-filter";
import { HelpPageHead } from "@/components/help/policy-page-head";
import { PublicPage } from "@/components/shell/public-page";
import { HelpRow } from "@/components/ui/help-row";
import { HELP_HEAD, HELP_PAGE } from "@/content/public/help";

/**
 * Help — the Wall Art FAQs, S1.3 (docs/TECH-ARCHITECTURE.md §3a `/help`; prototype/pages/help/index.html).
 * The eleven E8 questions; the two E10 entries are NS-15 and wait for the owner's wording.
 */
export const metadata: Metadata = {
  title: HELP_HEAD.title,
  description: HELP_HEAD.description,
};

export default function HelpPage() {
  return (
    <PublicPage variant="help">
      <HelpPageHead current={HELP_PAGE.breadcrumb.current} />
      <section className="utility-hero">
        <span className="eyebrow"></span>
        <h1>{HELP_PAGE.heading}</h1>
        <p>{HELP_PAGE.intro}</p>
      </section>
      <FaqFilter />
      <section className="help-list help-related">
        <h2>{HELP_PAGE.related.heading}</h2>
        {HELP_PAGE.related.rows.map((row) => (
          <HelpRow
            key={row.href}
            href={row.href}
            title={row.title}
            line={row.line}
          />
        ))}
      </section>
    </PublicPage>
  );
}
