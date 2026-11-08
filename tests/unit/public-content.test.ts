import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  BAG_ROW,
  BAG_STATUS,
  BAG_STORAGE_NOTICES,
  CART_HEAD,
  CART_PAGE,
  CHECKOUT_CONTROL,
  DELIVERY_CHECK as CART_DELIVERY_CHECK,
} from "@/content/public/cart";
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
  ARTWORK_NOT_AVAILABLE,
  CLOSER_LOOK,
  DELIVERY_CHECK,
  LIGHTBOX,
  PALETTE_HUES,
  PRODUCT_FAQ,
  PRODUCT_HERO,
  PRODUCT_NOSCRIPT,
  PRODUCT_NOTICES,
  PRODUCT_VIEWS,
  RELATED,
  SIZE_GUIDE,
  STORY,
  STYLE_ASIDE,
  WHAT_YOU_RECEIVE,
} from "@/content/public/product";
import {
  BRAND,
  CART_DRAWER,
  FOOTER,
  FOOTER_CTA,
  HEADER,
  MENU_DRAWER,
  PRIMARY_NAV,
  SKIP_LINK,
} from "@/content/public/shell";
import {
  CLEAR_PREVIEW,
  CONTACT_FORM,
  NEWSLETTER_FORM,
  TRACK_FORM,
  WISHLIST,
} from "@/content/public/strings";
import {
  POLICY_CARVE_OUTS,
  buildSeedPlan,
} from "../../scripts/testing/lib/catalogue.mjs";

/**
 * D-49 — the three NS-36 replacements (docs/content/new-strings.md, owner-approved 2026-11-07): the E8 sentence the
 * frozen prototype still holds, and the sentence the app renders instead. Every parity check below reads an app
 * string back to its E8 original through `asE8`; the NS-36 test pins the approved wording itself.
 */
const NS36 = [
  {
    e8: "Delivery is planned across India. Enter your PIN code on any artwork page, in your bag or at checkout to see a sample serviceability check and delivery estimate. Shipping charges, final serviceable locations and production and delivery estimates will be confirmed before orders open.",
    approved:
      "Delivery is planned across India. Shipping charges, serviceable locations and production and delivery estimates will be confirmed before orders open; you will then be able to check your PIN code on any artwork page, in your bag or at checkout.",
  },
  {
    e8: "Each piece is printed and framed after you order, then delivered across India. Check your PIN code for a sample estimate. Confirmed production times, delivery estimates and charges will be shown before live orders open.",
    approved:
      "Each piece is printed and framed after you order, then delivered across India. Confirmed production times, delivery estimates and charges will be shown before live orders open.",
  },
  {
    e8: "Enter your PIN code to check availability, then see an estimated arrival. Sample coverage.",
    approved:
      "Enter your PIN code. Delivery availability and estimates will be shown here before orders open.",
  },
] as const;

/** The E8 text an app string stands for: an NS-36 replacement maps back to its original; anything else is itself. */
function asE8(s: string): string {
  return NS36.find((r) => r.approved === s)?.e8 ?? s;
}

/**
 * Copy parity — S1.3 (CLAUDE.md "Approved content and design"; docs/APPROVED-INPUTS.md §2; D-08): the strings
 * and link destinations the storefront's content modules carry are read back from the frozen prototype page
 * they come from, decoded as the browser renders them (a no-break space stays one: the collapsing only touches
 * ordinary white space); a destination is compared through the prototype's own route map
 * (`prototype/site-manifest.json` aliases). The deliberate omissions (NS-15 — the two E10 FAQ entries and the
 * E10 policy sentences) are asserted as omissions, so a later edit cannot silently reintroduce or drop them, and
 * the policy pages are held equal to the policy text S1.1 seeds. The three notices of the disabled forms
 * (NS-01–NS-03) are asserted against the register's rules: honest, no "sent" or "saved", and absent from the
 * prototype. Hermetic: files only.
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
    .replace(/&([a-z]+);/g, (match, name: string) => ENTITIES[name] ?? match);
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
    .replace(/[ \t\n\r\f]+/g, " ");
}
const HOME = page("index.html");
const HOME_TEXT = text(HOME);
const expectIn = (haystack: string, needle: string) =>
  expect(haystack, `expected the prototype to contain: ${needle}`).toContain(
    needle.replace(/[ \t\n\r\f]+/g, " "),
  );
const E10_QUESTIONS = [
  "Can I pay cash on delivery?",
  "What happens if ordering is paused?",
];

/** The prototype's route map: each app route to the frozen page it serves. */
const ALIASES = (
  JSON.parse(
    readFileSync(path.join(ROOT, "prototype/site-manifest.json"), "utf8"),
  ) as { aliases: Record<string, string> }
).aliases;
/**
 * The prototype href an app href stands for (query and hash kept). The route must be the canonical one — the
 * first route the manifest lists for its page; the later ones are the 301 aliases (TECH-ARCHITECTURE §3d).
 */
function prototypeHref(appHref: string): string {
  const [, route, rest] = /^([^?#]*)(.*)$/.exec(appHref)!;
  const file = ALIASES[route!];
  expect(file, `the manifest maps ${route}`).toBeDefined();
  const canonical = Object.entries(ALIASES).find(([, f]) => f === file)![0];
  expect(route, `${route} is the canonical route of ${file}`).toBe(canonical);
  return `${file}${rest}`;
}
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** The page links `label` to the app href's prototype page, as `<a … href="…">label` (leading tags allowed). */
function expectLink(html: string, link: { label: string; href: string }) {
  const href = prototypeHref(link.href);
  expect(
    new RegExp(
      `href="${escapeRegExp(href)}"[^>]*>(?:\\s|<[^>]+>)*${escapeRegExp(link.label)}`,
    ).test(html),
    `expected the prototype to link "${link.label}" to ${href}`,
  ).toBe(true);
}

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
      expectIn(HOME_TEXT, asE8(item.a));
    }
    expect(HOME_FAQ.items).toHaveLength(5);
  });

  it("the two no-break spaces of the materials strip are the prototype's (index.html:584, :592)", () => {
    const nbsp = String.fromCharCode(160);
    expect(SPECS[3]!.line).toContain(`350${nbsp}gsm`);
    expect(SPECS[5]!.line).toContain(`59.4${nbsp}cm`);
    expect(HOME).toContain(`350${nbsp}gsm`);
    expect(HOME).toContain(`59.4${nbsp}cm`);
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

  it("the shell's labels and every shell and Home destination are the prototype's", () => {
    expectIn(HOME, `href="#main">${SKIP_LINK}</a>`);
    expectIn(HOME, `aria-label="${BRAND.homeLabel}"`);
    expectIn(HOME, `aria-label="${BRAND.backToTopLabel}"`);
    expectIn(
      HOME,
      `src="assets/brand/aalishaan-studio.png" width="${BRAND.logo.width}" height="${BRAND.logo.height}" alt="${BRAND.logoAlt}"`,
    );
    expectIn(HOME, `aria-label="${HEADER.menuOpen}"`);
    expectIn(HOME, `aria-label="${HEADER.cartOpen(0)}"`);
    expectIn(HOME, `aria-label="${MENU_DRAWER.close}"`);
    expectIn(HOME, `aria-label="${CART_DRAWER.close}"`);
    expectIn(HOME_TEXT, FOOTER_CTA.eyebrow);
    expectIn(HOME, `aria-label="${FOOTER_CTA.roomsLabel}"`);
    expectIn(HOME, `aria-label="${FOOTER.socialsLabel}"`);
    expectIn(HOME, `aria-label="${FOOTER.legalLabel}"`);
    expectIn(HOME, `aria-label="${FOOTER.newsletter.inputLabel}"`);

    type Link = { readonly label: string; readonly href: string };
    const columnLinks: readonly Link[] = FOOTER.columns.flatMap(
      (column): readonly Link[] => column.links,
    );
    const links: readonly Link[] = [
      ...PRIMARY_NAV,
      { label: HEADER.trackOrder, href: HEADER.trackHref },
      ...MENU_DRAWER.items,
      MENU_DRAWER.footerAction,
      CART_DRAWER.empty.primary,
      CART_DRAWER.empty.secondary,
      CART_DRAWER.footerAction,
      ...FOOTER_CTA.rooms,
      FOOTER_CTA.primary,
      FOOTER_CTA.help,
      ...columnLinks,
      ...FOOTER.mobileLegal.links,
      ...FOOTER.legal,
      HERO.primary,
      HERO.secondary,
      ...ROUTES.cards.map((card) => card.action),
      FEATURED.action,
      HOME_FAQ.action,
    ];
    expect(links).toHaveLength(45);
    for (const link of links) expectLink(HOME, link);
    // Each featured card links its artwork page three times (image, title, "View artwork").
    for (const card of FEATURED.cards) {
      const href = prototypeHref(`/artworks/${card.slug}`);
      expect(HOME.split(`href="${href}"`)).toHaveLength(4);
    }
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

  it("NS-36 (D-49): the approved delivery sentences replace the E8 ones in Help, both FAQs and the PIN hint; none promises a sample", () => {
    const deliver = HELP_QUESTIONS.find(
      (item) => item.q === "Where do you deliver?",
    );
    expect(deliver?.a).toBe(NS36[0].approved);
    for (const faq of [HOME_FAQ.items, PRODUCT_FAQ.items.slice(0, 5)])
      expect(
        faq.find((item) => item.q === "How long does delivery take?")?.a,
      ).toBe(NS36[1].approved);
    expect(DELIVERY_CHECK.hint).toBe(NS36[2].approved);
    for (const r of NS36) {
      expect(r.approved).not.toMatch(/sample/i);
      expect(r.e8).toMatch(/sample/i);
    }
    expect(
      HELP_INDEX.find((entry) => entry.href === "/help")?.search,
    ).toContain(NS36[0].approved);
  });

  it("renders the eleven E8 questions verbatim and omits exactly the two E10 entries (NS-15)", () => {
    expect(HELP_QUESTIONS).toHaveLength(11);
    for (const item of HELP_QUESTIONS) {
      expectIn(HELP, `data-topic="${item.topic}"`);
      expectIn(HELP, `<summary>${item.q}</summary><p>${asE8(item.a)}</p>`);
    }
    for (const q of E10_QUESTIONS) {
      expectIn(HELP, `<summary>${q}</summary>`);
      expect(HELP_QUESTIONS.map((item) => item.q)).not.toContain(q);
    }
    const blocks = [
      ...HELP.matchAll(
        /<div data-topic="([^"]+)">(?:(?!<summary>)[\s\S])*?<summary>([^<]*)<\/summary>/g,
      ),
    ].map((m) => [m[1], m[2]]);
    expect(blocks).toHaveLength(13);
    expect(HELP_QUESTIONS.map((item) => [item.topic, item.q])).toEqual(
      blocks.filter(([, q]) => !E10_QUESTIONS.includes(q as string)),
    );
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
        // "Clear your preview" sentence is the E8 wording (the S1.1 carve-out; asserted below and against the seed).
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

  it("the pages are exactly the policy text S1.1 seeds (buildSeedPlan: E10 with the three carve-outs — the E8 wording)", () => {
    const seeded = new Map(
      buildSeedPlan().policy_versions.map((version) => [
        version.policy_key,
        version,
      ]),
    );
    expect([...seeded.keys()].sort()).toEqual([...POLICY_SLUGS].sort());
    for (const policy of POLICIES) {
      const seed = seeded.get(policy.slug)!;
      expect(policy.title, policy.slug).toBe(seed.title);
      expect(policy.intro, policy.slug).toBe(seed.intro);
      // The seed stores the preview note as a body entry with an empty heading.
      expect(
        seed.body.filter((s) => s.heading === "").map((s) => s.text),
        policy.slug,
      ).toEqual(policy.previewNote ? [POLICY_PREVIEW_NOTE] : []);
      expect(
        policy.sections.map((s) => ({ heading: s.heading, text: s.body })),
        policy.slug,
      ).toEqual(seed.body.filter((s) => s.heading !== ""));
    }
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

  it("each search-index entry is the prototype's data-search, without the NS-15 entries and sentences, linking the same page", () => {
    const html = page("pages/about/index.html");
    const entries = [
      ...html.matchAll(
        /<div data-help-entry data-search="([^"]*)"><a class="help-row" href="([^"]*)"/g,
      ),
    ].map((m) => ({ search: m[1]!, href: m[2]! }));
    expect(entries).toHaveLength(HELP_INDEX.length);
    // The two E10 FAQ entries, as the hub's builder writes them into the FAQ entry: " <topic> <q> <a>".
    const triples = [
      ...page("pages/help/index.html").matchAll(
        /<div data-topic="([^"]+)">(?:(?!<summary>)[\s\S])*?<summary>([^<]*)<\/summary><p>([^<]*)<\/p>/g,
      ),
    ]
      .filter((m) => E10_QUESTIONS.includes(m[2]!))
      .map((m) => ` ${m[1]} ${m[2]} ${m[3]}`);
    expect(triples).toHaveLength(2);
    const withoutNs15 = (search: string) => {
      let out = search;
      for (const removed of [
        ...triples.map((sentence) => ({ sentence, replacement: "" })),
        ...POLICY_CARVE_OUTS,
        ...NS36.map((r) => ({ sentence: r.e8, replacement: r.approved })),
      ])
        if (out.includes(removed.sentence)) {
          expect(out.split(removed.sentence)).toHaveLength(2);
          out = out.replace(removed.sentence, () => removed.replacement);
        }
      return out;
    };
    for (const [i, entry] of HELP_INDEX.entries()) {
      expect(entry.search, entry.title).toBe(withoutNs15(entries[i]!.search));
      // the hub's links are relative to pages/about/
      expect(path.posix.join("pages/about", entries[i]!.href)).toBe(
        prototypeHref(entry.href),
      );
    }
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
    // the hint the page loads with, then each tab's own hint (commerce-r9.js writes it on every tab choice)
    expectIn(
      html,
      `<p id="track-hint" class="flow-fine">${TRACK.initialHint}</p>`,
    );
    expectIn(script, `'${TRACK.modes.order.hint}'`);
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

describe("The artwork pages — prototype/pages/artworks/<slug>/index.html (S1.5)", () => {
  const WILLOW = page("pages/artworks/willow-after-rain/index.html");
  const WILLOW_TEXT = text(WILLOW);
  const LANTERN_PAGE = page(
    "pages/artworks/the-lantern-that-outlasted-the-gale/index.html",
  );
  const R3 = readFileSync(path.join(ROOT, "prototype/product/r3.js"), "utf8");
  const GENERATOR = readFileSync(
    path.join(ROOT, "prototype/scripts/build-products.cjs"),
    "utf8",
  );

  it("carries the hero, the section nav, the size guide and the moodboard copy verbatim", () => {
    for (const s of [
      PRODUCT_HERO.zoomHint,
      PRODUCT_HERO.frameLegend,
      PRODUCT_HERO.addToCart,
      PRODUCT_HERO.continueCheckout,
      PRODUCT_HERO.reassurance,
      PRODUCT_HERO.recommendation("Antique Gold"),
      ...PRODUCT_HERO.sectionNav.links.map((l) => l.label),
      SIZE_GUIDE.heading,
      SIZE_GUIDE.body,
      SIZE_GUIDE.dimensions.Portrait.print,
      SIZE_GUIDE.dimensions.Portrait.detail,
      SIZE_GUIDE.small,
      SIZE_GUIDE.compare.label,
      SIZE_GUIDE.sheet.caption("portrait", "living room"),
      CLOSER_LOOK.eyebrow,
      CLOSER_LOOK.heading,
      CLOSER_LOOK.intro,
      CLOSER_LOOK.artwork.caption,
      CLOSER_LOOK.close.caption("Antique Gold"),
      CLOSER_LOOK.paper.caption,
      ...CLOSER_LOOK.framedOrder.map((f) =>
        CLOSER_LOOK.framed.caption(
          { white: "White", black: "Black", "antique-gold": "Antique Gold" }[f],
        ),
      ),
    ])
      expectIn(WILLOW_TEXT, s);
    for (const attribute of [
      `aria-label="${PRODUCT_HERO.sectionLabel}"`,
      `aria-label="${PRODUCT_HERO.stageLabel}"`,
      `aria-label="${PRODUCT_HERO.thumbsLabel}"`,
      `aria-label="${PRODUCT_HERO.sectionNav.label}"`,
      `data-zoom-alt="${SIZE_GUIDE.compare.alt}"`,
      `data-zoom-caption="${SIZE_GUIDE.compare.caption}"`,
      `alt="${SIZE_GUIDE.sheet.alt("portrait", "living room")}"`,
      `aria-label="${CLOSER_LOOK.enlarge(CLOSER_LOOK.artwork.caption)}"`,
    ])
      expectIn(WILLOW, attribute);
    for (const link of PRODUCT_HERO.sectionNav.links)
      expectIn(WILLOW, `href="${link.href}">${link.label}</a>`);
    // The other orientation's lines, the Lantern's room figure and its extra thumbnails.
    const LANTERN_TEXT = text(LANTERN_PAGE);
    expectIn(LANTERN_TEXT, SIZE_GUIDE.dimensions.Landscape.print);
    expectIn(LANTERN_TEXT, SIZE_GUIDE.dimensions.Landscape.detail);
    expectIn(LANTERN_TEXT, SIZE_GUIDE.room.caption("Black", "study & office"));
    expectIn(
      LANTERN_PAGE,
      `alt="${SIZE_GUIDE.room.alt("The Lantern That Outlasted the Gale", "study & office", "Black")}"`,
    );
    for (const view of Object.values(PRODUCT_VIEWS))
      expectIn(LANTERN_TEXT, view.label);
  });

  it("the gallery's alts and captions and the moodboard's alts are r3.js's runtime templates (rule 7)", () => {
    for (const fragment of [
      "${p.altText || p.title} — ${names[frame]} frame",
      "Framed in ${names[frame]}",
      "${p.title} — ${names[frame]} frame, close up",
      "${names[frame]} frame, close up",
      "${p.title} — print detail on Hahnemühle Museum Etching paper",
      "Print detail on Hahnemühle Museum Etching paper",
      "${p.title} — the artwork without its frame",
      "In a ${roomLower} · ${names[frame]} frame",
      "Illustrative A2 ${p.orientation.toLowerCase()} size guide for a ${roomLower}; not this artwork",
      "Illustrative A2 ${p.orientation.toLowerCase()} scale in a ${roomLower}",
      "alt:`${names[pick]} frame detail`",
      "alt:'Paper and print detail'",
      "alt:`${p.title} in a ${names[f]} frame`",
      "`${item.caption} · ${cursor + 1} of ${set.length}`",
      "names[frame] + ' frame finish, close up'",
      `'Added to cart · ' + p.title + ' · ' + names[frame] + ' frame'`,
      `'${PRODUCT_NOTICES.limited}'`,
      `'${PRODUCT_NOTICES.memoryOnly}'`,
    ])
      expect(R3, fragment).toContain(fragment);
    expect(PRODUCT_VIEWS.framed.alt("Alt", "Black")).toBe("Alt — Black frame");
    expect(PRODUCT_VIEWS.room.caption("bedroom", "White")).toBe(
      "In a bedroom · White frame",
    );
    expect(LIGHTBOX.position("The artwork", 1, 6)).toBe("The artwork · 1 of 6");
    expect(PRODUCT_NOTICES.added("Willow After Rain", "Black")).toBe(
      "Added to cart · Willow After Rain · Black frame",
    );
  });

  it("carries What you'll receive, the story heading and the style aside verbatim", () => {
    for (const s of [
      WHAT_YOU_RECEIVE.heading,
      WHAT_YOU_RECEIVE.intro,
      WHAT_YOU_RECEIVE.paper.heading,
      WHAT_YOU_RECEIVE.paper.body,
      WHAT_YOU_RECEIVE.frame.heading,
      `Antique Gold${WHAT_YOU_RECEIVE.frame.afterName}`,
      WHAT_YOU_RECEIVE.glazing.heading,
      WHAT_YOU_RECEIVE.glazing.body,
      WHAT_YOU_RECEIVE.hanging.heading,
      WHAT_YOU_RECEIVE.hanging.body,
      WHAT_YOU_RECEIVE.footnote,
      STORY.heading,
      STYLE_ASIDE.eyebrow,
      STYLE_ASIDE.printNote,
      ...Object.values(STYLE_ASIDE.meta),
      STYLE_ASIDE.seeAll("Rinpa Moon"),
      RELATED.heading,
      RELATED.open,
    ])
      expectIn(WILLOW_TEXT, s);
    for (const attribute of [
      `alt="${WHAT_YOU_RECEIVE.paper.alt("Willow After Rain")}"`,
      `data-zoom-caption="${WHAT_YOU_RECEIVE.paper.zoomCaption}"`,
      `aria-label="${WHAT_YOU_RECEIVE.paper.enlarge}"`,
      `alt="${WHAT_YOU_RECEIVE.frame.alt("Antique Gold")}"`,
      `alt="${WHAT_YOU_RECEIVE.glazing.alt}"`,
      `alt="${WHAT_YOU_RECEIVE.hanging.alt}"`,
      `aria-label="${STYLE_ASIDE.paletteLabel}"`,
      `id="${SIZE_GUIDE.id}"`,
      `id="${WHAT_YOU_RECEIVE.id}"`,
      `id="${STORY.id}"`,
      `id="${PRODUCT_FAQ.id}"`,
    ])
      expectIn(WILLOW, attribute);
  });

  it("the palette colours are the generator's hueColours, every one of them", () => {
    const block = GENERATOR.match(/const hueColours = \{([\s\S]*?)\};/)![1]!;
    const generator = Object.fromEntries(
      [...block.matchAll(/'([^']+)':'([^']+)'/g)].map((m) => [m[1], m[2]]),
    );
    expect(PALETTE_HUES).toEqual(generator);
    expect(GENERATOR).toContain("hueColours[name] || '#d8d2c8'");
  });

  it("the seven FAQs are the page's verbatim; 1–5 are before-you-buy.json and Home's FAQ (one D-49 sentence for both)", () => {
    // The links read from the root, as Home's are (the page sits three folders down).
    const html = WILLOW.replaceAll('href="../../../', 'href="');
    const details = [
      ...html.matchAll(
        /<details class="r11-faq"[^>]*><summary>([^<]+)<\/summary><p>(.*?)<\/p><\/details>/g,
      ),
    ];
    expect(details).toHaveLength(7);
    PRODUCT_FAQ.items.forEach((item, i) => {
      expect(item.q).toBe(details[i]![1]);
      const answer =
        typeof item.a === "string"
          ? item.a
          : item.a
              .map((part) => (typeof part === "string" ? part : part.label))
              .join("");
      expect(asE8(answer)).toBe(details[i]![2]!.replace(/<[^>]+>/g, ""));
    });
    const sixth = PRODUCT_FAQ.items[5]!.a;
    expect(typeof sixth).not.toBe("string");
    for (const part of sixth as ReadonlyArray<
      string | { label: string; href: string }
    >)
      if (typeof part !== "string") expectLink(html, part);
    const data = JSON.parse(
      readFileSync(
        path.join(ROOT, "prototype/data/before-you-buy.json"),
        "utf8",
      ),
    ) as Array<[string, string]>;
    expect(
      PRODUCT_FAQ.items
        .slice(0, 5)
        .map((i) => [i.q, typeof i.a === "string" ? asE8(i.a) : i.a]),
    ).toEqual(data);
    expect(PRODUCT_FAQ.items.slice(0, 5)).toEqual(HOME_FAQ.items);
    for (const s of [
      PRODUCT_FAQ.eyebrow,
      PRODUCT_FAQ.heading,
      PRODUCT_FAQ.intro,
      PRODUCT_FAQ.contact.label,
    ])
      expectIn(WILLOW_TEXT, s);
    expectLink(html, PRODUCT_FAQ.contact);
    expectIn(
      html,
      `width="${PRODUCT_FAQ.image.width}" height="${PRODUCT_FAQ.image.height}" alt=""`,
    );
  });

  it("the delivery form, the lightbox, the sticky bar and the no-JS line are the page's; the invalid-PIN line is delivery.js's", () => {
    expectIn(WILLOW_TEXT, DELIVERY_CHECK.label);
    expectIn(WILLOW, `placeholder="${DELIVERY_CHECK.placeholder}"`);
    expectIn(WILLOW, `<button type="submit">${DELIVERY_CHECK.submit}</button>`);
    expectIn(WILLOW_TEXT, asE8(DELIVERY_CHECK.hint));
    expect(
      readFileSync(path.join(ROOT, "prototype/shared/delivery.js"), "utf8"),
    ).toContain(`message: '${DELIVERY_CHECK.invalid}'`);
    expectIn(WILLOW, `aria-label="${LIGHTBOX.label}"`);
    expectIn(WILLOW, `>${LIGHTBOX.close}</button>`);
    expectIn(
      WILLOW,
      `aria-label="${LIGHTBOX.previous.label}">${LIGHTBOX.previous.mark}<`,
    );
    expectIn(
      WILLOW,
      `aria-label="${LIGHTBOX.next.label}">${LIGHTBOX.next.mark}<`,
    );
    expectIn(WILLOW, `<small>A2 · <span id="sticky-frame">`);
    expectIn(WILLOW, `<p class="pd-noscript">${PRODUCT_NOSCRIPT}</p>`);
  });

  it("the not-available state is new wording (NS-PROPOSED), absent from every prototype page, and states no fact", () => {
    for (const s of [
      ARTWORK_NOT_AVAILABLE.heading,
      ARTWORK_NOT_AVAILABLE.body,
      ARTWORK_NOT_AVAILABLE.title,
    ]) {
      expect(WILLOW).not.toContain(s);
      expect(LANTERN_PAGE).not.toContain(s);
      expect(s).not.toMatch(/preview|sample|soon|\d/i);
    }
    expect(ARTWORK_NOT_AVAILABLE.action).toEqual(CART_DRAWER.empty.primary);
  });
});

describe("The cart page and the bag — prototype/pages/cart/index.html, shared/bag.js (S1.5)", () => {
  const CART = page("pages/cart/index.html");
  const CART_TEXT = text(CART);
  const BAG = readFileSync(path.join(ROOT, "prototype/shared/bag.js"), "utf8");
  const LANTERN = page(
    "pages/artworks/the-lantern-that-outlasted-the-gale/index.html",
  );
  /** The cart page links from two levels down (`../../`). */
  const expectCartLink = (link: { label: string; href: string }) =>
    expectIn(CART, `href="../../${prototypeHref(link.href)}">${link.label}<`);

  it("carries the head, the heading, the artworks column and the summary verbatim", () => {
    expectIn(CART, `<title>${CART_HEAD.title}</title>`);
    expectIn(CART, `name="description" content="${CART_HEAD.description}"`);
    expectIn(CART, `<h1 class="checkout-heading">${CART_PAGE.heading}</h1>`);
    expectIn(CART, `<h2>${CART_PAGE.items.heading}</h2>`);
    expectCartLink(CART_PAGE.items.explore);
    const { summary } = CART_PAGE;
    expectIn(CART, `<span class="eyebrow">${summary.eyebrow}</span>`);
    expectIn(CART, `<h2>${summary.heading}</h2>`);
    expectIn(CART, `<dt>${summary.subtotal}</dt>`);
    expectIn(
      CART,
      `<dt>${summary.delivery}</dt><dd>${summary.deliveryValue}</dd>`,
    );
    expectIn(CART, `<p class="flow-fine">${summary.fine}</p>`);
    expectIn(CART, `<p class="flow-fine">${summary.guest}</p>`);
    expectIn(CART, `<p class="flow-help">${summary.helpBefore}<a`);
    expectCartLink(summary.help);
  });

  it("the PIN form's label, placeholder and button are the cart's; the checkout labels and line are the prototype's", () => {
    expectIn(
      CART,
      `<label for="cart-pincode">${CART_DELIVERY_CHECK.cartLabel}</label>`,
    );
    expectIn(CART, `placeholder="${CART_DELIVERY_CHECK.placeholder}"`);
    expectIn(
      CART,
      `class="button button--secondary">${CART_DELIVERY_CHECK.submit}</button>`,
    );
    expectIn(CART, `>${CHECKOUT_CONTROL.cart}</a></div>`);
    expectIn(BAG, `'Continue to checkout':'Explore artworks'`);
    expect(CHECKOUT_CONTROL.drawer).toBe("Continue to checkout");
    expectIn(
      LANTERN,
      `<p class="pd-bag-note">${CHECKOUT_CONTROL.unavailable}</p>`,
    );
  });

  it("the empty bag, the drawer's rows and its notices are bag.js's own runtime strings (rule 7)", () => {
    expectIn(BAG, `<h2>${CART_PAGE.empty.heading}</h2>`);
    expectIn(BAG, `>${CART_PAGE.empty.action.label}</a>\``);
    // The prototype's empty line names the sample bag; the drawer's own sentence replaces it.
    expectIn(BAG, `Your cart is empty. ${CART_PAGE.empty.body}</p>`);
    expect(CART_PAGE.empty.body).not.toMatch(/sample/i);
    expectIn(BAG, `>${CART_DRAWER.editBag.label}</a>`);
    expectIn(BAG, `'pages/cart/index.html'`);
    expectIn(BAG, `<p role="status">${BAG_STORAGE_NOTICES.memoryOnly}</p>`);
    expectIn(BAG, `'Remove '+items[index].title`);
    expect(BAG_ROW.removeFor("X")).toBe("Remove X");
  });

  it("the new technical states (NS-PROPOSED) are absent from the prototype and claim nothing", () => {
    const proposed = [
      BAG_STATUS.pending,
      BAG_STATUS.failed,
      BAG_STATUS.retry,
      BAG_STATUS.removed(1),
      BAG_STATUS.removed(2),
      BAG_STATUS.subtotalPending,
      BAG_STATUS.subtotalFailed,
      BAG_STORAGE_NOTICES.corruptCleared,
      CART_PAGE.noscript.before.trim(),
    ];
    for (const s of proposed) {
      expect(CART_TEXT).not.toContain(s);
      expect(BAG).not.toContain(s);
      expect(s).not.toMatch(/preview|sample|sent|paid|confirmed|₹/i);
    }
    expect(CART_PAGE.noscript.link).toEqual({
      label: "browse the artworks",
      href: "/shop",
    });
    expectCartLink(CART_PAGE.noscript.link);
  });
});

describe("prototype-only wording — not ported (the S1.3 record, step-1 contracts)", () => {
  const sources = (dir: string): string[] =>
    readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap(
      (entry) =>
        entry.isDirectory()
          ? sources(path.join(dir, entry.name))
          : /\.(tsx?|css)$/.test(entry.name)
            ? [readFileSync(path.join(ROOT, dir, entry.name), "utf8")]
            : [],
    );
  const app = [
    ...sources("src/content/public"),
    ...sources("src/components"),
    ...sources("src/app/(public)"),
  ].join("\n");

  it.each([
    "Preview enquiry",
    "Enquiry preview complete",
    "Sample form. Use sample details only",
    "Preview only. No subscription is created.",
    "Signup preview complete",
    "Explore a sample journey",
    "No matching sample found",
    "This preview shows a sample journey",
    "Use 9000000000 for this sample",
    "AS-PREVIEW-001",
    "Interactive previews need JavaScript",
  ])("%s", (phrase) => {
    expect(app).not.toContain(phrase);
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
