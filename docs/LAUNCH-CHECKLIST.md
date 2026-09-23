# Launch Checklist

Three phases that take Aalishaan Studio from "feature-complete" to "live on [DOMAIN] and verified".
Launch is a checklist, not an event — nothing goes live on a feeling.

---

## Phase 1 — PRE-LAUNCH (days before; nothing here happens on launch day)

### Build completeness
- [ ] **Sprint mapping (`docs/ROADMAP.md`):** the Launch Gate here is sprint S3.2 (feature list, full Playwright run on the release candidate, fix loop S3.2-Fn, GO — this Phase 1 is walked there); live provider verification is sprint S3.3 (Production scope only, sales still closed); Phases 2–3 are sprint S3.4.
- [ ] All MVP sprints merged to `main`; no sprint half-open.
- [ ] `docs/QA-CHECKLIST.md` passed in full on the current `main` (both parts).
- [ ] 🔴 **Launch Gate passed:** the whole-site test run (`docs/testing-setup/`) is 100% green — GO verdict recorded in the latest `docs/test-reports/` report, from a FULL run on the release candidate. A partial run never counts. Launch-blocking.
- [ ] `docs/SECURITY-CHECKLIST.md` passed in full — every blocking item resolved, not deferred.
- [ ] `docs/ENVIRONMENT-PARITY.md` §12 is current: applicable Preview proofs pass, unused services are N/A with reasons, and no live-only launch check is being mistaken for a prerequisite to safe Preview testing. Database sites also have the §7.10 schema/policy comparison and any planned migration difference explained.
- [ ] Payment sites: sandbox success/failure and relevant subscription lifecycle checks pass; the owner verifies live account readiness and webhook configuration per `docs/ENVIRONMENT-PARITY.md` §8 C15–C16. Do not create real-card purchases for testing; use the provider's approved testing procedure.
- [ ] Post-launch items live in the backlog, not in your head.
- [ ] Database sites: a full restore from backup/PITR has been **rehearsed once** on a non-production copy and the result recorded. An untested backup is not a backup. (DB-less lead data is covered by the conversion-durability rule below.)

### Content
- [ ] Real content everywhere — zero placeholder text, zero `[placeholder]` tokens, zero stock "lorem".
- [ ] The locked facts/numbers list verified: every exact claim the site makes is correct and identical site-wide.
- [ ] All images are final assets, optimized, with alt text.
- [ ] Content/CMS sites: editor roles, draft-review-publish flow, redirects, media ownership, backup/export, and client training are approved.

### SEO basics
- [ ] Every page has a unique `<title>` and meta description.
- [ ] OG image set and rendering (test with a share-preview tool).
- [ ] Favicon + app icons present.
- [ ] `sitemap.xml` and `robots.txt` generated and correct.
- [ ] Canonical URL derives from the single public site-URL variable named in `TECH-ARCHITECTURE.md` — not hardcoded.
- [ ] Key pages meet the approved performance budget recorded in `QA-CHECKLIST.md`.

### Legal and tracking
- [ ] Legal pages live (privacy, terms, cookies — whatever the client's jurisdiction requires).
- [ ] Analytics installed IF agreed with the client — and covered by the privacy page.
- [ ] **The measurement instrument for the PRIMARY success metric** (the tool named in the approved predevelopment success and measurement requirements) is installed and **verified capturing events** — analytics event, form-tool dashboard, or DB count. The one number that defines success must be measurable on day one, or the project cannot prove it worked.
- [ ] **Consent mechanism (where the jurisdiction requires prior consent):** the consent gate actually blocks third-party/analytics scripts **before** consent (verified in the browser, not just a banner present), and a data retention/erasure path exists.
- [ ] **D-12 (`docs/PROJECT-STATUS.md` §8a, lean confirmed at S0.0):** no analytics or third-party scripts and no consent banner in V1 — essential cookies only (staff session, Turnstile), Cookie Policy copy stays; the primary success metric (paid orders) is measured from the orders table (Reports R1), so the "instrument" item above is verified as a DB count, and the analytics/consent items above are N/A unless analytics are added by a later decision.

### Conversion durability & deliverability
- [ ] The primary conversion has **≥2 independent capture paths** (e.g. email + provider dashboard / second recipient / store) — a single mailbox is not acceptable.
- [ ] Email-based conversions: **SPF, DKIM, and DMARC** are configured on the sending domain (records added in Phase 2), and a submission from an **external** address lands in the inbox, not spam.

### Monitoring (configured before launch, not after)
- [ ] **Uptime monitor + primary-conversion canary** with alerts to a **named owner**, so a silent failure weeks later (broken form, expired key, provider change) is caught without waiting for the client to notice.
- [ ] **Morning check ready** (`docs/testing-setup/templates/MORNING-CHECK-TEMPLATE.md`): the owner-approved 5–7 `@morning` tests are tagged, the workflow is committed, and the failure email is verified — enable it on launch day. Verify recent scheduled runs and missed-run detection. A check that never submits cannot prove delivery/payment processing; record the provider alerts or separate approved check covering that requirement.
- [ ] **Error tracking live** (`docs/error-tracking/SETUP-CHECKLIST.md`): Sentry installed, Production alert rule on, deliberate test error received and confirmed by the owner.
- [ ] **Domain and SSL expiry monitoring/alerts** enabled with a named owner — the #1 small-site outage is a lapsed renewal.

### Approval
- [ ] Client has seen the full site on the production URL (or final Preview) — desktop and mobile.
- [ ] Client written launch approval received (email or message — in writing, dated).

**Why this matters:** the approval line makes launch the client's decision, on a site they have actually seen.

**Never do this:**
- Never launch with an unresolved security-checklist blocking item.
- Never launch with placeholder content "we'll swap later".

---

## Phase 2 — LAUNCH DAY

- [ ] Connect `[DOMAIN]` to `aalishaan-studio-app` on `Vercel`; add only the provider-specified DNS records.
- [ ] Email-based conversions: add the sending domain's **SPF, DKIM, and DMARC** DNS records alongside the host records.
- [ ] Wait for DNS to propagate and SSL to issue — the padlock must be valid before you announce anything.
- [ ] Decide www vs apex as canonical; configure the other to 301-redirect to it.
- [ ] Update the site-URL env var in Production to the real domain, then redeploy
      (env changes do not take effect without a redeploy).
- [ ] If auth is in use: update the Production auth Site URL and exact callback allow-list to the new domain. Keep an old callback only while it remains controlled and needed for existing links; record its removal date. Keep TEST restricted to local/Preview hosts and re-run the applicable URL proofs in `docs/ENVIRONMENT-PARITY.md` §12.
- [ ] Verify security headers on the LIVE domain response (`curl -I https://[DOMAIN]`) —
      config reading is not deployed reality.

---

## Phase 3 — POST-LAUNCH SMOKE TEST (on the real domain, same day)

- [ ] Every page loads over https on [DOMAIN] — click through the full sitemap.
- [ ] Primary conversion flow end-to-end as a real visitor: form validates, submits, confirmation shows.
- [ ] Forms actually deliver: send a REAL test submission from an **external** address and confirm it arrives **in the inbox (not spam)** AND that the **second capture path** also recorded it.
- [ ] Mobile pass on a real phone: home, conversion page, one deep page.
- [ ] Canonical, og:url, sitemap URLs all show the new domain — nothing pinned to the old host.
- [ ] Relaunch only: spot-check the **301/410 redirect map** on the live domain — the top old URLs land on their new destinations, never a bare 404.
- [ ] Search console: property added, ownership verified, sitemap submitted.
- [ ] No accidental `noindex` anywhere — check the live HTML head and response headers.
- [ ] Auth (staff only — no public sign-up): staff invite acceptance / sign in with MFA / password reset on the live domain; email links land on [DOMAIN].

### The 48-hour watch
- [ ] Monitor errors (host logs / error tracker) and form deliveries for 48 hours.
- [ ] Log every issue found to the post-launch backlog with severity.
- [ ] Fix via the normal workflow: branch → build → local checks → PR → deployed Preview (Vercel or approved equivalent) → Codex review → merge → Production smoke test.

**Never do this:**
- Never hotfix directly on `main` in a launch-day panic — if production is broken, use `docs/ROLLBACK.md`.
- Never mark launch "done" without a real test submission delivered.

Next step → if anything breaks in production, `docs/ROLLBACK.md`. When the dust settles, `docs/HANDOFF.md`.
