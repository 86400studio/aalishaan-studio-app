# Deployed Preview Test Record — PR #[PR_NUMBER]

> Mandatory before independent review and merge. Use the Vercel Preview or the approved equivalent—not localhost. A code/config/schema change creates a new head and requires a refreshed Preview record.

## Test session

| Field | Value |
|---|---|
| PR | #[PR_NUMBER] — [PR_TITLE] |
| Branch | [BRANCH_NAME] |
| Provider / environment | Vercel / Vercel Preview |
| Preview URL | [PREVIEW_URL] |
| Tested head SHA | [HEAD_SHA] |
| Date | [DATE] |
| Tester | [NAME] |
| Environment proof record | `docs/ENVIRONMENT-PARITY.md` §12 — applicable proofs and tested callback head, or N/A with reason |

## Test matrix

Test every row on desktop AND a narrow mobile viewport (~320–390px). Result: PASS / FAIL / N/A.

| Page / flow | Desktop | Mobile | Result | Notes |
|---|---|---|---|---|
| [Touched page 1: ROUTE] | [ ] | [ ] | | |
| [Touched page 2: ROUTE] | [ ] | [ ] | | |
| [Touched page 3 — add a row per touched page] | [ ] | [ ] | | |
| Primary conversion flow end-to-end ([PRIMARY_CONVERSION]) | [ ] | [ ] | | Start → submit → confirmation state |
| Forms: submit succeeds | [ ] | [ ] | | Every form this PR touches |
| Forms: error states (invalid input, empty required fields) | [ ] | [ ] | | Friendly errors, nothing silently dropped |
| Approved shell variants + navigation (links resolve; no unapproved per-page variants) | [ ] | [ ] | | Test each affected shell |
| Regression spot-check: [KEY_UNTOUCHED_PAGE_1] | [ ] | [ ] | | Should be unchanged |
| Regression spot-check: [KEY_UNTOUCHED_PAGE_2] | [ ] | [ ] | | Should be unchanged |
| Regression spot-check: [KEY_UNTOUCHED_PAGE_3] | [ ] | [ ] | | Optional third page |
| Browser console: zero errors on the pages above | [ ] | [ ] | | Include framework hydration warnings where applicable |

If the PR touches auth or a gated area, also test each auth state the project defines (e.g. anonymous · pending · approved · admin) against the gated routes — and confirm any auth email links point at the Preview origin, not production.

## Verdict

**Verdict:** [PASS → ready for independent review / FAIL → fix and retest]

- If FAIL: list the failures, fix on the same branch, wait for the new Preview, and run this record again. Never merge on a FAIL.
- A PASS is necessary but not sufficient to merge; CI and current-head Codex review must also pass.

Why this matters: Preview tests the candidate code on deployed infrastructure. Production can have different build-time settings and service configuration; `docs/ENVIRONMENT-PARITY.md` and the Production smoke test cover those differences.

---

Next step → give Codex the immutable merge-base and this tested head SHA. After approval, the owner may merge and smoke-test Production.
