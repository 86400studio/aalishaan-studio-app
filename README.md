# Aalishaan Studio

Website and studio Admin for the Aalishaan Studio owner — an Indian made-to-order framed wall-art store: 22 artworks across three collections and eleven art styles, each sold as an A2 print in three frame finishes, with a connected Admin that runs orders, production, delivery, support and finance records.
Primary goal: sell framed artwork prints online with an honest, operable back office. Primary conversion: a completed guest purchase paid through Razorpay that produces a durable, verified order.
Live at: `[DOMAIN]` — to be confirmed by the owner (open decision D-04 in `docs/PROJECT-STATUS.md`); production deploys from `main`.

## Where things are

| Path | What it is |
|---|---|
| `prototype/` | The frozen development reference, revision **E10** = public E8 + **Admin A2 — 86400 UI edition** + the E10 additions of 2026-09-23 (the final Admin, D-PRE-23; D-37–D-39; its own `README.md`, `QUICK-START.md`, `CAPABILITY-MAP.md`, `SECURITY-AND-STORAGE.md` and `TEST-RESULTS.md` live in `prototype/admin/`): the visual mockup, approved copy baseline, catalogue data and imagery. Owner-signed-off: the R13 public lock, M2 navigation and saved-artworks placement, M4 mobile lift, E8 logo; awaiting owner visual review: the E5/M3 and E7/M5 mobile screens, the E1 fixes and the final Admin screens (`docs/APPROVED-INPUTS.md` §1, OI-14). **Frozen — do not edit.** Its own `README.md`, `PAGE-TRACKER.md` and `docs/` carry the approval history; the public pages are published at https://86400studio.github.io/aalishaan-studio/ for side-by-side comparison. The published GitHub Pages prototype still shows the superseded Admin A1 at `/admin` until the owner decides to republish (D-36) — the Admin reference is the local `prototype/admin/`. |
| `docs/` | The governing docs pack: state, scope, process, architecture, design, security, QA, launch, rollback, handoff, templates and records. |
| `.claude/skills/` | Claude Code skills: `/sprint-prompt`, `/close`, `/browser-qa`, `/activate-testing`, `/handle-error`. |
| *(on GitHub)* | https://github.com/86400studio/aalishaan-studio-app — the source of truth: public, on the owner's own account `86400studio` (D-02); `main` protected by a branch ruleset (D-26; verified 2026-09-23 — S0.0 record). A clone is a reduced checkout by design (D-07): `prototype/assets/` other than `fonts/` and `brand/` is git-ignored, so the prototype's imagery is absent there and the full `node prototype/scripts/development-baseline.cjs` check passes only on the original full-asset workspace; the pinned imagery reference is the published prototype commit `b24dce1b…`. `prototype/.gitattributes` keeps the Admin bytes unchanged (`admin/** -text`, D-36), so `prototype/admin/CONTENTS-SHA256.txt` keeps verifying on a fresh checkout; the fresh-checkout result is in the S0.0 record. |
| *(created in Setup sprint S0.1)* | The application at this root: Next.js app, `supabase/migrations/`, `tests/e2e/`, `.github/workflows/code-check.yml`, `.env.example`. |

## Stack

Next.js (App Router) + TypeScript strict + Tailwind CSS + pnpm on Vercel, with Supabase (Postgres, Auth, Storage, RLS), Razorpay and Shiprocket

Proposed at kickoff (D-01 lean); confirmed 2026-09-23 in Setup sprint S0.0 and locked when the S0.0 PR merges. Full detail (locked layers, integrations, invariants): `docs/TECH-ARCHITECTURE.md`.
If the code and docs disagree, report the mismatch; update docs only in an authorized task.

## Local development

```bash
pnpm install --frozen-lockfile        # install (scripts exist from S0.1)
pnpm dev                              # dev server → http://localhost:3000
```

Checks (run before reporting a change ready — all applicable commands must pass):

```bash
pnpm typecheck      # tsc --noEmit
pnpm lint           # eslint
pnpm test           # vitest (unit/integration); pnpm test:e2e runs the Playwright suite in tests/e2e/
pnpm build          # next build
```

These scripts exist once S0.1 has scaffolded the app; until then the only runnable thing in this repository is the prototype: `cd prototype && npm start`, then http://localhost:8000/ for the storefront and http://localhost:8000/admin/ for the final Admin (hard-refresh once after install). The final Admin's evidence is `prototype/admin/TEST-RESULTS.md` and `prototype/admin/tests/`; its 13 state-guard groups re-run with `node admin/tests/check-state.cjs` from `prototype/`.

## Environment variables

- The authorized owner creates `.env.local` from `.env.example` outside the AI workflow.
- The live env file is gitignored — never open, print, copy, edit, or commit it. `.env.example` carries names + safe placeholders only.
- Deployed values live in Vercel's secret/environment settings, scoped per environment (Production, Preview, Development).
- Full rules (public vs server-only, redeploy-after-change): `docs/ENV-VARS-SAFETY.md`; environment assignments and proofs: `docs/ENVIRONMENT-PARITY.md`.

**Never do this:** commit a secret, put a server-only value behind a public env prefix,
or paste real values into any committed file.

## Project docs

| File | What it answers |
|---|---|
| `CLAUDE.md` (root) | *How does the primary AI build engine behave here?* |
| `AGENTS.md` (root) | *How does the second-pass reviewer agent behave here?* |
| `docs/PROJECT-STATUS.md` | *Where is the build right now? Read this first in every fresh session.* |
| `docs/ROADMAP.md` | *What are we building, in what order, with what exit gates?* |
| `docs/WORKFLOW.md` | *How does a change get from a branch to production safely?* |
| `docs/TECH-ARCHITECTURE.md` | *What is the locked stack and its invariants?* |
| `docs/DESIGN.md` | *What are the design tokens and locked visual rules?* |
| `docs/APPROVED-INPUTS.md` | *What is approved, where does it live, and how is copy extracted from the prototype?* |
| `docs/content/` | *The locked facts (`locked-facts.md`) and any new strings awaiting approval — the build's canonical fact source, implemented verbatim.* |
| `prototype/docs/ADMIN-FINAL-FEATURES.md` | *AF1 — the canonical Admin scope: 26 capabilities and acceptance stories US01–US23. Its §3 menu layout is superseded by the final Admin (D-PRE-23).* |
| `prototype/admin/CAPABILITY-MAP.md` | *Where does each AF1 capability ID (O1–G6) live in the final Admin, and which 23 acceptance-story entry points does it keep?* |
| `docs/SECURITY-CHECKLIST.md` | *Which security checks gate every merge and the launch?* |
| `docs/QA-CHECKLIST.md` · `docs/LAUNCH-CHECKLIST.md` | *What gets tested before merge and before launch?* |
| `docs/testing-setup/` · `docs/error-tracking/` | *The Launch Gate (whole-site Playwright suite, morning check) and the post-launch incident lane.* |
| `docs/ROLLBACK.md` | *Something broke in production — what now?* |
| `docs/HANDOFF.md` | *What does the owner get at the end?* |
| `docs/templates/` | *Which reusable prompt, PR, Preview, and change-record templates do we use?* |
| `docs/sprint-prompts/` · `docs/code-reviews/` | *Per-sprint records and review verdicts.* |

## Workflow (summary)

Every change follows: **branch → build → local checks → PR → deployed Preview (Vercel) → Codex review → merge →
Production smoke test**. `main` is protected and always production-ready; one focused change per branch;
one sprint at a time; local green is necessary but not sufficient — the Preview must be tested before
merging. Full process with per-stage checklists: `docs/WORKFLOW.md`.

## Deploy

Vercel builds every PR into an isolated Preview and deploys Production only from `main`.
Host rollback action: Vercel Instant Rollback (Deployments → last good deployment → Promote to Production). Then fix GitHub's source of truth through the normal workflow; see `docs/ROLLBACK.md`. Host rollback does not restore database data.
