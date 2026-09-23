# Admin A2 - Release checks

Release date: 17 September 2026. Baseline: the owner's approved `admin pages.zip`.

## Completed checks

| Check | Result |
|---|---|
| Original admin model/state safeguards | PASS - 13 original groups |
| Original non-admin source hashes | PASS - all 395 supplied files unchanged |
| Replacement script/style references | PASS - all 17 served by the original repo's HTTP server |
| Existing admin/public entry points | PASS - four HTTP endpoints returned 200 |
| A1 migration | PASS - existing orders and edited customer/order notes retained |
| Scenario draft privacy | PASS - no inherited private-file or approval references |
| JavaScript syntax | PASS - replacement and retained admin scripts |
| Isolated scenario entry/render checks | PASS - all 23 entries |
| Responsive route checks | PASS - 15 views at 1440, 1024, 768 and 390 pixels; 60 checks |

## Focused functional checks

The following are completed checks from focused batches. Incomplete combined runs were not counted as completed tests.

- PASS: Fresh install: 7 sections, one owner, one order, 22 products.
- PASS: Complete order journey through actual forms and confirmations.
- PASS: Damage after delivery and canonical refund approval/unknown/verification/reporting.
- PASS: Profile identity check, address/history separation, tags and promotional consent.
- PASS: Staff, honest connection state, and scenario reset preserving staff/public storage.
- PASS: Encrypted private upload, verified original download, lock and wrong-passphrase rejection.
- PASS: New print versions keep released job pinned; approval evidence stays private.
- PASS: Public image revisions, unchanged originals and exact-path shared assets export excluding private files.
- PASS: Backup/restore round-trip, passphrase retained, corrupt backup rejected without data replacement.
- PASS: Uncaught browser JavaScript exceptions.
- PASS: Draft saving, exact publish blockers, safe deletion, demo publication and pause.
- PASS: Mixed CSV validation and new drafts never inherit private files or approvals.
- PASS: Unsaved product edits protected on navigation; explicit discard leaves saved record intact.
- PASS: Filtered order export, follow-up ownership and saved reply tools remain reachable.
- PASS: All 23 isolated scenario entry points and operations-role restrictions.
- PASS: 60 desktop, tablet and phone route renders without page-width overflow.

## Original safeguard groups

1. Authorisation cannot release work; captured duplicates produce one confirmation.
2. Last-frame competition keeps the existing reservation and retains the late paid order.
3. Hold blocks production; a stale cancellation cannot erase actual printing or consumed materials.
4. Competing refunds cannot exceed balance; editing invalidates approval and unknown submissions remain reserved.
5. Uncertain booking is recovered once; handover gates dispatch and old tracking cannot regress delivery; split order remains partial.
6. Failed mutations restore state and keep dialog record references valid for correction.
7. Another tab’s newer state blocks a stale consequential edit.
8. Filter/session saves also cannot overwrite a newer tab; explicit scenario reset can replace sample state.
9. A one-item remedy cannot refund the value of two purchased units.
10. A stock correction after reservation cannot start printing or consume negative stock.
11. Later refunds invalidate the current bank comparison but retain receipt evidence; unknown fees keep expected settlement unknown.
12. Resolving one request leaves other cases on the same order open; reopening restores a correctly owned follow-up.
13. CSV exports neutralise formula-like cells and quote embedded quotes.

## How these checks were run

Actual application HTML/CSS/JavaScript ran in offline Chromium, with real DOM events, forms, layout and image decoding/canvas processing. This environment blocks normal browser navigation even to local HTTP/file pages. The offline harness therefore supplied memory localStorage/IndexedDB adapters and a native Node WebCrypto relay, rather than claiming native browser persistence or HTTPS behaviour was tested. Download checks inspected the actual generated Blob bytes; native operating-system download UX was not certified.

File checks covered encrypted versus plaintext storage, exact-byte print download and fingerprint agreement, wrong-passphrase rejection, pinned file versions, separate approval evidence, original public-image download, valid shared-image ZIP output excluding private bytes, encrypted backup contents, restored-file decryption and rejection of a deliberately corrupted backup. A separate recovery probe exercised full record/file restore and rendering after restore. Focused dirty-form, draft, import, refund and order controls used actual forms and confirmations.

The original repository's Node HTTP server was also tested independently: entry points and every loaded admin script/style returned HTTP 200. All 395 non-admin baseline hashes were compared. No public builder or deployment was run.

## Not verified here

- Normally navigated/hosted browser behaviour and native IndexedDB durability, quota eviction, cross-device use or every browser implementation.
- Actual production authentication, real staff accounts, server access controls, live provider actions, customer message delivery, cloud file storage or public publication. These are not implemented by this prototype.
- Every branch of every acceptance story. Entry checks are distinguished from end-to-end workflow checks above.
- The complete public-site visual/build handoff using all original assets: the supplied reduced archive omits artwork references. Existing public references remain unchanged, with safe public-thumbnail fallbacks in admin where available.
- A universal zero-bug guarantee. The completed checks reduce risk but do not certify every environment or future change.

Before using the local vault for important reference work, run the short upload/download/backup/refresh/restore check in QUICK-START.md using a copy of a sample file on your own normally served browser. Keep originals independently.
