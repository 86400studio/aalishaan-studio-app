# Aalishaan Admin - 86400 UI edition

**A complete replacement `admin` folder. UI/UX and copy refinement only.**

## Install

Back up your current admin folder, then replace it with this complete folder. Keep the rest of your website, including its existing assets, unchanged. The entry point remains `admin/index.html`.

Open the admin using your existing local server or deployment and hard-refresh once. No additional package, build step, API key or database is required. Use localhost or HTTPS rather than double-clicking the HTML file.

See [QUICK-START.md](QUICK-START.md) for installation, sample-order and file-backup guidance.

## What changed

The working interface follows the supplied 86400 Dashboard Version 2: light grey canvas, white cards, restrained green accents, system typography, quiet borders, consistent controls and right-side drawers. Repeated introductions and nonessential instructions have been removed or shortened. Essential payment, file-security, validation and confirmation guidance remains.

Orders, Customers, Products, Support, Reports, Staff & Access and Connections retain their existing navigation and workflows. Phone layouts show working lists as labelled record cards without dropping columns or actions. Secondary tools, product editors, settings, drawers and support views use the same shared styling.

## What stayed intact

All 16 JavaScript files supplied in Aalishaan_Admin_A2.zip are byte-for-byte unchanged, including the original workflow, catalogue, financial, storage and access modules. The original admin.css and workspace.css are also retained. Existing route names, form fields, options, action bindings and local-storage keys are unchanged. Installing this folder does not reset records.

**E10 additions (23 September 2026):** after installation the delivery lead added the order-intake pause and waiting list (`e10-additions.js`, `e10-additions.css`, a hook in `settings.js`, two audit keys in `state.js`) and the Payment-stage Refunds & remedies block (`workspace.js`), and `index.html` now loads the two new files last. See [CHANGELOG.md](CHANGELOG.md). The byte-identical statement above therefore describes the 17 September package; the vendor manifest is kept as `CONTENTS-SHA256-86400-2026-09-17.txt` and `CONTENTS-SHA256.txt` covers the E10 folder.

The new presentation layer is isolated in:

- `studio-ui.css`: visual tokens, layouts, controls, responsive views and drawers.
- `studio-ui.js`: explicit static-copy simplification, responsive table labels, missing-image presentation and keyboard-focus restoration. It does not write business state, storage or provider records.

`index.html` loads these two files last and contains small shell markup updates. No external fonts, scripts, packages or new network dependencies were introduced. The legacy `wireframe/` reference remains unchanged for compatibility; it is not the everyday admin interface.

## Assets and existing limitations

This package is admin-only. The uploaded A2 archive did not include the website's artwork assets. Existing relative image paths are preserved; unavailable images show a neutral placeholder, not substitute artwork. Use the folder alongside your existing website assets.

The supplied application remains a local prototype. This redesign does not add production login, shared storage, live payments, shipping, messaging or automatic publication. Do not mistake a static deployed prototype for a protected production admin. Keep confidential files and backups outside public website folders.

## Checks and reference documents

Read [TEST-RESULTS.md](TEST-RESULTS.md) for this release's checks and limits. Detailed results are in `tests/ui-checks.json`, `tests/interaction-checks.json` and `tests/expanded-checks.json`.

[SECURITY-AND-STORAGE.md](SECURITY-AND-STORAGE.md) and [CAPABILITY-MAP.md](CAPABILITY-MAP.md) are retained from A2. The original A2 test report is archived as `tests/BASELINE-A2-TEST-RESULTS.md`; `tests/release-evidence.json` is inherited A2 evidence, not a fresh UI-release test result.
