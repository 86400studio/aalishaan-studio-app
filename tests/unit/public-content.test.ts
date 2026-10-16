import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  HELP_HEAD,
  HELP_PAGE,
  HELP_QUESTIONS,
  HELP_TOPICS,
} from "@/content/public/help";
import {
  FEATURED,
  FINISHES,
  HERO,
  HOME_FAQ,
  HOME_HEAD,
  JOURNEY,
  MATERIALS,
  PROMISES,
  ROUTES,
  SPECS,
  formatRupees,
} from "@/content/public/home";
import {
  ABOUT_HUB,
  CONTACT,
  CONTACT_DETAILS,
  HELP_INDEX,
  RECOVERY,
  STUDIO,
  TRACK,
} from "@/content/public/pages";
import {
  POLICIES,
  POLICY_META_LINE,
  POLICY_PREVIEW_NOTE,
  POLICY_SLUGS,
  POLICY_TAB_GROUPS,
  policyBySlug,
} from "@/content/public/policies";
import {
  CART_DRAWER,
  FOOTER,
  FOOTER_CTA,
  MENU_DRAWER,
  PRIMARY_NAV,
} from "@/content/public/shell";
import {
  CLEAR_PREVIEW,
  CONTACT_FORM,
  NEWSLETTER_FORM,
  TRACK_FORM,
  WISHLIST,
} from "@/content/public/strings";

/**
 * Copy parity — S1.3 (CLAUDE.md "Approved content and design"; docs/APPROVED-INPUTS.md §2; D-08): every
 * string the storefront's content modules carry is read back from the frozen prototype page it comes from,
 * decoded as the browser renders it. The deliberate omissions (NS-15 — the two E10 FAQ entries and the two
 * E10 policy sentences) are asserted as omissions, so a later edit cannot silently reintroduce or drop them.
 * The three notices of the disabled forms (NS-01–NS-03) are asserted against the register's rules: honest,
 * no "sent" or "saved", and absent from the prototype. Hermetic: files only.
 */

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  nbsp: " ",
  eacute: "é",
  uuml: "ü",
  mdash: "—",
  ndash: "–",
  times: "×",
  rsaquo: "›",
  rarr: "→",
  copy: "©",
  hellip: "…",
};
function decode(html: string): string {
  return html
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&([a-z]+);/g, (match, name: string) => ENTITIES[name] ?? match)
    .replace(/ /g, " ");
}
function page(relative: string): string {
  return decode(readFileSync(path.join(ROOT, "prototype", relative), "utf8"));
}
/** The text of the page as rendered: tags removed, whitespace collapsed. */
function text(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}
const HOME = page("index.html");
const HOME_TEXT = text(HOME);
const expectIn = (haystack: string, needle: string) =>
  expect(haystack, `expected the prototype to contain: ${needle}`).toContain(
    needle.replace(/\s+/g, " "),
  );

describe("Home — prototype/index.html", () => {
  it("carries the head, the hero, the promises and the materials verbatim", () => {
    expectIn(HOME, `<title>${HOME_HEAD.title}</title>`);
    expectIn(HOME, `content="${HOME_HEAD.description}"`);
    expectIn(HOME_TEXT, HERO.heading);
    expectIn(HOME_TEXT, HERO.lead);
    expectIn(HOME, `alt="${HERO.roomAlt}"`);
    expectIn(HOME, `alt="${HERO.artworkAlt}"`);
    expectIn(HOME_TEXT, HERO.artworkCaption);
    expectIn(HOME_TEXT, HERO.primary.label);
    expectIn(HOME_TEXT, HERO.secondary.label);
    expectIn(HOME, `aria-label="${HERO.promiseLabel}"`);
    for (const promise of PROMISES) {
      expectIn(HOME_TEXT, promise.title);
      expectIn(HOME_TEXT, promise.line);
      expectIn(HOME, `d="${promise.icon}"`);
    }
    expectIn(HOME_TEXT, MATERIALS.eyebrow);
    expectIn(HOME_TEXT, MATERIALS.heading);
    expectIn(HOME, `'${MATERIALS.craftLabel}'`); // the mobile section's aria-label, set by the script
    for (const spec of SPECS) {
      expectIn(HOME_TEXT, spec.title);
      expectIn(HOME_TEXT, spec.line);
      expectIn(HOME, `alt="${spec.alt}"`);
    }
    expectIn(HOME, `aria-label="${SPECS[5].sizeLink}"`);
  });

  it("carries the routes, the featured cards, the journey and the FAQ verbatim, with the launch prices", () => {
    expectIn(HOME_TEXT, ROUTES.heading);
    expectIn(HOME, `aria-label="${ROUTES.dotsLabel}"`);
    for (const card of ROUTES.cards) {
      expectIn(HOME_TEXT, card.title);
      expectIn(HOME_TEXT, card.body);
      expectIn(HOME_TEXT, card.action.label);
      expectIn(HOME, `alt="${card.alt}"`);
    }
    for (const key of ["eyebrow", "heading", "body", "label", "view"] as const)
      expectIn(HOME_TEXT, FEATURED[key]);
    expectIn(HOME_TEXT, FEATURED.action.label);
    for (const card of FEATURED.cards) {
      expectIn(HOME, `data-product="${card.slug}"`);
      expectIn(HOME_TEXT, card.title);
      expectIn(HOME_TEXT, card.hook);
      expectIn(HOME, `alt="${card.alt}"`);
      const finish = FINISHES[card.finish];
      expectIn(
        HOME,
        `<span>${finish.label} frame</span>${formatRupees(finish.pricePaise)}`,
      );
    }
    expectIn(HOME_TEXT, JOURNEY.heading);
    expectIn(HOME_TEXT, JOURNEY.note);
    for (const step of JOURNEY.steps) {
      expectIn(HOME_TEXT, step.index);
      expectIn(HOME_TEXT, step.title);
      expectIn(HOME_TEXT, step.body);
    }
    for (const key of ["eyebrow", "heading", "body"] as const)
      expectIn(HOME_TEXT, HOME_FAQ[key]);
    expectIn(HOME_TEXT, HOME_FAQ.action.label);
    for (const item of HOME_FAQ.items) {
      expectIn(HOME_TEXT, item.q);
      expectIn(HOME_TEXT, item.a);
    }
    expect(HOME_FAQ.items).toHaveLength(5);
  });

  it("prices are the locked launch prices in integer paise (locked-facts §2)", () => {
    expect(FINISHES.white.pricePaise).toBe(1_900_000);
    expect(FINISHES.black.pricePaise).toBe(2_100_000);
    expect(FINISHES["antique-gold"].pricePaise).toBe(2_300_000);
    expect(formatRupees(2_100_000)).toBe("₹21,000");
    expect(formatRupees(12_345_600)).toBe("₹1,23,456");
    expect(() => formatRupees(2_100_050)).toThrow();
    expect(() => formatRupees(1.5)).toThrow();
  });

  it("the shell's copy — header, drawers, footer and the Home CTA band — is the prototype's", () => {
    for (const item of PRIMARY_NAV) expectIn(HOME, `>${item.label}</a>`);
    expectIn(HOME, `aria-label="${MENU_DRAWER.title}"`);
    expectIn(HOME, `aria-label="${CART_DRAWER.title}"`);
    for (const item of MENU_DRAWER.items) expectIn(HOME, `>${item.label}</a>`);
    expectIn(HOME_TEXT, CART_DRAWER.empty.heading);
    expectIn(HOME_TEXT, CART_DRAWER.empty.body);
    for (const column of FOOTER.columns) {
      expectIn(HOME, `<h2>${column.heading}</h2>`);
      for (const link of column.links) expectIn(HOME, `>${link.label}</a>`);
    }
    expectIn(HOME, `<h2>${FOOTER.mobileLegal.heading}</h2>`);
    expectIn(HOME_TEXT, FOOTER.newsletter.heading);
    expectIn(HOME_TEXT, FOOTER.newsletter.body);
    expectIn(HOME, `placeholder="${FOOTER.newsletter.placeholder}"`);
    expectIn(HOME_TEXT, FOOTER.copyright);
    expectIn(HOME_TEXT, FOOTER.tagline[0]);
    expectIn(HOME_TEXT, FOOTER.tagline[1]);
    for (const name of FOOTER.socials) expectIn(HOME, `aria-label="${name}"`);
    expectIn(HOME_TEXT, FOOTER_CTA.heading);
    expectIn(HOME_TEXT, FOOTER_CTA.body);
    expectIn(HOME, `alt="${FOOTER_CTA.photoAlt}"`);
    for (const room of FOOTER_CTA.rooms) expectIn(HOME_TEXT, room.label);
  });

  it("the wishlist toast lines are the prototype's own runtime strings (rule 7)", () => {
    expectIn(HOME, `'${WISHLIST.saved}'`);
    expectIn(HOME, `'${WISHLIST.removed}'`);
    expectIn(HOME, `'${WISHLIST.unavailable}'`);
    expect(WISHLIST.save("X")).toBe("Save X to wishlist");
    expect(WISHLIST.remove("X")).toBe("Remove X from wishlist");
  });
});

describe("Help — prototype/pages/help/index.html", () => {
  const HELP = page("pages/help/index.html");
  const HELP_TEXT = text(HELP);
  const E10_QUESTIONS = [
    "Can I pay cash on delivery?",
    "What happens if ordering is paused?",
  ];

  it("carries the head, the page copy, the filter labels and the related rows verbatim", () => {
    expectIn(HELP, `<title>${HELP_HEAD.title}</title>`);
    expectIn(HELP, `content="${HELP_HEAD.description}"`);
    expectIn(HELP, `<h1>${HELP_PAGE.heading}</h1>`);
    expectIn(HELP_TEXT, HELP_PAGE.intro);
    expectIn(HELP_TEXT, HELP_PAGE.searchLabel);
    expectIn(HELP, `placeholder="${HELP_PAGE.searchPlaceholder}"`);
    expectIn(HELP, `<option value="">${HELP_PAGE.allTopics}</option>`);
    expectIn(HELP, `>${HELP_PAGE.reset}</button>`);
    expectIn(HELP_TEXT, HELP_PAGE.empty);
    for (const topic of HELP_TOPICS)
      expectIn(HELP, `<option>${topic}</option>`);
    expectIn(HELP_TEXT, HELP_PAGE.related.heading);
    for (const row of HELP_PAGE.related.rows) {
      expectIn(HELP, `<strong>${row.title}</strong><small>${row.line}</small>`);
    }
  });

  it("renders the eleven E8 questions verbatim and omits exactly the two E10 entries (NS-15)", () => {
    expect(HELP_QUESTIONS).toHaveLength(11);
    for (const item of HELP_QUESTIONS) {
      expectIn(HELP, `data-topic="${item.topic}"`);
      expectIn(HELP, `<summary>${item.q}</summary><p>${item.a}</p>`);
    }
    for (const q of E10_QUESTIONS) {
      expectIn(HELP, `<summary>${q}</summary>`);
      expect(HELP_QUESTIONS.map((item) => item.q)).not.toContain(q);
    }
    expect(HELP_PAGE.status(11)).toBe("11 answers");
    expect((HELP.match(/<summary>/g) ?? []).length).toBe(13);
  });
});

describe("The seven policies — prototype/pages/policies/<slug>/index.html", () => {
  const E10_PRIVACY =
    "If you try the waiting-list preview shown while ordering is paused, the details you enter are kept only in this browser; nothing is sent.";
  const E10_COOKIES_REMEMBERED =
    "It also keeps any waiting-list preview entry you submit while ordering is paused.";
  const E10_COOKIES_CLEAR =
    "Clear the saved bag, wishlist, order preview and waiting-list preview entries using the control below.";

  it("lists the seven slugs once each, each resolvable", () => {
    expect([...POLICY_SLUGS].sort()).toEqual([
      "cancellation",
      "cookies",
      "privacy",
      "refunds",
      "returns",
      "shipping",
      "terms",
    ]);
    expect(POLICIES.map((p) => p.slug).sort()).toEqual(
      [...POLICY_SLUGS].sort(),
    );
    for (const slug of POLICY_SLUGS)
      expect(policyBySlug(slug)?.slug).toBe(slug);
    expect(policyBySlug("nope")).toBeUndefined();
  });

  it.each(POLICY_SLUGS)(
    "%s — title, intro, tabs, meta, note, sections and related rows are the prototype's",
    (slug) => {
      const policy = policyBySlug(slug)!;
      const html = page(`pages/policies/${slug}/index.html`);
      expectIn(html, `<title>${policy.title} | Aalishaan Studio</title>`);
      expectIn(html, `content="${policy.intro}"`);
      expectIn(html, `<h1>${policy.title}</h1><p>${policy.intro}</p>`);
      expectIn(html, `<p class="help-meta">${POLICY_META_LINE}</p>`);
      expect(
        html.includes(`<p class="preview-note">${POLICY_PREVIEW_NOTE}</p>`),
      ).toBe(policy.previewNote);
      if (policy.tabs) {
        const group = POLICY_TAB_GROUPS[policy.tabs];
        expectIn(html, `<nav class="policy-tabs" aria-label="${group.label}">`);
        for (const tab of group.tabs) expectIn(html, `>${tab.label}</a>`);
        expect(group.tabs.map((t) => t.slug)).toContain(slug);
      } else expect(html).not.toContain('class="policy-tabs"');
      for (const [i, section] of policy.sections.entries()) {
        expectIn(
          html,
          `<section id="section-${i}"><h2>${section.heading}</h2>`,
        );
        // The body is the prototype's, except where NS-15 shortens it (asserted below); the cookies
        // "Clear your preview" sentence is the E8 reconstruction the VS Code leg checks against the pinned checkout.
        if (!(slug === "cookies" && section.heading === "Clear your preview"))
          expectIn(html, section.body.split(". ")[0]!);
      }
      expect(html.match(/<section id="section-\d+">/g)).toHaveLength(
        policy.sections.length,
      );
      for (const row of policy.related)
        expectIn(html, `<strong>${row.title}</strong>`);
      expect(policy.related).toHaveLength(3);
    },
  );

  it("every section body is verbatim except the two NS-15 sentences, which are omitted", () => {
    for (const policy of POLICIES) {
      const html = page(`pages/policies/${policy.slug}/index.html`);
      for (const section of policy.sections) {
        const shortened =
          (policy.slug === "privacy" &&
            section.heading === "Browser storage") ||
          (policy.slug === "cookies" &&
            (section.heading === "What is remembered" ||
              section.heading === "Clear your preview"));
        if (!shortened) expectIn(html, `<p>${section.body}</p>`);
      }
    }
    const privacy = policyBySlug("privacy")!;
    const storage = privacy.sections.find(
      (s) => s.heading === "Browser storage",
    )!;
    expect(storage.body).not.toContain("waiting-list");
    expect(page("pages/policies/privacy/index.html")).toContain(
      `${storage.body} ${E10_PRIVACY}`,
    );

    const cookies = policyBySlug("cookies")!;
    const remembered = cookies.sections.find(
      (s) => s.heading === "What is remembered",
    )!;
    expect(remembered.body).not.toContain("waiting-list");
    const cookiesHtml = page("pages/policies/cookies/index.html");
    expect(cookiesHtml).toContain(E10_COOKIES_REMEMBERED);
    for (const sentence of remembered.body.split(". "))
      expect(cookiesHtml).toContain(sentence.replace(/\.$/, ""));
    const clear = cookies.sections.find(
      (s) => s.heading === "Clear your preview",
    )!;
    expect(cookiesHtml).toContain(E10_COOKIES_CLEAR);
    expect(clear.body).toBe(
      "Clear the saved bag, wishlist and order preview using the control below. Your browser also provides storage controls.",
    );
    expect(clear.body).not.toContain("waiting-list");
  });

  it("the Cookies clear-control strings are the prototype's own (rule 7)", () => {
    const pending = readFileSync(
      path.join(ROOT, "prototype/shared/pending.js"),
      "utf8",
    );
    expectIn(pending, `'${CLEAR_PREVIEW.cleared}'`);
    expectIn(pending, `'${CLEAR_PREVIEW.unavailable}'`);
    expectIn(
      page("pages/policies/cookies/index.html"),
      ">Clear saved preview data</button>",
    );
  });
});

describe("About hub, About the Studio, Contact, Track, 404, 500", () => {
  it("the hub's heading, intro, categories and search index are the prototype's; the FAQ count follows the eleven", () => {
    const html = page("pages/about/index.html");
    expectIn(html, `<h1>${ABOUT_HUB.heading}</h1><p>${ABOUT_HUB.intro}</p>`);
    expectIn(html, `<h2>${ABOUT_HUB.results.heading}</h2>`);
    expectIn(html, ABOUT_HUB.results.noResultsBefore);
    for (const category of ABOUT_HUB.categories) {
      expectIn(html, `<h2>${category.heading}</h2><p>${category.body}</p>`);
      expectIn(html, `d="${category.icon[0]}"`);
      if (category.heading === "FAQs") {
        expect(category.meta).toBe("11 answers"); // the prototype says 13 (E10's two entries, NS-15)
        expectIn(html, "<small>13 answers");
      } else expectIn(html, `<small>${category.meta} `);
    }
    expect(HELP_INDEX).toHaveLength(10);
    for (const entry of HELP_INDEX) {
      expectIn(
        html,
        `<strong>${entry.title}</strong><small>${entry.line}</small>`,
      );
      expect(entry.search).toContain(entry.title);
    }
    expect(ABOUT_HUB.results.status(1)).toBe("1 article found");
    expect(ABOUT_HUB.results.status(2)).toBe("2 articles found");
  });

  it("About the Studio is the signed-off article (D-PRE-17), verbatim", () => {
    const html = page("pages/about/studio/index.html");
    const studioText = text(html);
    expectIn(html, `<h1>${STUDIO.hero.heading}</h1><p>${STUDIO.hero.body}</p>`);
    expectIn(html, `aria-label="${STUDIO.navLabel}"`);
    for (const item of STUDIO.nav)
      expectIn(html, `<a href="${item.href}">${item.label}</a>`);
    for (const section of STUDIO.sections) {
      expectIn(
        html,
        `<section id="${section.id}" class="studio-section${"reverse" in section ? " studio-section--reverse" : ""}">`,
      );
      expectIn(html, `alt="${section.alt}"`);
      expectIn(
        html,
        `<span class="eyebrow">${section.eyebrow}</span><h2>${section.heading}</h2>`,
      );
      for (const paragraph of section.paragraphs)
        expectIn(html, `<p>${paragraph}</p>`);
      if ("facts" in section)
        for (const fact of section.facts)
          expectIn(html, `<span>${fact}</span>`);
    }
    expectIn(studioText, STUDIO.purpose.heading);
    for (const column of STUDIO.purpose.columns)
      expectIn(html, `<h3>${column.heading}</h3><p>${column.body}</p>`);
    expectIn(studioText, STUDIO.purpose.action.label);
  });

  it("Contact carries the prototype's labels, topics and points; the NS-01 notice replaces the sample line", () => {
    const html = page("pages/contact/index.html");
    expectIn(html, `<h1>${CONTACT.heading}</h1>`);
    for (const label of [
      CONTACT.fields.name,
      CONTACT.fields.email,
      CONTACT.fields.topic,
      CONTACT.fields.message,
    ])
      expectIn(html, `<label>${label}<`);
    for (const topic of CONTACT.fields.topics)
      expectIn(html, `<option>${topic}</option>`);
    expectIn(html, `placeholder="${CONTACT.fields.messagePlaceholder}"`);
    expectIn(html, `<h2>${CONTACT.before.heading}</h2>`);
    for (const point of CONTACT.before.points)
      expectIn(html, `<li>${point}</li>`);
    expectIn(html, `<h2>${CONTACT.quick.heading}</h2>`);
    expectIn(html, `>${CONTACT.quick.action.label}</a>`);
    expectIn(html, `<p>${CONTACT.quick.body}</p>`);
    expectIn(
      html,
      `href="mailto:${CONTACT_DETAILS.email}">${CONTACT_DETAILS.email}</a>`,
    );
    expectIn(
      html,
      `href="${CONTACT_DETAILS.phoneHref}">${CONTACT_DETAILS.phoneDisplay}</a>`,
    );
    expect(html).not.toContain(CONTACT_FORM.notice);
    expect(html).not.toContain(CONTACT_FORM.submit);
    expect(html).toContain("Preview enquiry"); // the prototype-only button, not ported
  });

  it("Track carries the prototype's tabs, labels and hints; the NS-03 notice replaces the sample journey", () => {
    const html = page("pages/track/index.html");
    const script = readFileSync(
      path.join(ROOT, "prototype/shared/commerce-r9.js"),
      "utf8",
    );
    expectIn(html, `<h1>${TRACK.heading}</h1>`);
    expectIn(html, `aria-label="${TRACK.tabsLabel}"`);
    for (const tab of TRACK.tabs)
      expectIn(html, `data-track-mode="${tab.mode}">${tab.label}</button>`);
    for (const mode of ["order", "awb", "mobile"] as const) {
      expectIn(script, `'${TRACK.modes[mode].label}'`);
    }
    expectIn(
      html,
      `<p id="track-hint" class="flow-fine">${TRACK.modes.order.hint}</p>`,
    );
    expectIn(script, TRACK.modes.awb.hint);
    expectIn(
      script,
      "'Live tracking by phone will require verification. Use 9000000000 for this sample.'",
    );
    expect(TRACK.modes.mobile.hint).toBe(
      "Live tracking by phone will require verification.",
    );
    expectIn(html, `>${TRACK.submit}</button>`);
    expectIn(html, `<p>${TRACK.result.intro}</p>`);
    expect(html).toContain("AS-PREVIEW-001"); // the sample reference the app never issues (D-09)
    for (const mode of ["order", "awb", "mobile"] as const)
      expect(TRACK.modes[mode].placeholder).not.toMatch(/AS-PREVIEW|SAMPLE/);
    expect(html).not.toContain(TRACK_FORM.notice);
  });

  it("the recovery pages carry the prototype's copy and the Hero Artwork picture", () => {
    for (const kind of ["404", "500"] as const) {
      const html = page(`pages/${kind}.html`);
      const copy = RECOVERY[kind];
      expectIn(html, `<title>${copy.title}</title>`);
      expectIn(html, `content="${copy.description}"`);
      expectIn(
        html,
        `<span class="eyebrow">${copy.eyebrow}</span><h1>${copy.heading}</h1><p>${copy.body}</p>`,
      );
      expectIn(html, copy.helpBefore);
      expectIn(html, `alt="${RECOVERY.artAlt}" width="1199" height="1312"`);
      expectIn(html, `>${RECOVERY.primary.label}</a>`);
      expectIn(html, `>${RECOVERY.secondary.label}</a>`);
    }
  });
});

describe("NS-01–NS-03 — the honest notices of the disabled forms (D-24, new-strings.md rule 2)", () => {
  const notices = [
    CONTACT_FORM.notice,
    NEWSLETTER_FORM.note,
    TRACK_FORM.notice,
  ];

  it("state the disabled condition plainly: no 'sent', 'saved', 'preview' or success wording", () => {
    for (const notice of notices) {
      expect(notice).toMatch(/not (connected|open|available) yet/);
      expect(notice).not.toMatch(/preview|sample|success|thank/i);
      expect(notice).toMatch(
        /Nothing is (sent or saved|looked up)|No subscription is created/,
      );
    }
    expect(CONTACT_FORM.notice).toContain(CONTACT_DETAILS.email);
    expect(CONTACT_FORM.notice).toContain(CONTACT_DETAILS.phoneDisplay);
    expect(CONTACT_FORM.submit).toBe("Send enquiry");
    expect(NEWSLETTER_FORM.submitLabel).toBe("Newsletter signup");
  });

  it("are registered in docs/content/new-strings.md with their exact wording", () => {
    const register = readFileSync(
      path.join(ROOT, "docs/content/new-strings.md"),
      "utf8",
    );
    for (const notice of notices) expect(register).toContain(notice);
    expect(register).toContain(`"${CONTACT_FORM.submit}"`);
    expect(register).toContain(`"${NEWSLETTER_FORM.submitLabel}"`);
  });
});
