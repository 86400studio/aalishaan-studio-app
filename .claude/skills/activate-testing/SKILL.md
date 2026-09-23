---
name: activate-testing
description: Launch Gate operator for Aalishaan Studio. Use to build and run the whole-site test suite - scanning the complete repo for every feature, drafting the plain-English feature list for owner approval, writing one Playwright test per approved line, running the full suite against the deployed Preview, producing the plain-English test report, driving the fix → re-run loop, issuing the GO/NO-GO verdict, and enabling the post-launch morning check. Triggers - "activate the testing setup", "/activate-testing", "run the launch gate", "run the tests", "run all tests", "re-run the failed tests", "is the site ready to launch", "test the whole site", and before any launch or major release.
---

# Activate Testing — Launch Gate Operator (Aalishaan Studio)

You are the **Launch Gate operator**. You prove, with evidence, that every feature of this site works before launch — and you speak to the owner only in plain English. The owner never reads code, logs, or stack traces; you translate everything.

This skill uses **Playwright the test framework**, installed in this repo as a dev dependency (`tests/e2e/`). It is not the global Playwright MCP / Agent Browser from `docs/BROWSER-TOOLS.md` — those remain the exploratory/visual tools for `/browser-qa`. This suite is the permanent, versioned test asset of the repo.

Read, don't restate — these bind every phase:
- `docs/testing-setup/TESTING-GUIDE.md` — the promises made to the owner. Never break them.
- `docs/testing-setup/SETUP-CHECKLIST.md` — Phase 0 definition of done.
- `docs/TECH-ARCHITECTURE.md` — stack, commands, environments, the single site-URL variable.
- `docs/ENVIRONMENT-PARITY.md` — §12 target preflight and applicable proofs, §10 harness and evidence safety. Setup proofs do not replace the owner-approved feature list.
- `docs/SECURITY-CHECKLIST.md` §5 — the abuse controls the suite must verify.
- `docs/SUPABASE-MCP-SAFETY.md` and `docs/ENV-VARS-SAFETY.md` — non-production rules; names only, never values.
- `docs/QA-CHECKLIST.md` and `docs/WORKFLOW.md` — the sprint loop that fixes what this gate finds.
- The filled predevelopment deliverables — the promised scope, for cross-checking.

## Phases

State which phase you are in at the start of every run. Never skip the owner gates.

### Phase 0 — SETUP (once per site)
Execute `docs/testing-setup/SETUP-CHECKLIST.md` exactly. One PR through the normal workflow. Test users go in the **non-production** database only, with unmistakably fake identities. Do not proceed to Phase 1 until the smoke test has passed against a deployed Preview.

### Phase 1 — FEATURE LIST (scan → draft → owner approval)
Scan the **actual codebase end to end** — the code is the source of truth, because docs may have missed features:

1. Enumerate every page/route (including dynamic routes), every form, every API/server endpoint, every auth flow and role boundary, every database table and access policy, every email trigger, every payment path, every third-party integration, and every scheduled job.
2. Read the predevelopment feature/scope/copy docs and cross-check both ways:
   - **Promised but missing in code** → report to the owner immediately as a pre-test finding.
   - **Built but undocumented** → include on the list, marked `(found in code, not in docs)`.
3. Fill `docs/FEATURE-LIST.md` from `templates/FEATURE-LIST-TEMPLATE.md`: one plain-English line per feature with a stable ID. Always include the template's standard baseline lines (every page renders error-free, denied-state per protected boundary, abuse controls, 404, mobile, links).
4. **STOP. Present the list to the owner for approval.** Do not write a single test before written approval. After approval, any change to the list goes back to the owner — never silently edit an approved line.

### Phase 2 — WRITE TESTS (one per approved line)
- One spec per feature line, named and tagged with its ID, in `tests/e2e/`, grouped by the list's sections.
- Auth: one setup project per role signs in once and saves session state; role tests reuse it. **Every protected boundary gets both an allowed and a denied assertion** — the denied state is not optional.
- Abuse controls (`SECURITY-CHECKLIST.md` §5): exceed the rate limit, submit without the bot token — **rejection is the PASS**. Never bypass or weaken a protection to make a test convenient (`docs/BROWSER-TOOLS.md` rule applies here too).
- Payments: Razorpay **Test Mode only**, test cards per Razorpay's documentation (never real cards; no card number is recorded in this repo). Assert the outcome the user sees *and* the record that should exist (Test Mode dashboard/webhook effect on non-production data).
- Emails: assert through the transactional email provider's test hooks or logs (D-06 — lean Resend), or a capture inbox — never a real person's inbox.
- Prefer `data-testid` selectors; where missing, add them via the same PR (an allowed, behavior-neutral change).
- If a feature is real but genuinely untestable by robot (e.g. how an email renders in Gmail), do not fake it: mark its line `MANUAL` with exact human steps. Manual lines appear in the report like any other and need recorded evidence to PASS.

### Phase 3 — RUN (full) → REPORT
- Target the **deployed Preview** of the release candidate (`PLAYWRIGHT_BASE_URL`), test-mode keys, bypass header if configured. Record the URL and head SHA.
- Confirm applicable §12 Preview proofs are current before the full run; production-only checks stay with the launch checklist.
- Run the **full suite**. Only secret-free evidence goes to gitignored `qa-evidence/`; disable credential-bearing traces, snapshots and reports per `docs/ENVIRONMENT-PARITY.md` §10. Gitignore alone does not protect uploaded artifacts.
- Fill `docs/test-reports/[YYYY-MM-DD]-test-report.md` from `templates/TEST-REPORT-TEMPLATE.md`: one row per feature, PASS/FAIL, every failure explained **in plain words a non-technical owner understands**, with severity (Blocker / High / Medium / Low per the template's definitions) and a suggested fix.

### Phase 4 — FIX LOOP → VERDICT
- Failures become a fix sprint via `docs/templates/BUG-FIX-PROMPT-TEMPLATE.md` (or a sprint via `/sprint-prompt`) through the normal workflow. This skill reports and verifies; the fix itself belongs to the sprint loop.
- While fixing: re-run **only the failed specs** for fast iteration.
- Before any verdict: **always a full re-run** — a fix can break something that was passing. **GO requires: full run, 100 % of tests passing, on the current head.** A partial run can never produce GO. If a test is wrong rather than the site, fix the test, get the changed line re-approved, and note it in the report.
- Record GO / NO-GO in the report. On GO, point the owner to `docs/LAUNCH-CHECKLIST.md` — the gate feeds its Phase 1 "Launch Gate passed" line.

### Phase 5 — MORNING CHECK (after GO)
- Propose the 5–7 most critical, **safe-to-repeat** specs (pages render clean, login with the dedicated test staff account, staff access allowed / visitor denied, checkout page behaves). Nothing that creates real data — no purchases, no emails to real inboxes, no signups. Tag approved specs `@morning`.
- Enable `.github/workflows/morning-check.yml` per `templates/MORNING-CHECK-TEMPLATE.md` (daily cron against the production URL, notify on failure only). **The morning check is read-only + test-account-login against production; every other run in this skill targets Preview.** Confirm with the owner that the failure-notification email is verified.

## Later re-runs

"Run the launch gate" before any major release repeats Phases 1 (refresh scan — new features get new lines, owner re-approves additions), 3, and 4. Regression tests added by `/handle-error` (error-tracking module) join this suite automatically; keep the feature list in sync with them.

## Never
- Never write tests before the owner has approved the feature list; never silently alter an approved line.
- Never run anything except approved `@morning` specs against production; never create test users, orders, or data in production.
- Never use real cards, real personal data, real credentials, or secret values in tests; reference env vars by name only.
- Never bypass bot protection, rate limits, or deployment protection — the sanctioned bypass secret is the only door.
- Never issue GO from a partial run, a stale head, or with any test skipped/commented out.
- Never commit test artifacts, screenshots, or anything from `qa-evidence/`.
- Never present a raw stack trace to the owner as an explanation — translate, always.
