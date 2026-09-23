# Presentation-Only UI Sprint Prompt — [SPRINT_ID] — [SPRINT_NAME]

> Use only for visual/presentational work. New routes, data behavior, auth, or interaction logic require
> the standard sprint template. Fill every bracket before use.

~~~text
You are my senior implementation engineer for the Aalishaan Studio website. CLAUDE.md governs this task.

## Context
[Why this presentation change is needed.]

## Goal
[Testable visual outcome for named pages/components, with no behavior change.]

## Read first
- CLAUDE.md.
- docs/PROJECT-STATUS.md and docs/ROADMAP.md — Sprint [SPRINT_ID].
- docs/DESIGN.md and [approved shell/component rules].
- [PAGE/COMPONENT]: [mockup path] + [copy path] + [existing implementation path].

## Sprint / Branch
- Sprint: [SPRINT_ID] — [SPRINT_NAME]
- Branch: [BRANCH_NAME], created from current main.
- Confirm the branch and inspect git status before editing. Preserve existing user changes.

## Scope and files
Only these pages/components change visually: [LIST].
Known consumers of changed shared components: [LIST].

Inspect:
- [Exact mockup/design/copy/source paths.]

Allowed to change (implementation):
- [Exact style/component/page-body path.]
- [Exact style/component/page-body path.]

Bookkeeping allowed only when this sprint closes:
- docs/PROJECT-STATUS.md
- docs/ROADMAP.md

If another file is needed, stop and explain why before editing it.

## Task
1. Inspect the approved mockups, design rules, copy, and existing implementation.
2. Make the smallest presentation-only change inside the allowed paths.
3. Check each scoped page/component and every listed shared-component consumer.
4. Run the exact verification below and review the full diff before reporting.

## Hard boundary
No new routes and no changes to data fetching, mutations, auth, authorization, env handling, config,
security headers, analytics semantics, or interaction behavior. Use the standard sprint template if any
of those must change. Before reporting done, confirm every changed path is allowed.

## Design rules
- Use only approved tokens and components from docs/DESIGN.md; flag a missing decision instead of inventing one.
- Copy remains verbatim from approved sources.
- Use only approved shell variants; keep shared chrome consistent within its shell.
- Approved empty states replace fictional mockup data.
- Stop on a mockup/copy/design-system conflict and record an open decision only when the file is allowed.

## Acceptance criteria
- [PAGE/COMPONENT]: [observable result at project-defined viewport/state matrix].
- Responsive checks: [VIEWPORTS_OR_MATRIX].
- Accessibility: keyboard/focus behavior unchanged, reduced motion respected, and required contrast retained.
- Assets load, no new console errors appear, and avoidable layout shift is not introduced.
- Check every listed shared-component consumer for unintended visual regressions.

## Safety
- Make the smallest safe presentation-only change.
- Never open, read, copy, print, or modify .env.local or another live-value env file.
- Use env names and placeholder-only examples; never hardcode or echo a secret.
- Do not add dependencies, change behavior, or touch unlisted paths.

## Verification
- Typecheck: [TYPECHECK_COMMAND]
- Lint: [LINT_COMMAND]
- Tests: [TEST_COMMAND_OR_N/A]
- Production build: [BUILD_COMMAND]
- Render/visual/accessibility checks: [UI_SPECIFIC_CHECKS]
- Diff-path check: [DIFF_PATH_COMMAND_OR_MANUAL_CHECK]

Do not guess commands or install dependencies to make a check run.

## Git action policy
- Commit: [NO (default) / YES]
- Push: [NO (default) / YES, to BRANCH_NAME only]

An omitted or unfilled field means NO. Never push to main or another branch, merge, force-push, reset user
work, or skip hooks.

## Report
1. Outcome and scoped pages/components.
2. Files changed and path-guard result.
3. Commands/checks and exact results.
4. Viewport, consumer, accessibility, and Preview verification.
5. Risks, conflicts, and follow-ups.
6. Branch and actual commit/push status; include SHA/message if committed, otherwise suggest a message.
7. Roadmap/status bookkeeping completed or still required.
~~~

Before merge: include approved before/after visual evidence (screenshots at 320/768/1440 plus applicable states, via Playwright MCP or the Agent Browser CLI per `docs/BROWSER-TOOLS.md` — the `/browser-qa` skill runs this), test Vercel Preview, and obtain independent review
against immutable merge-base and head SHAs. Substantive changes after review require refreshed evidence and re-review.
