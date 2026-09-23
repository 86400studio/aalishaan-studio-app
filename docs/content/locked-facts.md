# docs/content/locked-facts.md — Exact Claims the Site Makes

The register of every exact fact the Aalishaan Studio storefront and Admin claim: prices, catalogue counts, finish names, specification wording, contact details, page counts, order stages, providers and currency conventions. Each row carries its value and the prototype file it was verified against. Sprints implement these values **verbatim**; QA compares against this file (`docs/QA-CHECKLIST.md` → Content fidelity) and S1.1 runs a parity test against it.

Reference revision: prototype **E10** (E9 + the E10 additions of 2026-09-23, D-37–D-39 — the customer-facing copy they add is a draft, NS-12–NS-15) = public **E8** (commit `b24dce1bf498a5c8131694fef5fb1602139e1653` of `86400studio/aalishaan-studio`, published at https://86400studio.github.io/aalishaan-studio/ — `prototype/PAGE-TRACKER.md` "Resume here") + **Admin A2 — 86400 UI edition**, the final Admin, installed at `prototype/admin/` on 2026-09-17 (D-PRE-23, D-36; vendor manifest retained as `prototype/admin/CONTENTS-SHA256-86400-2026-09-17.txt`, E10 folder manifest `prototype/admin/CONTENTS-SHA256.txt`). The published GitHub Pages prototype still serves the superseded Admin A1 at `/admin` (D-36); every Admin fact below is read from the local `prototype/admin/`. Frozen copy lives in `prototype/` at the repository root; the approval evidence is in `docs/APPROVED-INPUTS.md` §1 and the locked decisions in `docs/PROJECT-STATUS.md` §7.

Verified on 2026-09-16 by reading the files cited in each row; every Admin row (§2 stored amounts, §8 manifest entries, §9, §9a, §11) was re-verified on 2026-09-17 against the final Admin's code. Paths are repo-relative (`prototype/...`). Admin UI labels are quoted as the final Admin renders them, that is after the allow-listed copy simplification in `prototype/admin/studio-ui.js`.

## 1. Rules

- Facts in this file are implemented verbatim — in seed data, server rules, page copy, receipts, emails and Admin screens. No rounding, no re-wording, no "equivalent" phrasing.
- A change to any fact is a **recorded owner decision** (new row in `docs/PROJECT-STATUS.md` §7 with date and evidence), never an inline edit. The old value stays here struck through with the superseding decision ID.
- A value not in this file is not a fact. If a sprint needs a number, name or term that is missing, it is either an owner input (§11 — "TBD — decision D-nn" / "Pending — sprint Sx.y") or a new string (`docs/content/new-strings.md`). Never guess it.
- The prototype (`prototype/`) is read-only. When this file and the prototype disagree, report the mismatch; do not fix either silently.
- Two AF1 §1 statements the owner approved travel with these facts: "Public design approval does not mean the present local checkout is already connected" and "a material public interaction change must be raised explicitly rather than silently redesigning the approved experience" (`prototype/docs/ADMIN-FINAL-FEATURES.md` §1).

## 2. Prices and currency

| Fact | Value | Source |
|---|---|---|
| Public launch price — White finish | ₹19,000 (`"white": 19000`) | `prototype/data/pricing.json`; owner decision D-PRE-08 (`docs/PROJECT-STATUS.md` §7) |
| Public launch price — Black finish | ₹21,000 (`"black": 21000`) | `prototype/data/pricing.json`; D-PRE-08 |
| Public launch price — Antique Gold finish | ₹23,000 (`"antique-gold": 23000`) | `prototype/data/pricing.json`; D-PRE-08 |
| Same price for every artwork | One price per finish across all 22 artworks; `products.json` carries no price field | `prototype/data/products.json` (no `price` key); `prototype/scripts/product-pricing.cjs`; D-PRE-08 "across all 22 artworks" |
| Admin / stored amounts — White | 1,900,000 paise | `prototype/admin/catalogue.js` (`prices.white`); `prototype/scripts/check-handoff.cjs` line 28 asserts admin price = public price × 100 |
| Admin / stored amounts — Black | 2,100,000 paise | as above |
| Admin / stored amounts — Antique Gold | 2,300,000 paise | as above |
| Currency | INR only; order `currency` is `'INR'` | `prototype/admin/state.js` (order `currency:'INR'`); `prototype/docs/DEVELOPMENT-HANDOFF.md` |
| Currency convention | Public display in rupees with the ₹ symbol and Indian grouping (₹19,000); every stored monetary value is integer paise (`bigint`); no floats, no rupee columns | `prototype/docs/DEVELOPMENT-HANDOFF.md` line 11 ("Admin monetary values are paise"); `prototype/admin/README.md` row `catalogue.js`; `CLAUDE.md` → Project-specific rules; `docs/ROADMAP.md` S1.1 |
| Displayed price inclusive/exclusive of tax | **Not a fact** — TBD — owner input OI-02 | `docs/PROJECT-STATUS.md` §8b |
| Shipping charge | **Not a fact** — prototype shows "To be confirmed" — owner input OI-03 | `prototype/shared/commerce-r9.js` line 29 ("Shipping & tax — To be confirmed"); `prototype/shared/receipt-pdf.js` line 16 |

## 3. Frame finishes

| Fact | Value | Source |
|---|---|---|
| Number of finishes | Three | `prototype/data/pricing.json` (three keys); D-PRE-09 |
| Finish display names | **White**, **Black**, **Antique Gold** (this order in the approved FAQ answer) | `prototype/data/before-you-buy.json` Q4 "White, Black and Antique Gold."; `prototype/shared/bag.js` `names` map |
| Finish keys (variant codes) | `white`, `black`, `antique-gold` | `prototype/data/pricing.json`; `prototype/data/products.json` `frames{}` keys; `prototype/product/r3.js` |
| Suggested (default) finish per style | Gilded Peaks, Rinpa Moon, Mythic Voyage, Neo-Classical Fantasy → `antique-gold`; Four Gentlemen, Scarlet Blossom, Moonlit Blossom, Hand-Printed Ukiyo-e → `white`; Corsair Chronicles, Ghostly Armada, Marquetry Voyage → `black` (8 / 8 / 6 artworks) | `prototype/scripts/artwork-images.cjs` lines 2–7; `prototype/data/products.json` `suggestedFrame` |
| No fourth finish, size, COD, custom orders or extra channels | Locked | D-PRE-09 (AF1 §1, §6) |

## 4. Catalogue

| Fact | Value | Source |
|---|---|---|
| Artwork count | **22** | `prototype/data/products.json` (array length 22); `prototype/scripts/check-artwork-mapping.cjs` line 4 asserts `products.length===22`; `prototype/admin/catalogue.js` ART-001…ART-022 |
| Single size | A2 for every artwork | `prototype/data/before-you-buy.json` Q3; `prototype/scripts/build-products.cjs` line 50 |
| Orientation split | **Portrait 12 / Landscape 10** (`orientation` field) | `prototype/data/products.json` (aggregated) |
| Collections — count | **3** | `prototype/data/products.json` `collection` / `collectionSlug` |
| Collection — Painted in Gold | slug `painted-in-gold`, **4** artworks; styles Gilded Peaks, Rinpa Moon | `prototype/data/products.json` (aggregated) |
| Collection — Blossoms in Ink | slug `blossoms-in-ink`, **8** artworks; styles Four Gentlemen, Scarlet Blossom, Moonlit Blossom, Hand-Printed Ukiyo-e | as above |
| Collection — The Age of Sail | slug `the-age-of-sail`, **10** artworks; styles Mythic Voyage, Corsair Chronicles, Ghostly Armada, Marquetry Voyage, Neo-Classical Fantasy | as above |
| Art styles — count | **11**, exactly **2** artworks each | `prototype/data/products.json` `style` / `styleSlug` (aggregated) |
| Art style names and slugs | Gilded Peaks `gilded-peaks`; Rinpa Moon `rinpa-moon`; Four Gentlemen `four-gentlemen`; Scarlet Blossom `scarlet-blossom`; Moonlit Blossom `moonlit-blossom`; Hand-Printed Ukiyo-e `hand-printed-ukiyo-e`; Mythic Voyage `mythic-voyage`; Corsair Chronicles `corsair-chronicles`; Ghostly Armada `ghostly-armada`; Marquetry Voyage `marquetry-voyage`; Neo-Classical Fantasy `neo-classical-fantasy` | `prototype/data/products.json`; `prototype/site-manifest.json` aliases |
| Collections index intro (locked wording) | "Stories you can hang. Open the one that stops you." | `prototype/scripts/build-browse.cjs` `copy.collections`; D-PRE-19 |
| Art Styles index intro (locked wording) | "How it was made changes how it feels. Find the marks that speak to you." | `prototype/scripts/build-browse.cjs` `copy.styles`; D-PRE-19 |
| Product page button labels and order | Size guide · What you'll receive · The artwork's story · FAQs | D-PRE-18 (`prototype/docs/PROJECT-HISTORY.md` R12) |
| Availability model | Made to order; no stock count shown on the storefront; every artwork purchasable in every finish | `prototype/data/before-you-buy.json` Q1 "Each piece is made to order" (note: the `availability` field in `products.json` records sourcing status — "Complete per supplied list (2026-09-06)" — not purchasability) |
| Filter facets | rooms: Living Room, Bedroom, Dining Room, Study & Office · moods: Full of wonder, Bold, Calm, Grounded, Warm, Nostalgic · palettes: Gold & Gilded, Blues & Indigo, Greens & Teals, Ink & Monochrome, Reds & Blush, Sepia & Cream, Earth & Terracotta, Jewel & Deep Tones · plus collection, style, orientation, free text | `prototype/data/products.json` `rooms`/`moods`/`palettes`; `prototype/shop-all/index.html` `#filter-form`; `prototype/shared/browse.js` |
| Lantern compatibility entry | `/product` remains an entry for "The Lantern That Outlasted the Gale" (canonical → `/artworks/the-lantern-that-outlasted-the-gale`) | `prototype/scripts/build-products.cjs` (`p.master` branch); `prototype/docs/PAGE-AUDIT.md` |

## 5. Print and frame specification — quoted from approved copy

Use these sentences as written. They are the only approved specification wording.

| Claim | Approved wording (verbatim) | Source |
|---|---|---|
| What the customer buys | "A museum-grade giclée print, framed and ready to hang. Each piece is made to order for your home." | `prototype/data/before-you-buy.json` Q1 |
| Museum-grade definition | "Our prints use 12-colour pigment inks on Hahnemühle Museum Etching 350 gsm cotton paper. Museum-grade describes these materials and the printing process; it is not a certification." | `prototype/data/before-you-buy.json` Q2 |
| Size | "Every artwork is available at A2: 42 × 59.4 cm, or 59.4 × 42 cm in landscape. These are print dimensions; the frame adds a border. Outer frame dimensions will be confirmed before ordering." | `prototype/data/before-you-buy.json` Q3 |
| Frame | "White, Black and Antique Gold. Each is handcrafted solid wood with acrylic glazing and fitted hanging hardware. Choose your preferred finish on the artwork page." | `prototype/data/before-you-buy.json` Q4 |
| Delivery (pending terms, approved) | "Each piece is printed and framed after you order, then delivered across India. Check your PIN code for a sample estimate. Confirmed production times, delivery estimates and charges will be shown before live orders open." | `prototype/data/before-you-buy.json` Q5 |
| "What arrives" list — print | "Archival giclée print — 12-colour pigment inks on Hahnemühle Museum Etching 350 gsm cotton paper" | `prototype/scripts/build-products.cjs` line 85 |
| "What arrives" list — frame | "Handcrafted wooden frame — Antique gold, black or white, with clear acrylic glazing" | `prototype/scripts/build-products.cjs` line 87 |
| Glazing | "Acrylic glazing — A clear, light protective layer in front of the print." | `prototype/scripts/build-products.cjs` line 117 |
| Paper (Studio page) | "We use Hahnemühle Museum Etching 350 gsm: natural-white cotton paper with a fine matt texture. A considered foundation for every A2 print." | `prototype/scripts/studio-content.cjs` line 10 |
| Printing (Studio page) | "Our process uses 12-colour archival pigment inks on fine-art paper. Each artwork is printed and framed to order, ready for its place in your home." | `prototype/scripts/studio-content.cjs` line 8 |
| Frames (Studio page) | "Choose Antique Gold for warmth, Black for definition or White for a softer presence. Acrylic glazing and fitted hanging hardware complete the piece." | `prototype/scripts/studio-content.cjs` line 9 |
| Home specification strip | "Hand-carved wood frame — Solid wood, ornately carved. Antique gold, black or white." · "Protective glazing — Clear acrylic glazing over the print." · "Hahnemühle Museum Etching — 350 gsm natural-white cotton rag with a fine matt tooth." · "12-colour pigment giclée — Archival pigment inks. Rich colour and finely held detail." · "A2 artwork, made to order — 42 × 59.4 cm. Printed and framed after you order." | `prototype/index.html` lines 569–592 |
| Card label | "Museum Grade Giclée Artwork" | `prototype/scripts/build-products.cjs` line 68 |
| Bag line format | "A2 {Portrait\|Landscape} · {Finish} frame" | `prototype/shared/bag.js` line 13 |
| Outer framed dimensions, packed dimensions, weights | **Not a fact** — TBD — owner input OI-04 | `prototype/data/before-you-buy.json` Q3 ("will be confirmed before ordering") |

## 6. Purchase rules

| Fact | Value | Source |
|---|---|---|
| Quantity cap | **99** per artwork + finish line (bag merges rows by `slug:frame`, `Math.min(99, …)`; cart input `min="1" max="99"`; product add refuses at 99) | `prototype/shared/bag.js` lines 7, 11, 13, 17; `prototype/product/r3.js` lines 119–127 |
| Cap notice (approved prototype wording) | "Your bag already has 99 of this artwork and frame. Edit the quantity in your bag." | `prototype/product/r3.js` line 127 |
| Minimum quantity | 1 | `prototype/shared/bag.js` lines 7 and 11 (`normalize`) |
| Checkout model | Guest checkout; no customer accounts in V1 | D-PRE-03 |
| Payment methods offered at checkout (prototype radios) | UPI (default), Card, Net banking, Wallet — presentation only; the live method set is whatever the Razorpay account enables (OI-08) | `prototype/scripts/checkout-r9.cjs`; `prototype/shared/commerce-r9.js` |
| Indian mobile format accepted | `/^[6-9]\d{9}$/` | `prototype/shared/commerce-r9.js` (checkout `validate()`) |
| Waiting-list form validation (E10) | Email or mobile required, name optional; email `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`; mobile `/^[6-9]\d{9}$/` after stripping spaces, brackets, `+`, `-` and a leading `91` — the checkout's own rules | `prototype/shared/intake-e10.js` (`join()`) |
| Payment policy (E10) | Online payment only — UPI, cards, net banking and wallets via Razorpay; no cash on delivery (D-PRE-09, D-38). Customers who want another way are pointed to WhatsApp `https://wa.me/919137624394` (the §7 studio number) with a prefilled draft that carries the bag summary only. The line's wording is draft NS-15 | `prototype/scripts/checkout-r9.cjs` (`.payment-policy`); `prototype/shared/intake-e10.js` (`syncWhatsApp`) |
| PIN code format accepted | Six digits, first digit 1–9 (`/^[1-9][0-9]{5}$/`) | `prototype/shared/delivery.js` `check()` (about line 21) |
| Delivery coverage, production and transit days | **Not a fact** — the prototype table is a sample (7–10 production days, 2–9 transit days) — owner input OI-03 and Shiprocket serviceability (Pending — sprint S2.9) | `prototype/shared/delivery.js` lines 7–31; `prototype/data/before-you-buy.json` Q5 |
| Order-number format | Prototype Admin uses `AS-1001` (the one sample order a fresh browser opens with — §9a); app format is TBD — decision D-09 (lean `AS-` + gapless sequence from 1001) | `prototype/admin/state.js`; `prototype/admin/workspace-state.js` line 20; `docs/PROJECT-STATUS.md` §8a |

## 7. Studio contact details

| Fact | Value | Source |
|---|---|---|
| Support email | **info@aalishaanstudio.com** | `prototype/scripts/build-pending.cjs` line 35 (Contact page `mailto:`); `prototype/scripts/build-about-hub.cjs` line 14; `prototype/shared/commerce-r9.js` line 29 (receipt); `prototype/shared/receipt-pdf.js` line 16 |
| Support phone | **+91 9137624394** (display) / `tel:+919137624394` (link) | same four files |
| Where they appear in the prototype | Contact & Support page, the 7 policy pages (policy contact block from `build-about-hub.cjs`), order receipt page, receipt PDF. **Not** in the shared footer (`prototype/index.html` has no `mailto:`/`tel:`) | verified 2026-09-16 |
| Brand name | Aalishaan Studio | `prototype/index.html`; `prototype/assets/brand/aalishaan-studio.png` (2172 × 724, D-PRE-07) |
| Production domain | TBD — decision D-04 (lean `aalishaanstudio.com`, the mail domain above) | `docs/PROJECT-STATUS.md` §8a |
| Seller legal identity, address, registrations | **Not a fact** — owner input OI-01 | `docs/PROJECT-STATUS.md` §8b |
| Social profile URLs | None — deferred by the owner; five footer icons have no destinations and no dummy links are created | D-PRE-12; OI-13 |

## 8. Site structure

| Fact | Value | Source |
|---|---|---|
| Registered manifest entries | **60** = 58 public (51 Storefront + 7 Policies) + 2 Admin (`admin/index.html` — the final Admin, Admin A2 — 86400 UI edition; `admin/wireframe/index.html` — W1, retained reference, never a build reference) | `prototype/site-manifest.json` `pages[]` (count verified 2026-09-16 and 2026-09-17); `prototype/PAGE-TRACKER.md` E8 "Build passed 60 pages" |
| Friendly aliases | **66** (22 `/artworks/[slug]`, 11 `/art-styles/[slug]`, 4 `/collections/*`, 7 `/policies/[slug]`, 1 legacy `/collections/the-age-of-sail/the-ship-behind-the-fog-bell`, 21 single aliases incl. `/`→`/home`, `/shop`→`/shop-all`, `/about`→`/about-us`, `/track`→`/track-order`) | `prototype/site-manifest.json` `aliases{}`; `prototype/scripts/check-routes.cjs` |
| Directory page | `site-map.html` is the manifest `directory`, not a `pages[]` entry | `prototype/site-manifest.json` |
| Public entries by sprint | S1.3: 15 (Home, About, About the Studio, Help, Contact, Track, 7 policies, 404, 500) · S1.4: 17 (Shop All, Collections + 3, Art Styles + 11) · S1.5: 24 (22 artworks, `/product`, `/cart`) · S1.6: `/checkout` · S1.7: confirmation page (`/order/demo` in the prototype; app route D-09) = 58 | `docs/ROADMAP.md` Stage 0 |
| Policy pages | 7: cancellation, cookies, privacy, refunds, returns, shipping, terms — copy intentionally states final terms are pending (D-PRE-13) | `prototype/scripts/build-pending.cjs` `policies`; `docs/PROJECT-STATUS.md` §10 #6 |
| Public page list locked at R13 | 22 public rows — numbered 1–21 plus 5a (Home; Shop; Collections; Art Style; About; About the Studio; Product Page; Help; Contact & Support; Track Order; Cart; Checkout; Order Confirmation; 7 policies; 404; 500) | `prototype/docs/PROJECT-HISTORY.md` Pages table; D-PRE-02 |

## 9. Customer milestones and Admin order stages

| Fact | Value | Source |
|---|---|---|
| Customer message milestones (four) | 1 **Order confirmation** · 2 **Production started** · 3 **Dispatched** · 4 **Delivered** | `prototype/admin/state.js` line 23 (`kind` values); AF1 line 38 "Four normal milestones: confirmation, production start, dispatch and delivery"; D-PRE-16 |
| Trigger points in the prototype | Confirmation on captured payment; Production started at stage ≥ 3 (Printing); Dispatched at stage ≥ 8 (Shipped); Delivered at stage 10 | `prototype/admin/state.js` lines 23, 44, 47, 56, 57 |
| Not a milestone | "Refund confirmed" and exception/delay/decision/replacement messages are additional approved-template messages, not one of the four | `prototype/admin/state.js` line 70; AF1 S3 (line 125); Pending — sprint S2.18 |
| Milestone template texts | **Not a fact** — owner input OI-09; interim wording registered in `docs/content/new-strings.md` (NS-07) | `docs/PROJECT-STATUS.md` §8b |
| Admin order stages (eleven, in order — the stored stage of each order **item**, and the text of the Stage pill in the Orders table) | 0 **Pending payment** · 1 **Paid & confirmed** · 2 **Ready to make** · 3 **Printing** · 4 **Framing** · 5 **Quality checked** · 6 **Packed** · 7 **Pickup booked** · 8 **Shipped** · 9 **Out for delivery** · 10 **Delivered** | `prototype/admin/state.js` line 5 (`stages` array); AF1 line 59 |
| Journey rail labels in the selected-order workspace (eleven stops, in order — display labels, not stored values) | 0 **Placed** · 1 **Payment** · 2 **Ready to make** · 3 **Printing** · 4 **Framing** · 5 **Quality check** · 6 **Packed** · 7 **Pickup booked** · 8 **Shipped** · 9 **Out for delivery** · 10 **Delivered**. Three labels differ from the stage names (Placed / Payment / Quality check vs Pending payment / Paid & confirmed / Quality checked); the rail opens on the stop `[1,2,3,3,5,6,7,8,9,10,10][item stage]` | `prototype/admin/workspace.js` lines 17–18 |
| Order summary states beyond stages | Cancelled · On hold · Part delivered (the order summary is derived from its items: otherwise Delivered when every item is at stage 10, else the name of the lowest item stage) | `prototype/admin/state.js` line 84 `summary()` |
| Public Track timeline (prototype, 7 steps) | Order confirmed · Artwork prepared · Being framed · Quality checked · Packed securely · On its way · Delivered — sample only; live Track shows parcel-derived milestones (Pending — sprint S2.10) | `prototype/shared/commerce-r9.js` lines 37–45 |
| ~~Admin menus~~ | ~~Orders, Customers, Products, Support, Reports, Tools; Settings separate; Today is the default screen~~ — **superseded 2026-09-17 by D-PRE-23**: AF1 §3's menu layout is not built. The sections of the final Admin are in §9a | D-PRE-23 (supersedes this part of D-PRE-16); `docs/PROJECT-STATUS.md` §10 #7 |
| Admin scope IDs | 26 capabilities O1–O9, C1–C2, P1–P4, S1–S3, R1–R2, G1–G6; stories US01–US23 (US24 = V2 scope control). Unchanged by D-PRE-23; `CAPABILITY-MAP.md` maps each ID to its home in the final Admin | AF1; `prototype/admin/CAPABILITY-MAP.md`; `prototype/admin/wireframe/scope.js` (26 capability rows, 23 story titles — loaded at runtime by Help & demo); D-PRE-11, D-PRE-16, D-PRE-23 |
| Staff roles | See §9a (owner plus the presets Operations and Customer support — D-35); real roles and approval limits remain owner input OI-10 | §9a; `docs/PROJECT-STATUS.md` §8a D-35, §8b OI-10 |

## 9a. The final Admin — Admin A2 — 86400 UI edition (D-PRE-23)

Labels below are implemented verbatim in the production Admin. Rows marked **PROTOTYPE fact** describe how the local prototype behaves; they are recorded so nobody mistakes them for a production commitment — decision D-32 replaces each of those mechanisms and no sprint builds them.

| Fact | Value | Source |
|---|---|---|
| Sections (sidebar, in order) | **Orders** (landing page) · **Customers** · **Products** · **Support** · **Reports** · **Staff & Access** · **Connections** — seven, no per-section page tabs | `prototype/admin/app.js` line 25 (`areas`), line 46 (navigation list), line 45 (default route `orders`); `prototype/admin/CHANGELOG.md` line 19; D-PRE-23 |
| Owner menu | **Store setup** (opens the business-rules screen, whose page heading is "Business rules") · **Access & backups** (opens Staff & Access) · "Sign-out preview" (**PROTOTYPE fact** — D-32e) | `prototype/admin/index.html` line 5; `prototype/admin/settings.js` line 28 |
| Top bar | Global search (placeholder "Search records", button "Search") · **View website** · **Help & demo** | `prototype/admin/index.html` line 5 |
| Not in the final Admin | No Today screen (D-28); no Tools menu or planned-tools page — the old `#tools` route redirects to Help & demo › Scope (D-29); no separate Settings area; no "Make & pack", "Ship & deliver" or "Payments & refunds" pages — that work is the journey-rail stops of the selected order; refunds are worked in Support › Refunds (D-30). Retained Admin A1 wording that still surfaces (for example "Return to Today" on the Access restricted screen) is not copied | `prototype/admin/workspace.js` lines 61–70 (route redirects); `prototype/admin/app.js` lines 14, 47; `docs/PROJECT-STATUS.md` §10 #8 |
| Orders table | Caption "Orders"; columns **Order / date** · **Customer** · **Artwork** · **Amount / payment** · **Stage** · **Promise** · **Attention**; "Show" filter All · Active · Needs attention · Delivered · On hold · Cancelled; "Sort by" Priority first (default) · Newest order · Oldest order · Promised date; 6 rows per page; "More tools" holds Bulk assignment, Save current view and the saved views | `prototype/admin/workspace.js` lines 14, 40–46 |
| Follow-ups (per order) | Fields Owner · Follow-up date · Status (Open / Acknowledged / Snoozed / Resolved) · Outcome or next action — there is no global task queue (D-28) | `prototype/admin/workspace.js` line 43; `prototype/admin/orders.js` line 10 |
| Product editor tabs | **Details & prices** · **Public images** · **Private files** · **SEO & publish**; header actions New product · General images · Catalogue tools (Materials & suppliers · Collection order · Import with preview · Export catalogue) | `prototype/admin/cms.js` lines 20–27 |
| Product statuses — stored values | `Active` · `Draft` · `In review` · `Hidden` · `Retired` (`Active` is set only by publishing; all 22 baseline artworks start `Active`; a saved draft, an SEO save, a public-image upload or override removal, a new print version, Restore as draft and an applied import row return the product to `Draft`, while "Review approvals" and "Add approval evidence" write a revision without changing the stored status) | `prototype/admin/products.js` line 15; `prototype/admin/cms.js` lines 28–39 |
| Product statuses — display labels | `Hidden` is shown as **Paused**, `Retired` as **Archived**; `Draft` and `In review` are shown as stored. `Active` is shown as "Approved baseline", or "Published in demo" once published in the prototype (**PROTOTYPE fact** — the production label for a published product is not a locked fact: D-32d, `new-strings.md` when needed). "Visibility" filter: All products · Approved / demo published · Draft · In review · Paused · Archived. There is no stored status named Paused or Archived (D-33) | `prototype/admin/workspace.js` line 15 (`statePill`); `prototype/admin/cms.js` line 27 |
| Per-product public image slots (eight — key · label) | `frame-white` · White frame — `close-white` · White frame - close-up — `frame-black` · Black frame — `close-black` · Black frame - close-up — `frame-antique-gold` · Antique gold frame — `close-antique-gold` · Antique gold - close-up — `paper` · Paper / unframed — `artwork` · Public artwork image | `prototype/admin/cms.js` line 7 |
| General (shared) image slots | **14** = **7** in group "Size guides" + **7** in group "Craft & materials" (ids `general-1`…`general-14`), each mapped only to existing approved image positions (28 target paths); titles: Room size guide - portrait (×3), Room size guide - landscape (×3), A2 size comparison; Black frame craft detail, White frame craft detail, Antique gold frame craft detail, Archival paper close-up, Acrylic glazing, Frame anatomy, Back & hanging system (D-34) | `prototype/admin/media-manifest.js` |
| Upload limits — **PROTOTYPE facts, not production commitments** | Public image: PNG, JPEG or WebP, up to 25 MB, at least 100 px on each side. Private file: up to 100 MB each; print versions named `v1`, `v2`, … Backup / restore ZIP: up to 512 MB. Private vault auto-locks after 15 minutes without private-file activity. Production limits are set by the sprints that build uploads (S2.1 upload validation, S2.3, S2.5) | `prototype/admin/media-store.js` line 9 (`MAX_PRIVATE`, `MAX_PUBLIC`, `MAX_BACKUP`), line 25; `prototype/admin/SECURITY-AND-STORAGE.md` |
| Private files tab | Two categories: **Print originals** (by version) and **Approval evidence**, plus **Version approvals** (rights, print-file version, physical sample — recorded by the owner). The passphrase vault that holds them is a **PROTOTYPE fact** (D-32a) | `prototype/admin/cms.js` lines 22–24, 34–38; `prototype/admin/media-store.js` |
| Support tabs | **All requests** · **Returns & replacements** · **Cancellations** · **Delivery issues** · **Refunds** (owner-only); header links Messages · Saved replies; button New request; status filter Open (default) · Waiting · Resolved · All | `prototype/admin/workspace.js` lines 53–60; `prototype/admin/app.js` line 29 |
| Support request categories (six) | Enquiry · Damage · Return · Replacement · Cancellation · Delivery (Damage, Return and Replacement require a linked order) | `prototype/admin/workspace.js` line 60 |
| Reports tabs | **Sales & money** (default) · **Products** · **Operations** — Sales & money and Products are owner-only; for the Operations and Customer support previews the sidebar's Reports item opens the retained "Operations" page (`#reports/operations`) instead of the tabbed screen (production: one Operations report for both presets, D-35); the tab is named Products, not "Artwork performance" (D-33) | `prototype/admin/workspace-admin.js` line 11; `prototype/admin/app.js` lines 29 and 46 |
| Help & demo tabs | Guided demos · Capability coverage · Scope. **PROTOTYPE fact** for the demos, the 23 scenario starts, the scenario indicator and the "LOCAL PROTOTYPE" bar (D-31); the production Help page keeps the guides, the coverage view and the scope statement | `prototype/admin/workspace-admin.js` lines 38–41; `prototype/admin/index.html` line 6 |
| Connections cards | Razorpay · Shiprocket · Email · WhatsApp · SMS; WhatsApp and SMS are described as "Optional customer contact channel." and have no integration in V1 (D-33, D-PRE-22); default card status "Not configured" | `prototype/admin/workspace-admin.js` lines 35–37 |
| Staff roles and presets | The **owner** (fixed first row "You" / "Owner" — "All areas, approvals and financial actions") plus two permission presets: **Operations** — "Orders, production, parcels, catalogue and materials. No refunds, finance, owner settings or exports." and **Customer support** — "Customer records, support, notes and remedy recommendations. No provider refunds or private print files." Launch roles follow these (D-35); real roles and approval limits are owner input OI-10. **PROTOTYPE fact:** staff records are local previews and the preset permissions are decorative — never read by the prototype's checks | `prototype/admin/workspace-admin.js` lines 27–30 |
| Permission areas (six) | `work` · `support` · `finance` · `catalogue` · `settings` · `export`. Prototype role previews: owner — all six; operations — `work`, `catalogue`; support — `support`. Finance is owner-only at launch (D-35) | `prototype/admin/state.js` line 38 |
| Role previews and sign-in — **PROTOTYPE facts** | Three preview roles `owner` (default), `operations`, `support`, with demo names Khalid / Asha / Rahul. There is no visible role control: the role select in `index.html` is hidden, the sign-in preview offers only the owner ("Sample access code", 123456; "Owner recovery preview" reference RECOVERY-DEMO), and the only in-UI route to a non-owner preview is scenario US20, which switches to `operations`. All checks run in the browser and are presentation only (D-32e; `SECURITY-CHECKLIST.md` §9) | `prototype/admin/index.html` line 5; `prototype/admin/state.js` lines 6, 24, 38; `prototype/admin/app.js` line 29; `prototype/admin/workspace-state.js` line 39; `prototype/admin/workspace-admin.js` lines 49–50; `prototype/admin/settings.js` line 24 |
| Sample data — **PROTOTYPE fact** | A fresh browser opens with **one** sample order, **AS-1001** (scenario 2, "one ordinary order by default"); demo reference date 2026-09-13; an existing Admin A1 browser keeps its records | `prototype/admin/workspace-state.js` lines 20, 43–48; `prototype/admin/CHANGELOG.md` line 30; `prototype/admin/QUICK-START.md` |
| Storage keys — **PROTOTYPE facts, reference only, never ported** (D-32g) | localStorage `aalishaan-admin-a1-v1` (the whole Admin state — deliberately the unchanged A1 key, not a stale name); IndexedDB database `aalishaan-admin-a2-files` with object stores `public`, `private`, `meta`; transient localStorage key `aalishaan-a2-restore-check` during a restore | `prototype/admin/state.js` line 4; `prototype/admin/media-store.js` lines 7, 19; `prototype/admin/workspace-admin.js` line 33; `prototype/admin/SECURITY-AND-STORAGE.md` |
| Store setup › Order intake (E10) | Panel "Order intake" on the Business rules screen, between the rule-version notice and the rule form: facts Order intake (**Open** / **Paused at capacity**) · Since · Reason · Waiting; buttons **Pause order intake** (drawer: Reason — Capacity reached · Studio closure · Other; note; confirmation checkbox) / **Resume ordering** (drawer: "Send the reopening notice now to N waiting contact(s) with an email address", note); **Waiting list**; "Pause history". Owner-only banner on every page while paused: "Order intake paused since <time> · N waiting" with links Waiting list · Manage (D-37) | `prototype/admin/e10-additions.js` (`A.intakePanel`, `afterRender`); hook `prototype/admin/settings.js` line 28 |
| Waiting list page (E10, `#settings/waitlist`, owner only) | Columns **Contact** · **Bag** · **Joined** · **Consent** · **Reopening notice** · **Actions**; header buttons **Send reopening notices** · Resume ordering / Pause order intake · Store setup; row action **Remove** (reason); notice pills Provider accepted · Not sent · Manual contact; sample entries WL-1001…WL-1003 and the read-only "Captured in this browser's storefront preview" list (**PROTOTYPE facts**, D-32j); audit entities INTAKE and WAITLIST | `prototype/admin/e10-additions.js`; `prototype/admin/state.js` line 35 |
| Payment stage › Refunds & remedies (E10) | Shown only to the owner once payment is Captured: **Captured amount** · **Confirmed refunds** · **Remaining balance** · **Open remedies**; button **Open remedies** → `panel=remedies`, which embeds the canonical refund record in place (its standalone heading "Remedies · <order>" is dropped when embedded) with "Back to current step"; other roles see the notice "Owner only" (D-39) | `prototype/admin/workspace.js` (`remedies()`, stage 1 branch, `paneMap`) |
| Evidence counts of the package | **53** views compared control-for-control; **265** responsive renders (53 views × 1440, 1024, 768, 390, 320 px); **161** scenario renders (23 scenarios × 7 sections); **27** interaction assertions; **44** expanded layouts and **24** drawer layouts; **13** state-guard groups (repeatable: `node admin/tests/check-state.cjs` from `prototype/`); **23** scenario entry points (entry/render checks only); **36** files in the vendor package manifest (retained as `CONTENTS-SHA256-86400-2026-09-17.txt`; the E10 folder manifest `CONTENTS-SHA256.txt` lists 39 files). The package states what it does not certify (native storage, encryption, backup/restore, real authentication and providers, physical devices) | `prototype/admin/TEST-RESULTS.md`; `prototype/admin/tests/ui-checks.json`, `interaction-checks.json`, `expanded-checks.json`, `check-state.cjs`; `prototype/admin/CAPABILITY-MAP.md`; `prototype/admin/CONTENTS-SHA256.txt` |

## 10. Providers

| Fact | Value | Source |
|---|---|---|
| Payments | **Razorpay** | D-PRE-01; AF1 §1; `prototype/PAGE-TRACKER.md` line 58 |
| Delivery | **Shiprocket** | D-PRE-01; AF1 §1 |
| Transactional email | TBD — decision D-06 (lean Resend); OI-09 for sender and templates | `docs/PROJECT-STATUS.md` §8a |
| WhatsApp / SMS | Not configured in V1 (optional, separately approved — D-PRE-22). The final Admin shows WhatsApp and SMS cards in Connections as optional and not configured, and the customer-profile composer only opens a draft in the staff member's own app, logged "Compose opened - delivery not verified" — no integration in V1 (D-33) | AF1 S3 (line 125); `prototype/admin/workspace-admin.js` line 35; `prototype/admin/workspace.js` line 52; `docs/ROADMAP.md` S2.18 |
| Razorpay capture mode, refund/settlement configuration; Shiprocket status mapping | **Not a fact** — owner input OI-08; decision D-21 | `docs/PROJECT-STATUS.md` §8 |
| Hosting | Vercel (Preview + Production); Supabase TEST/PROD | `docs/PROJECT-STATUS.md` §8a D-01, D-03, D-05 (leans, confirmed at S0.0) |
| Prototype hosting (reference only) | GitHub Pages via Actions, https://86400studio.github.io/aalishaan-studio/ — static preview, not application hosting | D-PRE-15; `prototype/README.md` |
| Paid accounting / helpdesk subscription | None is a V1 dependency | D-PRE-10 |

## 11. Not a fact until the owner supplies it

These appear in the prototype only as "To be confirmed", "pending" or sample values. **Never** implement a guessed value, a zero charge or the Admin demo's example rule values (D-PRE-13). Each is configuration applied in S3.1 as an effective-dated rule version.

| Item | Prototype state | Owner input | Applied in |
|---|---|---|---|
| Shipping charges, destinations, production/transit promises, working days | "To be confirmed"; sample PIN table | OI-03 | S1.6 synthetic flag → S2.9 real serviceability → S3.1 |
| Tax classification; whether displayed prices include tax | Not stated | OI-02 | S1.6 synthetic → S2.15 → S3.1 |
| Outer framed dimensions, packed dimensions, weights | "will be confirmed before ordering" | OI-04 | S2.5, S2.9 → S3.1 |
| Cancellation / change cut-offs, damage reporting, return eligibility, remedy scope, refund timing | Policy pages say terms are pending | OI-05 | S2.7, S2.11, S2.14 → S3.1 |
| Seller legal identity, address, registrations, policy contact | Not stated | OI-01 | S2.15 (synthetic watermark) → S3.1 |
| Invoice / credit-note issue point, numbering, corrections | Sample ids only — the final Admin generates `INV-DEMO-…` / `CN-DEMO-…` ids on downloads marked "SAMPLE — NOT A TAX DOCUMENT" (`prototype/admin/records.js` lines 20–23); not a fact (D-32i) | OI-11 | S2.15 → S3.1 |
| Materials/BOM, capacity, reservation expiry, rework rules | Demo rules: capacity 6, Mon–Fri, hold 20 min, status Draft — **examples, not values** | OI-06 | S2.6, S2.8 → S3.1 |
| Production files, rights evidence, sample approvals, packaging evidence | Demo `fileVersion 'v3'` | OI-07 | S2.5 → S3.3 |
| Milestone and exception message templates; sender | Demo `<kind>-v1` templates | OI-09 | S1.8 (NS-07 interim) → S2.18 → S3.1 |
| Staff roles, approval limits, retention, identity verification | Demo Khalid/Asha/Rahul role previews and local staff preview records with the presets Operations and Customer support (§9a); launch lean D-35 — owner plus the two presets, finance owner-only | OI-10 | S1.2, S2.1, S2.12 → S3.1 |
| Volumes, response targets, recovery time, permitted data loss | Not stated | OI-12 | S2.20 → S3.1 |
| Social profile URLs | Icons without destinations | OI-13 (deferred) | Post-launch backlog |
| Razorpay / Shiprocket account configuration | Connections cards read "Not configured" until a demo outcome is recorded (the cards read `providerChecks`, not the seeded `connections` values — 'Simulation only' for Razorpay and Shiprocket, 'Sender/provider input needed' for Email — which the final Admin never displays; `prototype/admin/workspace-admin.js` line 36, `state.js` line 24); no provider is contacted | OI-08 | S1.7, S2.4, S2.9, S2.16 (synthetic / test mode) → S3.3 |
| Waiting-list customer copy — capacity notice title / body / button, success line, resume-link states, reopening-email subject; the checkout payment-policy line; the two FAQ entries; the privacy and cookies sentences | Drafted in prototype E10 (`prototype/shared/intake-e10.js`, `prototype/admin/e10-additions.js`, `prototype/scripts/checkout-r9.cjs`, `prototype/scripts/build-pending.cjs`) — **draft, not approved copy** | NS-12–NS-15 (owner approval) | S1.3 / S1.6 (payment line, FAQ, policy sentences), S2.21 → S3.1 |
| Waiting-list retention period | The prototype's Waiting list notice says 90 days — a lean | OI-10 | S2.21 → S3.1 |
| Production domain | `[DOMAIN]` placeholder | D-04 | S3.3 / S3.4 |
| Charsen display font licence | "Demo for Personal Use" | D-13 | S3.1 (flagged from S1.3) |

## 12. Change log

| Date | Change | Decision |
|---|---|---|
| 2026-09-16 | File created from prototype E8 data files and locked decisions D-PRE-00…D-PRE-21. | D-PRE-00 (opens development from E8 + AF1) |
| 2026-09-17 | Reference revision → E9 (public E8 + Admin A2 — 86400 UI edition). Every Admin row re-verified against the final Admin's code; §9 "Admin menus" row struck through as superseded; journey-rail labels row added; new §9a (sections, owner menu, top bar, Orders table, product statuses and display labels, 8 per-product and 14 general image slots, prototype upload limits, Support tabs and categories, Reports tabs, roles, presets and permission areas, sample order, storage keys, evidence counts); §8 manifest row, §10 WhatsApp / SMS row and three §11 rows updated. No public fact changed. | D-PRE-23; D-28–D-36 |
| 2026-09-23 | Reference revision → E10 (E9 + the three additions: order-intake pause and waiting list, online-only payment line with a WhatsApp contact, Payment-stage Refunds & remedies block). §6 waiting-list validation and payment-policy rows; §9a Order intake, Waiting list and Refunds & remedies rows; manifest names updated; §11 draft-copy and retention rows. | D-37, D-38, D-39 |
Next step → new or missing strings go to `docs/content/new-strings.md`; owner inputs are tracked in `docs/PROJECT-STATUS.md` §8b.
