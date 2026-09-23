# Codex Review Brief — [SPRINT_ID] — [SLUG]

> Save the filled brief at docs/code-reviews/[SPRINT_ID]-[SLUG]-review.md before review.
> Append the reviewer's returned record; the reviewer does not edit the repository.

You are the independent, findings-only reviewer for this PR. AGENTS.md governs this review. Do not edit,
stage, commit, push, merge, install dependencies, or run migrations. Review issues introduced by the pinned
range; inspect enough surrounding context to validate them without starting an unrelated full audit.

## Review target

- Repo: [REPO_NAME]
- PR: #[PR_NUMBER] — [PR_URL]
- Branch: [BRANCH_NAME] (context only)
- Merge-base SHA: [MERGE_BASE_SHA]
- Reviewed head SHA: [HEAD_SHA]
- Immutable range: [MERGE_BASE_SHA]..[HEAD_SHA]
- Sprint record: docs/sprint-prompts/[SPRINT_ID]-[SLUG].md
- Expected changed paths: [LIST]

First confirm both SHAs and the actual changed-file list. Stop and report a target mismatch before reviewing
if the range, head, PR, or scope does not agree.

## Read for context

- AGENTS.md.
- The sprint record above.
- docs/PROJECT-STATUS.md and the relevant docs/ROADMAP.md sprint.
- [Relevant architecture, security, workflow, source, test, schema, copy, or design files.]

## Sprint intent

- Goal and exit condition: [ONE_PARAGRAPH]
- Intentionally out of scope: [LIST_OR_NONE]
- Owner-authorized exceptions: [LIST_OR_NONE]
- Hosting/Preview state: [PREVIEW_URL_AND_TEST_RESULT_FOR_HEAD_SHA]
- Database/migration state: [STATE_OR_N/A]

## Checks and evidence

- Typecheck: [TYPECHECK_COMMAND]
- Lint: [LINT_COMMAND]
- Tests: [TEST_COMMAND_OR_N/A]
- Production build: [BUILD_COMMAND]
- Current CI evidence for HEAD_SHA: [RESULT_OR_LINK]
- Current tested Preview evidence for HEAD_SHA: [RESULT_OR_LINK]

Run commands only with the existing environment. Do not install or change anything to make a check pass.
State every command not run and why.

## Hunt list

1. Correctness: exit criteria work in realistic success, empty, loading, and failure states that apply.
2. Authorization: gated routes/data paths, if any, authorize server-side before protected reads; admin paths
   verify role.
3. Secrets/env: no live env values, credentials, tokens, private keys, or server-only values exposed. A
   placeholder-only example file is acceptable only when it contains names/placeholders, not live values.
4. Data safety: no unintended anonymous path or silent data loss; database changes, if any, match the selected
   migration, rollback, and access-policy rules.
5. Input safety: untrusted values are validated before redirects, URLs, raw HTML, queries, or other sinks.
6. Build/deploy: imports, generated artifacts, routing/rendering mode, config, lockfiles, and hosting behavior
   have no unintended change.
7. Scope/content: actual paths match the sprint; approved copy/design/facts were not silently changed.
8. Regressions: the change does not weaken an existing guard or break a neighboring workflow.

Do not open a live-value env file from the worktree. Never echo a suspected secret value. Identify only
its file, line, and type and recommend rotation.
Report serious, evidence-backed issues only; no style nits.

## Returned record

Begin with:

- Confirmed range: [MERGE_BASE_SHA]..[HEAD_SHA]
- Scope match: [YES / NO — explanation]
- Files/context inspected: [LIST]
- Commands/evidence checked: [RESULTS_AND_SKIPS]

For each finding:

### Finding [N]
- **Severity:** Blocking / Should-fix
- **Location:** [path/file.ext:line plus route/flow]
- **Issue:** [One or two evidence-based sentences.]
- **Failure scenario:** [Concrete input/state → wrong outcome.]
- **Suggested fix:** [Specific minimal fix.]
- **Confidence:** high / medium / low

If there are no findings, state **No findings** and list the correctness, safety, build, and Preview paths
verified. Do not return a bare approval.

End with exactly one:

**Verdict: [APPROVE / REQUEST CHANGES]** — [ONE_LINE_REASON].
Reviewed range: [MERGE_BASE_SHA]..[HEAD_SHA] · Reviewed by [REVIEWER] on [DATE].

The owner or builder appends this returned record to docs/code-reviews/[SPRINT_ID]-[SLUG]-review.md.
Any substantive change after HEAD_SHA invalidates approval and requires updated checks, a refreshed Preview,
and independent review of the new immutable head. A commit that only appends this review record may be
exempt when its documentation-only scope and reviewed head are recorded.
