# Codex Review Brief — fix — gitattributes-eol

Prepared 2026-09-28 from `docs/templates/CODEX-REVIEW-PROMPT-TEMPLATE.md` for a small fix PR outside any sprint (`CLAUDE.md` branch example `claude/fix-short-slug`). The reviewer appends nothing; the builder appends the returned record below.

You are the independent, findings-only reviewer for this PR. `AGENTS.md` governs this review. Do not edit, stage, commit, push, merge, install dependencies, or run migrations. Inspect with `git diff`, `git show <sha>` and `git show <sha>:<path>` only; never `git checkout`, `git switch`, `git stash` or `git reset` (Codex runs in the builder's working tree). Never open `.env.local`.

## Review target

- Repo: `86400studio/aalishaan-studio-app`.
- PR: #8 — `claude/fix-gitattributes-eol` → `main`. Stacked on PR #7: the branch starts at PR #7's head `4adf626548869b50a2120a27daacd669b027a13f`, and the owner merges PR #7 first.
- Merge-base for review: `4adf626548869b50a2120a27daacd669b027a13f`.
- Reviewed head: the branch head at hand-off, given in the PR description (a commit cannot contain its own SHA).
- Immutable range: `4adf626548869b50a2120a27daacd669b027a13f..` followed by that head.
- Expected changed paths (4): `.gitattributes` (new), `docs/PROJECT-STATUS.md`, `docs/sprint-prompts/S0.2-supabase-proof-harness.md`, and this file.

## Intent

- Goal: a root `.gitattributes` with `* text=auto eol=lf`, so a Windows checkout with `core.autocrlf=true` no longer turns the working tree to CRLF. That line-ending noise made 14 files show as modified with an empty diff, and made `pnpm format:check` and one line-ending-sensitive unit assertion fail on the owner's machine, never in CI (`PROJECT-STATUS.md` §10 #12). The tracker lines record the fix and three owner answers of 2026-09-28: the Playwright MCP browser keeps the owner's Vercel session; the S0.1 Sentry test issues are optional to resolve; the testing checklist's "setup done" box waits for S1.2.
- Out of scope: any application, CI, dependency or environment change; any change under `prototype/`; renormalising stored files (none needs it).

## Evidence (builder, 2026-09-28)

- `git ls-files --eol` before the change: 0 files stored as `i/crlf`, 0 `i/mixed`.
- A throwaway index (`GIT_INDEX_FILE`) read from the fix commit and renormalised with `git add --renormalize .`: `git diff --cached --stat HEAD` is empty — no stored file changes.
- `git check-attr text eol`: `src/app/page.tsx` → `text: auto`, `eol: lf`; `prototype/index.html` → `text: set` (the prototype's own rule); `prototype/admin/index.html` → `text: unset` (`admin/** -text` kept, bytes preserved); `prototype/assets/fonts/charsen.otf` → `text: unset`.
- A fresh worktree of the fix commit `487cd0b`: `git ls-files --eol` → 308 `w/lf`, 7 `w/-text`, 1 `w/none`. There, with the repository's own `node_modules`: `pnpm format:check` → "All matched files use Prettier code style!"; `pnpm test:unit` → 9 files, 379 passed; `pnpm typecheck` and `pnpm lint` exit 0. The worktree was removed afterwards.
- The prototype's E10 baseline check hashes text files with CRLF normalised to LF (`prototype/scripts/development-baseline.cjs`), so a change of working-tree line endings cannot move it.
- Code Check on the PR head: in the PR description.

## Hunt list

1. The attribute cannot change a stored file, weaken `prototype/.gitattributes` (in particular `admin/** -text` and the binary rules), or alter how a binary file is stored.
2. CI (Linux) and Vercel builds are unaffected: they already check out LF.
3. The tracker lines claim no more than the evidence above; §10 #12 still says the existing working tree needs a one-time refresh after the merge.
4. Scope: the four paths above only; no secret or environment value.

## Returned record

Begin with the confirmed range, scope match, files and commands checked. For each finding: severity (Blocking / Should-fix), location, issue, failure scenario, suggested fix, confidence. If there are no findings, state **No findings**. End with exactly one verdict — **APPROVE** or **REQUEST CHANGES** — and the literal reviewed range.
