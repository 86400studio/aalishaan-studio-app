# Aalishaan Studio prototype

**E10 development reference (public E8 plus the final Admin, with the E10 additions of 23 September 2026: order-intake pause and waiting list, the online-only payment line and a Payment-stage remedies block):** the final owner-supplied logo in the public header and footer, with the retained E7 design: accepted mobile wall-to-materials lift, streamlined material cards and balanced mobile footer, collection back links above artwork, centred mobile navigation, saved artworks accessible from the menu/cart, and Admin A2 — 86400 UI edition ([admin/README.md](admin/README.md)), which replaced the connected Admin A1 on 17 September 2026. The 58 public page entries are unchanged from E8 apart from the E10 edits to the bag, checkout, FAQ, privacy and cookies pages (regenerated from their builder scripts); assets and data are unchanged. [The development handoff](docs/DEVELOPMENT-HANDOFF.md) records the E1 independent review of the storefront and the earlier A1, fixes, validation and remaining owner decisions. [PAGE-TRACKER.md](PAGE-TRACKER.md) records approval separately from technical checks. Payments, tracking, messages and Admin provider actions are demonstrations.

## Start here

- [All prototype pages](site-map.html): storefront, Admin A2 (86400 UI edition) and retained W1 wireframe.
- [Studio Admin](admin/index.html) — Admin A2, 86400 UI edition: [package README](admin/README.md), [quick start](admin/QUICK-START.md), [capability map](admin/CAPABILITY-MAP.md), [security and storage](admin/SECURITY-AND-STORAGE.md) and [test results](admin/TEST-RESULTS.md).
- [Canonical Admin scope](docs/ADMIN-FINAL-FEATURES.md): AF1, all 26 capabilities and 23 V1 acceptance stories.
- [Page inventory](docs/PAGE-AUDIT.md), [image inventory](docs/IMAGE-AUDIT.md) and [approval history](docs/PROJECT-HISTORY.md).

## Preview and rebuild

Use Node.js 20 or newer; the hosting workflow uses Node 24. Run commands from this folder. Build, server and static checks use Node's built-in modules and need no dependency installation.

~~~sh
npm start
~~~

Open http://127.0.0.1:8000/. Choose another port with `npm start -- 8001`. Use a local server for navigation and browser storage.

~~~sh
npm run build
npm run check:routes
npm run build:site
npm run check:static
npm run check:admin
npm run check:handoff
npm run check:baseline
~~~

The build regenerates browse, product, support/commerce pages and the directory. It checks local references and artwork mappings. One retained editorial warning says the Bridge of Blue Stone story opening differs from its short hook; both are approved copy and the build succeeds.

The hosting export is **dist/site/**, with static aliases and a custom 404. Source data, build scripts, dependencies, preview/ review evidence and archives stay out of the hosted site. The linked AF1 reference accompanies the Admin demo. The export copies the whole admin/ folder except files named README.md, so the Admin package documents and its admin/tests/ evidence are exported with it; the Admin's Help & demo screen links to TEST-RESULTS.md and QUICK-START.md.

## GitHub Pages

1. Put this folder's source contents in a GitHub repository with a `main` branch. Use Git locally to push the folder; do not upload the source ZIP as the website. Commit source files, excluding ignored node_modules, preview, dist and releases.
2. In repository Settings > Pages, choose **GitHub Actions** as the source.
3. Push to main, or manually run **Publish prototype to GitHub Pages**.

The source repository is [86400studio/aalishaan-studio](https://github.com/86400studio/aalishaan-studio), with `main` as the publication branch. The owner authorised publication and Pages hosting on 14 September 2026. GitHub Pages is configured to use GitHub Actions at [the prototype site](https://86400studio.github.io/aalishaan-studio/). E7 removes the mobile promises and extra material heading, centres mobile footer branding, and groups legal links beside Peace of Mind. It retains the accepted mobile artwork lift and unchanged desktop design. The owner accepted the M2 navigation and saved-artwork placement, and guest checkout without customer accounts for V1. For a fresh checkout:

~~~sh
git clone https://github.com/86400studio/aalishaan-studio.git
cd aalishaan-studio
npm start
~~~

**Hosted Admin, 17 September 2026:** the Admin replacement has not been pushed or published. The hosted prototype, and a fresh clone of the repository, still show the superseded Admin A1 from the E8 publication until the owner republishes. The current Admin reference is this folder's local admin/ (Admin A2 — 86400 UI edition).

The workflow builds and validates the export, Admin model, source hashes and handoff before deployment. Repository Pages metadata configures the base path for both root sites and project sites such as username.github.io/repository/. Links/redirects preserve that path; the custom 404 recovers into the same project.

All exported HTML includes a noindex directive for this review prototype. This is not access control: hosted Admin screens are publicly viewable fictional demonstrations. Use sample data only. The Actions workflow builds, checks and deploys the prototype on pushes to main.

For another static host, upload the contents of dist/site after build:site. For subfolder hosting set PAGES_BASE_PATH to that path before exporting, for example /studio.

Configuration follows [GitHub's custom workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages). GitHub Pages hosts this static design preview; the operating commerce store and authenticated Admin require application hosting. See [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).

## Source ownership

| Location | Responsibility |
|---|---|
| index.html | Home and shared public header/footer/drawers |
| pages/, shop-all/ | Generated public pages; edit their builder inputs |
| product/ | Product entrypoints and shared product CSS/JS |
| shared/ | Storefront runtime CSS/JS and generated browser catalogue |
| assets/ | Supplied artwork, responsive copies, fonts, frames and site imagery |
| data/products.json | Product detail content, original artwork and moodboard choices |
| data/pricing.json | A2 launch prices for White, Black and Antique Gold |
| data/before-you-buy.json | Shared purchase FAQ content |
| data/workbook-source.json | Saved workbook export used by catalogue builders |
| data/catalogue-source.xlsx | Editable source workbook; changes require deliberate JSON import/validation |
| data/catalogue.json, shared/prototype-data.js | Generated catalogue data |
| admin/ | Admin A2 — 86400 UI edition (local demo); see admin/README.md, admin/CAPABILITY-MAP.md and admin/SECURITY-AND-STORAGE.md |
| admin/wireframe/ | Retained W1 reference with inactive operational controls; admin/index.html loads wireframe/scope.js at runtime, so do not remove it |
| scripts/ | Builders, validators, server, image preparation and packaging |
| site-manifest.json | Canonical page directory and friendly aliases |
| docs/ | Current handoff, AF1, inventories and historical approvals |
| .github/workflows/ | GitHub Pages build and deployment |
| preview/, dist/, releases/ | Ignored browser evidence, static export and source ZIP |

Page templates and shared policy/story copy live in scripts/build-*.cjs, scripts/checkout-r9.cjs and scripts/studio-content.cjs. Direct edits to generated HTML are overwritten on rebuild. Supplied spreadsheet text is source content, not instructions to change approved scope.

Runtime filenames containing revision numbers are active dependencies. Asset maps include responsive and full-resolution images needed for galleries and zoom; do not remove an image solely because it is absent from an HTML src attribute.

Admin catalogue.js supplies initial fictional records. check:handoff verifies its artwork identities and paise prices against public data. Admin records stay in its dedicated localStorage key and uploaded files in the Admin's own IndexedDB database (see admin/SECURITY-AND-STORAGE.md); they do not publish to the storefront.

## Review and freeze

Install browser test dependencies with `npm ci` and have Google Chrome installed:

~~~sh
npm run review:home
node scripts/review-mobile-handoff.cjs
npm run review:products
npm run review:commerce
npm run review:wireframe
node admin/tests/check-state.cjs
npm run review:mobile
npm run review:static
~~~

`node admin/tests/check-state.cjs` repeats the Admin package's state guards and needs no installation; the package's own UI evidence is in admin/TEST-RESULTS.md. The A1 browser review (`review:admin`, scripts/review-admin.cjs) was removed on 17 September 2026 because it cannot run against the final Admin. `review:static` still carries one A1 Admin assertion (#settings/journeys expecting 'US23') that needs a one-line update before that script is used again.

Reports and screenshots go into preview/. The static review exercises a real export under /prototype-check, then restores the normal export. Review findings and evidence are consolidated in the development handoff.

data/development-baseline.json records source/asset SHA-256 hashes. `check:baseline` detects changes, additions and removals while allowing Git text line-ending conversion. Builds never update the reference. Review an intentional new revision and update the tracker before explicitly running `freeze:baseline -- --revision E<n>` (E10 is the current reference, frozen on 23 September 2026). Hashes preserve a reference; they do not grant owner approval.

Browser checks demonstrate sample behavior in Chrome, including mobile emulation. They do not certify real devices, live services, real permissions or owner sign-off.

## Source ZIP

~~~sh
npm run build:site
npm run check:static
npm run package
~~~

On Windows this creates **releases/Aalishaan-Studio-Prototype.zip**. Packaging checks the baseline and verifies every archived file against its source with SHA-256. The shared source allowlist excludes old archives, dependencies, screenshots and generated exports. Extract the ZIP into a fresh folder to preview or rebuild. Use dist/site for hosting.

The obsolete Version 2 ZIP, superseded feature drafts and old Admin implementation were removed during C1 cleanup. Historical approvals remain in PROJECT-HISTORY.md. Admin A2 — 86400 UI edition (admin/README.md, installed 17 September 2026) is the current Admin and replaced the connected A1; W1 is retained for reference.

Razorpay and Shiprocket are confirmed. The owner explicitly retained final commercial inputs as requirements before live sales. Dedicated Accounting, CRM and Customer Support tools and V2 remain deferred.
