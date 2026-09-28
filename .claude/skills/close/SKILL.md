---
name: close
description: End-of-sprint close-out for Aalishaan Studio — verify a branch is safe to merge and the session is safe to end. Runs typecheck/lint/build, confirms the tree is clean + pushed with no secrets, the trackers (PROJECT-STATUS + ROADMAP) are updated, the sprint + review records are saved, the security invariants the diff touches still hold, and (for DB sprints) migrations are applied + verified — then gives a single GO / NO-GO verdict. Triggers - "close the sprint", "are we safe to merge", "run close", "/close", "end the session safely", "final review before merge".
---

# Close — end-of-sprint verification & handoff (Aalishaan Studio)

You are the **close-out gate**. The owner runs this once, at the end of a sprint, before merging the PR and closing the session (often from mobile, in a fresh window). Your job: **verify** everything is consistent and safe, **report** a clear GO / NO-GO, and **surface** any gap with the exact fix — never auto-merge, never push beyond the task branch, never silently change code.

This is the bookend to `/sprint-prompt`: that skill *opens and records* a sprint; this one *verifies and hands off*. It does not replace the per-step gating during the sprint — it is the single final sweep.

Read, don't restate from memory — these define the gates you are checking (cite the file/section in your findings):
- `CLAUDE.md` (auto-loaded) — project rules.
- `docs/WORKFLOW.md` — §3 Local verification, §4 Pull Request, §5 Deployed Preview, §6 Independent Codex review, §7 Merge, §8 Production smoke test, **Database change protocol**, **Definition of done**.
- `docs/ROADMAP.md` — the active sprint's row + the **Universal sprint exit gate**.
- `docs/SECURITY-CHECKLIST.md` — the **Quick pre-merge gate** + §9 project-specific blocking invariants.
- `docs/ENVIRONMENT-PARITY.md` — applicable environment proofs (§12), callback commit (§7.11), and test safety (§10).
- `docs/PROJECT-STATUS.md` — §1 (Right now), §2 (Sprint board), §6 (Checks), §7–§8 (decisions), §10 (Known issues).

## Step 0 — work out what this sprint shipped

Before checking anything, scope the run to the actual change:
- First determine whether the sprint PR is open or already merged. For an open PR, run this gate on its existing branch after review. If already merged, verify its recorded review/merge, any human Production migration apply with its read-only verification, and Production smoke evidence, return a paste-ready closure note for the PR, and carry repository tracker and record updates into the next authorized sprint branch (WORKFLOW §8). Do not create a closeout branch or write on `main`; the pre-merge branch/upstream checks below are N/A for this post-merge path. Missing evidence stays pending; a failed smoke follows the fix/rollback lane.
- For an open PR: `git branch --show-current`, `git log main..HEAD --oneline`, `git diff --stat main...HEAD`. After merge, use the saved immutable reviewed range and the PR's merge/deployment evidence; `main..HEAD` is not a post-merge review range.
- From the diff, decide which sections below apply — and **when in doubt, run the section**. Triggers:
  - **Database** — whenever the diff changes *or implies* a database contract: any change under the project's migrations directory (per `docs/TECH-ARCHITECTURE.md`: `supabase/migrations/**`), **or** app code that reads/writes a table, column, or RPC. A required migration can be missing from the diff — that omission is itself the finding. Skip if the project has no database.
  - **Public-writes / abuse controls** — whenever any public-write path can be affected: a public-write handler under the framework's API routes (e.g. `src/app/api/`), **or a shared helper it depends on** (rate-limiting, bot-protection, validation, server-env, or delivery/provider clients), related config, or an env contract.
  - **Copy & design** — only if UI/strings changed.
  Mark a section **N/A** only when nothing in the diff could affect it, with one line of why.

## The checklist

Run top to bottom. For each item give **PASS / FAIL / N/A** + the evidence (command output, file:line, or the owner's confirmation). Where a check depends on something you cannot see (provider dashboard, host env, the Preview result), **ask the owner — never assume**.

### 1. Build & local checks
- The repo's exact commands from `docs/TECH-ARCHITECTURE.md` — `pnpm typecheck`, `pnpm lint`, `pnpm build` — all green. Paste any failure verbatim; do not hand-wave or skip the build.
- Tests: run `pnpm test` (and `pnpm test:e2e` for the specs the sprint touches) from the architecture. N/A is allowed only for a fully static site; auth, gated content, database or payment projects need the required allowed/denied-state suite (`docs/QA-CHECKLIST.md`). A missing required test script is a gap, not permission to skip tests. Record unexpected route additions/deletions.

### 2. Git hygiene
- On a **task branch** (`claude/[SPRINT_ID]-slug` or `claude/fix-slug`), not `main`.
- Working tree clean (`git status` shows only intended changes).
- Branch pushed and up to date with its upstream (`git log @{u}..HEAD` is empty); no unpushed commits.
- `.env.local` untracked (`git check-ignore .env.local`); no stray untracked files that should be committed or deleted (e.g. ad-hoc review/output files).
- **Secret scan of the diff** (`git diff main...HEAD`): no keys, tokens, or connection strings; no server-only value behind a public prefix (e.g. `NEXT_PUBLIC_*`). Cross-check names against the server-only secrets recorded in `docs/ENV-VARS-SAFETY.md` and PROJECT-STATUS §9; treat any name documented as deliberately-never-set as expecting zero references.

### 3. Trackers updated in this PR
- `docs/PROJECT-STATUS.md` §1 (Right now), the §2 board row for this sprint, §3 (Last completed work), and §6 (Checks) reflect what shipped and what's next.
- `docs/ROADMAP.md` — the sprint row reflects completed implementation and pending review/merge/smoke accurately; tick Done only after merge and passing Production smoke are evidenced. Any deferral is dated, with an owner and reason, in its named future sprint row or the Post-launch backlog; a deferred Should-fix is logged in PROJECT-STATUS §8 (WORKFLOW §7).
- Complete tracker edits before independent review on the task branch. If edits are needed after review, report that they require a new candidate and review; do not broaden AGENTS.md's returned-record-only exception.

### 4. Copy & design — only if UI / strings changed
- Any new or changed user-facing string is verbatim from the **approved baseline** (the frozen prototype pages and build sources under `prototype/` per `docs/APPROVED-INPUTS.md` §2 — D-08 — plus `docs/content/locked-facts.md` and `docs/content/new-strings.md`; the shipped site is the approved source for live copy). New strings (errors, labels, empty states) follow the brand-voice rules in `docs/DESIGN.md`.
- Design values come from `docs/DESIGN.md` tokens — no inline hex or ad-hoc spacing. Locked shell chrome (the approved shell variants in `docs/DESIGN.md` / `docs/TECH-ARCHITECTURE.md`) is unchanged; no per-page chrome variant was invented.
- Any locked facts/numbers the site states are unchanged and identical wherever they appear.

### 5. Security invariants — only those the diff touches (SECURITY-CHECKLIST §9)
For each invariant the change could affect, confirm it holds and cite the file:
- **Gated content stays gated** — for any project with auth/gating, protected bodies/data are never reachable by an anonymous or unapproved user via UI, RPC, or table read (the gated route redirects signed-out users to `/login`; the data layer's RLS/access policy denies the anon key). If the project has no login, mark N/A. (SECURITY-CHECKLIST §3.)
- **Public projections leak no PII** — any public read path (e.g. a verification or share URL) exposes only approved safe metadata, never email/PII. (SECURITY-CHECKLIST §4/§5.)
- **Public writes** (the project's public endpoints) are schema-validated server-side. **Delivery fails CLOSED** (missing required delivery key → honest 5xx via the project's missing-env error). The required **abuse controls (rate limiting, bot protection)** also fail CLOSED in Production — a missing required key yields an honest error, never a silent drop — so the blocking requirement is that their env vars are set in the host's Production environment (SECURITY-CHECKLIST §5). If the project has a *recorded, consciously accepted* fail-open gap for an abuse control, confirm the accepted-risk row and its compensating control (PROJECT-STATUS §8/§10) rather than describing that control as fail-closed.
- **Deliberately-unset secrets stay unreferenced** — any secret documented as never-set (PROJECT-STATUS §9 / `docs/ENV-VARS-SAFETY.md`) has zero references in `src/` (expect zero grep hits).
- **Environment isolation** — use separate TEST and PROD resources per `docs/ENVIRONMENT-PARITY.md`. For affected env/data/auth/payment/form/test changes, confirm current applicable §12 evidence and any callback deployment at the tested head. Unknown destinations or live database/payment credentials in Preview are NO-GO; a shared-project note cannot waive that boundary. Unused services are N/A with a reason.
- **Admin surface matches the recorded model.** If the diff introduces an admin role/surface where the architecture defines none, stop and flag it (it needs a `docs/THREAT-MODEL.md` / architecture refresh and an explicit server-side role check before release). Where an admin role exists, it is verified server-side against a dedicated role/table (SECURITY-CHECKLIST §3).
- **CSP / headers** — the allow-list in the framework's security-headers config (e.g. `next.config.ts`) is unchanged, or every added origin is the narrowest one and recorded (SECURITY-CHECKLIST §6).

### 6. Database — if the migrations directory changed OR the diff implies a schema/contract change (WORKFLOW → Database change protocol). Skip if the project has no database.
- **Missing-migration check first:** if application code now depends on a table, column, or RPC that no migration in the diff provides, that is a **NO-GO** — the required migration is missing (CI and the build can pass while Production fails against the existing schema).
- Every **numbered migration** (`supabase/migrations/NNNN_*.sql`) has a matching `*.down.sql`. Any seed file is exempt — its rollback is the separately documented operation in the migrations README (`supabase/migrations/README.md`), not a paired down file; validate seed rollback against that README. RLS **default-deny** on every new user-reachable table; every `SECURITY DEFINER` function hardened (pinned `search_path`, fully-qualified identifiers, session authorization via `auth.uid()` — never trusting arguments, narrow returns, `revoke execute from public, anon` then `grant` to the intended role only).
- Apply migrations through the approved procedure in `docs/TECH-ARCHITECTURE.md` and the migration record: TEST first, verified per role, then owner approval and human Production apply. Inspect available evidence first; request only missing owner-only evidence. Record any pending Production apply with its compatibility/deployment order per `docs/ENVIRONMENT-PARITY.md` §7.10. Missing required TEST verification or an unsafe deployment order is NO-GO. Destructive work requires the recorded backup and rehearsed restore; down-SQL cannot restore lost data.

### 7. Sprint & review records
- `docs/sprint-prompts/[SPRINT_ID]-[SLUG].md` exists and records implementation, checks, deviations and follow-ups before review. Missing records are completed with `/sprint-prompt save` on this branch before review, not after merge.
- `docs/code-reviews/[SPRINT_ID]-[SLUG]-review.md` holds APPROVE for the tested immutable head, with every Should-fix disposition explicit and no Blocking finding. A pending verdict is NO-GO. Confirm the PR head is the reviewed head, or the reviewed head plus only a commit that appends the returned review record with the reviewed head and documentation-only scope recorded (inspect its diff and final CI). Any other commit after the reviewed head is NO-GO until a new candidate passes checks, Preview and a new review (WORKFLOW §7).

### 8. Preview (owner-confirmed)
- **Re-check first, then confirm the rest.** With the global browser tools (`docs/BROWSER-TOOLS.md`), run `/browser-qa` against the Preview of the reviewed head yourself where it is reachable: re-check the Part 2 visual evidence and walk the primary flow with test data. Then ask the owner to confirm only what still needs a human — deployment-protection login, judgment calls, and anything you could not reach. Where the Preview is not reachable to you, fall back to owner confirmation for the full WORKFLOW §5 pass (desktop + 320px; if auth changed: sign-in/up/reset + email links resolve to the Preview origin, never Production; forms behave or show their honest no-op). Confirm that evidence for the reviewed head was recorded before review (WORKFLOW §5–§6 — `docs/templates/VERCEL-PREVIEW-TEST-TEMPLATE.md` or the approved equivalent, such as the handoff and PR description); missing evidence is a NO-GO gap, never a post-review commit.
- Note: the Preview may sit behind host deployment protection (e.g. Vercel Login) — the owner must be logged into the host to click through it. For docs/SQL-only sprints, the Preview shows the unchanged site and the real artifact is the docs/SQL + verification results.

## Output — a single verdict

End with one of:
- **✅ GO — safe to merge & close.** One line per applicable check that passed, plus the post-merge reminders: the owner merges the same PR, deletes the branch and runs the Production smoke test (WORKFLOW §8). After the merge and smoke, re-run `/close` to return the dated merge/smoke note for that PR — never prefill it at a pre-merge GO; carry repository tracker and record updates into the next authorized sprint branch. No post-merge save/closeout PR. If invoked after merge, label GO as closure verified only when the required smoke passed; otherwise NO-GO with missing checks. Do not advance on an unverified smoke.
- **❌ NO-GO.** List each blocking gap with the exact fix; for an open PR, offer to do the ones you safely can (trackers, sprint/review record, doc accuracy) on its task branch now. After review, any edit other than appending the returned review record creates a new head that needs refreshed checks and Preview and a new review before `/close` is re-run (§3, §7). After merge, return the fixes as a PR note plus items for the next authorized sprint branch; never write on `main`. The owner still performs the merge.

## Never
- Never merge, never push beyond the task branch, never skip hooks/CI. Commit/push only when the sprint's task prompt authorized it (default NO).
- Never auto-fix code or security findings silently — report them and fix only what the owner approves.
- Never assume dashboard-only state (provider apply/verify, host env, Preview result) — ask the owner.
- Never restate the gate docs from memory — read them and cite the file/section.
