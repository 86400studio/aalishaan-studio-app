# Rollback

What to do when production breaks. Follow the steps in order — the goal is a working site in minutes,
then a correct `main`, then a fixed root cause. Never improvise on `main`.

## The decision tree (memorize this)

| Situation | Action |
|---|---|
| Production broken, cause known | **Revert the PR on `main`** — the default fix |
| Production broken, users affected NOW | Run `Vercel Instant Rollback (project Overview → Production Deployment tile → Instant Rollback, or Deployments → ⋮ → Instant Rollback; on Hobby only the immediately previous production deployment)`, then still correct `main` |
| A DB migration shipped with the break | Code rollback alone is NOT enough — see step 4 |
| Tempted to fix-forward directly on `main` | **Don't.** Branch, fix, and go through the full workflow |

---

## Step 1 — Confirm what broke and which deploy caused it

- [ ] Reproduce the breakage on the live site (page, flow, error message).
- [ ] In `Vercel`, identify the last GOOD deployment and the first BAD one.
- [ ] Match the bad deployment to its merge/PR (`git log main` — deploy hashes map to commits).

**Why this matters:** rolling back the wrong deploy fixes nothing and doubles the confusion.

## Step 2 — INSTANT RESTORE (if users are affected)

- [ ] Run the recorded `Vercel Instant Rollback (project Overview → Production Deployment tile → Instant Rollback, or Deployments → ⋮ → Instant Rollback; on Hobby only the immediately previous production deployment)` to restore the previous good artifact.
- [ ] Confirm the live site works again.

This is a stopgap, not the fix — `main` still needs the revert (Step 3).

## Step 3 — Fix the source of truth

- [ ] On GitHub, open the merged PR that caused the break → **Revert** → merge the revert PR.
- [ ] If Step 2 was used: after an Instant Rollback, Vercel stops assigning new `main` deployments to Production. Once the deployment built from the reverted `main` is Ready, open the project Overview: while the rollback is active, the Production Deployment tile shows a banner "To undo the rollback promote to production …". Click its **Manage** button (Vercel's docs call this Undo Rollback), and in **Manage Rollback** ("Undo this rollback by promoting a different deployment") select that new deployment (not the broken one) and **Confirm** — or run `vercel promote <its URL>`. Either promotes it and turns automatic assignment back on.
- [ ] Confirm the production domain now serves the new production deployment (from the reverted `main`) and that it is good.

GitHub remains the source of truth: after the dust settles, **production must equal `main`** again.
A promoted old deployment with a poisoned `main` means the next merge re-ships the bug.

## Step 4 — Database and data caveat (skip if no database, or the break involved no data/schema change)

Promoting a deployment restores **code, NOT the database**. A down migration may reverse schema; it
cannot recreate deleted rows, undo externally-triggered side effects, or guarantee the prior data state.

- [ ] Identify the migration's class and actual impact: additive/backwards-compatible, safely reversible schema-only, or destructive/data-changing.
- [ ] If the old code works with an additive schema, keep the schema and forward-fix — preferred.
- [ ] Before any schema down-migration, verify it on TEST or a restored non-production copy and confirm the dependent code has already retreated.
- [ ] If data was changed or deleted, use the migration's approved data-recovery plan (verified backup/PITR or a deliberate forward repair). The down-SQL alone is not recovery.
- [ ] A human owner approves any production schema or data recovery action and records the result. Never improvise a production edit during the incident.

**Database recovery limits as of S0.2 (2026-09-25):** the only migration is the additive baseline `0000_init` (`supabase/migrations/0000_init.sql`; its paired down file `supabase/rollbacks/0000_init.down.sql` lives outside forward discovery and is never run by `db push`). The S0.1 holding page and every S0.2 route work with or without it (`GET /api/health` reports `schema_missing` without it), so a host rollback leaves the baseline in place and needs no schema action. The down file deletes every `system_checks` row and cannot restore them, and the Free plan (D-05) keeps no backup — the plan is to keep the additive schema and forward-fix (`docs/database-changes/S0.2-0000-init.md` → "Rollback plan").

## Step 5 — Verify with a smoke test

- [ ] The previously broken page/flow works on the live domain.
- [ ] Primary conversion flow end-to-end.
- [ ] No new console errors; key pages fine on desktop + mobile.

## Step 6 — Root-cause and re-land properly

- [ ] Find WHY it broke (and why QA/Preview didn't catch it).
- [ ] Fix on a normal branch and re-land through the full workflow:
      branch → build → local checks → PR → deployed Preview (Vercel or approved equivalent) → Codex review → merge → Production smoke test.
- [ ] Add whatever check would have caught it to `docs/QA-CHECKLIST.md` or `docs/SECURITY-CHECKLIST.md`.

## Step 7 — Write the incident note

- [ ] In the decision log: date, what broke, which deploy/PR, why, what changed, what now prevents a repeat.

**Why this matters:** an unrecorded incident is a scheduled repeat.

**Never do this:**
- Never fix-forward directly on `main` — even a one-liner goes through a branch and PR.
- Never force-push or rewrite `main` history to "erase" the bad commit.
- Never assume a code rollback rolled back the database.
- Never run down-SQL as a reflex or claim it restores data it did not preserve.
- Never skip the revert PR after an emergency promote — `main` must be corrected either way.

---

## Drill record — Vercel Instant Rollback

Setup requires one real rollback on a harmless deployment (S0.1; rehearsed again at S3.4). A written procedure is not a drill; nothing below is filled until it has happened.

**Plan facts (Vercel Hobby, read 2026-09-24):** Hobby can roll back only to the *immediately previous* production deployment; only deployments that were once assigned to Production are eligible (a PR Preview never is, and is never promoted instead); after a rollback Vercel stops auto-assigning new `main` deployments to Production until the rollback is undone (on the Production tile, the rollback banner's **Manage** → "Manage Rollback", which Vercel's docs call Undo Rollback — seen in Drill 2 — or `vercel promote <deployment>`). Sources: vercel.com/docs/instant-rollback, vercel.com/docs/deployments/rollback-production-deployment.

**S0.1 procedure (after the owner merges the S0.1 PR):**

1. Production deployment **A** = the build of the S0.1 merge commit on `main`; smoke-test it first (holding page, six headers through the protection bypass, denied diagnostic route).
2. Create a second eligible deployment **B** from the same `main` commit: Vercel → Deployments → A → ⋮ → **Redeploy** (to Production). Smoke-test B.
3. Roll back: Vercel → Deployments → A → **Instant Rollback** (A is the immediately previous production deployment). Confirm the Production URL now serves A (deployment ID in the Vercel dashboard) and re-run the smoke test.
4. Restore: promote B so Production is B again and auto-assignment from `main` is back on: on the Production Deployment tile, click the rollback banner's **Manage** button (Vercel's docs call this Undo Rollback), and in **Manage Rollback** select B and **Confirm**, or run `vercel promote <B's URL>`. Re-run the smoke test.
5. Record below. A host rollback restores application artifacts only — there is no database yet, and later it never restores data (Step 4 above).

**Drill 1** (2026-09-24, 16:07–16:14 UTC; the first three rows) is kept as history: it did not run the prescribed smoke on B after the Redeploy or after the undo (PR #4, Codex round 1, Blocking 1). **Drill 2** (2026-09-24, 17:48–18:03 UTC; the last four rows) repeated every step with the full smoke, run by the owner's script on the production domain and on the deployment's own URL each time: without the bypass `/` → `302` to Vercel login; through the bypass `/` → `200` with the six security headers and `X-Robots-Tag: noindex, nofollow`, each present once at its expected value (exact strings, except that the CSP's Sentry ingest host is matched as any `o<digits>.ingest.us.sentry.io`), and the holding-page line, a missing path → `404` with the same seven headers, and `POST /api/sentry-test` without a token → `{"status":"not_found"}` `404`. Each of the four runs printed `RESULT: ALL PASS` the first time. Every deployment in both drills serves commit `d416bfb`, so the smoke cannot tell them apart: which deployment was Production at each step comes from the dashboard screenshots.

| Date / time (UTC) | Actor | From deployment → to deployment (IDs) | Commit SHAs | Result | Active deployment at the end | Smoke results |
|---|---|---|---|---|---|---|
| Drill 1 — 2026-09-24, 16:07:05 UTC (GitHub deployment status) | Owner (Vercel dashboard), recorded by Claude Code | Redeploy: A `qts5y2d3e` (Vercel `5uCHvg2Vv`, GitHub deployment `6641010256`) → new **B** `64m890ydl` | `d416bfb` → `d416bfb` (merge of PR #3) | B built and became Current (screenshot) | B | not run on B by itself (same commit as A, whose smoke passed at 15:59 UTC) |
| Drill 1 — 2026-09-24, between 16:07:05 and 16:12 UTC | Owner | **Instant Rollback**: B `64m890ydl` → A `qts5y2d3e` (the immediately previous production deployment, the only Hobby target) | `d416bfb` | PASS — A shown as Production with the rollback icon, B with a red "Production" badge and a crossed-circle icon (screenshots) | A | `302` without bypass; `200` with the six headers + noindex through the bypass; test route denied `404` (owner script) |
| Drill 1 — 2026-09-24, between 16:12 and 16:14 UTC | Owner | **Undo Rollback** (project Overview): A → B | `d416bfb` | PASS — B carries the Production badge again (screenshot); the undo also restores automatic assignment of new `main` deployments | **B `64m890ydl`** (retained at the end of Drill 1; A of Drill 2) | `302` for `/` and a missing path (Claude, 16:14:35 UTC, no credential); owner mobile view clean; the bypass probes were not re-run after the undo (same commit as A) |
| Drill 2 — 2026-09-24, 17:48:49 UTC | Owner (Vercel dashboard and the smoke script), recorded by Claude Code | Step 1: no change — A `64m890ydl` ("Redeploy of 5uCHvg2Vv") is Production (screenshot of the Deployments list) | `d416bfb` | PASS | A `64m890ydl` | ALL PASS at 17:48:49 — production domain and A, 8/8 |
| Drill 2 — 2026-09-24, 17:55:42 UTC (GitHub deployment status) | Owner | Step 2: **Redeploy** (Deployments → A → ⋮ → Redeploy, Production) → new **B** `hquc871zi`; exactly one new deployment resulted (the Redeploy dialog first showed a long spinner) | `d416bfb` → `d416bfb` | PASS — B Ready in Production with `aalishaan-studio-app.vercel.app` assigned (screenshot of its deployment page) | B `hquc871zi` | ALL PASS at 17:56:34 — production domain and B, 8/8 |
| Drill 2 — 2026-09-24, between 17:56:34 and 17:59:50 UTC | Owner | Step 3: **Instant Rollback** (Overview → Production Deployment tile → Instant Rollback, the same action as Deployments → ⋮ → Instant Rollback; the dialog offered only A, marked Previous): B `hquc871zi` → A `64m890ydl` | `d416bfb` | PASS — "Assigning production domains: aalishaan-studio-app.vercel.app" completed; the tile read "Rolled back just now", A with the rollback icon, B struck through (screenshots) | A `64m890ydl` | ALL PASS at 17:59:50 — production domain and A, 8/8 |
| Drill 2 — 2026-09-24, between 17:59:50 and 18:02:50 UTC | Owner | Step 4: **undo** — the rollback banner's **Manage** → "Manage Rollback: Undo this rollback by promoting a different deployment", B selected → Confirm: A → B `hquc871zi` | `d416bfb` | PASS — the tile shows B with no rollback note or banner, the button reads Instant Rollback, and "To update your Production Deployment, push to the main branch" (automatic assignment back on) (screenshots) | **B `hquc871zi`** (retained) | ALL PASS at 18:03:15 — production domain and B, 8/8; Claude's no-credential check at 18:02:50: `302` to Vercel login for both |

Next step → re-land the fix via the normal workflow in `docs/WORKFLOW.md`.
