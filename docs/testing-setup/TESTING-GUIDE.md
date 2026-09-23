# Testing Guide — How the Launch Gate Works

Written for the owner. No jargon survives past this line without being explained.

---

## 1. What this system is

Before a website launches, a robot user tests **every feature the site has** — it visits every page, signs staff in and out, fills every form, pays with a Razorpay test card in Test Mode, and tries doors it should not be allowed through. Every feature gets a PASS or a FAIL. Failures get fixed through your normal sprint workflow, the robot re-checks, and only when **everything** is green does the site get its GO to launch.

The point: you find the broken things. Not your users, not the client, not three weeks after launch.

## 2. The two moving parts

**Playwright — the tester.** Free software that Claude Code installs *inside the website's repository*, like adding a tool to a toolbox. There is no Playwright account, no website to sign up on, no monthly fee. It drives a real browser exactly like a person would: click, type, scroll, submit.

*(Not to be confused with the global browser tools from `docs/BROWSER-TOOLS.md` — those let Claude Code look at pages while working. Playwright here is the permanent test suite that lives in the repo forever.)*

**The morning check — the watchman.** After launch, GitHub (which you already use) re-runs the 5–7 most critical tests against the live site every morning. If one fails, you get an email. **Check that the latest scheduled run succeeded** — no email alone is not proof. These safe checks cover selected page/login behavior; provider alerts and separate delivery checks cover failed email delivery or payment processing.

Error tracking (Sentry) is the third part of the full picture, but it has its own folder: `docs/error-tracking/`. Testing prevents bugs before launch; error tracking catches whatever slips through after.

## 3. The golden safety rule

**The robot never touches your real database or real money.** All testing runs against a Preview copy of the site connected to test data and Razorpay's **Test Mode** (the test cards published in Razorpay's own documentation — never a real card; no card number is written in this repo). Test users are fake staff accounts created in the *non-production* database (customers check out as guests — D-PRE-03). The only thing that ever runs against the live site is the morning check, and it is restricted to safe, repeatable actions — it never creates real orders or real data. Your existing launch checklist still includes one real manual submission on the live domain at the very end; that never changes.

## 4. The five steps, and who does what

### Step 1 — Setup (once per site)
Follow `SETUP-CHECKLIST.md`. Your part is about 20 minutes; Claude Code does the rest through a normal PR that you merge.

### Step 2 — The feature list (your ten most important minutes)
You say: **"Activate the testing setup"** (or `/activate-testing`).

Claude Code scans the **entire repository** — every page, every form, every endpoint, every database access rule, every email trigger — *and* cross-checks the predevelopment docs. Two sources, checked against each other:

- Promised in the docs but missing from the code → flagged to you immediately (that is a finding before a single test runs).
- Built in the code but never documented → still goes on the list and still gets tested.

The result is `docs/FEATURE-LIST.md`: one plain-English line per feature, like *"Visitor can complete a Razorpay Test Mode purchase and receives the confirmation email"* or *"A visitor cannot open any /admin page, even by typing the URL directly."*

**You read the list and approve it.** Add anything missing. This is the guarantee of the whole system: everything on the list gets tested; anything not on the list is exactly where "a user says something's broken" comes from later. Ten minutes of your full attention here is worth more than everything else combined.

### Step 3 — Tests written
Claude Code turns every approved line into one test. This always includes the reverse checks (people who shouldn't get in, can't) and the protection checks (hammering the login or a form gets blocked — **being blocked is the PASS**). You do nothing here except maybe answer a question or two.

### Step 4 — Run → report
One ask: "run the tests." The robot works through everything (15–20 minutes for a typical site) and writes `docs/test-reports/[date]-test-report.md`: one row per feature, PASS or FAIL, and every failure explained in plain words with a severity:

- **Blocker** — money, login, or the whole site is affected. Nothing launches with one of these open.
- **High** — a real feature is broken for some users.
- **Medium** — annoying, but the site works.
- **Low** — cosmetic.

Nobody's first run is all green. That is the system working, not failing — every FAIL in that report is a bug a real user will never meet.

### Step 5 — Fix → re-run → GO
The report becomes a fix sprint through your normal workflow (branch → build → PR → Preview → review → merge — nothing new to learn). While fixing, the robot re-runs **just the failed tests** for fast feedback. But the GO verdict only ever comes from a **full re-run of every test**, because a fix can quietly break something that was passing. Simple rule: *failed ones to iterate, all of them to finish.* A full run costs robot time, not your time — never economize on the final run.

**All green on a full run = GO.** The verdict is recorded in the report, and `docs/LAUNCH-CHECKLIST.md` takes over from there.

## 5. After the gate: the morning check

Once the gate passes, Claude Code proposes the 5–7 most critical tests (homepage loads cleanly, staff login works, staff get into Admin, visitors are blocked from /admin, the checkout page behaves). You approve the selection, and they run daily against the live site.

- You get an email **only when something fails**. A daily "all fine" email would train you to stop reading — silence is the feature.
- Only safe-to-repeat checks go in. Anything that creates real data (a purchase, a signup email to a real inbox) stays in the pre-launch gate.

## 6. Living with the system

- **The tests stay in the repo forever.** Before any big release or redesign, say "run the launch gate" and get a fresh full report. Every sprint's own QA (per `docs/QA-CHECKLIST.md`) continues as normal — the gate is the whole-site pass on top of it.
- **The feature list is a living document.** New feature shipped → its line gets added → its test exists. Every bug fixed through error tracking also adds a test here, so the same bug can never quietly return. The system gets stronger with every incident.
- **A failing test is a question, not always a bug.** Sometimes the test itself is wrong or the feature changed on purpose. Tell Claude Code — it will say plainly whether the site or the test needs fixing. Changed lines on the feature list come back to you for re-approval; nothing is silently rewritten.

## 7. What you never do

You never read code, never read logs, never open a terminal. You read two documents — the feature list and the test report — and you approve, in writing, three things: the setup PR, the feature list, and the morning-check selection. Everything else is Claude Code's job.

---

Next step → `SETUP-CHECKLIST.md`.
