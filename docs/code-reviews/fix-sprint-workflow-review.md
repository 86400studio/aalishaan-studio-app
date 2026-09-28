# Codex Review Context — fix — sprint-workflow

Prepared 2026-09-28 from `docs/templates/CODEX-REVIEW-PROMPT-TEMPLATE.md` for the owner-requested workflow-only PR outside any sprint (`CLAUDE.md` branch example `claude/fix-short-slug`). This file is the review context; the SHA-pinned brief is delivered in the builder's handoff, because a commit cannot contain its own SHA. The builder appends the returned record below; any other change after the reviewed head needs a new review.

You are the independent, findings-only reviewer for this PR. `AGENTS.md` governs this review. Do not edit, stage, commit, push, merge, install dependencies, or run migrations. Inspect with `git diff`, `git show <sha>` and `git show <sha>:<path>` only; never `git checkout`, `git switch`, `git stash` or `git reset`. Codex runs in the builder's working tree, which is on the local, unpushed branch `claude/s1.1-core-schema` with uncommitted changes — the preserved S1.1 prompt draft and the pre-split copy of these workflow edits. They are not part of the range. Never open `.env.local`.

## Review target

- Repo: `86400studio/aalishaan-studio-app`.
- PR: the workflow-only PR, `claude/fix-sprint-workflow` → `main` (number in the handoff and the PR).
- Merge-base: `e24b4c173a9929fca83092de443095ae0b1fcc52` (the PR #8 merge; `main` when the branch took its first commit — the work was drafted on the PR #7 merge `3e723f3` and moved onto `e24b4c1` before committing).
- Reviewed head: the branch head at handoff, given in the handoff and the PR description.
- Expected changed paths (13): `.claude/skills/close/SKILL.md`, `.claude/skills/sprint-prompt/SKILL.md`, `docs/CODEX-REVIEW-PROMPT.md`, `docs/PROJECT-STATUS.md`, `docs/ROADMAP.md`, `docs/SPRINT-PROMPT-TEMPLATE.md`, `docs/WORKFLOW.md`, `docs/code-reviews/README.md`, `docs/sprint-prompts/README.md`, `docs/templates/CLAUDE-SPRINT-PROMPT-TEMPLATE.md`, `docs/templates/CODEX-REVIEW-PROMPT-TEMPLATE.md`, `docs/templates/UI-SPRINT-PROMPT-TEMPLATE.md`, and this file. The owner approved the three that the original workflow draft did not touch — the UI-sprint template variant, the review guide and the review-records README — to keep them consistent with the updated templates.

## Intent

- Goal: the owner's workflow update of 2026-09-28 — from S1.1 onward one sprint branch/PR carries planning, implementation, the sprint record and tracker updates; `/sprint-prompt save` runs before review; the Codex review prompt is delivered only after implementation, checks, pre-review records and candidate CI/Preview verification, with actual SHAs; `/close` runs before merge; post-merge smoke evidence is recorded in the merged PR and the repository's Done/next-sprint state is reconciled in the next authorized sprint branch; no routine closeout PR. The review gate, re-review after any substantive post-review change and the AGENTS.md record-only exception are unchanged.
- The S1.1 prompt draft is not part of this PR. It is kept off `main`; after this PR merges it is updated for the split and committed on the S1.1 sprint branch, only when authorized. Nothing here claims it or its branch is on `main`.
- Out of scope: the S1.1 prompt and implementation; any application, CI, dependency, environment or `prototype/` change. PR #8 (root `.gitattributes`) merged as `e24b4c1` before this branch's first commit; its §1 "Next action" answers are carried into this PR's row. Known follow-ups outside the 13 paths, for a separate owner-authorized change (`PROJECT-STATUS.md` §1 item 4): `CLAUDE.md` ("When a sprint completes, update…"), `docs/templates/SUPABASE-CHANGE-TEMPLATE.md` ("Next step…") and `docs/templates/BUG-FIX-PROMPT-TEMPLATE.md` still use the older timing wording.
- Owner-authorized exceptions: Commit YES / Push YES for this branch only; a separate workflow-only PR (an owner-requested process change, not a routine closeout PR).
- Hosting/Preview: documentation and skills only; the site is unchanged. Database: N/A.

## Evidence (builder, 2026-09-28)

- Carry-over: the nine original workflow files came from the uncommitted copy on the local `claude/s1.1-core-schema` (branch = `3e723f3`). Their content diff was verified identical to that copy before any edit. The S1.1 draft and `.pnpm-store/` were left out. The work then moved from `3e723f3` onto `e24b4c1` by a three-way merge of `docs/PROJECT-STATUS.md`, the only path PR #8 also changed. There was one conflict, in §1, resolved by carrying PR #8's owner answers into "Next action" (2) and marking PR #8 merged in (3); its §10 #12 row is kept as merged.
- Internal pre-review, read-only and multi-agent, before this commit:
  - Round 1: six lenses (claims on `main`, internal consistency, unchanged governing docs, safety loopholes, deleted history, format), one adversarial verifier per finding, and a completeness critic. Result: 21 confirmed findings, 9 real-but-minor, 2 refuted, and 3 from the critic.
  - Round 2: verified every round-1 fix and ran a fresh `AGENTS.md`-style review. It found the PR #8 merge and the missing next-sprint reconciliation paths; both are fixed here.
  - Round 3: a final strict review of the rebased diff returned APPROVE, with two minor findings (the reconciliation line in the sprint templates, and the session-end step in `PROJECT-STATUS.md`). Both are applied here.
  - Deliberately unchanged, as follow-ups: `CLAUDE.md`, the SUPABASE-CHANGE template and the BUG-FIX template.
- Documentation checks on the final tree:
  - `git diff --check` is clean, and all 13 files are LF.
  - Every changed table row keeps its column count: 2 in §1, 6 in the §2 board and in the ROADMAP table.
  - Every markdown link in the added lines resolves on `main`, and no link or path points at the S1.1 prompt as if it existed there.
  - A grep for present-tense S1.1 claims finds none.
  - No conflict markers and no unfilled template tokens remain.
  - Both skills keep their `name` and plain-scalar `description` frontmatter.
- Formatting and tests: `.prettierignore` excludes `docs/` and `.claude/`, and no test under `tests/` reads a changed file, so `pnpm format:check` and the unit suite cannot be affected.
- Local `pnpm typecheck`, `lint`, `format:check`, `test:unit` and `build` were not run: this machine has no `node_modules`, and installing is outside policy (`CLAUDE.md`). The Code Check on the reviewed head runs all of them and `pnpm audit`; its result is in the handoff and the PR description.
- Production (GitHub deployments, checked 2026-09-28): the latest listed is 6702436584 from `3e723f3`; none is listed yet for `e24b4c1`. Preview: Vercel builds the branch as usual, and the site is unchanged.

## Hunt list

1. Workflow safety: the independent review gate, re-review after any substantive post-review change, the narrow AGENTS.md record-only exception, the Commit/Push NO default and the Production smoke gate are not weakened; no wording lets tracker flips or fixes land after the reviewed head without a new review.
2. Post-merge path: with no closeout PR, a merged sprint's smoke result and Done state cannot be lost or advanced unverified; a missing or failed smoke blocks the next sprint.
3. Consistency: `/sprint-prompt`, `/close`, the three changed templates, `SPRINT-PROMPT-TEMPLATE.md`, `CODEX-REVIEW-PROMPT.md`, `WORKFLOW.md`, `PROJECT-STATUS.md` §1 and §11, the ROADMAP exit gate and both READMEs state the same sequence.
4. Claims: nothing on `main` says the S1.1 prompt or its branch is on `main`; no broken link; S1.1 stays Not Started; no evidence is prefilled.
5. Unchanged governing docs (`CLAUDE.md`, `AGENTS.md`, the other templates and skills) are not contradicted in a way that breaks the workflow.
6. Scope: the thirteen paths above only; no secret or environment value.

## Returned record

Begin with the confirmed range, scope match, files and commands checked. For each finding: severity (Blocking / Should-fix), location, issue, failure scenario, suggested fix, confidence. If there are no findings, state **No findings**. End with exactly one verdict — **APPROVE** or **REQUEST CHANGES** — and the literal reviewed range.

## Round 1 — Verdict: APPROVE (GPT-5.6 Sol, 2026-09-28)

Reviewed range `e24b4c173a9929fca83092de443095ae0b1fcc52..9b52f29eb5018566a8e962b1dbf612ad27177bfe` (PR #9; Code Check https://github.com/86400studio/aalishaan-studio-app/actions/runs/36402607665; Preview GitHub deployment 6706476285). The reviewer could not query GitHub. When this record was appended, the builder confirmed that `gh pr view 9` still showed head `9b52f29…` (OPEN, CLEAN), which is the head the Code Check run and the Preview deployment were tied to. This append is the only commit above the reviewed head; it is documentation only. The returned record, verbatim as pasted by the owner:

```text
Independent Review Record
Confirmed range: e24b4c173a9929fca83092de443095ae0b1fcc52..9b52f29eb5018566a8e962b1dbf612ad27177bfe

Scope match: YES. git merge-base returned the expected merge-base, both SHAs resolve to commit objects, and the immutable range contains exactly the 13 expected documentation and skill paths. No application, CI, dependency, environment, migration, or prototype file is present in the range.

PR-head confirmation: gh pr view 9 --json headRefOid could not run because the environment has no authenticated GitHub CLI session. The public GitHub API was also unavailable with HTTP 403, and no local PR ref exists. Therefore, the PR’s live head, CI run metadata, Preview deployment metadata, and Production deployment list could not be independently refreshed; the review used the supplied evidence that PR #9, Code Check run 36402607665, and Preview deployment 6706476285 all correspond to 9b52f29eb5018566a8e962b1dbf612ad27177bfe.

Files/context inspected: root AGENTS.md; CLAUDE.md; all 13 changed files at the reviewed head; their range diffs and relevant merge-base versions; docs/PROJECT-STATUS.md §§1–4, §10 items 11–12, and §11; the S1.1 row and brief, Universal sprint exit gate, and Next section in docs/ROADMAP.md; all of docs/WORKFLOW.md; the review-context record; commit list and diff statistics.

Commands/evidence checked:

✅ git merge-base e24b4c173a9929fca83092de443095ae0b1fcc52 9b52f29eb5018566a8e962b1dbf612ad27177bfe — returned e24b4c173a9929fca83092de443095ae0b1fcc52.

✅ git diff --name-only e24b4c173a9929fca83092de443095ae0b1fcc52 9b52f29eb5018566a8e962b1dbf612ad27177bfe — returned exactly the 13 expected paths.

✅ git cat-file -t e24b4c173a9929fca83092de443095ae0b1fcc52 and git cat-file -t 9b52f29eb5018566a8e962b1dbf612ad27177bfe — both returned commit.

⚠️ gh pr view 9 --json headRefOid — not independently executable because GitHub CLI authentication is absent.

⚠️ curl -fsSL https://api.github.com/repos/86400studio/aalishaan-studio-app/pulls/9 — public API fallback returned HTTP 403.

⚠️ curl -fsSL https://api.github.com/repos/86400studio/aalishaan-studio-app/actions/runs/36402607665 — public API fallback returned HTTP 403.

⚠️ curl -fsSL 'https://api.github.com/repos/86400studio/aalishaan-studio-app/deployments?environment=Production' — public API fallback returned HTTP 403.

✅ git diff --check e24b4c173a9929fca83092de443095ae0b1fcc52 9b52f29eb5018566a8e962b1dbf612ad27177bfe — clean.

✅ pnpm typecheck — passed.

✅ pnpm lint — passed with zero warnings.

✅ pnpm test:unit — 9 test files passed; 379 tests passed. Vitest emitted only its existing future configLoader: 'native' compatibility warning.

✅ pnpm build — passed; production compilation, TypeScript, static generation, and page optimization completed successfully.

⚠️ Code Check run 36402607665 — supplied as successful at the reviewed head, including gitleaks, typecheck, lint, format check, unit tests, build, and audit; live metadata could not be independently fetched because GitHub access was unavailable.

⚠️ Vercel Preview deployment 6706476285 — supplied as successful at the reviewed head; live deployment metadata could not be independently fetched.

⚠️ Production deployment 6702436584 from 3e723f3 — supplied as the latest Production deployment; live deployment metadata could not be independently fetched.

Applicable paths verified:

The workflow consistently places planning, implementation, pre-review sprint records, tracker updates, review fixes, and /close on one sprint branch and PR from S1.1 onward.

/sprint-prompt save, tracker updates, and review context occur before candidate review, while review, merge, and Production smoke remain pending until evidenced.

The reviewed-head rule retains only AGENTS.md’s narrow returned-review-record append exception; tracker edits and all other substantive changes require a new candidate and review.

Post-merge merge/deployment/PROD-apply/smoke evidence has a durable home in the merged PR, and repository reconciliation moves to the next authorized sprint branch without creating a routine closeout PR. Missing or failed smoke explicitly blocks advancement.

/sprint-prompt save authorizes writing records but does not itself authorize committing or pushing, preserving the default-NO Git boundary.

/close checks that the PR head is the reviewed head or differs only by the narrow review-record append, and rejects other post-review commits until checks, Preview, and review are refreshed.

The implementation templates preserve explicit Commit/Push fields whose omitted or unfilled state means NO.

The review template requires actual immutable SHAs, current CI and tested Preview evidence, and re-review after substantive changes.

S1.1 remains Not Started, and the documentation does not claim its draft prompt or branch is already on main.

The compacted status history remains represented in the historical sections; no open security confirmation or still-open workflow item was found to have been removed.

The range contains documentation and skill changes only, with no live env file, credential, token, private key, public-prefixed server value, runtime authorization change, migration, or access-policy change.

No findings. The reviewed change preserves the independent-review gate, exact-head enforcement, narrow record-only exception, Commit/Push default-NO boundary, post-merge evidence path, missing/failed-smoke advancement block, and the S1.1 Not Started state. The inability to query live GitHub/Vercel metadata is an evidence limitation, not a defect found in the immutable range.

Verdict: APPROVE — No Blocking or Should-fix defect was found in the confirmed 13-file workflow-only range; approval relies on the supplied PR/CI/Preview metadata because live GitHub metadata was unavailable in this environment.
Reviewed range: e24b4c173a9929fca83092de443095ae0b1fcc52..9b52f29eb5018566a8e962b1dbf612ad27177bfe · Reviewed by GPT-5.6 Sol on 2026-09-28.
```
