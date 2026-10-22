import type { Metadata } from "next";
import Link from "next/link";

import { ContactLines, HelpPageHead } from "@/components/help/policy-page-head";
import { PublicPage } from "@/components/shell/public-page";
import { CONTACT, CONTACT_HEAD } from "@/content/public/pages";
import { CONTACT_FORM } from "@/content/public/strings";

/**
 * Contact & Support — S1.3 (docs/TECH-ARCHITECTURE.md §3a `/contact`; prototype/pages/contact/index.html).
 * The enquiry form renders with every control disabled and the NS-01 notice (D-24): nothing is sent or
 * saved until S2.13 brings the server action, Turnstile and the abuse controls (SECURITY-CHECKLIST §5).
 */
export const metadata: Metadata = {
  title: CONTACT_HEAD.title,
  description: CONTACT_HEAD.description,
};

export default function ContactPage() {
  return (
    <PublicPage variant="contact">
      <HelpPageHead current={CONTACT.breadcrumb.current} />
      <section className="utility-hero">
        <span className="eyebrow"></span>
        <h1>{CONTACT.heading}</h1>
        <p></p>
      </section>
      <div className="utility-split">
        <form id="contact-form" className="utility-card utility-form">
          <p className="flow-fine">{CONTACT_FORM.notice}</p>
          <label>
            {CONTACT.fields.name}
            <input name="name" type="text" autoComplete="off" disabled />
          </label>
          <label>
            {CONTACT.fields.email}
            <input name="email" type="email" autoComplete="off" disabled />
          </label>
          <label>
            {CONTACT.fields.topic}
            <select name="topic" disabled>
              {CONTACT.fields.topics.map((topic) => (
                <option key={topic}>{topic}</option>
              ))}
            </select>
          </label>
          <label>
            {CONTACT.fields.message}
            <textarea
              name="message"
              rows={5}
              placeholder={CONTACT.fields.messagePlaceholder}
              disabled
            ></textarea>
          </label>
          <button className="button button--primary" type="submit" disabled>
            {CONTACT_FORM.submit}
          </button>
          <p role="status" id="contact-status"></p>
        </form>
        <aside>
          <section className="utility-card">
            <h2>{CONTACT.before.heading}</h2>
            <ul className="contact-points">
              {CONTACT.before.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <ContactLines />
          </section>
          <section className="utility-card">
            <h2>{CONTACT.quick.heading}</h2>
            <Link
              className="button button--secondary"
              href={CONTACT.quick.action.href}
              prefetch={false}
            >
              {CONTACT.quick.action.label}
            </Link>{" "}
            <p>{CONTACT.quick.body}</p>
          </section>
        </aside>
      </div>
    </PublicPage>
  );
}
