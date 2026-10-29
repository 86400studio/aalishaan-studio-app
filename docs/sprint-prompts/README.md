# Sprint prompt records

One file per sprint, created **before** implementation starts and completed before merge. It is the permanent sprint record.

- Naming: `[SPRINT_ID]-[SLUG].md`, for example `S0.0-kickoff-decisions.md`, `S1.1-core-schema.md`.
- Source skeleton: `docs/templates/CLAUDE-SPRINT-PROMPT-TEMPLATE.md` (variants: `BUG-FIX-PROMPT-TEMPLATE.md`, `UI-SPRINT-PROMPT-TEMPLATE.md`, `SUPABASE-CHANGE-TEMPLATE.md`).
- Produced by the `/sprint-prompt` skill (Mode A plans and fills; Mode B "save" completes the record before review on the same sprint branch).
- Every record carries the exact prompt used, the outcome, exact check results, deviations, and follow-ups.
- Paired review record: `docs/code-reviews/[SPRINT_ID]-[SLUG]-review.md`.

The sequence of sprints lives in `docs/ROADMAP.md`; the active one is named in `docs/PROJECT-STATUS.md` §1.

Owner-selected workflow (2026-09-23): GPT-6 Astra Codex prepares sprint prompts and independently reviews Claude Code's completed implementation; Claude implements and fixes findings; the owner merges. Prompt preparation does not authorize implementation or constitute its review.

Workflow update (2026-09-28): one sprint branch/PR includes planning, implementation and pre-review records.
Deliver the Codex review prompt after implementation and candidate verification. Run `/close` before merge;
record post-merge smoke in the merged PR and carry repository tracker reconciliation into the next sprint.
No routine closeout PR (WORKFLOW §8); fixes after review still require re-review on the same branch.

Active sprint: [S1.4 — Catalogue browse pages from the database](S1.4-catalogue-browse.md), prepared 2026-10-29 with `/sprint-prompt`
(Mode A) and saved locally on `claude/s1.4-catalogue-browse` for a fresh Claude session, and **In Progress the same day** in a local Claude
Code session in VS Code — no cloud leg this time: the owner ran the planning and the execution locally on 2026-10-29. The branch was created
locally from `main` = `0d209b1` (the PR #26 merge) and is not pushed: one branch, one eventual PR, no PR yet; **Commit: NO · Push: NO** (no
commit or push authorised yet). The full prompt includes the owner's requirement to use the exact prototype images and verify that they load
on Preview; Production image loading remains scheduled for S3.3 under D-48. Step 0 reconciled S1.3b to Done from the PR #26 records — the
[merge-and-smoke record](https://github.com/86400studio/aalishaan-studio-app/pull/26#issuecomment-6418598629) confirms its closure. No
migration is planned; Gate 0: none. Steps 1–5 and the hermetic part of step 6 were done the same day in the working tree, uncommitted (the record
→ "Execution"): the reader, the hook, the five pages, the listing, `browse.css`, the 12 browse images in the manifest, the unit and e2e
tests and a sealed local run beside the frozen prototype; a whole-diff review (four lenses, each finding challenged by an independent skeptic) confirmed 24 findings, none blocking, each fixed or put to the owner; a verification pass over the fixes confirmed 14 more, all fixed; and the checks were run again. The owner authorised the TEST plan and Commit / Push for this branch and answered the decisions on 2026-10-29
(`PROJECT-STATUS.md` §5 #36, #37); the TEST plan's steps 1–5 ran the same day (the record → "The TEST run") — draft
PR #28.

Latest completed sprint: [S1.3b — Home speed fix (D-19)](S1.3b-home-speed.md), inserted 2026-10-22 before S1.4 by the owner's D-19 choice of
2026-10-21 (`PROJECT-STATUS.md` §5 #30), prepared and In Progress the same day in the fourth Claude Code cloud session on
`claude/hopeful-gates-rq8oiv` (PR #26) — the open Dependabot updates adopted first (the owner's one-time exception to D-42, §5 #31), then the
speed work — with the VS Code leg from 2026-10-24 (the pick-up audit and its corrections, the owner's answers of 2026-10-26, the TEST run the
same day under the owner's written OK), and **Done 2026-10-26** (the Preview test at the reviewed head `e879f34` — 104 passed, the pixel
comparison with S1.3's reviewed Preview, axe, the deferred Sentry SDK; Lighthouse mobile on Home median 61, logged under the owner's D-19
override of 2026-10-26 — ≥ 90 still required before launch; D-51–D-53 accepted by the builder under the owner's delegation; Codex
**APPROVE** on `8a106fb..e879f34`; `/close` GO; merged by the owner as `0d209b1`; Production deployment 7334209847; smoke pass, the bucket
images missing on Production by design until S3.3 — the Preview record, the `/close` record and the merge note are comments on PR #26;
reconciled 2026-10-29 in the S1.4 branch). Its paired [review record](../code-reviews/S1.3b-home-speed-review.md) holds the review context
and the returned record.

Before that: [S1.3 — Public shell, tokens, Home & copy pages](S1.3-public-shell.md), **Done 2026-10-22** (PR #24, merged as `8a106fb`;
Codex APPROVE on `649cf2c..208cc09`; Lighthouse mobile on Home median 38, overridden for S1.3 by the owner — D-19; smoke pass, the bucket
images missing on Production by design until S3.3). Its paired [review record](../code-reviews/S1.3-public-shell-review.md) holds the review
context and the returned record.

Before S1.3: [S1.2 — Staff auth, MFA & server RBAC guard](S1.2-staff-auth.md), **Done 2026-10-16** (PR #21, merged as `649cf2c`; Codex
APPROVE on `76ef060..4c61c0c`; the owner's PROD apply of `0003_staff_auth` verified read-only; smoke pass). Its paired [review
record](../code-reviews/S1.2-staff-auth-review.md) holds the review context and the returned record; the database record is
`docs/database-changes/S1.2-0003-staff-auth.md`.

Before S1.2: [S1.1 — Core schema, money model & catalogue seed](S1.1-core-schema.md), prepared 2026-09-28 (on `main` since
the planning-only PR #10, the owner's one-time exception), In Progress from 2026-10-05 in the first Claude Code cloud session on
`claude/relaxed-einstein-vvbise` (PR #18) with the VS Code leg from 2026-10-06, and **Done 2026-10-11** (Codex round 1 REQUEST CHANGES corrected;
round 2 **APPROVE** on `04b2906..3961576`; `/close` GO; the owner's PROD apply of 0001 and 0002 verified read-only; merged as `76ef060`;
Production deployment 6999635437; smoke pass on what was checked, the two missing checks done at the S1.2 smoke). Its paired
[review record](../code-reviews/S1.1-core-schema-review.md) holds the planning PR's record, the implementation's review context and
both returned records; the database records are `docs/database-changes/S1.1-0001-catalogue.md` and `S1.1-0002-orders.md`.

Earlier: [S0.3 — Cloud readiness](S0.3-cloud-readiness.md), inserted 2026-09-30 by the owner ahead of S1.1 (D-41),
implemented the same day on `claude/s0.3-cloud-readiness` (one docs-only PR — PR #15) and **Done 2026-10-02** (Codex round 1
REQUEST CHANGES corrected with the owner's approval, round 2 APPROVE on `dd65f7b..faeb32a`; merged by the owner as `59d8123`;
Production smoke pass; the merge note is on PR #15). Its paired [review record](../code-reviews/S0.3-cloud-readiness-review.md)
holds the review context and both returned records. The dependency fix PR #16 (`57a3aab`) and the Dependabot PR #17 (`04b2906`)
merged the same day before or without their gates and were covered late (`PROJECT-STATUS.md` §3, §10 #13; the records are in
[fix-dependency-updates-review.md](../code-reviews/fix-dependency-updates-review.md)).

Earlier still: [S0.2 — Supabase isolation, migration baseline & proof harness](S0.2-supabase-proof-harness.md), prepared 2026-09-25, In Progress the same day on `claude/s0.2-supabase-proof-harness` (one PR — PR #6) and **Done 2026-09-28** (merged 2026-09-27 as `9b09212` at the reviewed head `788646a` plus the review-record append; Codex rounds 1–2 REQUEST CHANGES fixed, round 3 APPROVE; `0000_init` on TEST 2026-09-25 and on PROD 2026-09-27; the Production smoke completed 2026-09-28; closeout PR #7 on `docs/s0.2-closeout`). Its paired [review record](../code-reviews/S0.2-supabase-proof-harness-review.md) contains the three returned verdicts; the database record is [`docs/database-changes/S0.2-0000-init.md`](../database-changes/S0.2-0000-init.md). PR #7 is merged at `3e723f3`, PR #8 at `e24b4c1` and the workflow-only PR #9 at `cd25f44` (2026-09-28).

Previous sprints: [S0.1 — Setup scaffold](S0.1-setup-scaffold.md), Done 2026-09-24 (PR #3; closeout PR #4 `815431d`, record PR #5 `235dedc`) — its [review record](../code-reviews/S0.1-setup-scaffold-review.md) contains the returned verdicts; [S0.0 — Kickoff: decisions lock & governing docs](S0.0-kickoff-decisions.md), Done (PR #1; closeout PR #2) — its [review record](../code-reviews/S0.0-kickoff-decisions-review.md) contains the returned verdicts.
