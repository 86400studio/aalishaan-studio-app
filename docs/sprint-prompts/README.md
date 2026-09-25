# Sprint prompt records

One file per sprint, created **before** implementation starts and completed before merge. It is the permanent sprint record.

- Naming: `[SPRINT_ID]-[SLUG].md`, for example `S0.0-kickoff-decisions.md`, `S1.1-core-schema.md`.
- Source skeleton: `docs/templates/CLAUDE-SPRINT-PROMPT-TEMPLATE.md` (variants: `BUG-FIX-PROMPT-TEMPLATE.md`, `UI-SPRINT-PROMPT-TEMPLATE.md`, `SUPABASE-CHANGE-TEMPLATE.md`).
- Produced by the `/sprint-prompt` skill (Mode A plans and fills; Mode B "save" completes the record after merge).
- Every record carries the exact prompt used, the outcome, exact check results, deviations, and follow-ups.
- Paired review record: `docs/code-reviews/[SPRINT_ID]-[SLUG]-review.md`.

The sequence of sprints lives in `docs/ROADMAP.md`; the active one is named in `docs/PROJECT-STATUS.md` §1.

Owner-selected workflow (2026-09-23): GPT-6 Astra Codex prepares sprint prompts and independently reviews Claude Code's completed implementation; Claude implements and fixes findings; the owner merges. Prompt preparation does not authorize implementation or constitute its review.

Latest sprint: [S0.2 — Supabase isolation, migration baseline & proof harness](S0.2-supabase-proof-harness.md), prepared 2026-09-25 and **In Progress** the same day on `claude/s0.2-supabase-proof-harness` (one PR — PR #6; `0000_init` applied and verified on TEST 2026-09-25). Its paired [review brief](../code-reviews/S0.2-supabase-proof-harness-review.md) holds no verdict yet; the database record is [`docs/database-changes/S0.2-0000-init.md`](../database-changes/S0.2-0000-init.md).

Previous sprints: [S0.1 — Setup scaffold](S0.1-setup-scaffold.md), Done 2026-09-24 (PR #3; closeout PR #4 `815431d`, record PR #5 `235dedc`) — its [review record](../code-reviews/S0.1-setup-scaffold-review.md) contains the returned verdicts; [S0.0 — Kickoff: decisions lock & governing docs](S0.0-kickoff-decisions.md), Done (PR #1; closeout PR #2) — its [review record](../code-reviews/S0.0-kickoff-decisions-review.md) contains the returned verdicts.
