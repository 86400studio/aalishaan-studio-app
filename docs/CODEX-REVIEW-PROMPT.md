# Codex Review Guide

Use this guide to prepare an independent, findings-only review after local checks and the hosted Preview
have been tested. The copy-paste brief is templates/CODEX-REVIEW-PROMPT-TEMPLATE.md.

## S1.4 — prompt to run after implementation

Prepared 2026-10-29 for [S1.4 — Catalogue browse pages from the database](sprint-prompts/S1.4-catalogue-browse.md).
This is the reusable review-start instruction, **not a completed SHA-pinned brief or an approval**.
The builder supplies the final brief after implementation, checks, pre-review records, CI and the tested
candidate Preview, using [the canonical template](templates/CODEX-REVIEW-PROMPT-TEMPLATE.md).
No S1.4 PR number, reviewed head or verification result exists in this planning record.

After Claude completes those gates and gives you its final review handoff, start a fresh Codex session in
this repository. Paste the prompt below together with that handoff. The reviewer checks the candidate;
the owner or builder later saves the returned record at `docs/code-reviews/S1.4-catalogue-browse-review.md`.
Keep S1.3b's completed review record unchanged.

```text
Independently review S1.4 — Catalogue browse pages from the database — in
86400studio/aalishaan-studio-app. AGENTS.md governs this findings-only review.

Read docs/sprint-prompts/S1.4-catalogue-browse.md, the builder's completed review
context at docs/code-reviews/S1.4-catalogue-browse-review.md, and its final handoff
filled from docs/templates/CODEX-REVIEW-PROMPT-TEMPLATE.md. Use the final handoff
provided with this request; if necessary, locate the matching S1.4 PR and its
recorded handoff through read-only repository/GitHub tools.

Do not edit, stage, commit, push, merge, install dependencies, apply migrations,
upload images, mutate fixtures or call the revalidation endpoint. Do not switch
branches, stash/reset work or overwrite the builder's files. Do not open live-value
env files or credential-bearing browser/auth artifacts. Never print secret values.

First establish the review target:
- Confirm the actual S1.4 PR, branch, full immutable merge-base SHA and head SHA
  supplied in the final handoff. A branch name, local HEAD or a previous sprint's
  SHA is not a substitute for the supplied immutable range.
- Confirm both commits exist and compare the actual changed-file list for that
  range with the handoff, sprint's allowed files and any recorded owner-approved
  scope changes. Inspect pinned content with git show/diff rather than assuming
  the worktree equals the candidate. Preserve all unrelated/uncommitted work.
- Verify the CI run and tested immutable Vercel Preview deployment correspond to
  the reviewed head. Check the evidence, not just a claimed PASS or branch URL.
- If the final brief, exact range, matching evidence or required pre-review gate
  is absent or inconsistent, report the missing gate/target mismatch and stop
  before substantive review. Do not invent a target or issue an approval.

Read the relevant pinned versions of CLAUDE.md, docs/WORKFLOW.md, S1.4 in
docs/ROADMAP.md, docs/PROJECT-STATUS.md, docs/TECH-ARCHITECTURE.md, docs/DESIGN.md,
docs/APPROVED-INPUTS.md, docs/content/locked-facts.md, docs/content/new-strings.md,
docs/SECURITY-CHECKLIST.md, docs/ENVIRONMENT-PARITY.md, and S1.1's catalogue change
record. Inspect enough surrounding code, tests, schema and prototype references
to validate the diff. Do not turn this into an unrelated full audit.

Review the entire actual diff. Tailor this hunt list to what was implemented:
1. The 17 browse entries render from the validated public_catalogue projection.
   Prices/availability and membership are database-derived, money stays integer
   paise, no second static product catalogue or privileged public-read shortcut
   exists, and invalid/incomplete rows do not break valid rows or become fake data.
2. Hidden and Draft exclusion is enforced at the public query/access boundary,
   with database evidence and rendered/cache-invalidation coverage. Browser
   filtering and saved keys cannot reveal non-public artwork. Empty catalogue,
   unavailable upstream and malformed response states remain distinguishable.
3. ISR is real and bounded. Invalidating a changed/hidden artwork refreshes every
   relevant browse consumer. User-specific saved/filter state does not leak into
   shared caches. Build-time unavailable states do not permanently trap a
   correctly configured deployed catalogue in an empty/error state.
4. The revalidation hook authenticates server-side before any side effect;
   missing/wrong credentials fail closed; inputs and paths/tags are bounded and
   allow-listed. No arbitrary URL/path, query-string credential, upstream body,
   stack trace or server secret is exposed. Allowed and denied tests are present.
5. Search and all seven filter fields, approved legacy aliases, saved=1, chips,
   reset, direct URLs and Back/Forward keep controls/results/URL synchronised.
   Saved artworks share the existing browser-local keys/events, handle blocked
   storage and stale slugs, update across tabs, and recover focus after removal.
6. Collection/style routes use the approved finite slugs and return the global
   server-rendered 404 for unknown slugs. /shop-all redirects to /shop with its
   query preserved. Routes and behavior deferred to S1.5 were not silently added.
7. Images are the exact approved prototype images. Trace sources, pinned hashes,
   delivery objects and component mappings; preserve artwork, frames, crops and
   proportions. Mechanical delivery encodes are allowed; substitute/generated
   art is not. Keep the catalogue 480/1200 contract and narrow storage origins.
   Verify Preview evidence shows actual image loading/decoding and visual matches
   at 320/768/1440, including CSS backgrounds, lazy-loaded images, nested routes
   and mobile/desktop source selection. Alt text alone is not a passing image check.
8. Upload-tool changes retain enumeration, source-path confinement, dry-run and
   TEST-only guards. Production never reads TEST as an image/data fallback.
   D-48's pre-existing empty Production bucket until S3.3 is not a new S1.4 defect
   or permission to accept broken Preview imagery. Assess any explicitly approved
   change to that schedule against its recorded scope and evidence.
9. Server/client boundaries, environment identity, auth/RBAC, headers, noindex,
   closed sales and Deployment Protection are preserved. No live env file or
   secret was added. Any new migration, dependency or broader scope has explicit
   authorisation and required evidence; the planned sprint contains no migration.
10. The approved public copy/design, shared Home/shell, saved hearts, global 404,
    mobile navigation and deferred Sentry behavior remain correct. Check keyboard,
    focus, no-JS/reduced-motion, responsive and accessibility evidence. S1.3b's
    D-19 performance override is not automatically an S1.4 override.
11. Records distinguish implementation, Preview, review, merge and smoke; prior
    closure reconciliation is evidenced. Tests exercise the actual behaviors and
    security boundaries. No substantive change postdates the reviewed candidate.

Checks:
- Use only the exact reviewer commands in the final SHA-pinned brief, after
  inspecting their configuration for live-env access and external effects.
- Do not automatically run the builder's verification list. pnpm test,
  pnpm test:integration, pnpm test:e2e and pnpm db:test:* can contact or mutate
  TEST/Preview; do not run them during this review. Assess the builder's
  current-head evidence for those runs and the image upload/revalidation checks.
- Unit/build commands may load env files or contact the catalogue after S1.4.
  Run them only with the safe isolated configuration supplied in the final brief;
  do not alter source/config or install anything to make them pass. If safe
  independent execution is unavailable, state that limitation and inspect the
  corresponding current-head CI/Preview evidence without claiming execution.
- Report each command run or skipped, exact results, evidence links and material
  evidence gaps. Separate verified pre-existing failures from introduced defects.

Return the complete paste-ready review record. Begin with the confirmed immutable
range, scope match, files/context inspected, and commands/evidence checked.

Report only serious issues introduced or worsened by this range, in priority
order. For each finding include:
- Severity: Blocking / Should-fix.
- Location: path/file.ext:line plus route or flow.
- Issue: one or two evidence-based sentences.
- Failure scenario: concrete input/state -> wrong outcome.
- Suggested fix: specific and minimal.
- Confidence: high / medium / low.

For each Should-fix state whether it can be deferred and record its disposition.
Safety failures introduced or worsened by the range are Blocking. If there are
no findings, say No findings and list the correctness, safety, build and Preview
paths verified; never return a bare approval. Do not critique approved design or
copy or report style preferences. Lower confidence where evidence is incomplete.

End with exactly one verdict, APPROVE or REQUEST CHANGES, applying AGENTS.md, and
restate both full reviewed SHAs, reviewer and review date. Return the record to
the owner; do not write it into the repository yourself.

Any substantive change after the reviewed head requires refreshed checks,
Preview and independent review at a new immutable head. Only AGENTS.md's narrow
record-only append exception may apply to the returned review record.
```

## Builder handoff for S1.4

Before freezing the candidate, complete the sprint and review-context records and include these
review-guide instructions in the same sprint branch. After current-head CI and Preview verification,
deliver the fully filled canonical review brief with actual PR, SHAs, changed paths, exact safe reviewer
commands, exceptions and evidence links. Do not add a commit merely to make this guide contain its own
candidate SHA. The owner supplies that handoff alongside the reusable prompt above.

## Prepare the review

- [ ] Before freezing the candidate, commit review context (intent, scope, hunt list; verdict pending) at
      docs/code-reviews/[SPRINT_ID]-[SLUG]-review.md. After CI and the Preview pass, deliver the filled
      SHA-pinned brief in the handoff, not in a new commit (`docs/WORKFLOW.md` §6).
- [ ] Fill the repo, PR, branch, sprint record, expected changed paths, and explicit non-goals.
- [ ] State immutable [MERGE_BASE_SHA] and [HEAD_SHA] in the handoff brief; a branch name or main..branch is
      not an exact range.
- [ ] State CI results and tested Vercel Preview evidence for that head SHA in the handoff brief and the PR.
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
