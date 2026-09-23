# WORKFLOW.md — How Work Reaches Production

Every change to `Aalishaan Studio` follows:

**branch → build → local checks → PR → Code Check (CI) + deployed Preview (Vercel or approved equivalent) → Codex review → merge → Production smoke test**

`main` is protected and production-ready. GitHub is the source of truth.

## 1. Branch

- [ ] Read `PROJECT-STATUS.md`, the active `ROADMAP.md` sprint, and the governing agent file.
- [ ] Inspect the repository before assuming the stack, paths, or current behavior.
- [ ] Sync from the latest `main` without discarding user work.
- [ ] Create one focused branch: `claude/[SPRINT_ID]-short-slug`.
- [ ] Confirm no person or agent is already using that branch.

One feature or fix = one branch = one PR. A sprint too large for one reviewable PR must be split before implementation.

## 2. Build

- [ ] State the goal, allowed files, explicit exclusions, and acceptance criteria.
- [ ] Read the exact approved copy, mockup, specification, and surrounding code before editing.
- [ ] Make the smallest safe change that completes the task.
- [ ] Preserve behavior outside scope; send new ideas to the backlog.
- [ ] Do not invent copy, facts, routes, access rules, design variants, or env values.
- [ ] Do not add a dependency or swap a locked stack layer without an explicit decision.

## 3. Local verification

Run the commands recorded in `TECH-ARCHITECTURE.md`:

- [ ] Typecheck: `pnpm typecheck`
- [ ] Lint: `pnpm lint`
- [ ] Tests: `pnpm test`
- [ ] Production build: `pnpm build`
- [ ] Manual and accessibility checks required by the sprint pass on affected journeys.
- [ ] Review the diff and changed-file list; every file belongs to scope.
- [ ] Verify live env files are ignored without opening them (for example, `git check-ignore .env.local`); confirm no live env file is tracked or staged.
- [ ] Scan the diff for secret-like values and generated/cache files without echoing any suspected secret.

Fix failures caused by the change. Report pre-existing failures with evidence.

**Action boundary:** do not commit or push unless the owner explicitly authorized that action. If not authorized, leave the verified diff uncommitted and report a suggested commit message. Never push to `main`, force-push shared work, reset user work, or skip hooks.

## 4. Pull Request

- [ ] The owner-authorized branch is pushed and a focused PR targets `main`.
- [ ] Description states what, why, files/areas changed, exclusions, checks, screenshots where relevant, and rollback notes.
- [ ] New/changed env variables are listed by **name only** and assigned to environments by the owner.
- [ ] Data changes include migration files, access controls, classification, non-production evidence, and recovery limits.
- [ ] CI passes with the locked package manager and secret scan.

## 5. Deployed Preview — before independent review

Use Vercel Preview when Vercel is selected; otherwise use the isolated Preview named in `TECH-ARCHITECTURE.md`.

- [ ] Record provider, Preview URL, branch, and tested head SHA in `docs/templates/VERCEL-PREVIEW-TEST-TEMPLATE.md` or the approved equivalent.
- [ ] Test affected pages and shared consumers on desktop and mobile.
- [ ] Walk the primary and sprint-specific journeys through success and error states.
- [ ] Verify auth links, redirects, data writes, and environment separation when applicable.
- [ ] Follow `docs/ENVIRONMENT-PARITY.md` §12: verify the target before any external write, refresh proofs affected by this sprint, and record callback deployments at the same tested head.
- [ ] Confirm no runtime errors, broken assets, layout shift, or Production-data mutation.

Local green is necessary but not sufficient. Do not mark Preview tested without opening the deployed build.

## 6. Independent Codex review

- [ ] Compute and record immutable `[MERGE_BASE_SHA]..[HEAD_SHA]`; confirm the head matches the tested Preview.
- [ ] Reviewer checks issues introduced by that range and may inspect enough unchanged context, tests, schema, and governing docs to validate it.
- [ ] Reviewer reports serious correctness, security, data-safety, boundary, build/deploy, and workflow failures—not style nits.
- [ ] Reviewer returns a paste-ready report and makes no repository changes.
- [ ] Owner or builder saves it at `docs/code-reviews/[SPRINT_ID]-[SLUG]-review.md`.

Blocking findings are fixed by the builder. After any substantive code, config, schema, lockfile, or runtime-doc change, repeat affected local checks, refresh and retest the Preview, and obtain a new review at the new head. Approval never carries forward to unreviewed work.

## 7. Merge

Only the authorized human owner merges, after CI (the Code Check, `docs/TECHNICAL-INTEGRITY.md`), Preview, and current-head review all pass.

The independent verdict is a **gate, not a suggestion.** The reviewer is "advisory" only in that it never *acts* — it does not merge, push, or edit. It does **not** mean the owner may merge over its findings: a **Blocking** finding is never merged; a **Should-fix** may be deferred only with a logged owner + reason (PROJECT-STATUS §8). "Done" is never reached with an unresolved Blocking finding.

- [ ] Confirm the reviewed head is still the PR head.
- [ ] Merge using the repository’s approved strategy.
- [ ] Delete the merged branch when safe.
- [ ] Watch the Production deployment complete.

## 8. Production smoke test

- [ ] Test the real domain on desktop and mobile.
- [ ] Walk the primary conversion and the changed journey.
- [ ] Verify monitoring, integrations, auth, and data behavior touched by the change.
- [ ] If users are affected, execute `ROLLBACK.md`; remember that host rollback does not restore database data.

## Sprint and state discipline

- One active sprint at a time; do not start the next while the previous is unmerged.
- `ROADMAP.md` owns scope/order. `PROJECT-STATUS.md` owns current state. Update both in the same authorized PR when the sprint closes.
- `README.md` ("Project docs" table) and `PROJECT-STATUS.md` §1 are the orientation map for a fresh session; per-project truth stays in the repo records — never duplicate their detail elsewhere.
- Retired or deferred scope stays dated in the backlog with an owner and decision ID.

## Database change protocol — skip if none

- [ ] Classify each migration: **additive**, **reversible**, or **destructive**.
- [ ] Version migrations and include the chosen tool’s supported rollback path plus access policies in the same PR.
- [ ] Apply and verify in an isolated non-production environment first, per user role.
- [ ] Use expand → migrate → contract for compatibility.
- [ ] Destructive work requires owner approval, backup/PITR evidence, a **restore procedure rehearsed at least once on a non-production copy with its result recorded** (not "where feasible"), and a maintenance/rollback decision.
- [ ] State plainly: down-SQL can reverse compatible schema changes; it cannot recreate deleted or transformed data.
- [ ] Prefer a forward fix when rollback would risk additional data loss.

## Definition of done

- [ ] Acceptance criteria and allowed-path guard pass.
- [ ] Local commands and relevant manual/accessibility/security checks pass.
- [ ] CI and deployed Preview pass at the reviewed head SHA.
- [ ] Current-head independent verdict is Approve; no Blocking finding remains.
- [ ] Required docs/status records are current.
- [ ] Merge is complete and Production smoke test passes.

**Next:** fill the active sprint prompt, then follow this chain without reordering it.
