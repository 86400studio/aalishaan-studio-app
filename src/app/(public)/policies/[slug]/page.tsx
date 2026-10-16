import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ClearPreviewControl } from "@/components/help/clear-preview-control";
import { ContactLines, HelpPageHead } from "@/components/help/policy-page-head";
import { PublicPage } from "@/components/shell/public-page";
import { HelpRow } from "@/components/ui/help-row";
import {
  POLICY_ASSISTANCE,
  POLICY_META_LINE,
  POLICY_PREVIEW_NOTE,
  POLICY_SLUGS,
  POLICY_TAB_GROUPS,
  policyBySlug,
} from "@/content/public/policies";

/**
 * The seven policy pages — S1.3 (docs/TECH-ARCHITECTURE.md §3a `/policies/[slug]`; prototype/pages/policies/
 * <slug>/index.html from build-pending.cjs). Statically generated for the seven slugs; any other slug is the
 * designed 404. The "terms pending" copy stays until S3.1 publishes the owner's terms as a new policy
 * version (D-PRE-13). The Cookies page carries the clear control.
 */
type Params = { slug: string };

export const dynamicParams = false;

export function generateStaticParams(): Params[] {
  return POLICY_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const policy = policyBySlug((await params).slug);
  if (!policy) return {};
  return {
    title: `${policy.title} | Aalishaan Studio`,
    description: policy.intro,
  };
}

export default async function PolicyPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const policy = policyBySlug((await params).slug);
  if (!policy) notFound();
  const group = policy.tabs ? POLICY_TAB_GROUPS[policy.tabs] : null;
  return (
    <PublicPage variant="help-article">
      <HelpPageHead current={policy.title} />
      <section className="utility-hero">
        <span className="eyebrow"></span>
        <h1>{policy.title}</h1>
        <p>{policy.intro}</p>
      </section>
      {group ? (
        <nav className="policy-tabs" aria-label={group.label}>
          {group.tabs.map((tab) => (
            <Link
              key={tab.slug}
              href={`/policies/${tab.slug}`}
              prefetch={false}
              aria-current={tab.slug === policy.slug ? "page" : undefined}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      ) : null}
      <p className="help-meta">{POLICY_META_LINE}</p>
      {policy.previewNote ? (
        <p className="preview-note">{POLICY_PREVIEW_NOTE}</p>
      ) : null}
      <article className="help-article">
        {policy.sections.map((section, i) => (
          <section id={`section-${i}`} key={section.heading}>
            <h2>{section.heading}</h2>
            <p>{section.body}</p>
          </section>
        ))}
        {policy.slug === "cookies" ? <ClearPreviewControl /> : null}
      </article>
      <section className="help-list help-related">
        <h2>Related articles</h2>
        {policy.related.map((row) => (
          <HelpRow key={row.href} href={row.href} title={row.title} />
        ))}
      </section>
      <div className="help-assistance">
        <h2>{POLICY_ASSISTANCE.heading}</h2>
        <Link
          className="button button--primary"
          href={POLICY_ASSISTANCE.action.href}
          prefetch={false}
        >
          {POLICY_ASSISTANCE.action.label}
        </Link>
        <ContactLines />
      </div>
    </PublicPage>
  );
}
