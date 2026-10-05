# Codex Review Brief — fix — dependency-updates

Prepared 2026-10-01 from `docs/templates/CODEX-REVIEW-PROMPT-TEMPLATE.md` for the dependency fix PR that supersedes Dependabot's group PR #11, at the owner's request ("please resolve or merge, whatever is needed", 2026-10-01). It is a small fix PR outside any sprint (`CLAUDE.md` branch example `claude/fix-short-slug`). The reviewer appends nothing; the builder appends the returned record below.

You are the independent, findings-only reviewer for this PR. `AGENTS.md` governs this review. Do not edit, stage, commit, push, merge, install dependencies, or run migrations. Inspect with `git diff`, `git show <sha>` and `git show <sha>:<path>` only; never `git checkout`, `git switch`, `git stash` or `git reset` (Codex runs in the builder's working tree). Never open `.env.local`.

## Review target

- Repo: `86400studio/aalishaan-studio-app`.
- PR: `claude/fix-dependency-updates` → `main` (its number is in the handoff and on the PR). It supersedes Dependabot's PR #11, which is closed; Dependabot's commit is carried here unchanged.
- Merge-base and reviewed head: given in the handoff and on the PR (a commit cannot contain its own SHA). The branch starts at `dd65f7b9ad0a33d69410df08eade663cb93e82ea` (the PR #10 merge). Before the review the builder merges the then-current `main` — with the S0.3 PR #15 — into it and adds this PR's tracker entry, so the handoff names the final merge-base.
- Commits: `db15fe3ed1dd27b194aec4dfc109a598684b63ad` (dependabot[bot]: `package.json` and `pnpm-lock.yaml`, eight minor and patch updates); `d180364` (the builder: the version-pin test, the recorded pins and this file); the builder's Dependabot-rules commit (`.github/dependabot.yml`, the architecture notes, this file); and, at the review leg, the merge of `main` with the tracker entry.
- Expected changed paths (9, plus the tracker at the review leg): `package.json` and `pnpm-lock.yaml` (Dependabot's commit only), `tests/unit/baseline-inventory.test.ts`, `.github/dependabot.yml`, `docs/TECH-ARCHITECTURE.md`, `docs/TECHNICAL-INTEGRITY.md`, `README.md`, `supabase/README.md`, and this file (new); `docs/PROJECT-STATUS.md` once the tracker entry is added.

## Intent

- Goal, part 1: adopt the weekly minor-and-patch group with the repository's version-pin guard and recorded pins updated in the same PR — `@supabase/supabase-js` 2.117.1 → 2.117.2, `react` and `react-dom` 19.2.8 → 19.3.0, `@types/react` 19.2.18 → 19.3.0, `@types/react-dom` 19.2.7 → 19.3.0, `supabase` (the CLI) 2.117.0 → 2.118.0, `vite` 8.3.0 → 8.3.1, `vitest` 5.0.1 → 5.0.2. The Code Check on Dependabot's commit failed only at "Unit tests pass": `tests/unit/baseline-inventory.test.ts` pins the S0.2 additions exactly, by design, so every bump is a conscious change.
- Goal, part 2: make three majors deliberate decisions, in the repository itself. `.github/dependabot.yml` ignores `version-update:semver-major` for `@types/node` (it follows the runtime's Node major, 24), `typescript` (the generator's `^5` line) and `@sentry/nextjs` (version 11 removes `sendDefaultPii` and switches data collection on by default, so it needs a planned migration). This is decision D-42 in `docs/PROJECT-STATUS.md` (recorded on the S0.3 branch, PR #15). The Dependabot PRs #12, #13 and #14 were closed without merging on 2026-10-01. No comment-based ignore was used, so the file is the only place that holds the rule.
- Out of scope: any major update; any application code; `docs/ROADMAP.md`.
- Hosting/Preview: a runtime dependency change (React, `@supabase/supabase-js`). The Preview at the reviewed head is tested with the Playwright smoke (`pnpm test:e2e`, desktop and mobile-390); its `GET /api/health` assertion exercises both real Supabase clients on the deployed build. The result is in the handoff and on the PR. Database: N/A — no migration; the Supabase CLI is a development tool and nothing in this PR runs it against a project.

## Evidence (builder, 2026-10-01)

- Dependabot's commit `db15fe3` on `dd65f7b`: Code Check run 36805063690 failed only at "Unit tests pass" — `tests/unit/baseline-inventory.test.ts` › "pins the three S0.2 additions exactly" expected `2.117.1` and received `2.117.2` (378 of 379 passed); secret scan, locked install, typecheck, lint and formatting passed; the build and audit steps were skipped; the Vercel Preview of `db15fe3` built (GitHub deployment 6774567844, success).
- The builder's commits: the pin test expects `@supabase/supabase-js` 2.117.2 and `supabase` 2.118.0 (`@playwright/test` 1.63.0 unchanged) — still exact equality; `docs/TECH-ARCHITECTURE.md` §2 records React 19.3.0, `@supabase/supabase-js` 2.117.2, the CLI 2.118.0 and Vitest 5.0.2 next to the earlier pins (history kept) and states the three deferrals; `README.md` and `supabase/README.md` name the CLI 2.118.0; `.github/dependabot.yml` gains one `ignore` block of three entries; `docs/TECHNICAL-INTEGRITY.md` says so in one clause.
- `package.json` changes only the eight versions; nothing is added or removed. `pnpm-lock.yaml` is Dependabot's commit, untouched by the builder (`git diff db15fe3..HEAD -- package.json pnpm-lock.yaml` is empty): 48 package entries added and 47 removed — the eight packages' own trees, plus Dependabot's re-resolution of five transitive packages outside them: `browserslist` 4.29.1 with `baseline-browser-mapping` 2.11.26 and `electron-to-chromium` 1.5.439 (new), `minimizer-webpack-plugin` 5.11.0 → 5.12.0 and `webpack-sources` 3.5.1 → 3.6.0.
- Local checks on the branch (Windows, Node 24.15.0, pnpm 10.34.5, after `pnpm install --frozen-lockfile` of this branch's lockfile): `pnpm typecheck` exit 0; `pnpm lint` exit 0; `pnpm test:unit` 9 files, 379 passed; `pnpm build` exit 0 with the same five routes (`/`, `/_not-found`, `/robots.txt` static; `/api/health`, `/api/setup-proof` dynamic); `pnpm audit --prod --audit-level=critical` — no known vulnerabilities; `pnpm format:check` — every tracked file clean, `.github/dependabot.yml` included (its one warning is an untracked local `.pnpm-store/` artefact, absent in CI); `pnpm exec supabase --version` → `2.118.0`.
- Installed versions read from `node_modules`: `react` and `react-dom` 19.3.0, `@types/react` and `@types/react-dom` 19.3.0, `@supabase/supabase-js` 2.117.2, `supabase` 2.118.0, `vite` 8.3.1, `vitest` 5.0.2; `next` 16.3.6 and `typescript` 5.9.3 unchanged. Next 16.3.6 declares the peer range `^18.2.0 || 19.0.0-rc-de68d2f4-20241204 || ^19.0.0` for `react` and `react-dom`.
- The unit suites of the two Supabase factories mock the SDK constructor, so they prove the wiring only. The real client runs in the deployed app, in `tests/integration/` and in the `scripts/testing/` runners. Runtime evidence for `@supabase/supabase-js` 2.117.2 is therefore the Preview smoke at the reviewed head (`GET /api/health` must answer `{"status":"ok"}`) and `pnpm test:integration` against TEST, run under the owner's authorization at the review leg; both results are in the handoff, never prefilled here.
- typescript-eslint 8.70.1 declares the peer range `typescript >=4.8.4 <6.1.0`, so TypeScript 6.0 would be supported; the deferral is a policy choice (the generator's `^5` line), not a compatibility failure. The runtime is Node 24 (`engines` 24.x, `.nvmrc`), so `@types/node` 25 or 26 would type-check APIs that Node 24 lacks.

## Hunt list

1. `package.json` changes exactly the eight versions. `pnpm-lock.yaml` is Dependabot's commit byte for byte — the builder's commits touch neither file — and installs frozen; its transitive changes are the ones listed above.
2. The pin test still asserts exact versions (no range, pattern or loosening) and matches `package.json`.
3. React 19.3.0 sits inside Next 16.3.6's peer range; the build, the unit suite and the Preview render are unaffected. For `@supabase/supabase-js` 2.117.2 the factories' unit tests mock the SDK: judge the real-client evidence in the handoff (the Preview health check and the integration run).
4. Supabase CLI 2.118.0: the migration file pattern named in the unit test's header comment was verified in the CLI source at 2.117.0 and is not re-verified here; nothing in this PR runs the CLI against a project — S1.1's first `migration list` on TEST re-proves discovery. Judge whether that is an acceptable residual.
5. `.github/dependabot.yml`: a valid configuration; only `version-update:semver-major` of the three named dependencies is ignored; minor and patch updates still flow through the group; the `github-actions` entry and everything else in the file are unchanged.
6. Documentation: the recorded pins match `package.json`; historical statements ("as built at S0.2", "generated by `supabase init` 2.117.0", "verified in its source at 2.117.0") are not rewritten; the Sentry, TypeScript and Node rows state the deferrals truthfully.
7. Scope: the listed paths only; no secret or environment value.

## Returned record

Begin with the confirmed range, scope match, files and commands checked. For each finding: severity (Blocking / Should-fix), location, issue, failure scenario, suggested fix, confidence. If there are no findings, state **No findings**. End with exactly one verdict — **APPROVE** or **REQUEST CHANGES** — and the literal reviewed range.

## Verdict: pending

The returned record is appended below by the owner or the builder once the review has run against the tested candidate.

## PR #16 — merged before its gates; late review — Verdict: APPROVE (Codex, 2026-10-02)

Appended 2026-10-05 by the S1.1 cloud build leg (step 0, WORKFLOW §8) from the comments the builder posted on PR #16 on the owner's instruction (https://github.com/86400studio/aalishaan-studio-app/pull/16#issuecomment-5957414305, -5957529020 and -5958572677). The context above describes a plan that did not happen: the owner merged PR #16 on 2026-10-02 at 09:37:32 UTC as `57a3aabf2da8a8d5b298709bc3b0328bce75b523` (parents `dd65f7b`, `0c09460`; tree = `0c09460`) before this review, before the Preview test and the TEST integration run, without the tracker entry and ahead of PR #15 — recorded as a process deviation (`docs/PROJECT-STATUS.md` §10 #13). The merge-base is therefore `dd65f7b9ad0a33d69410df08eade663cb93e82ea` and the reviewed head `0c0946053f527d44e75c94bc0cbd829eb3ef2f80`, never merged with `main`. Evidence gathered after the merge: Production deployment 6805595206 (success 09:38:25 UTC) and its smoke pass (14:14–14:15 UTC); the Preview of `0c09460` opened through the owner's Vercel sign-in (14:39 and 17:04 UTC); **`pnpm test` on `main` at `04b2906` — 2026-10-02 17:13–17:14 UTC, the owner's trusted local process under the owner's authorisation: preflight read-only pass, unit 379/379, integration 8/8 against the real TEST project, `system_checks` 0 rows afterwards** (the merge note's "Still open" item 2, closed). The returned record, verbatim as pasted by the owner:

```text
RECORD 1: PR #16
Confirmed range: dd65f7b9ad0a33d69410df08eade663cb93e82ea..0c0946053f527d44e75c94bc0cbd829eb3ef2f80.
Scope match: YES. Confirmed commits db15fe3, d180364, and 0c09460, their parent chain, and all nine expected changed paths. Merge 57a3aab has the reviewed head’s tree.
Files and context inspected: .github/dependabot.yml, README.md, docs/TECH-ARCHITECTURE.md, docs/TECHNICAL-INTEGRITY.md, docs/code-reviews/fix-dependency-updates-review.md, package.json, pnpm-lock.yaml, supabase/README.md, and tests/unit/baseline-inventory.test.ts. Surrounding context included AGENTS.md, workflow §§7–8, rollback guidance, D-42, Next configuration, both instrumentation files, Supabase factories/configuration, health and setup-proof handlers, relevant tests, and Code Check.
Commands and evidence checked, with skips:
- Read-only Git inspection confirmed the range and file list. git diff --check passed. git diff db15fe3 0c09460 -- package.json pnpm-lock.yaml was empty.
- Independently inspected Code Check run 36889934652. Checkout logs associate it with the reviewed head and supplied base. Secret scan, frozen install, typecheck, lint, formatting, 379 unit tests, five-route build, and critical production audit passed.
- Verified the successful Vercel status associated with the reviewed head. Read the posted Preview/Production evidence and integration result. Browser and integration checks were builder/owner executions, not independently replayed.
- Local pnpm typecheck failed at pnpm startup with [ERROR] fetch failed; TypeScript did not execute. pnpm lint, pnpm test:unit, pnpm format:check, pnpm audit --prod --audit-level=critical, and pnpm build were skipped because that dispatcher was unavailable. No environment repair or dependency installation was attempted.
- pnpm test, pnpm test:integration, pnpm test:e2e, and every pnpm db:test:* command were not run, as prohibited by the brief. No CLI project command or migration was run.
No findings. Verified:
- Exactly eight root version changes, with scripts and dependency names unchanged. Exact Supabase and Playwright pin assertions remain intact and match the manifest.
- React 19.3.0 satisfies Next’s peer range. Posted deployed health checks and the eight real TEST integration tests on combined main provide adequate evidence for Supabase JS 2.117.2.
- CLI 2.118.0 retains the filename pattern accepting 0000_init.sql and does not exclude it as a legacy initialization migration. This was independently checked against its filename parser and migration discovery code; actual project discovery remains unexecuted.
- Dependabot ignores only major updates for the three specified packages; minor/patch grouping and GitHub Actions configuration remain unchanged. The rules match GitHub’s documented ignore options.
- No introduced secret/environment value, client exposure of server credentials, authorization weakening, unsafe write path, or migration change. Health responses remain coarse and read-only; setup-proof authorization precedes database access.
- Pin documentation matches this head. The superseded review plan and deferred tracker reconciliation are explicitly acknowledged in the merge evidence.
Verdict: APPROVE
Reason: No Blocking or Should-fix defects identified; CI and posted deployment/integration evidence adequately support this range.
Reviewed range: dd65f7b9ad0a33d69410df08eade663cb93e82ea..0c0946053f527d44e75c94bc0cbd829eb3ef2f80 · Reviewed by Codex on 2026-10-02
```

## PR #17 — Dependabot's group of 2026-10-02, merged without review; late review — Verdict: APPROVE (Codex, 2026-10-02)

Appended 2026-10-05 by the S1.1 cloud build leg (step 0) from the comments the builder posted on PR #17 on the owner's instruction (https://github.com/86400studio/aalishaan-studio-app/pull/17#issuecomment-5957414884, -5958573108 and the addendum -5993583067). This file is the dependency record of D-42, so the record of this second dependency PR lives here as its own dated section. PR #17 (`dependabot/npm_and_yarn/minor-and-patch-43af1a657a`: `next` and `eslint-config-next` 16.3.6 → 16.3.7, `@sentry/nextjs` 10.75.2 → 10.75.3, `@types/node` 24.13.6 → 24.19.0; `package.json` and `pnpm-lock.yaml` only) was merged as it stood by the `86400studio` account on 2026-10-02 at 14:46:14 UTC as `04b2906ab2ff108f9f9069940d96e2a0417a9a9e` (parents `59d8123`, the PR #15 merge, and `1a7b2d4`); the owner confirmed on 2026-10-05 that the merge was his own — a process deviation against D-42 and WORKFLOW §7 (`docs/PROJECT-STATUS.md` §10 #13). Evidence: Code Check green at `1a7b2d4` (run 36991171512, base `57a3aab`); Production deployment 6811116919 (success 14:47:15 UTC) with a smoke pass at 16:14–16:16 UTC carrying one transient `/api/health` 503 on the deployment URL (`PROJECT-STATUS.md` §10 #14); the Preview of `1a7b2d4` (deployment 6805655722) opened through the owner's Vercel sign-in; the combined-main integration result above was executed on `04b2906`, which contains this merge. The returned record, verbatim as pasted by the owner:

```text
RECORD 2: PR #17
Confirmed range: 57a3aabf2da8a8d5b298709bc3b0328bce75b523..1a7b2d4dbc896b73f3f5bf1c1fd963e0dcd625f6.
Scope match: YES. Confirmed the single Dependabot commit and its parent. Only package.json and pnpm-lock.yaml changed. Merge 04b2906 has the stated parents, and its delta from first parent 59d8123 contains only these two files.
Files and context inspected: both manifests and complete lockfiles, their dependency metadata and snapshot changes, AGENTS.md, workflow §§7–8, rollback guidance, architecture pins, D-42, .nvmrc, Next configuration, both instrumentation files, Supabase factories/configuration, health and setup-proof handlers, relevant tests, Dependabot policy, and Code Check.
Commands and evidence checked, with skips:
- Read-only Git inspection confirmed the range, parent, scope, and merge delta. git diff --check passed.
- Independently inspected Code Check run 36991171512. Checkout logs associate it with the reviewed head and supplied base. All steps passed, including 379 unit tests, the same five routes under Next 16.3.7, and the critical production audit.
- Verified successful Vercel status for the reviewed head and read the posted deployment evidence. The combined-main integration result supplements this evidence; it was executed on 04b2906, not this isolated head.
- Local pnpm typecheck failed at dispatcher startup with [ERROR] fetch failed. pnpm lint, pnpm test:unit, pnpm format:check, pnpm audit --prod --audit-level=critical, and pnpm build were skipped because the dispatcher was unavailable. CI results are independently checked evidence, not local execution.
- pnpm test, pnpm test:integration, pnpm test:e2e, and every pnpm db:test:* command were not run under the brief’s prohibition. Signed-in browser checks were not independently replayed.
No findings. Verified:
- Exactly the four specified root version changes; lockfile changes follow their dependency trees and transitive re-resolutions. Scripts and install policy are unchanged.
- Next configuration retains security headers, agentRules: false, and Sentry options. Node types remain on major 24; TypeScript 5.9.3 satisfies the updated typescript-eslint peer range.
- Sharp 0.35.5 retains optional platform binaries and remains in ignoredBuiltDependencies; frozen installation and production build passed.
- Both Sentry entry points retain sendDefaultPii: false and scrubbing hooks. Posted initialization and accepted envelopes are adequate patch-release evidence, but do not establish end-to-end error alerting or server scrubbing.
- No introduced secret/environment value, server/client boundary weakening, authorization change, unsafe write, or schema change.
- Recorded pin drift is the stated S1.1 reconciliation item; no additional defect was established.
The single Production 503 query_failed has no recorded timing or diagnostic category establishing its cause. The unchanged handler applies 2.5 seconds to each of two sequential reads; a 3.9-second total Preview response does not prove either read exceeded that bound. Keep the existing timeout. Preserve the observation and, if it recurs, investigate sanitized timing/error evidence before changing the limit. Current evidence does not establish a regression caused by this range.
Verdict: APPROVE
Reason: No Blocking or Should-fix defects identified; the isolated health failure is not attributable to this dependency patch on available evidence.
Reviewed range: 57a3aabf2da8a8d5b298709bc3b0328bce75b523..1a7b2d4dbc896b73f3f5bf1c1fd963e0dcd625f6 · Reviewed by Codex on 2026-10-02
```
