# Sprint Prompt Guide

Use this guide to prepare one implementation prompt per sprint. The copy-paste skeleton is
templates/CLAUDE-SPRINT-PROMPT-TEMPLATE.md; it is the only implementation prompt template.

## Before implementation

- [ ] Copy the skeleton to docs/sprint-prompts/[SPRINT_ID]-[SLUG].md before work starts.
- [ ] Fill every bracketed field. Delete sections marked optional when they do not apply.
- [ ] Name the branch, exact files to inspect, and exact files allowed to change.
- [ ] Point to approved copy, design, data, and architecture sources; do not paste live env values.
- [ ] Use exact typecheck, lint, test, and production-build commands from the repository.
- [ ] Set Commit and Push separately. Both default to NO; permission to commit does not imply permission to push.
- [ ] Keep one goal, one sprint, and testable acceptance criteria.

CLAUDE.md is the canonical builder policy. A sprint prompt may narrow it but never weaken its security,
scope, Git, or owner-control rules.

## Required prompt sections

| Section | Required content |
|---|---|
| Context | Project, current state, and why this sprint exists. |
| Read first | CLAUDE.md, status, roadmap sprint, architecture/policy docs, and exact inputs. |
| Sprint / Branch | Sprint ID/name and one focused branch from current main. |
| Goal | One testable outcome and exit condition. |
| Not this sprint | Named exclusions with a future sprint or backlog owner. |
| Files | Exact inspect list and exact allowed-change list; unlisted files require owner approval. |
| Gate 0 | Missing owner approvals/assets/env names; env names only, never values. Delete if none. |
| Steps | Concrete inputs and deliverables; final step includes full-diff and exit-gate review. |
| Locked inputs | Approved sources and conflict behavior. |
| Rules | Only sprint-specific rules; do not duplicate CLAUDE.md. |
| Verification | Exact commands plus manual, responsive, form, data, or Preview checks that apply. |
| Git actions | Commit: YES/NO and Push: YES/NO. Omitted or unfilled means NO. |
| Report | Outcome, files, checks, manual verification, risks, Git status, and roadmap/status bookkeeping. |

Acceptance criteria describe observable results, not impressions. If a remote command skips a step, record
an explicit owner-approved deferral and its future owner; do not mark the sprint complete with an unmet exit
criterion.

## Finish before merge

- [ ] Complete the prompt record with shipped scope, checks/results, deviations, and follow-ups.
- [ ] Update docs/PROJECT-STATUS.md and docs/ROADMAP.md when allowed by the sprint file list.
- [ ] Open the PR and test Vercel Preview.
- [ ] Run independent review against immutable merge-base and head SHAs.
- [ ] After any substantive fix, refresh Preview evidence and repeat review.

The merged prompt file is the permanent sprint record. Do not wait until after merge to create or complete it.

## Variants

- Bug fix → templates/BUG-FIX-PROMPT-TEMPLATE.md.
- Presentation-only UI work → templates/UI-SPRINT-PROMPT-TEMPLATE.md.
- Database change, if the selected stack has one → templates/SUPABASE-CHANGE-TEMPLATE.md or the database-specific
  equivalent required by docs/TECH-ARCHITECTURE.md.

Next step → run the filled prompt, test Preview, then use templates/CODEX-REVIEW-PROMPT-TEMPLATE.md.
