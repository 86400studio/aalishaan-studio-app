# Rollback

What to do when production breaks. Follow the steps in order — the goal is a working site in minutes,
then a correct `main`, then a fixed root cause. Never improvise on `main`.

## The decision tree (memorize this)

| Situation | Action |
|---|---|
| Production broken, cause known | **Revert the PR on `main`** — the default fix |
| Production broken, users affected NOW | Run `Vercel Instant Rollback (Deployments → last good deployment → Promote to Production)`, then still correct `main` |
| A DB migration shipped with the break | Code rollback alone is NOT enough — see step 4 |
| Tempted to fix-forward directly on `main` | **Don't.** Branch, fix, and go through the full workflow |

---

## Step 1 — Confirm what broke and which deploy caused it

- [ ] Reproduce the breakage on the live site (page, flow, error message).
- [ ] In `Vercel`, identify the last GOOD deployment and the first BAD one.
- [ ] Match the bad deployment to its merge/PR (`git log main` — deploy hashes map to commits).

**Why this matters:** rolling back the wrong deploy fixes nothing and doubles the confusion.

## Step 2 — INSTANT RESTORE (if users are affected)

- [ ] Run the recorded `Vercel Instant Rollback (Deployments → last good deployment → Promote to Production)` to restore the previous good artifact.
- [ ] Confirm the live site works again.

This is a stopgap, not the fix — `main` still needs the revert (Step 3).

## Step 3 — Fix the source of truth

- [ ] On GitHub, open the merged PR that caused the break → **Revert** → merge the revert PR.
- [ ] Confirm the new production deployment (from the reverted `main`) is good.

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

Next step → re-land the fix via the normal workflow in `docs/WORKFLOW.md`.
