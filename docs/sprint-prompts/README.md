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

Prepared next: [S1.1 — Core schema, money model & catalogue seed](S1.1-core-schema.md), 2026-09-28, prepared on
`claude/s1.1-core-schema` (from `cd25f44`, after the workflow-only PR #9) and submitted to `main` first through a planning-only PR
by the owner's one-time exception. Implementation has not started; it runs on a fresh branch from `main`, and its
review brief waits for the tested candidate.

Latest completed sprint: [S0.2 — Supabase isolation, migration baseline & proof harness](S0.2-supabase-proof-harness.md), prepared 2026-09-25, In Progress the same day on `claude/s0.2-supabase-proof-harness` (one PR — PR #6) and **Done 2026-09-28** (merged 2026-09-27 as `9b09212` at the reviewed head `788646a` plus the review-record append; Codex rounds 1–2 REQUEST CHANGES fixed, round 3 APPROVE; `0000_init` on TEST 2026-09-25 and on PROD 2026-09-27; the Production smoke completed 2026-09-28; closeout PR #7 on `docs/s0.2-closeout`). Its paired [review record](../code-reviews/S0.2-supabase-proof-harness-review.md) contains the three returned verdicts; the database record is [`docs/database-changes/S0.2-0000-init.md`](../database-changes/S0.2-0000-init.md). PR #7 is merged at `3e723f3`, PR #8 at `e24b4c1` and the workflow-only PR #9 at `cd25f44` (2026-09-28). Next: S1.1, above.

Previous sprints: [S0.1 — Setup scaffold](S0.1-setup-scaffold.md), Done 2026-09-24 (PR #3; closeout PR #4 `815431d`, record PR #5 `235dedc`) — its [review record](../code-reviews/S0.1-setup-scaffold-review.md) contains the returned verdicts; [S0.0 — Kickoff: decisions lock & governing docs](S0.0-kickoff-decisions.md), Done (PR #1; closeout PR #2) — its [review record](../code-reviews/S0.0-kickoff-decisions-review.md) contains the returned verdicts.
