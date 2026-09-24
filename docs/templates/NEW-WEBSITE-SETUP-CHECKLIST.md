# New Website Setup Gate — Aalishaan Studio

> Sprints S0.0–S0.2 in `docs/ROADMAP.md` (Setup Gate) execute this checklist — roughly S0.0 → §1–§4, S0.1 → §5–§6, S0.2 → §7, and §8 on each of the three PRs.

Run once after the signed predevelopment GO gate. This gate creates the safe delivery foundation; Stage 0 builds the actual barebones website afterward.

## 1. Confirm the handoff

- [x] The GO is decision **D-PRE-00** (2026-09-16, amended 2026-09-17 by D-PRE-23) in `docs/PROJECT-STATUS.md` §7: the prototype — public R13 + M1–M5 at revision E8, with Admin A2 — 86400 UI edition as the final Admin (local prototype revision E10 since the additions of 2026-09-23, D-37–D-39; Admin A1 is superseded) — and AF1 are the final approved development reference, backed by the approval evidence table in `docs/APPROVED-INPUTS.md` §1. AF1's §3 menu layout is superseded by the final Admin; its 26 capabilities and US01–US23 are not (`prototype/admin/CAPABILITY-MAP.md`). There is no `predevelopment/8. Final Wireframes and Mockup.md` for this project.
- [x] The handoff is the approved prototype at `prototype/` (read-only) plus its records; `docs/APPROVED-INPUTS.md` §2 maps each SOP input (client answers, research, sitemap, inspirations, design system, page plans/copy, features/flows, wireframes/mockup, handoff, locked facts) to its real location.
- [x] No missing decision, content dependency, account, integration, or policy blocks stack selection or Stage 0: open decisions D-01–D-39 each carry a lean (`docs/PROJECT-STATUS.md` §8a, confirmed 2026-09-23 at S0.0 — D-02 resolved, D-11's interim lean amended on corrected facts, owner items registered as Gate 0 items; D-28–D-36 are the consequences of the final Admin); owner inputs OI-01–OI-12 are Gate 0 for S3.1 only and do not block development (D-PRE-13); OI-13 is owner-deferred to the post-launch backlog (D-PRE-12); OI-14 (owner visual review of the mobile screens and the final Admin screens) is non-blocking.

## 2. Initialize and protect GitHub

- [x] Create `86400studio/aalishaan-studio-app` on GitHub (the owner's own account, public — D-02), initialized with a minimal README so `main` exists. (Owner, 2026-09-23 — README commit `5d98958`.)
- [x] Protect `main` immediately: Pull Request required, no direct or force pushes, no deletion, with the bypass settings checked so the rules are effective. The required **Code Check** status is added at S0.1, which creates the check (D-26; §6 and `docs/TECHNICAL-INTEGRITY.md` "Setup"). (Owner's ruleset "main protection", read back 2026-09-23 — S0.0 record.)
- [x] Fetch the repo's `main` into this workspace and create `claude/s0.0-kickoff-decisions` from it — never a second, unrelated history. S0.1 later branches `claude/s0.1-setup-scaffold` from the post-S0.0 `main`.
- [x] Record the branch owner; one worker per branch. (Claude Code — `docs/PROJECT-STATUS.md` §1.)

There is no direct-push exception for the scaffold or docs pack.

## 3. Copy a self-contained docs pack

> **Already done — do not re-run.** Every file below was installed into this repository on 2026-09-16 (`docs/PROJECT-STATUS.md` §3). The generic SOP source folder the files were copied from was removed from the delivery workspace on 2026-09-17 after installation, so **this repository's docs are the only copy** and the source names on the left of each arrow (`README-TEMPLATE.md`, `templates/sprint-prompt.md`, `testing-setup/activate-testing.md` …) no longer exist anywhere to copy from. At S0.0 tick each item by confirming its **destination** exists in the repository; nothing is fetched from outside it. The same applies to "Copy `ENVIRONMENT-PARITY.md` to `docs/`" in §6 — the file is already at `docs/ENVIRONMENT-PARITY.md`.

- [x] `README-TEMPLATE.md` → repo root as `README.md`.
- [x] `CLAUDE.md` and `AGENTS.md` → repo root.
- [x] Core development Markdown, including `SPRINT-PROMPT-TEMPLATE.md` and `CODEX-REVIEW-PROMPT.md` → `docs/`.
- [x] SOP `templates/` folder (except the three Claude skills below) → `docs/templates/`.
- [x] `templates/sprint-prompt.md`, `templates/close.md`, and `templates/browser-qa.md` → `.claude/skills/sprint-prompt/SKILL.md`, `.claude/skills/close/SKILL.md`, and `.claude/skills/browser-qa/SKILL.md` (rename each to `SKILL.md`) so Claude Code loads them.
- [x] `testing-setup/` → `docs/testing-setup/`; its skill `testing-setup/activate-testing.md` → `.claude/skills/activate-testing/SKILL.md` (rename to `SKILL.md`). Installed; its `SETUP-CHECKLIST.md` runs at S0.2 (harness) and S3.2 (Launch Gate).
- [x] `error-tracking/` → `docs/error-tracking/`; its skill `error-tracking/handle-error.md` → `.claude/skills/handle-error/SKILL.md` (rename to `SKILL.md`). Installed; its `SETUP-CHECKLIST.md` runs at S0.1 (D-23 — Sentry early).
- [x] Confirm the **global browser tools** are present on this machine (`claude mcp list` shows Playwright MCP at user scope; `agent-browser` responds in a terminal) — nothing to install per project; see `docs/BROWSER-TOOLS.md`. Do **not** add Playwright to the project `.mcp.json`. (S0.0, 2026-09-23: Playwright MCP user scope, connected; agent-browser 0.33.0; no project `.mcp.json`.)
- [x] (N/A — recorded deviation D-08) Commit the approved page copy from predevelopment file 06 into `docs/content/page-copy/*.md` and the approved factual claims from files 06–07 into `docs/content/locked-facts.md` — this in-repo set is the build engine's canonical content source (implemented verbatim).
  - **Recorded deviation — decision D-08 (`docs/PROJECT-STATUS.md` §8a, lean; confirmed 2026-09-23 at S0.0):** no `docs/content/page-copy/*.md` extraction set is created. The frozen prototype pages and their build sources under `prototype/` are the canonical copy (page → source map in `docs/APPROVED-INPUTS.md` §2); each page sprint cites its exact source files and Preview QA compares verbatim. Strings the prototype does not contain go to `docs/content/new-strings.md` (exists since 2026-09-16; rows are added by the sprint that needs them) for owner approval. `docs/content/locked-facts.md` is already filled.
- [x] Create `docs/sprint-prompts/` and `docs/code-reviews/` with their first real record; do not rely on empty folders surviving Git.

## 4. Lock decisions before scaffolding

> Already filled at pre-sprint setup on 2026-09-16 (`docs/PROJECT-STATUS.md` §3): `ROADMAP.md`, `PROJECT-STATUS.md`, `TECH-ARCHITECTURE.md`, `DESIGN.md`, `APPROVED-INPUTS.md`, `SECURITY-CHECKLIST.md` §9, `ENVIRONMENT-PARITY.md` §2–§4, `SUPABASE-MCP-SAFETY.md` §10, `docs/content/locked-facts.md`, plus root `README.md`, `CLAUDE.md`, `AGENTS.md`. The "approved files 03/05/06/07" below resolve through `docs/APPROVED-INPUTS.md` §2. S0.0 confirms them rather than writing them; its acceptance (`docs/ROADMAP.md` → S0.0): repo exists with protection visible in GitHub settings; placeholder scan shows only the per-use tokens registered in `PROJECT-STATUS.md` §12; every open decision has a lean or is RESOLVED; `PROJECT-STATUS.md` names S0.1 as the active sprint.

- [x] Fill `docs/TECH-ARCHITECTURE.md` from approved files 03, 05, 06, and 07: actual stack, versions, package manager, commands, routes/shells, host/Preview, data/auth decision, env **names**, and rollback action.
- [x] Fill `docs/DESIGN.md` from `5. Design System.md`, `4. Inspirations Screenshots.md`, and `8. Final Wireframes and Mockup.md`.
- [x] Fill `docs/ROADMAP.md` from `7. Features.md` and `3. Sitemap.md`; Setup Gate precedes Stage 0.
- [x] Fill `docs/PROJECT-STATUS.md` with current stage, branch, next action, blockers, and record paths.
- [x] Customize `README.md`, `CLAUDE.md`, and `AGENTS.md`.
- [x] Search governing files for unresolved `[BRACKETED_PLACEHOLDERS]`; resolve or explicitly mark each optional field `N/A — reason`. (S0.0, 2026-09-23: the `PROJECT-STATUS.md` §12 scan reports only registered tokens.)

## 5. Scaffold on the setup branch

- [x] Scaffold only the locked `Next.js (App Router) + TypeScript strict + Tailwind CSS + pnpm on Vercel, with Supabase (Postgres, Auth, Storage, RLS), Razorpay and Shiprocket` with `pnpm`; do not add optional product features. (S0.1, 2026-09-24: `pnpm create next-app@16.3.6` — App Router, TypeScript, Tailwind, ESLint, `src/`, empty — generated in a scratch directory and only the allowed files copied in; Supabase arrives in S0.2, Razorpay and Shiprocket later — `docs/sprint-prompts/S0.1-setup-scaffold.md`.)
- [x] Create `.env.example` with names and unmistakably fake placeholders only. (S0.1, 2026-09-24: added by the owner — the agent's permission settings deny it `.env*` paths — and committed in `0d27806`; its Git blob is identical to the prepared names-only content — S0.1 record, "Owner actions received".)
- [ ] The owner may create the local live env file outside the AI workflow. Agents never open, print, copy, or edit it.
- [x] Verify the live env filename is ignored without opening it (for example, `git check-ignore .env.local`) and is not tracked or staged. (S0.1, 2026-09-24: `.env.local` and `.env.production` ignored by `.gitignore:7`; no `.env*` file tracked or in history.)
- [x] Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build`. (S0.1, 2026-09-24, locally: all pass, with `pnpm format:check`, `pnpm test:unit` (51 tests) and `pnpm audit --prod --audit-level=critical`; the Code Check repeats them on the PR.)

## 6. Configure CI and the deployed Preview

- [x] CI = the **Code Check** per `docs/TECHNICAL-INTEGRITY.md` (locked package manager/version, the six named checks) plus secret scanning; the owner enables branch protection on `main` requiring it (2-minute setting, clicks in that file). (S0.1, 2026-09-24: `.github/workflows/code-check.yml` with the blocking full-history gitleaks step, and `.github/dependabot.yml`, written and checked locally; first run on PR #3 (run 36002643091) succeeded; the owner required "Code Check" in the `main` ruleset (read back 2026-09-24); PR #3 was BLOCKED while the next run was pending and mergeable once it passed.)
- [x] Connect `Vercel` to GitHub. The supplied profile is Vercel; another host must provide equivalent isolated PR Previews.
- [ ] Confirm PR branches create Previews and only `main` deploys Production.
- [x] Record env names/scopes; the owner sets values in the provider dashboard. Never copy Production credentials into Preview.
- [ ] Copy `ENVIRONMENT-PARITY.md` to `docs/`; fill its infrastructure and environment matrix (§3–§4), mark unused services N/A, and complete applicable setup steps in §6. Record later feature proofs as pending until those features exist; do not invent PASS results to finish setup.
- [x] Prove the Preview pipeline on `claude/s0.1-setup-scaffold` before merge. (2026-09-24: PR #3 Preview for `3f07d66`, protected, six headers, route and Sentry alert proven — S0.1 record, "Preview record".)

## 7. Optional data/auth profile

- [ ] Record `None` if the approved architecture has no database or auth.
- [ ] If Supabase is selected, follow `docs/SUPABASE-VERCEL-SETUP.md`: isolated non-production and Production projects, public/publishable values only in browser code, RLS before user data.
- [ ] If a coding agent will use **Supabase MCP**, follow `docs/SUPABASE-MCP-SAFETY.md`: connect non-production first; production MCP stays disconnected unless a read-only exception is explicitly approved and recorded.
- [ ] If another provider is selected, document its equivalent isolation, access controls, migrations, and recovery plan in `TECH-ARCHITECTURE.md`.
- [ ] Follow `docs/ENVIRONMENT-PARITY.md` §7 for the selected data/auth profile: use reviewed migrations for new projects; capture an existing production schema only when its baseline is missing. Verify isolation before any Preview writes; complete feature-specific proofs with the sprint that introduces that feature.

## 8. Pass the setup PR through the full chain

- [x] Review the changed-file list; only setup, scaffold, and governing-doc files changed.
- [x] Local checks pass and no live env file or secret-like value is in the diff.
- [x] Commit/push only if the owner explicitly authorizes both actions.
- [x] Open the setup PR; CI passes.
- [x] Test the deployed Preview and record its tested head SHA.
- [ ] Codex reviews the immutable merge-base-to-head range and returns Approve.
- [ ] The owner confirms the head has not changed, merges, and runs the Production smoke test.

## Exit condition

The protected repo, governing docs, CI, Preview pipeline, and rollback path are ready. No product feature is claimed complete. Begin Stage 0 in `docs/ROADMAP.md`: the smallest complete website with its primary journey working end to end.

**Next:** create `docs/sprint-prompts/[SPRINT_ID]-[SLUG].md` from `docs/templates/CLAUDE-SPRINT-PROMPT-TEMPLATE.md`.
