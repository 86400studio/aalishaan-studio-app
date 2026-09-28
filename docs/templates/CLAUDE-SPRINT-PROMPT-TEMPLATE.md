# Sprint Implementation Prompt — [SPRINT_ID] — [SPRINT_NAME]

> Copy to docs/sprint-prompts/[SPRINT_ID]-[SLUG].md before work. Fill every bracket.
> Guidance: ../SPRINT-PROMPT-TEMPLATE.md.

~~~text
You are my senior implementation engineer for the Aalishaan Studio website. CLAUDE.md governs this task.

## Context
[Current state, user/business reason for this sprint, and relevant prior work.]

## Read first
- CLAUDE.md.
- docs/PROJECT-STATUS.md — [relevant sections].
- docs/ROADMAP.md — Sprint [SPRINT_ID].
- [Architecture, workflow, security, prior sprint, approved copy/design, or policy files that apply.]

## Sprint / Branch
- Sprint: [SPRINT_ID] — [SPRINT_NAME]
- Branch: [BRANCH_NAME], created from current main; resume it if prompt preparation already created it.
- Before editing, confirm the branch and inspect git status. Preserve existing user changes.

## Goal
[One testable outcome and the exit condition.]

## Not this sprint
- [Excluded item] — owned by [future sprint / backlog item].
- [Excluded item] — owned by [future sprint / backlog item].

## Files
Inspect:
- [Exact file/path]
- [Exact file/path]

Allowed to change:
- [Exact file/path or narrow directory]
- docs/PROJECT-STATUS.md, docs/ROADMAP.md, docs/sprint-prompts/README.md.
- docs/sprint-prompts/[SPRINT_ID]-[SLUG].md and docs/code-reviews/[SPRINT_ID]-[SLUG]-review.md.
- Previous-sprint reconciliation (WORKFLOW §8; delete if none), evidenced facts from the merged PR only (reviewed-head CI/Preview and §12 proof results, merge, any human PROD apply with its read-only verification, smoke): [previous sprint record; database change record or N/A; ENVIRONMENT-PARITY.md §12 or N/A].

If another file is needed, stop and explain why before editing it.

## Gate 0 (delete if none)
[Owner prerequisite, asset, approval, or env variable name.] Do not start until the owner confirms.
Use env variable names only; never request, read, or paste live values.

## Task / Steps
1. [Input files] → [concrete deliverable].
2. [Input files] → [concrete deliverable].
3. [Input files] → [concrete deliverable].
N. Exit gate: full-diff review, acceptance checks, and pre-review sprint record, review context (verdict pending) and status/roadmap updates on this branch; leave review, merge and Production smoke pending until evidenced.

## Per-step protocol
1. Inspect the named inputs and relevant existing implementation before editing.
2. Make the smallest safe change inside the allowed file list.
3. Run the exact applicable commands and sprint-specific checks below.
4. Review the diff for scope, regressions, live env files, and secret exposure without printing values.
5. Commit or push only when the Git action policy below explicitly says YES.
6. Return the report below, then stop for the owner's next instruction.

Remote commands: proceed · pause · status · fix [thing] · skip to [n].
A skip requires an owner-approved deferral to a named future sprint/backlog item. Do not mark the sprint
complete while an exit criterion remains unmet.

## Locked inputs
- Approved copy: [path(s)].
- Approved design/mockups: [path(s)].
- Architecture/schema/spec: [path(s)].

Do not invent [copy / facts / design values / access rules / data]. If inputs conflict, stop and add an
open decision to docs/PROJECT-STATUS.md only when that file is allowed.

## Sprint-specific rules
- [Rule].
- [Rule].

## Safety
- Never open, read, copy, print, or modify .env.local or another live-value env file.
- Use env names and placeholder-only examples; never hardcode or echo a secret.
- Preserve auth, data, routing, security, and hosting behavior unless this sprint explicitly changes it.
- Do not add dependencies or change unlisted files without owner approval.

## Verification
- Typecheck: [TYPECHECK_COMMAND]
- Lint: [LINT_COMMAND]
- Tests: [TEST_COMMAND_OR_N/A]
- Production build: [BUILD_COMMAND]
- Manual/responsive/form/data checks: [TASK_SPECIFIC_CHECKS]

Do not guess commands or install dependencies to make a check run. Report any check that cannot run.

## Git action policy
- Commit: [NO (default) / YES]
- Push: [NO (default) / YES, to BRANCH_NAME only]

An omitted or unfilled field means NO. Never push to main or another branch, merge, force-push, reset user
work, or skip hooks.

## Report
1. Outcome and scope completed.
2. Files changed.
3. Commands/checks and exact results.
4. Manual or Preview verification.
5. Risks, open decisions, and follow-ups.
6. Branch and actual commit/push status; include SHA/message if committed, otherwise suggest a message.
7. Roadmap/status bookkeeping completed or still required.
8. After all implementation steps, checks, pre-review records and candidate Preview verification are complete, deliver the filled Codex review prompt with the actual immutable merge-base/head SHAs, changed paths and CI/Preview evidence; otherwise report the missing gates without inventing a review target.
~~~

Before merge: complete this sprint record, test Vercel Preview, and obtain independent review against
immutable merge-base and head SHAs. Substantive changes after review require a refreshed Preview and re-review.
Use one sprint branch/PR: `/sprint-prompt save` before review, `/close` before merge, then record merge and
Production smoke in the merged PR; carry later repository tracker updates into the next authorized sprint
branch. Do not create a routine closeout PR (WORKFLOW §8).
