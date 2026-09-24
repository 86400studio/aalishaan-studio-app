# Technical Integrity — How Every Line of Code Is Held to Standard

One page. The standards are written once as configuration; machines enforce them on every line, every change, forever. Nothing here depends on anyone remembering anything.

---

## The four walls

| Wall | What it guarantees | Where it lives |
|---|---|---|
| 1. The rules | How code must be written | `CLAUDE.md`, `TECH-ARCHITECTURE.md` |
| 2. **The Code Check** | Every PR passes the six checks below — **red physically cannot merge** | This file + `.github/workflows/code-check.yml` |
| 3. Independent review | A second pair of eyes on every PR; Blocking findings never merge | Codex review, `WORKFLOW.md` §7 |
| 4. Behavior proof | Every feature actually works, before launch and every morning after | `testing-setup/` + `error-tracking/` |

This file supplies Wall 2 and is deliberately the simplest piece of the whole system: one workflow file, one GitHub setting, nothing to operate.

## The house standard, in plain words

1. **Strict types** — TypeScript runs in `strict` mode; the compiler rejects vague or unsafe code before it exists.
2. **Lint-clean** — ESLint (Next.js + TypeScript rules) checks every line for known bad patterns.
3. **Formatted** — Prettier, default config, committed to the repo; formatting is never a matter of taste or a source of diff noise.
4. **It builds** — the production build must succeed. "Works in dev" counts for nothing.
5. **Tests pass** — the unit tests (`test:unit`) run on every PR and must pass. There is no "when present": a missing script or an empty suite fails the check. (Integration tests against TEST run with `pnpm test` from S0.2; Playwright specs run against the Preview for the flows a sprint touches, and the full robot-user suite stays with the Launch Gate and morning check — running those on every PR would slow everything for no gain.)
6. **No known-critical vulnerabilities** — dependencies with critical published flaws block the merge.

Line-level professionalism rule for the builder: no `any`, no `@ts-ignore`, no `eslint-disable` without a one-line reason in the PR description — the Codex review treats an unexplained suppression as a finding.

## The Code Check → `.github/workflows/code-check.yml`

Runs automatically on **every pull request** from S0.1, the sprint that adds it; the S0.0 docs-and-reference PR comes before it exists (decision D-26). About three robot-minutes. You never trigger it, tune it, or maintain it.

As built at S0.1 (2026-09-24) — the file in the repository is authoritative; this is its shape:

```yaml
name: Code Check
on:
  pull_request:
permissions:
  contents: read
jobs:
  code-check:
    name: Code Check            # the exact context the main ruleset requires
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    env:
      NEXT_TELEMETRY_DISABLED: "1"
    steps:
      - uses: actions/checkout@<full SHA> # v7.0.1 — fetch-depth: 0 (full history), persist-credentials: false
      - name: No secrets in the Git history (gitleaks, redacted)
        # gitleaks 8.30.1 linux binary, sha256-verified, run with GIT_ATTR_SOURCE = git's empty tree (a committed
        # .gitattributes cannot hide content; the step first proves the runner's Git honours it) and
        # `--log-opts="--all --full-history --diff-filter=tuxdb -m"` (every commit of every fetched branch, merge
        # commits included); `--redact`, `--ignore-gitleaks-allow`; a .gitleaks.toml or .gitleaksignore fails the job
      - uses: pnpm/action-setup@<full SHA> # v6.1.0 — pnpm version from package.json packageManager
      - uses: actions/setup-node@<full SHA> # v7.0.0 — node-version-file: .nvmrc (24), cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Types are sound
        run: pnpm typecheck
      - name: Code passes lint
        run: pnpm lint
      - name: Formatting is clean
        run: pnpm format:check
      - name: Unit tests pass
        run: pnpm test:unit
      - name: Production build succeeds
        run: pnpm build
      - name: No critical known vulnerabilities
        run: pnpm audit --prod --audit-level=critical
```

The secret scan is a step of the same required job, so a finding blocks the merge exactly as a failed check does; findings are printed redacted. Dependabot (`.github/dependabot.yml`) proposes weekly updates for the root pnpm dependencies and the pinned Actions, never for `prototype/`.

The contract behind it: the root `package.json` defines the scripts `typecheck` (`tsc --noEmit`), `lint`, `format:check` (`prettier --check .`), `test:unit`, `test` and `build` — Claude Code sets these up once, in S0.1. In plain words:

- **`test:unit` is required, never optional.** It runs the Vitest unit tests — fast, no network, no secrets, never the Playwright specs in `tests/e2e/`. An empty suite fails the check instead of passing silently (no `--passWithNoTests`), so the PR that adds this workflow also adds its first real unit test.
- **`pnpm test` and `test:unit` never drift.** `pnpm test` always runs `test:unit` first: at S0.1 they are the same run; from S0.2 `pnpm test` also runs the integration tests against TEST (`TECH-ARCHITECTURE.md` §2). `pnpm test:e2e` (Playwright, from S0.2) runs against the Preview, not in this check. So from S0.2 a green Code Check does not replace a local `pnpm test` run, and the S0.2 prompt decides where its denied-state scaffold runs in CI — as hermetic guard tests inside `test:unit`, or as a separate required job that uses the TEST secrets.
- **The frozen `prototype/` is never formatted or linted.** `.prettierignore` and the ESLint ignore list both name `prototype/`, so no check — and no automatic fix — can rewrite its checksummed bytes (`prototype/admin/CONTENTS-SHA256.txt`, `prototype/data/development-baseline.json`). `.prettierignore` also names the records kept verbatim (`docs/sprint-prompts/`, `docs/code-reviews/`); S0.1 chose to leave the rest of the documentation as written, so `docs/`, the root `README.md`, `CLAUDE.md`, `AGENTS.md` and `.claude/` are ignored too, and Prettier checks the application, tests and configuration only.
- **One Node major, written twice and read once.** `engines` in the root `package.json` (`24.x`, which Vercel also reads) and `.nvmrc` (`24`) name the same major; the Code Check reads `.nvmrc` (`node-version-file`), so CI cannot drift from it. The pnpm version comes from the `packageManager` field (pnpm 10.34.5 at S0.1 — `TECH-ARCHITECTURE.md` §2).

## Setup (once per site — new build or retrofit, identical)

On this project the protection is set in two steps (decision D-26): `main` is protected before the first PR, but the Code Check can only be required once it exists. The S0.0 docs-and-reference PR therefore merges under PR-required protection without a Code Check, and its record marks the check N/A — never as run or passed. Independent review still applies.

- [x] **You (at S0.0, before the first PR):** GitHub → the repo → **Settings → Rules → Rulesets → New branch ruleset** → enforcement **Active**, bypass list empty, target the default branch (`main`) → tick **"Restrict deletions"**, **"Block force pushes"** and **"Require a pull request before merging"** (required approvals 0 — nobody can approve their own PR, and the independent review is recorded in `docs/code-reviews/`) → create. Do not require a status check yet: "Code Check" does not exist until S0.1, and a required check that never runs would lock the first PR. (Done 2026-09-23: ruleset "main protection", read back from GitHub — S0.0 record.)
- [ ] **Claude Code (one normal PR at S0.1, or the S0.1a PR when S0.1 is split — decision D-25):** strict `tsconfig`, ESLint + Prettier configs that exclude `prototype/`, the scripts above with the first real unit test, `engines` + `.nvmrc`, and the workflow file. No product behavior rides along. *(2026-09-24: all of it exists on `claude/s0.1-setup-scaffold` and passes locally — the six commands green, 51 unit tests, an empty suite proven to fail; S0.1 runs as one PR. The PR itself waits for commit/push authorisation, so this box stays open.)*
- [ ] **You (2 minutes, at S0.1, after the Code Check has run once on that PR):** edit the same `main` ruleset → tick **"Require status checks to pass"** → add **"Code Check"** → save.
- [ ] **You + Claude Code (verify once, on that S0.1 PR):** the "Code Check" shows as **Required**; push one more commit and confirm the merge button is blocked while the check runs and unlocks only when it goes ✅. An unverified gate is the same as no gate.

## Day to day

Every PR now carries a plain ✅ or ❌ before your merge button. On ✅, merge as usual. On ❌, you do nothing — Claude Code reads the failure, fixes it, pushes, and the check re-runs; red can't reach `main`, so there is nothing to worry about, only something to wait for. You never have to wonder whether the checks were *really* run — the merge button is the proof.

## The boundary, one line

The Code Check proves the **code** is sound on every PR; the Launch Gate and morning check prove the **site** behaves. Both, always — neither replaces the other.
