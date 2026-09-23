# Bug Fix Prompt — [SHORT_BUG_NAME]

> One reproduced bug, one narrow fix, one branch. Fill every bracket before use.

~~~text
You are my senior implementation engineer for the Aalishaan Studio website. CLAUDE.md governs this task.

## Context
- Observed: [What happens.]
- Expected: [What should happen.]
- Where: [Route/component/flow.]

Reproduction:
1. [Step.]
2. [Step.]
3. [Step.]

Evidence:
- [Redacted error text, CI output, screenshot path, or Preview URL.]
- First seen: [DATE / PR / unknown].

Redact credentials, tokens, private URLs, personal data, and live env values before placing evidence here.

## Goal
Reproduce the defect, identify its root cause, and make the smallest verified fix.

## Read first
- CLAUDE.md.
- docs/PROJECT-STATUS.md and [roadmap/backlog item].
- [Relevant source, test, copy, architecture, or policy files.]

## Branch and files
- Branch: [BRANCH_NAME], created from current main.
- Confirm the branch and inspect git status before editing. Preserve existing user changes.

Inspect:
- [Exact file/path.]

Allowed to change:
- [Exact file/path.]
- [Exact test file/path.]

If another file is needed, stop and explain why before editing it.

## Task
1. Reproduce or otherwise verify the observed failure.
2. Explain the root cause in plain English before editing.
3. Propose the smallest safe fix and affected files.
4. Mode: [DIAGNOSE ONLY / IMPLEMENT AFTER OWNER SAYS "proceed" / IMPLEMENT NOW].
5. Add or update the narrowest useful regression check when feasible.

## Constraints
- No unrelated refactors, cleanup, formatting, dependencies, or drive-by improvements.
- Preserve every behavior not named in Expected.
- Do not change routing, config, copy, env handling, schema, auth, or security unless the bug explicitly
  concerns that area and the allowed file list authorizes it.
- If the root cause requires broader or destructive work, stop and report the required scope; do not expand it.

## Safety
- Never open, read, copy, print, or modify .env.local or another live-value env file.
- Use env names and placeholder-only examples; never hardcode or echo a secret.
- Do not reset, discard, or overwrite existing work.

## Verification
- Typecheck: [TYPECHECK_COMMAND]
- Lint: [LINT_COMMAND]
- Tests: [TEST_COMMAND_OR_N/A]
- Production build: [BUILD_COMMAND]
- Reproduction and surrounding-flow checks: [BUG_SPECIFIC_CHECKS]

Confirm the defect is gone and the surrounding flow still works at the applicable viewports/states. Do not
guess commands or install dependencies to make a check run.

## Git action policy
- Commit: [NO (default) / YES]
- Push: [NO (default) / YES, to BRANCH_NAME only]

An omitted or unfilled field means NO. Never push to main or another branch, merge, force-push, reset user
work, or skip hooks.

## Report
1. Root cause and outcome.
2. Files changed.
3. Commands/checks and exact results.
4. Reproduction, regression, and Preview verification.
5. Risks and follow-ups.
6. Branch and actual commit/push status; include SHA/message if committed, otherwise suggest a message.
7. Status/backlog bookkeeping completed or still required.
~~~

Before merge: open the PR, reproduce the fix on Vercel Preview, then obtain independent review against
immutable merge-base and head SHAs. Substantive changes after review require a refreshed Preview and re-review.
