# E10 additions - 23 September 2026

Delivery-lead additions to the installed 86400 UI edition, made in place for the E10 development reference. Local sample behaviour only; nothing is sent, charged or published.

- Added `e10-additions.js` and `e10-additions.css` (loaded last by `index.html`): the **Order intake** control in Store setup (#settings/rules) with Pause order intake / Resume ordering, reason and confirmation, audit entries INTAKE and WAITLIST; the owner-only banner while intake is paused; the **Waiting list** page (#settings/waitlist) with sample entries, bag summaries, consent wording, reopening-notice status, Send reopening notices, Remove entry, the draft customer-facing copy and read-only visibility of entries captured by this browser's storefront preview.
- `state.js`: audit snapshot keys INTAKE and WAITLIST added to `brief()`; the snapshot tolerates a missing group. No other transactional change; the 13 state guard groups still pass.
- `settings.js`: the Business rules screen renders the Order intake panel between the rule-version notice and the rule form.
- `workspace.js`: the Payment stage shows an owner-only **Refunds & remedies** block once a payment is captured (captured amount, confirmed refunds, remaining balance, open remedies) whose "Open remedies" opens the canonical refund record in place (`panel=remedies`); non-owner roles see an owner-only notice on that pane. Support > Refunds remains the canonical refund workspace.
- State enrichment is lazy (`state.intake`, `state.waitlist`), like `staff` and `contacts`. A scenario restart keeps the intake state and the waiting list (like the catalogue and staff records); a backup restore without them re-seeds the samples. Existing saved demos are not reset.
- The storefront pair of these additions lives outside this folder: `shared/intake-e10.js`, `shared/intake-e10.css` and the regenerated bag, checkout, FAQ, privacy and cookies pages. The public bag and checkout read this Admin's saved intake state from the same browser, or the `?intake=paused` / `?intake=open` query switch.
- The vendor manifest of 17 September 2026 is kept as `CONTENTS-SHA256-86400-2026-09-17.txt`; `CONTENTS-SHA256.txt` was regenerated for the E10 folder. The "16 original JavaScript files byte-for-byte unchanged" statements below describe the 17 September package, not E10.

# 86400 UI refinement - 17 September 2026

Presentation-only update to the supplied Aalishaan_Admin_A2.zip.

- Applied the supplied 86400 light palette, sans-serif interface typography, spacing, cards, controls, status badges, segmented navigation and right-hand drawer treatment throughout the active admin.
- Removed repeated main-page introductions; shortened allowlisted static copy. Payment safeguards, upload limits, local-storage warnings, financial caveats, confirmation steps and user-entered content are retained.
- Added labelled phone record layouts without removing table columns or actions; retained scrollable dense financial tables.
- Restored focus to the initiating control when a drawer is cancelled. Added a neutral fallback for unavailable website images without changing catalogue sources.
- Retained all 16 original JavaScript files, both original stylesheets, data keys, routes, forms, options and actions. Added only studio-ui.css, studio-ui.js and small index.html shell changes.
- Added new UI regression evidence and updated installation notes. The old A2 wireframe and documentation remain as historical references.

## Inherited A2 release notes

The notes below came with the uploaded A2 package. They describe its earlier release and are not newly verified claims about files outside this admin-only upload.

# Admin A2 - Change log

## Changed
- Seven-section navigation; Orders as the landing page; owner-first header and compact Help/Demo area.
- Orders: searchable, sortable, paginated table; selected order below; eleven-stage journey; contextual production, inspection, packing, payment, shipping and document actions; multi-item context; separate fulfilment, payment and remedy facts.
- Customers: same-page profile; identity-checked contact/default-address corrections; internal tags and filtering; original-order preservation; channel preferences; email, WhatsApp and SMS draft entry points.
- Products: searchable catalogue table; same-page details/prices, public images, private files, and SEO/publication editor; draft saves; exact publication blockers; preview; pause/archive; safe unused-draft deletion; revision history.
- Public imagery: eight named product image slots, retained originals and compressed previews. Replaced product images keep their earlier bytes for revision rollback.
- General imagery: fourteen shared size, material and frame/craft-reference slots; a public-only replacement-assets ZIP using existing destinations, without hand-editing code.
- Private originals: passphrase-encrypted local file storage; original-byte downloads with verification; product/version association; separate approval evidence; released jobs pin their private-file version.
- Support: request-category tabs and same-page workspaces; refunds surfaced here using the original canonical order/payment records, with unknown/approval/completed outcomes preserved.
- Reports: Sales & money, Products, Operations; date controls; record drill-downs; explicit paid-order cohort basis; retained settlement, cost, dispute, CSV and weekly-summary tools.
- Staff: owner-only default, future local staff records with permission presets, backup/restore and recovery controls. Demo staff entries are not real accounts or invitations.
- Connections: existing services plus optional WhatsApp/SMS setup previews; honest demo/not-configured/needs-attention outcomes; no secrets requested.
- Demo experience: one ordinary order by default; 23 isolated scenario entry points with only the minimum relevant records; reset confirmations preserve catalogue and file uploads.
- Safeguards: dirty-form navigation warnings, busy-action guards, reference checks on deletion, validated backup restore, preserved original order/state guards and explicit local-versus-live labels.

## Preserved
- All 22 approved baseline product records and public website files.
- Original private-file pinning intent, purchase snapshots, reservations, inspection/packing controls, handover checks, partial fulfilment and payment/refund safeguards.
- Customer contact preferences/privacy workflow, supplier/material management, import preview and formula-safe exports, saved replies, messages, audit history, incident/recovery and capability evidence.
- Existing public and admin entry-point paths and original repo server/build responsibility.

## Not added
No real login, cloud file service, shared database, payment/shipping API calls, integrated message sending, production catalogue deployment, marketplace channel or automatic search indexing. These remain separately scoped integration work.
