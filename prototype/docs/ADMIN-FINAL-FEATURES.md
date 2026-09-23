# Aalishaan Studio — final Admin features and acceptance stories

**Revision AF1 · 13 September 2026 · Canonical planning baseline**

The owner approved the proposed stories and direction with “Perfect - Approved by me” and requested a final independent review, strengthening and consolidation. This document records that approved direction and the review refinements authorised in the same request. It is the single reference for subsequent Admin design, development and acceptance. It does not claim that the owner has inspected an implemented system or that live readiness has been achieved.

Earlier feature lists, menu guides and narrative documents remain historical supporting material. Where they differ, **this document controls**. Change this document deliberately when scope changes, record the reason and revision, and keep feature/story IDs stable.

## 1. What we are building

A practical Admin for Aalishaan's made-to-order artwork business: routine orders move under approved rules; people make and inspect the artwork; exceptions reach the right person with a clear next action. The owner should not need to approve every normal step or repeatedly copy records between systems.

**Confirmed decisions**

- Payments: **Razorpay**. Delivery: **Shiprocket**.
- Public design remains locked at **R13**, including the current catalogue configuration, three frame finishes and Product R12 moodboards. This plan does not add public screens, rewrite policies or introduce catalogue/price changes from the older source attachment.
- The eventual live implementation must connect the existing public purchase, availability and tracking flows to reliable shared records. Public design approval does not mean the present local checkout is already connected. Necessary server validation and integration are part of live readiness; a material public interaction change must be raised explicitly rather than silently redesigning the approved experience.
- Dedicated in-house **Accounting, CRM and Customer Support** tools come after V1. Their planning, implementation and build order remain on hold. No paid accounting/helpdesk subscription is a V1 dependency.
- V1 still contains essential invoice documents, financial records, customer history and basic support. Deferring dedicated tools cannot defer these operating needs.
- Preserve the current A2 launch configuration. Do not introduce COD, new sizes, finishes, custom orders or additional sales channels automatically.

**The distinction that matters:** the existing Admin screens are demonstrations. Completing a wireframe or local prototype is a design milestone. **Live V1** requires durable records, real permissions, working provider connections and the acceptance evidence in this document.

## 2. Independent review: what changed and why

| Decision | Final treatment |
| --- | --- |
| Too many apparent features/screens | Consolidated 33 earlier V1 items into 26 capabilities inside six menus. Checks, history and contextual actions live with the relevant record. |
| Order only described after successful payment | Save an internal pending order and purchase snapshot before starting payment; confirm it only after verified paid/captured status. This closes a recovery gap. |
| Payment and shipping updates treated as a straight line | Accept delayed, missing and repeated provider events safely. Verify uncertain outcomes before retrying money or shipment actions. |
| Several people may act on the same record | Add protection against stale edits and concurrent refunds, cancellations, reservations and dispatches. |
| Happy path assumed one parcel | Keep quantities and item/parcel relationships, with partial fulfilment and partial remedies. No advanced warehouse system required. |
| Cancellation could race with production | Make the accepted change/hold and the production start mutually checked operations; no silent cancellation while the studio continues working. |
| Accounting deferred too broadly | Keep approved invoice/credit-note documents, settlement checks, costs and exports in V1; defer bookkeeping and tax-filing software. |
| “Automatic” could hide uncompleted work | Each critical operation has recorded intent, outcome, owner, retry/fallback and an attention task if unresolved. |
| Stock/capacity scope could become excessive | Simple component quantities, reservations, supplier availability and daily capacity first. Forecasting, optimisation and purchasing automation wait. |
| Customer/profile duplication | Do not merge people solely because an email/phone is shared. Reviewed linking preserves original orders and consent evidence. |
| Too many customer messages | Four normal milestones: confirmation, production start, dispatch and delivery. Add relevant exception/resolution messages; no message for every internal substage. |
| Future tools could duplicate the Admin | Keep shared identities and one owner for each action; no parallel refund, customer-consent or support-case system. |
| Broad growth promises | V2 is a conditional backlog. Build only against a recurring problem and measurable benefit. No autonomous-growth claim. |

The review adds safeguards to the approved work; it does not start another product line. The sources used to verify payment, shipping and security constraints are listed before the acceptance stories.

## 3. Where you will work

| Menu | Pages/tasks | Everyday purpose |
| --- | --- | --- |
| **Orders** — default | Today; All orders; Make & pack; Ship & deliver; Payments & refunds | See what needs attention and complete each order. |
| **Customers** | Customer list; profile opened from a person or order | Understand who bought and their history/preferences. |
| **Products** | Artworks; Collections; Materials; Import records | Manage what can be sold and made. |
| **Support** | Open requests; Returns & damage; Saved replies | Resolve customer questions and problems. |
| **Reports** | Sales & money; Artwork performance; Operations | Identify useful decisions and verify totals. |
| **Tools** | Accounting; CRM; Customer Support, marked planned | One small landing page for the later applications. No fake working tools. |

**Settings**, separate from the daily menu: Staff & access; Connections; Business rules; System checks and operating guides. Contextual help appears beside work. Global search opens original records, not duplicate copies. Hide inaccessible areas from staff while enforcing access on the server too.

## 4. The final normal order journey

**Pending payment → Paid & confirmed → Ready to make → Printing → Framing → Quality checked → Packed → Pickup booked → Shipped → Out for delivery, when reported → Delivered**

These are working stages, not a requirement to add all of them to public tracking. Payment, physical fulfilment, support, refund and settlement have separate statuses. A delivered order may have an open claim; a refunded order may still have a parcel in transit.

| Step | What happens | What permits the next step |
| --- | --- | --- |
| Pending payment | Save a stable internal order, prices/quantities and purchase facts; validate availability/serviceability and establish the payment attempt. | Correct Razorpay reference, verified amount/currency and a confirmed paid/captured outcome. An authorisation alone is insufficient. |
| Paid & confirmed | Record payment once, confirm to the customer and check production readiness. | Approved file, materials and capacity available; no active change/hold. A paid exception remains visible, not discarded. |
| Ready to make | Reserve materials and assign a job with due date. Normal eligible orders need no founder approval. | Responsible person starts the physical printing job after rechecking the current order/hold state. |
| Printing → framing | Record actual progress against the pinned file and selected components. | Work is complete and ready for inspection. A new catalogue file cannot silently replace the job's version. |
| Quality checked | Record required checks and finished-artwork evidence. | All required checks passed. Failure goes to rework with a reason. |
| Packed | Record packing checks, parcel photo and actual parcel measurements. | Correct contents/address and approved shipping configuration. |
| Pickup booked | Create a Shiprocket shipment, label and pickup arrangement. | Recorded physical handover/collection evidence. Label creation is not dispatch. |
| Shipped | Record handover and send the approved dispatch message. | Verified courier progress. Missing intermediate events do not prevent a valid later delivery event. |
| Delivered | Record delivery confirmation for the parcel's items; send the appropriate delivery update. | All required parcels delivered or otherwise explicitly resolved before the whole order is called complete. |

In parallel, issue the invoice at the approved point, match Razorpay settlements and fees, and record actual costs when available. Financial closure does not depend on pretending that settlement and delivery happen together. An accepted return is not automatically received; inspect it before recording recovery, rework or disposal.

Normal messages are confirmation, production start, dispatch and delivery. For a split order, describe the specific items/parcel rather than implying everything has shipped. A valid address correction may affect courier arrangements; updating an address field alone does not correct an already booked shipment.

## 5. Version 1 — required capabilities

The IDs below are the build and acceptance references. Every capability needs a normal state, a useful empty/error state and a clear next action where applicable.

### Orders

**O1 — Today, search and organised work.** Show due/overdue orders, payment problems, material/quality holds, delivery exceptions and unanswered cases. Give each task an owner, deadline, severity and next action. Keep acknowledged problems visible until resolved or reassigned. Search by customer, order, artwork and provider reference; combine filters, preserve them on return and save common views. Safe bulk actions show a preview and individual success/failure results. No separate decorative dashboard or bulk refund/publish automation in V1.

**O2 — The complete order record.** Keep customer contact/address, items, quantities, frame, currency, money breakdown, promised dates, policy version and purchase snapshot. Link job, parcel, payment, invoice, support and remedy records using stable IDs. Record individual quantities through production and parcels; prohibit over-shipping or replacing the same quantity accidentally. Separate requested changes from the purchased snapshot. Keep original and revised promises with reasons; never improve on-time statistics by overwriting the first promise. Concurrent edits must not silently overwrite another person's decision.

**O3 — Razorpay payment control.** Save the pending order before opening payment and associate every payment attempt. Validate price, quantity, amount/currency and purchasability on the server, not from the browser. Verify provider signatures and paid/captured status; safely handle duplicates, late payments, multiple attempts and missing callbacks. A late payment after a reservation expires triggers a fresh readiness check; it does not steal materials from another confirmed order. Unmatched receipts, extra payments or amount mismatches go to a review task. Recovery uses provider and internal references, not blind order recreation. Never store card details or banking secrets.

**O4 — Production, reservations and deadlines.** Generate a job sheet with pinned file version, dimensions, finish, owner, due date and instructions. Record printing/framing progress, holds, rework and actual start. Starting production must check the current payment and cancellation/hold state together. Use simple working-day/capacity rules and material reservations; release reservations only where appropriate on expiry or cancellation, and distinguish unused material from consumed/wasted material. A shortage warns on accepted orders and prevents new unsupported promises. V1 uses assignment and due-date rules, not an optimisation engine or supplier portal.

**O5 — Inspection and packing.** Require the approved checklist for print, frame, acrylic, backing, hanging and packaging, plus completion evidence. Record the person, timestamp and result. Failed checks prevent normal packing/dispatch and create rework. Pack by item/quantity; capture actual weight, dimensions, packaging version and parcel photos. A manual correction must be explained and audited, not silently erase a failed inspection. Evidence uploads are protected under G1/G5.

**O6 — Shiprocket and delivery exceptions.** Check configured serviceability/rates; create and link shipments, labels and pickup arrangements using eligible parcels. Keep internal order, Shiprocket order/shipment and tracking IDs distinct. Record protection as confirmed/unconfirmed with terms/evidence, never assume universal cover. A timeout after booking means outcome unknown: check for the existing shipment before another creation attempt. Receive authenticated updates and verify ambiguous states; track stale tracking, failed pickup/attempt, loss, return-to-origin and delivery deadlines. Support documented manual provider-dashboard fallback and reconnect its references/history. Basic retry/reattempt actions are required; advanced routing waits for V2.

**O7 — Changes, holds and cancellations.** Apply the approved policy to the actual item/job stage. Record request, scope, reason, decision and communications. Coordinate cancellation and production-start checks so only a permitted outcome can proceed. Address or frame changes revalidate costs, eligibility and serviceability; never silently substitute a different product. V1 need not invent a custom top-up payment flow: an increased-price change follows a documented owner-approved cancel/reorder or other supported process. Already booked/dispatched shipments require their own correction/stop/return follow-up. Cancellation and refund remain separate operations.

**O8 — Refunds and linked replacements.** Authorised staff approve full/partial remedies by affected items and quantities. Create linked replacement jobs using the confirmed remedy details; replacements are costs/fulfilment, not extra sales. Refunds have requested, approved, submitted, confirmed-completed and failed/unknown outcomes. Remaining refundable balance accounts for completed and outstanding submissions; concurrent approvals cannot exceed it. Check uncertain outcomes with Razorpay before retrying. Track refund/chargeback overlap for review to avoid compensating twice. Approval, customer communication and provider completion are separately visible.

**O9 — Settlements, disputes and essential documents.** Compare Razorpay payments, refunds, fees and settlements with the matching bank receipts. Provider “settled” and bank-matched remain distinct. Detect differences, unmatched transactions and dispute evidence deadlines. API import is preferred where practical; validated statement import/manual matching is a valid V1 route. Issue approved invoices/credit notes with unique numbering, source-order links and correction/void history according to confirmed rules. Do not silently rewrite issued documents. Provide protected finance exports. No general ledger, tax-return filing, payroll or full procurement accounting in V1.

### Customers

**C1 — Customer directory and history.** Link guest purchases, relevant contact details, notes and service history without requiring public customer accounts. Search opens the original orders/cases. Potential duplicates may be flagged, but shared phones/emails do not justify automatic merging or disclosure of another person's records. Reviewed linking/merge corrections retain their history and original purchase details. Verify identity appropriately before sensitive support disclosures or changes; retain no unnecessary customer data.

**C2 — Contact preferences and privacy work.** Store permission by channel, source, wording/version and time; unknown means not granted. Keep transactional service messages distinct from promotions. Record opt-out, correction/deletion requests, identity checks, retention obligations and completed actions. Apply withdrawals to connected tools when they exist. Retain only approved required records and show when deletion must wait for an applicable retention/active-case requirement. No automatic marketing programme or universal channel synchronisation is assumed in V1.

### Products

**P1 — Catalogue, variants and collections.** Manage the current artwork records, collection/style/mood/room metadata, display order and featuring within existing templates. Draft, review, active, hidden and retired states preserve history. Each artwork/frame variant has a unique code, approved price/tax fields, availability, lead time and shipping facts. Preview changes, show validation errors and record approval. Hiding does not cancel existing orders. Price and availability changes are revalidated at purchase, and existing order snapshots remain intact. No fourth finish, larger size or catalogue expansion is implied by the older source document.

**P2 — Images, rights and approved production files.** Separate public assets from private master/print files, evidence and instructions. Keep file versions, approval owner/date, dimensions, rights evidence, copy and verified product facts. Block publishing incomplete records or unresolved required placeholders. Require approved physical samples and the relevant artwork/file checks. A replacement file or specification has a visible approval impact; an already released job keeps its pinned version unless explicitly reviewed and changed. Preview and rollback restore catalogue content without changing issued documents or historical order facts.

**P3 — Simple materials and suppliers.** Record required components per variant, quantities/units, usable stock, reservations, incoming receipts, consumption, waste and stock corrections with reasons. If a supplier owns stock, record confirmed availability and when it was checked rather than inventing exact on-hand numbers. Do not count planned deliveries as usable stock. Keep supplier contacts, lead times and a simple reorder list. Reservations must be safe when two orders compete for the final available materials. Production booking and checkout holds have explicit expiry/release rules. Full purchasing software and demand forecasts are deferred.

**P4 — Safe imports and exports.** Provide a reusable catalogue import format, preview, duplicate checks, row-level errors and explicit application of valid changes. Imports never auto-publish drafts. Avoid blind bulk overwrites; show conflicts with newer edits and preserve a recoverable change history. Export orders, products, cases and financial records with stable IDs and permissions. Protect customer exports, neutralise spreadsheet formula injection and expire generated download access. No custom report-builder or arbitrary data pipeline in V1.

### Support

**S1 — Basic requests and approved replies.** Record and assign enquiries linked to customer/order records, with priority, first-response/resolution targets, private notes, status and saved replies. Manual capture from existing email/phone/WhatsApp is acceptable in V1; show the actual source and whether a response was sent, not a fictional synchronised inbox. Track reopened cases and reassignment. Avoid duplicate case ownership. The dedicated support tool's unified channels, routing and AI are later projects.

**S2 — Damage, returns and claim resolution.** Bring customer evidence and pre-dispatch photos together, with request type, approved policy version, dates, review decisions and reasons. Missing video alone must not trigger an automatic decline; follow the approved policy and evidence review. Track pickup, actual receipt/inspection and outcome of returned items. Link courier compensation independently from the customer's remedy and record claim deadlines/recovery costs. Support recommends remedies; Orders owns execution under O8. A resolved case can reopen without erasing its history.

**S3 — Necessary automatic messages.** Use approved templates for the four normal milestones plus genuine delays, decisions, replacements and refunds. Require a functioning transactional delivery channel for live V1; select its provider/domain setup during implementation. Email is the minimum launch channel; automated WhatsApp/SMS is not assumed without configuration and separate approval. Send only after the corresponding event is safely recorded. Log the template/version, recipient, attempt and known delivery status; provider acceptance is not proof the customer read it. Retry safely and alert after exhaustion. Check uncertain sends before manual fallback/resend; suppression and parcel/item context prevent misleading updates.

### Reports

**R1 — Sales and money that reconcile.** Report paid orders, collected amounts, refunds, bank-matched settlements, order value and recorded contribution by artwork/collection/frame. Define each metric's date basis, exclusions and tax treatment, keep money in exact currency units and use agreed rounding. Exclude replacements/test orders from new sales. Distinguish estimated/actual/incomplete costs for production, packaging, shipping, payment fees and remedies. Basic contribution is not net business profit. Unknown costs remain unknown; source records explain every total. Reports display money records; they do not create an alternative editing workflow.

**R2 — Operational improvement and a weekly summary.** Show due/late work, throughput, damage, return-to-origin, open/reopened cases and response performance with meaningful denominators and links to records. Preserve original versus revised promise dates. Send one compact weekly digest of issues and decisions, not a wall of speculative KPIs. Include service/integration failures when actionable. No advanced attribution, campaign dashboard, forecasting or experiment platform in V1.

### Settings and shared operation

**G1 — Staff security and protected data.** Individual accounts, two-factor login, least-privilege roles, session/access revocation and an owner recovery route. Enforce every permission on the server, including direct record URLs, file downloads, exports and provider actions. Roles cover owner/admin, operations and support; finance access can be assigned without creating a mandatory additional employee. Secrets remain server-side; use secure connections, protected sessions, login throttling and appropriate request protections. Validate uploads by allowed content/type/size, protect private evidence, prevent executable uploads and use expiring authorised access. Logs must exclude credentials and unnecessary sensitive data.

**G2 — Business rules and integrations.** Centralise approved policies, business details, working days, deadlines, component/lead-time rules, message templates, provider settings and operating guides. Record who approved values and effective dates; preserve the versions applicable to each purchase. Configure permissions/approval limits rather than hard-code unconfirmed refund or cancellation promises. Razorpay and Shiprocket are selected; use test/live separation and supported provider actions. Configure service health and owned manual fallback instructions. Full supplier accounts and additional provider orchestration are V2.

**G3 — Audit, approvals and safe edits.** Record actor, time, source, entity, previous/new values, reason, approval and external references for consequential actions. Keep an append-only ordinary-user history and controlled retention/redaction process. Detect stale concurrent edits; do not silently accept both incompatible changes. Require explicit authorisation/confirmation for refunds, access, publication and sensitive corrections. The founder may hold all roles at launch—V1 does not require two employees to approve each routine action. Changing a financial amount after approval invalidates that approval.

**G4 — Small, reliable automation.** Implement a fixed set of approved triggers and rules: paid-order readiness/assignment, deadlines, shortages and necessary messages. Use durable pending-work records, processing history, bounded retries and an owned failure queue with safe replay/pause. Repeated, delayed or out-of-order events cannot duplicate money, jobs, reservations, shipments or messages, or regress a confirmed outcome without explicit reconciliation. A database update and its required follow-up work must not become disconnected by a crash. Do not promise exactly-once network delivery; enforce one valid business effect. No visual rule builder or autonomous policy decisions in V1.

**G5 — Monitoring and recovery.** Monitor order intake, jobs, payment/shipping/message feeds, stale records, application availability and secure storage. Raise owned alerts and provide an emergency automation pause. Test protected database and evidence backups, owner access recovery, migrations and rollback, plus provider reconciliation after restoration. Use a separate test environment and synthetic data; a demo must never reach live payment, customer messaging or shipment accounts. Document recovery time/data-loss targets and measured peak-volume limits before production use. Managed infrastructure is acceptable; an in-house preference does not require rebuilding infrastructure services.

**G6 — Readiness and proof of completion.** Every feature links to the acceptance stories below and implementation evidence. Complete the agreed physical product/packing approvals and policy/document inputs, security checks, provider sandbox journeys, controlled live connection verification, performance tests, restore drills and staff operating walkthrough. Distinguish designed, prototype-tested, integrated and live-verified states. No feature is complete because a button exists or sample data looks correct. Critical payment, privacy, fulfilment or data-loss failures block live release.

## 6. Future tools and Version 2

The **Tools** tab is a single page showing three planned applications. No application scaffolding, new logins, separate databases or internal tool platform is required during V1.

| Tool, after V1 | V1 bridge | Ownership when it is eventually built |
| --- | --- | --- |
| In-house Accounting | O9 documents/settlements, R1 costs and exports | Accounting may own posted financial books; Orders retains purchased facts and executes provider payment/refund operations. |
| In-house CRM | C1 customer identity/history, C2 preferences | CRM reuses those identities and consent; it does not create competing customer permissions. |
| In-house Customer Support | S1/S2 cases, saved replies and order links | The tool reuses/transitions the existing case history; it requests financial remedies through O8. Do not maintain two full inbox/case systems. |

Their detailed scope and build order are **on hold**, even though their intended place in the system is decided. Define a documented data contract around IDs/events/exports; do not build speculative microservices merely to prepare for them.

**V2 options, selected only when evidence supports them**

| ID | Capability | Reason to build |
| --- | --- | --- |
| V2-01 | Supplier portal, advanced scheduling and QR/barcode work tracking | Supplier coordination or wrong-item/manual handling errors become a repeated measurable problem. |
| V2-02 | Forecasting and purchasing assistance | Stock-outs or excess materials justify predictions and purchase-order approval work. |
| V2-03 | Courier selection and advanced delivery rescue | Reliable history shows a way to reduce damage, failed delivery or cost. |
| V2-04 | CRM customer groups and consent-aware campaigns/follow-ups | The CRM project is approved and enough permitted events/customers exist to measure incremental value. |
| V2-05 | Support channel integration, staff AI assistance and genuine feedback/photo management | The Support tool is approved and case volume demonstrates the benefit; public display changes require separate scope. |
| V2-06 | Deeper profitability, attribution and controlled experiments | Financial/event data is sufficiently complete and volume supports meaningful comparisons. |
| V2-07 | Editable automation rules and unusual-pattern alerts | Fixed rules repeatedly fail to cover necessary work; false positives, approvals and reversibility can be measured. |
| V2-08 | Trade/bulk, new formats/channels/locations or reusable brand setup | A specific expansion has demand and its own approved business case and operational tests. These are not one committed build package. |

Before starting an option, record the repeated problem, current cost/error rate, intended benefit, smallest useful implementation and keep/remove criterion. V2 is not permission to implement every idea automatically.

**Explicitly not V1:** full accounting, CRM or helpdesk; marketing campaigns; customer accounts; autonomous AI support; automated discretionary refunds; custom workflow/report builders; demand forecasting; scanning hardware; multi-warehouse purchasing; multi-brand architecture; new sizes/COD/channels; public redesign. Do not build hidden preparatory versions of these under “future-proofing.”

## 7. Decisions needed during implementation, not extra feature shopping

The capabilities are the baseline. Values requiring business or provider evidence remain inputs, not invented facts. They do not prevent planning/wireframes now, but the affected live action cannot be enabled without them.

| Input | Owner and point needed |
| --- | --- |
| Production-start event and cancellation/change/remedy rules | Owner with actual studio process and approved policy advice; before enabling those rules. Default workflow records start of printing, but verify it represents the true committed-production event. |
| Prices, tax classification, invoice/credit-note timing, numbering and correction rules | Owner/accounting adviser; before live financial documents or transactions. No tax-law conclusions are made here. |
| File/sample approval, component quantities, supplier stock model, packaging and protection evidence | Studio/fulfilment owner; before publishing/releasing affected products. |
| Working days, capacity, reservation expiry, promises and escalation deadlines | Operations owner; before automated acceptance and reminders. |
| Razorpay capture/refund/settlement configuration and Shiprocket actions/status mapping | Integration developer with owner account access; before live providers. Never infer delivery from label generation. |
| Transactional email connection, sender setup and approved templates | Owner/developer; before live order messaging. WhatsApp/SMS remains optional and separately configured. |
| Staff roles, approval limits, retention, exports and identity verification | Owner with appropriate advice; before staff/customer access. |
| Representative volumes, response targets, recovery time and permitted data loss | Owner/developer; before architecture sizing and measured release tests. No unsupported “unlimited orders” promise. |

## 8. How we will build and judge it

Build in connected slices: **order/payment/security foundation → production/materials → packing/shipping → support/remedies/documents → reports/automation/recovery**. Security, audit and repeat-event protection accompany each slice; they are not a final bolt-on. Catalogue readiness must exist before affected items can be sold even if the advanced editor arrives in a later implementation slice.

Design should fit the existing Admin structure into the final six-menu plan. Use synthetic records for wireframe/prototype review. The existing public UI remains the baseline while live integration is developed and tested in isolation.

For acceptance, record feature/story ID, build revision, environment, test inputs, expected result, observed result and evidence. Exercise normal, invalid, concurrent and uncertain-provider outcomes. Use realistic multi-item records, staff roles and partial failures. Demonstrate keyboard access, readable layouts, labelled errors, useful empty states and preserved filters at operational desktop widths and useful phone layouts. Do not add controls solely to create symmetrical cards.

**Release gate:** every required V1 story US01 through US23 below passes at the applicable integration level, no unresolved critical failure remains, required business inputs are recorded, and the owner has reviewed the working operating journey. Provider outages are tested with the documented fallback. A sandbox pass alone is not proof of live account configuration.

## 9. Traceability and scope control

This table accounts for every earlier V1 feature; consolidation is not silent deletion.

| Earlier V1 ID | Final feature IDs |
| --- | --- |
| 1 | O1 |
| 2 | G1, G3 |
| 3 | O1, P4, G3 |
| 4 | O2 |
| 5 | O3, G4 |
| 6 | O4 |
| 7 | O4, P3, G2 |
| 8 | P2, O4 |
| 9 | O5 |
| 10 | O6 |
| 11 | O6, S1 |
| 12 | O7 |
| 13 | S2 |
| 14 | O8 |
| 15 | O8, O3 |
| 16 | O9 |
| 17 | O9 |
| 18 | C1 |
| 19 | S1 |
| 20 | S3 |
| 21 | C2, G1 |
| 22 | P1 |
| 23 | P1, P3 |
| 24 | P2, G3 |
| 25 | P3 |
| 26 | P4 |
| 27 | R1 |
| 28 | R1, R2 |
| 29 | G4 |
| 30 | G3 |
| 31 | G2 |
| 32 | G5 |
| 33 | G6 |

Earlier V2 IDs 1–3 map to V2-01; 4 to V2-02; 5–6 to V2-03; 7–8 to V2-04; 9–10 to V2-05; 11–12 to V2-06; 13–14 to V2-07; 15–17 to V2-08. These remain conditional rather than compulsory. In-house tool planning stays deferred independently of that mapping.

New feature requests must name the user problem and affected story, identify their version/cost impact and update this baseline explicitly. Provider implementation details can evolve without inventing new product scope. Retain prior approval records; implementation sign-off is separate from this planning approval.

## 10. Review references

The final priorities and sequencing are our assessment of Aalishaan's requirements. External sources validate selected implementation constraints, not a promise of commercial success or an endorsement of the whole design:

- [Razorpay Orders](https://razorpay.com/docs/payments/orders/) describes integrating Orders before the payment flow. This supports establishing a durable local reference before payment.
- [Razorpay webhook documentation](https://razorpay.com/docs/webhooks/) distinguishes server notifications from browser callbacks and supports API verification for critical uncertain outcomes. [Razorpay's security checklist](https://security.razorpay.com/security/checklist/) informs signature/payment verification requirements.
- [Shiprocket developer documentation](https://www.shiprocket.in/developers/) and its [official API workspace](https://www.postman.com/shiprocketdev/shiprocket-dev-s-public-workspace/documentation/qu05zax/shiprocket-api) inform provider operations and external ID handling. Verify the selected account's supported actions during integration.
- [OWASP file-upload guidance](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html) supports restricted upload types/sizes and protected storage. [OWASP logging guidance](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html) supports recording security/consequential events while protecting sensitive log data.

## 11. Final user stories and acceptance scenarios

These fictional scenarios are the final assessment stories for V1. A story passes only when its observable outcomes are demonstrated, not when its screen has been drawn. They combine an understandable situation with concrete checks for developers and the owner.

### US01 — A quiet morning with a clear next action

You open Admin with new orders, one late job and one unanswered request. Today shows who owns each task and what is due. You open the late order, act, then return to your retained filters.

**Pass when:** permitted staff see the right work, completed tasks leave the active queue, unresolved/snoozed problems remain accountable, and an empty queue says there is no outstanding work rather than displaying sample alerts. Search opens the original record. **Features:** O1, G1, R2.

### US02 — Meera's order goes right from payment to delivery

Meera selects The Lantern in black. A pending order is saved, Razorpay confirms payment, materials are reserved and the job is assigned. Asha prints and frames the pinned file. The inspector passes it, the packer records the parcel, dispatch books and hands it over, and Shiprocket confirms delivery. The customer receives the four appropriate milestone messages.

**Pass when:** one order/job/reservation is created; the team sees the correct purchased frame/file; dispatch follows handover; approved invoice records exist at the configured point; the full history can be followed without copying customer data between tools. Payment and settlement are distinguishable throughout. **Features:** O2–O6, O9, P2–P3, S3, G4.

### US03 — Arjun closes his browser after paying

Arjun pays but loses the confirmation page. A duplicate or delayed provider update arrives later. Another attempt may still be pending.

**Pass when:** the saved order is located by trusted references, valid paid status is recovered, duplicates have one effect, and no second production job is made. Invalid signatures, wrong amount/currency, authorisation-only status and unknown payment references cannot release production; each unresolved legitimate payment has a review path. **Features:** O2–O3, G4.

### US04 — Two customers want the last available black frame

Two payment flows overlap. One hold expires, then a late payment arrives after the remaining materials have been assigned.

**Pass when:** available materials cannot become over-reserved, expired holds are released correctly, the late paid order is retained with a readiness exception, and the team can resolve it without taking another order's reservation or silently substituting a frame. **Features:** O3–O4, P3.

### US05 — Nisha asks to cancel as printing is about to start

Support requests a cancellation while production opens the same job. Both staff submit their actions close together.

**Pass when:** the system permits only a policy-valid sequence. A cancelled/held job cannot start unnoticed; a started job cannot be treated as unstarted by a stale screen. The decision, consumed versus released materials and any refund request are recorded separately. **Features:** O4, O7–O8, G3.

### US06 — An address or frame needs correcting

A customer requests a valid change before the relevant cut-off. Another request arrives after a shipping label is created, and a third would increase the order price.

**Pass when:** identity/eligibility, serviceability, costs and downstream shipment effects are checked; revised values do not erase the purchase snapshot; price increases follow the documented supported process. An order edit does not falsely claim that the courier booking was corrected. **Features:** O2, O6–O7, C1, G2.

### US07 — The frame fails inspection

The inspector finds a mark, attaches a photograph and sends the job for correction. The team then completes and rechecks it.

**Pass when:** required missing/failed checks prevent packing and dispatch, the approved file is still pinned, rework/evidence are visible and a successful recheck records who did it. New catalogue files do not silently replace released work. **Features:** O4–O5, P2, G3.

### US08 — Booking succeeds but the screen times out

Shiprocket creates a shipment, but the response is lost. Dispatch tries again. Later, an old tracking event arrives after delivery confirmation.

**Pass when:** the existing booking is checked before another is created, one parcel has one active intended shipment, and stale events do not silently regress delivery. Label creation cannot mark a parcel shipped. Unsupported actions have a recorded dashboard fallback and references. **Features:** O6, G4.

### US09 — One order has two artworks and two parcels

One artwork is ready before the other. The first parcel ships and arrives; the second remains in production. Later, one item needs a partial remedy.

**Pass when:** the correct quantities are allocated once, customer updates name the partial shipment, the whole order is not marked delivered early, and only eligible quantities/amounts can be refunded or replaced. Parcel costs and document totals reconcile. **Features:** O2, O5–O6, O8–O9, S3, R1.

### US10 — The courier cannot deliver

A delivery fails because an address detail needs checking. Support contacts the customer and follows up. In another case, the parcel returns to the studio.

**Pass when:** a deadline/owner appears, contact and reattempt outcomes are recorded, a request alone does not close the task, and return-to-origin is tracked separately from delivery. Missing out-for-delivery events do not prevent verified final delivery. **Features:** O1, O6, S1–S2.

### US11 — Meera reports transit damage

Meera provides photos but no unboxing video. Support reviews them beside the studio evidence, and an authorised person approves a replacement. A courier compensation claim is also opened.

**Pass when:** the policy-based review has no automatic video-only rejection, the linked replacement uses the approved item/finish, its costs are recorded without a new sale, and courier compensation remains open until its own outcome. Returned goods are actually received/inspected before being marked recovered. **Features:** S1–S2, O8, R1.

### US12 — Two staff try to refund the same payment

Both staff open the refund screen. One submits a partial refund, another attempts the full original amount, and the provider response times out.

**Pass when:** permissions and current remaining balance are checked at execution, outstanding submissions count against availability, changed amounts require renewed approval, and uncertain submissions are verified before retry. Completion needs provider confirmation. An overlapping dispute is flagged for review. **Features:** O3, O8–O9, G3–G4.

### US13 — The customer looks familiar, but may be someone else

Two customers share a phone number. A support colleague searches for one and considers merging records. One person asks for their details to be corrected and promotional contact stopped.

**Pass when:** the system does not automatically merge or disclose records based on the shared number; verified edits/linking retain history; transactional needs and marketing permission stay separate. The privacy request has an owner and justified outcome, including any applicable retained records. **Features:** C1–C2, S1, G1.

### US14 — A useful reply, without a full helpdesk

Rahul logs an email enquiry, assigns it and uses an approved saved reply through the existing channel. The customer replies again after the case was closed.

**Pass when:** source, sent response and response times are recorded honestly, cases reopen with history, sensitive responses require appropriate identity checks and refunds still execute through Orders. Manual logging is functional without inventing automatic inbox synchronisation. **Features:** S1, C1, O8.

### US15 — A message fails after dispatch

The parcel has shipped, but the email connection rejects the message. The system retries, then alerts the owner. Another message has an uncertain provider response.

**Pass when:** shipment state stays correct, failed/unknown communication is visible, bounded retries and manual fallback work, suppression/context prevents misleading duplicate sends, and provider acceptance is not labelled “read.” **Features:** S3, O6, G4–G5.

### US16 — A new artwork is almost ready

You add copy, images, prices and a print file, but sample approval or rights evidence is missing. Later you complete approval, publish, edit the price and hide the artwork.

**Pass when:** incomplete publication is blocked with specific reasons, approved preview/publish works within the existing template, file access remains appropriate, and existing orders/documents keep their purchased facts. Retiring does not delete history or cancel fulfilment. **Features:** P1–P2, O2, G3.

### US17 — A spreadsheet contains useful updates and mistakes

You import artwork rows containing duplicates, missing values and a value that looks like a spreadsheet formula. Another user has just changed one of the target records.

**Pass when:** preview/errors/conflicts are clear, updates require deliberate application, drafts are not auto-published, and exports cannot execute injected formulas. Access to customer exports and generated files is restricted. **Features:** P4, P1, G1, G3.

### US18 — A supplier delivery is late

Frames expected today do not arrive. Existing jobs already reserve some stock. New orders would exceed the remaining materials or daily capacity.

**Pass when:** incoming stock is not counted as received, accepted orders retain ownership, availability/promises are controlled, and at-risk jobs appear with their original due dates. Receipt, waste and count corrections have reasons. Forecasting is not required to pass this story. **Features:** P3, O4, O1, R2.

### US19 — Friday's money does not match

Some orders were paid, one was partly refunded and one replacement shipped. A Razorpay settlement is reported but not yet matched to the bank. A shipping cost is missing.

**Pass when:** collected, refunded, settled and bank-matched amounts remain distinct; unmatched entries have a next action; replacement sales are excluded; incomplete costs do not become profit. Reports and exports reconcile to documents/transactions using defined rounding and date rules. Correcting an issued document leaves a trace. **Features:** O9, R1–R2, P4.

### US20 — A packing colleague tries a finance link

The colleague can pack their permitted work but opens a direct refund URL and another customer's private evidence link. Later, the owner removes their access.

**Pass when:** the server denies unauthorised actions/files/exports, revoked sessions stop working, evidence uploads enforce type/size protections and no secret appears in logs. Ordinary users cannot erase the activity history; owner recovery works. **Features:** G1, G3, G5.

### US21 — A busy day, a crash and a safe recovery

The agreed peak workload runs while multiple staff edit orders. A process stops after saving an event but before sending its required update; a provider connection is unavailable. The team restores a tested backup and reconciles recent external activity.

**Pass when:** concurrent edits and bulk partial failures are clear, pending work resumes without repeated business effects, critical alerts reach an owner, pause/fallback controls work, and measured restore/performance targets are met. No restored job reissues a completed refund or shipment. Test systems never contact live customers/providers. **Features:** O1–O3, G3–G6.

### US22 — You assess the system before accepting live V1

You walk through the normal order and the exception stories with the team, using the build under review. Every feature has evidence, and unfinished business inputs are visible.

**Pass when:** required stories pass at their appropriate integration level; keyboard/forms/empty states are usable; physical and document approvals are recorded; staff can follow guides; no unresolved critical failure is hidden by a demo. The owner can distinguish designed, tested and live-verified capability. **Features:** G2, G6, all required V1 IDs.

### US23 — Tools remain deliberately on hold

You open Tools during V1 and see Accounting, CRM and Customer Support labelled planned. Daily financial records, customer history and support still work inside Admin.

**Pass when:** no paid accounting/helpdesk service or unfinished tool is required to operate the V1 workflow, no fake application actions exist, and record IDs/exports are documented for later reuse. Dedicated tool specifications and V2 functions have not been built ahead of approval. **Features:** O9, C1–C2, S1–S2, G2; deferred-tool boundary.

### US24 — Later, a real problem justifies a V2 addition

After live use, supplier coordination repeatedly consumes time. You consider a supplier portal rather than commissioning the entire V2 backlog.

**Pass when the later proposal:** identifies the measured problem, names V2-01 and the affected V1 workflow, estimates a useful benefit, starts with the smallest implementation and defines a keep/remove decision. Existing records and permissions are reused. This is a scope-control story, **not a V1 requirement to implement the portal**.
