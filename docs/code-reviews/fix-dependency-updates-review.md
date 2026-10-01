# Codex Review Brief — fix — dependency-updates (PR #11)

Prepared 2026-10-01 from `docs/templates/CODEX-REVIEW-PROMPT-TEMPLATE.md` for the Dependabot group PR #11, fixed by the builder on the bot's own branch at the owner's request ("please resolve or merge, whatever is needed", 2026-10-01). It is a small fix PR outside any sprint. The reviewer appends nothing; the builder appends the returned record below.

You are the independent, findings-only reviewer for this PR. `AGENTS.md` governs this review. Do not edit, stage, commit, push, merge, install dependencies, or run migrations. Inspect with `git diff`, `git show <sha>` and `git show <sha>:<path>` only; never `git checkout`, `git switch`, `git stash` or `git reset` (Codex runs in the builder's working tree). Never open `.env.local`.

## Review target

- Repo: `86400studio/aalishaan-studio-app`.
- PR: #11 — `dependabot/npm_and_yarn/minor-and-patch-d37ef4f68b` → `main`.
- Merge-base: `dd65f7b9ad0a33d69410df08eade663cb93e82ea` (the PR #10 merge).
- Reviewed head: the branch head at hand-off, given in the handoff and on the PR (a commit cannot contain its own SHA).
- Commits in the range: `db15fe3ed1dd27b194aec4dfc109a598684b63ad` (dependabot[bot]: `package.json` and `pnpm-lock.yaml`, eight minor and patch updates) and the builder's fix commit (the version-pin test, the recorded pins and this file).
- Expected changed paths (7): `package.json` and `pnpm-lock.yaml` (Dependabot's commit only), `tests/unit/baseline-inventory.test.ts`, `docs/TECH-ARCHITECTURE.md`, `README.md`, `supabase/README.md`, and this file (new).

## Intent

- Goal: adopt the weekly minor-and-patch group with the repository's version-pin guard and recorded pins updated in the same PR — `@supabase/supabase-js` 2.117.1 → 2.117.2, `react` and `react-dom` 19.2.8 → 19.3.0, `@types/react` 19.2.18 → 19.3.0, `@types/react-dom` 19.2.7 → 19.3.0, `supabase` (the CLI) 2.117.0 → 2.118.0, `vite` 8.3.0 → 8.3.1, `vitest` 5.0.1 → 5.0.2. The Code Check on Dependabot's commit failed only at "Unit tests pass": `tests/unit/baseline-inventory.test.ts` pins the S0.2 additions exactly, by design, so every bump is a conscious change.
- Out of scope: any major update — the Dependabot PRs #12 (`@sentry/nextjs` 11), #13 (`@types/node` 26) and #14 (TypeScript 6) are closed with ignore conditions (decision D-42, recorded in `docs/PROJECT-STATUS.md` on the S0.3 branch, PR #15); any application code; the trackers (`docs/PROJECT-STATUS.md`, `docs/ROADMAP.md` — reconciled in the next sprint branch under `WORKFLOW.md` §8, which also keeps this PR free of conflicts with PR #15); `.github/dependabot.yml`.
- Hosting/Preview: a runtime dependency change (React, `@supabase/supabase-js`); the Preview deployment at the reviewed head is named in the handoff and on the PR. Database: N/A — no migration; the Supabase CLI is a development tool and nothing in this PR runs it against a project.

## Evidence (builder, 2026-10-01)

- Dependabot's commit `db15fe3` on the merge-base: Code Check run 36805063690 failed only at "Unit tests pass" — `tests/unit/baseline-inventory.test.ts` › "pins the three S0.2 additions exactly" expected `2.117.1` and received `2.117.2` (378 of 379 passed); secret scan, locked install, typecheck, lint and formatting passed; the build and audit steps were skipped; the Vercel Preview of `db15fe3` built (GitHub deployment 6774567844, success).
- The builder's fix commit: the pin test expects `@supabase/supabase-js` 2.117.2 and `supabase` 2.118.0 (`@playwright/test` 1.63.0 unchanged) — still exact equality; `docs/TECH-ARCHITECTURE.md` §2 records React 19.3.0, `@supabase/supabase-js` 2.117.2, the CLI 2.118.0 and Vitest 5.0.2 next to the earlier pins (history kept); `README.md` and `supabase/README.md` name the CLI 2.118.0. `git diff db15fe3..HEAD -- package.json pnpm-lock.yaml` is empty.
- Local checks on the fixed head (Windows, Node 24.15.0, pnpm 10.34.5, after `pnpm install --frozen-lockfile` of this branch's lockfile): `pnpm typecheck` exit 0; `pnpm lint` exit 0; `pnpm test:unit` 9 files, 379 passed; `pnpm build` exit 0 with the same five routes (`/`, `/_not-found`, `/robots.txt` static; `/api/health`, `/api/setup-proof` dynamic); `pnpm audit --prod --audit-level=critical` — no known vulnerabilities; `pnpm format:check` — every tracked file clean (its one warning is an untracked local `.pnpm-store/` artefact, absent in CI); `pnpm exec supabase --version` → `2.118.0`.
- Installed versions read from `node_modules`: `react` and `react-dom` 19.3.0, `@types/react` and `@types/react-dom` 19.3.0, `@supabase/supabase-js` 2.117.2, `supabase` 2.118.0, `vite` 8.3.1, `vitest` 5.0.2; `next` 16.3.6 and `typescript` 5.9.3 unchanged. Next 16.3.6 declares the peer range `^18.2.0 || 19.0.0-rc-de68d2f4-20241204 || ^19.0.0` for `react` and `react-dom`.
- Not run: `pnpm test:integration` (it needs the owner-authorised TEST target; this PR changes no schema or data path). Code Check and the Preview result at the reviewed head: in the handoff and on the PR.

## Hunt list

1. `package.json` and `pnpm-lock.yaml` are exactly Dependabot's commit — the builder's commit touches neither; no dependency beyond the eight is added, removed or changed; the lockfile installs frozen.
2. The pin test still asserts exact versions (no range, pattern or loosening) and matches `package.json`.
3. React 19.3.0 sits inside Next 16.3.6's peer range; the build, the unit suite and the Preview render are unaffected; `@supabase/supabase-js` 2.117.2 leaves the browser and server factories' behaviour unchanged (their unit tests pass).
4. Supabase CLI 2.118.0: the migration file pattern named in the unit test's header comment was verified in the CLI source at 2.117.0 and is not re-verified here; nothing in this PR runs the CLI against a project — S1.1's first `migration list` on TEST re-proves discovery. Judge whether that is an acceptable residual.
5. Documentation: the recorded pins match `package.json`; historical statements ("as built at S0.2", "generated by `supabase init` 2.117.0", "verified in its source at 2.117.0") are not rewritten.
6. Scope: the seven paths only; no tracker edit; no secret or environment value.

## Returned record

Begin with the confirmed range, scope match, files and commands checked. For each finding: severity (Blocking / Should-fix), location, issue, failure scenario, suggested fix, confidence. If there are no findings, state **No findings**. End with exactly one verdict — **APPROVE** or **REQUEST CHANGES** — and the literal reviewed range.

## Verdict: pending

The returned record is appended below by the owner or the builder once the review has run against the tested candidate.
