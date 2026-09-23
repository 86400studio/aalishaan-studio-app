# Feature List — Aalishaan Studio

> Everything the site does, one plain-English line each. **Everything on this list gets tested; nothing off this list does.** Drafted by Claude Code from a full scan of the code plus the predevelopment docs; approved by the owner before any test is written.

- Source scan date: [DATE] · Repo head: [SHA]
- Test users (non-production only; staff roles only — customers are guests, D-PRE-03): [one per staff role, e.g. admin@example.test]
- **Owner approval: [NAME], [DATE]** ← no tests are written until this line is filled.

**How to read a line:** `ID | Who can do what | What proves it worked`. If a plain-English line here is wrong or missing, the tests will be too — this list is where your ten minutes matter most.

---

## A. Pages & content

| ID | Feature | Proof of PASS |
|---|---|---|
| PG-001 | Every public page loads with no errors, on desktop and mobile | Page renders, zero console errors |
| PG-002 | Every link on every page goes somewhere real | No 404s, no dead anchors |
| PG-003 | A wrong URL shows the site's own 404 page | Branded 404, not a blank error |
| PG-… | [Page-specific content promise, e.g. "Shop All lists all 22 artworks"] | [Visible proof] |

## B. Accounts & access *(skip section if the site has no accounts — here: staff accounts only, no customer sign-up, D-PRE-03)*

| ID | Feature | Proof of PASS |
|---|---|---|
| AC-001 | A visitor can create an account | Account exists, confirmation flow completes |
| AC-002 | A member can log in and log out | Lands on [route]; session ends on logout |
| AC-003 | Password reset works end to end | Reset email arrives (test hook) and the link works on THIS environment |
| AC-010 | **A non-member cannot open any members-only page, even by typing the URL directly** | Redirect or denied — never the content |
| AC-011 | **A member cannot open admin pages** | Denied |
| AC-… | [One allowed + one denied line per role boundary] | |

## C. Forms & email

| ID | Feature | Proof of PASS |
|---|---|---|
| FM-001 | [Form name] rejects bad input with a clear message | Inline error, no submission |
| FM-002 | [Form name] valid submission works end to end | Success state + delivery recorded (test hook) + second capture path |
| FM-003 | [Triggered email] is sent with the right content and links | Captured via provider test hook — never a real inbox |

## D. Payments *(Razorpay Test Mode only — test cards per Razorpay's documentation)*

| ID | Feature | Proof of PASS |
|---|---|---|
| PY-001 | [Artwork × frame finish] can be purchased with a Razorpay test card | Confirmation page + Test Mode payment record + `provider_events` row exists |
| PY-002 | A declined test card shows an honest failure, not a fake success | Clear error, no access granted |
| PY-003 | Paying confirms exactly what it should — and nothing before payment | Order flips to confirmed only after the server-verified Test Mode webhook, never from the redirect alone |
| PY-004 | Double-clicking Pay does not create two charges | One Test Mode charge, one order record |

## E. Protection *(being blocked is the PASS — per SECURITY-CHECKLIST §5)*

| ID | Feature | Proof of PASS |
|---|---|---|
| PR-001 | Hammering login with wrong passwords gets blocked | Rate limit engages |
| PR-002 | Rapid-fire submissions to [public form] get rejected | Rate limit / bot check rejects |
| PR-003 | Submitting [form] without the human-check token is rejected | Server-side rejection |

## F. Integrations & everything else

| ID | Feature | Proof of PASS |
|---|---|---|
| IN-… | [Shiprocket test-account serviceability / shipment booking / tracking webhook, transactional email (D-06) test hook, etc.] | [Observable proof, test hooks only] |

## G. Manual checks *(real but not robot-testable — still on the list, still need evidence)*

| ID | Feature | How a human verifies |
|---|---|---|
| MN-001 | [e.g. Order-confirmation email renders correctly in Gmail and Outlook] | [Exact steps + screenshot evidence] |

---

## Cross-check findings (docs vs code)

- **Promised in predevelopment docs but missing in code:** [none / list — each is a finding before any test runs]
- **Found in code but not in docs:** [none / list — included above, marked "(found in code, not in docs)"]

## Change log

Approved lines are never silently edited. Every later addition or change: [DATE — ID — what changed — re-approved by].
