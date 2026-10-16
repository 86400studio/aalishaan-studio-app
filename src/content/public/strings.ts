/**
 * Strings of the S1.3 storefront that are not page copy: the honest notices of the three disabled forms
 * (docs/content/new-strings.md NS-01–NS-03, D-24 — drafted by the S1.3 cloud leg, delivery-lead approval at
 * the pick-up, owner review at the next check-in) and the prototype's own runtime strings that are reused
 * because the behaviour they belong to is ported (rule 7: prototype/index.html — the wishlist toast lines;
 * prototype/shared/pending.js — the Cookies clear control). Nothing is invented inline in a page.
 */

/** NS-01 — the contact enquiry form, disabled until S2.13. */
export const CONTACT_FORM = {
  notice:
    "This form is not connected yet. Nothing is sent or saved from this page. Write to info@aalishaanstudio.com or call +91 9137624394.",
  submit: "Send enquiry",
} as const;

/** NS-02 — the shared footer's newsletter form, disabled until S2.12. */
export const NEWSLETTER_FORM = {
  note: "Newsletter signup is not open yet. No subscription is created.",
  submitLabel: "Newsletter signup",
} as const;

/** NS-03 — the Track lookup, disabled until S1.9 (milestones from parcels at S2.10). */
export const TRACK_FORM = {
  notice:
    "Order tracking is not available yet. Nothing is looked up from this page.",
} as const;

/** prototype/index.html (the wishlist script) — reused verbatim with the ported hearts. */
export const WISHLIST = {
  saved: "Artwork saved. Find your saved artworks in Shop.",
  removed: "Artwork removed from your wishlist.",
  unavailable:
    "Your browser could not save this artwork. Enable browser storage to keep a wishlist.",
  save: (title: string) => `Save ${title} to wishlist`,
  remove: (title: string) => `Remove ${title} from wishlist`,
} as const;

/** prototype/shared/pending.js — the Cookies page's clear control, reused verbatim. */
export const CLEAR_PREVIEW = {
  cleared: "Saved storefront selections cleared.",
  unavailable:
    "Storage is unavailable. Use your browser settings to clear saved data.",
} as const;

/** The browser-local keys the storefront writes at S1.3 (the prototype's own names, read by S1.4's Saved view). */
export const WISHLIST_KEY_PREFIX = "aalishaan-wishlist-";
