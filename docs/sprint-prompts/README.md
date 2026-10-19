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

Active sprint: [S1.3 — Public shell, tokens, Home & copy pages](S1.3-public-shell.md), prepared 2026-10-16 and **In Progress the same day**
in the third Claude Code cloud session (`CLOUD.md`, D-41) on the session branch `claude/compassionate-shannon-j9moby` from `main` =
`649cf2c` (the PR #21 merge): one branch, one PR — the draft PR opened from the cloud session — the prompt was planned and saved on the branch
(Mode A) and executed in the same session as far as the cloud goes: the tokens and the self-hosted fonts, the public shell (header, footer,
menu and cart drawers, toast), Home with the desktop and mobile wall-to-materials handoff, the About hub with its search, About the Studio,
Help with its FAQ filter, Contact, Track, the seven policy pages, the 404 and 500 pages, the alias redirects, the honest disabled forms
(NS-01–NS-03), the site-image registry with its manifest and upload tool, the hermetic tests and the Preview specs; the site-image upload to
the TEST bucket, the Preview test with `/browser-qa` evidence, the axe scan, the Lighthouse measurement and the review are the VS Code leg
(the record's "Hand-off to VS Code"). The VS Code leg (from 2026-10-17) audited the cloud build read-only and corrected it locally before any
TEST step; its decisions are with the owner (the record's "VS Code leg"). Its paired [review record](../code-reviews/S1.3-public-shell-review.md)
holds the review context (verdict pending).

Latest completed sprint: [S1.2 — Staff auth, MFA & server RBAC guard](S1.2-staff-auth.md), prepared 2026-10-12 and In Progress the same
day in the second Claude Code cloud session on `claude/determined-cannon-rha42x` (PR #21) with the VS Code leg from 2026-10-12 (the pre-TEST
audit, the owner's decisions, the authorised branch rewrite, the TEST plan run in full on 2026-10-13 under the owner's written authorisation),
and **Done 2026-10-16** (the Preview test at the reviewed head `4c61c0c` — 50 passed; Codex **APPROVE** on `76ef060..4c61c0c`; `/close` GO;
the owner's PROD apply of `0003_staff_auth` verified read-only by the builder; merged by the owner as `649cf2c`; Production deployment
7115143331; smoke pass with the S1.1 carry-overs — the Preview record, the apply record and the merge note are comments on PR #21;
reconciled 2026-10-16 in the S1.3 branch). Its paired [review record](../code-reviews/S1.2-staff-auth-review.md) holds the review context
and the returned record; the database record is `docs/database-changes/S1.2-0003-staff-auth.md`.

Before that: [S1.1 — Core schema, money model & catalogue seed](S1.1-core-schema.md), prepared 2026-09-28 (on `main` since
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
