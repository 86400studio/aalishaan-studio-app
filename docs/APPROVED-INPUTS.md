# APPROVED-INPUTS.md — What Counts as Approved, and Where It Lives

The SOP in this docs pack expects a signed predevelopment package (client answers, research, features, design system, sitemap, page copy, wireframes/mockup, GO verdict). For Aalishaan Studio that package **is the approved prototype** at `prototype/` (revision E10 = public E8, frozen 2026-09-15, + Admin A2 — 86400 UI edition (installed 2026-09-17) + the E10 additions of 2026-09-23 (D-37–D-39, whose customer-facing copy is a draft pending owner approval — NS-12–NS-15), the final Admin, installed at `prototype/admin/` on 2026-09-17 — D-PRE-23) together with its own records. This file maps each SOP input to its real location so no sprint has to guess.

Rule: the prototype is read-only reference material. The production build reproduces it; it never edits it.

## 1. Approval evidence (the "GO")

| Approval | Date | Evidence |
|---|---|---|
| Public design locked at R13 (Home, supplied About imagery, product moodboards, footer) | 2026-09-13 | `prototype/PAGE-TRACKER.md` → "Approval scope retained" |
| Admin planning baseline AF1 approved ("Perfect - Approved by me") | 2026-09-13 | `prototype/docs/ADMIN-FINAL-FEATURES.md` preamble |
| Providers confirmed: Razorpay (payments), Shiprocket (delivery) | 2026-09-13 | AF1 §1; `prototype/README.md` |
| Mobile navigation (menu left, logo centred, cart right) and Saved-artworks placement signed off | 2026-09-15 | `prototype/PAGE-TRACKER.md` → "Explicit approval, 2026-09-15" |
| Guest checkout without customer accounts agreed for V1 | 2026-09-15 | same entry |
| Mobile wall-to-materials animation and material cards (E6/M4) signed off | 2026-09-15 | `prototype/PAGE-TRACKER.md` → "M4 approval" |
| Final mobile refinements (E7/M5) and final logo (E8) authorised and published | 2026-09-15 | `prototype/PAGE-TRACKER.md` → "Resume here" |
| E8 + AF1 confirmed as the final approved development reference | 2026-09-16 | Delivery lead's instruction opening development (recorded in `docs/PROJECT-STATUS.md` §7, D-PRE-00; its Admin reference is amended by the next row) |
| Admin A2 — 86400 UI edition installed as the final Admin design reference, superseding Admin A1 and AF1 §3's menu layout (AF1's 26 capabilities and US01–US23 unchanged). **A delivery-lead decision — not an owner visual sign-off** of these screens, and not live readiness | 2026-09-17 | Delivery lead (86400 Studio): "the new final admin pages" — D-PRE-23 in `docs/PROJECT-STATUS.md` §7; package manifest `prototype/admin/CONTENTS-SHA256.txt`; the package itself states it is a local prototype (`prototype/admin/README.md`) |
| Three additions approved by the delivery lead — the order-intake pause and waiting list, online-only payment with a WhatsApp contact route, and Refunds & remedies on the Payment stage — built into prototype **E10** as sample behaviour. **A delivery-lead decision — not owner sign-off** of the screens or of the draft customer copy (NS-12–NS-15) | 2026-09-23 | Delivery lead: "Approved - please proceed" on the written proposal; D-37, D-38, D-39 in `docs/PROJECT-STATUS.md` §8a; `prototype/PAGE-TRACKER.md` E10 entry; `prototype/admin/CHANGELOG.md` |

What is **not** approved by the above: live-service readiness, the owner's commercial inputs (tax, shipping, dimensions, policy terms), and any implemented system — AF1 §1 and `prototype/docs/DEVELOPMENT-HANDOFF.md` say so explicitly. Owner **visual sign-off** is recorded only for R13, the M2 navigation and saved-artworks placement, M4 and the E8 logo; the E5/M3 and E7/M5 mobile screens and the E1 fixes are authorised and published but await owner visual review, and the final Admin screens (Admin A2 — 86400 UI edition) were installed by the delivery lead on 2026-09-17 and also await owner visual review — no owner sign-off of them is recorded in `prototype/PAGE-TRACKER.md` or in the Admin package (OI-14 in `PROJECT-STATUS.md` §8b). The published GitHub Pages prototype still shows the superseded Admin A1 at `/admin` (D-36). Build sprints reproduce the local E10 reference and flag those areas in their evidence.

## 2. SOP input → project location

| SOP predevelopment input | Aalishaan Studio equivalent | Notes |
|---|---|---|
| 1. Client answers / decisions | `prototype/PAGE-TRACKER.md` (Resume here + Approval scope retained); `prototype/docs/PROJECT-HISTORY.md` (full history) | Locked decisions are copied into `docs/PROJECT-STATUS.md` §7 with dates |
| 2. Research | Not a separate deliverable. AF1 §10 lists the provider references used (Razorpay Orders/webhooks/security checklist, Shiprocket API, OWASP upload and logging guidance) | |
| 3. Sitemap | `prototype/site-manifest.json` (60 entries, 66 aliases) and `prototype/site-map.html` | Route table reproduced in `docs/TECH-ARCHITECTURE.md` §3 |
| 4. Inspirations / visual references | The prototype itself; `prototype/assets/product-references/`, `prototype/assets/rooms/` | |
| 5. Design system | Public: `prototype/shared/*.css`, `prototype/product/r3.css`, `prototype/assets/fonts/`. Admin: `prototype/admin/studio-ui.css` — the 86400 presentation layer and the authoritative Admin layer (with `prototype/admin/studio-ui.js` for the allow-listed copy simplification and the phone record cards) — with `prototype/admin/workspace.css` and `prototype/admin/admin.css` retained unchanged beneath it | Tokens transcribed into `docs/DESIGN.md` §2; code wins on conflict. `prototype/admin/index.html` loads `admin.css` → `workspace.css` → `studio-ui.css` (last), so the Admin reference is the rendered result of the three sheets together, not `studio-ui.css` read alone |
| 6. Page plans and copy | Generated pages under `prototype/` (`index.html`, `shop-all/`, `product/`, `pages/**`) and their **sources**: `prototype/scripts/build-*.cjs`, `prototype/scripts/checkout-r9.cjs`, `prototype/scripts/studio-content.cjs`, `prototype/data/products.json`, `prototype/data/before-you-buy.json` | Generated HTML is the approved rendering; the build scripts and data JSON are the editable sources. Copy is implemented verbatim — except the E10 draft strings NS-12–NS-15 (waiting-list copy, checkout payment line, the two FAQ entries on Help and in the About hub’s search index, the privacy and cookies sentences), which are not approved until the owner approves them (D-08 confirmed 2026-09-23 at S0.0 with this carve-out; `docs/content/new-strings.md` rule 8). |
| 7. Features / flows / build plan | Admin: `prototype/docs/ADMIN-FINAL-FEATURES.md` (AF1 — canonical, 26 capabilities, US01–US23; its §3 menu layout is superseded by the final Admin — D-PRE-23) read together with `prototype/admin/CAPABILITY-MAP.md` (the capability ID → home map for the final Admin, plus the 23 acceptance-story headings). Public: the prototype's working flows (bag, checkout, saved artworks, tracking, contact, newsletter) and `prototype/docs/DEVELOPMENT-HANDOFF.md` → "Connect the public and Admin experiences" | Build order lives in `docs/ROADMAP.md` |
| 8. Final wireframes and mockup | Public: the prototype pages (E8). Admin: `prototype/admin/` — the final Admin (Admin A2 — 86400 UI edition, D-PRE-23), which its own `README.md` describes as a local prototype ("does not add production login, shared storage, live payments, shipping, messaging or automatic publication") | Admin A1 is superseded and no longer on disk (it remains in the published prototype commit `b24dce1b…`). The W1 wireframe survives only inside the package at `prototype/admin/wireframe/`, because `prototype/admin/index.html` loads `wireframe/scope.js` at runtime (the 26 capability rows and 23 story titles shown in Help & demo); W1 is never a build reference |
| 9. Handoff | `prototype/docs/DEVELOPMENT-HANDOFF.md` (review findings, corrections, owner inputs, validation evidence); `prototype/docs/REVIEW-EVIDENCE-E1.json` | Both reviewed Admin A1 — their Admin rows and counts are historical; their public findings and the owner-inputs table still apply. The final Admin's evidence is `prototype/admin/TEST-RESULTS.md` and `prototype/admin/tests/` (its stated limits are in `prototype/admin/SECURITY-AND-STORAGE.md`) |
| Locked facts | `docs/content/locked-facts.md` | Prices, catalogue counts, finish names, providers, currency conventions |

## 3. Copy extraction rule

Every build sprint that implements a page records, in its sprint prompt, the exact prototype file(s) it reproduces (generated HTML + source script/JSON). Extracted copy is compared verbatim during Preview QA (`docs/QA-CHECKLIST.md` → Content fidelity). New strings that the prototype does not contain (server-side errors, integration states, empty states for real data) are listed in `docs/content/new-strings.md` and flagged for owner approval; they follow the prototype's voice and never restate policy terms the owner has not supplied. Honest technical states may ship on the delivery lead's approval with owner review at the next check-in (decision D-24 — the delivery-lead lean, confirmed 2026-09-23 at S0.0; owner confirmation requested); commercial, policy and milestone wording is always owner-approved.

## 4. Owner inputs that remain open

The table in `prototype/docs/DEVELOPMENT-HANDOFF.md` → "Owner decisions before live sales" is authoritative. They are configuration for the launch sprints, not blockers for development; `docs/PROJECT-STATUS.md` §8 tracks each with its implementing sprint.

## 5. The final Admin at a glance

Admin A2 — 86400 UI edition (`prototype/admin/`, D-PRE-23) is the Admin design reference; AF1 stays the scope. Exact labels, stage names, slot names and counts are in `docs/content/locked-facts.md` §9 and §9a.

| Item | The final Admin | Source |
|---|---|---|
| Sections (sidebar, in order) | Orders (landing page), Customers, Products, Support, Reports, Staff & Access, Connections | `prototype/admin/app.js` (`areas`, the navigation list, default route `orders`); `prototype/admin/CHANGELOG.md` |
| Owner menu | Store setup, Access & backups (plus the prototype-only "Sign-out preview") | `prototype/admin/index.html` |
| Top bar | Global search ("Search records"), View website, Help & demo | `prototype/admin/index.html` |
| Not present | No Today screen (D-28), no Tools menu or planned-tools page (D-29), no separate Settings area; refunds are worked in Support › Refunds (D-30) | `prototype/admin/workspace.js` (route redirects); `docs/PROJECT-STATUS.md` §8a |
| Tested views | 53 views compared control-for-control and rendered at 1440, 1024, 768, 390 and 320 px (265 renders) | `prototype/admin/TEST-RESULTS.md`; `prototype/admin/tests/ui-checks.json` |
| Scenario entry points | 23 (US01–US23) in Help & demo — entry/render checks only, not end-to-end story runs; prototype scaffolding that is not built (D-31) | `prototype/admin/CAPABILITY-MAP.md`; `prototype/admin/wireframe/scope.js` |
| State-guard groups | 13, repeatable with `node admin/tests/check-state.cjs` run from `prototype/` | `prototype/admin/TEST-RESULTS.md`; `prototype/admin/tests/check-state.cjs` |
| Per-product public image slots | 8 | `prototype/admin/cms.js` line 7 |
| General (shared) image slots | 14 (7 Size guides + 7 Craft & materials) — D-34 | `prototype/admin/media-manifest.js` |

Rule: the final Admin is a local prototype. Its prototype-only mechanisms — the browser passphrase vault, the local backup/restore ZIP, the replacement-assets ZIP, "Publish in demo", the role preview and sample sign-in code, local staff records, simulated provider outcomes, the scenario demos and browser storage — are **replaced by their production equivalents, never ported** (D-32 and D-31 in `docs/PROJECT-STATUS.md` §8a). Staff roles are the owner plus the presets Operations and Customer support, with finance owner-only at launch (D-35); the preset permissions are decorative in the prototype and are enforced on the server in the build (`docs/SECURITY-CHECKLIST.md` §9).
