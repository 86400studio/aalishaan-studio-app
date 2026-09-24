# PR Description — [PR_TITLE]

> Copy this into the PR body for every pull request. Fill every `[FIELD]`; delete sections only if truly not applicable (say so). One PR = one focused change.

## What

[One paragraph: what this PR does, in plain language. Smallest safe change — if you can't describe it in one paragraph, the PR is too big.]

## Why

Sprint: [SPRINT_ID] — [link to `docs/sprint-prompts/[SPRINT_ID]-[SLUG].md` or the roadmap item]
[One or two lines: which sprint goal or bug this serves.]

## Changes

- [Change 1 — file/area + what changed]
- [Change 2]
- [Change 3]

## Out of scope / not changed

- [What this PR deliberately does NOT touch — e.g. header/footer chrome, security headers, copy, schema]
- [Known deferrals, with where they live in the backlog/roadmap]

Why this matters: naming what you didn't change stops reviewers filing false positives and stops scope creep.

## How tested

- [ ] Local checks green: `[TYPECHECK_COMMAND]` · `[LINT_COMMAND]` · `[TEST_COMMAND_OR_N/A]` · `[BUILD_COMMAND]`
- [ ] Manual: [routes/flows exercised, desktop + mobile]
- [ ] Deployed Preview PASS before second-pass review: [provider + record link + tested HEAD_SHA]

## Screenshots (UI changes only)

| View | Before | After |
|---|---|---|
| Desktop | [img] | [img] |
| Mobile | [img] | [img] |

## Checklist

- [ ] All local checks green
- [ ] No live env file, secret, key, token, or connection string in `[MERGE_BASE_SHA]..[HEAD_SHA]`; any `.env.example` change contains safe placeholders only
- [ ] `docs/PROJECT-STATUS.md` updated in this same branch (if sprint state changed)
- [ ] Copy is verbatim from the approved copy source; new strings follow the voice rules
- [ ] Deployed Preview (Vercel or approved equivalent) tested at `[HEAD_SHA]`, desktop + mobile
- [ ] Independent review APPROVE recorded for `[MERGE_BASE_SHA]..[HEAD_SHA]`; any substantive later change repeats Preview + review

## Rollback note

[How to revert safely: normally a revert PR + redeploy, or `Vercel Instant Rollback (project Overview → Production Deployment tile → Instant Rollback, or Deployments → ⋮ → Instant Rollback; on Hobby only the immediately previous production deployment)` for immediate restoration. If this PR includes a DB migration, note that host rollback does NOT restore the DB and a down migration does NOT restore lost data—cite the schema rollback and data-recovery record [MIGRATION_NUMBER].]

---

Next step → test the deployed Preview and record PASS, then request independent review of the immutable range
(`CODEX-REVIEW-PROMPT-TEMPLATE.md`). Any later code change requires a new Preview PASS and re-review.
