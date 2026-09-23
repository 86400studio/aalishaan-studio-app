# Independent review records

One file per sprint (and per re-review at a new head), holding the filled brief and the returned Codex verdict.

- Naming: `[SPRINT_ID]-[SLUG]-review.md`; a re-review at a new head appends a dated section rather than replacing the earlier verdict.
- Source skeleton: `docs/templates/CODEX-REVIEW-PROMPT-TEMPLATE.md`; reviewer policy: `AGENTS.md` (root).
- The record states the immutable range `merge-base..head`, the tested Vercel Preview head, CI evidence, every finding (Blocking / Should-fix), and exactly one verdict: APPROVE or REQUEST CHANGES.
- The reviewer never writes into the repo; the owner or builder saves the returned record here.

A sprint is never Done with an unresolved Blocking finding (`docs/WORKFLOW.md` §7).
