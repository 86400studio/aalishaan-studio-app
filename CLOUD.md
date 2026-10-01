# CLOUD.md — Cloud Sprints: the Cloud Builds, VS Code Finishes

Claude reads this file at the start of every Claude Code cloud session (`CLAUDE.md` points here). In VS Code, Claude uses only §3, when you ask it to pick up a hand-off. Everything else about VS Code stays exactly as it is: no local setting, tool, MCP server or file changes.

`CLAUDE.md`, `AGENTS.md`, `docs/` and the skills govern cloud sessions word for word — same branch rules, same checks, same Commit/Push authorization, same review, and only you merge. This file adds three things: what the cloud does, what it leaves for VS Code, and how the hand-off works.

## 1. The flow — every sprint

| Leg | Where | What happens |
|---|---|---|
| Open + build | **Cloud session** (new, from `main`) | `/sprint-prompt` opens the sprint (step 0 reconciles the previous one), plans it, and runs the filled prompt: build, local checks, `/sprint-prompt save` (sprint record + trackers), push, draft PR, then the hand-off section (§3). You archive the session. |
| Finish | **VS Code** | Pick-up (§3), then the pending items: database steps on TEST (Supabase MCP), Preview test (Playwright MCP / Agent Browser), record updates, CI green, PR marked ready → `/sprint-prompt review` → Codex in the VS Code window → append → `/close` → you merge and comment merge + smoke on the PR. |
| Next sprint | **Cloud session** | A new session from `main`. Its step 0 reconciles the merged sprint to Done. |

One sprint = one branch = one PR, wherever it runs. After the hand-off, the sprint stays in VS Code until it merges — fixes after review are done there too. Sending a sprint back to the cloud mid-way is not part of this flow.

## 2. One-time setup (you, about 15 minutes)

- [ ] **GitHub:** github.com/apps/claude → **Configure** → give the Claude GitHub App access to this repo.
- [ ] **Cloud environment:** at claude.ai/code, select the cloud icon in the row above the message box → **Add cloud environment**, fill it in, then **Save**:
  - **Name:** `Aalishaan Studio`
  - **Network access:** **Custom**. Tick **Also include default list of common package managers**, then paste into **Allowed domains**:
    ```
    cdn.playwright.dev
    playwright.download.prss.microsoft.com
    *.vercel.app
    ```
  - **Environment variables** — settings and fake placeholders only. Anyone using the environment can read them, so never a value from `.env.local`:
    ```
    PLAYWRIGHT_BROWSERS_PATH=/opt/qa/browsers
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
    ```
  - **Setup script** — installs a test browser outside the repo, for the cloud's own quick looks (§4.5); the environment keeps it for about a week:
    ```bash
    #!/bin/bash
    export PLAYWRIGHT_BROWSERS_PATH=/opt/qa/browsers
    mkdir -p /opt/qa && cd /opt/qa || exit 0
    [ -f package.json ] || npm init -y >/dev/null 2>&1
    npm install --no-audit --no-fund playwright@latest >/dev/null 2>&1
    npx playwright install-deps chromium >/dev/null 2>&1 || true
    npx playwright install chromium || true
    chmod -R a+rwX /opt/qa
    exit 0
    ```
- [ ] Nothing to add under claude.ai **Connectors**: database work stays in VS Code.

## 3. Hand-off and pick-up — the exact messages

**Start a sprint in the cloud.** claude.ai/code → this repo only → branch `main` → this project's environment → mode **Accept edits**, never Auto → paste:

> `/sprint-prompt [SPRINT_ID]` — plan it, then execute the filled prompt in this session per CLOUD.md. Commit: YES · Push: YES (sprint branch only) · open the draft PR.

For the first cloud session on this repo, add: *"Run CLOUD.md §5 first and report it."*

**The hand-off (Claude, in the cloud).** The last cloud action, whether the build is done or blocked: add this section to the sprint record `docs/sprint-prompts/[SPRINT_ID]-[SLUG].md`, directly above its final `Review: Pending · Merge: Pending · Production smoke: Pending` line, commit it, push, and repeat it as the final message:

```
## Hand-off to VS Code
- Branch: <name> · Last commit: <sha> · Draft PR: #<n>
- Cloud session: <link from: echo "https://claude.ai/code/${CLAUDE_CODE_REMOTE_SESSION_ID/#cse_/session_}">
- Done in the cloud: <steps completed; files changed>
- Checks: typecheck <result> · lint <result> · tests <result or N/A> · build <result, route count>
- Pending in VS Code, in order:
  1. <database sprints only> Apply and verify the migration on TEST via supabase-dev, then re-run
     /sprint-prompt save so the database change record and this record carry it; commit and push.
  2. Mark the PR ready (`gh pr ready <n>`), tick items 1 and 2 here, commit and push — the last commit before review.
  3. CI green at that head, then the Preview test at that head (docs/WORKFLOW.md §5, /browser-qa) → Preview
     record as a PR comment only, no commit.
  4. /sprint-prompt review → Codex (VS Code window) → append the record → /close → owner merges, comments
     merge + smoke on the PR.
- Blocked or open: <anything unfinished, with the reason — or "nothing">
```

If the session asks you a question mid-build, answer it there and let it continue. Only after the final hand-off do you **archive the cloud session** (hover over it in the claude.ai/code sidebar → archive icon). An archived session can't push later. Never turn on **Auto-fix** on the PR.

**Pick up in VS Code.** Paste:

> Pick up sprint `[SPRINT_ID]` per CLOUD.md §3. Commit: YES · Push: YES (sprint branch only).

Claude then: `git fetch origin` → `git switch <branch from the hand-off>` → `git pull --ff-only` → confirms `git rev-parse HEAD` equals the hand-off's last commit → reads the hand-off section → works the pending items in order, then the normal chain. If the head differs, stop and report — never reset or force anything.

**One place at a time.** While a cloud session works on the sprint, don't touch that branch in VS Code, and the other way round. A push rejected as out of date means the other place pushed: pull, then continue — never force-push, never discard either side.

## 4. Rules for Claude in a cloud session

1. **Start.** You open a new sprint from `main`; a continuing sprint is never picked up in the cloud (§1). Install the locked dependencies with the repo's locked command (`pnpm install --frozen-lockfile`); never change the lockfile unless the sprint owns a dependency change. On the first session in this repo, run §5 first.
2. **Branch.** If the session already put you on a `claude/…` branch, that is the sprint branch — keep its name (`CLAUDE.md` allows it) and record it in the sprint record and the PR. Only if you are on `main`, create `claude/[SPRINT_ID]-slug` from it. Push the branch as soon as it exists, before any work (`git push -u origin <branch>`): a rejected push is fixed then (§6), never after a build. Never a second branch for one sprint.
3. **Commit and push** only with the owner's Commit: YES · Push: YES in the kickoff message (never `main`). Push after each completed step: the cloud machine is deleted when the session sits idle, so unpushed work can be lost. Never force-push.
4. **Do:** everything up to and including `/sprint-prompt save`, the push, the draft PR (`gh pr create --draft`, filled from `docs/templates/PR-DESCRIPTION-TEMPLATE.md`, PR number added to the record), and the §3 hand-off. **Don't:** `/sprint-prompt review`, `/close`, the Preview test, any database tool, merging, Auto-fix, or the session's **Create PR** button. If the session shows a Supabase or other database server, don't use it or sign in to it — those steps are VS Code's.
5. **Quick looks, not evidence.** To see your own UI work, run the dev server (`pnpm dev`) and capture from `/opt/qa`: `cd /opt/qa && npx playwright screenshot --ignore-https-errors --viewport-size "320,800" --full-page http://localhost:3000/<path> shots/<name>.png`, then open the file to judge it. Merge evidence (QA-CHECKLIST Part 2) comes from VS Code on the Preview, never from here. A request the cloud network blocks is an environment gap, never a PASS or FAIL. If `/opt/qa` is missing, rebuild it with the §2 setup-script commands; if that fails, skip the look and say so.
6. **Hand off when the cloud leg ends** — finished, or blocked by something only VS Code can do — with the §3 section. A question the owner can answer in the chat is not a hand-off: ask, wait, continue. Never leave work unpushed at a stopping point.
7. **Never** read or ask for `.env.local` or any live value; use the environment's placeholders.

## 5. First cloud session — check once

Claude reports each item before planning the first cloud sprint:

- [ ] It read this file because `CLAUDE_CODE_REMOTE` is `true`.
- [ ] The locked install, typecheck, lint and build pass without touching the lockfile; `git merge-base origin/main HEAD` prints a commit.
- [ ] `gh pr view <previous sprint's PR> --comments` works (step 0 needs it), or the REST form in §6 does.
- [ ] One 320px screenshot from `/opt/qa` of the local dev server is visible in the session, and `git status` stays clean.
- [ ] The sprint branch's first push (§4.2, before any work) lands on GitHub, and later `gh pr create --draft` works. If the push is rejected, §6.

## 6. Troubleshooting

| Symptom | Fix |
|---|---|
| The push to the sprint branch is rejected | The cloud accepts only the branch it made for this session — its name is in the rejection message or `git branch -a`. Make that the sprint branch: `git branch -m <session branch name>` (delete the empty local copy of that name first if one exists), push, and record the name in the sprint record and the PR. Still one branch, one PR. If no session branch exists, stop before building and report it to the owner. |
| "request blocked: no rule or allowlist entry allows host …" | Add that host to **Allowed domains** (§2) — never a production host — or leave that check to VS Code. New sessions pick it up. |
| The build fails on a missing environment variable | Add its fake placeholder from `.env.example` to the environment variables (§2). Never a real value. |
| The browser is missing or won't start | Rebuild `/opt/qa` with the §2 setup-script commands, or skip the look — VS Code does the real check. |
| The session asks you to sign in to a Supabase server | Decline. The cloud does no database work; those steps are VS Code's. |
| The Preview link on the PR shows Vercel's login | Expected: the cloud can't sign in. VS Code does the Preview test. |
| The session expired while you were away | Reopen it from the session list; pushed work is safe. Repeat anything unpushed. |
| `gh` says "This GraphQL query is not enabled for this session" | Use the REST form the message names, e.g. `gh api repos/{owner}/{repo}/issues/<n>/comments`. |

Next step → complete §2, then start the next sprint with the §3 kickoff.
