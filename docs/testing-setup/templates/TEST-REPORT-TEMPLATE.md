# Test Report — Aalishaan Studio — [YYYY-MM-DD]

> One row per feature from `docs/FEATURE-LIST.md`. Every failure explained in plain words. Save as `docs/test-reports/[YYYY-MM-DD]-test-report.md`; newest report is the current truth.

- Run type: **FULL / PARTIAL (failed-only re-run)** ← a verdict can only come from FULL
- Environment: Preview URL [URL] · head SHA [SHA] · Razorpay Test Mode keys confirmed
- Totals: [N] tests → [N] PASS · [N] FAIL · [N] MANUAL pending

## Severity, in plain words

| Severity | Means | Response |
|---|---|---|
| **Blocker** | Money, login, or the whole site is affected | Nothing launches with one open |
| **High** | A real feature is broken for some users | Fixed before launch |
| **Medium** | Annoying, but the site works | Fix now or first post-launch sprint — owner's call, logged |
| **Low** | Cosmetic | Backlog |

## Results

| ID | Feature | Result | What happened (plain words) | Severity | Next step |
|---|---|---|---|---|---|
| AC-003 | Password reset works end to end | **FAIL** | [e.g. The reset email arrives, but its link points to the wrong website address, so the user can never actually reset.] | Blocker | [Fix sprint ref] |
| PG-001 | Every page loads with no errors | PASS | — | — | — |
| MN-001 | [Manual line] | PENDING / PASS | [Evidence link] | — | [Who verifies, by when] |
| … | | | | | |

## Fix handoff

- Failures grouped into: [BUG-FIX prompt / sprint ID + link, per docs/WORKFLOW.md]
- While fixing: re-run failed IDs only. Before the verdict: full re-run, always.

---

## Verdict

**GO / NO-GO**

GO requires all three, no exceptions: **(1)** this report is a FULL run on the current head, **(2)** 100 % of tests pass (manual lines have recorded evidence), **(3)** no test was skipped, disabled, or edited without the feature list re-approval noted above.

- Verdict: [GO / NO-GO] · Date: [DATE] · Full-run report: this file
- On GO → `docs/LAUNCH-CHECKLIST.md` Phase 1 ("Launch Gate passed") and Phase 5 of the skill (morning-check selection).
- On NO-GO → open items listed above; next full run scheduled: [DATE].
