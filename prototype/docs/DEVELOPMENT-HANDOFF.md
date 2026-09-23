# E1 development handoff

14 September 2026. Independent review of the storefront and connected Admin from customer, design/accessibility, studio operations and development perspectives.

**Status: reviewed E1 development reference, ready for implementation and static prototype hosting.** The source/asset checksum baseline freezes the reviewed files. Use this handoff alongside [AF1](ADMIN-FINAL-FEATURES.md). [PAGE-TRACKER.md](../PAGE-TRACKER.md) preserves actual owner approvals; final owner visual acceptance of E1/A1 and live-service acceptance remain separate.

**E10 additions, 23 September 2026:** the order-intake pause and waiting list, the online-only payment line with a WhatsApp contact and the Payment-stage Refunds & remedies block were added to the prototype as sample behaviour (see [admin/CHANGELOG.md](../admin/CHANGELOG.md) and the E10 entry in [PAGE-TRACKER.md](../PAGE-TRACKER.md)). The customer-facing copy is a draft for owner approval.

**Admin update, 17 September 2026:** the connected Admin A1 reviewed below was replaced by Admin A2 — 86400 UI edition ([admin/README.md](../admin/README.md), [CAPABILITY-MAP](../admin/CAPABILITY-MAP.md), [TEST-RESULTS](../admin/TEST-RESULTS.md)), installed in place at admin/. The Admin rows in Review findings and Validation evidence describe A1 as reviewed on 14 September and are retained unedited as the E1 record; they are not evidence about A2. AF1 scope is unchanged. No owner visual sign-off of the A2 screens is recorded; see [PAGE-TRACKER.md](../PAGE-TRACKER.md).

## What developers should reproduce

- Public R13 composition, typography, artwork, supplied About imagery, Product R12 moodboards and R13 footer, with the M1 mobile refinements and E1 functional corrections.
- All 58 public page entries and Admin A2 — 86400 UI edition ([admin/README.md](../admin/README.md)). [The page directory](../site-map.html) and [manifest](../site-manifest.json) define the routes. W1 is retained as historical design reference; A2 (86400 UI edition) is the current Admin and supersedes the A1 reviewed in E1.
- A2 prints and the 22-artwork catalogue. White ₹19,000, Black ₹21,000 and Antique Gold ₹23,000 remain the public artwork prices. Admin monetary values are paise. Final shipping/tax is a separate unresolved commercial input.
- Seven Admin sections: Orders (the landing page), Customers, Products, Support, Reports, Staff & Access and Connections. Store setup and Access & backups open from the owner menu; global search, View website and Help & demo sit in the top bar. AF1's capability IDs are mapped to these homes in [admin/CAPABILITY-MAP.md](../admin/CAPABILITY-MAP.md); AF1's six-menu layout with a Tools page, separate Settings and a Today entrypoint is the superseded A1/W1 navigation, not the current Admin. Preserve contextual original-record links and separate payment, fulfilment, remedy and settlement states.
- AF1's 26 V1 capabilities and US01-US23 acceptance stories. Four normal customer message milestones; provider confirmation and physical handover have distinct meanings. Accounting, CRM, dedicated Customer Support and V2 stay deferred.

Use [README source ownership](../README.md#source-ownership). Generated HTML is a deliverable, not its editing source. Match the prototype visually at desktop and phone widths, then replace the demo data/actions with the required server behavior. Do not ship fake payment success, sample logins or browser role checks as working integrations.

## Review findings and corrections

| Perspective | Core problem | E1 correction |
|---|---|---|
| Customer | Product and shared bag used competing persistence/rendering; duplicate rows and excessive quantities were possible | One bag API, merged artwork/finish rows, consistent quantity cap and clear storage recovery |
| Customer | Saved hearts had no usable retrieval journey | Saved artworks filter, remove/reset controls and useful no-match/empty recovery on Shop |
| Customer | Browser Back could leave checkout disabled; old delivery data could mislead | Restored checkout state and rechecked stale delivery estimates |
| Customer/privacy | Storefront reset could remove Admin data; forms could submit without JavaScript | Explicit storefront storage ownership, protected Admin key, disabled no-JS sample submissions and clearer sample messaging |
| Design/accessibility | Drawers allowed background focus; Admin skip/menu behavior misrouted or reached off-screen controls | Inert background/closed navigation, focus transfer/return, correct skip behavior and responsive menu handling |
| Design/accessibility | Small Admin supporting text failed the reviewed contrast threshold | Darkened supporting text within the retained grey/green palette; default screen scan recorded no remaining findings |
| Design/mobile | Copied footer srcset paths were relative to the wrong nested directory | Fixed source builders so all responsive candidates resolve at every page depth |
| Hosting | Hero URLs in CSS custom properties resolved against the shared stylesheet and escaped the GitHub project path | Emit document-relative hero image rules, including mobile variants; verified actual background decoding under a project subfolder |
| Studio operations | Stale filters could overwrite work; quantity/capacity and stock checks were incomplete | Stale-tab protection for saves, quantity-aware limits and material recheck before printing |
| Business/finance | A one-item remedy could exceed affected value; a refund could leave bank matching falsely current; repeated credit notes could duplicate value | Item-value cap, reconciliation invalidation with retained evidence, unknown-fee handling and credit-note deduplication |
| Customer support | Closing one case could resolve other case tasks; enquiries required an order; old return events could erase progress | Separate owned case tasks, pre-purchase contact/case capture and receipt/inspection progression with retained history |
| Support recovery | Draft-only saved replies had no useful next action | Explicit approval/recovery state |
| Development | Documentation still directed developers to inactive W1; source could drift from the reviewed reference | Current A1/M1/E1 guides, shared catalogue checks, reproducible build checks, source hashes and verified archive |

Home's mobile promise text received a small gradient-stop refinement. The measured minimum contrast is 6.33:1 across nine widths from 320 to 900 pixels, including text opacity and the actual image background. Approved imagery and composition are preserved; Home's full regression suite passed again.

## Owner decisions before live sales

The owner explicitly chose on 13 September to **keep shipping charges, tax treatment, outer framed dimensions and cancellation/return/refund terms listed as owner decisions required before live sales**. Their absence does not block prototype hosting or beginning development. Do not replace them with guessed terms, zero charges or example Admin rule values.

| Required input | Responsible decision | Implementation gate |
|---|---|---|
| Seller legal identity, address, applicable registrations and policy contact | Owner with appropriate business advice | Published live terms, privacy information and financial documents |
| Tax classification/treatment and whether displayed prices include it | Owner/accounting adviser | Server pricing, checkout total, invoices and credit notes |
| Shipping charges, supported destinations, production/transit promises and working days | Owner/fulfilment lead with Shiprocket configuration | Purchasability, checkout and customer delivery commitments |
| Outer dimensions for each finished orientation/frame, packed dimensions and actual weights | Studio/fulfilment lead | Product facts, parcel rates and booking |
| Production commitment point, cancellation/change cut-offs, damage reporting, return eligibility, remedy scope and refund timing | Owner with approved policy advice | Public policy text and Admin decision rules |
| Materials/BOM, capacity, reservation expiry, rework/waste rules and quality/packing evidence | Studio/operations lead | Readiness checks and production acceptance |
| Production files, rights evidence, physical sample approvals and packaging/protection evidence | Studio owner | Publishing products and releasing jobs |
| Razorpay account capture/refund/settlement configuration; Shiprocket account/status mapping and dashboard fallback | Owner and integration developer | Live payment, settlement, delivery and remedy actions |
| Transactional sender/provider and four milestone templates; optional channel consent | Owner/developer | Actual confirmation, production, dispatch and delivery messages |
| Roles, financial approval limits, identity verification, retention/deletion and export rules | Owner | Real staff/customer access and protected data |
| Invoice/credit-note issue point, numbering and correction rules | Owner/accounting adviser | Real financial documents |
| Order volumes, response targets, recovery time and permitted data loss | Owner/developer | Measured production release criteria |
| Real social links | Owner; explicitly deferred | Activating links in the live footer |

These are configuration/content inputs to V1, not new feature proposals. AF1 section 7 remains canonical. The current public policy pages intentionally describe the prototype or state that final terms are pending.

## Connect the public and Admin experiences

The two demos intentionally use separate synthetic datasets. A public sample checkout does not create an Admin order, and Admin catalogue edits do not publish public pages. The production build must connect them as follows:

| Customer action/state | Required shared behavior | Reference |
|---|---|---|
| Add to bag / choose finish | Resolve stable artwork/variant IDs; treat browser price and availability as display only | P1, O3 |
| Submit checkout | Revalidate variants, quantities, serviceability, all charges and current policy. Save pending order and purchase snapshot before initiating payment | O2, O3 |
| Failed, cancelled or uncertain payment | Keep the order/attempt identity, retain customer selection and show a recoverable state. Verify uncertain outcomes before another payment attempt; never display paid success from a browser callback alone | O3, G4, US02, US03 |
| Verified captured payment | Confirm once; show the correct immutable receipt/order details and expose readiness exceptions to Admin | O2-O4, S3 |
| Production and dispatch | Pin file/variant/quantity; check holds and materials; require quality/packing evidence. Physical handover, not label creation, drives dispatch | O4-O7 |
| Public tracking | Authorise access without exposing another customer. Derive customer milestones from verified item/parcel events; split orders remain partial until resolved | O2, O6, C1, G1 |
| Support and remedies | Create linked cases; verify identity before sensitive disclosure/change. Refund, return receipt, replacement, delivery and settlement remain distinct operations | O7-O9, C1, S1-S3 |
| Saved artworks / contact / newsletter | Preserve selected artworks; make submission, consent, opt-out and send outcomes explicit. The live contact/signup result must reflect a real service outcome | C2, S1, G4 |

Reuse the prototype's form errors, notices, empty states and record layouts for integration states. Provider-hosted payment screens and real authentication are implementation work. Review their working behavior with the owner; a static screenshot cannot approve provider or security behavior.

## Validation evidence

| Check | Completed evidence |
|---|---|
| Source build and references | 60 registered entries, 66 aliases; local references and 22 suggested frames / 154 gallery mappings / 11 style covers validated |
| Home | Nine viewports; navigation/drawers, FAQs, wishlist, scroll/resize, reduced motion and no-JavaScript fallback |
| Products | 32 review groups across all 22 artworks, three finishes, galleries/zoom and responsive layouts |
| Commerce | 390/1440 checkout, invalid/serviceability states, receipt/PDF and tracking; eight added integrity groups for bag, storage, Back, saved artworks, focus, estimates and no-JavaScript forms |
| Mobile | 174 page/width combinations: all 58 public entries at 320/390/430; no overflow, clipped headings, image or browser failures. Touch-context navigation/purchase and landscape checks passed |
| Admin | 57 screens at 360/390/768/1440 = 228 checks; 23 story loaders, connected normal/exception journeys and 11 recorded browser check groups |
| Admin model | 13 guard groups: payment repetition, competing materials/refunds, holds, stale edits, unknown shipping, atomic rollback, item value, stock, settlements, cases and safe CSV |
| Admin contrast | 57 default screens inspected for visible text against solid backgrounds; no remaining findings below the review threshold. This is not a comprehensive accessibility certification |
| Source handoff | Local document links, current Admin routes, asset paths, regular Git file sizes and public/Admin catalogue/price parity checked |
| Static hosting | 797 exported files, 535.1 MiB; 7,497 static/metadata references and exact case verified. All 60 entries plus directory, 66 aliases with query/hash, desktop/mobile CSS heroes, Admin deep links, cart-to-checkout and nested 404 recovery passed under /prototype-check |
| Source/archive | Baseline verification runs before packaging; every ZIP entry is checked against its source by SHA-256. The archive can be extracted and rebuilt without installed dependencies |

The [compact evidence record](REVIEW-EVIDENCE-E1.json) accompanies this handoff. Full local evidence is in preview/home, preview/home-contrast-e1, preview/products, preview/commerce, preview/mobile-m1, preview/admin-a1, preview/independent-design and preview/static. Screenshots of public mobile layouts, checkout/saved artworks, project-hosted heroes and Admin records were inspected. Full local screenshots are excluded from hosting and the source archive.

Review limits: Chrome desktop and mobile/landscape emulation are used. This is not a claim of testing Safari, Firefox, physical devices, assistive technology, live provider accounts, load, real security or actual order fulfilment. During implementation, exercise AF1 US01-US23 with durable data, permissions, repeated/concurrent events and provider outages. Real-device and browser acceptance belongs to the release checks.

## Freeze and development acceptance

data/development-baseline.json records every included source/asset file by SHA-256, normalising text line endings for Git. check:baseline detects accidental edits, additions or missing files. The source ZIP is verified entry-by-entry against its source. The workflow checks the reference after rebuilding, so generated output must be reproducible.

Technical freeze and owner approval are separate. The previous public R13 and AF1 approvals remain recorded. E1 changes and the implemented A1 screens have not yet received explicit final owner visual sign-off. Review [Home](../index.html), [all pages](../site-map.html) and [Admin](../admin/index.html), then record the owner's exact approval and scope in PAGE-TRACKER. Passing checks never supplies that approval.

Build V1 in AF1's connected slices: order/payment/security foundation; production/materials; packing/shipping; support/remedies/documents; reports/automation/recovery. Keep the frozen prototype available for side-by-side visual comparison. Record intentional deviations and affected story IDs.

## GitHub Pages handoff

The source repository includes .github/workflows/pages.yml. Set Pages source to GitHub Actions and push source to main. No remote repository or Pages deployment has been created by this review.

dist/site is the static hosting output; releases/Aalishaan-Studio-Prototype.zip is the source handoff. The export supports project subfolders and includes relative redirects and a custom 404. Its Admin is a public fictional demo. A noindex directive discourages indexing and is not access control. Use no real customer records, credentials or private print masters in this hosted prototype.

GitHub's [custom workflow guide](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) supports the build/deploy configuration. [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) distinguish static preview hosting from running a commercial transaction service. The live store/Admin need application hosting, durable records and the integrations above.
