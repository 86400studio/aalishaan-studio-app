# UI refinement checks - 17 September 2026

> Note, 23 September 2026: the E10 additions (see CHANGELOG.md) changed `state.js`, `settings.js`, `workspace.js` and `index.html` and added `e10-additions.js` / `e10-additions.css` after these checks were recorded. `node admin/tests/check-state.cjs` was re-run in place: all 13 guard groups pass. Browser checks of the additions are recorded in the prototype's PAGE-TRACKER.md (E10 entry).

## Scope and environment

Tested the supplied A2 admin against the updated 86400 UI edition using Chromium 144.0.7559.96, Playwright and Node.js 22.16.0.

The environment blocks normal browser navigation to local HTTP/file pages. Browser tests therefore loaded the supplied HTML, CSS and scripts directly into Chromium with isolated in-memory localStorage and IndexedDB adapters. These adapters were test-only and are not part of the admin application. This checks rendering, controls and local workflow interaction, not native persistent storage or hosted deployment.

## Results

| Check | Result |
| --- | --- |
| Original JavaScript source integrity | All 16 supplied JS files byte-identical |
| Original shared stylesheets | admin.css and workspace.css retained unchanged |
| Existing state regression guards | All 13 guard groups passed |
| Route/control comparison | 53 views matched the original control sequence, form names, types, values, required flags, options, action arguments and destinations |
| Responsive route checks | 265 renders: 53 views at 1440, 1024, 768, 390 and 320 px; no document-width overflow |
| Scenario smoke tests | 161 renders: 23 isolated scenarios across the seven main sections, including restricted-role previews; no unhandled JavaScript errors |
| Expanded accordions | 44 layouts at desktop, tablet and phone sizes; no document-width overflow |
| Drawer layouts | 24 combinations of six drawers and four viewport widths; no horizontal drawer overflow |
| Interaction assertions | All 27 passed; detailed below |
| JavaScript parse checks | All supplied and new JavaScript/test scripts passed node --check |
| Runtime dependencies | Every local stylesheet and script referenced by the final index.html is present |

## Interaction coverage

The normal synthetic order was taken through payment verification, materials reservation, confirmed printing start/completion, the five-point quality inspection, packing checks/measurements, pickup booking, separate physical handover, out-for-delivery and delivery confirmation using the rendered controls.

Also exercised: creation of an order-linked support request; product draft saving and revision history; cancelling and confirming dirty-form navigation; local staff creation with its explicit preview acknowledgement; catalogue filtering and pagination; public-image upload dialog controls; desktop and phone drawer sizing; Escape cancellation/focus restoration; keyboard focus inside the native dialog; phone navigation; and owner-only/operations-preview restrictions.

The 13 original state guards additionally cover captured-payment requirements, duplicate handling, stock reservation, order holds, stale edits, refund ceilings and approval invalidation, uncertain booking recovery, handover gating, split deliveries, rollback, concurrent-tab revisions, item-value limits, post-reservation stock corrections, later-refund settlement invalidation, linked-case task handling and spreadsheet-formula-safe CSV output.

## Visual review

Reviewed rendered Orders, Products/catalogue editor, public-image slots, private files, Support, Reports, Staff & Access, Connections, desktop/phone drawers and the phone menu. Kept safety/prototype disclosures visible. On phones the four working lists retain every data column in labelled record cards; financial tables remain horizontally scrollable.

## Not certified by these tests

- Native browser IndexedDB persistence, encryption/unlock, refresh recovery, storage permissions, backup/restore integrity or cross-tab behaviour in a normally served browser were not re-certified in this UI-only release. The relevant original source modules were not changed. Run the disposable-file check in QUICK-START.md before relying on local files.
- The uploaded archive did not contain the surrounding website or artwork assets. Actual asset availability and complete non-admin repository integrity could not be checked; no files outside admin were edited.
- No production authentication, real payment/refund, courier, messaging, invitation or publishing integration was tested or added. All transaction tests used synthetic local records.
- The responsive checks used Chromium viewport emulation, not physical-device or cross-browser certification.
- Source/control equivalence and passing smoke tests do not amount to exhaustive verification of every possible business-state combination.

## Evidence and repeatable guard check

`tests/ui-checks.json` records route, responsive, scenario and integrity results. `tests/interaction-checks.json` lists the 27 interaction assertions. `tests/expanded-checks.json` records expanded-content/drawer checks. `tests/source-integrity.json` records the original and final module hashes.

Run `node admin/tests/check-state.cjs` from the folder that contains admin to repeat the original state guards. No package installation is needed for that check.

The original report is preserved at `tests/BASELINE-A2-TEST-RESULTS.md`. The pre-existing `tests/release-evidence.json` describes the earlier A2 release, not this UI-refinement run.
