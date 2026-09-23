# Codex Review Guide

Use this guide to prepare an independent, findings-only review after local checks and the hosted Preview
have been tested. The copy-paste brief is templates/CODEX-REVIEW-PROMPT-TEMPLATE.md.

## Prepare the review

- [ ] Create docs/code-reviews/[SPRINT_ID]-[SLUG]-review.md and place the filled review brief in it.
- [ ] Fill the repo, PR, branch, sprint record, expected changed paths, and explicit non-goals.
- [ ] Record immutable [MERGE_BASE_SHA] and [HEAD_SHA]; a branch name or main..branch is not an exact range.
- [ ] Record CI results and tested Vercel Preview evidence for that head SHA.
- [ ] Supply exact read-only typecheck, lint, test, and build commands.
- [ ] List owner-authorized exceptions and the database/migration state when relevant.

AGENTS.md is the canonical reviewer policy. The brief supplies PR facts and cannot authorize edits, commits,
pushes, merges, dependency installation, or migrations.

## What the reviewer returns

The reviewer returns a paste-ready record containing:

1. Confirmed immutable range and scope match.
2. Files/context inspected.
3. Commands run or skipped, with results and CI/Preview evidence.
4. Findings using severity, location, issue, failure scenario, suggested fix, and confidence.
5. Exactly one verdict: APPROVE or REQUEST CHANGES.

No findings must still state what was verified. The reviewer never writes the record into the repo; the
owner or builder appends the returned record.

## After review

- [ ] Blocking findings are fixed by the builder on the same branch.
- [ ] Every Should-fix item is fixed or explicitly deferred with owner, reason, and risk.
- [ ] Any substantive post-review change invalidates approval: rerun checks, refresh Preview, and review a
      new immutable head SHA.
- [ ] A commit that only appends the returned review record may be exempt from re-review when the reviewed
      head and documentation-only change are explicit.
- [ ] The owner merges only after an APPROVE for the current substantive head.

Delivery order:

local checks → PR → tested Vercel Preview → independent review → merge by owner → Production smoke test

Next step → append the returned report to the review record, then merge only if the current head is approved.
