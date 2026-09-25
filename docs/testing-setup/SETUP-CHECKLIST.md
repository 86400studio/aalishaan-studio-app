# Testing Setup — One-Time Checklist

Run once per website. Every box says who does it. Your total hands-on time: ~20 minutes.
When the last box is ticked, testing is a single ask forever after: `/activate-testing`.

> Works for new builds and existing sites alike. Prerequisites: the site lives in a GitHub repo and deploys to Vercel (or the approved equivalent with PR Previews). If the site has accounts, a non-production Supabase project must exist per `docs/SUPABASE-MCP-SAFETY.md`.

---

## Part 1 — Put the files in place

- [ ] **You:** copy this folder into the project repo per the copy map in `00-START-HERE.md` (or simply tell Claude Code: *"Install the testing setup from docs/testing-setup — follow its 00-START-HERE copy map"*).
- [ ] **Claude Code:** place `activate-testing.md` at `.claude/skills/activate-testing/SKILL.md`; place the rest under `docs/testing-setup/`.

## Part 2 — Install the tester (one normal PR)

- [x] **Claude Code:** install Playwright in the repo as a dev dependency (`@playwright/test`, via pnpm). Free software — no account, no key, no cost. (S0.2, 2026-09-25: `@playwright/test` 1.63.0 pinned; Chromium installed locally with `pnpm exec playwright install chromium`.)
- [x] **Claude Code:** create the Playwright config: tests live in `tests/e2e/`, the target URL comes from the `PLAYWRIGHT_BASE_URL` environment variable, desktop + mobile (390px) browser profiles, and one auth-setup step per user role. (S0.2, 2026-09-25: `playwright.config.ts` — `tests/e2e/`, `PLAYWRIGHT_BASE_URL` with no fallback and the candidate SHA matched against the GitHub deployment record before any request, projects `desktop` (1440 × 900) and `mobile-390` (390 × 844, Chromium), traces/screenshots/videos/HTML report off, retries 0, both projects required by `tests/e2e/harness/required-projects-reporter.ts`. The auth-setup step per role waits for staff auth at S1.2.)
- [ ] **Claude Code:** *(deferred to S1.2 — no auth exists at S0.2 and no user is created anywhere)* create the test users the robot will log in as — for this project **staff roles only** (customers check out as guests — D-PRE-03): one test user per staff role — at launch the owner plus the two presets of the final Admin, Operations and Customer support (D-35 in `docs/PROJECT-STATUS.md` §8a; real roles and approval limits remain owner input OI-10) — in the **non-production** database only, with obviously-fake names/emails. Never in production. Record their emails (never passwords) in `docs/FEATURE-LIST.md` when it is generated.
- [ ] **Claude Code:** confirm environment separation using `docs/ENVIRONMENT-PARITY.md` §12. Verify the target before any external write, then run applicable bounded proofs before the full suite. No live database/payment credentials in Preview; unused services are N/A with reasons. Local checks and safe setup probes do not wait for future launch-day proofs. (S0.2, 2026-09-25: the preflight and proofs are built — `pnpm db:test:preflight`, `pnpm test:preview-proof`, `pnpm test:integration` — and run once the owner's projects exist; P1/P2/P8/P8b/P11 are Blocked on them and P12 Pending in §12.)
- [x] **Claude Code:** add the morning-check workflow file from `templates/MORNING-CHECK-TEMPLATE.md`, **disabled** for now (it is switched on only after the gate passes). (S0.2, 2026-09-25: `.github/workflows/morning-check.yml` — `workflow_dispatch` only, the job `if: false`, no test or secret-consuming step; Node 24 from `.nvmrc` and the Code Check's SHA-pinned actions, not the template's Node 20; the 07:00 IST schedule is a comment until S3.4.)

## Part 3 — Unlock the robot's door (only if Previews are password-protected)

Vercel can protect Preview links so strangers cannot see unfinished work. The robot needs a sanctioned key through that door — never a workaround.

- [ ] **You:** in Vercel → the project → Settings → Deployment Protection → enable **Protection Bypass for Automation**. Vercel generates a secret.
- [ ] **You:** add that secret to GitHub Actions secrets as `VERCEL_AUTOMATION_BYPASS_SECRET` when a credentialed workflow is designed (none exists at S0.2), and keep it in your local shell or your git-ignored `.env.local` for the harness runs you perform (S0.2: every harness command, including preview-mode Playwright, loads that file; the shell wins). Paste the value only there, never into chat, never into a tracked file. (S0.2 reconciliation, 2026-09-25: Vercel already exposes the generated secret to deployments as its own system variable; this app never reads it and no Vercel variable of this app is created for it — the harness takes it from GitHub Actions secrets, the trusted local shell or the owner's `.env.local` only.)
- [x] **Claude Code:** reference the secret **by name only**; attach the bypass header only to requests to the verified Preview origin, including direct HTTP tests. Disable secret-bearing traces/reports per `docs/ENVIRONMENT-PARITY.md` §10. If Preview protection is off, skip this part. (S0.2, 2026-09-25: sent once to the exact validated origin to obtain the host-scoped bypass cookie the browser then uses — never a context-wide header; direct HTTP checks attach it only to that origin with redirects never followed; traces, screenshots, videos and the HTML report are off; `tests/unit/harness-target.test.ts` proves the scoping with synthetic credentials.)

## Part 4 — Prove it works, then close

- [ ] **Claude Code:** write one smoke test (homepage loads with no errors) and run it against a deployed Preview to prove the pipeline is alive end to end. (S0.2, 2026-09-25: `tests/e2e/smoke.spec.ts` is written and passes 12/12 in local mode; the deployed-Preview run waits for the PR.)
- [ ] **You:** merge the setup PR (normal workflow: PR → Preview → review → merge).
- [ ] **You:** confirm in one line that setup is done, dated, in the PR or project status.

---

**Done.** From now on the entire testing system is: *"Activate the testing setup"* → approve the feature list → *"run the tests"* → read the report. See `TESTING-GUIDE.md` steps 2–5.
