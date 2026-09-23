# Sprint [SPRINT_ID] — [SPRINT_NAME]

> Copy this file per sprint, fill every [BRACKET], and paste the result into `docs/ROADMAP.md` (or keep
> alongside it). One sprint at a time — never start this sprint while the previous one is unmerged.

## Goal

[One sentence: what this sprint ships and why it matters now.]

## Scope

1. [Deliverable 1 — concrete and verifiable]
2. [Deliverable 2]
3. [Deliverable 3]

Allowed files/paths: [EXACT_PATHS]. Any additional path needs owner approval before editing.

## Out of scope (with forwarding addresses)

- [Excluded item] → belongs to Sprint [SPRINT_ID of the sprint that owns it]
- [Excluded item] → belongs to [backlog / future sprint]

## Depends on

- [Sprint or prerequisite that must be merged first, e.g. "Sprint [SPRINT_ID] merged" / "schema applied to TEST" / "none"]

## Acceptance criteria

- [ ] [Observable behavior 1 — what a tester can see or do]
- [ ] [Observable behavior 2]
- [ ] [Observable behavior 3]

## Exit gate (all boxes before merge)

- [ ] `[TYPECHECK_COMMAND]`, `[LINT_COMMAND]`, `[TEST_COMMAND_OR_N/A]`, and `[BUILD_COMMAND]` green locally; CI green
- [ ] Deployed Preview (Vercel or approved equivalent) tested at `[HEAD_SHA]`, desktop + mobile
- [ ] Relevant security-checklist sections re-checked (every section the diff touches)
- [ ] Copy verbatim from the approved copy source; design matches mockups/tokens; locked facts/numbers correct
- [ ] No new console errors or framework-specific hydration warnings where applicable
- [ ] `docs/PROJECT-STATUS.md` updated in the same PR
- [ ] Codex reviewed `[MERGE_BASE_SHA]..[HEAD_SHA]` and approved; verdict recorded at `docs/code-reviews/[SPRINT_ID]-[SLUG]-review.md`
- [ ] No substantive change after approval; otherwise Preview and independent review repeated

## Branch

`[BRANCH_NAME]` (e.g. `claude/sprint-[SPRINT_ID]-[short-slug]`)

## Status

[Not Started · In Progress · Blocked · Ready for Review · Approved · Done · Not Applicable (reason required)] — [DATE]

Next step → draft the implementation prompt with `CLAUDE-SPRINT-PROMPT-TEMPLATE.md`.
